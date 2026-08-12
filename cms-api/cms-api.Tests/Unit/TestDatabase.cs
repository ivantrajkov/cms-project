using System.Text.Json;
using cms_api.Data;
using cms_api.Models;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace cms_api.Tests.Unit;

/// <summary>
/// A real SQLite database, held in memory, for the services that need one.
///
/// SQLite rather than the in-memory provider on purpose: <see cref="ReferenceFinder"/> and
/// <see cref="ReferenceValidator"/> translate queries against the same provider production
/// uses, so a query that cannot be translated fails here too instead of passing against a
/// LINQ-to-objects fake.
/// </summary>
internal sealed class TestDatabase : IDisposable
{
    private readonly SqliteConnection _connection;

    public TestDatabase()
    {
        // The database lives only as long as a connection to it, so this one stays open
        // for the lifetime of the fixture.
        _connection = new SqliteConnection("Data Source=:memory:");
        _connection.Open();

        Db = new AppDbContext(
            new DbContextOptionsBuilder<AppDbContext>().UseSqlite(_connection).Options);

        Db.Database.EnsureCreated();
    }

    public AppDbContext Db { get; }

    /// <summary>Adds a content type with the given fields and returns it.</summary>
    public async Task<ContentType> AddContentTypeAsync(string slug, params FieldDefinition[] fields)
    {
        var type = new ContentType
        {
            Id = Guid.NewGuid(),
            Name = slug,
            Slug = slug,
            FieldsSchemaJson = JsonSerializer.Serialize(fields)
        };

        Db.ContentTypes.Add(type);
        await Db.SaveChangesAsync();

        return type;
    }

    /// <summary>Adds an item of the given type whose values are <paramref name="dataJson"/>.</summary>
    public async Task<ContentItem> AddItemAsync(ContentType type, string slug, string dataJson = "{}")
    {
        var item = new ContentItem
        {
            Id = Guid.NewGuid(),
            ContentTypeId = type.Id,
            Slug = slug,
            DataJson = dataJson,
            Status = ContentItemStatus.Published,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        Db.ContentItems.Add(item);
        await Db.SaveChangesAsync();

        return item;
    }

    public async Task<MediaAsset> AddMediaAsync()
    {
        var asset = new MediaAsset
        {
            Id = Guid.NewGuid(),
            FileName = $"{Guid.NewGuid():N}.png",
            OriginalFileName = "logo.png",
            Url = "http://localhost/uploads/logo.png",
            ContentType = "image/png",
            SizeBytes = 128,
            AltText = "",
            UploadedAt = DateTime.UtcNow
        };

        Db.MediaAssets.Add(asset);
        await Db.SaveChangesAsync();

        return asset;
    }

    public static FieldDefinition Field(string name, FieldType type, string? targetType = null) =>
        new() { Name = name, Type = type, TargetType = targetType };

    public void Dispose()
    {
        Db.Dispose();
        _connection.Dispose();
    }
}
