namespace cms_api.Models;

/// <summary>
/// Access level of a CMS user. The split is deliberate: changing a content type's
/// schema affects every existing item of that type, so it is a structural change
/// reserved for <see cref="Admin"/>, while <see cref="Editor"/> covers day-to-day
/// authoring and <see cref="Viewer"/> is read-only (including unpublished drafts).
/// </summary>
public enum UserRole
{
    Admin,
    Editor,
    Viewer
}

public class User
{
    public Guid Id { get; set; }

    /// <summary>Login identifier; unique, stored lowercase so lookups are case-insensitive.</summary>
    public string Email { get; set; } = string.Empty;

    /// <summary>PBKDF2 hash produced by <c>PasswordHasher&lt;User&gt;</c> — never a plaintext password.</summary>
    public string PasswordHash { get; set; } = string.Empty;

    public UserRole Role { get; set; } = UserRole.Viewer;

    public DateTime CreatedAt { get; set; }
}
