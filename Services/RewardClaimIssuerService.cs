using System.Collections.Concurrent;
using System.Numerics;
using Dynamite_Doll_Wrestling.Models;
using Microsoft.Extensions.Options;
using Nethereum.ABI;
using Nethereum.Hex.HexConvertors.Extensions;
using Nethereum.Signer;
using Nethereum.Util;

namespace Dynamite_Doll_Wrestling.Services;

public interface IRewardClaimIssuerService
{
    bool TryCreateClaim(RewardClaimIssueRequest request, out RewardClaimPayload? payload, out string? error);
}

public sealed class RewardClaimIssueRequest
{
    public string Recipient { get; set; } = string.Empty;
    public RewardGameProof Game { get; set; } = new();
}

/// <summary>
/// Issues EIP-712 signed Arcade1870 reward claims. This mirrors the Crypto Hockey reward
/// payout system so a single Arcade1870RewardVault deployment can serve both games.
/// </summary>
public class RewardClaimIssuerService : IRewardClaimIssuerService
{
    private static readonly byte[] Eip712DomainTypeHash =
        new Sha3Keccack().CalculateHash(
            "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)")
        .HexToByteArray();

    private static readonly byte[] ClaimTypeHash =
        new Sha3Keccack().CalculateHash(
            "Claim(address recipient,uint256 amount,uint256 nonce,uint256 deadline)")
        .HexToByteArray();

    private static readonly byte[] NameHash =
        new Sha3Keccack().CalculateHash("Arcade1870RewardVault").HexToByteArray();

    private static readonly byte[] VersionHash =
        new Sha3Keccack().CalculateHash("1").HexToByteArray();

    private static readonly TimeSpan SweepInterval = TimeSpan.FromMinutes(5);

    private readonly BlockchainConfig _config;
    private readonly ILogger<RewardClaimIssuerService> _logger;
    private readonly ConcurrentDictionary<string, Lazy<IssuedRewardClaim>> _issuedClaims = new();
    private long _nonceCounter;
    private long _lastSweepTicks = DateTimeOffset.UtcNow.UtcTicks;

    public RewardClaimIssuerService(
        IOptions<BlockchainConfig> config,
        ILogger<RewardClaimIssuerService> logger)
    {
        _config = config.Value;
        _logger = logger;
    }

    public bool TryCreateClaim(RewardClaimIssueRequest request, out RewardClaimPayload? payload, out string? error)
    {
        payload = null;
        error = null;

        if (!IsValidAddress(request.Recipient))
        {
            error = "A valid recipient address is required.";
            return false;
        }

        if (request.Game is null || string.IsNullOrWhiteSpace(request.Game.GameId))
        {
            error = "A completed match id is required.";
            return false;
        }

        if (string.IsNullOrWhiteSpace(_config.RewardVaultAddress) || !IsValidAddress(_config.RewardVaultAddress))
        {
            error = "Reward vault is not configured.";
            return false;
        }

        if (!TryParsePrivateKey(_config.RewardSignerPrivateKey, out var signerKey))
        {
            error = "Reward signer is not configured.";
            return false;
        }

        if (!ValidateConfiguredSigner(signerKey, out error))
        {
            return false;
        }

        if (_config.DefaultNetworkChainId <= 0)
        {
            error = "Reward issuer chain id is invalid.";
            return false;
        }

        if (!decimal.TryParse(_config.RewardAmount, out var rewardAmountDecimal) || rewardAmountDecimal <= 0)
        {
            error = "Reward amount configuration is invalid.";
            return false;
        }

        if (_config.RewardTokenDecimals < 0)
        {
            error = "Reward token decimals configuration is invalid.";
            return false;
        }

        var normalizedRecipient = request.Recipient.ToLowerInvariant();
        var normalizedGameId = request.Game.GameId.Trim().ToLowerInvariant();
        var now = DateTimeOffset.UtcNow;

        TryRemoveExpiredClaim(normalizedGameId, now);
        SweepExpiredClaims(now);

        try
        {
            var issuedClaim = GetOrCreateIssuedClaim(
                normalizedGameId,
                normalizedRecipient,
                request.Recipient,
                signerKey,
                rewardAmountDecimal);

            if (!string.Equals(issuedClaim.Recipient, normalizedRecipient, StringComparison.Ordinal))
            {
                error = "This completed match has already been rewarded.";
                return false;
            }

            payload = ClonePayload(issuedClaim.Payload);
            return true;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Reward claim signing failed.");
            _issuedClaims.TryRemove(normalizedGameId, out _);
            error = "EIP-712 reward signing failed. Verify reward signer key, chain id, and vault address.";
            return false;
        }
    }

    private void TryRemoveExpiredClaim(string normalizedGameId, DateTimeOffset now)
    {
        if (_issuedClaims.TryGetValue(normalizedGameId, out var issuedClaim)
            && issuedClaim.IsValueCreated
            && issuedClaim.Value.ExpiresAt <= now)
        {
            _issuedClaims.TryRemove(normalizedGameId, out _);
        }
    }

    /// <summary>
    /// Periodically drops every expired claim so the memo table cannot grow without bound
    /// for the lifetime of this singleton.
    /// </summary>
    private void SweepExpiredClaims(DateTimeOffset now)
    {
        var lastSweep = Interlocked.Read(ref _lastSweepTicks);
        if (now.UtcTicks - lastSweep < SweepInterval.Ticks)
        {
            return;
        }

        if (Interlocked.CompareExchange(ref _lastSweepTicks, now.UtcTicks, lastSweep) != lastSweep)
        {
            return;
        }

        foreach (var entry in _issuedClaims)
        {
            if (entry.Value.IsValueCreated && entry.Value.Value.ExpiresAt <= now)
            {
                _issuedClaims.TryRemove(entry.Key, out _);
            }
        }
    }

