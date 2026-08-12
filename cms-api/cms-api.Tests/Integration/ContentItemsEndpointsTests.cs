using System.Net;
using System.Net.Http.Json;
using cms_api.Dtos;

namespace cms_api.Tests.Integration;

/// <summary>
/// Content items — where draft visibility is decided and where a payload is checked against
/// its type's schema. The visibility rules matter most: the same URL must answer differently
/// for the public site than for a signed-in editor.
/// </summary>
public class ContentItemsEndpointsTests(CmsApiFactory factory) : IClassFixture<CmsApiFactory>
{
    private static object Field(string name, string type, bool required = false, string? targetType = null) =>
        new { name, type, required, targetType };

    private async Task<HttpClient> CreateTypeAsync(string slug, params object[] fields)
    {
        var admin = await factory.CreateAdminClientAsync();

        var response = await admin.PostAsJsonAsync("/api/content-types", new
        {
            name = slug,
            slug,
            fields = fields.Length > 0 ? fields : [Field("title", "Text")]
        });

        response.EnsureSuccessStatusCode();
        return admin;
    }

    private static Task<HttpResponseMessage> SaveItemAsync(
        HttpClient client, string typeSlug, string slug, string status, string dataJson) =>
        client.PostAsJsonAsync($"/api/content-types/{typeSlug}/items", new { slug, status, dataJson });

    // --- Reading ---------------------------------------------------------

    [Fact]
    public async Task An_anonymous_caller_sees_published_items_only()
    {
        var admin = await CreateTypeAsync("visibility");
        await SaveItemAsync(admin, "visibility", "public-one", "Published", """{ "title": "Public" }""");
        await SaveItemAsync(admin, "visibility", "secret-one", "Draft", """{ "title": "Secret" }""");

        var items = await factory.CreateClient()
            .GetFromJsonAsync<List<ContentItemListDto>>("/api/content-types/visibility/items");

        Assert.Equal(["public-one"], items!.Select(i => i.Slug));
    }

    [Fact]
    public async Task A_signed_in_caller_sees_drafts_too()
    {
        var admin = await CreateTypeAsync("visibility-authed");
        await SaveItemAsync(admin, "visibility-authed", "published", "Published", """{ "title": "P" }""");
        await SaveItemAsync(admin, "visibility-authed", "draft", "Draft", """{ "title": "D" }""");

        var items = await admin.GetFromJsonAsync<List<ContentItemListDto>>(
            "/api/content-types/visibility-authed/items");

        Assert.Equal(2, items!.Count);
    }

    [Fact]
    public async Task Even_a_viewer_may_read_drafts()
    {
        var admin = await CreateTypeAsync("viewer-drafts");
        await SaveItemAsync(admin, "viewer-drafts", "a-draft", "Draft", """{ "title": "D" }""");

        var viewer = await factory.CreateClientForNewUserAsync("Viewer");

        var items = await viewer.GetFromJsonAsync<List<ContentItemListDto>>(
            "/api/content-types/viewer-drafts/items");

        Assert.Single(items!);
    }

    [Fact]
    public async Task An_anonymous_request_for_drafts_returns_nothing_rather_than_published_items()
    {
        var admin = await CreateTypeAsync("anon-draft-filter");
        await SaveItemAsync(admin, "anon-draft-filter", "published", "Published", """{ "title": "P" }""");
        await SaveItemAsync(admin, "anon-draft-filter", "draft", "Draft", """{ "title": "D" }""");

        // The published-only rule is applied on top of the requested filter, not instead of
        // it — otherwise this would quietly hand back items the caller never asked for.
        var items = await factory.CreateClient().GetFromJsonAsync<List<ContentItemListDto>>(
            "/api/content-types/anon-draft-filter/items?status=Draft");

        Assert.Empty(items!);
    }

