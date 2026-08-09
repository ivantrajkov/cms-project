using System.Text.Json;
using cms_api.Data;
using cms_api.Models;
using Microsoft.EntityFrameworkCore;

namespace cms_api.Services;

/// <summary>
/// Answers "what still points at this?" so deletes can be refused rather than left to
/// create dangling references.
///
/// References live inside each item's <c>DataJson</c>, which SQLite cannot index for us, so
/// this narrows to the content types whose schema actually declares a matching field and
/// then scans those items in memory. Correct, and bounded by the number of items of the
/// referring types — but still a scan; a production system would maintain a join table.
/// </summary>
public class ReferenceFinder(AppDbContext db)
{
    /// <summary>Items whose Reference field points at <paramref name="itemId"/>, as "type/slug".</summary>
    public Task<List<string>> FindReferrersToItemAsync(Guid itemId, string targetTypeSlug) =>
        FindReferrersAsync(
            itemId,
            field => field.Type == FieldType.Reference && field.TargetType == targetTypeSlug);

    /// <summary>Items whose Image field points at <paramref name="mediaId"/>, as "type/slug".</summary>
    public Task<List<string>> FindReferrersToMediaAsync(Guid mediaId) =>
        FindReferrersAsync(mediaId, field => field.Type == FieldType.Image);

    private async Task<List<string>> FindReferrersAsync(Guid id, Func<FieldDefinition, bool> matches)
    {
        var referrers = new List<string>();
        var target = id.ToString();

        var types = await db.ContentTypes.AsNoTracking().ToListAsync();

        foreach (var type in types)
        {
            var candidateFields = ContentSchema.Parse(type).Where(matches).ToList();
            if (candidateFields.Count == 0)
                continue;

            var items = await db.ContentItems
                .AsNoTracking()
                .Where(i => i.ContentTypeId == type.Id)
                .Select(i => new { i.Slug, i.DataJson })
                .ToListAsync();

            foreach (var item in items)
            {
                JsonDocument document;
                try
                {
                    document = JsonDocument.Parse(item.DataJson);
                }
                catch (JsonException)
                {
                    continue;
                }

                using (document)
                {
                    if (document.RootElement.ValueKind != JsonValueKind.Object)
                        continue;

                    var hit = candidateFields.Any(field =>
                        document.RootElement.TryGetProperty(field.Name, out var value)
                        && value.ValueKind == JsonValueKind.String
                        && string.Equals(value.GetString(), target, StringComparison.OrdinalIgnoreCase));

                    if (hit)
                        referrers.Add($"{type.Slug}/{item.Slug}");
                }
            }
        }

        return referrers;
    }
}
