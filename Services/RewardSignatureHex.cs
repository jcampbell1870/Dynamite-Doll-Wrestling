using System.Linq;
using Nethereum.Hex.HexConvertors.Extensions;

namespace Dynamite_Doll_Wrestling.Services;

internal static class RewardSignatureHex
{
    public static bool TryNormalize(string? signature, out string normalizedSignatureHex)
    {
        normalizedSignatureHex = string.Empty;

        if (string.IsNullOrWhiteSpace(signature))
        {
            return false;
        }

        var normalized = signature.Trim();
        if (normalized.StartsWith("0x", StringComparison.OrdinalIgnoreCase))
        {
            normalized = normalized[2..];
        }

        if (normalized.Length % 2 != 0)
        {
            normalized = $"0{normalized}";
        }

        if (normalized.Length != 130 || !normalized.All(Uri.IsHexDigit))
        {
            return false;
        }

        var v = Convert.ToByte(normalized[^2..], 16);
        if (v is 0 or 1)
        {
            normalized = $"{normalized[..128]}{(v + 27):x2}";
        }
        else if (v is not 27 and not 28)
        {
            return false;
        }

        normalizedSignatureHex = normalized;
        return true;
    }

    public static bool TryParseBytes(string? signature, out byte[] signatureBytes)
    {
        signatureBytes = [];
        if (!TryNormalize(signature, out var normalizedSignatureHex))
        {
            return false;
        }

        signatureBytes = normalizedSignatureHex.HexToByteArray();
        return true;
    }
}
