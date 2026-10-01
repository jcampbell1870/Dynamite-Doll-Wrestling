// Procedural 3D wrestler: a jointed rig built from smooth primitives with PBR
// materials, posed every frame by procedural animation driven by match state.
import * as THREE from 'three';
import { RING_FLOOR_Y } from './arena.js';

const HAIR_COLORS = {
  'dynamite-doll': '#e8c25a',
  'steel-city-siren': '#2a1d17',
  'prairie-cyclone': '#b5562b',
  'midnight-mamba': '#120c10',
  'tundra-titan': '#f1e6c8',
  'neon-nightingale': '#ff5fa2',
  'outback-outlaw': '#5a3a22',
  'crown-jewel': '#3b2416'
};

const SKIN_TONES = {
  'dynamite-doll': '#f1c6a6',
  'steel-city-siren': '#e6b897',
  'prairie-cyclone': '#e9b996',
  'midnight-mamba': '#a8714f',
  'tundra-titan': '#f4d2bb',
  'neon-nightingale': '#efc7a4',
  'outback-outlaw': '#c98f68',
  'crown-jewel': '#8a5a3c'
};

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function easeOut(t) {
  const c = Math.min(1, Math.max(0, t));
  return 1 - (1 - c) * (1 - c);
}

function pulse(t, duration) {
  // 0 -> 1 -> 0 over duration.
  const c = Math.min(1, Math.max(0, t / duration));
  return Math.sin(c * Math.PI);
}

function capsule(radius, length, material, segments) {
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 6, segments), material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function sphere(radius, material, segments) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, segments, Math.max(8, segments * 0.75)), material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function joint(parent, x, y, z) {
  const group = new THREE.Group();
  group.position.set(x, y, z);
  parent.add(group);
  return group;
}

// Builds a limb hanging down (-y) from a joint.
function limb(parent, radius, length, material, segments) {
  const mesh = capsule(radius, length, material, segments);
  mesh.position.y = -length / 2;
  parent.add(mesh);
  return mesh;
}

