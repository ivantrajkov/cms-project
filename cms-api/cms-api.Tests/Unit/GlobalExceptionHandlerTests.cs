using System.Text.Json;
using cms_api.Middleware;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Hosting.Internal;
using Microsoft.Extensions.Logging;

namespace cms_api.Tests.Unit;

/// <summary>
/// The cases the handler is there for that no endpoint can be made to produce on demand:
/// a request the server refused to finish reading, and a caller that disappeared mid-request.
/// </summary>
public class GlobalExceptionHandlerTests
{
    private static (GlobalExceptionHandler Handler, DefaultHttpContext Context) Create(
        string? environmentName = null)
    {
        environmentName ??= Environments.Production;

        var services = new ServiceCollection();
        services.AddLogging();
        services.AddProblemDetails();

        var provider = services.BuildServiceProvider();

        var handler = new GlobalExceptionHandler(
            provider.GetRequiredService<IProblemDetailsService>(),
            new HostingEnvironment { EnvironmentName = environmentName },
            provider.GetRequiredService<ILogger<GlobalExceptionHandler>>());

        var context = new DefaultHttpContext { RequestServices = provider };
        context.Request.Method = "POST";
        context.Request.Path = "/api/upload";
        context.Response.Body = new MemoryStream();

        return (handler, context);
    }

    private static string BodyOf(HttpContext context)
    {
        context.Response.Body.Position = 0;
        return new StreamReader(context.Response.Body).ReadToEnd();
    }

    [Fact]
    public async Task An_oversized_request_keeps_the_status_the_server_chose()
    {
        // What Kestrel throws when a request body runs past the limit it will read.
        var (handler, context) = Create();

        var handled = await handler.TryHandleAsync(
            context, new BadHttpRequestException("Request body too large.", StatusCodes.Status413PayloadTooLarge),
            CancellationToken.None);

        Assert.True(handled);
        Assert.Equal(StatusCodes.Status413PayloadTooLarge, context.Response.StatusCode);

        // The framework's own wording describes the caller's mistake, so it is passed on even
        // outside development — unlike the message of an exception the API did not expect.
        var problem = JsonDocument.Parse(BodyOf(context)).RootElement;
        Assert.Equal("The request is too large.", problem.GetProperty("title").GetString());
        Assert.Contains("too large", problem.GetProperty("detail").GetString()!);
    }

    [Fact]
    public async Task An_unreadable_request_is_the_callers_fault_not_a_500()
    {
        var (handler, context) = Create();

        var handled = await handler.TryHandleAsync(
            context, new BadHttpRequestException("Unexpected end of request content."),
            CancellationToken.None);

        Assert.True(handled);
        Assert.Equal(StatusCodes.Status400BadRequest, context.Response.StatusCode);
    }

    [Fact]
    public async Task A_caller_that_hung_up_is_not_told_the_server_failed()
    {
        var (handler, context) = Create();
        context.RequestAborted = new CancellationToken(canceled: true);

        var handled = await handler.TryHandleAsync(
            context, new OperationCanceledException(context.RequestAborted), CancellationToken.None);

        Assert.True(handled);

        // 499: neither a success nor a fault of the API. Nothing is written — there is no
        // longer anyone on the other end to read it.
        Assert.Equal(499, context.Response.StatusCode);
        Assert.Empty(BodyOf(context));
    }

    [Fact]
    public async Task A_cancellation_the_caller_did_not_ask_for_is_still_a_500()
    {
        // A timeout inside the API cancels a token too, and that one is a real failure.
        var (handler, context) = Create();

        var handled = await handler.TryHandleAsync(
            context, new OperationCanceledException("Database command timed out."), CancellationToken.None);

        Assert.True(handled);
        Assert.Equal(StatusCodes.Status500InternalServerError, context.Response.StatusCode);
    }

    [Fact]
    public async Task Production_reports_nothing_but_a_trace_id()
    {
        var (handler, context) = Create();

        await handler.TryHandleAsync(context, new InvalidOperationException("secret detail"), CancellationToken.None);

        var problem = JsonDocument.Parse(BodyOf(context)).RootElement;

        Assert.Equal("An unexpected error occurred.", problem.GetProperty("title").GetString());
        Assert.False(problem.TryGetProperty("detail", out _));
        Assert.False(problem.TryGetProperty("stackTrace", out _));
        Assert.False(string.IsNullOrWhiteSpace(problem.GetProperty("traceId").GetString()));
    }

    [Fact]
    public async Task Development_reports_the_exception_as_well()
    {
        var (handler, context) = Create(Environments.Development);

        await handler.TryHandleAsync(context, new InvalidOperationException("secret detail"), CancellationToken.None);

        var problem = JsonDocument.Parse(BodyOf(context)).RootElement;

        Assert.Equal("secret detail", problem.GetProperty("detail").GetString());
        Assert.Equal(typeof(InvalidOperationException).FullName, problem.GetProperty("exception").GetString());
    }

    [Fact]
    public async Task Nothing_is_rewritten_once_the_response_has_started()
    {
        var (handler, context) = Create();
        context.Features.Set<IHttpResponseFeature>(new StartedResponseFeature());

        var handled = await handler.TryHandleAsync(
            context, new InvalidOperationException("too late"), CancellationToken.None);

        // Declining lets the middleware rethrow and abort the response, rather than appending
        // an error object to a body that is already half sent.
        Assert.False(handled);
    }

    /// <summary>A response that claims to be on the wire already.</summary>
    private sealed class StartedResponseFeature : HttpResponseFeature
    {
        public override bool HasStarted => true;
    }
}
