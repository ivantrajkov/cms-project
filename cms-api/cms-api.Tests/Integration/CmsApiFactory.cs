using System.Net.Http.Headers;
using System.Net.Http.Json;
using cms_api.Data;
using cms_api.Dtos;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace cms_api.Tests.Integration;

/// <summary>
/// Runs the real application in-process against a throwaway database.
///
/// Only two things are substituted: the SQLite file is swapped for a private in-memory
/// database, and uploads are pointed at a temp directory. Everything else — the JWT
/// pipeline, the authenticated-by-default fallback policy, model binding, the migrations
/// and the admin seeding — is the production code path, which is the point of testing
/// through the HTTP surface rather than calling controllers directly.
/// </summary>
public class CmsApiFactory : WebApplicationFactory<Program>
{
    /// <summary>The account <c>Program.SeedAdminAsync</c> creates from configuration.</summary>
    public const string AdminEmail = "admin@test.local";

    public const string AdminPassword = "AdminPassword123!";

    /// <summary>
    /// Configuration is supplied as environment variables rather than through
    /// <c>ConfigureAppConfiguration</c> because <c>Program.cs</c> reads the <c>Jwt</c>
    /// section (and calls <c>Validate()</c>) while the builder is still being configured —
    /// before any callback this factory could register would have run. Environment
    /// variables are already a source on the builder at that moment, and they outrank
    /// appsettings.Development.json.
    /// </summary>
    static CmsApiFactory()
    {
        Environment.SetEnvironmentVariable("ASPNETCORE_ENVIRONMENT", "Development");
        Environment.SetEnvironmentVariable("ASPNETCORE_WEBROOT", WebRootPath);

        Environment.SetEnvironmentVariable("Jwt__Issuer", "cms-api-tests");
        Environment.SetEnvironmentVariable("Jwt__Audience", "cms-frontend-tests");
        Environment.SetEnvironmentVariable("Jwt__Key", "test-only-signing-key-that-is-long-enough-32");
        Environment.SetEnvironmentVariable("Jwt__ExpiryMinutes", "120");

        Environment.SetEnvironmentVariable("Seed__AdminEmail", AdminEmail);
        Environment.SetEnvironmentVariable("Seed__AdminPassword", AdminPassword);

        Directory.CreateDirectory(Path.Combine(WebRootPath, "uploads"));
    }

    /// <summary>
    /// Temp web root for this test run, so uploads never land in the repository's wwwroot.
    /// Shared by every factory in the process; upload file names are GUIDs, so there is
    /// nothing for parallel test classes to collide over.
    /// </summary>
    public static string WebRootPath { get; } =
        Path.Combine(Path.GetTempPath(), "cms-api-tests", Guid.NewGuid().ToString("N"));

    // Held open for the lifetime of the factory: an in-memory SQLite database exists only
    // as long as a connection to it does, so closing this would delete the schema mid-test.
    private readonly SqliteConnection _connection = new("Data Source=:memory:");

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        _connection.Open();

        builder.ConfigureTestServices(services =>
        {
            // AddDbContext leaves several registrations behind (the context, its options, and
            // the options-configuration callback). Removing only DbContextOptions<T> would
            // leave the original SQLite-file setup half in place, so clear all three.
            var stale = services
                .Where(d =>
                    d.ServiceType == typeof(DbContextOptions<AppDbContext>)
                    || d.ServiceType == typeof(DbContextOptions)
                    || d.ServiceType == typeof(AppDbContext)
                    || (d.ServiceType.IsGenericType
                        && d.ServiceType.GetGenericTypeDefinition().Name.StartsWith("IDbContextOptionsConfiguration")))
                .ToList();

            foreach (var descriptor in stale)
                services.Remove(descriptor);

            services.AddDbContext<AppDbContext>(options => options.UseSqlite(_connection));
        });
    }

    /// <summary>A client carrying a token for the seeded Admin.</summary>
    public Task<HttpClient> CreateAdminClientAsync() =>
        CreateAuthenticatedClientAsync(AdminEmail, AdminPassword);

    /// <summary>Signs in and returns a client that sends the resulting bearer token.</summary>
    public async Task<HttpClient> CreateAuthenticatedClientAsync(string email, string password)
    {
        var client = CreateClient();
        var token = await GetTokenAsync(client, email, password);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return client;
    }

    /// <summary>
    /// Creates a fresh account in the given role (as Admin) and returns a client signed in
    /// as that user, for asserting what each role may and may not do.
    /// </summary>
    public async Task<HttpClient> CreateClientForNewUserAsync(string role)
    {
        var admin = await CreateAdminClientAsync();

        var email = $"{role.ToLowerInvariant()}-{Guid.NewGuid():N}@test.local";
        const string password = "UserPassword123!";

        var created = await admin.PostAsJsonAsync("/api/users", new { email, password, role });
        created.EnsureSuccessStatusCode();

        return await CreateAuthenticatedClientAsync(email, password);
    }

    /// <summary>Runs an action against the application's own database.</summary>
    public async Task WithDbAsync(Func<AppDbContext, Task> action)
    {
        using var scope = Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        await action(db);
    }

    private static async Task<string> GetTokenAsync(HttpClient client, string email, string password)
    {
        var response = await client.PostAsJsonAsync("/api/auth/login", new { email, password });
        response.EnsureSuccessStatusCode();

        var body = await response.Content.ReadFromJsonAsync<LoginResponse>();
        return body!.Token;
    }

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);

        if (disposing)
            _connection.Dispose();
    }
}
