using System.Text.Json;
using cms_api.Models;

namespace cms_api.Services;

/// <summary>
/// Reads a <see cref="ContentType"/>'s field schema out of its stored JSON. Several call
/// sites need this — rendering DTOs, validating items, and checking what references what —
/// so the deserialization (and its empty-on-garbage fallback) lives in one place.
/// </summary>
public static class ContentSchema
{
    public static List<FieldDefinition> Parse(string? fieldsSchemaJson)
    {
        if (string.IsNullOrWhiteSpace(fieldsSchemaJson))
            return [];

        try
        {
            return JsonSerializer.Deserialize<List<FieldDefinition>>(fieldsSchemaJson) ?? [];
        }
        catch (JsonException)
        {
            return [];
        }
    }

    public static List<FieldDefinition> Parse(ContentType type) => Parse(type.FieldsSchemaJson);
}
