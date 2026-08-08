using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using cms_api.Models;
using Microsoft.IdentityModel.Tokens;

namespace cms_api.Services;

/// <summary>Strongly-typed <c>Jwt</c> configuration section.</summary>
public class JwtOptions
{
    public const string SectionName = "Jwt";

    /// <summary>HS256 requires at least 256 bits of key material.</summary>
    public const int MinimumKeyBytes = 32;

    public string Issuer { get; set; } = string.Empty;
    public string Audience { get; set; } = string.Empty;
    public string Key { get; set; } = string.Empty;
    public int ExpiryMinutes { get; set; } = 120;

    /// <summary>
    /// Throws when the signing key is absent or too short. Called at startup so a
    /// misconfigured deployment fails immediately instead of silently issuing tokens
    /// signed with a weak or empty key.
    /// </summary>
    public void Validate()
    {
        if (string.IsNullOrWhiteSpace(Issuer) || string.IsNullOrWhiteSpace(Audience))
            throw new InvalidOperationException("Jwt:Issuer and Jwt:Audience must be configured.");

        if (Encoding.UTF8.GetByteCount(Key) < MinimumKeyBytes)
        {
            throw new InvalidOperationException(
                $"Jwt:Key must be at least {MinimumKeyBytes} bytes. Set it via configuration or " +
                "the Jwt__Key environment variable — there is deliberately no default.");
        }
    }

    public SymmetricSecurityKey SigningKey() => new(Encoding.UTF8.GetBytes(Key));
}

/// <summary>Issues the signed bearer tokens returned by <c>POST /api/auth/login</c>.</summary>
public class JwtTokenService(JwtOptions options)
{
    /// <summary>
    /// Claim carrying the user's role. Deliberately the short name rather than
    /// <see cref="ClaimTypes.Role"/>: that constant is a Microsoft schema URI, which
    /// would be written into the token verbatim and leave any non-.NET client (including
    /// our own browser code) decoding a 60-character key. The API is configured with a
    /// matching <c>RoleClaimType</c> so <c>[Authorize(Roles = …)]</c> still resolves it.
    /// </summary>
    public const string RoleClaim = "role";

    /// <summary>Claim carrying the user's id.</summary>
    public const string SubjectClaim = "sub";

    /// <summary>Claim carrying the user's email.</summary>
    public const string EmailClaim = "email";

    public (string Token, DateTime ExpiresAt) CreateToken(User user)
    {
        var expiresAt = DateTime.UtcNow.AddMinutes(options.ExpiryMinutes);

        var claims = new List<Claim>
        {
            new(SubjectClaim, user.Id.ToString()),
            new(EmailClaim, user.Email),
            new(RoleClaim, user.Role.ToString()),
            new(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString())
        };

        var token = new JwtSecurityToken(
            issuer: options.Issuer,
            audience: options.Audience,
            claims: claims,
            expires: expiresAt,
            signingCredentials: new SigningCredentials(options.SigningKey(), SecurityAlgorithms.HmacSha256));

        return (new JwtSecurityTokenHandler().WriteToken(token), expiresAt);
    }
}
