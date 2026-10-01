// Dynamite Doll Wrestling - 3D edition entry point.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ROSTER, findWrestler } from './roster.js';
import { createMatch, updateMatch, performAction, skipIntro, MAX_HEALTH, requiredKickOutMashes } from './match.js';
import { createArena, RING_FLOOR_Y } from './arena.js';
import { createWrestler, disposeWrestler, poseWrestler } from './wrestler.js';
import { createEffects } from './effects.js';
import { createCameraDirector } from './camera.js';
import { createAudio } from './audio.js';
import { createInput } from './input.js';

/* global __EDITION__, __VERSION__ */
const EDITION = typeof __EDITION__ === 'string' ? __EDITION__ : 'web';
const VERSION = typeof __VERSION__ === 'string' ? __VERSION__ : 'dev';
const SETTINGS_KEY = 'ddw3d.settings';

export const QUALITY = {
  low: { shadows: false, shadowMap: 0, crowd: 400, beams: false, bloom: false, msaa: 0, detail: 'low', particles: 1500 },
  medium: { shadows: true, shadowMap: 1024, crowd: 1000, beams: true, bloom: true, msaa: 0, detail: 'medium', particles: 3000 },
  high: { shadows: true, shadowMap: 2048, crowd: 2000, beams: true, bloom: true, msaa: 4, detail: 'high', particles: 5000 },
  ultra: { shadows: true, shadowMap: 4096, crowd: 3600, beams: true, bloom: true, msaa: 4, detail: 'high', particles: 8000 }
};

const $ = (id) => document.getElementById(id);

function loadSettings() {
  const defaults = {
    quality: EDITION === 'windows' ? 'ultra' : 'medium',
    showFps: false,
    shake: true,
    touch: false,
    volume: 0.8
  };
  try {
    return Object.assign(defaults, JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'));
  } catch {
    return defaults;
  }
}

function saveSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Storage can be unavailable (private mode); settings then last for the session.
  }
}

function pixelRatioFor(quality) {
  const dpr = window.devicePixelRatio || 1;
  switch (quality) {
    case 'low': return Math.min(dpr, 1) * 0.75;
    case 'medium': return Math.min(dpr, 1);
    case 'high': return Math.min(dpr, 2);
    default: {
      // Ultra renders internally at up to 3840x2160 and downsamples to the window.
      const target = Math.min(3840 / Math.max(1, window.innerWidth), 2160 / Math.max(1, window.innerHeight));
      return Math.min(3, Math.max(dpr, target));
    }
  }
}

function showError(message) {
  const el = $('error');
  el.hidden = false;
  el.innerHTML = '';
  const h = document.createElement('h2');
  h.textContent = 'Dynamite Doll Wrestling could not start';
  const p = document.createElement('p');
  p.textContent = message;
  el.append(h, p);
  $('loading').classList.add('done');
}

