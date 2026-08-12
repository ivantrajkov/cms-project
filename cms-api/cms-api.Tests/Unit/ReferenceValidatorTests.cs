using System.Text.Json;
using cms_api.Models;
using cms_api.Services;

namespace cms_api.Tests.Unit;

/// <summary>
/// The database half of content validation: an id in the payload must name something that
/// exists, and a Reference must land on an item of the type its schema declares.
/// </summary>
public class ReferenceValidatorTests : IDisposable
{
    private readonly TestDatabase _fixture = new();

    private ReferenceValidator Validator => new(_fixture.Db);

    private static JsonElement Json(string json) => JsonDocument.Parse(json).RootElement;

    public void Dispose() => _fixture.Dispose();

    [Fact]
    public async Task Accepts_an_image_id_that_exists()
    {
        var asset = await _fixture.AddMediaAsync();
        var fields = new List<FieldDefinition> { TestDatabase.Field("hero", FieldType.Image) };

        var errors = await Validator.ValidateAsync(fields, Json($$"""{ "hero": "{{asset.Id}}" }"""));

        Assert.Empty(errors);
    }

    [Fact]
    public async Task Rejects_an_image_id_that_does_not_exist()
    {
        var fields = new List<FieldDefinition> { TestDatabase.Field("hero", FieldType.Image) };

        var errors = await Validator.ValidateAsync(fields, Json($$"""{ "hero": "{{Guid.NewGuid()}}" }"""));

        Assert.Equal(["'hero' refers to a media asset that does not exist."], errors);
    }

    [Fact]
    public async Task Accepts_a_reference_to_an_item_of_the_declared_type()
    {
        var people = await _fixture.AddContentTypeAsync("person");
        var author = await _fixture.AddItemAsync(people, "ada");

        var fields = new List<FieldDefinition> { TestDatabase.Field("author", FieldType.Reference, "person") };

        var errors = await Validator.ValidateAsync(fields, Json($$"""{ "author": "{{author.Id}}" }"""));

        Assert.Empty(errors);
    }

    [Fact]
    public async Task Rejects_a_reference_to_an_item_of_the_wrong_type()
    {
        await _fixture.AddContentTypeAsync("person");
        var products = await _fixture.AddContentTypeAsync("product");
        var widget = await _fixture.AddItemAsync(products, "widget");

        // The id exists, but it is a product — which is exactly the mistake a typed
        // reference is supposed to catch.
        var fields = new List<FieldDefinition> { TestDatabase.Field("author", FieldType.Reference, "person") };

        var errors = await Validator.ValidateAsync(fields, Json($$"""{ "author": "{{widget.Id}}" }"""));

        Assert.Equal(["'author' must refer to an existing 'person' item."], errors);
    }

    [Fact]
    public async Task Rejects_a_reference_to_an_item_that_does_not_exist()
    {
        await _fixture.AddContentTypeAsync("person");

        var fields = new List<FieldDefinition> { TestDatabase.Field("author", FieldType.Reference, "person") };

        var errors = await Validator.ValidateAsync(fields, Json($$"""{ "author": "{{Guid.NewGuid()}}" }"""));

        Assert.Equal(["'author' must refer to an existing 'person' item."], errors);
    }

    [Fact]
    public async Task Rejects_a_reference_whose_target_type_is_gone()
    {
        var fields = new List<FieldDefinition> { TestDatabase.Field("author", FieldType.Reference, "person") };

        var errors = await Validator.ValidateAsync(fields, Json($$"""{ "author": "{{Guid.NewGuid()}}" }"""));

        Assert.Equal(["'author' targets unknown content type 'person'."], errors);
    }

    [Fact]
    public async Task Ignores_fields_that_hold_no_id()
    {
        await _fixture.AddContentTypeAsync("person");

        var fields = new List<FieldDefinition>
        {
            TestDatabase.Field("title", FieldType.Text),
            TestDatabase.Field("hero", FieldType.Image),
            TestDatabase.Field("author", FieldType.Reference, "person")
        };

        // Absent, the wrong JSON type, and not a GUID: all three are already reported by
        // ContentItemValidator, so re-reporting them here would double up the message.
        var errors = await Validator.ValidateAsync(
            fields,
            Json("""{ "title": "Hello", "hero": 42, "author": "not-a-guid" }"""));

        Assert.Empty(errors);
    }

    [Fact]
    public async Task Reports_every_broken_id_at_once()
    {
        await _fixture.AddContentTypeAsync("person");

        var fields = new List<FieldDefinition>
        {
            TestDatabase.Field("hero", FieldType.Image),
            TestDatabase.Field("author", FieldType.Reference, "person")
        };

        var errors = await Validator.ValidateAsync(
            fields,
            Json($$"""{ "hero": "{{Guid.NewGuid()}}", "author": "{{Guid.NewGuid()}}" }"""));

        Assert.Equal(2, errors.Count);
    }
}
