using System.Text;
using Dynamite_Doll_Wrestling.Components;
using Dynamite_Doll_Wrestling.Data;
using Dynamite_Doll_Wrestling.Models;
using Dynamite_Doll_Wrestling.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddRazorComponents()
    .AddInteractiveServerComponents();

// Arcade1870 reward payout configuration (shared with Crypto Hockey).
builder.Services.Configure<BlockchainConfig>(
    builder.Configuration.GetSection("BlockchainConfig"));

var sqlServerConnectionString = builder.Configuration.GetConnectionString("DefaultConnection");
var sqliteFallbackPath = GetSqliteFallbackPath(builder.Environment.ContentRootPath);
var useSqlServer = ShouldUseSqlServer(sqlServerConnectionString);

builder.Services.AddDbContext<GameDbContext>(options =>
{
    if (useSqlServer)
    {
        options.UseSqlServer(sqlServerConnectionString);
        return;
    }

    options.UseSqlite($"Data Source={sqliteFallbackPath}");
});

builder.Services.AddScoped<IWalletService, WalletService>();
builder.Services.AddScoped<IBlockchainService, BlockchainService>();
builder.Services.AddScoped<IMatchService, MatchService>();
builder.Services.AddScoped<IMatchEngine, MatchEngine>();
builder.Services.AddHttpClient();
builder.Services.AddSingleton<IRosterService, RosterService>();
builder.Services.AddSingleton<IRewardClaimIssuerService, RewardClaimIssuerService>();

var app = builder.Build();

if (useSqlServer)
{
    app.Logger.LogInformation("Using SQL Server for match persistence.");
}
else
{
    app.Logger.LogWarning(
        "Using SQLite fallback database at {DatabasePath} because a production-safe SQL Server connection string was not configured.",
        sqliteFallbackPath);
}

var trustProxyTerminatedTls = builder.Configuration.GetValue<bool>("TRUST_PROXY_HEADERS_FROM_RENDER");

if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Error", createScopeForErrors: true);
    app.UseHsts();
}

app.UseStatusCodePagesWithReExecute("/not-found", createScopeForStatusCodePages: true);

if (!trustProxyTerminatedTls)
{
    app.UseHttpsRedirection();
}

app.UseAntiforgery();

app.MapStaticAssets();
app.MapRazorComponents<App>()
    .AddInteractiveServerRenderMode();

app.MapGet(
    "/health/reward-issuer",
    async (
        IOptions<BlockchainConfig> blockchainOptions,
        IHttpClientFactory httpClientFactory,
        CancellationToken cancellationToken) =>
    {
        var issuerUrl = blockchainOptions.Value.RewardIssuerUrl;
        if (!RewardIssuerEndpointResolver.TryGetCandidateUris(
                issuerUrl,
                out var issuerUris,
                out var validationError))
        {
            return Results.Problem(
                title: "Reward issuer URL is invalid",
                detail: validationError,
                statusCode: StatusCodes.Status500InternalServerError);
        }

        try
        {
            var config = blockchainOptions.Value;
            var signerConfigured = !string.IsNullOrWhiteSpace(config.RewardSignerPrivateKey);
            var vaultConfigured = !string.IsNullOrWhiteSpace(config.RewardVaultAddress);

            var client = httpClientFactory.CreateClient();
            var issuerUri = issuerUris[0];

            // The issuer only accepts POST, so probe it the way the game does. An empty body is
            // rejected before anything is signed, which proves the route exists and is reachable.
            using var request = new HttpRequestMessage(HttpMethod.Post, issuerUri)
            {
                Content = new StringContent("{}", Encoding.UTF8, "application/json")
            };

            using var response = await client.SendAsync(
                request,
                HttpCompletionOption.ResponseHeadersRead,
                cancellationToken);

            var statusCode = (int)response.StatusCode;
            var routeReachable = statusCode is not (StatusCodes.Status404NotFound or StatusCodes.Status405MethodNotAllowed);
            var healthy = routeReachable && statusCode < 500 && signerConfigured && vaultConfigured;

            return Results.Json(new
            {
                status = healthy ? "healthy" : "degraded",
                issuerUrl = issuerUri.ToString(),
                configuredIssuerUrl = issuerUrl,
                statusCode,
                routeReachable,
                signerConfigured,
                vaultConfigured
            });
        }
        catch (Exception ex)
        {
            return Results.Problem(
                title: "Reward issuer is unreachable",
                detail: ex.Message,
                statusCode: StatusCodes.Status503ServiceUnavailable);
        }
    });

// Both routes are served by the same handler so the two entry points can never drift apart.
async Task<IResult> IssueRewardClaim(
    RewardClaimIssueRequest request,
    IRewardClaimIssuerService rewardClaimIssuerService,
    GameDbContext dbContext)
{
    // A claim is only ever signed for a match that actually exists, has finished, has not
    // already been paid out, and was played by the wallet asking to be paid.
    if (request.Game is null || !int.TryParse(request.Game.GameId, out var sessionId))
    {
        return Results.BadRequest(new { error = "A completed match id is required." });
    }

    var session = await dbContext.MatchSessions
        .AsNoTracking()
        .FirstOrDefaultAsync(matchSession => matchSession.Id == sessionId);

    if (session is null
        || session.EndedAt == default
        || session.RewardClaimed
        || string.IsNullOrWhiteSpace(request.Recipient)
        || !string.Equals(session.PlayerAddress, request.Recipient, StringComparison.OrdinalIgnoreCase))
    {
        return Results.BadRequest(new { error = "This reward claim is no longer available." });
    }

    if (!rewardClaimIssuerService.TryCreateClaim(request, out var payload, out var error))
    {
        return Results.BadRequest(new { error });
    }

    return Results.Json(payload);
}

app.MapPost("/api/reward-claim", IssueRewardClaim);
app.MapPost("/reward-claim", IssueRewardClaim);

using (var scope = app.Services.CreateScope())
{
    var dbContext = scope.ServiceProvider.GetRequiredService<GameDbContext>();
    if (useSqlServer)
    {
        await dbContext.Database.MigrateAsync();
    }
    else
    {
        await dbContext.Database.EnsureCreatedAsync();
    }
}

app.Run();

static bool ShouldUseSqlServer(string? connectionString)
{
    if (string.IsNullOrWhiteSpace(connectionString))
    {
        return false;
    }

    var isLocalDbConnection = connectionString.Contains("(localdb)", StringComparison.OrdinalIgnoreCase);
    return !isLocalDbConnection || OperatingSystem.IsWindows();
}

static string GetSqliteFallbackPath(string contentRootPath)
{
    var appDataDirectory = Path.Combine(contentRootPath, "App_Data");
    Directory.CreateDirectory(appDataDirectory);
    return Path.Combine(appDataDirectory, "dynamite-doll-wrestling.db");
}
