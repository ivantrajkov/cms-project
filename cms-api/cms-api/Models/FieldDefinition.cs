namespace cms_api.Models;

public enum FieldType
{
    Text,
    Number,
    Boolean,
    Date,
    Layout
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
}
