using Dynamite_Doll_Wrestling.Models;

namespace Dynamite_Doll_Wrestling.Services;

public interface IMatchEngine
{
    void InitializeMatch(string difficultyLevel, Wrestler playerWrestler, Wrestler opponentWrestler);
    void MovePlayer(float direction);
    void PerformPlayerAction(MatchAction action);
    void UpdateMatch(float deltaTime);
    MatchState GetMatchState();
    void Reset();
}

public enum MatchAction
{
    None = 0,
    Strike = 1,
    Grapple = 2,
    Signature = 3,
    Pin = 4
}

public class MatchState
{
    public float PlayerX { get; set; }
    public float OpponentX { get; set; }
    public float PlayerHealth { get; set; }
    public float OpponentHealth { get; set; }
    public float PlayerMomentum { get; set; }
    public int PlayerFalls { get; set; }
    public int OpponentFalls { get; set; }
    public float PinCount { get; set; }
    public int KickOutProgress { get; set; }
    public bool PlayerIsPinning { get; set; }
    public bool OpponentIsPinning { get; set; }
    public bool MatchOver { get; set; }
    public string? Winner { get; set; }
    public string LastCallout { get; set; } = string.Empty;
}

/// <summary>
/// Server side model of a Dynamite Doll Wrestling singles match.
/// The bout is contested under best-of-three falls rules, in the style of the
/// 1990 NES wrestling games: strikes chip the health meter, grapples do real damage,
/// and a pin can only be scored once the opponent's meter is low enough.
/// </summary>
public class MatchEngine : IMatchEngine
{
    public const float RingWidth = 800f;
    public const float MaxHealth = 100f;
    public const int FallsToWin = 2;
    private const float PinThreshold = 18f;
    private const float PinCountSeconds = 3f;

    /// <summary>Movement is resolved against a fixed 60 FPS step so it matches the renderer.</summary>
    private const float FixedStepSeconds = 1f / 60f;
    private const float MoveRange = 70f;
    private const float PlayerSpeed = 150f;
    private const float RingPadding = 60f;

    private MatchState _state = new();
    private string _difficultyLevel = "Medium";
    private Wrestler _playerWrestler = new();
    private Wrestler _opponentWrestler = new();
    private float _playerCooldown;
    private float _opponentCooldown;

    public void InitializeMatch(string difficultyLevel, Wrestler playerWrestler, Wrestler opponentWrestler)
    {
        _difficultyLevel = difficultyLevel;
        _playerWrestler = playerWrestler;
        _opponentWrestler = opponentWrestler;
        _playerCooldown = 0f;
        _opponentCooldown = 0f;
        _state = new MatchState
        {
            PlayerX = RingWidth * 0.35f,
            OpponentX = RingWidth * 0.65f,
            PlayerHealth = MaxHealth,
            OpponentHealth = MaxHealth,
            PlayerMomentum = 0f,
            PlayerFalls = 0,
            OpponentFalls = 0,
            PinCount = 0f,
            KickOutProgress = 0,
            MatchOver = false,
            LastCallout = "Ring the bell!"
        };
    }

    public void MovePlayer(float direction)
    {
        if (_state.MatchOver || _state.PlayerIsPinning || _state.OpponentIsPinning)
        {
            return;
        }

        var speed = PlayerSpeed * (0.75f + _playerWrestler.Speed / 20f);
        _state.PlayerX = Clamp(_state.PlayerX + Math.Sign(direction) * speed * FixedStepSeconds, RingPadding, RingWidth - RingPadding);
    }

