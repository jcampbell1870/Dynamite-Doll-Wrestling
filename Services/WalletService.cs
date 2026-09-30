using Dynamite_Doll_Wrestling.Models;
using Microsoft.JSInterop;

namespace Dynamite_Doll_Wrestling.Services;

public interface IWalletService
{
    Task<WalletConnectionState> ConnectWalletAsync();
    Task<WalletConnectionState> GetWalletStateAsync();
    Task DisconnectWalletAsync();
    Task<bool> SwitchNetworkAsync(int chainId);
    Task<WalletTransactionResult> SubmitRewardClaimAsync(RewardClaimTransactionRequest request);
}

public class WalletService : IWalletService
{
    private readonly IJSRuntime _jsRuntime;
    private readonly ILogger<WalletService> _logger;

    public WalletService(IJSRuntime jsRuntime, ILogger<WalletService> logger)
    {
        _jsRuntime = jsRuntime;
        _logger = logger;
    }

    public async Task<WalletConnectionState> ConnectWalletAsync()
    {
        try
        {
            return await _jsRuntime.InvokeAsync<WalletConnectionState>("window.metamaskInterop.connectWallet");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error connecting wallet.");
            return new WalletConnectionState { IsConnected = false };
        }
    }

    public async Task<WalletConnectionState> GetWalletStateAsync()
    {
        try
        {
            return await _jsRuntime.InvokeAsync<WalletConnectionState>("window.metamaskInterop.getWalletState");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting wallet state.");
            return new WalletConnectionState { IsConnected = false };
        }
    }

    public async Task DisconnectWalletAsync()
    {
        try
        {
            await _jsRuntime.InvokeVoidAsync("window.metamaskInterop.disconnectWallet");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error disconnecting wallet.");
        }
    }

    public async Task<bool> SwitchNetworkAsync(int chainId)
    {
        try
        {
            return await _jsRuntime.InvokeAsync<bool>("window.metamaskInterop.switchNetwork", chainId);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error switching network.");
            return false;
        }
    }

    public async Task<WalletTransactionResult> SubmitRewardClaimAsync(RewardClaimTransactionRequest request)
    {
        try
        {
            return await _jsRuntime.InvokeAsync<WalletTransactionResult>(
                "window.metamaskInterop.submitRewardClaim",
                request);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error submitting reward claim transaction.");
            return new WalletTransactionResult
            {
                IsSuccessful = false,
                ErrorMessage = "Reward transaction could not be submitted."
            };
        }
    }
}
