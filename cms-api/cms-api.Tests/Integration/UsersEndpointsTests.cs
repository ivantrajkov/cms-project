using System.Net;
using System.Net.Http.Json;
using cms_api.Dtos;

namespace cms_api.Tests.Integration;

/// <summary>
/// User administration. Creating accounts is effectively the power to grant any other
/// permission, so the interesting assertions are the ones about who may call this at all
/// and about the guards that stop an Admin locking everybody out.
///
/// No test in this class creates a second Admin: the seeded account stays the only one,
/// which is what makes the "last Admin" guard reachable.
/// </summary>
public class UsersEndpointsTests(CmsApiFactory factory) : IClassFixture<CmsApiFactory>
{
    private static object NewUser(string role = "Viewer", string? email = null, string password = "ValidPassword1") =>
        new { email = email ?? $"user-{Guid.NewGuid():N}@test.local", password, role };

    [Fact]
    public async Task An_anonymous_caller_is_turned_away()
    {
        var response = await factory.CreateClient().GetAsync("/api/users");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Theory]
    [InlineData("Editor")]
    [InlineData("Viewer")]
    public async Task Only_an_admin_may_list_users(string role)
    {
        var client = await factory.CreateClientForNewUserAsync(role);

        var response = await client.GetAsync("/api/users");

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task An_admin_can_create_an_account_and_see_it_listed()
    {
        var admin = await factory.CreateAdminClientAsync();
        var email = $"created-{Guid.NewGuid():N}@test.local";

        var response = await admin.PostAsJsonAsync("/api/users", NewUser("Editor", email));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var created = await response.Content.ReadFromJsonAsync<UserDto>();
        Assert.Equal(email, created!.Email);
        Assert.Equal("Editor", created.Role);

        var users = await admin.GetFromJsonAsync<List<UserDto>>("/api/users");
        Assert.Contains(users!, u => u.Email == email);
    }

    [Fact]
    public async Task The_password_hash_never_leaves_the_api()
    {
        var admin = await factory.CreateAdminClientAsync();
        await admin.PostAsJsonAsync("/api/users", NewUser());

        var body = await (await admin.GetAsync("/api/users")).Content.ReadAsStringAsync();

        Assert.DoesNotContain("passwordHash", body, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("ValidPassword1", body);
    }

    [Fact]
    public async Task An_email_is_stored_lowercase_so_sign_in_is_case_insensitive()
    {
        var admin = await factory.CreateAdminClientAsync();
        var email = $"MiXeD-{Guid.NewGuid():N}@Test.Local";

        var created = await (await admin.PostAsJsonAsync("/api/users", NewUser("Viewer", email)))
            .Content.ReadFromJsonAsync<UserDto>();

        Assert.Equal(email.ToLowerInvariant(), created!.Email);
    }

    [Theory]
    [InlineData("not-an-email")]
    [InlineData("")]
    public async Task An_invalid_email_is_rejected(string email)
    {
        var admin = await factory.CreateAdminClientAsync();

        var response = await admin.PostAsJsonAsync("/api/users", NewUser("Viewer", email));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task A_short_password_is_rejected()
    {
        var admin = await factory.CreateAdminClientAsync();

        var response = await admin.PostAsJsonAsync("/api/users", NewUser(password: "short"));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("at least 8 characters", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task An_unknown_role_is_rejected()
    {
        var admin = await factory.CreateAdminClientAsync();

        var response = await admin.PostAsJsonAsync("/api/users", NewUser("Superuser"));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("Role must be one of", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task A_duplicate_email_is_rejected()
    {
        var admin = await factory.CreateAdminClientAsync();
        var email = $"twice-{Guid.NewGuid():N}@test.local";

        (await admin.PostAsJsonAsync("/api/users", NewUser("Viewer", email))).EnsureSuccessStatusCode();

        var second = await admin.PostAsJsonAsync("/api/users", NewUser("Viewer", email));

        Assert.Equal(HttpStatusCode.BadRequest, second.StatusCode);
        Assert.Contains("already exists", await second.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task A_new_account_can_sign_in_immediately()
    {
        var admin = await factory.CreateAdminClientAsync();
        var email = $"signs-in-{Guid.NewGuid():N}@test.local";

        (await admin.PostAsJsonAsync("/api/users", NewUser("Editor", email, "TheirPassword1")))
            .EnsureSuccessStatusCode();

        var client = await factory.CreateAuthenticatedClientAsync(email, "TheirPassword1");
        var me = await client.GetFromJsonAsync<CurrentUserDto>("/api/auth/me");

        Assert.Equal("Editor", me!.Role);
    }

    [Fact]
    public async Task A_role_change_takes_effect_on_the_next_sign_in()
    {
        var admin = await factory.CreateAdminClientAsync();
        var email = $"promoted-{Guid.NewGuid():N}@test.local";

        var user = await (await admin.PostAsJsonAsync("/api/users", NewUser("Viewer", email, "TheirPassword1")))
            .Content.ReadFromJsonAsync<UserDto>();

        var updated = await admin.PostAsJsonAsync($"/api/users/{user!.Id}", new { role = "Editor", password = (string?)null });
        Assert.Equal(HttpStatusCode.OK, updated.StatusCode);

        // The old token still says Viewer — a role lives in the token until it is reissued.
        var reissued = await factory.CreateAuthenticatedClientAsync(email, "TheirPassword1");
        var me = await reissued.GetFromJsonAsync<CurrentUserDto>("/api/auth/me");

        Assert.Equal("Editor", me!.Role);
    }

    [Fact]
    public async Task A_password_reset_replaces_the_old_password()
    {
        var admin = await factory.CreateAdminClientAsync();
        var email = $"reset-{Guid.NewGuid():N}@test.local";

        var user = await (await admin.PostAsJsonAsync("/api/users", NewUser("Viewer", email, "OldPassword1")))
            .Content.ReadFromJsonAsync<UserDto>();

        (await admin.PostAsJsonAsync($"/api/users/{user!.Id}", new { role = "Viewer", password = "NewPassword1" }))
            .EnsureSuccessStatusCode();

        var withOld = await factory.CreateClient()
            .PostAsJsonAsync("/api/auth/login", new { email, password = "OldPassword1" });
        Assert.Equal(HttpStatusCode.Unauthorized, withOld.StatusCode);

        var withNew = await factory.CreateClient()
            .PostAsJsonAsync("/api/auth/login", new { email, password = "NewPassword1" });
        Assert.Equal(HttpStatusCode.OK, withNew.StatusCode);
    }

    [Fact]
    public async Task A_blank_password_on_update_leaves_it_unchanged()
    {
        var admin = await factory.CreateAdminClientAsync();
        var email = $"unchanged-{Guid.NewGuid():N}@test.local";

        var user = await (await admin.PostAsJsonAsync("/api/users", NewUser("Viewer", email, "KeepThis1234")))
            .Content.ReadFromJsonAsync<UserDto>();

        (await admin.PostAsJsonAsync($"/api/users/{user!.Id}", new { role = "Editor", password = "" }))
            .EnsureSuccessStatusCode();

        var login = await factory.CreateClient()
            .PostAsJsonAsync("/api/auth/login", new { email, password = "KeepThis1234" });

        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
    }

    [Fact]
    public async Task A_short_password_on_update_is_rejected()
    {
        var admin = await factory.CreateAdminClientAsync();

        var user = await (await admin.PostAsJsonAsync("/api/users", NewUser()))
            .Content.ReadFromJsonAsync<UserDto>();

        var response = await admin.PostAsJsonAsync($"/api/users/{user!.Id}", new { role = "Viewer", password = "short" });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Updating_an_unknown_user_is_404()
    {
        var admin = await factory.CreateAdminClientAsync();

        var response = await admin.PostAsJsonAsync($"/api/users/{Guid.NewGuid()}", new { role = "Viewer", password = (string?)null });

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task A_user_can_be_deleted()
    {
        var admin = await factory.CreateAdminClientAsync();

        var user = await (await admin.PostAsJsonAsync("/api/users", NewUser()))
            .Content.ReadFromJsonAsync<UserDto>();

        var deleted = await admin.DeleteAsync($"/api/users/{user!.Id}");
        Assert.Equal(HttpStatusCode.NoContent, deleted.StatusCode);

        var users = await admin.GetFromJsonAsync<List<UserDto>>("/api/users");
        Assert.DoesNotContain(users!, u => u.Id == user.Id);
    }

    [Fact]
    public async Task Deleting_an_unknown_user_is_404()
    {
        var admin = await factory.CreateAdminClientAsync();

        var response = await admin.DeleteAsync($"/api/users/{Guid.NewGuid()}");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task An_admin_cannot_delete_their_own_account()
    {
        var admin = await factory.CreateAdminClientAsync();

        var me = await admin.GetFromJsonAsync<CurrentUserDto>("/api/auth/me");

        var response = await admin.DeleteAsync($"/api/users/{me!.Id}");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("cannot delete your own account", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task The_last_admin_cannot_be_demoted()
    {
        var admin = await factory.CreateAdminClientAsync();
        var me = await admin.GetFromJsonAsync<CurrentUserDto>("/api/auth/me");

        // Otherwise the CMS is left with nobody able to change a schema or add a user.
        var response = await admin.PostAsJsonAsync($"/api/users/{me!.Id}", new { role = "Editor", password = (string?)null });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("last remaining Admin", await response.Content.ReadAsStringAsync());

        // And the demotion did not happen.
        var stillAdmin = await admin.GetFromJsonAsync<CurrentUserDto>("/api/auth/me");
        Assert.Equal("Admin", stillAdmin!.Role);
    }
}
