namespace cms_api.Models;

/// <summary>
/// A single CMS page. The visual layout produced by the Puck editor is stored
/// verbatim as a stringified JSON document in <see cref="LayoutData"/> rather
/// than as rendered HTML, which keeps the CMS "headless".
/// </summary>
public class Page
{
    public Guid Id { get; set; }

    public string Title { get; set; } = string.Empty;

    /// <summary>URL-friendly unique identifier used to look up the page.</summary>
    public string Slug { get; set; } = string.Empty;

    /// <summary>The stringified JSON emitted by Puck's <c>onPublish</c> event.</summary>
    public string LayoutData { get; set; } = "{}";
}
