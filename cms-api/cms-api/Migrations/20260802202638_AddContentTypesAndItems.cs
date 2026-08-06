using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace cms_api.Migrations
{
    /// <inheritdoc />
    public partial class AddContentTypesAndItems : Migration
    {
        /// <summary>
        /// Fixed id for the seeded "page" content type — existing Pages rows are migrated under it below.
        /// Must be UPPERCASE: EF Core's SQLite provider writes Guids as uppercase TEXT, and SQLite
        /// compares TEXT case-sensitively, so a lowercase literal here would never match a bound Guid.
        /// </summary>
        private const string PageContentTypeId = "8C9C163E-3B1A-4F0E-9D7A-2F1B6C5E4A3D";

        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ContentTypes",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    Name = table.Column<string>(type: "TEXT", nullable: false),
                    Slug = table.Column<string>(type: "TEXT", nullable: false),
                    FieldsSchemaJson = table.Column<string>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ContentTypes", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "ContentItems",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    ContentTypeId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Slug = table.Column<string>(type: "TEXT", nullable: false),
                    DataJson = table.Column<string>(type: "TEXT", nullable: false),
                    Status = table.Column<int>(type: "INTEGER", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ContentItems", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ContentItems_ContentTypes_ContentTypeId",
                        column: x => x.ContentTypeId,
                        principalTable: "ContentTypes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ContentItems_ContentTypeId_Slug",
                table: "ContentItems",
                columns: new[] { "ContentTypeId", "Slug" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ContentTypes_Slug",
                table: "ContentTypes",
                column: "Slug",
                unique: true);

            // Seed a "page" content type matching the old Page shape, then migrate
            // every existing Pages row into ContentItems under it before dropping Pages.
            migrationBuilder.Sql($@"
                INSERT INTO ContentTypes (Id, Name, Slug, FieldsSchemaJson)
                VALUES (
                    '{PageContentTypeId}',
                    'Page',
                    'page',
                    '[{{""Name"":""title"",""Type"":0,""Required"":true}},{{""Name"":""slug"",""Type"":0,""Required"":true}},{{""Name"":""layout"",""Type"":4,""Required"":true}}]'
                );
            ");

            // Status 1 = Published: these pages were already publicly reachable before this migration.
            migrationBuilder.Sql($@"
                INSERT INTO ContentItems (Id, ContentTypeId, Slug, DataJson, Status, CreatedAt, UpdatedAt)
                SELECT
                    upper(Id),
                    '{PageContentTypeId}',
                    Slug,
                    json_object('title', Title, 'slug', Slug, 'layout', json(LayoutData)),
                    1,
                    strftime('%Y-%m-%d %H:%M:%f', 'now'),
                    strftime('%Y-%m-%d %H:%M:%f', 'now')
                FROM Pages;
            ");

            migrationBuilder.DropTable(
                name: "Pages");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Pages",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    LayoutData = table.Column<string>(type: "TEXT", nullable: false),
                    Slug = table.Column<string>(type: "TEXT", nullable: false),
                    Title = table.Column<string>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Pages", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Pages_Slug",
                table: "Pages",
                column: "Slug",
                unique: true);

            // Copy "page" items back into Pages before dropping the new tables, so a
            // rollback preserves content instead of discarding it. Items of any other
            // content type have no equivalent in the old schema and are necessarily lost.
            migrationBuilder.Sql($@"
                INSERT INTO Pages (Id, Title, Slug, LayoutData)
                SELECT
                    Id,
                    json_extract(DataJson, '$.title'),
                    Slug,
                    json_extract(DataJson, '$.layout')
                FROM ContentItems
                WHERE ContentTypeId = '{PageContentTypeId}';
            ");

            migrationBuilder.DropTable(
                name: "ContentItems");

            migrationBuilder.DropTable(
                name: "ContentTypes");
        }
    }
}
