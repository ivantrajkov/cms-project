namespace cms_api.Dtos;

/// <summary><c>TargetType</c> is the referenced content type's slug; null unless Type is Reference.</summary>
public record FieldDefinitionDto(string Name, string Type, bool Required, string? TargetType = null);

/// <summary>Lightweight projection returned by the list endpoint.</summary>
public record ContentTypeSummaryDto(Guid Id, string Name, string Slug);

/// <summary>Full content type payload, including its field schema.</summary>
public record ContentTypeDto(Guid Id, string Name, string Slug, List<FieldDefinitionDto> Fields);

/// <summary>Incoming payload for create-or-update (upsert keyed on slug).</summary>
public record SaveContentTypeRequest(string Name, string Slug, List<FieldDefinitionDto> Fields);
