import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createMatch, updateMatch, performAction, skipIntro,
  MAX_HEALTH, PIN_THRESHOLD, PIN_COUNT_SECONDS, FALL_BREAK_SECONDS, requiredKickOutMashes
} from '../src/match.js';
import { ROSTER, findWrestler } from '../src/roster.js';

const STEP = 1 / 60;

function run(match, seconds, input) {
  const events = [];
  for (let t = 0; t < seconds; t += STEP) {
    events.push(...updateMatch(match, STEP, input));
  }
  return events;
}

function closeTheGap(match) {
  match.player.x = -0.4;
  match.opponent.x = 0.4;
  match.player.z = match.opponent.z = 0;
}

test('roster mirrors the server roster with the headliner first and strongest', () => {
  assert.equal(ROSTER.length, 8);
  assert.equal(ROSTER[0].id, 'dynamite-doll');
  const total = (w) => w.power + w.speed + w.technique + w.stamina;
  ROSTER.slice(1).forEach((w) => assert.ok(total(ROSTER[0]) > total(w)));
  assert.equal(findWrestler('missing').id, 'dynamite-doll');
});

test('intro hands over to the fight with a bell', () => {
  const match = createMatch({ player: ROSTER[0], opponent: ROSTER[1] });
  assert.equal(match.phase, 'intro');
  skipIntro(match);
  const events = updateMatch(match, STEP);
  assert.equal(match.phase, 'fight');
  assert.ok(events.some((e) => e.type === 'bell'));
});

test('moves only connect in range', () => {
  const match = createMatch({ player: ROSTER[0], opponent: ROSTER[1], skipIntro: true, rng: () => 0.99 });
  performAction(match, 'strike');
  assert.equal(match.opponent.health, MAX_HEALTH);
  assert.equal(match.callout, 'Too far away!');

  run(match, 0.3);
  closeTheGap(match);
  performAction(match, 'strike');
  assert.ok(match.opponent.health < MAX_HEALTH);
  assert.ok(match.player.momentum > 0);
});

test('player movement is clamped to the ring', () => {
  const match = createMatch({ player: ROSTER[0], opponent: ROSTER[1], skipIntro: true, rng: () => 0.99 });
  match.opponent.x = 2.5;
  run(match, 6, { moveX: -1, moveZ: -1 });
  assert.ok(match.player.x >= -2.6 && match.player.z >= -2.6);
  assert.ok(match.player.x < -2.5);
});

test('grapple knocks the opponent down and she gets back up', () => {
  const match = createMatch({ player: ROSTER[0], opponent: ROSTER[1], skipIntro: true, rng: () => 0.99 });
  closeTheGap(match);
  performAction(match, 'grapple');
  assert.equal(match.opponent.action, 'down');
  run(match, 2.5);
  assert.notEqual(match.opponent.action, 'down');
});

test('signature needs full momentum', () => {
  const match = createMatch({ player: ROSTER[0], opponent: ROSTER[1], skipIntro: true, rng: () => 0.99 });
  closeTheGap(match);
  performAction(match, 'signature');
  assert.equal(match.opponent.health, MAX_HEALTH);
  match.player.cooldown = 0;
  match.player.momentum = 100;
  performAction(match, 'signature');
  assert.ok(match.opponent.health < MAX_HEALTH - 20);
  assert.equal(match.player.momentum, 0);
});

test('a pinfall needs a worn-down opponent and wins after two falls', () => {
  const match = createMatch({ player: ROSTER[0], opponent: ROSTER[1], skipIntro: true, rng: () => 0.99 });
  closeTheGap(match);
  performAction(match, 'pin');
  assert.equal(match.pin, null);

  for (let fall = 1; fall <= 2; fall++) {
    closeTheGap(match);
    match.player.cooldown = 0;
    match.player.action = 'idle';
    match.opponent.action = 'idle';
    match.opponent.health = PIN_THRESHOLD;
    performAction(match, 'pin');
    assert.ok(match.pin, 'pin should start');
    const events = run(match, PIN_COUNT_SECONDS + 0.1);
    assert.ok(events.some((e) => e.type === 'fall'));
    assert.equal(match.player.falls, fall);
    if (fall === 1) {
      assert.equal(match.phase, 'fallBreak');
      run(match, FALL_BREAK_SECONDS + 0.1);
      assert.equal(match.phase, 'fight');
      assert.equal(match.opponent.health, MAX_HEALTH);
    }
  }

  assert.equal(match.phase, 'over');
  assert.equal(match.winner, 'player');
});

test('mashing kicks out of an opponent cover', () => {
  const match = createMatch({ player: ROSTER[1], opponent: ROSTER[0], skipIntro: true, rng: () => 0 });
  closeTheGap(match);
  match.player.health = PIN_THRESHOLD;
  run(match, STEP);
  assert.equal(match.pin && match.pin.by, 'opponent');

  for (let i = 0; i < requiredKickOutMashes('Medium'); i++) {
    match.player.cooldown = 0;
    performAction(match, 'strike');
  }

  assert.equal(match.pin, null);
  assert.ok(match.player.health > PIN_THRESHOLD);
  assert.equal(match.opponent.falls, 0);
});

test('the AI can win a full match against an idle player', () => {
  let seed = 7;
  const rng = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const match = createMatch({ player: ROSTER[7], opponent: ROSTER[0], difficulty: 'Hard', skipIntro: true, rng });
  run(match, 240);
  assert.equal(match.phase, 'over');
  assert.equal(match.winner, 'opponent');
});
