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
[Route("api/content-types")]
public class ContentTypesController(AppDbContext db) : ControllerBase
{
    /// <summary>
    /// GET /api/content-types — list all content types (Id, Name, Slug only).
    /// Anonymous: the public renderer needs the list of types to resolve a Content List block.
    /// </summary>
    [AllowAnonymous]
    [HttpGet]
    public async Task<ActionResult<IEnumerable<ContentTypeSummaryDto>>> GetAll()
    {
        var types = await db.ContentTypes
            .OrderBy(t => t.Name)
            .Select(t => new ContentTypeSummaryDto(t.Id, t.Name, t.Slug))
            .ToListAsync();

        return Ok(types);
    }

    /// <summary>
    /// GET /api/content-types/{slug} — full content type including its field schema.
    /// Anonymous: the public renderer reads the schema to locate a type's Layout field
    /// and to know which fields to draw on a card.
    /// </summary>
    [AllowAnonymous]
    [HttpGet("{slug}")]
    public async Task<ActionResult<ContentTypeDto>> GetBySlug(string slug)
    {
        var type = await db.ContentTypes.AsNoTracking().FirstOrDefaultAsync(t => t.Slug == slug);

        if (type is null)
            return NotFound();

        return Ok(ToDto(type));
    }

    /// <summary>
    /// POST /api/content-types — create or update a content type (upsert keyed on slug).
    /// Admin only: a schema change affects every existing item of the type.
    /// </summary>
    [Authorize(Roles = Roles.Admin)]
    [HttpPost]
    public async Task<ActionResult<ContentTypeDto>> Save(SaveContentTypeRequest request)
    {
        if (!Slug.IsValid(request.Slug))
            return BadRequest($"Slug {Slug.Requirement}.");

        if (string.IsNullOrWhiteSpace(request.Name))
            return BadRequest("Name is required.");

        var requestedFields = request.Fields ?? [];

        if (requestedFields.Any(f => string.IsNullOrWhiteSpace(f.Name)))
            return BadRequest("Every field must have a name.");

        var duplicate = requestedFields
            .GroupBy(f => f.Name, StringComparer.OrdinalIgnoreCase)
            .FirstOrDefault(g => g.Count() > 1);

        if (duplicate is not null)
            return BadRequest($"Duplicate field name '{duplicate.Key}'.");

        List<FieldDefinition> fields;
        try
        {
            fields = requestedFields.Select(f => new FieldDefinition
            {
                Name = f.Name,
                Type = Enum.Parse<FieldType>(f.Type, ignoreCase: true),
                Required = f.Required
            }).ToList();
        }
        catch (ArgumentException)
        {
            var validTypes = string.Join(", ", Enum.GetNames<FieldType>());
            return BadRequest($"Field type must be one of: {validTypes}.");
        }

        var type = await db.ContentTypes.FirstOrDefaultAsync(t => t.Slug == request.Slug);

        if (type is null)
        {
            type = new ContentType
            {
                Id = Guid.NewGuid(),
                Name = request.Name,
                Slug = request.Slug,
                FieldsSchemaJson = JsonSerializer.Serialize(fields)
            };
            db.ContentTypes.Add(type);
        }
        else
        {
            type.Name = request.Name;
            type.FieldsSchemaJson = JsonSerializer.Serialize(fields);
        }

        await db.SaveChangesAsync();

        return Ok(ToDto(type));
    }

    /// <summary>DELETE /api/content-types/{slug} — refuses if any items still reference this type.</summary>
    [Authorize(Roles = Roles.Admin)]
    [HttpDelete("{slug}")]
    public async Task<IActionResult> Delete(string slug)
    {
        var type = await db.ContentTypes.FirstOrDefaultAsync(t => t.Slug == slug);

        if (type is null)
            return NotFound();

        var hasItems = await db.ContentItems.AnyAsync(i => i.ContentTypeId == type.Id);
        if (hasItems)
            return BadRequest("Cannot delete a content type that still has items.");

        db.ContentTypes.Remove(type);
        await db.SaveChangesAsync();

        return NoContent();
    }

    private static ContentTypeDto ToDto(ContentType type)
    {
        var fields = JsonSerializer.Deserialize<List<FieldDefinition>>(type.FieldsSchemaJson) ?? [];
        var fieldDtos = fields.Select(f => new FieldDefinitionDto(f.Name, f.Type.ToString(), f.Required)).ToList();
        return new ContentTypeDto(type.Id, type.Name, type.Slug, fieldDtos);
    }
}