    [Fact]
    public async Task A_draft_requested_anonymously_is_404_rather_than_403()
    {
        var admin = await CreateTypeAsync("hidden-draft");
        await SaveItemAsync(admin, "hidden-draft", "unreleased", "Draft", """{ "title": "Soon" }""");

        var response = await factory.CreateClient().GetAsync("/api/content-types/hidden-draft/items/unreleased");

        // 403 would confirm that something exists at this slug; 404 gives nothing away.
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Field_values_are_omitted_unless_asked_for()
    {
        var admin = await CreateTypeAsync("include-data");
        await SaveItemAsync(admin, "include-data", "an-item", "Published", """{ "title": "Body" }""");

        var without = await admin.GetFromJsonAsync<List<ContentItemListDto>>(
            "/api/content-types/include-data/items");
        Assert.Null(Assert.Single(without!).DataJson);

        var with = await admin.GetFromJsonAsync<List<ContentItemListDto>>(
            "/api/content-types/include-data/items?includeData=true");
        Assert.Contains("Body", Assert.Single(with!).DataJson!);
    }

    [Fact]
    public async Task The_status_filter_and_limit_are_applied()
    {
        var admin = await CreateTypeAsync("filters");
        await SaveItemAsync(admin, "filters", "aaa", "Published", """{ "title": "A" }""");
        await SaveItemAsync(admin, "filters", "bbb", "Published", """{ "title": "B" }""");
        await SaveItemAsync(admin, "filters", "ccc", "Draft", """{ "title": "C" }""");

        var drafts = await admin.GetFromJsonAsync<List<ContentItemListDto>>(
            "/api/content-types/filters/items?status=draft");
        Assert.Equal(["ccc"], drafts!.Select(i => i.Slug));

        // Ordered by slug, so a limit takes a predictable slice.
        var limited = await admin.GetFromJsonAsync<List<ContentItemListDto>>(
            "/api/content-types/filters/items?limit=2");
        Assert.Equal(["aaa", "bbb"], limited!.Select(i => i.Slug));
    }

    [Fact]
    public async Task An_unparseable_status_filter_is_rejected()
    {
        var admin = await CreateTypeAsync("bad-status-filter");

        var response = await admin.GetAsync("/api/content-types/bad-status-filter/items?status=Archived");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Reading_items_of_an_unknown_type_is_404()
    {
        var response = await factory.CreateClient().GetAsync("/api/content-types/ghost-type/items");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    // --- Writing ---------------------------------------------------------

    [Fact]
    public async Task An_editor_may_save_an_item()
    {
        await CreateTypeAsync("editor-writes");
        var editor = await factory.CreateClientForNewUserAsync("Editor");

        var response = await SaveItemAsync(
            editor, "editor-writes", "by-editor", "Published", """{ "title": "Written" }""");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var saved = await response.Content.ReadFromJsonAsync<ContentItemDto>();
        Assert.Equal("by-editor", saved!.Slug);
        Assert.Equal("Published", saved.Status);
    }

    [Fact]
    public async Task A_viewer_may_not_save_an_item()
    {
        await CreateTypeAsync("viewer-writes");
        var viewer = await factory.CreateClientForNewUserAsync("Viewer");

        var response = await SaveItemAsync(
            viewer, "viewer-writes", "nope", "Draft", """{ "title": "Nope" }""");

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task An_anonymous_caller_may_not_save_an_item()
    {
        await CreateTypeAsync("anon-writes");

        var response = await SaveItemAsync(
            factory.CreateClient(), "anon-writes", "nope", "Draft", """{ "title": "Nope" }""");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Saving_the_same_slug_updates_the_item_in_place()
    {
        var admin = await CreateTypeAsync("item-upsert");

        var first = await (await SaveItemAsync(admin, "item-upsert", "same-slug", "Draft", """{ "title": "One" }"""))
            .Content.ReadFromJsonAsync<ContentItemDto>();

        var second = await (await SaveItemAsync(admin, "item-upsert", "same-slug", "Published", """{ "title": "Two" }"""))
            .Content.ReadFromJsonAsync<ContentItemDto>();

        Assert.Equal(first!.Id, second!.Id);
        Assert.Equal("Published", second.Status);
        Assert.Contains("Two", second.DataJson);
        Assert.True(second.UpdatedAt >= first.UpdatedAt);
    }

    [Fact]
    public async Task Timestamps_come_back_as_utc()
    {
        var admin = await CreateTypeAsync("timestamps");

        var saved = await (await SaveItemAsync(admin, "timestamps", "an-item", "Draft", """{ "title": "T" }"""))
            .Content.ReadFromJsonAsync<ContentItemDto>();

        // SQLite stores no offset, so the context restores the Kind on read; without that a
        // client would parse this as local time and display it wrong by its own offset.
        Assert.Equal(DateTimeKind.Utc, saved!.UpdatedAt.Kind);
    }

    [Theory]
    [InlineData("Not A Slug")]
    [InlineData("UPPER")]
    public async Task An_unusable_item_slug_is_rejected(string slug)
    {
        var admin = await CreateTypeAsync("item-slug-check");

        var response = await SaveItemAsync(admin, "item-slug-check", slug, "Draft", """{ "title": "X" }""");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task An_unknown_status_is_rejected()
    {
        var admin = await CreateTypeAsync("item-status-check");

        var response = await SaveItemAsync(admin, "item-status-check", "an-item", "Archived", """{ "title": "X" }""");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("Draft", await response.Content.ReadAsStringAsync());
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public async Task Missing_data_is_rejected(string dataJson)
    {
        var admin = await CreateTypeAsync("item-empty-data");

        var response = await SaveItemAsync(admin, "item-empty-data", "an-item", "Draft", dataJson);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("DataJson is required", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Malformed_data_is_rejected()
    {
        var admin = await CreateTypeAsync("item-bad-json");

        var response = await SaveItemAsync(admin, "item-bad-json", "an-item", "Draft", "{ not json");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("valid JSON", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Schema_violations_come_back_as_a_list()
    {
        await CreateTypeAsync("item-schema", Field("title", "Text", required: true), Field("views", "Number"));
        var admin = await factory.CreateAdminClientAsync();

        var response = await SaveItemAsync(
            admin, "item-schema", "an-item", "Draft", """{ "views": "many", "extra": true }""");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);

        // A JSON array rather than one message, so the editor can fix the whole form at once.
        var errors = await response.Content.ReadFromJsonAsync<List<string>>();

        Assert.Equal(3, errors!.Count);
        Assert.Contains("'title' is required.", errors);
        Assert.Contains("'views' must be a valid Number.", errors);
        Assert.Contains("'extra' is not a field on this content type.", errors);
    }

    [Fact]
    public async Task A_reference_to_an_item_that_does_not_exist_is_rejected()
    {
        await CreateTypeAsync("ref-person");
        await CreateTypeAsync("ref-post", Field("author", "Reference", targetType: "ref-person"));

        var admin = await factory.CreateAdminClientAsync();

        var response = await SaveItemAsync(
            admin, "ref-post", "orphan", "Draft", $$"""{ "author": "{{Guid.NewGuid()}}" }""");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);

        var errors = await response.Content.ReadFromJsonAsync<List<string>>();
        Assert.Contains("'author' must refer to an existing 'ref-person' item.", errors!);
    }

    [Fact]
    public async Task A_reference_to_a_real_item_is_accepted()
    {
        await CreateTypeAsync("ok-person");
        await CreateTypeAsync("ok-post", Field("author", "Reference", targetType: "ok-person"));

        var admin = await factory.CreateAdminClientAsync();

        var person = await (await SaveItemAsync(admin, "ok-person", "ada", "Published", "{}"))
            .Content.ReadFromJsonAsync<ContentItemDto>();

        var response = await SaveItemAsync(
            admin, "ok-post", "about-ada", "Published", $$"""{ "author": "{{person!.Id}}" }""");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Saving_into_an_unknown_type_is_404()
    {
        var admin = await factory.CreateAdminClientAsync();

        var response = await SaveItemAsync(admin, "ghost-type", "an-item", "Draft", "{}");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    // --- Deleting --------------------------------------------------------

    [Fact]
    public async Task An_item_can_be_deleted()
    {
        var admin = await CreateTypeAsync("deletable");
        await SaveItemAsync(admin, "deletable", "goodbye", "Published", """{ "title": "Bye" }""");

        var deleted = await admin.DeleteAsync("/api/content-types/deletable/items/goodbye");
        Assert.Equal(HttpStatusCode.NoContent, deleted.StatusCode);

        var lookup = await admin.GetAsync("/api/content-types/deletable/items/goodbye");
        Assert.Equal(HttpStatusCode.NotFound, lookup.StatusCode);
    }

    [Fact]
    public async Task Deleting_a_referenced_item_is_refused()
    {
        await CreateTypeAsync("guard-person");
        await CreateTypeAsync("guard-post", Field("author", "Reference", targetType: "guard-person"));

        var admin = await factory.CreateAdminClientAsync();

        var person = await (await SaveItemAsync(admin, "guard-person", "ada", "Published", "{}"))
            .Content.ReadFromJsonAsync<ContentItemDto>();

        await SaveItemAsync(admin, "guard-post", "about-ada", "Published", $$"""{ "author": "{{person!.Id}}" }""");

        var response = await admin.DeleteAsync("/api/content-types/guard-person/items/ada");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        // Names the referrer, so the editor knows what to unpick first.
        Assert.Contains("guard-post/about-ada", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task A_viewer_may_not_delete_an_item()
    {
        var admin = await CreateTypeAsync("viewer-deletes");
        await SaveItemAsync(admin, "viewer-deletes", "an-item", "Published", """{ "title": "X" }""");

        var viewer = await factory.CreateClientForNewUserAsync("Viewer");

        var response = await viewer.DeleteAsync("/api/content-types/viewer-deletes/items/an-item");

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Deleting_an_unknown_item_is_404()
    {
        var admin = await CreateTypeAsync("delete-missing");

        var response = await admin.DeleteAsync("/api/content-types/delete-missing/items/never-existed");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Item_slugs_only_have_to_be_unique_within_their_type()
    {
        var admin = await CreateTypeAsync("shared-slug-a");
        await CreateTypeAsync("shared-slug-b");

        var first = await SaveItemAsync(admin, "shared-slug-a", "about", "Published", """{ "title": "A" }""");
        var second = await SaveItemAsync(admin, "shared-slug-b", "about", "Published", """{ "title": "B" }""");

        Assert.Equal(HttpStatusCode.OK, first.StatusCode);
        Assert.Equal(HttpStatusCode.OK, second.StatusCode);
    }
}
