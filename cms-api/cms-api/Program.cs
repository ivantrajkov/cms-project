using cms_api.Data;
using cms_api.Models;
using cms_api.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
builder.Services.AddControllers();

// Learn more about configuring OpenAPI at https://aka.ms/aspnet/openapi
builder.Services.AddOpenApi();

// EF Core + SQLite
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlite(builder.Configuration.GetConnectionString("DefaultConnection")));

// Content validation and integrity checks that need database access.
builder.Services.AddScoped<ReferenceValidator>();
builder.Services.AddScoped<ReferenceFinder>();

// --- Authentication & authorization -------------------------------------

// Validate() throws on a missing or too-short signing key, so a misconfigured
// deployment fails at startup instead of issuing tokens nobody can trust.
var jwtOptions = builder.Configuration.GetSection(JwtOptions.SectionName).Get<JwtOptions>()
                 ?? new JwtOptions();
jwtOptions.Validate();

builder.Services.AddSingleton(jwtOptions);
builder.Services.AddSingleton<JwtTokenService>();

// PBKDF2 password hashing. PasswordHasher<T> ships with the framework, so there is
// no hand-rolled crypto here and no need for the full Identity schema.
builder.Services.AddSingleton<IPasswordHasher<User>, PasswordHasher<User>>();

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        // Keep claim names exactly as they appear in the token. Without this the handler
        // rewrites short names into Microsoft schema URIs, so what the API reads no longer
        // matches what a client decoding the same token sees.
        options.MapInboundClaims = false;

        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = jwtOptions.Issuer,
            ValidateAudience = true,
            ValidAudience = jwtOptions.Audience,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = jwtOptions.SigningKey(),
            ClockSkew = TimeSpan.FromSeconds(30),

            // Tell the role check which claim to look at, now that it is not the default URI.
            RoleClaimType = JwtTokenService.RoleClaim,
            NameClaimType = "email"
        };
    });

builder.Services.AddAuthorization(options =>
{
    // Secure by default: an endpoint with no authorization metadata requires a signed-in
    // user, so a newly added action is protected unless it opts out with [AllowAnonymous].
    options.FallbackPolicy = new AuthorizationPolicyBuilder()
        .RequireAuthenticatedUser()
        .Build();
});

// CORS — allow the local Vite/React dev server.
const string DevCorsPolicy = "DevCors";
builder.Services.AddCors(options =>
{
    options.AddPolicy(DevCorsPolicy, policy =>
        policy.WithOrigins("http://localhost:5173")
              .AllowAnyHeader()
              .AllowAnyMethod());
});

var app = builder.Build();

// Apply any pending EF Core migrations on startup (fine for local dev), then make sure
// there is at least one account to sign in with.
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    db.Database.Migrate();

    await SeedAdminAsync(scope.ServiceProvider, app.Configuration, app.Logger);
}

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    // AllowAnonymous: the FallbackPolicy would otherwise put the API description itself
    // behind a login, which defeats the point of serving it in development.
    app.MapOpenApi().AllowAnonymous();
}

app.UseHttpsRedirection();

// Serve uploaded images from wwwroot/ (e.g. /uploads/{file}). Deliberately before the
// auth middleware: published pages reference these URLs and must load for visitors.
app.UseStaticFiles();

// Routing is explicit and placed after UseStaticFiles. Otherwise it is auto-inserted at the
// top of the pipeline, an endpoint is selected before static files run, and StaticFileMiddleware
// then declines to serve the file — which would make every upload 404 once a catch-all exists.
app.UseRouting();

app.UseCors(DevCorsPolicy);

app.UseAuthentication();

app.UseAuthorization();

app.MapControllers();

// The FallbackPolicy is also applied when nothing matches at all, which turns every
// unknown path — a missing upload, a mistyped route — into a 401 for anonymous callers.
// This terminal 404 keeps "not found" distinguishable from "not allowed". The explicit
// "{*path}" pattern is required: MapFallback's default excludes file-like paths, which
// would leave requests such as /uploads/missing.png unmatched and therefore 401.
app.MapFallback("{*path}", () => Results.NotFound()).AllowAnonymous();

app.Run();

/// <summary>
/// Creates the first Admin from configuration, but only while the Users table is empty —
/// so a fresh clone is usable, and an existing deployment is never silently altered.
/// </summary>
static async Task SeedAdminAsync(IServiceProvider services, IConfiguration configuration, ILogger logger)
{
    var db = services.GetRequiredService<AppDbContext>();

    if (await db.Users.AnyAsync())
        return;

    var email = configuration["Seed:AdminEmail"];
    var password = configuration["Seed:AdminPassword"];

    if (string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(password))
    {
        logger.LogWarning(
            "No users exist and Seed:AdminEmail / Seed:AdminPassword are not configured — " +
            "nobody can sign in. Set them in configuration and restart.");
        return;
    }

    var hasher = services.GetRequiredService<IPasswordHasher<User>>();

    var admin = new User
    {
        Id = Guid.NewGuid(),
        Email = email.Trim().ToLowerInvariant(),
        Role = UserRole.Admin,
        CreatedAt = DateTime.UtcNow
    };
    admin.PasswordHash = hasher.HashPassword(admin, password);

    db.Users.Add(admin);
    await db.SaveChangesAsync();

    logger.LogInformation("Seeded initial Admin account {Email}.", admin.Email);
}