    public void PerformPlayerAction(MatchAction action)
    {
        if (_state.MatchOver || _playerCooldown > 0f || action == MatchAction.None)
        {
            return;
        }

        if (_state.PlayerIsPinning)
        {
            // Already holding the cover - further input must not restart the count.
            _playerCooldown = 0.12f;
            return;
        }

        if (_state.OpponentIsPinning)
        {
            // Kicking out of a pin is the only legal action while being covered.
            // Each mash slows the count; enough mashes break the cover outright.
            _state.KickOutProgress++;
            _state.PinCount = Math.Max(0f, _state.PinCount - 0.25f);
            _playerCooldown = 0.12f;

            if (_state.KickOutProgress >= GetRequiredKickOutMashes())
            {
                _state.OpponentIsPinning = false;
                _state.PinCount = 0f;
                _state.KickOutProgress = 0;
                _state.PlayerHealth = Clamp(_state.PlayerHealth + 12f, 0f, MaxHealth);
                _state.LastCallout = $"{_playerWrestler.Nickname} kicks out at two!";
            }
            else
            {
                _state.LastCallout = "Kick out! Keep mashing!";
            }

            return;
        }

        if (Math.Abs(_state.PlayerX - _state.OpponentX) > MoveRange)
        {
            _state.LastCallout = "Too far away!";
            _playerCooldown = 0.2f;
            return;
        }

        switch (action)
        {
            case MatchAction.Strike:
                ApplyDamageToOpponent(3f + _playerWrestler.Power * 0.4f, 0.35f, $"{_playerWrestler.Nickname} lands a stiff forearm!");
                _playerCooldown = 0.3f;
                break;

            case MatchAction.Grapple:
                ApplyDamageToOpponent(6f + _playerWrestler.Technique * 0.8f, 0.9f, $"{_playerWrestler.Nickname} snaps off a suplex!");
                _playerCooldown = 0.7f;
                break;

            case MatchAction.Signature:
                if (_state.PlayerMomentum < 100f)
                {
                    _state.LastCallout = "Signature not ready.";
                    _playerCooldown = 0.2f;
                    break;
                }

                _state.PlayerMomentum = 0f;
                ApplyDamageToOpponent(
                    14f + (_playerWrestler.Power + _playerWrestler.Technique) * 0.8f,
                    0f,
                    $"{_playerWrestler.SignatureMove}! The crowd is on its feet!");
                _playerCooldown = 1.2f;
                break;

            case MatchAction.Pin:
                if (_state.OpponentHealth > PinThreshold)
                {
                    _state.LastCallout = "She's still too fresh to pin!";
                    _playerCooldown = 0.4f;
                    break;
                }

                _state.PlayerIsPinning = true;
                _state.PinCount = 0f;
                _state.LastCallout = "The cover! One...";
                _playerCooldown = 0.4f;
                break;
        }
    }

    public void UpdateMatch(float deltaTime)
    {
        if (_state.MatchOver || deltaTime <= 0f)
        {
            return;
        }

        _playerCooldown = Math.Max(0f, _playerCooldown - deltaTime);
        _opponentCooldown = Math.Max(0f, _opponentCooldown - deltaTime);

        if (_state.PlayerIsPinning || _state.OpponentIsPinning)
        {
            UpdatePinfall(deltaTime);
            return;
        }

        UpdateOpponent(deltaTime);
    }

    public MatchState GetMatchState() => _state;

    public void Reset() => InitializeMatch(_difficultyLevel, _playerWrestler, _opponentWrestler);

    private void UpdatePinfall(float deltaTime)
    {
        _state.PinCount += deltaTime;

        if (_state.OpponentIsPinning)
        {
            // The AI never gets a free three count; the player must fail to kick out.
            if (_state.PinCount >= PinCountSeconds)
            {
                ScoreFall(playerScored: false);
            }

            return;
        }

        if (_state.PinCount >= PinCountSeconds)
        {
            ScoreFall(playerScored: true);
            return;
        }

        // Give the AI a chance to kick out, scaled by difficulty and stamina.
        var kickOutChance = GetOpponentKickOutChance() * deltaTime;
        if (Random.Shared.NextDouble() < kickOutChance)
        {
            _state.PlayerIsPinning = false;
            _state.PinCount = 0f;
            _state.OpponentHealth = Math.Min(MaxHealth, _state.OpponentHealth + 12f);
            _state.LastCallout = $"{_opponentWrestler.Nickname} kicks out at two!";
        }
    }

