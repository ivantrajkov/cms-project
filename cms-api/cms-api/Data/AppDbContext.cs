using cms_api.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;

namespace cms_api.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<ContentType> ContentTypes => Set<ContentType>();

    public DbSet<ContentItem> ContentItems => Set<ContentItem>();

    public DbSet<User> Users => Set<User>();

    public DbSet<MediaAsset> MediaAssets => Set<MediaAsset>();

    /// <summary>
    /// Every timestamp in this schema is written as UTC (<c>DateTime.UtcNow</c>), but SQLite
    /// stores no offset, so values read back would otherwise have <c>DateTimeKind.Unspecified</c>
    /// and serialize to JSON without a "Z". A client parsing that treats it as local time and
    /// displays a timestamp that is wrong by its own UTC offset. Restoring the Kind on read
    /// fixes that once, for every entity, rather than at each API boundary.
    /// </summary>
    protected override void ConfigureConventions(ModelConfigurationBuilder configurationBuilder)
    {
        base.ConfigureConventions(configurationBuilder);

        configurationBuilder.Properties<DateTime>()
            .HaveConversion<UtcDateTimeConverter>();
    }

    private sealed class UtcDateTimeConverter() : ValueConverter<DateTime, DateTime>(
        stored => stored,
        read => DateTime.SpecifyKind(read, DateTimeKind.Utc));

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // Email is the login identifier, so it must be unique.
        modelBuilder.Entity<User>()
            .HasIndex(u => u.Email)
            .IsUnique();

        // Type slugs are the public lookup key, so they must be unique.
        modelBuilder.Entity<ContentType>()
            .HasIndex(t => t.Slug)
            .IsUnique();

        modelBuilder.Entity<ContentItem>()
            .HasOne(i => i.ContentType)
            .WithMany()
            .HasForeignKey(i => i.ContentTypeId)
            .OnDelete(DeleteBehavior.Restrict);

        // Item slugs only need to be unique within their own content type.
        modelBuilder.Entity<ContentItem>()
            .HasIndex(i => new { i.ContentTypeId, i.Slug })
            .IsUnique();
    }
}
