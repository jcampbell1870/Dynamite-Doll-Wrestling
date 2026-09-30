namespace Dynamite_Doll_Wrestling.Services;

public static class RewardIssuerEndpointResolver
{
    private const string RewardClaimPath = "/api/reward-claim";

    public static bool TryGetCandidateUris(
        string configuredUrl,
        out IReadOnlyList<Uri> candidateUris,
        out string validationError)
    {
        candidateUris = [];
        validationError = string.Empty;

        var normalized = NormalizeConfiguredUrl(configuredUrl);
        if (string.IsNullOrWhiteSpace(normalized))
        {
            validationError = "Reward issuer URL is not configured.";
            return false;
        }

        if (!TryCreateAbsoluteUri(normalized, out var issuerUri))
        {
            validationError = $"Reward issuer URL is invalid: {configuredUrl}";
            return false;
        }

        if (issuerUri.Scheme != Uri.UriSchemeHttps && issuerUri.Scheme != Uri.UriSchemeHttp)
        {
            validationError = $"Reward issuer URL must use HTTP or HTTPS: {configuredUrl}";
            return false;
        }

        if (string.IsNullOrWhiteSpace(issuerUri.Host))
        {
            validationError = $"Reward issuer URL must include a host: {configuredUrl}";
            return false;
        }

        var candidates = new List<Uri> { issuerUri };
        if (ShouldAppendRewardClaimPath(issuerUri))
        {
            var builder = new UriBuilder(issuerUri)
            {
                Path = RewardClaimPath,
                Query = string.Empty,
                Fragment = string.Empty
            };

            if (!candidates.Contains(builder.Uri))
            {
                candidates.Add(builder.Uri);
            }
        }

        candidateUris = candidates;
        return true;
    }

    private static string NormalizeConfiguredUrl(string configuredUrl)
    {
        return configuredUrl.Trim().Trim('"', '\'');
    }

    private static bool TryCreateAbsoluteUri(string normalized, out Uri issuerUri)
    {
        issuerUri = null!;

        if (Uri.TryCreate(normalized, UriKind.Absolute, out var directUri) && directUri is not null)
        {
            issuerUri = directUri;
            return true;
        }

        if (Uri.TryCreate($"https://{normalized}", UriKind.Absolute, out var httpsUri) && httpsUri is not null)
        {
            issuerUri = httpsUri;
            return true;
        }

        return false;
    }

    private static bool ShouldAppendRewardClaimPath(Uri uri)
    {
        var path = uri.AbsolutePath?.Trim() ?? string.Empty;
        return string.IsNullOrEmpty(path) || path == "/";
    }
}
