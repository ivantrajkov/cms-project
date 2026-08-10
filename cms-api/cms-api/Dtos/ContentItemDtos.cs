namespace cms_api.Dtos;

/// <summary>
/// Projection returned by the list endpoint. <see cref="DataJson"/> is null unless the
/// caller asked for it — admin listings only need slugs and statuses, and page layouts
/// are large enough that sending them by default would be wasteful.
/// <see cref="UpdatedAt"/> is included because an editor scanning a list wants to know
/// what changed recently, which is not derivable from anything else in the payload.
/// </summary>
public record ContentItemListDto(Guid Id, string Slug, string Status, string? DataJson, DateTime UpdatedAt);

/// <summary>Full item payload returned when viewing/editing a single item.</summary>
public record ContentItemDto(Guid Id, string Slug, string Status, string DataJson, DateTime UpdatedAt);

/// <summary>Incoming payload for create-or-update (upsert keyed on slug).</summary>
public record SaveContentItemRequest(string Slug, string Status, string DataJson);
