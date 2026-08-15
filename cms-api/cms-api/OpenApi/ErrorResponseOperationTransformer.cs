using Microsoft.AspNetCore.OpenApi;
using Microsoft.OpenApi;

namespace cms_api.OpenApi;

/// <summary>
/// Documents the one failure every operation shares.
///
/// <c>GlobalExceptionHandler</c> turns anything unhandled into problem+json, so a 500 is part
/// of the contract of every endpoint. Declaring it here rather than as an attribute on each
/// action keeps it from drifting out of sync the next time an action is added.
/// </summary>
public sealed class ErrorResponseOperationTransformer : IOpenApiOperationTransformer
{
    public Task TransformAsync(
        OpenApiOperation operation,
        OpenApiOperationTransformerContext context,
        CancellationToken cancellationToken)
    {
        operation.Responses ??= new OpenApiResponses();

        operation.Responses.TryAdd("500", new OpenApiResponse
        {
            Description =
                "Unexpected error. The body is an RFC 9457 problem+json object; its traceId " +
                "identifies the matching server-side log entry."
        });

        return Task.CompletedTask;
    }
}
