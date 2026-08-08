namespace cms_api.Dtos;

/// <summary>A user as exposed by the API — deliberately without the password hash.</summary>
public record UserDto(Guid Id, string Email, string Role, DateTime CreatedAt);

public record CreateUserRequest(string Email, string Password, string Role);

/// <summary>Role change and/or password reset. A null/blank password leaves it unchanged.</summary>
public record UpdateUserRequest(string Role, string? Password);
