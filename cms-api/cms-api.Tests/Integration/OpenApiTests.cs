using System.Net;
using System.Text.Json;

namespace cms_api.Tests.Integration;

/// <summary>
/// The generated OpenAPI document and the Swagger UI over it.
///
/// The document is what anyone integrating with this API reads, so the assertions here are
/// about it telling the truth: which endpoints need a token, which roles they want, and
/// what each one does.
/// </summary>
public class OpenApiTests(CmsApiFactory factory) : IClassFixture<CmsApiFactory>
{
    private async Task<JsonElement> GetDocumentAsync()
    {
        var response = await factory.CreateClient().GetAsync("/openapi/v1.json");
        response.EnsureSuccessStatusCode();

        var json = await response.Content.ReadAsStringAsync();
        return JsonDocument.Parse(json).RootElement.Clone();
    }

    private static JsonElement Operation(JsonElement document, string path, string method) =>
        document.GetProperty("paths").GetProperty(path).GetProperty(method);

    [Fact]
    public async Task The_document_is_served_without_a_token()
    {
        // The fallback policy would otherwise put the API description behind a login.
        var response = await factory.CreateClient().GetAsync("/openapi/v1.json");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task The_document_is_titled_and_described()
    {
        var info = (await GetDocumentAsync()).GetProperty("info");

        Assert.Equal("CMS API", info.GetProperty("title").GetString());
        Assert.Equal("v1", info.GetProperty("version").GetString());
        Assert.Contains("bearer token", info.GetProperty("description").GetString()!);
    }

    [Fact]
    public async Task Every_controller_is_present()
    {
        var paths = (await GetDocumentAsync()).GetProperty("paths");

        Assert.True(paths.TryGetProperty("/api/auth/login", out _));
        Assert.True(paths.TryGetProperty("/api/content-types", out _));
        Assert.True(paths.TryGetProperty("/api/content-types/{typeSlug}/items", out _));
        Assert.True(paths.TryGetProperty("/api/media", out _));
        Assert.True(paths.TryGetProperty("/api/upload", out _));
        Assert.True(paths.TryGetProperty("/api/users", out _));
    }

    [Fact]
    public async Task The_bearer_scheme_is_declared_so_the_ui_can_offer_an_authorize_button()
    {
        var scheme = (await GetDocumentAsync())
            .GetProperty("components")
            .GetProperty("securitySchemes")
            .GetProperty("Bearer");

        Assert.Equal("http", scheme.GetProperty("type").GetString());
        Assert.Equal("bearer", scheme.GetProperty("scheme").GetString());
        Assert.Equal("JWT", scheme.GetProperty("bearerFormat").GetString());
    }

    [Fact]
    public async Task A_protected_operation_says_it_needs_the_bearer_scheme()
    {
        var operation = Operation(await GetDocumentAsync(), "/api/users", "get");

        var requirement = Assert.Single(operation.GetProperty("security").EnumerateArray());
        Assert.True(requirement.TryGetProperty("Bearer", out _));
    }

    [Fact]
    public async Task An_anonymous_operation_is_not_marked_as_needing_a_token()
    {
        // Listing content types is anonymous on purpose — the public renderer needs it.
        // Documenting it as protected would send integrators looking for a token.
        var operation = Operation(await GetDocumentAsync(), "/api/content-types", "get");

        Assert.False(operation.TryGetProperty("security", out _));
    }

    [Fact]
    public async Task The_login_endpoint_is_documented_as_anonymous()
    {
        var operation = Operation(await GetDocumentAsync(), "/api/auth/login", "post");

        Assert.False(operation.TryGetProperty("security", out _));
    }

    [Theory]
    [InlineData("/api/users", "get", "Admin")]
    [InlineData("/api/upload", "post", "Editor")]
    public async Task The_roles_an_operation_requires_are_spelled_out(string path, string method, string role)
    {
        // OpenAPI has no vocabulary for roles, so they go into the description.
        var operation = Operation(await GetDocumentAsync(), path, method);

        Assert.Contains(role, operation.GetProperty("description").GetString()!);
    }

    [Fact]
    public async Task A_protected_operation_documents_its_401()
    {
        var responses = Operation(await GetDocumentAsync(), "/api/users", "get").GetProperty("responses");

        Assert.True(responses.TryGetProperty("401", out _));
        Assert.True(responses.TryGetProperty("403", out _));
    }

    [Fact]
    public async Task The_failure_responses_an_operation_can_return_are_listed()
    {
        var document = await GetDocumentAsync();

        // Only the success shape is inferred from the signature; the rejections have to be
        // declared, and an undocumented 404 is a caller writing an error path that never runs.
        var save = Operation(document, "/api/content-types/{typeSlug}/items", "post").GetProperty("responses");
        Assert.True(save.TryGetProperty("400", out _));
        Assert.True(save.TryGetProperty("404", out _));

        var delete = Operation(document, "/api/media/{id}", "delete").GetProperty("responses");
        Assert.True(delete.TryGetProperty("204", out _));
        Assert.True(delete.TryGetProperty("400", out _));
        Assert.True(delete.TryGetProperty("404", out _));
    }

    [Fact]
    public async Task A_success_response_carries_the_schema_of_what_it_returns()
    {
        var content = Operation(await GetDocumentAsync(), "/api/auth/login", "post")
            .GetProperty("responses")
            .GetProperty("200")
            .GetProperty("content")
            .GetProperty("application/json")
            .GetProperty("schema");

        Assert.Contains("LoginResponse", content.ToString());
    }

    [Fact]
    public async Task Xml_doc_comments_become_the_operation_summaries()
    {
        // Proof that GenerateDocumentationFile is wired up: the summaries in the document
        // are the ones written above the actions, so the docs cannot drift from the source.
        var summary = Operation(await GetDocumentAsync(), "/api/auth/login", "post")
            .GetProperty("summary")
            .GetString();

        Assert.Contains("exchanges credentials", summary!);
    }

    [Fact]
    public async Task Swagger_ui_is_served()
    {
        var response = await factory.CreateClient().GetAsync("/swagger/index.html");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("text/html", response.Content.Headers.ContentType?.MediaType);
    }

    [Fact]
    public async Task Swagger_ui_redirects_from_its_prefix()
    {
        var response = await factory.CreateClient().GetAsync("/swagger");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }
}
