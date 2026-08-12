using cms_api.Models;
using cms_api.Services;

namespace cms_api.Tests.Unit;

/// <summary>
/// A content type's schema is stored as a JSON string, so every reader goes through
/// <see cref="ContentSchema"/>. Its contract is that bad data yields an empty schema
/// rather than an exception — a corrupt row must not take down an unrelated request.
/// </summary>
public class ContentSchemaTests
{
    [Fact]
    public void Parses_a_stored_schema()
    {
        // Types are persisted as integers (see the FieldType doc comment), so the numbers
        // here are part of the on-disk contract: 0 = Text, 6 = Reference.
        const string json = """
            [
              { "Name": "title", "Type": 0, "Required": true, "TargetType": null },
              { "Name": "author", "Type": 6, "Required": false, "TargetType": "person" }
            ]
            """;

        var fields = ContentSchema.Parse(json);

        Assert.Equal(2, fields.Count);

        Assert.Equal("title", fields[0].Name);
        Assert.Equal(FieldType.Text, fields[0].Type);
        Assert.True(fields[0].Required);
        Assert.Null(fields[0].TargetType);

        Assert.Equal("author", fields[1].Name);
        Assert.Equal(FieldType.Reference, fields[1].Type);
        Assert.False(fields[1].Required);
        Assert.Equal("person", fields[1].TargetType);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("[]")]
    public void Returns_an_empty_schema_for_an_empty_value(string? json)
    {
        Assert.Empty(ContentSchema.Parse(json));
    }

    [Theory]
    [InlineData("not json at all")]
    [InlineData("{ \"not\": \"an array\" }")]
    [InlineData("[ { \"Name\": ")]
    public void Returns_an_empty_schema_rather_than_throwing_on_bad_json(string json)
    {
        Assert.Empty(ContentSchema.Parse(json));
    }

    [Fact]
    public void Reads_the_schema_off_a_content_type()
    {
        var type = new ContentType
        {
            Name = "Page",
            Slug = "page",
            FieldsSchemaJson = """[{ "Name": "body", "Type": 4, "Required": false }]"""
        };

        var fields = ContentSchema.Parse(type);

        var field = Assert.Single(fields);
        Assert.Equal("body", field.Name);
        Assert.Equal(FieldType.Layout, field.Type);
    }
}
