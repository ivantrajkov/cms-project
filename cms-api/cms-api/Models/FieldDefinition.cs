namespace cms_api.Models;

/// <summary>
/// The kinds of value a content type's field can hold.
///
/// IMPORTANT: these are persisted as integers inside <see cref="ContentType.FieldsSchemaJson"/>
/// (the schema is written with a plain <c>JsonSerializer.Serialize</c>, with no string-enum
/// converter). New members must therefore be APPENDED and existing ones never reordered or
/// removed — renumbering would silently change the meaning of every schema already stored.
/// </summary>
public enum FieldType
{
    Text = 0,
    Number = 1,
    Boolean = 2,
    Date = 3,
    Layout = 4,

    /// <summary>Holds the id of a <see cref="MediaAsset"/>.</summary>
    Image = 5,

    /// <summary>
    /// Holds the id of another <see cref="ContentItem"/>, of the content type named by
    /// <see cref="FieldDefinition.TargetType"/>.
    /// </summary>
    Reference = 6
}

/// <summary>
/// One field in a <see cref="ContentType"/>'s schema. Serialized as JSON into
/// <see cref="ContentType.FieldsSchemaJson"/> — there is no dedicated table for these.
/// </summary>
public class FieldDefinition
{
    public string Name { get; set; } = string.Empty;

    public FieldType Type { get; set; }

    public bool Required { get; set; }

    /// <summary>
    /// For a <see cref="FieldType.Reference"/> field, the slug of the content type this
    /// field points at. Null for every other field type.
    /// </summary>
    public string? TargetType { get; set; }
}
