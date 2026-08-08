using cms_api.Models;
using Microsoft.EntityFrameworkCore;

namespace cms_api.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<ContentType> ContentTypes => Set<ContentType>();

    public DbSet<ContentItem> ContentItems => Set<ContentItem>();

    public DbSet<User> Users => Set<User>();

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