export function createWrestler(wrestler, detail) {
  const segments = detail === 'low' ? 10 : detail === 'medium' ? 14 : 22;
  const primary = new THREE.Color(wrestler.primaryColor);
  const accent = new THREE.Color(wrestler.accentColor);

  const skin = new THREE.MeshPhysicalMaterial({
    color: SKIN_TONES[wrestler.id] || '#e6b897',
    roughness: 0.48,
    sheen: 0.35,
    sheenColor: new THREE.Color('#ffd9c4'),
    sheenRoughness: 0.6
  });
  const singlet = new THREE.MeshPhysicalMaterial({
    color: primary,
    roughness: 0.32,
    metalness: 0.05,
    clearcoat: 0.8,
    clearcoatRoughness: 0.25
  });
  const trim = new THREE.MeshPhysicalMaterial({
    color: accent,
    roughness: 0.3,
    metalness: 0.35,
    clearcoat: 0.6,
    emissive: accent,
    emissiveIntensity: 0.08
  });
  const boots = new THREE.MeshPhysicalMaterial({
    color: primary.clone().multiplyScalar(0.25),
    roughness: 0.25,
    clearcoat: 1,
    clearcoatRoughness: 0.1
  });
  const hairMaterial = new THREE.MeshStandardMaterial({
    color: HAIR_COLORS[wrestler.id] || '#3b2416',
    roughness: 0.55,
    metalness: 0.1
  });
  const eyeMaterial = new THREE.MeshStandardMaterial({ color: '#1a1414', roughness: 0.2 });

  const root = new THREE.Group();
  const body = joint(root, 0, 0.98, 0);
  const rig = { root, body, materials: [skin, singlet, trim, boots, hairMaterial, eyeMaterial] };

  // Pelvis and trunks.
  const pelvis = sphere(0.165, singlet, segments);
  pelvis.scale.set(0.85, 0.75, 1.2);
  body.add(pelvis);
  const belt = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.022, 8, segments * 2), trim);
  belt.rotation.x = Math.PI / 2;
  belt.scale.set(0.85, 1.2, 1);
  belt.position.y = 0.09;
  body.add(belt);

  // Spine, chest and head.
  rig.spine = joint(body, 0, 0.08, 0);
  const waist = capsule(0.12, 0.12, singlet, segments);
  waist.scale.set(0.85, 1, 1.15);
  waist.position.y = 0.1;
  rig.spine.add(waist);
  rig.chest = joint(rig.spine, 0, 0.24, 0);
  const torso = capsule(0.15, 0.16, singlet, segments);
  torso.scale.set(0.8, 1, 1.3);
  torso.position.y = 0.06;
  rig.chest.add(torso);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.245, 0.035, 0.395), trim);
  stripe.position.y = 0.02;
  rig.chest.add(stripe);
  const shoulders = capsule(0.07, 0.3, skin, segments);
  shoulders.rotation.x = Math.PI / 2;
  shoulders.position.y = 0.2;
  rig.chest.add(shoulders);

  rig.neck = joint(rig.chest, 0, 0.27, 0);
  const neckMesh = capsule(0.05, 0.06, skin, segments);
  neckMesh.position.y = 0.03;
  rig.neck.add(neckMesh);
  rig.head = joint(rig.neck, 0.01, 0.15, 0);
  const skull = sphere(0.105, skin, segments);
  skull.scale.set(1, 1.15, 0.92);
  rig.head.add(skull);
  [-0.035, 0.035].forEach((z) => {
    const eye = sphere(0.014, eyeMaterial, 8);
    eye.position.set(0.092, 0.015, z);
    eye.castShadow = false;
    rig.head.add(eye);
  });
  const hair = sphere(0.118, hairMaterial, segments);
  hair.scale.set(1.04, 1.1, 1);
  hair.position.set(-0.02, 0.025, 0);
  rig.head.add(hair);
  const fringe = sphere(0.09, hairMaterial, segments);
  fringe.scale.set(0.5, 0.45, 1.05);
  fringe.position.set(0.06, 0.085, 0);
  rig.head.add(fringe);
  rig.ponytail = joint(rig.head, -0.1, 0.05, 0);
  const tail = capsule(0.045, 0.22, hairMaterial, segments);
  tail.position.y = -0.13;
  rig.ponytail.add(tail);

  // Arms: shoulder -> elbow -> hand.
  ['L', 'R'].forEach((side) => {
    const z = side === 'L' ? 0.215 : -0.215;
    const shoulder = joint(rig.chest, 0, 0.19, z);
    limb(shoulder, 0.052, 0.2, skin, segments);
    const elbow = joint(shoulder, 0, -0.27, 0);
    limb(elbow, 0.044, 0.19, skin, segments);
    const wrist = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.06, segments), trim);
    wrist.position.y = -0.17;
    wrist.castShadow = true;
    elbow.add(wrist);
    const hand = sphere(0.05, skin, segments);
    hand.position.y = -0.27;
    hand.scale.set(0.9, 1.1, 0.7);
    elbow.add(hand);
    rig['shoulder' + side] = shoulder;
    rig['elbow' + side] = elbow;
  });

  // Legs: hip -> knee -> boot.
  ['L', 'R'].forEach((side) => {
    const z = side === 'L' ? 0.1 : -0.1;
    const hip = joint(body, 0, -0.04, z);
    limb(hip, 0.078, 0.3, skin, segments);
    const knee = joint(hip, 0, -0.44, 0);
    const kneePad = sphere(0.075, trim, segments);
    kneePad.scale.set(0.9, 1, 1);
    kneePad.position.x = 0.02;
    knee.add(kneePad);
    limb(knee, 0.062, 0.24, boots, segments).position.y = -0.2;
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.07, 0.1), boots);
    foot.position.set(0.05, -0.46, 0);
    foot.castShadow = true;
    knee.add(foot);
    rig['hip' + side] = hip;
    rig['knee' + side] = knee;
  });

  root.traverse((child) => {
    if (child.isMesh) {
      child.userData.wrestlerPart = true;
    }
  });

  rig.walkPhase = Math.random() * Math.PI * 2;
  rig.signatureGlow = 0;
  rig.trim = trim;
  return rig;
}

