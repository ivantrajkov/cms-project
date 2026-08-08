namespace cms_api.Dtos;

public record LoginRequest(string Email, string Password);

/// <summary>Issued token plus the identity details the frontend needs to gate its UI.</summary>
public record LoginResponse(string Token, string Email, string Role, DateTime ExpiresAt);

/// <summary>Identity of the caller, resolved from their token.</summary>
public record CurrentUserDto(Guid Id, string Email, string Role);
