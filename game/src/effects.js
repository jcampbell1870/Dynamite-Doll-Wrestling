// GPU particle effects: impact sparks, pyro fountains, confetti and the
// photographers' camera flashes in the crowd.
import * as THREE from 'three';
import { RING_FLOOR_Y, ARENA_SIZE } from './arena.js';

const VERTEX = `
attribute float size;
attribute vec3 color;
attribute float alpha;
varying vec3 vColor;
varying float vAlpha;
uniform float pixelScale;
void main() {
  vColor = color;
  vAlpha = alpha;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = size * pixelScale / max(0.1, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;

const FRAGMENT = `
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  if (d > 0.5) discard;
  float glow = smoothstep(0.5, 0.0, d);
  gl_FragColor = vec4(vColor * glow * vAlpha * 3.0, 1.0);
}`;

export function createEffects(scene, capacity) {
  const positions = new Float32Array(capacity * 3);
  const colors = new Float32Array(capacity * 3);
  const sizes = new Float32Array(capacity);
  const alphas = new Float32Array(capacity);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1).setUsage(THREE.DynamicDrawUsage));
  const material = new THREE.ShaderMaterial({
    uniforms: { pixelScale: { value: 600 } },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  scene.add(points);

  const particles = [];
  const tmpColor = new THREE.Color();

  // A flash of light at impact points.
  const impactLight = new THREE.PointLight('#ffe2b0', 0, 6, 2);
  scene.add(impactLight);

  function spawn(p) {
    if (particles.length >= capacity) {
      particles.shift();
    }
    particles.push(p);
  }

  const effects = {
    points,
    setPixelScale(height) {
      material.uniforms.pixelScale.value = height * 0.9;
    },
    sparks(x, y, z, intensity, color) {
      const count = Math.round(20 + intensity * 4);
      tmpColor.set(color || '#ffd9a0');
      for (let i = 0; i < count; i++) {
        const theta = Math.random() * Math.PI * 2;
        const up = Math.random() * 0.9 + 0.1;
        const speed = 2 + Math.random() * (3 + intensity * 0.15);
        spawn({
          x, y, z,
          vx: Math.cos(theta) * speed * (1 - up * 0.5),
          vy: up * speed,
          vz: Math.sin(theta) * speed * (1 - up * 0.5),
          life: 0.3 + Math.random() * 0.5,
          max: 0.8,
          size: 0.05 + Math.random() * 0.06,
          r: tmpColor.r, g: tmpColor.g, b: tmpColor.b,
          gravity: 9.8,
          drag: 1.5
        });
      }
      impactLight.position.set(x, y + 0.3, z);
      impactLight.intensity = 8 + intensity * 1.2;
    },
    pyro(colors) {
      const palette = colors || ['#ff3d6e', '#ffd44d', '#ffffff'];
      const h = ARENA_SIZE.ROPE_HALF;
      [[h, h], [h, -h], [-h, h], [-h, -h]].forEach(([px, pz]) => {
        for (let i = 0; i < 140; i++) {
          tmpColor.set(palette[i % palette.length]);
          spawn({
            x: px, y: RING_FLOOR_Y + 1.5, z: pz,
            vx: (Math.random() - 0.5) * 1.6,
            vy: 6 + Math.random() * 6,
            vz: (Math.random() - 0.5) * 1.6,
            life: 1 + Math.random() * 1.2,
            max: 2.2,
            size: 0.08 + Math.random() * 0.08,
            r: tmpColor.r, g: tmpColor.g, b: tmpColor.b,
            gravity: 7,
            drag: 0.6
          });
        }
      });
    },
    confetti(colors) {
      const palette = colors || ['#ff3d6e', '#ffd44d', '#ffffff', '#3b82f6'];
      for (let i = 0; i < 500; i++) {
        tmpColor.set(palette[i % palette.length]).multiplyScalar(0.6);
        spawn({
          x: (Math.random() - 0.5) * 10,
          y: RING_FLOOR_Y + 7 + Math.random() * 3,
          z: (Math.random() - 0.5) * 10,
          vx: (Math.random() - 0.5) * 0.6,
          vy: -0.8 - Math.random() * 0.6,
          vz: (Math.random() - 0.5) * 0.6,
          life: 6 + Math.random() * 3,
          max: 9,
          size: 0.06 + Math.random() * 0.05,
          r: tmpColor.r, g: tmpColor.g, b: tmpColor.b,
          gravity: 0,
          drag: 0,
          flutter: Math.random() * Math.PI * 2
        });
      }
    },
    cameraFlashes(excitement, dt) {
      const rate = (4 + excitement * 40) * dt;
      let n = Math.floor(rate) + (Math.random() < rate % 1 ? 1 : 0);
      while (n-- > 0) {
        const side = Math.floor(Math.random() * 4) * Math.PI / 2;
        const distance = ARENA_SIZE.APRON_HALF + 5 + Math.random() * 6;
        const along = (Math.random() - 0.5) * distance * 1.8;
        spawn({
          x: Math.sin(side) * distance + Math.cos(side) * along,
          y: 1.5 + Math.random() * 4,
          z: Math.cos(side) * distance - Math.sin(side) * along,
          vx: 0, vy: 0, vz: 0,
          life: 0.08,
          max: 0.08,
          size: 0.5,
          r: 1, g: 1, b: 1,
          gravity: 0,
          drag: 0
        });
      }
    },
    update(dt, time) {
      impactLight.intensity = Math.max(0, impactLight.intensity - dt * 60);
      let write = 0;
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.life -= dt;
        if (p.life <= 0) {
          continue;
        }
        p.vy -= p.gravity * dt;
        const damping = Math.exp(-p.drag * dt);
        p.vx *= damping;
        p.vz *= damping;
        if (p.flutter !== undefined) {
          p.x += Math.sin(time * 3 + p.flutter) * 0.4 * dt;
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        if (p.y < RING_FLOOR_Y && Math.abs(p.x) < ARENA_SIZE.APRON_HALF && Math.abs(p.z) < ARENA_SIZE.APRON_HALF && p.vy < 0) {
          p.y = RING_FLOOR_Y;
          p.vy *= -0.3;
        }
        particles[write++] = p;
        const o = (write - 1) * 3;
        positions[o] = p.x;
        positions[o + 1] = p.y;
        positions[o + 2] = p.z;
        colors[o] = p.r;
        colors[o + 1] = p.g;
        colors[o + 2] = p.b;
        sizes[write - 1] = p.size;
        alphas[write - 1] = Math.min(1, p.life / (p.max * 0.4));
      }
      particles.length = write;
      geometry.setDrawRange(0, write);
      geometry.attributes.position.needsUpdate = true;
      geometry.attributes.color.needsUpdate = true;
      geometry.attributes.size.needsUpdate = true;
      geometry.attributes.alpha.needsUpdate = true;
    },
    clear() {
      particles.length = 0;
      geometry.setDrawRange(0, 0);
    },
    dispose() {
      scene.remove(points, impactLight);
      geometry.dispose();
      material.dispose();
    }
  };

  return effects;
}