export function disposeWrestler(rig) {
  rig.root.traverse((child) => {
    if (child.isMesh) {
      child.geometry.dispose();
    }
  });
  rig.materials.forEach((material) => material.dispose());
  if (rig.root.parent) {
    rig.root.parent.remove(rig.root);
  }
}

const POSE_KEYS = [
  'bodyY', 'bodyTilt', 'bodyLean', 'spineX', 'spineY', 'spineZ', 'neckZ',
  'shoulderLZ', 'shoulderLX', 'elbowLZ', 'shoulderRZ', 'shoulderRX', 'elbowRZ',
  'hipLZ', 'kneeLZ', 'hipRZ', 'kneeRZ', 'hipLX', 'hipRX'
];

function basePose() {
  return {
    bodyY: 0.98, bodyTilt: 0, bodyLean: 0, spineX: 0, spineY: 0, spineZ: 0, neckZ: 0,
    shoulderLZ: 0, shoulderLX: -0.12, elbowLZ: 0.2, shoulderRZ: 0, shoulderRX: 0.12, elbowRZ: 0.2,
    hipLZ: 0, kneeLZ: 0, hipRZ: 0, kneeRZ: 0, hipLX: 0, hipRX: 0
  };
}

function stancePose(time, breath) {
  const p = basePose();
  const bob = Math.sin(time * 3.2 + breath) * 0.012;
  p.bodyY = 0.93 + bob;
  p.spineZ = -0.12;
  p.shoulderLZ = 0.55;
  p.elbowLZ = 1.7;
  p.shoulderRZ = 0.35;
  p.elbowRZ = 1.9;
  p.shoulderLX = -0.25;
  p.shoulderRX = 0.25;
  p.hipLZ = 0.32;
  p.kneeLZ = -0.5;
  p.hipRZ = -0.05;
  p.kneeRZ = -0.32;
  return p;
}

function lyingPose(time) {
  const p = basePose();
  p.bodyY = 0.14;
  p.bodyTilt = Math.PI / 2;
  p.shoulderLZ = 2.6;
  p.shoulderRZ = 2.4;
  p.shoulderLX = -0.5;
  p.shoulderRX = 0.5;
  p.elbowLZ = 0.4;
  p.elbowRZ = 0.3;
  p.kneeLZ = -0.3;
  p.hipLZ = 0.15;
  p.spineZ = Math.sin(time * 2) * 0.03;
  return p;
}

