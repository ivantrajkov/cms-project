using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using cms_api.Models;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace cms_api.Tests.Integration;

/// <summary>
/// What a caller sees when something genuinely breaks.
///
/// The fault is injected at a service seam rather than through a test-only endpoint, so the
/// exception travels the real path: out of a controller, through the MVC pipeline and into
/// the exception handler middleware.
/// </summary>
public class UnhandledExceptionTests : IDisposable
{
    private readonly List<CmsApiFactory> _factories = [];

    /// <summary>A client for an application whose password verification throws.</summary>
    private HttpClient ClientFor(string environmentName)
    {
        var factory = new FaultyFactory(environmentName);
        _factories.Add(factory);
        return factory.CreateClient();
    }

    private static Task<HttpResponseMessage> LoginAsync(HttpClient client) =>
        client.PostAsJsonAsync("/api/auth/login", new
        {
            email = CmsApiFactory.AdminEmail,
            password = CmsApiFactory.AdminPassword
        });

    [Fact]
    public async Task An_unhandled_exception_becomes_a_problem_json_500()
    {
        var response = await LoginAsync(ClientFor(Environments.Development));

        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);

        var problem = JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;

        Assert.Equal(500, problem.GetProperty("status").GetInt32());

        // The title is what the frontend's readError surfaces to the user, so it has to be a
        // sentence rather than an empty string or a stack trace.
        Assert.Equal("An unexpected error occurred.", problem.GetProperty("title").GetString());

        // Correlates the response with the logged exception.
        Assert.False(string.IsNullOrWhiteSpace(problem.GetProperty("traceId").GetString()));
    }

    [Fact]
    public async Task Development_keeps_the_exception_in_the_response()
    {
        // The developer exception page is gone; its content has to turn up here instead, or
        // debugging locally means reading the console for every failed request.
        var body = await (await LoginAsync(ClientFor(Environments.Development))).Content.ReadAsStringAsync();

        Assert.Contains(FaultyPasswordHasher.Message, body);
        Assert.Contains(nameof(InvalidOperationException), body);
    }

    [Fact]
    public async Task Production_says_nothing_about_what_went_wrong()
    {
        var response = await LoginAsync(ClientFor(Environments.Production));

        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);

        var body = await response.Content.ReadAsStringAsync();

        Assert.DoesNotContain(FaultyPasswordHasher.Message, body);
        Assert.DoesNotContain(nameof(InvalidOperationException), body);
        Assert.DoesNotContain("stackTrace", body);

        // Still usable: the caller gets the same title and a traceId to quote.
        var problem = JsonDocument.Parse(body).RootElement;
        Assert.Equal("An unexpected error occurred.", problem.GetProperty("title").GetString());
        Assert.False(string.IsNullOrWhiteSpace(problem.GetProperty("traceId").GetString()));
    }

    [Fact]
    public async Task An_error_response_still_carries_the_cors_headers()
    {
        var client = ClientFor(Environments.Development);
        client.DefaultRequestHeaders.Add("Origin", "http://localhost:5173");

        var response = await LoginAsync(client);

        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);

        // The handler clears the response before writing its own. If that dropped the CORS
        // headers, the browser would refuse to hand the body to the frontend and a readable
        // 500 would reach the user as an unexplained network failure instead.
        Assert.Equal(
            "http://localhost:5173",
            Assert.Single(response.Headers.GetValues("Access-Control-Allow-Origin")));
    }

    public void Dispose()
    {
        foreach (var factory in _factories)
            factory.Dispose();

        GC.SuppressFinalize(this);
    }

    /// <summary>The application, with one service replaced by a broken one.</summary>
    private sealed class FaultyFactory(string environmentName) : CmsApiFactory
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            base.ConfigureWebHost(builder);

            builder.UseEnvironment(environmentName);
            builder.ConfigureTestServices(services =>
                services.AddSingleton<IPasswordHasher<User>, FaultyPasswordHasher>());
        }
    }

    /// <summary>
    /// Hashing still works — the admin seeding at startup depends on it — but verifying a
    /// password throws, which makes <c>POST /api/auth/login</c> fail the way a bug would.
    /// </summary>
    private sealed class FaultyPasswordHasher : IPasswordHasher<User>
    {
        public const string Message = "Password verification is deliberately broken.";

        private readonly PasswordHasher<User> _real = new();

        public string HashPassword(User user, string password) => _real.HashPassword(user, password);

        public PasswordVerificationResult VerifyHashedPassword(
            User user, string hashedPassword, string providedPassword) =>
            throw new InvalidOperationException(Message);
    }
}
