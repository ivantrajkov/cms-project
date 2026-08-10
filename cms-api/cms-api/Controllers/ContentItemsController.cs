using System.Text.Json;
using cms_api.Data;
using cms_api.Dtos;
using cms_api.Models;
using cms_api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace cms_api.Controllers;

[ApiController]
[Route("api/content-types/{typeSlug}/items")]
public class ContentItemsController(
    AppDbContext db,
    ReferenceValidator referenceValidator,
    ReferenceFinder referenceFinder) : ControllerBase
{
    /// <summary>
    /// True when the caller presented a valid token. Unauthenticated callers are the public
    /// website and must only ever observe published content, so draft visibility is decided
    /// here rather than trusted to the client.
    /// </summary>
    private bool CanSeeDrafts => User.Identity?.IsAuthenticated == true;

    /// <summary>
    /// GET /api/content-types/{typeSlug}/items — list items of this type.
    /// <paramref name="status"/> narrows to Draft or Published, <paramref name="limit"/> caps
    /// the count, and <paramref name="includeData"/> adds each item's field values so a caller
    /// rendering the content does not have to fetch every item individually.
    /// Anonymous callers always receive published items only, whatever they ask for.
    /// </summary>
    [AllowAnonymous]
    [HttpGet]
    public async Task<ActionResult<IEnumerable<ContentItemListDto>>> GetAll(
        string typeSlug,
        bool includeData = false,
        string? status = null,
        int? limit = null)
    {
        var type = await db.ContentTypes.AsNoTracking().FirstOrDefaultAsync(t => t.Slug == typeSlug);
        if (type is null)
            return NotFound($"No content type '{typeSlug}'.");

        ContentItemStatus? statusFilter = null;
        if (!string.IsNullOrWhiteSpace(status))
        {
            if (!Enum.TryParse<ContentItemStatus>(status, ignoreCase: true, out var parsed))
                return BadRequest("Status must be 'Draft' or 'Published'.");
            statusFilter = parsed;
        }

        var query = db.ContentItems
            .AsNoTracking()
            .Where(i => i.ContentTypeId == type.Id);

        // Applied on top of any requested filter rather than replacing it, so an anonymous
        // request for drafts correctly yields nothing instead of silently returning
        // published items the caller did not ask for.
        if (!CanSeeDrafts)
            query = query.Where(i => i.Status == ContentItemStatus.Published);

        if (statusFilter is not null)
            query = query.Where(i => i.Status == statusFilter);

        query = query.OrderBy(i => i.Slug);

        if (limit is > 0)
            query = query.Take(limit.Value);

        var items = includeData
            ? await query
                .Select(i => new ContentItemListDto(i.Id, i.Slug, i.Status.ToString(), i.DataJson, i.UpdatedAt))
                .ToListAsync()
            : await query
                .Select(i => new ContentItemListDto(i.Id, i.Slug, i.Status.ToString(), null, i.UpdatedAt))
                .ToListAsync();

        return Ok(items);
    }

    /// <summary>
    /// GET /api/content-types/{typeSlug}/items/{itemSlug} — full item including its DataJson.
    /// A draft requested anonymously returns 404 rather than 403, so the response does not
    /// reveal that unpublished content exists at that slug.
    /// </summary>
    [AllowAnonymous]
    [HttpGet("{itemSlug}")]
    public async Task<ActionResult<ContentItemDto>> GetBySlug(string typeSlug, string itemSlug)
    {
        var type = await db.ContentTypes.AsNoTracking().FirstOrDefaultAsync(t => t.Slug == typeSlug);
        if (type is null)
            return NotFound($"No content type '{typeSlug}'.");

        var item = await db.ContentItems
            .AsNoTracking()
            .FirstOrDefaultAsync(i => i.ContentTypeId == type.Id && i.Slug == itemSlug);

        if (item is null)
            return NotFound();

        if (item.Status != ContentItemStatus.Published && !CanSeeDrafts)
            return NotFound();

        return Ok(ToDto(item));
    }

    /// <summary>
    /// POST /api/content-types/{typeSlug}/items — create or update an item (upsert keyed on slug).
    /// Validates DataJson against the parent content type's field schema.
    /// </summary>
    [Authorize(Roles = Roles.ContentAuthors)]
    [HttpPost]
    public async Task<ActionResult<ContentItemDto>> Save(string typeSlug, SaveContentItemRequest request)
    {
        var type = await db.ContentTypes.FirstOrDefaultAsync(t => t.Slug == typeSlug);
        if (type is null)
            return NotFound($"No content type '{typeSlug}'.");

        if (!Slug.IsValid(request.Slug))
            return BadRequest($"Slug {Slug.Requirement}.");

        if (!Enum.TryParse<ContentItemStatus>(request.Status, ignoreCase: true, out var status))
            return BadRequest("Status must be 'Draft' or 'Published'.");

        if (string.IsNullOrWhiteSpace(request.DataJson))
            return BadRequest("DataJson is required.");

        JsonDocument dataDoc;
        try
        {
            dataDoc = JsonDocument.Parse(request.DataJson);
        }
        catch (JsonException)
        {
            return BadRequest("DataJson must be a valid JSON string.");
        }

        using (dataDoc)
        {
            var fields = ContentSchema.Parse(type);

            // Shape first (types, required, unknown fields), then existence of anything the
            // payload points at. Order matters: resolving ids is pointless if the value is
            // not even a well-formed id.
            var errors = ContentItemValidator.Validate(fields, dataDoc.RootElement);
            if (errors.Count > 0)
                return BadRequest(errors);

            errors = await referenceValidator.ValidateAsync(fields, dataDoc.RootElement);
            if (errors.Count > 0)
                return BadRequest(errors);

            var item = await db.ContentItems
                .FirstOrDefaultAsync(i => i.ContentTypeId == type.Id && i.Slug == request.Slug);

            var now = DateTime.UtcNow;

            if (item is null)
            {
                item = new ContentItem
                {
                    Id = Guid.NewGuid(),
                    ContentTypeId = type.Id,
                    Slug = request.Slug,
                    DataJson = request.DataJson,
                    Status = status,
                    CreatedAt = now,
                    UpdatedAt = now
                };
                db.ContentItems.Add(item);
            }
            else
            {
                item.DataJson = request.DataJson;
                item.Status = status;
                item.UpdatedAt = now;
            }

            await db.SaveChangesAsync();

            return Ok(ToDto(item));
        }
    }

    /// <summary>
    /// DELETE /api/content-types/{typeSlug}/items/{itemSlug} — refused while other items
    /// still reference this one, so a Reference field can never point at a deleted item.
    /// </summary>
    [Authorize(Roles = Roles.ContentAuthors)]
    [HttpDelete("{itemSlug}")]
    public async Task<IActionResult> Delete(string typeSlug, string itemSlug)
    {
        var type = await db.ContentTypes.FirstOrDefaultAsync(t => t.Slug == typeSlug);
        if (type is null)
            return NotFound($"No content type '{typeSlug}'.");

        var item = await db.ContentItems
            .FirstOrDefaultAsync(i => i.ContentTypeId == type.Id && i.Slug == itemSlug);

        if (item is null)
            return NotFound();

        var referrers = await referenceFinder.FindReferrersToItemAsync(item.Id, type.Slug);
        if (referrers.Count > 0)
            return BadRequest($"Cannot delete: referenced by {string.Join(", ", referrers)}.");

        db.ContentItems.Remove(item);
        await db.SaveChangesAsync();

        return NoContent();
    }

    private static ContentItemDto ToDto(ContentItem item) =>
        new(item.Id, item.Slug, item.Status.ToString(), item.DataJson, item.UpdatedAt);
}
