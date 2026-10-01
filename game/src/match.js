// Dynamite Doll Wrestling - match rules.
// Pure game logic with no rendering, so it can run headless in tests. It keeps
// the original rules (best of three falls, momentum-powered signature moves,
// pinfalls you have to mash out of) on a 3D ring floor measured in metres.

export const RING_HALF = 2.6;
export const MAX_HEALTH = 100;
export const FALLS_TO_WIN = 2;
export const PIN_THRESHOLD = 18;
export const PIN_COUNT_SECONDS = 3;
export const MOVE_RANGE = 1.15;
export const MIN_SEPARATION = 0.62;
export const BASE_SPEED = 2.3;
export const INTRO_SECONDS = 4.5;
export const FALL_BREAK_SECONDS = 3.2;

const DOWN_AFTER_GRAPPLE = 1.1;
const DOWN_AFTER_SIGNATURE = 2.2;
const GETUP_SECONDS = 0.6;

export function difficultyAggression(difficulty) {
  switch (difficulty) {
    case 'Easy': return 0.7;
    case 'Hard': return 1.35;
    default: return 1;
  }
}

export function requiredKickOutMashes(difficulty) {
  switch (difficulty) {
    case 'Easy': return 4;
    case 'Hard': return 8;
    default: return 6;
  }
}

