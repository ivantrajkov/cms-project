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

[ApiController]
[Route("api/auth")]
public class AuthController(
    AppDbContext db,
    IPasswordHasher<User> passwordHasher,
    JwtTokenService tokens) : ControllerBase
{
    /// <summary>
    /// POST /api/auth/login — exchanges credentials for a bearer token.
    /// An unknown email and a wrong password return the identical response so the
    /// endpoint cannot be used to discover which accounts exist.
    /// </summary>
    [AllowAnonymous]
    [HttpPost("login")]
    public async Task<ActionResult<LoginResponse>> Login(LoginRequest request)
    {
        const string invalidCredentials = "Invalid email or password.";

        if (string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrWhiteSpace(request.Password))
            return Unauthorized(invalidCredentials);

        var email = request.Email.Trim().ToLowerInvariant();
        var user = await db.Users.FirstOrDefaultAsync(u => u.Email == email);

        if (user is null)
            return Unauthorized(invalidCredentials);

        var result = passwordHasher.VerifyHashedPassword(user, user.PasswordHash, request.Password);

        if (result == PasswordVerificationResult.Failed)
            return Unauthorized(invalidCredentials);

        // The hasher asks for a rehash when the stored hash used older parameters.
        if (result == PasswordVerificationResult.SuccessRehashNeeded)
        {
            user.PasswordHash = passwordHasher.HashPassword(user, request.Password);
            await db.SaveChangesAsync();
        }

        var (token, expiresAt) = tokens.CreateToken(user);

        return Ok(new LoginResponse(token, user.Email, user.Role.ToString(), expiresAt));
    }

    /// <summary>GET /api/auth/me — the caller's identity, taken from their token.</summary>
    [HttpGet("me")]
    public ActionResult<CurrentUserDto> Me()
    {
        // Claim names are read exactly as issued — inbound claim mapping is disabled so
        // these match what JwtTokenService wrote and what the client decodes.
        var id = User.FindFirstValue(JwtTokenService.SubjectClaim);
        var email = User.FindFirstValue(JwtTokenService.EmailClaim) ?? "";
        var role = User.FindFirstValue(JwtTokenService.RoleClaim) ?? "";

        if (!Guid.TryParse(id, out var userId))
            return Unauthorized();

        return Ok(new CurrentUserDto(userId, email, role));
    }
}
