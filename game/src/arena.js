// The arena: ring, lighting rig, instanced crowd, titantron and LED boards.
import * as THREE from 'three';
import { RING_HALF } from './match.js';

export const RING_FLOOR_Y = 1.05;
const ROPE_HALF = RING_HALF + 0.45;
const APRON_HALF = ROPE_HALF + 0.35;
const ROPE_HEIGHTS = [0.42, 0.82, 1.22];
const ROPE_COLORS = ['#e01b24', '#f5f5f5', '#1e4fd8'];

function canvasTexture(width, height, draw, renderer) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  draw(ctx, width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  texture.userData.ctx = ctx;
  return texture;
}

function drawLogo(ctx, x, y, size, align) {
  ctx.save();
  ctx.textAlign = align || 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '900 ' + size + 'px "Arial Black", Impact, system-ui, sans-serif';
  ctx.lineWidth = size * 0.08;
  ctx.strokeStyle = '#1b0d14';
  ctx.strokeText('DYNAMITE DOLL', x, y - size * 0.55);
  ctx.fillStyle = '#ff3d6e';
  ctx.fillText('DYNAMITE DOLL', x, y - size * 0.55);
  ctx.font = '800 ' + Math.round(size * 0.62) + 'px "Arial Black", Impact, system-ui, sans-serif';
  ctx.strokeText('WRESTLING', x, y + size * 0.45);
  ctx.fillStyle = '#ffd44d';
  ctx.fillText('WRESTLING', x, y + size * 0.45);
  ctx.restore();
}

function buildRing(group, renderer) {
  // Ring mat with a printed centre logo.
  const matTexture = canvasTexture(1024, 1024, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 60, w / 2, h / 2, w * 0.7);
    g.addColorStop(0, '#d8d4cb');
    g.addColorStop(1, '#b9b4a8');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) {
      ctx.fillStyle = 'rgba(0,0,0,' + (Math.random() * 0.025) + ')';
      ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, 250, 0, Math.PI * 2);
    ctx.lineWidth = 14;
    ctx.strokeStyle = '#ff3d6e';
    ctx.stroke();
    drawLogo(ctx, w / 2, h / 2, 92);
  }, renderer);
  const matMaterial = new THREE.MeshStandardMaterial({ map: matTexture, roughness: 0.82 });
  const mat = new THREE.Mesh(new THREE.BoxGeometry(APRON_HALF * 2, 0.08, APRON_HALF * 2), [
    matMaterial, matMaterial, matMaterial, matMaterial, matMaterial, matMaterial
  ]);
  mat.position.y = RING_FLOOR_Y - 0.04;
  mat.receiveShadow = true;
  group.add(mat);

  // Apron skirt with the logo printed around it.
  const apronTexture = canvasTexture(2048, 256, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#1a1030');
    g.addColorStop(1, '#07040d');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#ff3d6e';
    ctx.fillRect(0, 0, w, 10);
    drawLogo(ctx, w / 2, h / 2 + 8, 78);
  }, renderer);
  const apron = new THREE.Mesh(
    new THREE.BoxGeometry(APRON_HALF * 2, RING_FLOOR_Y - 0.08, APRON_HALF * 2),
    new THREE.MeshStandardMaterial({ map: apronTexture, roughness: 0.7 }));
  apron.position.y = (RING_FLOOR_Y - 0.08) / 2;
  apron.castShadow = true;
  apron.receiveShadow = true;
  group.add(apron);

  // Steel posts and turnbuckle pads.
  const steel = new THREE.MeshStandardMaterial({ color: '#c9ced6', metalness: 1, roughness: 0.22 });
  const pad = new THREE.MeshPhysicalMaterial({ color: '#ff3d6e', roughness: 0.35, clearcoat: 0.7 });
  const corners = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
  corners.forEach(([sx, sz]) => {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.5, 24), steel);
    post.position.set(sx * ROPE_HALF, RING_FLOOR_Y + 0.7, sz * ROPE_HALF);
    post.castShadow = true;
    group.add(post);
    ROPE_HEIGHTS.forEach((h) => {
      const turnbuckle = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.22), pad);
      turnbuckle.position.set(sx * (ROPE_HALF - 0.1), RING_FLOOR_Y + h, sz * (ROPE_HALF - 0.1));
      turnbuckle.rotation.y = Math.PI / 4;
      turnbuckle.castShadow = true;
      group.add(turnbuckle);
    });
  });

  // Ropes: four sides, three heights. Kept in a list so they can vibrate.
  const ropes = [];
  ROPE_HEIGHTS.forEach((h, level) => {
    const material = new THREE.MeshPhysicalMaterial({
      color: ROPE_COLORS[level], roughness: 0.35, clearcoat: 0.5,
      emissive: ROPE_COLORS[level], emissiveIntensity: 0.06
    });
    for (let side = 0; side < 4; side++) {
      const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, ROPE_HALF * 2, 12), material);
      rope.rotation.z = Math.PI / 2;
      if (side >= 2) {
        rope.rotation.y = Math.PI / 2;
      }
      const offset = side % 2 === 0 ? ROPE_HALF : -ROPE_HALF;
      if (side < 2) {
        rope.position.set(0, RING_FLOOR_Y + h, offset);
      } else {
        rope.position.set(offset, RING_FLOOR_Y + h, 0);
      }
      rope.castShadow = true;
      rope.userData.baseY = rope.position.y;
      rope.userData.phase = level * 1.3 + side;
      ropes.push(rope);
      group.add(rope);
    }
  });

  // Steel steps.
  [[1, 1], [-1, -1]].forEach(([sx, sz]) => {
    const steps = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.35 * (i + 1), 0.4), steel);
      step.position.set(0, 0.175 * (i + 1), -i * 0.4);
      step.castShadow = true;
      step.receiveShadow = true;
      steps.add(step);
    }
    steps.position.set(sx * (APRON_HALF + 0.9), 0, sz * (APRON_HALF + 0.9));
    steps.lookAt(0, 0, 0);
    steps.rotateY(Math.PI);
    group.add(steps);
  });

  return { ropes, matTexture, apronTexture };
}

