namespace cms_api.Services;

/// <summary>
/// Role names as constants, because <c>[Authorize(Roles = …)]</c> takes a string and
/// a typo there fails open-ended rather than at compile time. Values must match the
/// names of <see cref="Models.UserRole"/> members.
/// </summary>
public static class Roles
{
    public const string Admin = nameof(Models.UserRole.Admin);
    public const string Editor = nameof(Models.UserRole.Editor);
    public const string Viewer = nameof(Models.UserRole.Viewer);

    /// <summary>Roles allowed to create, edit and delete content items.</summary>
    public const string ContentAuthors = $"{Admin},{Editor}";
}
