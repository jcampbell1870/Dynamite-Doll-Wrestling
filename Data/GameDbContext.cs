using Dynamite_Doll_Wrestling.Models;
using Microsoft.EntityFrameworkCore;

namespace Dynamite_Doll_Wrestling.Data;

public class GameDbContext : DbContext
{
    public GameDbContext(DbContextOptions<GameDbContext> options) : base(options)
    {
    }

    public DbSet<PlayerProfile> PlayerProfiles { get; set; } = null!;
    public DbSet<MatchSession> MatchSessions { get; set; } = null!;

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<PlayerProfile>()
            .HasMany(p => p.MatchSessions)
            .WithOne()
            .HasForeignKey("PlayerProfileId");

        modelBuilder.Entity<MatchSession>()
            .Property(m => m.RewardAmount)
            .HasPrecision(18, 8);

        modelBuilder.Entity<PlayerProfile>()
            .Property(p => p.TotalRewardsEarned)
            .HasPrecision(18, 8);

        modelBuilder.Entity<PlayerProfile>()
            .HasIndex(p => p.WalletAddress)
            .IsUnique();

        modelBuilder.Entity<MatchSession>()
            .HasIndex(m => m.PlayerAddress);
    }
}
