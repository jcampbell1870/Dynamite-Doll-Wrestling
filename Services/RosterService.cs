using Dynamite_Doll_Wrestling.Models;

namespace Dynamite_Doll_Wrestling.Services;

public interface IRosterService
{
    IReadOnlyList<Wrestler> GetRoster();
    Wrestler GetHeadliner();
    Wrestler? FindById(string? id);
    Wrestler GetByIdOrDefault(string? id);
}

/// <summary>
/// Static all-female roster for Dynamite Doll Wrestling.
/// Bronwyne "Dynamite Doll" Billington is deliberately the strongest competitor in the game.
/// Every other competitor is an original fictional character.
/// </summary>
public class RosterService : IRosterService
{
    public const string HeadlinerId = "dynamite-doll";

    private static readonly IReadOnlyList<Wrestler> Roster =
    [
        new Wrestler
        {
            Id = HeadlinerId,
            Name = "Bronwyne Billington",
            Nickname = "The Dynamite Doll",
            Hometown = "Calgary, Alberta",
            SignatureMove = "Dynamite Diving Headbutt",
            Bio = "Daughter of British Bulldogs and WWF tag team champion Tom \"Dynamite Kid\" Billington. "
                  + "She carries the family snap suplex and diving headbutt into a new era and headlines every card.",
            PrimaryColor = "#e01b24",
            AccentColor = "#ffd44d",
            Power = 10,
            Speed = 10,
            Technique = 10,
            Stamina = 9,
            IsHeadliner = true
        },
        new Wrestler
        {
            Id = "steel-city-siren",
            Name = "Marlowe Vance",
            Nickname = "Steel City Siren",
            Hometown = "Sheffield, England",
            SignatureMove = "Foundry Slam",
            Bio = "A mat-based bruiser who wears opponents down with heavy European uppercuts.",
            PrimaryColor = "#4a6fa5",
            AccentColor = "#d9e4f5",
            Power = 9,
            Speed = 6,
            Technique = 7,
            Stamina = 8
        },
        new Wrestler
        {
            Id = "prairie-cyclone",
            Name = "Josie Kestrel",
            Nickname = "Prairie Cyclone",
            Hometown = "Regina, Saskatchewan",
            SignatureMove = "Cyclone Dropkick",
            Bio = "Fastest feet on the roster. Lives and dies by the springboard.",
            PrimaryColor = "#2f9e68",
            AccentColor = "#f7f7c6",
            Power = 6,
            Speed = 9,
            Technique = 8,
            Stamina = 7
        },
        new Wrestler
        {
            Id = "midnight-mamba",
            Name = "Rosa Delacroix",
            Nickname = "Midnight Mamba",
            Hometown = "New Orleans, Louisiana",
            SignatureMove = "Bayou Backbreaker",
            Bio = "Submission specialist who hunts the arm from the opening bell.",
            PrimaryColor = "#6a3fa0",
            AccentColor = "#f0c419",
            Power = 7,
            Speed = 7,
            Technique = 9,
            Stamina = 7
        },
        new Wrestler
        {
            Id = "tundra-titan",
            Name = "Ingrid Halvorsen",
            Nickname = "Tundra Titan",
            Hometown = "Tromso, Norway",
            SignatureMove = "Glacier Powerbomb",
            Bio = "The biggest woman on the card. Slow to start, impossible to stop.",
            PrimaryColor = "#1f6f8b",
            AccentColor = "#e8f6f9",
            Power = 10,
            Speed = 4,
            Technique = 6,
            Stamina = 9
        },
        new Wrestler
        {
            Id = "neon-nightingale",
            Name = "Aiko Tanaka",
            Nickname = "Neon Nightingale",
            Hometown = "Osaka, Japan",
            SignatureMove = "Nightingale Bridge",
            Bio = "Strong-style striker with the crispest suplex chain in the promotion.",
            PrimaryColor = "#ff5fa2",
            AccentColor = "#1b1b2f",
            Power = 7,
            Speed = 8,
            Technique = 9,
            Stamina = 8
        },
        new Wrestler
        {
            Id = "outback-outlaw",
            Name = "Dallas Mercer",
            Nickname = "Outback Outlaw",
            Hometown = "Perth, Australia",
            SignatureMove = "Boomerang Lariat",
            Bio = "A brawler who is happiest when the referee stops counting.",
            PrimaryColor = "#c9762a",
            AccentColor = "#2b1d0e",
            Power = 8,
            Speed = 7,
            Technique = 6,
            Stamina = 8
        },
        new Wrestler
        {
            Id = "crown-jewel",
            Name = "Vivienne Ashford",
            Nickname = "The Crown Jewel",
            Hometown = "London, England",
            SignatureMove = "Royal Decree DDT",
            Bio = "Technically flawless, endlessly arrogant, and the reigning champion before the Dolls arrived.",
            PrimaryColor = "#b8912f",
            AccentColor = "#2c2c54",
            Power = 7,
            Speed = 8,
            Technique = 10,
            Stamina = 7
        }
    ];

    public IReadOnlyList<Wrestler> GetRoster() => Roster;

    public Wrestler GetHeadliner() => Roster.First(w => w.IsHeadliner);

    public Wrestler? FindById(string? id)
    {
        if (string.IsNullOrWhiteSpace(id))
        {
            return null;
        }

        return Roster.FirstOrDefault(w => string.Equals(w.Id, id, StringComparison.OrdinalIgnoreCase));
    }

    public Wrestler GetByIdOrDefault(string? id) => FindById(id) ?? GetHeadliner();
}
