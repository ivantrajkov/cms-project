using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.OpenApi;
using Microsoft.OpenApi;

namespace cms_api.OpenApi;

/// <summary>
/// Declares the <c>Bearer</c> security scheme on the generated document. Without this the
/// Swagger UI has no "Authorize" button, so every protected endpoint would be untestable
/// from the docs page — which is most of them, given the API's authenticated-by-default
/// fallback policy.
/// </summary>
public sealed class BearerSecuritySchemeTransformer : IOpenApiDocumentTransformer
{
    /// <summary>Name the scheme is registered under; referenced by the operation transformer.</summary>
    public const string SchemeName = "Bearer";

    public Task TransformAsync(
        OpenApiDocument document,
        OpenApiDocumentTransformerContext context,
        CancellationToken cancellationToken)
    {
        document.Components ??= new OpenApiComponents();
        document.Components.SecuritySchemes ??= new Dictionary<string, IOpenApiSecurityScheme>();

        document.Components.SecuritySchemes[SchemeName] = new OpenApiSecurityScheme
        {
            Type = SecuritySchemeType.Http,
            Scheme = "bearer",
            BearerFormat = "JWT",
            In = ParameterLocation.Header,
            Description =
                "JWT issued by POST /api/auth/login. Paste only the token itself — " +
                "Swagger UI adds the \"Bearer \" prefix for you."
        };

        return Task.CompletedTask;
    }
}

/// <summary>
/// Marks each operation with the security it actually requires.
///
/// The requirement is derived from the endpoint's own authorization metadata rather than
/// applied to the whole document, so the anonymous read endpoints the public site depends
/// on are not misdocumented as needing a token. Any required roles are appended to the
/// description, since OpenAPI has no vocabulary for them.
/// </summary>
public sealed class AuthorizationOperationTransformer : IOpenApiOperationTransformer
{
    public Task TransformAsync(
        OpenApiOperation operation,
        OpenApiOperationTransformerContext context,
        CancellationToken cancellationToken)
    {
        var metadata = context.Description.ActionDescriptor.EndpointMetadata;

        // [AllowAnonymous] wins over any [Authorize] further up, matching how the
        // authorization middleware itself resolves the two.
        if (metadata.OfType<IAllowAnonymous>().Any())
            return Task.CompletedTask;

        operation.Security =
        [
            new OpenApiSecurityRequirement
            {
                // The host document has to be passed: the requirement is serialized by
                // resolving the reference back to its name in components, and a reference
                // with nowhere to look writes an empty object instead.
                [new OpenApiSecuritySchemeReference(BearerSecuritySchemeTransformer.SchemeName, context.Document)] = []
            }
        ];

        var roles = metadata.OfType<IAuthorizeData>()
            .Select(a => a.Roles)
            .Where(r => !string.IsNullOrWhiteSpace(r))
            .SelectMany(r => r!.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        var note = roles.Count > 0
            ? $"Requires the {string.Join(" or ", roles)} role."
            : "Requires an authenticated user.";

        operation.Description = string.IsNullOrWhiteSpace(operation.Description)
            ? note
            : $"{operation.Description}\n\n{note}";

        operation.Responses ??= new OpenApiResponses();
        operation.Responses.TryAdd("401", new OpenApiResponse { Description = "Missing or expired token." });

        if (roles.Count > 0)
            operation.Responses.TryAdd("403", new OpenApiResponse { Description = "Authenticated, but the role is not permitted." });

        return Task.CompletedTask;
    }
}