function computePose(rig, fighter, foe, time, phase) {
  const t = fighter.actionTime;
  const action = fighter.action;

  if (phase === 'intro' || phase === 'menu') {
    const p = stancePose(time, rig.walkPhase);
    p.spineZ = 0.05;
    p.shoulderLZ = 0.2;
    p.elbowLZ = 0.4;
    p.shoulderRZ = 0.2;
    p.elbowRZ = 0.4;
    p.shoulderLX = -0.6 - Math.sin(time * 2) * 0.1;
    p.shoulderRX = 0.6 + Math.sin(time * 2) * 0.1;
    return p;
  }

  switch (action) {
    case 'walk': {
      const p = stancePose(time, rig.walkPhase);
      const s = Math.sin(rig.walkPhase);
      const c = Math.cos(rig.walkPhase);
      p.hipLZ = 0.15 + s * 0.55;
      p.hipRZ = 0.15 - s * 0.55;
      p.kneeLZ = -0.35 - Math.max(0, -c) * 0.8;
      p.kneeRZ = -0.35 - Math.max(0, c) * 0.8;
      p.bodyY = 0.93 + Math.abs(c) * 0.03;
      p.spineY = s * 0.12;
      return p;
    }

    case 'strike': {
      const p = stancePose(time, rig.walkPhase);
      const k = pulse(t, 0.3);
      p.shoulderRZ = lerp(0.35, 1.55, k);
      p.elbowRZ = lerp(1.9, 0.1, k);
      p.spineY = -0.45 * k;
      p.bodyLean = -0.15 * k;
      return p;
    }

    case 'grapple': {
      const p = stancePose(time, rig.walkPhase);
      const reach = easeOut(t / 0.2);
      const arch = pulse(t - 0.15, 0.5);
      p.shoulderLZ = lerp(0.55, 1.3, reach) + arch * 1.2;
      p.shoulderRZ = lerp(0.35, 1.3, reach) + arch * 1.2;
      p.elbowLZ = 0.5;
      p.elbowRZ = 0.5;
      p.bodyLean = -0.25 * reach + arch * 1.1;
      p.bodyY = 0.9 - arch * 0.25;
      p.kneeLZ = -0.6 - arch * 0.4;
      p.kneeRZ = -0.6 - arch * 0.4;
      return p;
    }

    case 'signature': {
      const p = stancePose(time, rig.walkPhase);
      const jump = pulse(t, 0.8);
      const dive = easeOut((t - 0.25) / 0.4);
      p.bodyY = 0.95 + jump * 0.9;
      p.bodyLean = -dive * 1.2 * (1 - easeOut((t - 0.75) / 0.25));
      p.shoulderLZ = lerp(0.5, 2.9, dive);
      p.shoulderRZ = lerp(0.5, 2.9, dive);
      p.elbowLZ = 0.1;
      p.elbowRZ = 0.1;
      p.hipLZ = -0.2 * dive;
      p.hipRZ = -0.2 * dive;
      p.kneeLZ = -0.6 * (1 - dive);
      p.kneeRZ = -0.6 * (1 - dive);
      return p;
    }

    case 'hurt': {
      const p = stancePose(time, rig.walkPhase);
      const k = pulse(t, 0.35);
      p.bodyLean = 0.3 * k;
      p.neckZ = 0.5 * k;
      p.shoulderLZ = 0.2;
      p.shoulderRZ = 0.1;
      p.elbowLZ = 0.6;
      p.elbowRZ = 0.6;
      return p;
    }

    case 'down':
    case 'pinned': {
      const lying = lyingPose(time);
      if (action === 'down' && t < 0.4) {
        // Slammed onto the mat.
        const standing = stancePose(time, rig.walkPhase);
        const k = easeOut(t / 0.4);
        const arc = pulse(t, 0.4) * 0.35;
        const p = {};
        POSE_KEYS.forEach((key) => { p[key] = lerp(standing[key], lying[key], k); });
        p.bodyY += arc;
        return p;
      }
      if (action === 'pinned') {
        lying.hipLZ = 0.4 + Math.sin(time * 9) * 0.05;
        lying.shoulderRZ = 2.0 + Math.sin(time * 11) * 0.15;
      }
      return lying;
    }

    case 'getup': {
      const lying = lyingPose(time);
      const standing = stancePose(time, rig.walkPhase);
      const k = easeOut(t / 0.6);
      const p = {};
      POSE_KEYS.forEach((key) => { p[key] = lerp(lying[key], standing[key], k); });
      p.kneeLZ -= pulse(t, 0.6) * 1.2;
      p.kneeRZ -= pulse(t, 0.6) * 1.2;
      return p;
    }

    case 'pinning': {
      const p = basePose();
      p.bodyY = 0.3;
      p.bodyTilt = -Math.PI / 2 * 0.86;
      p.shoulderLZ = 1.4;
      p.shoulderRZ = 1.4;
      p.shoulderLX = -0.6;
      p.shoulderRX = 0.6;
      p.elbowLZ = 0.6;
      p.elbowRZ = 0.6;
      p.hipLZ = 0.6;
      p.hipRZ = 0.3;
      p.kneeLZ = -1.6;
      p.kneeRZ = -1.2;
      p.neckZ = -0.6;
      return p;
    }

    case 'celebrate': {
      const p = basePose();
      const bounce = Math.abs(Math.sin(time * 5)) * 0.06;
      p.bodyY = 0.98 + bounce;
      p.shoulderLZ = 0.4;
      p.shoulderRZ = 0.4;
      p.shoulderLX = -2.7;
      p.shoulderRX = 2.7;
      p.elbowLZ = 0.3 + Math.sin(time * 5) * 0.2;
      p.elbowRZ = 0.3 - Math.sin(time * 5) * 0.2;
      p.neckZ = 0.25;
      p.spineZ = 0.08;
      return p;
    }

    default:
      return stancePose(time, rig.walkPhase);
  }
}

