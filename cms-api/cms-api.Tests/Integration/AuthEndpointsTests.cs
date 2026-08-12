using System.Net;
using System.Net.Http.Json;
using cms_api.Dtos;

namespace cms_api.Tests.Integration;

/// <summary>
/// Sign-in and the identity endpoint, plus the property the whole authorization model
/// rests on: an endpoint that opts out of nothing is closed to anonymous callers.
/// </summary>
public class AuthEndpointsTests(CmsApiFactory factory) : IClassFixture<CmsApiFactory>
{
    [Fact]
    public async Task Login_with_seeded_admin_returns_a_token()
    {
        var client = factory.CreateClient();

        var response = await client.PostAsJsonAsync("/api/auth/login", new
        {
            email = CmsApiFactory.AdminEmail,
            password = CmsApiFactory.AdminPassword
        });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var body = await response.Content.ReadFromJsonAsync<LoginResponse>();

        Assert.NotNull(body);
        Assert.False(string.IsNullOrWhiteSpace(body.Token));
        Assert.Equal(CmsApiFactory.AdminEmail, body.Email);
        Assert.Equal("Admin", body.Role);
        Assert.True(body.ExpiresAt > DateTime.UtcNow);
    }

    [Fact]
    public async Task Login_is_case_insensitive_in_the_email()
    {
        var client = factory.CreateClient();

        var response = await client.PostAsJsonAsync("/api/auth/login", new
        {
            email = CmsApiFactory.AdminEmail.ToUpperInvariant(),
            password = CmsApiFactory.AdminPassword
        });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Theory]
    [InlineData(CmsApiFactory.AdminEmail, "wrong-password")]
    [InlineData("nobody@test.local", CmsApiFactory.AdminPassword)]
    [InlineData("", "")]
    public async Task Login_rejects_bad_credentials_with_the_same_answer(string email, string password)
    {
        var client = factory.CreateClient();

        var response = await client.PostAsJsonAsync("/api/auth/login", new { email, password });

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);

        // Identical for an unknown account and a wrong password, so the endpoint cannot be
        // used to enumerate which emails exist.
        Assert.Equal("Invalid email or password.", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Me_returns_the_identity_carried_by_the_token()
    {
        var client = await factory.CreateAdminClientAsync();

        var response = await client.GetAsync("/api/auth/me");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var me = await response.Content.ReadFromJsonAsync<CurrentUserDto>();

        Assert.NotNull(me);
        Assert.Equal(CmsApiFactory.AdminEmail, me.Email);
        Assert.Equal("Admin", me.Role);
        Assert.NotEqual(Guid.Empty, me.Id);
    }

    [Fact]
    public async Task Me_requires_a_token()
    {
        var client = factory.CreateClient();

        var response = await client.GetAsync("/api/auth/me");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task A_tampered_token_is_rejected()
    {
        var client = await factory.CreateAdminClientAsync();

        var token = client.DefaultRequestHeaders.Authorization!.Parameter!;
        var parts = token.Split('.');
        // Same header and payload, a signature that was never computed from them.
        client.DefaultRequestHeaders.Authorization =
            new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", $"{parts[0]}.{parts[1]}.notasignature");

        var response = await client.GetAsync("/api/auth/me");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task An_unknown_path_is_404_rather_than_401()
    {
        var client = factory.CreateClient();

        // The fallback policy would otherwise turn every mistyped URL into "unauthorized",
        // which hides genuine 404s from anonymous callers such as the public site.
        var response = await client.GetAsync("/uploads/does-not-exist.png");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }
}
