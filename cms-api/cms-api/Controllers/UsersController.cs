using System.Security.Claims;
using cms_api.Data;
using cms_api.Dtos;
using cms_api.Models;
using cms_api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace cms_api.Controllers;

/// <summary>
/// User administration. Restricted to <see cref="Roles.Admin"/> — the ability to mint
/// accounts is effectively the ability to grant any other permission.
/// </summary>
[ApiController]
[Route("api/users")]
[Authorize(Roles = Roles.Admin)]
public class UsersController(AppDbContext db, IPasswordHasher<User> passwordHasher) : ControllerBase
{
    /// <summary>Passwords below this length are rejected outright.</summary>
    private const int MinimumPasswordLength = 8;

    /// <summary>GET /api/users</summary>
    [HttpGet]
    public async Task<ActionResult<IEnumerable<UserDto>>> GetAll()
    {
        var users = await db.Users
            .OrderBy(u => u.Email)
            .Select(u => new UserDto(u.Id, u.Email, u.Role.ToString(), u.CreatedAt))
            .ToListAsync();

        return Ok(users);
    }

    /// <summary>POST /api/users — create an account.</summary>
    [HttpPost]
    [ProducesResponseType<UserDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<string>(StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<UserDto>> Create(CreateUserRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Email) || !request.Email.Contains('@'))
            return BadRequest("A valid email is required.");

        if (string.IsNullOrWhiteSpace(request.Password) || request.Password.Length < MinimumPasswordLength)
            return BadRequest($"Password must be at least {MinimumPasswordLength} characters.");

        if (!Enum.TryParse<UserRole>(request.Role, ignoreCase: true, out var role))
            return BadRequest($"Role must be one of: {string.Join(", ", Enum.GetNames<UserRole>())}.");

        var email = request.Email.Trim().ToLowerInvariant();

        if (await db.Users.AnyAsync(u => u.Email == email))
            return BadRequest("A user with that email already exists.");

        var user = new User
        {
            Id = Guid.NewGuid(),
            Email = email,
            Role = role,
            CreatedAt = DateTime.UtcNow
        };
        user.PasswordHash = passwordHasher.HashPassword(user, request.Password);

        db.Users.Add(user);
        await db.SaveChangesAsync();

        return Ok(new UserDto(user.Id, user.Email, user.Role.ToString(), user.CreatedAt));
    }

    /// <summary>POST /api/users/{id} — change a user's role and/or reset their password.</summary>
    [HttpPost("{id:guid}")]
    [ProducesResponseType<UserDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<string>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<UserDto>> Update(Guid id, UpdateUserRequest request)
    {
        var user = await db.Users.FirstOrDefaultAsync(u => u.Id == id);
        if (user is null)
            return NotFound();

        if (!Enum.TryParse<UserRole>(request.Role, ignoreCase: true, out var role))
            return BadRequest($"Role must be one of: {string.Join(", ", Enum.GetNames<UserRole>())}.");

        // Demoting the only Admin would leave nobody able to administer the CMS.
        if (user.Role == UserRole.Admin && role != UserRole.Admin && await IsLastAdmin(user.Id))
            return BadRequest("Cannot change the role of the last remaining Admin.");

        if (!string.IsNullOrWhiteSpace(request.Password))
        {
            if (request.Password.Length < MinimumPasswordLength)
                return BadRequest($"Password must be at least {MinimumPasswordLength} characters.");

            user.PasswordHash = passwordHasher.HashPassword(user, request.Password);
        }

        user.Role = role;
        await db.SaveChangesAsync();

        return Ok(new UserDto(user.Id, user.Email, user.Role.ToString(), user.CreatedAt));
    }

    /// <summary>DELETE /api/users/{id}</summary>
    [HttpDelete("{id:guid}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType<string>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Delete(Guid id)
    {
        var user = await db.Users.FirstOrDefaultAsync(u => u.Id == id);
        if (user is null)
            return NotFound();

        if (id == CurrentUserId())
            return BadRequest("You cannot delete your own account.");

        if (user.Role == UserRole.Admin && await IsLastAdmin(user.Id))
            return BadRequest("Cannot delete the last remaining Admin.");

        db.Users.Remove(user);
        await db.SaveChangesAsync();

        return NoContent();
    }

    private Task<bool> IsLastAdmin(Guid userId) =>
        db.Users.AllAsync(u => u.Role != UserRole.Admin || u.Id == userId);

    private Guid? CurrentUserId()
    {
        var id = User.FindFirstValue(JwtTokenService.SubjectClaim);
        return Guid.TryParse(id, out var parsed) ? parsed : null;
    }
}