    private IssuedRewardClaim GetOrCreateIssuedClaim(
        string normalizedGameId,
        string normalizedRecipient,
        string recipient,
        EthECKey signerKey,
        decimal rewardAmountDecimal)
    {
        var lazyClaim = _issuedClaims.GetOrAdd(
            normalizedGameId,
            _ => new Lazy<IssuedRewardClaim>(
                () => CreateIssuedClaim(normalizedRecipient, recipient, signerKey, rewardAmountDecimal),
                LazyThreadSafetyMode.ExecutionAndPublication));

        return lazyClaim.Value;
    }

    private IssuedRewardClaim CreateIssuedClaim(
        string normalizedRecipient,
        string recipient,
        EthECKey signerKey,
        decimal rewardAmountDecimal)
    {
        var tokenUnitAmount = UnitConversion.Convert.ToWei(rewardAmountDecimal, _config.RewardTokenDecimals);
        var nonce = (BigInteger)DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() * 1000
                    + Interlocked.Increment(ref _nonceCounter);
        var deadline = DateTimeOffset.UtcNow.ToUnixTimeSeconds() + Math.Max(60, _config.RewardClaimTtlSeconds);
        var signature = SignClaim(
            signerKey,
            recipient,
            tokenUnitAmount,
            nonce,
            new BigInteger(deadline),
            _config.DefaultNetworkChainId,
            _config.RewardVaultAddress);

        return new IssuedRewardClaim(
            normalizedRecipient,
            new RewardClaimPayload
            {
                Amount = tokenUnitAmount.ToString(),
                Nonce = nonce.ToString(),
                Deadline = deadline,
                Signature = signature,
                VaultAddress = _config.RewardVaultAddress,
                ChainId = _config.DefaultNetworkChainId
            },
            DateTimeOffset.FromUnixTimeSeconds(deadline));
    }

    private bool ValidateConfiguredSigner(EthECKey signerKey, out string? error)
    {
        error = null;
        if (string.IsNullOrWhiteSpace(_config.RewardSignerAddress))
        {
            return true;
        }

        if (!IsValidAddress(_config.RewardSignerAddress))
        {
            error = "Reward signer address configuration is invalid.";
            return false;
        }

        if (!string.Equals(
                signerKey.GetPublicAddress(),
                _config.RewardSignerAddress,
                StringComparison.OrdinalIgnoreCase))
        {
            error = "Reward signer does not match configuration.";
            return false;
        }

        return true;
    }

    private static bool TryParsePrivateKey(string value, out EthECKey signerKey)
    {
        signerKey = null!;
        var normalized = value.Trim();
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return false;
        }

        if (normalized.StartsWith("0x", StringComparison.OrdinalIgnoreCase))
        {
            normalized = normalized[2..];
        }

        try
        {
            signerKey = new EthECKey(normalized);
            return true;
        }
        catch
        {
            return false;
        }
    }

    private static string SignClaim(
        EthECKey signerKey,
        string recipient,
        BigInteger amount,
        BigInteger nonce,
        BigInteger deadline,
        int chainId,
        string rewardVaultAddress)
    {
        var abiEncode = new ABIEncode();

        var domainSeparatorInput = abiEncode.GetABIEncoded(
            new ABIValue("bytes32", Eip712DomainTypeHash),
            new ABIValue("bytes32", NameHash),
            new ABIValue("bytes32", VersionHash),
            new ABIValue("uint256", new BigInteger(chainId)),
            new ABIValue("address", rewardVaultAddress));

        var domainSeparator = new Sha3Keccack().CalculateHash(domainSeparatorInput);

        var claimInput = abiEncode.GetABIEncoded(
            new ABIValue("bytes32", ClaimTypeHash),
            new ABIValue("address", recipient),
            new ABIValue("uint256", amount),
            new ABIValue("uint256", nonce),
            new ABIValue("uint256", deadline));

        var structHash = new Sha3Keccack().CalculateHash(claimInput);

        var digestInput = new byte[66];
        digestInput[0] = 0x19;
        digestInput[1] = 0x01;
        Buffer.BlockCopy(domainSeparator, 0, digestInput, 2, 32);
        Buffer.BlockCopy(structHash, 0, digestInput, 34, 32);
        var digest = new Sha3Keccack().CalculateHash(digestInput);

        var signature = signerKey.SignAndCalculateV(digest);
        var signatureHex = EthECDSASignature.CreateStringSignature(signature);
        if (!RewardSignatureHex.TryNormalize(signatureHex, out var normalizedSignatureHex))
        {
            throw new InvalidOperationException("Generated reward signature has an invalid length.");
        }

        return $"0x{normalizedSignatureHex}";
    }

    private static bool IsValidAddress(string address)
    {
        return !string.IsNullOrWhiteSpace(address)
               && address.StartsWith("0x", StringComparison.OrdinalIgnoreCase)
               && address.Length == 42;
    }

    private static RewardClaimPayload ClonePayload(RewardClaimPayload payload)
    {
        return new RewardClaimPayload
        {
            Amount = payload.Amount,
            Nonce = payload.Nonce,
            Deadline = payload.Deadline,
            Signature = payload.Signature,
            VaultAddress = payload.VaultAddress,
            ChainId = payload.ChainId
        };
    }

    private sealed record IssuedRewardClaim(
        string Recipient,
        RewardClaimPayload Payload,
        DateTimeOffset ExpiresAt);
}
