namespace Dynamite_Doll_Wrestling.Models;

/// <summary>
/// A selectable wrestler on the Dynamite Doll Wrestling roster.
/// Ratings are on a 1-10 NES-era scale and drive the match engine.
/// </summary>
public class Wrestler
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Nickname { get; set; } = string.Empty;
    public string Hometown { get; set; } = string.Empty;
    public string SignatureMove { get; set; } = string.Empty;
    public string Bio { get; set; } = string.Empty;

    /// <summary>Primary colour used by the 2D sprite renderer.</summary>
    public string PrimaryColor { get; set; } = "#f5f5f5";

    /// <summary>Trim colour used by the 2D sprite renderer.</summary>
    public string AccentColor { get; set; } = "#202020";

    public int Power { get; set; }
    public int Speed { get; set; }
    public int Technique { get; set; }
    public int Stamina { get; set; }

    /// <summary>True for the marquee character, Bronwyne "Dynamite Doll" Billington.</summary>
    public bool IsHeadliner { get; set; }

    public int Overall => (int)Math.Round((Power + Speed + Technique + Stamina) / 4.0);
}