function buildFloorAndBarricade(group, renderer) {
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(60, 64),
    new THREE.MeshStandardMaterial({ color: '#0a0a10', roughness: 0.55, metalness: 0.2 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  group.add(floor);

  // Padded ringside mats.
  const padMat = new THREE.Mesh(
    new THREE.BoxGeometry(APRON_HALF * 2 + 3, 0.04, APRON_HALF * 2 + 3),
    new THREE.MeshStandardMaterial({ color: '#141a2e', roughness: 0.9 }));
  padMat.position.y = 0.02;
  padMat.receiveShadow = true;
  group.add(padMat);

  // Barricade with LED strip.
  const ledTexture = canvasTexture(2048, 64, (ctx, w, h) => {
    ctx.fillStyle = '#05020a';
    ctx.fillRect(0, 0, w, h);
    ctx.font = '900 44px "Arial Black", Impact, sans-serif';
    ctx.textBaseline = 'middle';
    for (let x = 0; x < w; x += 512) {
      ctx.fillStyle = '#ff3d6e';
      ctx.fillText('DYNAMITE DOLL', x + 10, h / 2);
      ctx.fillStyle = '#ffd44d';
      ctx.fillText('\u2605', x + 440, h / 2);
    }
  }, renderer);
  ledTexture.wrapS = THREE.RepeatWrapping;
  ledTexture.repeat.set(3, 1);
  const ledMaterial = new THREE.MeshBasicMaterial({ map: ledTexture, toneMapped: false });
  const barricadeMaterial = new THREE.MeshStandardMaterial({ color: '#111118', roughness: 0.4, metalness: 0.6 });
  const half = APRON_HALF + 3.2;
  for (let side = 0; side < 4; side++) {
    const wall = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(half * 2, 1.05, 0.12), barricadeMaterial);
    body.position.y = 0.52;
    body.castShadow = true;
    wall.add(body);
    const led = new THREE.Mesh(new THREE.PlaneGeometry(half * 2, 0.32), ledMaterial);
    led.position.set(0, 0.62, 0.065);
    wall.add(led);
    wall.rotation.y = side * Math.PI / 2;
    wall.position.set(Math.sin(side * Math.PI / 2) * half, 0, Math.cos(side * Math.PI / 2) * half);
    group.add(wall);
  }

  return { ledTexture };
}

function buildCrowd(group, count) {
  const bodyGeometry = new THREE.CapsuleGeometry(0.2, 0.45, 2, 6);
  const headGeometry = new THREE.SphereGeometry(0.13, 8, 6);
  const bodyMaterial = new THREE.MeshStandardMaterial({ roughness: 0.85 });
  const headMaterial = new THREE.MeshStandardMaterial({ color: '#c79c80', roughness: 0.7 });
  const bodies = new THREE.InstancedMesh(bodyGeometry, bodyMaterial, count);
  const heads = new THREE.InstancedMesh(headGeometry, headMaterial, count);
  bodies.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  heads.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

  const seats = [];
  const palette = ['#ff3d6e', '#ffd44d', '#3b82f6', '#f5f5f5', '#22c55e', '#a855f7', '#111827', '#f97316', '#e11d48'];
  const color = new THREE.Color();
  const rowsPerSide = Math.max(4, Math.ceil(Math.sqrt(count / 4 / 3)));
  const inner = APRON_HALF + 4.6;
  let index = 0;
  for (let row = 0; row < rowsPerSide && index < count; row++) {
    const distance = inner + row * 0.95;
    const height = 0.4 + row * 0.55;
    const perRow = Math.ceil(count / 4 / rowsPerSide);
    for (let side = 0; side < 4 && index < count; side++) {
      for (let i = 0; i < perRow && index < count; i++) {
        const along = (i / (perRow - 1 || 1) - 0.5) * distance * 2 * 0.96;
        const jitter = (Math.random() - 0.5) * 0.25;
        const angle = side * Math.PI / 2;
        const x = Math.sin(angle) * distance + Math.cos(angle) * along + jitter;
        const z = Math.cos(angle) * distance - Math.sin(angle) * along + jitter;
        seats.push({ x, y: height, z, phase: Math.random() * Math.PI * 2, energy: 0.5 + Math.random() });
        color.set(palette[Math.floor(Math.random() * palette.length)]).multiplyScalar(0.55 + Math.random() * 0.45);
        bodies.setColorAt(index, color);
        color.setHSL(0.06 + Math.random() * 0.03, 0.4, 0.25 + Math.random() * 0.45);
        heads.setColorAt(index, color);
        index++;
      }
    }
  }

  bodies.count = index;
  heads.count = index;
  group.add(bodies, heads);

  // Tiered stands under the crowd.
  const standMaterial = new THREE.MeshStandardMaterial({ color: '#0d0b14', roughness: 0.8 });
  for (let row = 0; row < rowsPerSide; row++) {
    const distance = inner + row * 0.95;
    for (let side = 0; side < 4; side++) {
      const tier = new THREE.Mesh(new THREE.BoxGeometry(distance * 2, 0.4 + row * 0.55, 0.95), standMaterial);
      tier.position.set(0, (0.4 + row * 0.55) / 2 - 0.4, 0);
      const holder = new THREE.Group();
      holder.add(tier);
      holder.rotation.y = side * Math.PI / 2;
      holder.position.set(Math.sin(side * Math.PI / 2) * distance, 0, Math.cos(side * Math.PI / 2) * distance);
      tier.receiveShadow = true;
      group.add(holder);
    }
  }

  return { bodies, heads, seats, dummy: new THREE.Object3D() };
}

function updateCrowd(crowd, time, excitement) {
  const { bodies, heads, seats, dummy } = crowd;
  for (let i = 0; i < seats.length; i++) {
    const seat = seats[i];
    const jump = Math.max(0, Math.sin(time * (3 + seat.energy * 2) + seat.phase)) * (0.04 + excitement * 0.3 * seat.energy);
    dummy.position.set(seat.x, seat.y + 0.42 + jump, seat.z);
    dummy.lookAt(0, seat.y + 0.42 + jump, 0);
    dummy.updateMatrix();
    bodies.setMatrixAt(i, dummy.matrix);
    dummy.position.y += 0.43;
    dummy.updateMatrix();
    heads.setMatrixAt(i, dummy.matrix);
  }
  bodies.instanceMatrix.needsUpdate = true;
  heads.instanceMatrix.needsUpdate = true;
}

function buildTitantron(group, renderer) {
  const texture = canvasTexture(1280, 720, (ctx, w, h) => {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
  }, renderer);
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(14, 7.875),
    new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }));
  screen.position.set(0, 8.2, -(APRON_HALF + 13));
  group.add(screen);
  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(14.6, 8.4, 0.4),
    new THREE.MeshStandardMaterial({ color: '#0c0c12', metalness: 0.8, roughness: 0.3 }));
  frame.position.set(0, 8.2, -(APRON_HALF + 13.25));
  group.add(frame);

  // Entrance stage below the screen.
  const stage = new THREE.Mesh(
    new THREE.BoxGeometry(16, 0.6, 4),
    new THREE.MeshStandardMaterial({ color: '#15121f', metalness: 0.5, roughness: 0.35 }));
  stage.position.set(0, 0.3, -(APRON_HALF + 11.5));
  stage.receiveShadow = true;
  group.add(stage);
  return { texture, screen };
}

