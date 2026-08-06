namespace cms_api.Models;

public enum ContentItemStatus
{
    Draft,
    Published
}

/// <summary>
/// An instance of a <see cref="ContentType"/>. <see cref="DataJson"/> holds the
/// field values as a JSON object matching the parent type's schema, kept as an
/// opaque string end-to-end the same way <c>Page.LayoutData</c> used to be.
/// </summary>
public class ContentItem
{
    public Guid Id { get; set; }

    public Guid ContentTypeId { get; set; }

    public ContentType? ContentType { get; set; }

    /// <summary>URL-friendly unique identifier, unique within its content type.</summary>
    public string Slug { get; set; } = string.Empty;

    public string DataJson { get; set; } = "{}";

    public ContentItemStatus Status { get; set; } = ContentItemStatus.Draft;

    public DateTime CreatedAt { get; set; }

    public DateTime UpdatedAt { get; set; }
}
