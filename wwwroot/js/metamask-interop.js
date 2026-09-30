// MetaMask interoperability for Dynamite Doll Wrestling.
// Mirrors the Crypto Hockey reward payout flow so Arcade1870 claims behave identically.
window.metamaskInterop = {
    getProvider: function () {
        if (typeof window.ethereum === 'undefined') {
            return null;
        }

        if (Array.isArray(window.ethereum.providers)) {
            const metaMaskProvider = window.ethereum.providers.find(provider => provider && provider.isMetaMask);
            return metaMaskProvider || null;
        }

        return window.ethereum.isMetaMask ? window.ethereum : null;
    },

    // Check if MetaMask is installed
    isMetaMaskInstalled: function () {
        return !!this.getProvider();
    },

    waitForProvider: async function (timeoutMs = 1200) {
        const provider = this.getProvider();
        if (provider) {
            return provider;
        }

        const pollIntervalMs = 100;
        const maxAttempts = Math.ceil(timeoutMs / pollIntervalMs);

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
            const polledProvider = this.getProvider();
            if (polledProvider) {
                return polledProvider;
            }
        }

        return null;
    },

    isMobileDevice: function () {
        const userAgent = navigator.userAgent || navigator.vendor || window.opera || '';
        return /android|iphone|ipad|ipod/i.test(userAgent);
    },

    isInAppBrowser: function () {
        const userAgent = navigator.userAgent || '';
        return /(Twitter|FBAN|FBAV|Instagram|Line)/i.test(userAgent);
    },

    isMetaMaskAppBrowser: function () {
        const userAgent = navigator.userAgent || '';
        return /MetaMaskMobile/i.test(userAgent);
    },

    getMetaMaskDeepLink: function () {
        return this.getMetaMaskDeepLinkForUrl(window.location.href);
    },

    getMetaMaskDeepLinkForUrl: function (targetUrl) {
        const normalizedUrl = targetUrl.replace(/^https?:\/\//i, '');
        return `https://link.metamask.io/dapp/${encodeURI(normalizedUrl)}`;
    },

    openInMetaMask: function () {
        if (!this.isMobileDevice()) {
            return false;
        }

        const deepLink = this.getMetaMaskDeepLink();
        window.location.assign(deepLink);
        return true;
    },

    openMatchInMetaMask: function () {
        const gameUrl = new URL('/match/autoconnect', window.location.origin).href;

        if (!this.isMobileDevice()) {
            window.location.assign(gameUrl);
            return false;
        }

        const deepLink = this.getMetaMaskDeepLinkForUrl(gameUrl);
        window.location.assign(deepLink);
        return true;
    },

    // Connect to MetaMask wallet
    connectWallet: async function () {
        try {
            const provider = await this.waitForProvider();
            if (!provider) {
                return {
                    isConnected: false,
                    address: null,
                    chainId: 0,
                    chainName: 'Unknown',
                    balance: 0
                };
            }

            // Request account access
            const accounts = await provider.request({
                method: 'eth_requestAccounts'
            });

            if (!accounts || accounts.length === 0) {
                return {
                    isConnected: false,
                    address: null,
                    chainId: 0,
                    chainName: 'Unknown',
                    balance: 0
                };
            }

            const address = accounts[0];
            const chainId = await provider.request({ method: 'eth_chainId' });
            const chainIdNumber = parseInt(chainId, 16);
            const chainName = this.getChainName(chainIdNumber);

            // Get balance
            const balance = await provider.request({
                method: 'eth_getBalance',
                params: [address, 'latest']
            });

            const balanceInEther = parseInt(balance, 16) / Math.pow(10, 18);

            return {
                isConnected: true,
                address: address,
                chainId: chainIdNumber,
                chainName: chainName,
                balance: balanceInEther
            };
        } catch (error) {
            console.error('Error connecting wallet:', error);
            return {
                isConnected: false,
                address: null,
                chainId: 0,
                chainName: 'Unknown',
                balance: 0
            };
        }
    },

    // Get current wallet state
    getWalletState: async function () {
        try {
            const provider = await this.waitForProvider();
            if (!provider) {
                return {
                    isConnected: false,
                    address: null,
                    chainId: 0,
                    chainName: 'Unknown',
                    balance: 0
                };
            }

            const accounts = await provider.request({
                method: 'eth_accounts'
            });

            if (!accounts || accounts.length === 0) {
                return {
                    isConnected: false,
                    address: null,
                    chainId: 0,
                    chainName: 'Unknown',
                    balance: 0
                };
            }

            const address = accounts[0];
            const chainId = await provider.request({ method: 'eth_chainId' });
            const chainIdNumber = parseInt(chainId, 16);
            const chainName = this.getChainName(chainIdNumber);

            const balance = await provider.request({
                method: 'eth_getBalance',
                params: [address, 'latest']
            });

            const balanceInEther = parseInt(balance, 16) / Math.pow(10, 18);

            return {
                isConnected: true,
                address: address,
                chainId: chainIdNumber,
                chainName: chainName,
                balance: balanceInEther
            };
        } catch (error) {
            console.error('Error getting wallet state:', error);
            return {
                isConnected: false,
                address: null,
                chainId: 0,
                chainName: 'Unknown',
                balance: 0
            };
        }
    },

    // Disconnect wallet
    disconnectWallet: function () {
        try {
            // Note: MetaMask doesn't have a built-in disconnect method
            // We just clear our local state; user must disconnect in MetaMask UI
            console.log('Wallet disconnected from application');
        } catch (error) {
            console.error('Error disconnecting wallet:', error);
        }
    },

    // Switch to a different network
    switchNetwork: async function (chainId) {
        try {
            const provider = await this.waitForProvider();
            if (!provider) {
                return false;
            }

            const hexChainId = '0x' + chainId.toString(16);

            try {
                await provider.request({
                    method: 'wallet_switchEthereumChain',
                    params: [{ chainId: hexChainId }],
                });
                return true;
            } catch (switchError) {
                // This error code indicates that the chain has not been added to MetaMask
                if (switchError.code === 4902) {
                    const chainData = this.getChainData(chainId);
                    if (chainData) {
                        await provider.request({
                            method: 'wallet_addEthereumChain',
                            params: [chainData],
                        });
                        return true;
                    }
                }
                throw switchError;
            }
        } catch (error) {
            console.error('Error switching network:', error);
            return false;
        }
    },

    // Helper: Get chain name
    getChainName: function (chainId) {
        const chains = {
            1: 'Ethereum Mainnet',
            11155111: 'Sepolia Testnet',
            137: 'Polygon Mainnet',
            80001: 'Polygon Mumbai'
        };
        return chains[chainId] || 'Unknown Network';
    },

    getNativeTokenSymbol: function (chainId) {
        const nativeTokens = {
            1: 'ETH',
            11155111: 'Sepolia ETH',
            137: 'POL'
        };
        return nativeTokens[chainId] || 'native token';
    },

    formatWeiToNative: function (valueWei, precision = 6) {
        const wei = BigInt(valueWei);
        const divisor = 1000000000000000000n;
        const whole = wei / divisor;
        const fraction = wei % divisor;
        const fractionText = fraction.toString().padStart(18, '0').slice(0, precision).replace(/0+$/, '');
        return fractionText.length > 0 ? `${whole.toString()}.${fractionText}` : whole.toString();
    },

    // Helper: Get chain configuration for adding to MetaMask
    getChainData: function (chainId) {
        const chainDataMap = {
            11155111: {
                chainId: '0xaa36a7',
                chainName: 'Sepolia',
                nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
                rpcUrls: ['https://eth-sepolia.g.alchemy.com/v2/demo'],
                blockExplorerUrls: ['https://sepolia.etherscan.io']
            },
            137: {
                chainId: '0x89',
                chainName: 'Polygon',
                nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
                rpcUrls: ['https://polygon-rpc.com'],
                blockExplorerUrls: ['https://polygonscan.com']
            }
        };
        return chainDataMap[chainId] || null;
    },

    // Send a transaction
    sendTransaction: async function (to, value, data) {
        try {
            if (!this.isMetaMaskInstalled()) {
                throw new Error('MetaMask is not installed');
            }

            const provider = this.getProvider();
            if (!provider) {
                throw new Error('MetaMask provider not found');
            }

            const accounts = await provider.request({
                method: 'eth_accounts'
            });

            if (!accounts || accounts.length === 0) {
                throw new Error('No accounts found');
            }

            const txHash = await provider.request({
                method: 'eth_sendTransaction',
                params: [{
                    from: accounts[0],
                    to: to,
                    value: value,
                    data: data
                }],
            });

            return txHash;
        } catch (error) {
            console.error('Error sending transaction:', error);
            throw error;
        }
    },

    ensureRewardTokenVisible: async function (provider, request) {
        if (!provider
            || !request
            || !request.tokenAddress
            || !request.tokenSymbol
            || !Number.isInteger(request.tokenDecimals)
            || request.tokenDecimals < 0) {
            return false;
        }

        try {
            return await provider.request({
                method: 'wallet_watchAsset',
                params: {
                    type: 'ERC20',
                    options: {
                        address: request.tokenAddress,
                        symbol: request.tokenSymbol,
                        decimals: request.tokenDecimals
                    }
                }
            });
        } catch (error) {
            console.warn('Unable to add Arcade1870 token to MetaMask asset list:', error);
            return false;
        }
    },

    waitForTransactionReceipt: async function (provider, transactionHash, maxAttempts = 30, delayMs = 2000) {
        if (!provider || !transactionHash) {
            return null;
        }

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const receipt = await provider.request({
                method: 'eth_getTransactionReceipt',
                params: [transactionHash]
            });

            if (receipt) {
                return receipt;
            }

            if (attempt < maxAttempts - 1) {
                await new Promise(resolve => setTimeout(resolve, delayMs));
            }
        }

        return null;
    },

    submitRewardClaim: async function (request) {
        try {
            if (!request || !request.vaultAddress || !request.data) {
                throw new Error('Reward claim transaction data is incomplete.');
            }

            const provider = await this.waitForProvider();
            if (!provider) {
                throw new Error('MetaMask provider not found');
            }

            if (request.chainId > 0) {
                const currentChainId = await provider.request({ method: 'eth_chainId' });
                const currentChainIdNumber = parseInt(currentChainId, 16);

                if (currentChainIdNumber !== request.chainId) {
                    const switched = await this.switchNetwork(request.chainId);
                    if (!switched) {
                        throw new Error(`Please switch MetaMask to ${this.getChainName(request.chainId)} and try again.`);
                    }
                }
            }

            const accounts = await provider.request({
                method: 'eth_requestAccounts'
            });

            if (!accounts || accounts.length === 0) {
                throw new Error('No accounts found');
            }

            const txParams = {
                from: accounts[0],
                to: request.vaultAddress,
                data: request.data
            };

            const [estimatedGasHex, gasPriceHex, latestBlock, priorityFeeHex, balanceHex] = await Promise.all([
                provider.request({
                    method: 'eth_estimateGas',
                    params: [txParams]
                }),
                provider.request({
                    method: 'eth_gasPrice'
                }),
                provider.request({
                    method: 'eth_getBlockByNumber',
                    params: ['latest', false]
                }),
                provider.request({
                    method: 'eth_maxPriorityFeePerGas'
                }).catch(() => null),
                provider.request({
                    method: 'eth_getBalance',
                    params: [accounts[0], 'latest']
                })
            ]);

            const estimatedGasWei = BigInt(estimatedGasHex);
            const gasPriceWei = BigInt(gasPriceHex);
            const availableBalanceWei = BigInt(balanceHex);
            const baseFeeWei = latestBlock && latestBlock.baseFeePerGas
                ? BigInt(latestBlock.baseFeePerGas)
                : null;
            const priorityFeeWei = priorityFeeHex
                ? BigInt(priorityFeeHex)
                : (gasPriceWei > 0n ? gasPriceWei / 10n : 1500000000n);
            const effectiveGasPriceWei = baseFeeWei === null
                ? gasPriceWei
                : (baseFeeWei * 2n) + priorityFeeWei;
            const estimatedFeeWei = estimatedGasWei * effectiveGasPriceWei;

            txParams.gas = `0x${estimatedGasWei.toString(16)}`;
            if (baseFeeWei !== null) {
                txParams.type = '0x2';
                txParams.maxPriorityFeePerGas = `0x${priorityFeeWei.toString(16)}`;
                txParams.maxFeePerGas = `0x${effectiveGasPriceWei.toString(16)}`;
            } else {
                txParams.gasPrice = `0x${effectiveGasPriceWei.toString(16)}`;
            }

            if (availableBalanceWei < estimatedFeeWei) {
                const chainName = this.getChainName(request.chainId);
                const nativeToken = this.getNativeTokenSymbol(request.chainId);
                const required = this.formatWeiToNative(estimatedFeeWei);
                const available = this.formatWeiToNative(availableBalanceWei);

                return {
                    isSuccessful: false,
                    transactionHash: null,
                    errorCode: 'LOW_GAS',
                    errorMessage: `Insufficient ${nativeToken} for gas on ${chainName}. Estimated needed: ~${required} ${nativeToken}; current wallet balance: ~${available} ${nativeToken}.`
                };
            }

            const txHash = await provider.request({
                method: 'eth_sendTransaction',
                params: [txParams],
            });

            this.waitForTransactionReceipt(provider, txHash)
                .then(async receipt => {
                    const status = receipt?.status;
                    const transactionSucceeded = status === true || status === '0x1' || status === '0x01';

                    if (transactionSucceeded) {
                        await this.ensureRewardTokenVisible(provider, request);
                    }
                })
                .catch(error => {
                    console.warn('Unable to confirm reward claim transaction for token visibility prompt:', error);
                });

            return {
                isSuccessful: true,
                transactionHash: txHash,
                errorCode: null,
                errorMessage: null
            };
        } catch (error) {
            console.error('Error submitting reward claim:', error);

            let errorCode = null;
            let errorMessage = 'Reward transaction could not be submitted.';
            if (error && error.code === 4001) {
                errorCode = 'USER_REJECTED';
                errorMessage = 'Reward claim was cancelled in MetaMask.';
            } else if (error && typeof error.message === 'string' && error.message.trim().length > 0) {
                errorMessage = error.message;
            }

            return {
                isSuccessful: false,
                transactionHash: null,
                errorCode: errorCode,
                errorMessage: errorMessage
            };
        }
    }
};
