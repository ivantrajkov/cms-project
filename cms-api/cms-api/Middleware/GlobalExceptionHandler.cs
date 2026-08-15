using System.Diagnostics;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;

namespace cms_api.Middleware;

/// <summary>
/// The last line of defence: anything that escapes a controller is logged here and answered
/// with an RFC 9457 <c>application/problem+json</c> body.
///
/// Without it the same fault looks completely different depending on where the API is running —
/// an HTML stack-trace page from the developer exception page locally, and a connection that
/// closes with an empty 500 in production. Neither is something a caller can act on, and the
/// HTML one is actively unhelpful to the frontend, which would surface the whole page as the
/// error message.
///
/// It only handles what nothing else did. The deliberate rejections controllers already return
/// (a plain-text message, a JSON array of validation messages, ProblemDetails from
/// <c>NotFound()</c>) never reach this handler and keep their existing shapes.
/// </summary>
public sealed class GlobalExceptionHandler(
    IProblemDetailsService problemDetailsService,
    IHostEnvironment environment,
    ILogger<GlobalExceptionHandler> logger) : IExceptionHandler
{
    /// <summary>
    /// Not in the RFC, but the established code for "the client hung up before we answered".
    /// Anything in the 2xx–5xx range would either claim success or blame the server for a
    /// request nobody is waiting for any more.
    /// </summary>
    private const int ClientClosedRequest = 499;

    public async ValueTask<bool> TryHandleAsync(
        HttpContext httpContext,
        Exception exception,
        CancellationToken cancellationToken)
    {
        var method = httpContext.Request.Method;
        var path = httpContext.Request.Path;

        // Once bytes are on the wire the status and body are already decided. Returning false
        // lets the middleware rethrow, which aborts the response rather than appending an error
        // object to a half-written one.
        if (httpContext.Response.HasStarted)
        {
            logger.LogError(
                exception,
                "Unhandled exception in {Method} {Path} after the response had started.",
                method, path);

            return false;
        }

        // The caller disconnected — navigated away, or cancelled an upload. There is nobody
        // left to answer, and an abandoned request is not a fault of the API, so it is not
        // logged as one.
        if (exception is OperationCanceledException && httpContext.RequestAborted.IsCancellationRequested)
        {
            logger.LogInformation("{Method} {Path} was abandoned by the client.", method, path);

            httpContext.Response.StatusCode = ClientClosedRequest;
            return true;
        }

        var (statusCode, title, detail) = Describe(exception);

        // A 4xx here is the caller's mistake and only worth a warning; a 5xx is ours.
        logger.Log(
            statusCode >= StatusCodes.Status500InternalServerError ? LogLevel.Error : LogLevel.Warning,
            exception,
            "{Method} {Path} failed with {StatusCode}.",
            method, path, statusCode);

        var problem = new ProblemDetails
        {
            Status = statusCode,
            Title = title,
            Detail = detail,
            Instance = path
        };

        // Ties the body a user can read — or paste into a bug report — to the log entry above.
        problem.Extensions["traceId"] = Activity.Current?.Id ?? httpContext.TraceIdentifier;

        // Locally the details are the point of the response; in any other environment they are
        // an information leak, so the log keeps them and the caller gets the traceId instead.
        if (environment.IsDevelopment())
        {
            problem.Detail ??= exception.Message;
            problem.Extensions["exception"] = exception.GetType().FullName;
            problem.Extensions["stackTrace"] = exception.StackTrace;
        }

        // Set before writing: the writer reads the status off the response rather than taking
        // it from ProblemDetails, and the middleware has already defaulted it to 500.
        httpContext.Response.StatusCode = statusCode;

        var written = await problemDetailsService.TryWriteAsync(new ProblemDetailsContext
        {
            HttpContext = httpContext,
            Exception = exception,
            ProblemDetails = problem
        });

        // The writer declines when the caller asked for something other than JSON — a browser
        // typing the URL, say. A problem+json body nobody negotiated still beats an empty 500.
        if (!written)
        {
            await httpContext.Response.WriteAsJsonAsync(
                problem, options: null, contentType: "application/problem+json", cancellationToken);
        }

        return true;
    }

    /// <summary>
    /// Status, title and the part of the failure that is safe to put in the response.
    /// Everything unrecognised is a bug in the API and says nothing beyond "500".
    /// </summary>
    private static (int StatusCode, string Title, string? Detail) Describe(Exception exception) => exception switch
    {
        // Thrown when the server refuses to finish reading the request: a body over the size
        // limit (413), or one that is truncated or malformed (400). The framework has already
        // picked the right status and its message describes the caller's mistake, so both are
        // passed through — a rejected request should not be reported as a fault of the API.
        // (Model binding converts this into a validation error by itself when reading a form,
        // so the multipart upload endpoint answers 400 without ever reaching this handler.)
        BadHttpRequestException bad => (
            bad.StatusCode,
            bad.StatusCode == StatusCodes.Status413PayloadTooLarge
                ? "The request is too large."
                : "The request could not be read.",
            bad.Message),

        _ => (StatusCodes.Status500InternalServerError, "An unexpected error occurred.", null)
    };
}
