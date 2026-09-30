namespace Dynamite_Doll_Wrestling.Models;

public class PlayerProfile
{
    public int Id { get; set; }
    public string WalletAddress { get; set; } = string.Empty;
    public int TotalMatches { get; set; }
    public int TotalWins { get; set; }
    public int TotalLosses { get; set; }
    public decimal TotalRewardsEarned { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime LastPlayedAt { get; set; }
    public List<MatchSession> MatchSessions { get; set; } = [];

    public double WinRate => TotalMatches == 0 ? 0 : (double)TotalWins / TotalMatches * 100;
}