function drawTitantron(titantron, view, time) {
  const ctx = titantron.texture.userData.ctx;
  const w = 1280;
  const h = 720;
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, '#12061c');
  g.addColorStop(1, '#2a0716');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // Animated diagonal stripes.
  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = '#ff3d6e';
  const shift = (time * 120) % 160;
  for (let x = -h; x < w + h; x += 160) {
    ctx.beginPath();
    ctx.moveTo(x + shift, 0);
    ctx.lineTo(x + shift + 60, 0);
    ctx.lineTo(x + shift + 60 - h, h);
    ctx.lineTo(x + shift - h, h);
    ctx.fill();
  }
  ctx.restore();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (view.mode === 'versus') {
    const left = view.player;
    const right = view.opponent;
    ctx.font = '900 64px "Arial Black", Impact, sans-serif';
    ctx.fillStyle = left.primaryColor;
    ctx.fillText(left.nickname.toUpperCase(), w * 0.27, h * 0.4);
    ctx.fillStyle = right.primaryColor;
    ctx.fillText(right.nickname.toUpperCase(), w * 0.73, h * 0.6);
    ctx.font = '900 150px "Arial Black", Impact, sans-serif';
    ctx.fillStyle = '#ffd44d';
    ctx.fillText('VS', w / 2, h / 2 + Math.sin(time * 4) * 8);
    ctx.font = '700 36px system-ui, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(left.name, w * 0.27, h * 0.4 + 60);
    ctx.fillText(right.name, w * 0.73, h * 0.6 + 60);
  } else if (view.mode === 'text') {
    ctx.font = '900 110px "Arial Black", Impact, sans-serif';
    ctx.fillStyle = view.color || '#ffd44d';
    ctx.fillText(view.text, w / 2, h / 2);
    if (view.sub) {
      ctx.font = '700 44px system-ui, sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(view.sub, w / 2, h / 2 + 100);
    }
  } else {
    drawLogo(ctx, w / 2, h / 2, 130);
  }

  titantron.texture.needsUpdate = true;
}

