using System.IdentityModel.Tokens.Jwt;
using System.Text;
using cms_api.Models;
using cms_api.Services;
using Microsoft.IdentityModel.Tokens;

namespace cms_api.Tests.Unit;

/// <summary>
/// <see cref="JwtOptions.Validate"/> is what stops the application starting with a key
/// nobody could trust, so these are the tests standing between a typo in configuration
/// and forgeable tokens.
/// </summary>
public class JwtOptionsTests
{
    private static JwtOptions Valid() => new()
    {
        Issuer = "cms-api",
        Audience = "cms-frontend",
        Key = new string('k', JwtOptions.MinimumKeyBytes)
    };

    [Fact]
    public void Accepts_a_fully_configured_section()
    {
        Valid().Validate();
    }

    [Fact]
    public void Rejects_a_missing_issuer()
    {
        var options = Valid();
        options.Issuer = "";

        var error = Assert.Throws<InvalidOperationException>(options.Validate);
        Assert.Contains("Jwt:Issuer", error.Message);
    }

    [Fact]
    public void Rejects_a_missing_audience()
    {
        var options = Valid();
        options.Audience = "   ";

        Assert.Throws<InvalidOperationException>(options.Validate);
    }

    [Fact]
    public void Rejects_a_missing_key()
    {
        var options = Valid();
        options.Key = "";

        var error = Assert.Throws<InvalidOperationException>(options.Validate);
        Assert.Contains("Jwt:Key", error.Message);
    }

    [Fact]
    public void Rejects_a_key_one_byte_short_of_the_minimum()
    {
        var options = Valid();
        options.Key = new string('k', JwtOptions.MinimumKeyBytes - 1);

        Assert.Throws<InvalidOperationException>(options.Validate);
    }

    [Fact]
    public void Measures_the_key_in_bytes_rather_than_characters()
    {
        var options = Valid();
        // 16 characters, but 32 bytes once encoded — HS256 cares about the bytes.
        options.Key = new string('é', 16);

        Assert.Equal(JwtOptions.MinimumKeyBytes, Encoding.UTF8.GetByteCount(options.Key));
        options.Validate();
    }

    [Fact]
    public void Signing_key_carries_the_configured_bytes()
    {
        var options = Valid();

        Assert.Equal(Encoding.UTF8.GetBytes(options.Key), options.SigningKey().Key);
    }
}

/// <summary>
/// The token's contents are a contract with two readers: <c>[Authorize]</c> on the server
/// and the browser code that decodes the same token to decide which UI to show.
/// </summary>
public class JwtTokenServiceTests
{
    private static readonly JwtOptions Options = new()
    {
        Issuer = "cms-api",
        Audience = "cms-frontend",
        Key = "a-signing-key-that-is-comfortably-long-enough",
        ExpiryMinutes = 90
    };

    private static readonly User TestUser = new()
    {
        Id = Guid.Parse("6f9619ff-8b86-d011-b42d-00c04fc964ff"),
        Email = "editor@cms.local",
        Role = UserRole.Editor
    };

    private static JwtSecurityToken Decode(string token) => new JwtSecurityTokenHandler().ReadJwtToken(token);

    [Fact]
    public void Writes_the_user_into_short_claim_names()
    {
        var (token, _) = new JwtTokenService(Options).CreateToken(TestUser);

        var decoded = Decode(token);

        // Short names, not Microsoft schema URIs: the browser decodes this token too.
        Assert.Equal(TestUser.Id.ToString(), decoded.Claims.Single(c => c.Type == JwtTokenService.SubjectClaim).Value);
        Assert.Equal(TestUser.Email, decoded.Claims.Single(c => c.Type == JwtTokenService.EmailClaim).Value);
        Assert.Equal("Editor", decoded.Claims.Single(c => c.Type == JwtTokenService.RoleClaim).Value);
    }

    [Fact]
    public void Stamps_the_configured_issuer_and_audience()
    {
        var (token, _) = new JwtTokenService(Options).CreateToken(TestUser);

        var decoded = Decode(token);

        Assert.Equal(Options.Issuer, decoded.Issuer);
        Assert.Equal(Options.Audience, Assert.Single(decoded.Audiences));
    }

    [Fact]
    public void Expires_after_the_configured_number_of_minutes()
    {
        var before = DateTime.UtcNow;

        var (_, expiresAt) = new JwtTokenService(Options).CreateToken(TestUser);

        var expected = before.AddMinutes(Options.ExpiryMinutes);
        Assert.InRange(expiresAt, expected.AddSeconds(-5), expected.AddSeconds(5));
    }

    [Fact]
    public void Gives_each_token_its_own_id()
    {
        var service = new JwtTokenService(Options);

        var first = Decode(service.CreateToken(TestUser).Token);
        var second = Decode(service.CreateToken(TestUser).Token);

        Assert.NotEqual(
            first.Claims.Single(c => c.Type == JwtRegisteredClaimNames.Jti).Value,
            second.Claims.Single(c => c.Type == JwtRegisteredClaimNames.Jti).Value);
    }

    [Fact]
    public void Signs_with_the_configured_key()
    {
        var (token, _) = new JwtTokenService(Options).CreateToken(TestUser);

        var parameters = new TokenValidationParameters
        {
            ValidIssuer = Options.Issuer,
            ValidAudience = Options.Audience,
            IssuerSigningKey = Options.SigningKey(),
            RoleClaimType = JwtTokenService.RoleClaim
        };

        // MapInboundClaims = false mirrors the API's own JwtBearer configuration. Left on,
        // the handler rewrites "role" into a Microsoft schema URI, the configured
        // RoleClaimType no longer matches, and every [Authorize(Roles = …)] check fails.
        var handler = new JwtSecurityTokenHandler { MapInboundClaims = false };

        var principal = handler.ValidateToken(token, parameters, out _);

        Assert.True(principal.IsInRole("Editor"));
        Assert.False(principal.IsInRole("Admin"));
    }

    [Fact]
    public void A_token_signed_with_a_different_key_does_not_validate()
    {
        var (token, _) = new JwtTokenService(Options).CreateToken(TestUser);

        var parameters = new TokenValidationParameters
        {
            ValidIssuer = Options.Issuer,
            ValidAudience = Options.Audience,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes("a-completely-different-signing-key-value"))
        };

        Assert.Throws<SecurityTokenSignatureKeyNotFoundException>(
            () => new JwtSecurityTokenHandler().ValidateToken(token, parameters, out _));
    }
}
