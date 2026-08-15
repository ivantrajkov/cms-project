using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace cms_api.Tests.Integration;

/// <summary>
/// The error contract the clients are written against.
///
/// The frontend flattens four different failure shapes in <c>readError</c> (plain text, a JSON
/// array of messages, a bare JSON string and ProblemDetails), and each controller deliberately
/// picks one of them. A global exception handler sits in front of all of it, so these tests pin
/// down what every kind of failure looks like on the wire — a change of shape here is a change
/// the frontend has to be taught about, not an implementation detail.
/// </summary>
public class ErrorResponsesTests(CmsApiFactory factory) : IClassFixture<CmsApiFactory>
{
    private static string? MediaType(HttpResponseMessage response) =>
        response.Content.Headers.ContentType?.MediaType;

    [Fact]
    public async Task A_rejected_request_still_answers_with_its_plain_text_message()
    {
        var admin = await factory.CreateAdminClientAsync();

        var response = await admin.PostAsJsonAsync("/api/content-types", new
        {
            name = "Bad Slug",
            slug = "Not A Slug",
            fields = Array.Empty<object>()
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("text/plain", MediaType(response));
        Assert.StartsWith("Slug ", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task A_schema_violation_still_answers_with_a_json_array_of_messages()
    {
        var admin = await factory.CreateAdminClientAsync();

        var created = await admin.PostAsJsonAsync("/api/content-types", new
        {
            name = "Shapes",
            slug = "error-shapes",
            fields = new[] { new { name = "title", type = "Text", required = true, targetType = (string?)null } }
        });
        created.EnsureSuccessStatusCode();

        var response = await admin.PostAsJsonAsync("/api/content-types/error-shapes/items", new
        {
            slug = "an-item",
            status = "Draft",
            dataJson = "{}"
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("application/json", MediaType(response));

        var messages = await response.Content.ReadFromJsonAsync<List<string>>();
        Assert.NotEmpty(messages!);
    }

    [Fact]
    public async Task A_valueless_not_found_is_still_problem_details()
    {
        var response = await factory.CreateClient().GetAsync("/api/content-types/no-such-type");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("application/problem+json", MediaType(response));

        var problem = JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;
        Assert.Equal(404, problem.GetProperty("status").GetInt32());
    }

    [Fact]
    public async Task An_unmatched_route_is_still_an_empty_404()
    {
        // The terminal MapFallback, which keeps "not found" distinguishable from "not allowed".
        var response = await factory.CreateClient().GetAsync("/no/such/path");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Empty(await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task A_missing_token_is_still_an_empty_401()
    {
        var response = await factory.CreateClient().GetAsync("/api/users");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Empty(await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task A_forbidden_role_is_still_an_empty_403()
    {
        var viewer = await factory.CreateClientForNewUserAsync("Viewer");

        var response = await viewer.GetAsync("/api/users");

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Empty(await response.Content.ReadAsStringAsync());
    }
}