function buildLighting(scene, group, quality) {
  scene.add(new THREE.HemisphereLight('#6d5a9a', '#0b0610', 0.45));

  // Overhead truss.
  const trussMaterial = new THREE.MeshStandardMaterial({ color: '#202028', metalness: 0.9, roughness: 0.35 });
  const lampMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff6e0').multiplyScalar(5) });
  const truss = new THREE.Group();
  const size = APRON_HALF * 2 + 1.5;
  for (let side = 0; side < 4; side++) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(size, 0.3, 0.3), trussMaterial);
    beam.position.set(0, 0, size / 2);
    const holder = new THREE.Group();
    holder.rotation.y = side * Math.PI / 2;
    holder.add(beam);
    for (let i = -2; i <= 2; i++) {
      const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.25, 16), trussMaterial);
      lamp.position.set(i * size / 5, -0.25, size / 2);
      holder.add(lamp);
      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.15, 16), lampMaterial);
      lens.rotation.x = Math.PI / 2;
      lens.position.set(i * size / 5, -0.38, size / 2);
      holder.add(lens);
    }
    truss.add(holder);
  }
  truss.position.y = RING_FLOOR_Y + 7.5;
  group.add(truss);

  // Key light over the ring (casts the shadows).
  const key = new THREE.SpotLight('#fff4e6', 180, 30, Math.PI / 5.2, 0.45, 1.6);
  key.position.set(0.8, RING_FLOOR_Y + 9.5, 1.2);
  key.target.position.set(0, RING_FLOOR_Y, 0);
  key.castShadow = quality.shadows;
  if (quality.shadows) {
    key.shadow.mapSize.set(quality.shadowMap, quality.shadowMap);
    key.shadow.bias = -0.00008;
    key.shadow.normalBias = 0.02;
    key.shadow.radius = 4;
    key.shadow.camera.near = 4;
    key.shadow.camera.far = 16;
  }
  scene.add(key, key.target);

  // Coloured moving heads that sweep the ring.
  const movers = [];
  const colors = ['#ff3d6e', '#3b82f6', '#ffd44d', '#a855f7'];
  colors.forEach((color, index) => {
    const light = new THREE.SpotLight(color, 60, 28, Math.PI / 12, 0.6, 1.4);
    const angle = index * Math.PI / 2 + Math.PI / 4;
    light.position.set(Math.cos(angle) * 6, RING_FLOOR_Y + 7.2, Math.sin(angle) * 6);
    scene.add(light, light.target);
    movers.push({ light, phase: index * 1.7 });
  });

  // Fake volumetric beams for the haze look.
  const beams = [];
  if (quality.beams) {
    const beamGeometry = new THREE.ConeGeometry(0.9, 7.5, 32, 1, true);
    beamGeometry.translate(0, -3.75, 0);
    movers.forEach((mover) => {
      const material = new THREE.ShaderMaterial({
        uniforms: { color: { value: new THREE.Color(mover.light.color) }, strength: { value: 0.16 } },
        vertexShader: 'varying float vY; varying vec3 vN; varying vec3 vV;\n'
          + 'void main(){ vY = position.y; vec4 mv = modelViewMatrix * vec4(position,1.0);\n'
          + 'vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
        fragmentShader: 'uniform vec3 color; uniform float strength; varying float vY; varying vec3 vN; varying vec3 vV;\n'
          + 'void main(){ float fade = clamp(1.0 + vY / 7.5, 0.0, 1.0); float rim = pow(abs(dot(vN, vV)), 1.5);\n'
          + 'gl_FragColor = vec4(color * strength * fade * rim, 1.0); }',
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide
      });
      const cone = new THREE.Mesh(beamGeometry, material);
      cone.position.copy(mover.light.position);
      scene.add(cone);
      beams.push(cone);
    });
  }

  return { key, movers, beams };
}