function start() {
  const settings = loadSettings();
  if (!QUALITY[settings.quality]) {
    settings.quality = 'medium';
  }
  const quality = QUALITY[settings.quality];

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: $('view'), antialias: false, powerPreference: 'high-performance' });
  } catch (error) {
    showError('WebGL 2 is required. Turn on hardware acceleration in your browser settings, update your graphics driver, or try a different browser. (' + error.message + ')');
    return;
  }

  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = quality.shadows;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.22;
  pmrem.dispose();

  const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 160);
  const arena = createArena(scene, renderer, quality);
  const effects = createEffects(scene, quality.particles);
  const director = createCameraDirector(camera);
  director.shakeEnabled = settings.shake;
  const audio = createAudio();
  audio.setVolume(settings.volume);

  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: quality.msaa });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  let bloom = null;
  if (quality.bloom) {
    bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.5, 0.35, 1.6);
    composer.addPass(bloom);
  }
  composer.addPass(new OutputPass());

  function resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const ratio = pixelRatioFor(settings.quality);
    renderer.setPixelRatio(ratio);
    renderer.setSize(width, height, false);
    composer.setPixelRatio(ratio);
    composer.setSize(width, height);
    if (bloom) {
      bloom.resolution.set(width * ratio / 2, height * ratio / 2);
    }
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    const bufferHeight = height * ratio;
    effects.setPixelScale(bufferHeight / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) / 0.9);
  }
  window.addEventListener('resize', resize);
  resize();

  // ------------------------------------------------------------ game state
  const state = {
    mode: 'menu',
    screen: 'title',
    returnTo: 'title',
    selection: { player: ROSTER[0].id, opponent: ROSTER[1].id, step: 'player' },
    difficulty: 'Medium',
    match: null,
    rigs: { player: null, opponent: null },
    rigIds: { player: null, opponent: null },
    timeScale: 1,
    hitStop: 0,
    slowMo: 0,
    stats: null,
    resultsShown: false,
    touchSeen: false,
    lastCount: 0,
    fpsSamples: [],
    lowFpsWarned: false
  };

  const showcase = {
    player: { x: -0.75, z: 0.2, facing: Math.PI / 2, action: 'idle', actionTime: 0, moving: false, momentum: 0 },
    opponent: { x: 0.75, z: 0.2, facing: Math.PI / 2, action: 'idle', actionTime: 0, moving: false, momentum: 0 }
  };

  function ensureRig(slot, id) {
    if (state.rigIds[slot] === id && state.rigs[slot]) {
      return state.rigs[slot];
    }
    if (state.rigs[slot]) {
      disposeWrestler(state.rigs[slot]);
    }
    const rig = createWrestler(findWrestler(id), quality.detail);
    scene.add(rig.root);
    state.rigs[slot] = rig;
    state.rigIds[slot] = id;
    rig.pose = null;
    return rig;
  }

  // ------------------------------------------------------------ screens
  const screens = ['title', 'select', 'settings', 'controls', 'pause', 'results'];

  function showScreen(id) {
    screens.forEach((name) => $(name).classList.toggle('active', name === id));
    state.screen = id;
    const first = id && $(id).querySelector('button:not([disabled]):not([hidden]), select');
    if (first && id !== 'select') {
      first.focus({ preventScroll: true });
    }
    syncHudVisibility();
  }

  function syncHudVisibility() {
    const inMatch = state.mode === 'match';
    $('hud').hidden = !(inMatch || state.mode === 'paused');
    const wantTouch = settings.touch || state.touchSeen || window.matchMedia('(pointer: coarse)').matches;
    $('touch').hidden = !(inMatch && wantTouch);
    $('quality').disabled = state.mode === 'match' || state.mode === 'paused';
    $('quality-hint').textContent = $('quality').disabled
      ? 'Graphics quality can be changed from the title screen.'
      : 'Changing quality reloads the arena. Current render resolution: '
        + Math.round(window.innerWidth * renderer.getPixelRatio()) + ' x ' + Math.round(window.innerHeight * renderer.getPixelRatio()) + '.';
  }

  function go(target) {
    audio.ui();
    if (target === 'settings' || target === 'controls') {
      state.returnTo = state.screen;
      showScreen(target);
      return;
    }

    if (target === 'title') {
      endMatch();
      state.mode = 'menu';
      arena.titantronView = { mode: 'logo' };
      showScreen('title');
      return;
    }

    if (target === 'select') {
      endMatch();
      state.mode = 'select';
      state.selection.step = 'player';
      renderSelect();
      showScreen('select');
    }
  }

  document.querySelectorAll('[data-go]').forEach((button) => {
    button.addEventListener('click', () => go(button.dataset.go));
  });
  document.querySelectorAll('[data-back]').forEach((button) => {
    button.addEventListener('click', () => {
      audio.ui();
      showScreen(state.returnTo);
    });
  });

  // ------------------------------------------------------------ select
  function statRow(label, value, color) {
    return '<div class="stat"><span>' + label + '</span><div class="meter"><div style="width:' + (value * 10)
      + '%;background:' + color + '"></div></div></div>';
  }

  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function renderSelect() {
    const sel = state.selection;
    const current = sel.step === 'player' ? sel.player : sel.opponent;
    $('select-heading').textContent = sel.step === 'player' ? 'Choose your wrestler' : 'Choose your opponent';
    $('confirm-select').textContent = sel.step === 'player' ? 'Select' : 'Fight!';
    const roster = $('roster');
    roster.innerHTML = '';
    ROSTER.forEach((w) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('role', 'option');
      button.style.setProperty('--swatch', w.primaryColor);
      button.setAttribute('aria-selected', String(w.id === current));
      const taken = sel.step === 'opponent' && w.id === sel.player;
      button.disabled = taken;
      button.classList.toggle('taken', taken);
      button.innerHTML = escapeHtml(w.name) + '<small>' + escapeHtml(w.nickname) + '</small>';
      button.addEventListener('click', () => {
        audio.ui();
        if (sel.step === 'player') {
          sel.player = w.id;
          if (sel.opponent === w.id) {
            sel.opponent = ROSTER.find((o) => o.id !== w.id).id;
          }
        } else {
          sel.opponent = w.id;
        }
        renderSelect();
        roster.querySelector('[aria-selected="true"]').focus({ preventScroll: true });
      });
      button.addEventListener('dblclick', confirmSelect);
      roster.appendChild(button);
    });

    const w = findWrestler(current);
    $('profile').innerHTML = '<h3>' + escapeHtml(w.name) + '</h3>'
      + '<div class="nick">"' + escapeHtml(w.nickname) + '"</div>'
      + '<p>' + escapeHtml(w.hometown) + ' &middot; Finisher: <b>' + escapeHtml(w.signatureMove) + '</b></p>'
      + '<p class="bio">' + escapeHtml(w.bio) + '</p>'
      + statRow('Power', w.power, '#ff3d6e') + statRow('Speed', w.speed, '#3b82f6')
      + statRow('Technique', w.technique, '#ffd44d') + statRow('Stamina', w.stamina, '#22c55e');
    $('matchup').textContent = findWrestler(sel.player).nickname + '  vs  '
      + (sel.step === 'opponent' ? findWrestler(sel.opponent).nickname : '?');
  }

  function confirmSelect() {
    audio.ui();
    const sel = state.selection;
    if (sel.step === 'player') {
      sel.step = 'opponent';
      if (sel.opponent === sel.player) {
        sel.opponent = ROSTER.find((o) => o.id !== sel.player).id;
      }
      renderSelect();
      return;
    }
    startMatch();
  }

  $('confirm-select').addEventListener('click', confirmSelect);
  $('difficulty').addEventListener('change', (event) => { state.difficulty = event.target.value; });

  // ------------------------------------------------------------ match
  function newStats() {
    return { player: { strike: 0, grapple: 0, signature: 0, kickOut: 0 }, opponent: { strike: 0, grapple: 0, signature: 0, kickOut: 0 } };
  }

  function startMatch() {
    const sel = state.selection;
    const player = findWrestler(sel.player);
    const opponent = findWrestler(sel.opponent);
    state.match = createMatch({ player, opponent, difficulty: state.difficulty });
    state.stats = newStats();
    state.resultsShown = false;
    state.timeScale = 1;
    state.hitStop = 0;
    state.slowMo = 0;
    state.lastCount = 0;
    state.fpsSamples = [];
    state.mode = 'match';
    effects.clear();
    ensureRig('player', player.id).pose = null;
    ensureRig('opponent', opponent.id).pose = null;
    arena.titantronView = { mode: 'versus', player, opponent };
    arena.hype(0.6);
    audio.unlock();
    audio.pyro();
    effects.pyro([player.primaryColor, opponent.primaryColor, '#ffffff']);

    $('p-name').textContent = player.name.toUpperCase();
    $('o-name').textContent = opponent.name.toUpperCase();
    $('intro-card').innerHTML = '<div class="who"><b style="color:' + player.primaryColor + '">' + escapeHtml(player.name)
      + '</b><span>' + escapeHtml(player.nickname) + '</span></div><div class="vs">VS</div><div class="who"><b style="color:'
      + opponent.primaryColor + '">' + escapeHtml(opponent.name) + '</b><span>' + escapeHtml(opponent.nickname)
      + '</span></div><div class="skip">Press any action to skip</div>';
    showScreen(null);
    document.activeElement && document.activeElement.blur && document.activeElement.blur();
  }

  function endMatch() {
    state.match = null;
    if (state.mode === 'match' || state.mode === 'paused' || state.mode === 'results') {
      state.mode = 'menu';
    }
    effects.clear();
  }

  function pause() {
    if (state.mode === 'match') {
      state.mode = 'paused';
      showScreen('pause');
    } else if (state.mode === 'paused' && state.screen === 'pause') {
      resume();
    } else if (state.screen === 'settings' || state.screen === 'controls') {
      showScreen(state.returnTo);
    } else if (state.screen === 'select') {
      if (state.selection.step === 'opponent') {
        state.selection.step = 'player';
        renderSelect();
      } else {
        go('title');
      }
    }
  }

  function resume() {
    if (state.mode === 'paused') {
      state.mode = 'match';
      showScreen(null);
    }
  }

  $('resume').addEventListener('click', resume);
  $('pause-button').addEventListener('click', pause);
  $('restart').addEventListener('click', () => startMatch());
  $('rematch').addEventListener('click', () => startMatch());
  $('quit-match').addEventListener('click', () => go('title'));

  function handleEvents(events) {
    const match = state.match;
    if (!match) {
      return;
    }
    events.forEach((event) => {
      switch (event.type) {
        case 'impact': {
          const attacker = event.attacker === 'player' ? match.player : match.opponent;
          state.stats[event.attacker][event.move] += 1;
          const heavy = event.move === 'signature';
          const y = RING_FLOOR_Y + (event.move === 'strike' ? 1.35 : 0.6);
          effects.sparks(event.x, y, event.z, event.damage * (heavy ? 3 : 1), heavy ? attacker.wrestler.accentColor : null);
          if (event.move === 'strike') {
            audio.strike();
            director.addShake(0.05);
            arena.hype(0.05);
            state.hitStop = 0.05;
          } else {
            audio.slam(heavy);
            director.addShake(heavy ? 0.3 : 0.14);
            arena.ropeShake = heavy ? 1.5 : 0.8;
            arena.hype(heavy ? 0.7 : 0.15);
            state.hitStop = heavy ? 0 : 0.08;
          }
          if (heavy) {
            audio.whoosh();
            director.focusOn(event.x, event.z, 1.2);
            state.slowMo = 0.8;
          }
          break;
        }
        case 'whiff':
          audio.whoosh();
          break;
        case 'pinStart':
          arena.hype(0.25);
          state.lastCount = 0;
          break;
        case 'count':
          audio.count();
          arena.hype(0.15);
          arena.titantronView = { mode: 'text', text: String(event.count), color: '#ffffff' };
          state.lastCount = event.count;
          $('count').textContent = String(event.count);
          $('count').classList.remove('pop');
          void $('count').offsetWidth;
          $('count').classList.add('pop');
          break;
        case 'kickOut':
          state.stats[event.by].kickOut += 1;
          arena.hype(0.6);
          audio.whoosh();
          director.addShake(0.08);
          arena.titantronView = { mode: 'logo' };
          break;
        case 'fall': {
          const scorer = event.by === 'player' ? match.player : match.opponent;
          audio.bell();
          audio.pyro();
          effects.pyro([scorer.wrestler.primaryColor, scorer.wrestler.accentColor, '#ffffff']);
          arena.hype(1);
          director.addShake(0.2);
          arena.titantronView = { mode: 'text', text: 'THREE!', sub: scorer.wrestler.nickname + ' takes the fall', color: scorer.wrestler.primaryColor };
          break;
        }
        case 'matchOver': {
          const winner = event.winner === 'player' ? match.player : match.opponent;
          effects.confetti([winner.wrestler.primaryColor, winner.wrestler.accentColor, '#ffffff']);
          arena.titantronView = { mode: 'text', text: 'WINNER', sub: winner.wrestler.name, color: winner.wrestler.accentColor };
          break;
        }
        case 'bell':
          audio.bell();
          arena.titantronView = { mode: 'logo' };
          break;
        default:
          break;
      }
    });
  }

  function onAction(action) {
    const match = state.match;
    audio.unlock();
    if (!match || state.mode !== 'match') {
      return;
    }
    if (match.phase === 'intro') {
      skipIntro(match);
      return;
    }
    performAction(match, action);
    handleEvents(match.events);
    match.events.length = 0;
  }

  function showResults() {
    const match = state.match;
    state.resultsShown = true;
    state.mode = 'results';
    const won = match.winner === 'player';
    const winner = won ? match.player : match.opponent;
    $('results-heading').textContent = won ? 'Victory!' : 'Defeat';
    $('results-sub').textContent = winner.wrestler.name + ' wins ' + Math.max(match.player.falls, match.opponent.falls)
      + '-' + Math.min(match.player.falls, match.opponent.falls) + ' on ' + match.difficulty + '.';
    const rows = [['Strikes landed', 'strike'], ['Grapples', 'grapple'], ['Signatures', 'signature'], ['Kick-outs', 'kickOut']];
    $('results-stats').innerHTML = '<dt></dt><dd>' + escapeHtml(match.player.wrestler.nickname) + '</dd><dd>'
      + escapeHtml(match.opponent.wrestler.nickname) + '</dd>'
      + rows.map(([label, key]) => '<dt>' + label + '</dt><dd>' + state.stats.player[key] + '</dd><dd>' + state.stats.opponent[key] + '</dd>').join('');
    showScreen('results');
  }

  // ------------------------------------------------------------ HUD
  function renderFalls(el, falls) {
    const html = '<i class="' + (falls >= 1 ? 'won' : '') + '"></i><i class="' + (falls >= 2 ? 'won' : '') + '"></i>';
    if (el.innerHTML !== html) {
      el.innerHTML = html;
    }
  }

  function updateHud() {
    const match = state.match;
    if (!match) {
      return;
    }
    $('p-health').style.width = (match.player.health / MAX_HEALTH * 100) + '%';
    $('o-health').style.width = (match.opponent.health / MAX_HEALTH * 100) + '%';
    $('p-momentum').style.width = match.player.momentum + '%';
    $('p-momentum').parentElement.classList.toggle('full', match.player.momentum >= 100);
    $('sig-ready').classList.toggle('on', match.player.momentum >= 100 && match.phase === 'fight');
    renderFalls($('p-falls'), match.player.falls);
    renderFalls($('o-falls'), match.opponent.falls);
    if ($('callout').textContent !== match.callout) {
      $('callout').textContent = match.phase === 'intro' ? '' : match.callout;
    }
    $('intro-card').classList.toggle('on', match.phase === 'intro');
    if (!match.pin && $('count').textContent) {
      $('count').textContent = '';
    }
    const mashing = !!(match.pin && match.pin.by === 'opponent');
    $('mash').classList.toggle('on', mashing);
    if (mashing) {
      $('mash-bar').style.width = (match.pin.kickOutProgress / requiredKickOutMashes(match.difficulty) * 100) + '%';
    }
  }

  // ------------------------------------------------------------ settings UI
  $('quality').value = settings.quality;
  $('show-fps').checked = settings.showFps;
  $('camera-shake').checked = settings.shake;
  $('touch-controls').checked = settings.touch;
  $('volume').value = String(settings.volume);
  $('fps').hidden = !settings.showFps;

  $('quality').addEventListener('change', (event) => {
    settings.quality = event.target.value;
    saveSettings(settings);
    window.location.reload();
  });
  $('show-fps').addEventListener('change', (event) => {
    settings.showFps = event.target.checked;
    $('fps').hidden = !settings.showFps;
    saveSettings(settings);
  });
  $('camera-shake').addEventListener('change', (event) => {
    settings.shake = event.target.checked;
    director.shakeEnabled = settings.shake;
    saveSettings(settings);
  });
  $('touch-controls').addEventListener('change', (event) => {
    settings.touch = event.target.checked;
    saveSettings(settings);
    syncHudVisibility();
  });
  $('volume').addEventListener('input', (event) => {
    settings.volume = Number(event.target.value);
    audio.setVolume(settings.volume);
    saveSettings(settings);
  });

  const isElectron = /Electron\//.test(navigator.userAgent);
  if (isElectron) {
    $('quit').hidden = false;
    $('quit').addEventListener('click', () => window.close());
  }
  const editionName = EDITION === 'windows' ? 'Windows Edition' : EDITION === 'chromebook' ? 'Chromebook Edition' : 'Web Edition';
  $('edition').textContent = editionName + ' \u00b7 v' + VERSION + ' \u00b7 ' + settings.quality.toUpperCase() + ' graphics';

  window.addEventListener('pointerdown', (event) => {
    audio.unlock();
    if (event.pointerType === 'touch' && !state.touchSeen) {
      state.touchSeen = true;
      syncHudVisibility();
    }
  });
  window.addEventListener('keydown', () => audio.unlock(), { once: true });

  const input = createInput({
    onAction,
    onPause: pause,
    isPlaying: () => state.mode === 'match',
    stickElement: $('stick'),
    buttonElements: Array.from(document.querySelectorAll('#touch [data-action]'))
  });

  // Pause automatically when the window loses focus mid-match.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state.mode === 'match') {
      pause();
    }
  });

  function toast(message) {
    const el = $('toast');
    el.textContent = message;
    el.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => { el.hidden = true; }, 7000);
  }

  // ------------------------------------------------------------ main loop
  let last = performance.now();
  let time = 0;
  let fpsAccumulator = 0;
  let fpsFrames = 0;

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    time += dt;
    input.update(dt);

    let simDt = dt;
    if (state.hitStop > 0) {
      state.hitStop -= dt;
      simDt = dt * 0.05;
    } else if (state.slowMo > 0) {
      state.slowMo -= dt;
      simDt = dt * 0.35;
    }

    const match = state.match;
    let cameraMode = 'menu';
    if (state.mode === 'match' && match) {
      handleEvents(updateMatch(match, simDt, input.move()));
      if (match.phase === 'over' && match.phaseTime > 4.5 && !state.resultsShown) {
        showResults();
      }
    }

    if (match && (state.mode === 'match' || state.mode === 'paused' || state.mode === 'results')) {
      cameraMode = 'match';
      const paused = state.mode === 'paused';
      const poseDt = paused ? 0 : simDt;
      poseWrestler(ensureRig('player', match.player.wrestler.id), match.player, match.opponent, time, poseDt, match.phase);
      poseWrestler(ensureRig('opponent', match.opponent.wrestler.id), match.opponent, match.player, time, poseDt, match.phase);
      updateHud();
    } else {
      cameraMode = state.mode === 'select' ? 'select' : 'menu';
      const sel = state.selection;
      showcase.player.wrestler = findWrestler(sel.player);
      showcase.opponent.wrestler = findWrestler(sel.step === 'opponent' || state.mode === 'menu' ? sel.opponent : sel.opponent);
      poseWrestler(ensureRig('player', sel.player), showcase.player, null, time, dt, 'menu');
      poseWrestler(ensureRig('opponent', sel.opponent), showcase.opponent, null, time, dt, 'menu');
      state.rigs.opponent.root.visible = state.mode !== 'select' || sel.step === 'opponent';
    }
    if (state.rigs.opponent && cameraMode !== 'select') {
      state.rigs.opponent.root.visible = true;
    }

    arena.update(time, dt);
    audio.setExcitement(arena.excitement);
    effects.cameraFlashes(arena.excitement, dt);
    effects.update(state.mode === 'paused' ? 0 : simDt, time);
    director.update(cameraMode, match, time, dt);
    composer.render(dt);

    fpsAccumulator += dt;
    fpsFrames += 1;
    if (fpsAccumulator >= 0.5) {
      const fps = fpsFrames / fpsAccumulator;
      if (settings.showFps) {
        $('fps').textContent = Math.round(fps) + ' FPS \u00b7 ' + renderer.domElement.width + 'x' + renderer.domElement.height
          + ' \u00b7 ' + settings.quality.toUpperCase();
      }
      if (state.mode === 'match' && !state.lowFpsWarned && settings.quality !== 'low') {
        state.fpsSamples.push(fps);
        if (state.fpsSamples.length >= 12) {
          const average = state.fpsSamples.reduce((a, b) => a + b, 0) / state.fpsSamples.length;
          state.fpsSamples = [];
          if (average < 40) {
            state.lowFpsWarned = true;
            toast('Running at ' + Math.round(average) + ' FPS. Lower the graphics quality in Settings for a smoother game.');
          }
        }
      }
      fpsAccumulator = 0;
      fpsFrames = 0;
    }
  }

  showScreen('title');
  director.update('menu', null, 0, 1);
  director.snap();
  requestAnimationFrame((now) => {
    last = now;
    $('loading').classList.add('done');
    frame(now);
  });

  // Exposed for diagnostics and automated smoke tests.
  window.ddw = {
    get state() { return state; },
    get renderer() { return renderer; },
    get scene() { return scene; },
    get bloom() { return bloom; },
    get camera() { return camera; },
    startMatch,
    onAction,
    settings
  };
}

window.addEventListener('error', (event) => {
  if (!window.ddw) {
    showError(event.message || 'Unexpected error.');
  }
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start);
} else {
  start();
}
