using System.Text.Json;
using cms_api.Data;
using cms_api.Models;
using Microsoft.EntityFrameworkCore;

namespace cms_api.Services;

/// <summary>
/// The database half of content validation: an <see cref="FieldType.Image"/> value must
/// name a real <see cref="MediaAsset"/>, and a <see cref="FieldType.Reference"/> value must
/// name a real <see cref="ContentItem"/> <em>of the declared target type</em> — pointing a
/// blog post's author field at a product is exactly the kind of error a schema should catch.
///
/// Kept separate from <see cref="ContentItemValidator"/> so that the shape rules stay a pure,
/// easily testable function and only this class needs a database.
/// </summary>
public class ReferenceValidator(AppDbContext db)
{
    public async Task<List<string>> ValidateAsync(List<FieldDefinition> fields, JsonElement data)
    {
        var errors = new List<string>();

        foreach (var field in fields)
        {
            if (field.Type is not (FieldType.Image or FieldType.Reference))
                continue;

            if (!data.TryGetProperty(field.Name, out var value) || value.ValueKind != JsonValueKind.String)
                continue; // absent or wrong shape — already reported by ContentItemValidator

            if (!Guid.TryParse(value.GetString(), out var id))
                continue;

            if (field.Type == FieldType.Image)
            {
                if (!await db.MediaAssets.AnyAsync(m => m.Id == id))
                    errors.Add($"'{field.Name}' refers to a media asset that does not exist.");

                continue;
            }

            var targetType = await db.ContentTypes
                .AsNoTracking()
                .FirstOrDefaultAsync(t => t.Slug == field.TargetType);

            if (targetType is null)
            {
                errors.Add($"'{field.Name}' targets unknown content type '{field.TargetType}'.");
                continue;
            }

            var exists = await db.ContentItems
                .AnyAsync(i => i.Id == id && i.ContentTypeId == targetType.Id);

            if (!exists)
                errors.Add($"'{field.Name}' must refer to an existing '{field.TargetType}' item.");
        }

        return errors;
    }
}
