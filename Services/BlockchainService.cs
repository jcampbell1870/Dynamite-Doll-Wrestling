using System.Net.Http.Json;
using System.Text.Json;
using Dynamite_Doll_Wrestling.Models;
using Microsoft.Extensions.Options;
using Nethereum.Contracts.Standards.ERC20.ContractDefinition;
using Nethereum.Web3;

namespace Dynamite_Doll_Wrestling.Services;

public interface IBlockchainService
{
    Task<RewardClaimResult> RequestRewardClaimAsync(string walletAddress, RewardGameProof gameProof);
    Task<decimal> GetTokenBalanceAsync(string walletAddress, int chainId);
    Task<bool> ValidateWalletAsync(string walletAddress);
}

public class BlockchainService : IBlockchainService
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true
    };

    private readonly BlockchainConfig _config;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<BlockchainService> _logger;

    public BlockchainService(
        IOptions<BlockchainConfig> config,
        IHttpClientFactory httpClientFactory,
        ILogger<BlockchainService> logger)
    {
        _config = config.Value;
        _httpClientFactory = httpClientFactory;
        _logger = logger;
    }

    public async Task<RewardClaimResult> RequestRewardClaimAsync(string walletAddress, RewardGameProof gameProof)
    {
        try
        {
            if (!IsValidAddress(walletAddress))
            {
                return new RewardClaimResult
                {
                    IsSuccessful = false,
                    ErrorMessage = "Invalid wallet address."
                };
            }

            if (!RewardIssuerEndpointResolver.TryGetCandidateUris(
                    _config.RewardIssuerUrl,
                    out var rewardIssuerUris,
                    out var rewardIssuerValidationError))
            {
                _logger.LogError("{RewardIssuerValidationError}", rewardIssuerValidationError);
                return new RewardClaimResult
                {
                    IsSuccessful = false,
                    ErrorMessage = "Reward issuer configuration is invalid. Please contact support.",
                    DiagnosticHint = $"Configured issuer URL: {_config.RewardIssuerUrl}"
                };
            }

            var client = _httpClientFactory.CreateClient();
            var resolvedIssuerEndpoints = string.Join(", ", rewardIssuerUris.Select(uri => uri.ToString()));
            var claimRequest = new
            {
                recipient = walletAddress,
                game = new
                {
                    gameId = gameProof.GameId,
                    mode = gameProof.Mode,
                    playerScore = gameProof.PlayerScore,
                    opponentScore = gameProof.OpponentScore,
                    difficultyLevel = gameProof.DifficultyLevel,
                    completedAt = gameProof.CompletedAt,
                    playerWon = gameProof.PlayerWon
                }
            };

            for (var issuerIndex = 0; issuerIndex < rewardIssuerUris.Count; issuerIndex++)
            {
                var rewardIssuerUri = rewardIssuerUris[issuerIndex];
                using var response = await client.PostAsJsonAsync(rewardIssuerUri, claimRequest);

                if (!response.IsSuccessStatusCode)
                {
                    var rawError = await response.Content.ReadAsStringAsync();
                    _logger.LogError(
                        "Reward issuer rejected claim for {WalletAddress}. Endpoint {IssuerEndpoint}. Status {StatusCode}: {Error}",
                        walletAddress,
                        rewardIssuerUri,
                        (int)response.StatusCode,
                        rawError);

                    var canTryFallbackEndpoint =
                        issuerIndex < rewardIssuerUris.Count - 1
                        && (response.StatusCode == System.Net.HttpStatusCode.NotFound
                            || response.StatusCode == System.Net.HttpStatusCode.MethodNotAllowed);

                    if (canTryFallbackEndpoint)
                    {
                        continue;
                    }

                    return new RewardClaimResult
                    {
                        IsSuccessful = false,
                        ErrorMessage = string.IsNullOrWhiteSpace(rawError)
                            ? $"Issuer error {(int)response.StatusCode}."
                            : rawError,
                        DiagnosticHint = $"Resolved issuer endpoint(s): {resolvedIssuerEndpoints}. Last attempted: {rewardIssuerUri}"
                    };
                }

                var payload = await response.Content.ReadFromJsonAsync<RewardClaimPayload>(JsonOptions);
                if (payload == null)
                {
                    return new RewardClaimResult
                    {
                        IsSuccessful = false,
                        ErrorMessage = "Reward issuer response was empty.",
                        DiagnosticHint = $"Resolved issuer endpoint(s): {resolvedIssuerEndpoints}. Last attempted: {rewardIssuerUri}"
                    };
                }

                if (!TryValidateClaimPayload(payload, out var validationError))
                {
                    _logger.LogError(
                        "Reward issuer returned invalid claim payload for {WalletAddress}: {ValidationError}",
                        walletAddress,
                        validationError);

                    return new RewardClaimResult
                    {
                        IsSuccessful = false,
                        ErrorMessage = validationError,
                        DiagnosticHint = $"Resolved issuer endpoint(s): {resolvedIssuerEndpoints}. Last attempted: {rewardIssuerUri}"
                    };
                }

                return new RewardClaimResult
                {
                    IsSuccessful = true,
                    Payload = payload
                };
            }

            return new RewardClaimResult
            {
                IsSuccessful = false,
                ErrorMessage = "Reward issuer did not provide a valid claim endpoint.",
                DiagnosticHint = $"Resolved issuer endpoint(s): {resolvedIssuerEndpoints}"
            };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Reward issuer call failed for wallet {WalletAddress}", walletAddress);
            return new RewardClaimResult
            {
                IsSuccessful = false,
                ErrorMessage = ex.Message,
                DiagnosticHint = $"Configured issuer URL: {_config.RewardIssuerUrl}"
            };
        }
    }

    public async Task<decimal> GetTokenBalanceAsync(string walletAddress, int chainId)
    {
        try
        {
            if (!IsValidAddress(walletAddress))
                return 0;

            var rpcUrl = GetRpcUrlForChain(chainId);
            if (string.IsNullOrEmpty(rpcUrl))
                return 0;

            var web3 = new Web3(rpcUrl);

            var balanceOfFunctionMessage = new BalanceOfFunction { Owner = walletAddress };
            var handler = web3.Eth.GetContractQueryHandler<BalanceOfFunction>();

            var balance = await handler.QueryAsync<decimal>(
                _config.Arcade1870ContractAddress,
                balanceOfFunctionMessage);

            return balance;
        }
        catch (Exception ex)
        {
            _logger.LogError("Error getting token balance: {Message}", ex.Message);
            return 0;
        }
    }

    public async Task<bool> ValidateWalletAsync(string walletAddress)
    {
        return await Task.FromResult(IsValidAddress(walletAddress));
    }

    private static bool IsValidAddress(string address)
    {
        return !string.IsNullOrEmpty(address)
               && address.StartsWith("0x", StringComparison.OrdinalIgnoreCase)
               && address.Length == 42;
    }

    private string GetRpcUrlForChain(int chainId)
    {
        return chainId switch
        {
            1 => _config.EthereumRpcUrl,
            11155111 => _config.SepoliaRpcUrl,
            137 => _config.PolygonRpcUrl,
            _ => string.Empty
        };
    }

    private bool TryValidateClaimPayload(RewardClaimPayload payload, out string error)
    {
        if (string.IsNullOrWhiteSpace(payload.Nonce))
        {
            error = "Reward claim payload is missing nonce.";
            return false;
        }

        if (string.IsNullOrWhiteSpace(payload.Signature))
        {
            error = "Reward claim payload is missing signature.";
            return false;
        }

        if (!RewardSignatureHex.TryNormalize(payload.Signature, out _))
        {
            error = "Reward claim payload contains an invalid signature.";
            return false;
        }

        if (!decimal.TryParse(payload.Amount, out var amount) || amount <= 0)
        {
            error = "Reward claim payload contains an invalid amount.";
            return false;
        }

        if (!IsValidAddress(payload.VaultAddress))
        {
            error = "Reward claim payload contains an invalid vault address.";
            return false;
        }

        if (!string.IsNullOrWhiteSpace(_config.RewardVaultAddress)
            && !string.Equals(_config.RewardVaultAddress, payload.VaultAddress, StringComparison.OrdinalIgnoreCase))
        {
            error = "Reward claim payload vault does not match configured reward vault.";
            return false;
        }

        if (payload.ChainId <= 0)
        {
            error = "Reward claim payload contains an invalid chain id.";
            return false;
        }

        if (_config.SupportedChainIds.Length > 0 && !_config.SupportedChainIds.Contains(payload.ChainId))
        {
            error = "Reward claim payload chain id is not supported by this deployment.";
            return false;
        }

        var currentUnixTime = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        if (payload.Deadline <= currentUnixTime)
        {
            error = "Reward claim payload has expired.";
            return false;
        }

        error = string.Empty;
        return true;
    }
}
