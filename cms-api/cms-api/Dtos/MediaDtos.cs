namespace cms_api.Dtos;

public record MediaAssetDto(
    Guid Id,
    string FileName,
    string OriginalFileName,
    string Url,
    string ContentType,
    long SizeBytes,
    string AltText,
    DateTime UploadedAt);

/// <summary>Alt text is the only field an editor can change after upload.</summary>
public record UpdateMediaRequest(string AltText);