// Places and poses a rig for one frame. `blend` smooths transitions.
export function poseWrestler(rig, fighter, foe, time, dt, phase) {
  if (fighter.moving && fighter.action === 'walk') {
    rig.walkPhase += dt * 9 * (0.75 + fighter.wrestler.speed / 20);
  }

  const target = computePose(rig, fighter, foe, time, phase);
  const current = rig.pose || target;
  const snap = fighter.action === 'strike' || fighter.action === 'signature' || fighter.action === 'down';
  const k = snap ? 1 : 1 - Math.exp(-dt * 14);
  const pose = {};
  POSE_KEYS.forEach((key) => { pose[key] = lerp(current[key], target[key], k); });
  rig.pose = pose;

  let x = fighter.x;
  let z = fighter.z;
  let facing = fighter.facing;
  if (fighter.action === 'pinning' && foe) {
    // Lie across the pinned wrestler's chest.
    const back = foe.facing + Math.PI;
    const side = foe.facing + Math.PI / 2;
    x = foe.x + Math.cos(back) * 0.38 + Math.cos(side) * 0.62;
    z = foe.z + Math.sin(back) * 0.38 + Math.sin(side) * 0.62;
    facing = side + Math.PI;
  }

  rig.root.position.set(x, RING_FLOOR_Y, z);
  rig.root.rotation.y = -facing;
  rig.body.position.y = pose.bodyY;
  rig.body.rotation.z = pose.bodyTilt + pose.bodyLean;
  rig.spine.rotation.set(pose.spineX, pose.spineY, pose.spineZ);
  rig.neck.rotation.z = pose.neckZ;
  rig.shoulderL.rotation.set(pose.shoulderLX, 0, pose.shoulderLZ);
  rig.shoulderR.rotation.set(pose.shoulderRX, 0, pose.shoulderRZ);
  rig.elbowL.rotation.z = pose.elbowLZ;
  rig.elbowR.rotation.z = pose.elbowRZ;
  rig.hipL.rotation.set(pose.hipLX, 0, pose.hipLZ);
  rig.hipR.rotation.set(pose.hipRX, 0, pose.hipRZ);
  rig.kneeL.rotation.z = pose.kneeLZ;
  rig.kneeR.rotation.z = pose.kneeRZ;
  rig.ponytail.rotation.z = -0.3 - pose.bodyLean * 0.5 + Math.sin(time * 4 + rig.walkPhase) * 0.12;

  const glowTarget = fighter.action === 'signature' ? 5 : fighter.momentum >= 100 ? 2 + Math.sin(time * 6) * 0.8 : 0.08;
  rig.signatureGlow = lerp(rig.signatureGlow, glowTarget, 1 - Math.exp(-dt * 8));
  rig.trim.emissiveIntensity = rig.signatureGlow;
}