    private void ScoreFall(bool playerScored)
    {
        if (playerScored)
        {
            _state.PlayerFalls++;
            _state.LastCallout = $"Three! {_playerWrestler.Nickname} takes the fall.";
        }
        else
        {
            _state.OpponentFalls++;
            _state.LastCallout = $"Three! {_opponentWrestler.Nickname} takes the fall.";
        }

        _state.PlayerIsPinning = false;
        _state.OpponentIsPinning = false;
        _state.PinCount = 0f;
        _state.KickOutProgress = 0;

        if (_state.PlayerFalls >= FallsToWin)
        {
            _state.MatchOver = true;
            _state.Winner = "Player";
            _state.LastCallout = $"{_playerWrestler.Name} wins the bout!";
            return;
        }

        if (_state.OpponentFalls >= FallsToWin)
        {
            _state.MatchOver = true;
            _state.Winner = "Opponent";
            _state.LastCallout = $"{_opponentWrestler.Name} wins the bout!";
            return;
        }

        // Reset the ring for the next fall.
        _state.PlayerHealth = MaxHealth;
        _state.OpponentHealth = MaxHealth;
        _state.PlayerX = RingWidth * 0.35f;
        _state.OpponentX = RingWidth * 0.65f;
        _state.PlayerMomentum = 0f;
    }

    private void UpdateOpponent(float deltaTime)
    {
        var distance = _state.OpponentX - _state.PlayerX;
        var absoluteDistance = Math.Abs(distance);
        var aggression = GetOpponentAggression();

        if (absoluteDistance > MoveRange * 0.8f)
        {
            var speed = PlayerSpeed * (0.6f + _opponentWrestler.Speed / 20f) * aggression;
            _state.OpponentX = Clamp(
                _state.OpponentX - Math.Sign(distance) * speed * deltaTime,
                RingPadding,
                RingWidth - RingPadding);
            return;
        }

        if (_opponentCooldown > 0f)
        {
            return;
        }

        if (_state.PlayerHealth <= PinThreshold && Random.Shared.NextDouble() < 0.5 * aggression)
        {
            _state.OpponentIsPinning = true;
            _state.PinCount = 0f;
            _state.KickOutProgress = 0;
            _state.LastCallout = $"{_opponentWrestler.Nickname} goes for the cover! Mash any action key to kick out!";
            _opponentCooldown = 0.4f;
            return;
        }

        var usesGrapple = Random.Shared.NextDouble() < 0.4 * aggression;
        if (usesGrapple)
        {
            ApplyDamageToPlayer(
                5f + _opponentWrestler.Technique * 0.7f * aggression,
                $"{_opponentWrestler.Nickname} plants her with the {_opponentWrestler.SignatureMove}!");
            _opponentCooldown = 0.9f / aggression;
        }
        else
        {
            ApplyDamageToPlayer(
                2.5f + _opponentWrestler.Power * 0.35f * aggression,
                $"{_opponentWrestler.Nickname} fires back with a chop!");
            _opponentCooldown = 0.45f / aggression;
        }
    }

    private void ApplyDamageToOpponent(float damage, float momentumGainFactor, string callout)
    {
        // Tougher opponents soak more punishment.
        var mitigated = damage * (1f - _opponentWrestler.Stamina * 0.02f);
        _state.OpponentHealth = Math.Max(0f, _state.OpponentHealth - mitigated);
        _state.PlayerMomentum = Math.Min(100f, _state.PlayerMomentum + mitigated * momentumGainFactor * 2f);
        _state.LastCallout = callout;
    }

    private void ApplyDamageToPlayer(float damage, string callout)
    {
        var mitigated = damage * (1f - _playerWrestler.Stamina * 0.02f);
        _state.PlayerHealth = Math.Max(0f, _state.PlayerHealth - mitigated);
        _state.LastCallout = callout;
    }

    private float GetOpponentAggression() => _difficultyLevel switch
    {
        "Easy" => 0.7f,
        "Medium" => 1f,
        "Hard" => 1.35f,
        _ => 1f
    };

    private int GetRequiredKickOutMashes() => _difficultyLevel switch
    {
        "Easy" => 4,
        "Hard" => 8,
        _ => 6
    };

    private double GetOpponentKickOutChance()
    {
        var difficultyFactor = _difficultyLevel switch
        {
            "Easy" => 0.25,
            "Medium" => 0.45,
            "Hard" => 0.7,
            _ => 0.45
        };

        return difficultyFactor * (0.5 + _opponentWrestler.Stamina / 20.0);
    }

    private static float Clamp(float value, float min, float max) => Math.Max(min, Math.Min(max, value));
}
