using cms_api.Models;
using Microsoft.EntityFrameworkCore;

namespace cms_api.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<Page> Pages => Set<Page>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // Slugs are the public lookup key, so they must be unique.
        modelBuilder.Entity<Page>()
            .HasIndex(p => p.Slug)
            .IsUnique();
    }
}
