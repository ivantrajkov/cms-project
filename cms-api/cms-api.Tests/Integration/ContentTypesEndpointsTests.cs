using System.Net;
using System.Net.Http.Json;
using cms_api.Dtos;

namespace cms_api.Tests.Integration;

/// <summary>
/// Content type schemas. Reads are anonymous because the public renderer needs them;
/// writes are Admin-only because changing a schema affects every existing item of the type.
/// </summary>
public class ContentTypesEndpointsTests(CmsApiFactory factory) : IClassFixture<CmsApiFactory>
{
    private static object TextField(string name, bool required = false) =>
        new { name, type = "Text", required, targetType = (string?)null };

    private static async Task<ContentTypeDto> CreateTypeAsync(
        HttpClient admin, string slug, params object[] fields)
    {
        var response = await admin.PostAsJsonAsync("/api/content-types", new
        {
            name = slug,
            slug,
            fields = fields.Length > 0 ? fields : [TextField("title")]
        });

        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<ContentTypeDto>())!;
    }

    [Fact]
    public async Task Anonymous_callers_can_list_and_read_types()
    {
        var admin = await factory.CreateAdminClientAsync();
        await CreateTypeAsync(admin, "anon-readable", TextField("title", required: true));

        var anonymous = factory.CreateClient();

        var list = await anonymous.GetFromJsonAsync<List<ContentTypeSummaryDto>>("/api/content-types");
        Assert.Contains(list!, t => t.Slug == "anon-readable");

        var single = await anonymous.GetFromJsonAsync<ContentTypeDto>("/api/content-types/anon-readable");
        Assert.Equal("anon-readable", single!.Slug);

        var field = Assert.Single(single.Fields);
        Assert.Equal("title", field.Name);
        Assert.Equal("Text", field.Type);
        Assert.True(field.Required);
    }

    [Fact]
    public async Task An_unknown_slug_is_404()
    {
        var response = await factory.CreateClient().GetAsync("/api/content-types/no-such-type");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Writing_a_schema_requires_a_token()
    {
        var response = await factory.CreateClient()
            .PostAsJsonAsync("/api/content-types", new { name = "X", slug = "x", fields = new[] { TextField("title") } });

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Theory]
    [InlineData("Editor")]
    [InlineData("Viewer")]
    public async Task Writing_a_schema_is_refused_to_everyone_but_admin(string role)
    {
        var client = await factory.CreateClientForNewUserAsync(role);

        var response = await client.PostAsJsonAsync("/api/content-types", new
        {
            name = "Blocked",
            slug = $"blocked-{role.ToLowerInvariant()}",
            fields = new[] { TextField("title") }
        });

        // 403 rather than 401: the caller is authenticated, just not permitted.
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Deleting_a_schema_is_refused_to_an_editor()
    {
        var admin = await factory.CreateAdminClientAsync();
        await CreateTypeAsync(admin, "editor-cannot-delete");

        var editor = await factory.CreateClientForNewUserAsync("Editor");

        var response = await editor.DeleteAsync("/api/content-types/editor-cannot-delete");

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Theory]
    [InlineData("Not A Slug")]
    [InlineData("UPPER")]
    [InlineData("")]
    public async Task An_unusable_slug_is_rejected(string slug)
    {
        var admin = await factory.CreateAdminClientAsync();

        var response = await admin.PostAsJsonAsync("/api/content-types", new
        {
            name = "Whatever",
            slug,
            fields = new[] { TextField("title") }
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task A_missing_name_is_rejected()
    {
        var admin = await factory.CreateAdminClientAsync();

        var response = await admin.PostAsJsonAsync("/api/content-types", new
        {
            name = "   ",
            slug = "no-name",
            fields = new[] { TextField("title") }
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("Name is required", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task A_field_with_no_name_is_rejected()
    {
        var admin = await factory.CreateAdminClientAsync();

        var response = await admin.PostAsJsonAsync("/api/content-types", new
        {
            name = "Nameless field",
            slug = "nameless-field",
            fields = new[] { TextField("") }
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("must have a name", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Field_names_that_differ_only_by_case_are_rejected()
    {
        var admin = await factory.CreateAdminClientAsync();

        // Two fields called "title" and "Title" would be indistinguishable to an editor.
        var response = await admin.PostAsJsonAsync("/api/content-types", new
        {
            name = "Duplicate",
            slug = "duplicate-fields",
            fields = new[] { TextField("title"), TextField("Title") }
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("Duplicate field name", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task An_unknown_field_type_is_rejected_with_the_valid_ones_listed()
    {
        var admin = await factory.CreateAdminClientAsync();

        var response = await admin.PostAsJsonAsync("/api/content-types", new
        {
            name = "Bad type",
            slug = "bad-type",
            fields = new[] { new { name = "thing", type = "Colour", required = false, targetType = (string?)null } }
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);

        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains("Field type must be one of", body);
        Assert.Contains("Reference", body);
    }

    [Fact]
    public async Task A_reference_field_needs_a_target_type()
    {
        var admin = await factory.CreateAdminClientAsync();

        var response = await admin.PostAsJsonAsync("/api/content-types", new
        {
            name = "Dangling",
            slug = "dangling-reference",
            fields = new[] { new { name = "author", type = "Reference", required = false, targetType = (string?)null } }
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("needs a target content type", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task A_reference_field_cannot_target_a_type_that_does_not_exist()
    {
        var admin = await factory.CreateAdminClientAsync();

        var response = await admin.PostAsJsonAsync("/api/content-types", new
        {
            name = "Unknown target",
            slug = "unknown-target",
            fields = new[] { new { name = "author", type = "Reference", required = false, targetType = "ghost" } }
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("targets unknown content type 'ghost'", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task A_reference_field_to_an_existing_type_is_accepted()
    {
        var admin = await factory.CreateAdminClientAsync();
        await CreateTypeAsync(admin, "ref-target");

        var created = await CreateTypeAsync(
            admin,
            "ref-source",
            new { name = "target", type = "Reference", required = false, targetType = "ref-target" });

        var field = Assert.Single(created.Fields);
        Assert.Equal("Reference", field.Type);
        Assert.Equal("ref-target", field.TargetType);
    }

    [Fact]
    public async Task A_target_type_is_dropped_from_a_non_reference_field()
    {
        var admin = await factory.CreateAdminClientAsync();
        await CreateTypeAsync(admin, "stray-target-victim");

        // A target only means anything on a Reference field; keeping it would leave the
        // stored schema claiming a relationship that does not exist.
        var created = await CreateTypeAsync(
            admin,
            "stray-target",
            new { name = "title", type = "Text", required = false, targetType = "stray-target-victim" });

        Assert.Null(Assert.Single(created.Fields).TargetType);
    }

    [Fact]
    public async Task Saving_the_same_slug_updates_the_existing_type()
    {
        var admin = await factory.CreateAdminClientAsync();

        var first = await CreateTypeAsync(admin, "upsert-me", TextField("title"));
        var second = await CreateTypeAsync(admin, "upsert-me", TextField("title"), TextField("subtitle"));

        // Same row, new schema — the id is the proof it was not replaced.
        Assert.Equal(first.Id, second.Id);
        Assert.Equal(2, second.Fields.Count);

        var list = await admin.GetFromJsonAsync<List<ContentTypeSummaryDto>>("/api/content-types");
        Assert.Single(list!, t => t.Slug == "upsert-me");
    }

    [Fact]
    public async Task Deleting_a_type_with_items_is_refused()
    {
        var admin = await factory.CreateAdminClientAsync();
        await CreateTypeAsync(admin, "has-items", TextField("title"));

        var saved = await admin.PostAsJsonAsync("/api/content-types/has-items/items", new
        {
            slug = "an-item",
            status = "Draft",
            dataJson = """{ "title": "Hello" }"""
        });
        saved.EnsureSuccessStatusCode();

        var response = await admin.DeleteAsync("/api/content-types/has-items");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("still has items", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Deleting_a_type_another_schema_points_at_is_refused()
    {
        var admin = await factory.CreateAdminClientAsync();

        await CreateTypeAsync(admin, "referenced-type");
        await CreateTypeAsync(
            admin,
            "referring-type",
            new { name = "target", type = "Reference", required = false, targetType = "referenced-type" });

        var response = await admin.DeleteAsync("/api/content-types/referenced-type");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("referring-type", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task An_unused_type_can_be_deleted()
    {
        var admin = await factory.CreateAdminClientAsync();
        await CreateTypeAsync(admin, "disposable");

        var deleted = await admin.DeleteAsync("/api/content-types/disposable");
        Assert.Equal(HttpStatusCode.NoContent, deleted.StatusCode);

        var lookup = await admin.GetAsync("/api/content-types/disposable");
        Assert.Equal(HttpStatusCode.NotFound, lookup.StatusCode);
    }

    [Fact]
    public async Task Deleting_an_unknown_type_is_404()
    {
        var admin = await factory.CreateAdminClientAsync();

        var response = await admin.DeleteAsync("/api/content-types/never-existed");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }
}
