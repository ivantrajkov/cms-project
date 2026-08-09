namespace cms_api.Models;

/// <summary>
/// A file uploaded through the CMS. Before this existed, uploads were written to
/// <c>wwwroot/uploads</c> and the URL handed straight back, so nothing could list,
/// caption, reuse or delete them. Content items reference an asset by <see cref="Id"/>
/// rather than embedding its URL, which is what makes captions and delete guards possible.
/// </summary>
public class MediaAsset
{
    public Guid Id { get; set; }

    /// <summary>Generated name on disk, e.g. <c>4f40035b1e3d444ab579f371029445dc.png</c>.</summary>
    public string FileName { get; set; } = string.Empty;

    /// <summary>Name the file had when it was uploaded, kept so the library is browsable.</summary>
    public string OriginalFileName { get; set; } = string.Empty;

    /// <summary>Absolute URL the file is served from.</summary>
    public string Url { get; set; } = string.Empty;

    /// <summary>MIME type, e.g. <c>image/png</c>.</summary>
    public string ContentType { get; set; } = string.Empty;

    public long SizeBytes { get; set; }

    /// <summary>Alternative text for accessibility; edited from the media library.</summary>
    public string AltText { get; set; } = string.Empty;

    public DateTime UploadedAt { get; set; }
}
