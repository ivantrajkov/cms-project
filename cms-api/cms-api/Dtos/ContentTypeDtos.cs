namespace cms_api.Dtos;

public record FieldDefinitionDto(string Name, string Type, bool Required);

/// <summary>Lightweight projection returned by the list endpoint.</summary>
public record ContentTypeSummaryDto(Guid Id, string Name, string Slug);

/// <summary>Full content type payload, including its field schema.</summary>
public record ContentTypeDto(Guid Id, string Name, string Slug, List<FieldDefinitionDto> Fields);

/// <summary>Incoming payload for create-or-update (upsert keyed on slug).</summary>
public record SaveContentTypeRequest(string Name, string Slug, List<FieldDefinitionDto> Fields);
