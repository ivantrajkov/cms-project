using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using cms_api.Dtos;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;

namespace cms_api.Tests.Integration;

/// <summary>
/// Uploads and the media library. An upload writes into the directory the application
/// serves publicly, so who may call it — and what it accepts — is the security-relevant
/// part; the delete guard is what keeps published pages from losing their images.
/// </summary>
public class MediaEndpointsTests(CmsApiFactory factory) : IClassFixture<CmsApiFactory>
{
    /// <summary>A one-pixel PNG, enough to be a real file without embedding a fixture.</summary>
    private static readonly byte[] PngBytes = Convert.FromBase64String(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==");

    private static MultipartFormDataContent FileContent(
        byte[] bytes, string contentType = "image/png", string fileName = "pixel.png")
    {
        var file = new ByteArrayContent(bytes);
        file.Headers.ContentType = new MediaTypeHeaderValue(contentType);

        // The field name must be "file" — that is the action parameter it binds to.
        return new MultipartFormDataContent { { file, "file", fileName } };
    }

    private async Task<MediaAssetDto> UploadAsync(HttpClient client)
    {
        var response = await client.PostAsync("/api/upload", FileContent(PngBytes));
        response.EnsureSuccessStatusCode();

        var upload = await response.Content.ReadFromJsonAsync<UploadResultDto>();
        return (await client.GetFromJsonAsync<MediaAssetDto>($"/api/media/{upload!.Id}"))!;
    }

    /// <summary>Mirrors <c>UploadController.UploadResult</c>; the tests only need these fields.</summary>
    private record UploadResultDto(string Url, Guid Id, string OriginalFileName, long SizeBytes);

    private string UploadsDirectory()
    {
        using var scope = factory.Services.CreateScope();
        var env = scope.ServiceProvider.GetRequiredService<IWebHostEnvironment>();
        return Path.Combine(env.WebRootPath, "uploads");
    }

    [Fact]
    public void Uploads_are_written_outside_the_repository()
    {
        // If this ever fails, a test run is dropping files into the project's wwwroot.
        Assert.StartsWith(CmsApiFactory.WebRootPath, UploadsDirectory(), StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task An_anonymous_caller_cannot_upload()
    {
        var response = await factory.CreateClient().PostAsync("/api/upload", FileContent(PngBytes));

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task A_viewer_cannot_upload()
    {
        var viewer = await factory.CreateClientForNewUserAsync("Viewer");

        var response = await viewer.PostAsync("/api/upload", FileContent(PngBytes));

        // An open upload endpoint lets anyone write files into the served directory.
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task An_editor_can_upload_and_the_file_lands_on_disk()
    {
        var editor = await factory.CreateClientForNewUserAsync("Editor");

        var asset = await UploadAsync(editor);

        Assert.Equal("image/png", asset.ContentType);
        Assert.Equal("pixel.png", asset.OriginalFileName);
        Assert.Equal(PngBytes.Length, asset.SizeBytes);
        Assert.EndsWith(".png", asset.FileName);
        Assert.Contains($"/uploads/{asset.FileName}", asset.Url);

        Assert.True(File.Exists(Path.Combine(UploadsDirectory(), asset.FileName)));
    }

    [Fact]
    public async Task The_stored_name_is_generated_rather_than_taken_from_the_client()
    {
        var admin = await factory.CreateAdminClientAsync();

        // A client-controlled name is a path-traversal waiting to happen; only the original
        // name is kept, and only as a label.
        var response = await admin.PostAsync(
            "/api/upload", FileContent(PngBytes, fileName: "../../evil.png"));
        response.EnsureSuccessStatusCode();

        var upload = await response.Content.ReadFromJsonAsync<UploadResultDto>();
        var asset = await admin.GetFromJsonAsync<MediaAssetDto>($"/api/media/{upload!.Id}");

        Assert.Equal("evil.png", asset!.OriginalFileName);
        Assert.DoesNotContain("..", asset.FileName);
        Assert.DoesNotContain("/", asset.FileName);
        Assert.True(File.Exists(Path.Combine(UploadsDirectory(), asset.FileName)));
    }

    [Fact]
    public async Task An_unsupported_file_type_is_rejected()
    {
        var admin = await factory.CreateAdminClientAsync();

        var response = await admin.PostAsync(
            "/api/upload", FileContent("#!/bin/sh"u8.ToArray(), "application/x-sh", "script.sh"));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("Unsupported file type", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task An_empty_file_is_rejected()
    {
        var admin = await factory.CreateAdminClientAsync();

        var response = await admin.PostAsync("/api/upload", FileContent([]));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("No file was uploaded", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task The_library_is_readable_anonymously()
    {
        var admin = await factory.CreateAdminClientAsync();
        var asset = await UploadAsync(admin);

        var anonymous = factory.CreateClient();

        // An Image field stores an id, so the public renderer must be able to resolve it.
        var listed = await anonymous.GetFromJsonAsync<List<MediaAssetDto>>("/api/media");
        Assert.Contains(listed!, a => a.Id == asset.Id);

        var single = await anonymous.GetFromJsonAsync<MediaAssetDto>($"/api/media/{asset.Id}");
        Assert.Equal(asset.Url, single!.Url);
    }

    [Fact]
    public async Task An_unknown_asset_is_404()
    {
        var response = await factory.CreateClient().GetAsync($"/api/media/{Guid.NewGuid()}");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Alt_text_can_be_set_by_an_editor()
    {
        var admin = await factory.CreateAdminClientAsync();
        var asset = await UploadAsync(admin);

        var editor = await factory.CreateClientForNewUserAsync("Editor");

        var updated = await editor.PostAsJsonAsync($"/api/media/{asset.Id}", new { altText = "  A single pixel  " });
        Assert.Equal(HttpStatusCode.OK, updated.StatusCode);

        var body = await updated.Content.ReadFromJsonAsync<MediaAssetDto>();
        Assert.Equal("A single pixel", body!.AltText);
    }

    [Fact]
    public async Task A_viewer_cannot_change_alt_text()
    {
        var admin = await factory.CreateAdminClientAsync();
        var asset = await UploadAsync(admin);

        var viewer = await factory.CreateClientForNewUserAsync("Viewer");

        var response = await viewer.PostAsJsonAsync($"/api/media/{asset.Id}", new { altText = "nope" });

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Deleting_removes_both_the_record_and_the_file()
    {
        var admin = await factory.CreateAdminClientAsync();
        var asset = await UploadAsync(admin);
        var path = Path.Combine(UploadsDirectory(), asset.FileName);

        Assert.True(File.Exists(path));

        var deleted = await admin.DeleteAsync($"/api/media/{asset.Id}");
        Assert.Equal(HttpStatusCode.NoContent, deleted.StatusCode);

        Assert.False(File.Exists(path));

        var lookup = await admin.GetAsync($"/api/media/{asset.Id}");
        Assert.Equal(HttpStatusCode.NotFound, lookup.StatusCode);
    }

    [Fact]
    public async Task Deleting_an_asset_a_content_item_uses_is_refused()
    {
        var admin = await factory.CreateAdminClientAsync();
        var asset = await UploadAsync(admin);

        (await admin.PostAsJsonAsync("/api/content-types", new
        {
            name = "Illustrated",
            slug = "illustrated",
            fields = new[] { new { name = "hero", type = "Image", required = false, targetType = (string?)null } }
        })).EnsureSuccessStatusCode();

        (await admin.PostAsJsonAsync("/api/content-types/illustrated/items", new
        {
            slug = "with-a-picture",
            status = "Published",
            dataJson = $$"""{ "hero": "{{asset.Id}}" }"""
        })).EnsureSuccessStatusCode();

        var response = await admin.DeleteAsync($"/api/media/{asset.Id}");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("illustrated/with-a-picture", await response.Content.ReadAsStringAsync());

        // Still there, so the published page keeps its image.
        Assert.True(File.Exists(Path.Combine(UploadsDirectory(), asset.FileName)));
    }

    [Fact]
    public async Task An_uploaded_file_is_served_to_anonymous_visitors()
    {
        var admin = await factory.CreateAdminClientAsync();
        var asset = await UploadAsync(admin);

        // Published pages reference these URLs directly, so they must load without a token.
        var response = await factory.CreateClient().GetAsync($"/uploads/{asset.FileName}");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(PngBytes, await response.Content.ReadAsByteArrayAsync());
    }
}
