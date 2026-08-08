using cms_api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace cms_api.Controllers;

/// <summary>
/// Image uploads. Restricted to content authors — an open upload endpoint lets anyone
/// write arbitrary files into the served <c>wwwroot</c> directory.
/// </summary>
[ApiController]
[Route("api/upload")]
[Authorize(Roles = Roles.ContentAuthors)]
public class UploadController(IWebHostEnvironment env) : ControllerBase
{
    private static readonly Dictionary<string, string> AllowedTypes = new()
    {
        ["image/jpeg"] = ".jpg",
        ["image/png"] = ".png",
        ["image/gif"] = ".gif",
        ["image/webp"] = ".webp",
        ["image/svg+xml"] = ".svg",
    };

    private const long MaxBytes = 5 * 1024 * 1024; // 5 MB

    /// <summary>
    /// POST /api/upload — accepts a single image (multipart form field "file"),
    /// stores it under wwwroot/uploads, and returns its absolute URL.
    /// </summary>
    [HttpPost]
    [RequestSizeLimit(MaxBytes)]
    public async Task<ActionResult<UploadResult>> Upload(IFormFile file)
    {
        if (file is null || file.Length == 0)
            return BadRequest("No file was uploaded.");

        if (file.Length > MaxBytes)
            return BadRequest("File exceeds the 5 MB limit.");

        if (!AllowedTypes.TryGetValue(file.ContentType, out var extension))
            return BadRequest("Unsupported file type. Allowed: jpg, png, gif, webp, svg.");

        // wwwroot may not exist yet in a fresh project — create it on demand.
        var webRoot = env.WebRootPath ?? Path.Combine(env.ContentRootPath, "wwwroot");
        var uploadsDir = Path.Combine(webRoot, "uploads");
        Directory.CreateDirectory(uploadsDir);

        var fileName = $"{Guid.NewGuid():N}{extension}";
        var absolutePath = Path.Combine(uploadsDir, fileName);

        await using (var stream = System.IO.File.Create(absolutePath))
        {
            await file.CopyToAsync(stream);
        }

        // Absolute URL so both the editor (5173) and the live page can load it.
        var url = $"{Request.Scheme}://{Request.Host}/uploads/{fileName}";
        return Ok(new UploadResult(url));
    }
}

public record UploadResult(string Url);
