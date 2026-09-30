using System.Numerics;
using Dynamite_Doll_Wrestling.Data;
using Dynamite_Doll_Wrestling.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Nethereum.ABI.FunctionEncoding;
using Nethereum.ABI.Model;

namespace Dynamite_Doll_Wrestling.Services;

public interface IMatchService
{
    Task<MatchSession> CreateMatchSessionAsync(
        string playerAddress,
        string playerWrestlerId,
        string opponentWrestlerId,
        string difficultyLevel);

    Task<MatchSession> EndMatchSessionAsync(int sessionId, int playerFalls, int opponentFalls);
    Task<PlayerProfile> GetOrCreatePlayerAsync(string walletAddress);
    Task<List<MatchSession>> GetPlayerMatchHistoryAsync(string walletAddress, int limit = 10);
    Task<List<PlayerProfile>> GetLeaderboardAsync(int limit = 10);
    Task<PreparedRewardClaimResult> PrepareRewardClaimAsync(int sessionId, string playerAddress);
    Task<bool> CompleteRewardClaimAsync(int sessionId, string playerAddress, string transactionHash);
}

public class MatchService : IMatchService
{
    private readonly GameDbContext _context;
    private readonly IBlockchainService _blockchainService;
    private readonly BlockchainConfig _blockchainConfig;
    private readonly ILogger<MatchService> _logger;

    public MatchService(
        GameDbContext context,
        IBlockchainService blockchainService,
        IOptions<BlockchainConfig> blockchainOptions,
        ILogger<MatchService> logger)
    {
        _context = context;
        _blockchainService = blockchainService;
        _blockchainConfig = blockchainOptions.Value;
        _logger = logger;
    }

    public async Task<MatchSession> CreateMatchSessionAsync(
        string playerAddress,
        string playerWrestlerId,
        string opponentWrestlerId,
        string difficultyLevel)
    {
        var session = new MatchSession
        {
            PlayerAddress = playerAddress,
            PlayerWrestlerId = playerWrestlerId,
            OpponentWrestlerId = opponentWrestlerId,
            DifficultyLevel = difficultyLevel,
            StartedAt = DateTime.UtcNow,
            PlayerScore = 0,
            OpponentScore = 0,
            RewardClaimed = false
        };

        _context.MatchSessions.Add(session);
        await _context.SaveChangesAsync();

        return session;
    }

    public async Task<MatchSession> EndMatchSessionAsync(int sessionId, int playerFalls, int opponentFalls)
    {
        var session = await _context.MatchSessions.FindAsync(sessionId)
                      ?? throw new InvalidOperationException($"Match session {sessionId} not found");

        session.EndedAt = DateTime.UtcNow;
        session.PlayerScore = playerFalls;
        session.OpponentScore = opponentFalls;
        session.PlayerWon = playerFalls > opponentFalls;
        session.RewardAmount = ParseConfiguredRewardAmount();

        _context.MatchSessions.Update(session);
        await _context.SaveChangesAsync();

        var player = await GetOrCreatePlayerAsync(session.PlayerAddress);
        player.TotalMatches++;
        player.LastPlayedAt = DateTime.UtcNow;

        if (session.PlayerWon)
        {
            player.TotalWins++;
        }
        else
        {
            player.TotalLosses++;
        }

        _context.PlayerProfiles.Update(player);
        await _context.SaveChangesAsync();

        return session;
    }

    public async Task<PlayerProfile> GetOrCreatePlayerAsync(string walletAddress)
    {
        var player = await _context.PlayerProfiles
            .FirstOrDefaultAsync(p => p.WalletAddress == walletAddress);

        if (player == null)
        {
            player = new PlayerProfile
            {
                WalletAddress = walletAddress,
                CreatedAt = DateTime.UtcNow,
                TotalMatches = 0,
                TotalWins = 0,
                TotalLosses = 0,
                TotalRewardsEarned = 0
            };

            _context.PlayerProfiles.Add(player);
            await _context.SaveChangesAsync();
        }

        return player;
    }

    public async Task<List<MatchSession>> GetPlayerMatchHistoryAsync(string walletAddress, int limit = 10)
    {
        return await _context.MatchSessions
            .Where(m => m.PlayerAddress == walletAddress)
            .OrderByDescending(m => m.EndedAt)
            .Take(limit)
            .ToListAsync();
    }

    public async Task<List<PlayerProfile>> GetLeaderboardAsync(int limit = 10)
    {
        return await _context.PlayerProfiles
            .OrderByDescending(p => p.TotalWins)
            .ThenByDescending(p => p.TotalRewardsEarned)
            .Take(limit)
            .ToListAsync();
    }

