using System.Text.Json;
using cms_api.Models;
using cms_api.Services;

namespace cms_api.Tests.Unit;

/// <summary>
/// The shape half of content validation: required fields present, values of the declared
/// type, nothing outside the schema. Whether the ids inside Image/Reference values resolve
/// is <see cref="ReferenceValidatorTests"/>' problem.
/// </summary>
public class ContentItemValidatorTests
{
    private static JsonElement Json(string json) => JsonDocument.Parse(json).RootElement;

    private static List<FieldDefinition> Fields(params FieldDefinition[] fields) => [.. fields];

    private static FieldDefinition Field(string name, FieldType type, bool required = false) =>
        new() { Name = name, Type = type, Required = required };

    [Fact]
    public void Accepts_a_payload_that_matches_the_schema()
    {
        var fields = Fields(
            Field("title", FieldType.Text, required: true),
            Field("views", FieldType.Number),
            Field("featured", FieldType.Boolean),
            Field("publishedOn", FieldType.Date),
            Field("layout", FieldType.Layout),
            Field("hero", FieldType.Image),
            Field("author", FieldType.Reference));

        var data = Json("""
            {
              "title": "Hello",
              "views": 42,
              "featured": true,
              "publishedOn": "2026-01-31",
              "layout": { "content": [], "root": {} },
              "hero": "0d1f6a5e-2a1e-4a0f-9d7c-2f3a4b5c6d7e",
              "author": "8b2c3d4e-5f60-4718-8293-a4b5c6d7e8f9"
            }
            """);

        Assert.Empty(ContentItemValidator.Validate(fields, data));
    }

    [Fact]
    public void Rejects_a_payload_that_is_not_an_object()
    {
        var errors = ContentItemValidator.Validate(Fields(Field("title", FieldType.Text)), Json("[1, 2, 3]"));

        Assert.Equal(["Data must be a JSON object."], errors);
    }

    [Fact]
    public void Reports_a_missing_required_field()
    {
        var errors = ContentItemValidator.Validate(
            Fields(Field("title", FieldType.Text, required: true)),
            Json("{}"));

        Assert.Equal(["'title' is required."], errors);
    }

    [Fact]
    public void Treats_null_as_absent()
    {
        var errors = ContentItemValidator.Validate(
            Fields(Field("title", FieldType.Text, required: true)),
            Json("""{ "title": null }"""));

        Assert.Equal(["'title' is required."], errors);
    }

    [Fact]
    public void Treats_a_whitespace_only_required_field_as_empty()
    {
        // An editor who typed spaces into a required box has not filled it in.
        var errors = ContentItemValidator.Validate(
            Fields(Field("title", FieldType.Text, required: true)),
            Json("""{ "title": "   " }"""));

        Assert.Equal(["'title' is required."], errors);
    }

    [Fact]
    public void Leaves_a_whitespace_only_optional_field_alone()
    {
        var errors = ContentItemValidator.Validate(
            Fields(Field("subtitle", FieldType.Text)),
            Json("""{ "subtitle": "   " }"""));

        Assert.Empty(errors);
    }

    [Fact]
    public void An_absent_optional_field_is_fine()
    {
        Assert.Empty(ContentItemValidator.Validate(Fields(Field("subtitle", FieldType.Text)), Json("{}")));
    }

    [Theory]
    [InlineData(FieldType.Text, "123")]
    [InlineData(FieldType.Text, "true")]
    [InlineData(FieldType.Number, "\"12\"")]
    [InlineData(FieldType.Boolean, "\"true\"")]
    [InlineData(FieldType.Boolean, "1")]
    [InlineData(FieldType.Date, "\"not a date\"")]
    [InlineData(FieldType.Date, "20260131")]
    [InlineData(FieldType.Layout, "\"{}\"")]
    [InlineData(FieldType.Layout, "[]")]
    [InlineData(FieldType.Image, "\"not-a-guid\"")]
    [InlineData(FieldType.Image, "42")]
    [InlineData(FieldType.Reference, "\"not-a-guid\"")]
    public void Reports_a_value_of_the_wrong_type(FieldType type, string jsonValue)
    {
        var errors = ContentItemValidator.Validate(
            Fields(Field("value", type)),
            Json($$"""{ "value": {{jsonValue}} }"""));

        Assert.Equal([$"'value' must be a valid {type}."], errors);
    }

    [Theory]
    [InlineData(FieldType.Text, "\"text\"")]
    [InlineData(FieldType.Number, "12")]
    [InlineData(FieldType.Number, "12.5")]
    [InlineData(FieldType.Boolean, "false")]
    [InlineData(FieldType.Date, "\"2026-01-31\"")]
    [InlineData(FieldType.Date, "\"2026-01-31T09:30:00Z\"")]
    [InlineData(FieldType.Layout, "{}")]
    [InlineData(FieldType.Image, "\"0d1f6a5e-2a1e-4a0f-9d7c-2f3a4b5c6d7e\"")]
    [InlineData(FieldType.Reference, "\"0d1f6a5e-2a1e-4a0f-9d7c-2f3a4b5c6d7e\"")]
    public void Accepts_a_value_of_the_declared_type(FieldType type, string jsonValue)
    {
        var errors = ContentItemValidator.Validate(
            Fields(Field("value", type)),
            Json($$"""{ "value": {{jsonValue}} }"""));

        Assert.Empty(errors);
    }

    [Fact]
    public void Rejects_a_property_that_is_not_in_the_schema()
    {
        // Otherwise a typo'd field name persists as data nothing ever reads.
        var errors = ContentItemValidator.Validate(
            Fields(Field("title", FieldType.Text)),
            Json("""{ "title": "Hello", "titel": "Typo" }"""));

        Assert.Equal(["'titel' is not a field on this content type."], errors);
    }

    [Fact]
    public void Field_names_are_matched_case_sensitively()
    {
        var errors = ContentItemValidator.Validate(
            Fields(Field("title", FieldType.Text, required: true)),
            Json("""{ "Title": "Hello" }"""));

        Assert.Equal(
            ["'title' is required.", "'Title' is not a field on this content type."],
            errors);
    }

    [Fact]
    public void Reports_every_problem_at_once()
    {
        var fields = Fields(
            Field("title", FieldType.Text, required: true),
            Field("views", FieldType.Number));

        var errors = ContentItemValidator.Validate(
            fields,
            Json("""{ "views": "lots", "extra": 1 }"""));

        // All three, so an editor fixes the form in one pass rather than one error per save.
        Assert.Equal(
            [
                "'title' is required.",
                "'views' must be a valid Number.",
                "'extra' is not a field on this content type."
            ],
            errors);
    }

    [Fact]
    public void An_empty_schema_accepts_only_an_empty_object()
    {
        Assert.Empty(ContentItemValidator.Validate([], Json("{}")));
        Assert.Equal(
            ["'anything' is not a field on this content type."],
            ContentItemValidator.Validate([], Json("""{ "anything": 1 }""")));
    }
}