export function createArena(scene, renderer, quality) {
  const group = new THREE.Group();
  scene.add(group);
  scene.background = new THREE.Color('#04030a');
  scene.fog = new THREE.FogExp2('#0a0614', 0.022);

  const ring = buildRing(group, renderer);
  const floor = buildFloorAndBarricade(group, renderer);
  const crowd = buildCrowd(group, quality.crowd);
  const titantron = buildTitantron(group, renderer);
  const lights = buildLighting(scene, group, quality);

  const arena = {
    group,
    ropes: ring.ropes,
    ropeShake: 0,
    excitement: 0.2,
    titantronView: { mode: 'logo' },
    titantronTimer: 0,
    update(time, dt) {
      this.excitement = Math.max(0.15, this.excitement - dt * 0.25);
      updateCrowd(crowd, time, this.excitement);
      floor.ledTexture.offset.x = (time * 0.05) % 1;

      lights.movers.forEach((mover, index) => {
        const sweep = time * (0.35 + this.excitement * 0.6) + mover.phase;
        mover.light.target.position.set(
          Math.sin(sweep) * 2.6,
          RING_FLOOR_Y,
          Math.cos(sweep * 1.3) * 2.6);
        mover.light.target.updateMatrixWorld();
        mover.light.intensity = 45 + this.excitement * 90;
        const beam = lights.beams[index];
        if (beam) {
          beam.lookAt(mover.light.target.position);
          beam.rotateX(-Math.PI / 2);
          beam.material.uniforms.strength.value = 0.1 + this.excitement * 0.18;
        }
      });

      this.ropeShake = Math.max(0, this.ropeShake - dt * 2.5);
      this.ropes.forEach((rope) => {
        rope.position.y = rope.userData.baseY + Math.sin(time * 26 + rope.userData.phase) * 0.025 * this.ropeShake;
      });

      this.titantronTimer -= dt;
      if (this.titantronTimer <= 0) {
        this.titantronTimer = 1 / 15;
        drawTitantron(titantron, this.titantronView, time);
      }
    },
    hype(amount) {
      this.excitement = Math.min(1, this.excitement + amount);
    }
  };

  return arena;
}

export const ARENA_SIZE = { ROPE_HALF, APRON_HALF };
