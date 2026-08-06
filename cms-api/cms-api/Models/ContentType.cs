namespace cms_api.Models;

/// <summary>
/// Defines a kind of content (e.g. "Page", "Blog Post") as a set of named,
/// typed fields. <see cref="ContentItem"/> rows are validated against this
/// schema on save rather than each content type having its own table.
/// </summary>
public class ContentType
{
    public Guid Id { get; set; }

    public string Name { get; set; } = string.Empty;

    /// <summary>URL-friendly unique identifier used to look up the type.</summary>
    public string Slug { get; set; } = string.Empty;

    /// <summary>Serialized <see cref="List{FieldDefinition}"/> describing this type's schema.</summary>
    public string FieldsSchemaJson { get; set; } = "[]";
}