export function difficultyKickOut(difficulty) {
  switch (difficulty) {
    case 'Easy': return 0.25;
    case 'Hard': return 0.7;
    default: return 0.45;
  }
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function createFighter(wrestler, x) {
  return {
    wrestler,
    x,
    z: 0,
    facing: x < 0 ? 0 : Math.PI,
    health: MAX_HEALTH,
    momentum: 0,
    falls: 0,
    action: 'idle',
    actionTime: 0,
    downTime: 0,
    cooldown: 0,
    moving: false
  };
}

export function createMatch({ player, opponent, difficulty = 'Medium', rng = Math.random, skipIntro = false }) {
  return {
    difficulty,
    rng,
    player: createFighter(player, -1.4),
    opponent: createFighter(opponent, 1.4),
    phase: skipIntro ? 'fight' : 'intro',
    phaseTime: 0,
    elapsed: 0,
    pin: null,
    winner: null,
    callout: skipIntro ? 'Ring the bell!' : player.name + ' vs ' + opponent.name,
    events: []
  };
}

function other(match, fighter) {
  return fighter === match.player ? match.opponent : match.player;
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function isGrounded(fighter) {
  return fighter.action === 'down' || fighter.action === 'pinned';
}

function canAct(fighter) {
  return fighter.cooldown <= 0
    && fighter.action !== 'down'
    && fighter.action !== 'getup'
    && fighter.action !== 'pinned'
    && fighter.action !== 'pinning';
}

function setAction(fighter, action) {
  fighter.action = action;
  fighter.actionTime = 0;
}

function emit(match, type, data) {
  match.events.push(Object.assign({ type }, data));
}

function knockDown(fighter, seconds) {
  setAction(fighter, 'down');
  fighter.downTime = seconds;
}

function dealDamage(match, attacker, defender, damage, momentumFactor, move) {
  const mitigated = damage * (1 - defender.wrestler.stamina * 0.02);
  defender.health = Math.max(0, defender.health - mitigated);
  if (attacker === match.player) {
    attacker.momentum = Math.min(100, attacker.momentum + mitigated * momentumFactor * 2);
  }

  if (move === 'grapple') {
    knockDown(defender, DOWN_AFTER_GRAPPLE);
  } else if (move === 'signature') {
    knockDown(defender, DOWN_AFTER_SIGNATURE);
  } else {
    setAction(defender, 'hurt');
  }

  emit(match, 'impact', {
    move,
    attacker: attacker === match.player ? 'player' : 'opponent',
    x: defender.x,
    z: defender.z,
    damage: mitigated
  });
  return mitigated;
}

function startPin(match, pinner, pinned) {
  setAction(pinner, 'pinning');
  setAction(pinned, 'pinned');
  pinner.x = pinned.x + Math.cos(pinned.facing + Math.PI / 2) * 0.05;
  pinner.z = pinned.z + Math.sin(pinned.facing + Math.PI / 2) * 0.05;
  match.pin = {
    by: pinner === match.player ? 'player' : 'opponent',
    count: 0,
    kickOutProgress: 0,
    announced: 0
  };
  emit(match, 'pinStart', { by: match.pin.by });
}

function endPin(match, kickedOut) {
  const pinner = match.pin.by === 'player' ? match.player : match.opponent;
  const pinned = other(match, pinner);
  setAction(pinner, 'idle');
  pinner.cooldown = 0.5;
  if (kickedOut) {
    pinned.health = Math.min(MAX_HEALTH, pinned.health + 12);
    setAction(pinned, 'getup');
    pinned.downTime = GETUP_SECONDS;
    // Shove the pinner away.
    const angle = Math.atan2(pinner.z - pinned.z, pinner.x - pinned.x) || 0;
    pinner.x = clamp(pinned.x + Math.cos(angle) * 0.9, -RING_HALF, RING_HALF);
    pinner.z = clamp(pinned.z + Math.sin(angle) * 0.9, -RING_HALF, RING_HALF);
    setAction(pinner, 'hurt');
    match.callout = pinned.wrestler.nickname + ' kicks out at two!';
    emit(match, 'kickOut', { by: pinned === match.player ? 'player' : 'opponent' });
  }

  match.pin = null;
}

export function performAction(match, action) {
  const player = match.player;
  const opponent = match.opponent;
  if (match.phase !== 'fight' || !action) {
    return;
  }

  if (match.pin) {
    if (match.pin.by === 'opponent' && player.cooldown <= 0) {
      match.pin.kickOutProgress += 1;
      match.pin.count = Math.max(0, match.pin.count - 0.25);
      player.cooldown = 0.12;
      if (match.pin.kickOutProgress >= requiredKickOutMashes(match.difficulty)) {
        endPin(match, true);
      } else {
        match.callout = 'Kick out! Keep mashing!';
        emit(match, 'mash', {});
      }
    }

    return;
  }

  if (!canAct(player)) {
    return;
  }

  if (distance(player, opponent) > MOVE_RANGE) {
    match.callout = 'Too far away!';
    player.cooldown = 0.2;
    emit(match, 'whiff', {});
    return;
  }

  if (action === 'pin') {
    if (opponent.health > PIN_THRESHOLD) {
      match.callout = "She's still too fresh to pin!";
      player.cooldown = 0.4;
      return;
    }

    startPin(match, player, opponent);
    match.callout = 'The cover!';
    return;
  }

  if (isGrounded(opponent) || opponent.action === 'getup') {
    match.callout = opponent.health <= PIN_THRESHOLD ? 'She is down - go for the cover!' : 'Let her get back up!';
    player.cooldown = 0.2;
    return;
  }

  switch (action) {
    case 'strike':
      setAction(player, 'strike');
      dealDamage(match, player, opponent, 3 + player.wrestler.power * 0.4, 0.35, 'strike');
      match.callout = player.wrestler.nickname + ' lands a stiff forearm!';
      player.cooldown = 0.3;
      break;

    case 'grapple':
      setAction(player, 'grapple');
      dealDamage(match, player, opponent, 6 + player.wrestler.technique * 0.8, 0.9, 'grapple');
      match.callout = player.wrestler.nickname + ' snaps off a suplex!';
      player.cooldown = 0.7;
      break;

    case 'signature':
      if (player.momentum < 100) {
        match.callout = 'Signature not ready.';
        player.cooldown = 0.2;
        break;
      }

      player.momentum = 0;
      setAction(player, 'signature');
      dealDamage(match, player, opponent,
        14 + (player.wrestler.power + player.wrestler.technique) * 0.8, 0, 'signature');
      match.callout = player.wrestler.signatureMove + '! The crowd is on its feet!';
      player.cooldown = 1.2;
      break;

    default:
      break;
  }
}

function updatePin(match, dt) {
  const pin = match.pin;
  pin.count += dt;
  const shown = Math.min(3, Math.floor(pin.count) + 1);
  if (shown > pin.announced && pin.count < PIN_COUNT_SECONDS) {
    pin.announced = shown;
    match.callout = shown === 1 ? 'One...' : shown === 2 ? 'Two...' : 'Thr...';
    emit(match, 'count', { count: shown });
  }

  if (pin.count >= PIN_COUNT_SECONDS) {
    scoreFall(match, pin.by === 'player');
    return;
  }

  if (pin.by === 'player') {
    // A battered opponent is far less likely to kick out than one barely under the pin threshold.
    const fatigue = 0.25 + 0.75 * clamp(match.opponent.health / PIN_THRESHOLD, 0, 1);
    const chance = difficultyKickOut(match.difficulty) * (0.5 + match.opponent.wrestler.stamina / 20) * fatigue * dt;
    if (match.rng() < chance) {
      endPin(match, true);
    }
  }
}

function scoreFall(match, playerScored) {
  const scorer = playerScored ? match.player : match.opponent;
  scorer.falls++;
  match.pin = null;
  match.callout = 'Three! ' + scorer.wrestler.nickname + ' takes the fall.';
  emit(match, 'fall', { by: playerScored ? 'player' : 'opponent' });

  if (scorer.falls >= FALLS_TO_WIN) {
    match.phase = 'over';
    match.phaseTime = 0;
    match.winner = playerScored ? 'player' : 'opponent';
    match.callout = scorer.wrestler.name + ' wins the bout!';
    setAction(scorer, 'celebrate');
    emit(match, 'matchOver', { winner: match.winner });
    return;
  }

  match.phase = 'fallBreak';
  match.phaseTime = 0;
  setAction(scorer, 'celebrate');
}

function resetForNextFall(match) {
  [[match.player, -1.4], [match.opponent, 1.4]].forEach(([fighter, x]) => {
    fighter.x = x;
    fighter.z = 0;
    fighter.facing = x < 0 ? 0 : Math.PI;
    fighter.health = MAX_HEALTH;
    fighter.momentum = 0;
    fighter.cooldown = 0;
    fighter.downTime = 0;
    setAction(fighter, 'idle');
  });
  match.callout = 'Next fall - ring the bell!';
  emit(match, 'bell', {});
}

function moveFighter(match, fighter, dirX, dirZ, speed, dt) {
  const length = Math.hypot(dirX, dirZ);
  fighter.moving = length > 0.01;
  if (!fighter.moving) {
    if (fighter.action === 'walk') {
      setAction(fighter, 'idle');
    }
    return;
  }

  fighter.x = clamp(fighter.x + (dirX / length) * speed * dt, -RING_HALF, RING_HALF);
  fighter.z = clamp(fighter.z + (dirZ / length) * speed * dt, -RING_HALF, RING_HALF);
  if (fighter.action === 'idle' || fighter.action === 'walk') {
    if (fighter.action !== 'walk') {
      setAction(fighter, 'walk');
    }
  }

  // Keep the two wrestlers from walking through each other.
  const foe = other(match, fighter);
  const gap = distance(fighter, foe);
  if (gap < MIN_SEPARATION && gap > 0.0001) {
    const push = (MIN_SEPARATION - gap);
    fighter.x = clamp(fighter.x + ((fighter.x - foe.x) / gap) * push, -RING_HALF, RING_HALF);
    fighter.z = clamp(fighter.z + ((fighter.z - foe.z) / gap) * push, -RING_HALF, RING_HALF);
  }
}

function updateOpponentAi(match, dt) {
  const ai = match.opponent;
  const player = match.player;
  const aggression = difficultyAggression(match.difficulty);
  const gap = distance(ai, player);

  if (!canAct(ai)) {
    moveFighter(match, ai, 0, 0, 0, dt);
    return;
  }

  if (gap > MOVE_RANGE * 0.8) {
    const speed = BASE_SPEED * (0.6 + ai.wrestler.speed / 20) * aggression;
    moveFighter(match, ai, player.x - ai.x, player.z - ai.z, speed, dt);
    return;
  }

  moveFighter(match, ai, 0, 0, 0, dt);

  if (isGrounded(player) || player.action === 'getup') {
    if (player.health <= PIN_THRESHOLD && player.action === 'down' && match.rng() < 0.5 * aggression) {
      startPin(match, ai, player);
      match.pin.kickOutProgress = 0;
      match.callout = ai.wrestler.nickname + ' goes for the cover! Mash to kick out!';
      ai.cooldown = 0.4;
    } else {
      ai.cooldown = 0.35;
    }
    return;
  }

  if (player.health <= PIN_THRESHOLD && match.rng() < 0.5 * aggression) {
    startPin(match, ai, player);
    match.callout = ai.wrestler.nickname + ' goes for the cover! Mash to kick out!';
    ai.cooldown = 0.4;
    return;
  }

  if (match.rng() < 0.4 * aggression) {
    setAction(ai, 'grapple');
    dealDamage(match, ai, player, 5 + ai.wrestler.technique * 0.7 * aggression, 0, 'grapple');
    match.callout = ai.wrestler.nickname + ' plants her with the ' + ai.wrestler.signatureMove + '!';
    ai.cooldown = 0.9 / aggression;
  } else {
    setAction(ai, 'strike');
    dealDamage(match, ai, player, 2.5 + ai.wrestler.power * 0.35 * aggression, 0, 'strike');
    match.callout = ai.wrestler.nickname + ' fires back with a chop!';
    ai.cooldown = 0.45 / aggression;
  }
}

function updateFighterTimers(fighter, foe, dt) {
  fighter.actionTime += dt;
  fighter.cooldown = Math.max(0, fighter.cooldown - dt);

  if (fighter.action === 'down') {
    fighter.downTime -= dt;
    if (fighter.downTime <= 0) {
      setAction(fighter, 'getup');
      fighter.downTime = GETUP_SECONDS;
    }
  } else if (fighter.action === 'getup') {
    fighter.downTime -= dt;
    if (fighter.downTime <= 0) {
      setAction(fighter, 'idle');
    }
  } else if ((fighter.action === 'strike' && fighter.actionTime > 0.3)
    || (fighter.action === 'grapple' && fighter.actionTime > 0.7)
    || (fighter.action === 'signature' && fighter.actionTime > 1.0)
    || (fighter.action === 'hurt' && fighter.actionTime > 0.35)) {
    setAction(fighter, 'idle');
  }

  if (fighter.action !== 'down' && fighter.action !== 'pinned' && fighter.action !== 'pinning' && fighter.action !== 'getup') {
    const target = Math.atan2(foe.z - fighter.z, foe.x - fighter.x);
    let delta = target - fighter.facing;
    delta = Math.atan2(Math.sin(delta), Math.cos(delta));
    fighter.facing += delta * Math.min(1, dt * 10);
  }
}

// input: { moveX, moveZ } in ring space, each -1..1.
export function updateMatch(match, dt, input = {}) {
  match.events.length = 0;
  match.elapsed += dt;
  match.phaseTime += dt;

  if (match.phase === 'intro') {
    if (match.phaseTime >= INTRO_SECONDS) {
      match.phase = 'fight';
      match.phaseTime = 0;
      match.callout = 'Ring the bell!';
      emit(match, 'bell', {});
    }
    return match.events;
  }

  if (match.phase === 'fallBreak') {
    match.player.actionTime += dt;
    match.opponent.actionTime += dt;
    if (match.phaseTime >= FALL_BREAK_SECONDS) {
      match.phase = 'fight';
      match.phaseTime = 0;
      resetForNextFall(match);
    }
    return match.events;
  }

  if (match.phase === 'over') {
    match.player.actionTime += dt;
    match.opponent.actionTime += dt;
    return match.events;
  }

  updateFighterTimers(match.player, match.opponent, dt);
  updateFighterTimers(match.opponent, match.player, dt);

  if (match.pin) {
    updatePin(match, dt);
    return match.events;
  }

  const player = match.player;
  const free = player.action === 'idle' || player.action === 'walk';
  const speed = BASE_SPEED * (0.75 + player.wrestler.speed / 20);
  moveFighter(match, player, free ? input.moveX || 0 : 0, free ? input.moveZ || 0 : 0, speed, dt);

  updateOpponentAi(match, dt);
  return match.events;
}

export function skipIntro(match) {
  if (match.phase === 'intro') {
    match.phaseTime = INTRO_SECONDS;
  }
}
