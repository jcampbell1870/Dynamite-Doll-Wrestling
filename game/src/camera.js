// Broadcast-style camera director: menu/intro orbits, a hard camera that
// frames both wrestlers, dramatic close-ups for signatures and pinfalls.
import * as THREE from 'three';
import { RING_FLOOR_Y } from './arena.js';

export function createCameraDirector(camera) {
  const position = new THREE.Vector3(0, 6, 14);
  const lookAt = new THREE.Vector3(0, RING_FLOOR_Y + 1, 0);
  const desiredPosition = new THREE.Vector3();
  const desiredLook = new THREE.Vector3();
  let shake = 0;
  let focus = null;
  let focusTime = 0;

  return {
    shakeEnabled: true,
    addShake(amount) {
      if (this.shakeEnabled) {
        shake = Math.min(0.35, shake + amount);
      }
    },
    // Briefly frame a dramatic moment (e.g. a signature move).
    focusOn(x, z, seconds) {
      focus = { x, z };
      focusTime = seconds;
    },
    snap() {
      position.copy(desiredPosition);
      lookAt.copy(desiredLook);
    },
    update(mode, match, time, dt) {
      focusTime = Math.max(0, focusTime - dt);
      const floor = RING_FLOOR_Y;

      if (mode === 'menu') {
        const angle = time * 0.08;
        desiredPosition.set(Math.sin(angle) * 11, floor + 4.5 + Math.sin(time * 0.2) * 1, Math.cos(angle) * 11);
        desiredLook.set(0, floor + 0.9, 0);
      } else if (mode === 'select') {
        desiredPosition.set(0, floor + 1.7, 4.6);
        desiredLook.set(0, floor + 1.05, 0);
      } else if (match && match.phase === 'intro') {
        const t = match.phaseTime;
        const angle = -0.9 + t * 0.35;
        const radius = 8 - t * 0.6;
        desiredPosition.set(Math.sin(angle) * radius, floor + 3 - t * 0.25, Math.cos(angle) * radius);
        desiredLook.set(0, floor + 1, 0);
      } else if (match && (match.phase === 'fallBreak' || match.phase === 'over')) {
        const winner = match.phase === 'over'
          ? (match.winner === 'player' ? match.player : match.opponent)
          : (match.player.action === 'celebrate' ? match.player : match.opponent);
        const angle = time * 0.3;
        desiredPosition.set(winner.x + Math.sin(angle) * 3.4, floor + 1.6, winner.z + Math.cos(angle) * 3.4);
        desiredLook.set(winner.x, floor + 1.1, winner.z);
      } else if (match && match.pin) {
        const pinned = match.pin.by === 'player' ? match.opponent : match.player;
        desiredPosition.set(pinned.x + 0.6, floor + 0.9, pinned.z + 2.6);
        desiredLook.set(pinned.x, floor + 0.25, pinned.z);
      } else if (match) {
        const mx = (match.player.x + match.opponent.x) / 2;
        const mz = (match.player.z + match.opponent.z) / 2;
        const separation = Math.hypot(match.player.x - match.opponent.x, match.player.z - match.opponent.z);
        const distance = 6.2 + separation * 0.9;
        desiredPosition.set(mx * 0.55, floor + 2.5 + separation * 0.25, mz * 0.4 + distance);
        desiredLook.set(mx, floor + 0.95, mz);

        if (focus && focusTime > 0) {
          const angle = 0.6 + (1 - focusTime) * 0.5;
          desiredPosition.set(focus.x + Math.sin(angle) * 2.6, floor + 1.3, focus.z + Math.cos(angle) * 2.6);
          desiredLook.set(focus.x, floor + 1, focus.z);
        }
      }

      const rate = mode === 'select' ? 4 : (match && match.pin) || focusTime > 0 ? 3.5 : 2.4;
      const k = 1 - Math.exp(-dt * rate);
      position.lerp(desiredPosition, k);
      lookAt.lerp(desiredLook, k);

      shake = Math.max(0, shake - dt * 1.2);
      camera.position.copy(position);
      if (shake > 0) {
        camera.position.x += (Math.random() - 0.5) * shake;
        camera.position.y += (Math.random() - 0.5) * shake;
      }
      camera.lookAt(lookAt);
    }
  };
}
