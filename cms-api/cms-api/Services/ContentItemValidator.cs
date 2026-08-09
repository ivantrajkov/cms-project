using System.Text.Json;
using cms_api.Models;

namespace cms_api.Services;

/// <summary>
/// Validates a <see cref="ContentItem"/>'s <c>DataJson</c> payload against its
/// parent <see cref="ContentType"/>'s field schema — required fields must be
/// present, and each present field's JSON value must match its declared type.
///
/// This checks <em>shape</em> only and is deliberately a pure function with no database
/// access: whether an Image or Reference id actually exists is a separate question,
/// answered by <see cref="ReferenceValidator"/>.
/// </summary>
public static class ContentItemValidator
{
    public static List<string> Validate(List<FieldDefinition> fields, JsonElement data)
    {
        var errors = new List<string>();

        if (data.ValueKind != JsonValueKind.Object)
        {
            errors.Add("Data must be a JSON object.");
            return errors;
        }

        foreach (var field in fields)
        {
            var present = data.TryGetProperty(field.Name, out var value)
                          && value.ValueKind != JsonValueKind.Null;

            // A required field holding only whitespace is empty in every sense that
            // matters to an editor, so treat it the same as an absent one.
            if (present && value.ValueKind == JsonValueKind.String && field.Required
                && string.IsNullOrWhiteSpace(value.GetString()))
            {
                present = false;
            }

            if (!present)
            {
                if (field.Required)
                    errors.Add($"'{field.Name}' is required.");
                continue;
            }

            if (!MatchesType(field.Type, value))
                errors.Add($"'{field.Name}' must be a valid {field.Type}.");
        }

        // Reject anything not in the schema. Silently accepting unknown properties would
        // let a typo'd field name persist as data no reader ever looks at.
        var known = fields.Select(f => f.Name).ToHashSet(StringComparer.Ordinal);
        foreach (var property in data.EnumerateObject())
        {
            if (!known.Contains(property.Name))
                errors.Add($"'{property.Name}' is not a field on this content type.");
        }

        return errors;
    }

    private static bool MatchesType(FieldType type, JsonElement value) => type switch
    {
        FieldType.Text => value.ValueKind == JsonValueKind.String,
        FieldType.Number => value.ValueKind == JsonValueKind.Number,
        FieldType.Boolean => value.ValueKind is JsonValueKind.True or JsonValueKind.False,
        FieldType.Date => value.ValueKind == JsonValueKind.String && DateTime.TryParse(value.GetString(), out _),
        FieldType.Layout => value.ValueKind == JsonValueKind.Object,
        // Both store an id; that the target exists is checked separately against the database.
        FieldType.Image or FieldType.Reference => IsGuid(value),
        _ => false
    };

    private static bool IsGuid(JsonElement value) =>
        value.ValueKind == JsonValueKind.String && Guid.TryParse(value.GetString(), out _);
}
