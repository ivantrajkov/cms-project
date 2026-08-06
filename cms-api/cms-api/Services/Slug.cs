using System.Text.RegularExpressions;

namespace cms_api.Services;

/// <summary>
/// Slugs address content in URLs (<c>/api/content-types/{typeSlug}/items/{itemSlug}</c> and
/// the public <c>/:slug</c> route), so they are restricted to lowercase alphanumeric words
/// separated by single hyphens. Without this, a slug containing a slash or space would
/// produce content that can never be fetched back.
/// </summary>
public static partial class Slug
{
    [GeneratedRegex("^[a-z0-9]+(?:-[a-z0-9]+)*$")]
    private static partial Regex Pattern();

    public const string Requirement =
        "must be lowercase alphanumeric words separated by single hyphens (e.g. 'blog-post')";

    public static bool IsValid(string? value) =>
        !string.IsNullOrWhiteSpace(value) && Pattern().IsMatch(value);
}
