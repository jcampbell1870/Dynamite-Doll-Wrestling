namespace Dynamite_Doll_Wrestling.Models;

public class BlockchainConfig
{
    public string Arcade1870ContractAddress { get; set; } = string.Empty;
    public string RewardVaultAddress { get; set; } = string.Empty;
    public string RewardIssuerUrl { get; set; } = string.Empty;
    public string RewardSignerPrivateKey { get; set; } = string.Empty;
    public string RewardSignerAddress { get; set; } = string.Empty;
    public string RewardAmount { get; set; } = "10";
    public int RewardTokenDecimals { get; set; } = 18;
    public int RewardClaimTtlSeconds { get; set; } = 600;
    public string EthereumRpcUrl { get; set; } = string.Empty;
    public string SepoliaRpcUrl { get; set; } = string.Empty;
    public string PolygonRpcUrl { get; set; } = string.Empty;
    public int DefaultNetworkChainId { get; set; } = 1;
    public int[] SupportedChainIds { get; set; } = [];
}
