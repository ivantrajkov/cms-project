using System.Text.Json;
using cms_api.Data;
using cms_api.Dtos;
using cms_api.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace cms_api.Controllers;

[ApiController]
[Route("api/pages")]
public class PagesController(AppDbContext db) : ControllerBase
{
    /// <summary>GET /api/pages — list all pages (Id, Title, Slug only).</summary>
    [HttpGet]
    public async Task<ActionResult<IEnumerable<PageSummaryDto>>> GetAll()
    {
        var pages = await db.Pages
            .OrderBy(p => p.Title)
            .Select(p => new PageSummaryDto(p.Id, p.Title, p.Slug))
            .ToListAsync();

        return Ok(pages);
    }

    /// <summary>GET /api/pages/{slug} — full page including the LayoutData JSON.</summary>
    [HttpGet("{slug}")]
    public async Task<ActionResult<PageDto>> GetBySlug(string slug)
    {
        var page = await db.Pages
            .AsNoTracking()
            .FirstOrDefaultAsync(p => p.Slug == slug);

        if (page is null)
            return NotFound();

        return Ok(new PageDto(page.Id, page.Title, page.Slug, page.LayoutData));
    }

    /// <summary>
    /// POST /api/pages — create or update a page (upsert keyed on slug).
    /// Validates that LayoutData is well-formed JSON via System.Text.Json.
    /// </summary>
    [HttpPost]
    public async Task<ActionResult<PageDto>> Save(SavePageRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Slug))
            return BadRequest("Slug is required.");

        if (string.IsNullOrWhiteSpace(request.Title))
            return BadRequest("Title is required.");

        if (!IsValidJson(request.LayoutData))
            return BadRequest("LayoutData must be a valid JSON string.");

        var page = await db.Pages.FirstOrDefaultAsync(p => p.Slug == request.Slug);

        if (page is null)
        {
            // Create
            page = new Page
            {
                Id = Guid.NewGuid(),
                Title = request.Title,
                Slug = request.Slug,
                LayoutData = request.LayoutData
            };
            db.Pages.Add(page);
        }
        else
        {
            // Update
            page.Title = request.Title;
            page.LayoutData = request.LayoutData;
        }

        await db.SaveChangesAsync();

        return Ok(new PageDto(page.Id, page.Title, page.Slug, page.LayoutData));
    }

    private static bool IsValidJson(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
            return false;

        try
        {
            using var _ = JsonDocument.Parse(value);
            return true;
        }
        catch (JsonException)
        {
            return false;
        }
    }
}
