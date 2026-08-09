using cms_api.Data;
using cms_api.Dtos;
using cms_api.Models;
using cms_api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace cms_api.Controllers;

/// <summary>
/// The media library. Uploading happens at <c>POST /api/upload</c>; this manages what was
/// uploaded.
///
/// Reads are anonymous: an Image field stores an asset id, so the public renderer has to be
/// able to resolve that id into a URL and alt text, and the files themselves are already
/// served publicly from <c>wwwroot/uploads</c>. The trade-off is that the media inventory is
/// publicly listable.
/// </summary>
[ApiController]
[Route("api/media")]
public class MediaController(
    AppDbContext db,
    IWebHostEnvironment env,
    ReferenceFinder referenceFinder) : ControllerBase
{
    /// <summary>GET /api/media — newest first.</summary>
    [AllowAnonymous]
    [HttpGet]
    public async Task<ActionResult<IEnumerable<MediaAssetDto>>> GetAll()
    {
        var assets = await db.MediaAssets
            .AsNoTracking()
            .OrderByDescending(m => m.UploadedAt)
            .Select(m => ToDto(m))
            .ToListAsync();

        return Ok(assets);
    }

    /// <summary>GET /api/media/{id}</summary>
    [AllowAnonymous]
    [HttpGet("{id:guid}")]
    public async Task<ActionResult<MediaAssetDto>> GetById(Guid id)
    {
        var asset = await db.MediaAssets.AsNoTracking().FirstOrDefaultAsync(m => m.Id == id);

        if (asset is null)
            return NotFound();

        return Ok(ToDto(asset));
    }

    /// <summary>POST /api/media/{id} — update the asset's alt text.</summary>
    [Authorize(Roles = Roles.ContentAuthors)]
    [HttpPost("{id:guid}")]
    public async Task<ActionResult<MediaAssetDto>> Update(Guid id, UpdateMediaRequest request)
    {
        var asset = await db.MediaAssets.FirstOrDefaultAsync(m => m.Id == id);

        if (asset is null)
            return NotFound();

        asset.AltText = request.AltText?.Trim() ?? string.Empty;
        await db.SaveChangesAsync();

        return Ok(ToDto(asset));
    }

    /// <summary>
    /// DELETE /api/media/{id} — removes the record and the file on disk. Refused while any
    /// content item's Image field still points at it, so pages cannot be left with broken
    /// images.
    /// </summary>
    [Authorize(Roles = Roles.ContentAuthors)]
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var asset = await db.MediaAssets.FirstOrDefaultAsync(m => m.Id == id);

        if (asset is null)
            return NotFound();

        var referrers = await referenceFinder.FindReferrersToMediaAsync(asset.Id);
        if (referrers.Count > 0)
            return BadRequest($"Cannot delete: used by {string.Join(", ", referrers)}.");

        // Remove the row first; if the file is already gone the record should still go.
        db.MediaAssets.Remove(asset);
        await db.SaveChangesAsync();

        var webRoot = env.WebRootPath ?? Path.Combine(env.ContentRootPath, "wwwroot");
        var path = Path.Combine(webRoot, "uploads", asset.FileName);

        if (System.IO.File.Exists(path))
            System.IO.File.Delete(path);

        return NoContent();
    }

    private static MediaAssetDto ToDto(MediaAsset asset) => new(
        asset.Id,
        asset.FileName,
        asset.OriginalFileName,
        asset.Url,
        asset.ContentType,
        asset.SizeBytes,
        asset.AltText,
        asset.UploadedAt);
}
