using cms_api.Models;
using cms_api.Services;

namespace cms_api.Tests.Unit;

/// <summary>
/// "What still points at this?" — the question that decides whether a delete is allowed.
/// A false negative here leaves dangling references, so these tests care most about the
/// cases the scan could plausibly miss.
/// </summary>
public class ReferenceFinderTests : IDisposable
{
    private readonly TestDatabase _fixture = new();

    private ReferenceFinder Finder => new(_fixture.Db);

    public void Dispose() => _fixture.Dispose();

    [Fact]
    public async Task Finds_the_items_pointing_at_an_item()
    {
        var people = await _fixture.AddContentTypeAsync("person");
        var ada = await _fixture.AddItemAsync(people, "ada");

        var posts = await _fixture.AddContentTypeAsync(
            "post", TestDatabase.Field("author", FieldType.Reference, "person"));

        await _fixture.AddItemAsync(posts, "first-post", $$"""{ "author": "{{ada.Id}}" }""");
        await _fixture.AddItemAsync(posts, "unrelated-post", "{}");

        var referrers = await Finder.FindReferrersToItemAsync(ada.Id, "person");

        // "type/slug" so the API's refusal message tells the editor where to look.
        Assert.Equal(["post/first-post"], referrers);
    }

    [Fact]
    public async Task Finds_nothing_when_the_item_is_unreferenced()
    {
        var people = await _fixture.AddContentTypeAsync("person");
        var ada = await _fixture.AddItemAsync(people, "ada");

        Assert.Empty(await Finder.FindReferrersToItemAsync(ada.Id, "person"));
    }

    [Fact]
    public async Task Ignores_a_reference_field_that_targets_a_different_type()
    {
        var people = await _fixture.AddContentTypeAsync("person");
        var ada = await _fixture.AddItemAsync(people, "ada");

        // Declared to point at products, so even holding this id it is not a person reference.
        var posts = await _fixture.AddContentTypeAsync(
            "post", TestDatabase.Field("product", FieldType.Reference, "product"));

        await _fixture.AddItemAsync(posts, "first-post", $$"""{ "product": "{{ada.Id}}" }""");

        Assert.Empty(await Finder.FindReferrersToItemAsync(ada.Id, "person"));
    }

    [Fact]
    public async Task Matches_an_id_regardless_of_how_it_was_cased()
    {
        var people = await _fixture.AddContentTypeAsync("person");
        var ada = await _fixture.AddItemAsync(people, "ada");

        var posts = await _fixture.AddContentTypeAsync(
            "post", TestDatabase.Field("author", FieldType.Reference, "person"));

        await _fixture.AddItemAsync(
            posts, "shouty-post", $$"""{ "author": "{{ada.Id.ToString().ToUpperInvariant()}}" }""");

        Assert.Equal(["post/shouty-post"], await Finder.FindReferrersToItemAsync(ada.Id, "person"));
    }

    [Fact]
    public async Task Skips_an_item_whose_data_is_not_readable()
    {
        var people = await _fixture.AddContentTypeAsync("person");
        var ada = await _fixture.AddItemAsync(people, "ada");

        var posts = await _fixture.AddContentTypeAsync(
            "post", TestDatabase.Field("author", FieldType.Reference, "person"));

        // One corrupt row must not stop the scan from reporting the rest.
        await _fixture.AddItemAsync(posts, "corrupt", "{ not json");
        await _fixture.AddItemAsync(posts, "good", $$"""{ "author": "{{ada.Id}}" }""");

        Assert.Equal(["post/good"], await Finder.FindReferrersToItemAsync(ada.Id, "person"));
    }

    [Fact]
    public async Task Skips_an_item_whose_data_is_not_an_object()
    {
        var people = await _fixture.AddContentTypeAsync("person");
        var ada = await _fixture.AddItemAsync(people, "ada");

        var posts = await _fixture.AddContentTypeAsync(
            "post", TestDatabase.Field("author", FieldType.Reference, "person"));

        await _fixture.AddItemAsync(posts, "array-data", "[1, 2, 3]");

        Assert.Empty(await Finder.FindReferrersToItemAsync(ada.Id, "person"));
    }

    [Fact]
    public async Task Finds_referrers_across_several_content_types()
    {
        var people = await _fixture.AddContentTypeAsync("person");
        var ada = await _fixture.AddItemAsync(people, "ada");

        var posts = await _fixture.AddContentTypeAsync(
            "post", TestDatabase.Field("author", FieldType.Reference, "person"));
        var talks = await _fixture.AddContentTypeAsync(
            "talk", TestDatabase.Field("speaker", FieldType.Reference, "person"));

        await _fixture.AddItemAsync(posts, "a-post", $$"""{ "author": "{{ada.Id}}" }""");
        await _fixture.AddItemAsync(talks, "a-talk", $$"""{ "speaker": "{{ada.Id}}" }""");

        var referrers = await Finder.FindReferrersToItemAsync(ada.Id, "person");

        Assert.Equal(["post/a-post", "talk/a-talk"], [.. referrers.Order()]);
    }

    [Fact]
    public async Task Finds_the_items_using_a_media_asset()
    {
        var asset = await _fixture.AddMediaAsync();

        var posts = await _fixture.AddContentTypeAsync(
            "post",
            TestDatabase.Field("hero", FieldType.Image),
            TestDatabase.Field("title", FieldType.Text));

        await _fixture.AddItemAsync(posts, "illustrated", $$"""{ "hero": "{{asset.Id}}" }""");
        await _fixture.AddItemAsync(posts, "plain", """{ "title": "No image" }""");

        Assert.Equal(["post/illustrated"], await Finder.FindReferrersToMediaAsync(asset.Id));
    }

    [Fact]
    public async Task Ignores_a_content_type_with_no_matching_field()
    {
        var asset = await _fixture.AddMediaAsync();

        var posts = await _fixture.AddContentTypeAsync("post", TestDatabase.Field("title", FieldType.Text));
        // The id is sitting in a Text field, which is not an image reference.
        await _fixture.AddItemAsync(posts, "mentions-an-id", $$"""{ "title": "{{asset.Id}}" }""");

        Assert.Empty(await Finder.FindReferrersToMediaAsync(asset.Id));
    }
}
