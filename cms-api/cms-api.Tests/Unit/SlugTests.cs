using cms_api.Services;

namespace cms_api.Tests.Unit;

/// <summary>
/// Slugs end up in URLs, so what this accepts decides what content can be fetched back.
/// </summary>
public class SlugTests
{
    [Theory]
    [InlineData("page")]
    [InlineData("a")]
    [InlineData("1")]
    [InlineData("blog-post")]
    [InlineData("blog-post-2")]
    [InlineData("a1-b2-c3")]
    public void Accepts_lowercase_words_separated_by_single_hyphens(string value)
    {
        Assert.True(Slug.IsValid(value));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("Blog")]              // uppercase
    [InlineData("blog post")]         // space
    [InlineData("blog--post")]        // doubled hyphen
    [InlineData("-blog")]             // leading hyphen
    [InlineData("blog-")]             // trailing hyphen
    [InlineData("blog_post")]         // underscore
    [InlineData("blog/post")]         // would break the route
    [InlineData("blog.post")]
    [InlineData("blög")]              // non-ascii
    public void Rejects_anything_that_would_not_survive_a_url(string? value)
    {
        Assert.False(Slug.IsValid(value));
    }

    [Fact]
    public void Rejects_a_slug_that_only_matches_on_one_line()
    {
        // A regex anchored with ^…$ rather than \A…\z would accept this, and the trailing
        // line would then be silently carried into the URL.
        Assert.False(Slug.IsValid("valid\nnot valid"));
    }
}
