# Dynamite Doll Wrestling

A 2D all-female wrestling game for Windows PC, played in the style of the 1990
Nintendo Entertainment System classic *WWF WrestleMania Challenge*: chunky pixel
sprites, a side-on ring, best-of-three falls, and a three count that you have to
mash your way out of.

The headliner is **Bronwyne "Dynamite Doll" Billington**, daughter of 1980s WWF
tag team champion Tom "Dynamite Kid" Billington of the British Bulldogs. She is
the highest rated competitor on the roster.

Dynamite Doll Wrestling is a crypto game. It uses the **same reward payout
system as Crypto Hockey**: an EIP-712 signed claim is issued by the server, and
the player redeems it from the `Arcade1870RewardVault` contract through MetaMask
to receive **Arcade1870 (A1870)** tokens.

| | |
|---|---|
| Reward token | Arcade1870 (A1870) |
| Token contract | `0x8eddD4edea39c5B5f77662453600F53A202EE47C` |

## Running the game on Windows

Requirements: the [.NET 10 SDK](https://dotnet.microsoft.com/download), a modern
browser, and the [MetaMask](https://metamask.io/) extension if you want to claim
rewards.

```powershell
git clone https://github.com/jcampbell1870/Dynamite-Doll-Wrestling.git
cd Dynamite-Doll-Wrestling
dotnet run
```

Then open the URL printed in the console (for example `https://localhost:7229`)
and go to **Match**.

## Controls

| Key | Action |
|---|---|
| Left / Right arrow (or `A` / `D`) | Walk around the ring |
| `Z` | Strike - fast, chips the health meter |
| `X` | Grapple - slower, real damage, builds momentum |
| `C` | Signature move - needs a full momentum meter |
| `Space` | Go for the cover |
| Any action key while being covered | Mash to kick out |

Moves only connect when you are close enough to your opponent, and a cover will
not be accepted until her health meter has dropped low enough. First wrestler to
two falls wins the bout.

## Roster

| Wrestler | Nickname | Overall |
|---|---|---|
| Bronwyne Billington | The Dynamite Doll | 10 |
| The rest of the card | see the in-game **Roster** page | 6 - 9 |

Bronwyne is the only real person represented in the game; every other wrestler
is an original fictional character.

## Arcade1870 rewards

The reward pipeline is a direct port of the Crypto Hockey payout system:

1. A match finishes and the browser reports the result to the server.
2. `RewardClaimIssuerService` builds an EIP-712 `Claim(address recipient,
   uint256 amount, uint256 nonce, uint256 deadline)` digest for the
   `Arcade1870RewardVault` domain and signs it with the reward signer key.
   Claims are memoised per match id, so a match can never be paid twice and the
   claim is locked to the wallet that earned it.
3. `BlockchainService` validates the issued claim (signature shape, amount,
   vault address, chain support, deadline) before it is shown to the player.
4. `MatchService` ABI-encodes the `claim(uint256,uint256,uint256,bytes)` call
   and MetaMask asks the player to sign the redemption transaction.
5. The resulting transaction hash is recorded against the player's profile.

### Configuration

`appsettings.json` holds the public settings:

```json
"BlockchainConfig": {
  "Arcade1870ContractAddress": "0x8eddD4edea39c5B5f77662453600F53A202EE47C",
  "RewardVaultAddress": "0x1e4f6e4a382adbdb662733a19ae773d3ab8f497d",
  "RewardAmount": "10",
  "SupportedChainIds": [ 1, 11155111, 137 ]
}
```

Secrets must **never** be committed. Supply them with user secrets or
environment variables:

```powershell
dotnet user-secrets set "BlockchainConfig:RewardSignerPrivateKey" "<signer key>"
dotnet user-secrets set "BlockchainConfig:RewardIssuerUrl" "https://your-host/api/reward-claim"
```

`GET /health/reward-issuer` reports whether the signer is configured correctly.

## Project layout

| Path | Contents |
|---|---|
| `Components/Pages/Match.razor` | The gameplay page, wallet flow and reward claim UI |
| `wwwroot/js/wrestling-renderer.js` | The 2D canvas match engine and renderer |
| `Services/MatchEngine.cs` | Server side model of the same match rules |
| `Services/RewardClaimIssuerService.cs` | EIP-712 claim signing |
| `Services/BlockchainService.cs` | Claim validation and A1870 balance reads |
| `Services/MatchService.cs` | Match sessions, player profiles, reward records |
| `Services/RosterService.cs` | The wrestler roster |
| `Data/GameDbContext.cs` | EF Core context (SQL Server, SQLite fallback) |

## Disclaimer

This is a fan-made, non-commercial tribute project. It is not affiliated with,
endorsed by, or sponsored by WWE, Nintendo, or any other rights holder.
