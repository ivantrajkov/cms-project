namespace cms_api.Dtos;

/// <summary>Lightweight projection returned by the list endpoint.</summary>
public record PageSummaryDto(Guid Id, string Title, string Slug);

/// <summary>Full page payload returned when viewing/editing a single page.</summary>
public record PageDto(Guid Id, string Title, string Slug, string LayoutData);

/// <summary>
/// Incoming payload for create-or-update. <see cref="LayoutData"/> is validated
/// as well-formed JSON before it is persisted.
/// </summary>
public record SavePageRequest(string Title, string Slug, string LayoutData);