    public async Task<PreparedRewardClaimResult> PrepareRewardClaimAsync(int sessionId, string playerAddress)
    {
        var session = await _context.MatchSessions.FindAsync(sessionId);
        if (session == null
            || session.RewardClaimed
            || string.IsNullOrWhiteSpace(playerAddress)
            || !string.Equals(session.PlayerAddress, playerAddress, StringComparison.OrdinalIgnoreCase))
        {
            return new PreparedRewardClaimResult
            {
                IsSuccessful = false,
                ErrorMessage = "This reward claim is no longer available."
            };
        }

        var rewardClaim = await _blockchainService.RequestRewardClaimAsync(
            session.PlayerAddress,
            new RewardGameProof
            {
                GameId = session.Id.ToString(),
                Mode = "wrestling",
                PlayerScore = session.PlayerScore,
                OpponentScore = session.OpponentScore,
                DifficultyLevel = session.DifficultyLevel,
                CompletedAt = session.EndedAt,
                PlayerWon = session.PlayerWon
            });

        if (!rewardClaim.IsSuccessful || rewardClaim.Payload == null)
        {
            _logger.LogWarning(
                "Reward claim failed for match {SessionId}: {Reason}",
                sessionId,
                rewardClaim.ErrorMessage ?? "Unknown error");

            return new PreparedRewardClaimResult
            {
                IsSuccessful = false,
                ErrorMessage = rewardClaim.ErrorMessage ?? "Reward payout could not be prepared.",
                DiagnosticHint = rewardClaim.DiagnosticHint
            };
        }

        return new PreparedRewardClaimResult
        {
            IsSuccessful = true,
            Payload = rewardClaim.Payload,
            Transaction = new RewardClaimTransactionRequest
            {
                VaultAddress = rewardClaim.Payload.VaultAddress,
                ChainId = rewardClaim.Payload.ChainId,
                Data = BuildRewardClaimTransactionData(rewardClaim.Payload),
                TokenAddress = _blockchainConfig.Arcade1870ContractAddress,
                TokenSymbol = "A1870",
                TokenDecimals = _blockchainConfig.RewardTokenDecimals
            }
        };
    }

    public async Task<bool> CompleteRewardClaimAsync(int sessionId, string playerAddress, string transactionHash)
    {
        if (string.IsNullOrWhiteSpace(transactionHash))
        {
            return false;
        }

        var session = await _context.MatchSessions.FindAsync(sessionId);
        if (session == null
            || string.IsNullOrWhiteSpace(playerAddress)
            || !string.Equals(session.PlayerAddress, playerAddress, StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        await using var transaction = await _context.Database.BeginTransactionAsync();
        await _context.Entry(session).ReloadAsync();

        if (session.RewardClaimed)
        {
            await transaction.CommitAsync();
            return true;
        }

        session.RewardClaimed = true;
        session.TransactionHash = transactionHash;

        var player = await _context.PlayerProfiles
            .FirstOrDefaultAsync(p => p.WalletAddress == session.PlayerAddress);

        if (player == null)
        {
            player = new PlayerProfile
            {
                WalletAddress = session.PlayerAddress,
                CreatedAt = DateTime.UtcNow,
                LastPlayedAt = session.EndedAt,
                TotalMatches = 0,
                TotalWins = 0,
                TotalLosses = 0,
                TotalRewardsEarned = 0
            };

            _context.PlayerProfiles.Add(player);
        }

        player.TotalRewardsEarned += session.RewardAmount;
        _context.MatchSessions.Update(session);
        await _context.SaveChangesAsync();
        await transaction.CommitAsync();

        _logger.LogInformation(
            "Reward claim submitted on-chain for match {SessionId}: {TransactionHash}",
            sessionId,
            transactionHash);

        return true;
    }

    private static string BuildRewardClaimTransactionData(RewardClaimPayload payload)
    {
        if (!BigInteger.TryParse(payload.Amount, out var amount) || amount <= 0)
        {
            throw new InvalidOperationException("Reward claim amount is invalid.");
        }

        if (!BigInteger.TryParse(payload.Nonce, out var nonce) || nonce < 0)
        {
            throw new InvalidOperationException("Reward claim nonce is invalid.");
        }

        if (payload.Deadline <= 0)
        {
            throw new InvalidOperationException("Reward claim deadline is invalid.");
        }

        if (!RewardSignatureHex.TryParseBytes(payload.Signature, out var signatureBytes))
        {
            throw new InvalidOperationException("Reward claim signature is invalid.");
        }

        var encoder = new FunctionCallEncoder();
        var parameters = new[]
        {
            new Parameter("uint256", "amount", 1),
            new Parameter("uint256", "nonce", 2),
            new Parameter("uint256", "deadline", 3),
            new Parameter("bytes", "signature", 4)
        };

        return encoder.EncodeRequest(
            new FunctionABI("claim", false) { InputParameters = parameters }.Sha3Signature,
            parameters,
            [
                amount,
                nonce,
                new BigInteger(payload.Deadline),
                signatureBytes
            ]);
    }

    private decimal ParseConfiguredRewardAmount()
    {
        return decimal.TryParse(_blockchainConfig.RewardAmount, out var configuredAmount)
            ? configuredAmount
            : 10m;
    }
}
