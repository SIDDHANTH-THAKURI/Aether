/* ==================================================================
   Magic geometry.

   Everything here is generated at runtime — no textures, no models.
   Rune glyphs are built as real ribbon geometry from procedural stroke
   sets, rings are built with angular UVs so they can be revealed by
   sweep, and every material is additive so the layers stack into light.
   ================================================================== */

import * as THREE from 'three';

/* ---------------------------------------------------------------- rng */
// Deterministic per-circle randomness, so a mandala looks the same each
// time it is rebuilt at the same seed.
export function rng(seed) {
  let s = seed * 9301 + 49297;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

/* ---------------------------------------------------------------- rings */
/**
 * Flat annulus with angular UVs: u = fraction around the ring (0..1),
 * v = fraction across its width. That makes sweep reveals and angular
 * noise trivial in the shader, which THREE.RingGeometry's UVs do not.
 */
export function ringGeometry(inner, outer, segments = 256) {
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= segments; i++) {
    const u = i / segments;
    const a = u * Math.PI * 2;
    const c = Math.cos(a), s = Math.sin(a);
    pos.push(c * inner, s * inner, 0); uv.push(u, 0);
    pos.push(c * outer, s * outer, 0); uv.push(u, 1);
    if (i < segments) {
      const b = i * 2;
      idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/* ---------------------------------------------------------------- glyphs */
/**
 * A rune is a handful of strokes on a small grid. Strokes are picked from
 * a seeded pool so glyphs look like a consistent written script rather
 * than random scribble.
 */
function runeStrokes(rand) {
  // grid points, x ∈ [-.5,.5], y ∈ [-.6,.6]
  const cols = [-0.42, 0, 0.42];
  const rows = [-0.55, -0.18, 0.18, 0.55];
  const p = (c, r) => [cols[c], rows[r]];

  const pool = [
    [p(1, 0), p(1, 3)],                              // stem
    [p(0, 0), p(2, 0)],                              // top bar
    [p(0, 3), p(2, 3)],                              // bottom bar
    [p(0, 0), p(1, 1), p(0, 2)],                     // left chevron
    [p(2, 0), p(1, 1), p(2, 2)],                     // right chevron
    [p(0, 0), p(2, 2)],                              // diagonal
    [p(2, 0), p(0, 2)],                              // anti-diagonal
    [p(0, 1), p(2, 1)],                              // mid bar
    [p(1, 1), p(2, 0)],                              // flick
    [p(1, 2), p(0, 3)],                              // tail
    [p(0, 1), p(1, 0), p(2, 1)],                     // arch
    [p(0, 2), p(1, 3), p(2, 2)],                     // cup
  ];

  const strokes = [pool[0]];                          // always a stem to read as script
  const n = 1 + Math.floor(rand() * 3);
  for (let i = 0; i < n; i++) strokes.push(pool[1 + Math.floor(rand() * (pool.length - 1))]);
  return strokes;
}

/** Turns a polyline into a flat ribbon of quads of the given width. */
function ribbon(points, width, out, transform) {
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, y0] = points[i], [x1, y1] = points[i + 1];
    let dx = x1 - x0, dy = y1 - y0;
    const l = Math.hypot(dx, dy) || 1e-5;
    dx /= l; dy /= l;
    const nx = -dy * width * 0.5, ny = dx * width * 0.5;
    // extend the ends slightly so corners join without gaps
    const ex = dx * width * 0.35, ey = dy * width * 0.35;
    const quad = [
      [x0 - ex + nx, y0 - ey + ny], [x1 + ex + nx, y1 + ey + ny],
      [x0 - ex - nx, y0 - ey - ny],
      [x0 - ex - nx, y0 - ey - ny], [x1 + ex + nx, y1 + ey + ny],
      [x1 + ex - nx, y1 + ey - ny],
    ];
    for (const [px, py] of quad) out.push(transform(px, py));
  }
}

/**
 * A ring of runes as one merged geometry.
 *
 * Each vertex carries `aFrac` (its position around the ring) so the shader
 * can reveal glyph by glyph as a circle is traced, and `aGlyph` so
 * individual runes can flicker independently.
 */
export function runeRingGeometry({ radius, count = 24, size = 0.16, seed = 1,
                                   width = 0.055 } = {}) {
  const rand = rng(seed);
  const pos = [], frac = [], glyph = [], local = [];

  for (let i = 0; i < count; i++) {
    const f = i / count;
    const a = f * Math.PI * 2;
    const ca = Math.cos(a), sa = Math.sin(a);
    const strokes = runeStrokes(rand);
    const gid = rand();

    // glyphs stand upright relative to the ring, reading outward
    const place = (px, py) => {
      const lx = px * size, ly = py * size;
      const rx = lx * -sa + (ly + radius) * ca;
      const ry = lx * ca + (ly + radius) * sa;
      return [rx, ry, 0];
    };

    for (const s of strokes) {
      const before = pos.length;
      ribbon(s, width, pos, place);
      const added = (pos.length - before);
      for (let k = 0; k < added; k++) { frac.push(f); glyph.push(gid); }
    }
  }

  const flat = new Float32Array(pos.length * 3);
  pos.forEach((p, i) => { flat[i * 3] = p[0]; flat[i * 3 + 1] = p[1]; flat[i * 3 + 2] = p[2]; });

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(flat, 3));
  g.setAttribute('aFrac', new THREE.Float32BufferAttribute(frac, 1));
  g.setAttribute('aGlyph', new THREE.Float32BufferAttribute(glyph, 1));
  return g;
}

/** Star polygon {p/q} as line segments, e.g. 12/5 for the classic look. */
export function starGeometry(radius, points, skip) {
  const pos = [], frac = [];
  for (let i = 0; i < points; i++) {
    const a0 = ((i * skip) % points) / points * Math.PI * 2;
    const a1 = (((i + 1) * skip) % points) / points * Math.PI * 2;
    pos.push(Math.cos(a0) * radius, Math.sin(a0) * radius, 0);
    pos.push(Math.cos(a1) * radius, Math.sin(a1) * radius, 0);
    frac.push(i / points, (i + 1) / points);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aFrac', new THREE.Float32BufferAttribute(frac, 1));
  return g;
}

/** Radial tick marks around a circle, long every `major`. */
export function tickGeometry(radius, count, len, major = 4) {
  const pos = [], frac = [];
  for (let i = 0; i < count; i++) {
    const f = i / count;
    const a = f * Math.PI * 2;
    const l = i % major === 0 ? len * 2.1 : len;
    pos.push(Math.cos(a) * radius, Math.sin(a) * radius, 0);
    pos.push(Math.cos(a) * (radius + l), Math.sin(a) * (radius + l), 0);
    frac.push(f, f);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aFrac', new THREE.Float32BufferAttribute(frac, 1));
  return g;
}

/* ---------------------------------------------------------------- shaders */
export const NOISE_GLSL = /* glsl */`
float hash21(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  f = f*f*(3.0-2.0*f);
  return mix(mix(hash21(i), hash21(i+vec2(1,0)), f.x),
             mix(hash21(i+vec2(0,1)), hash21(i+vec2(1,1)), f.x), f.y);
}
float fbm(vec2 p){
  float v = 0.0, a = 0.5;
  for(int i=0;i<4;i++){ v += a*vnoise(p); p *= 2.03; a *= 0.5; }
  return v;
}`;

// Reveal helper shared by every sweepable piece: a glyph at position `frac`
// around the ring fades in as the traced sweep passes it.
const SWEEP_GLSL = /* glsl */`
float sweepMask(float frac, float sweep, float soft){
  return smoothstep(sweep, sweep - soft, frac);
}`;

/** Material for the rune rings and line work. */
export function glyphMaterial(color = new THREE.Color(1.0, 0.62, 0.18)) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime:  { value: 0 },
      uSweep: { value: 1 },
      uAlpha: { value: 1 },
      uColor: { value: color },
      uFlicker: { value: 1 },
    },
    vertexShader: /* glsl */`
      attribute float aFrac;
      attribute float aGlyph;
      varying float vFrac;
      varying float vGlyph;
      void main(){
        vFrac = aFrac;
        vGlyph = aGlyph;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */`
      precision highp float;
      uniform float uTime, uSweep, uAlpha, uFlicker;
      uniform vec3 uColor;
      varying float vFrac;
      varying float vGlyph;
      ${SWEEP_GLSL}
      void main(){
        float m = sweepMask(vFrac, uSweep, 0.06);
        // each glyph breathes on its own clock
        float fl = mix(1.0, 0.62 + 0.38*sin(uTime*7.0 + vGlyph*40.0), uFlicker);
        // the newest glyph on the sweep edge burns brighter
        float edge = smoothstep(0.05, 0.0, abs(vFrac - uSweep));
        vec3 col = uColor * (1.0 + edge*2.4);
        float a = m * uAlpha * fl;
        if(a <= 0.004) discard;
        gl_FragColor = vec4(col * a, a);
      }`,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

/** Material for the wide glowing bands. */
export function bandMaterial(color = new THREE.Color(1.0, 0.55, 0.14)) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime:  { value: 0 },
      uSweep: { value: 1 },
      uAlpha: { value: 1 },
      uColor: { value: color },
      uSharp: { value: 3.0 },
    },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main(){
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */`
      precision highp float;
      uniform float uTime, uSweep, uAlpha, uSharp;
      uniform vec3 uColor;
      varying vec2 vUv;
      ${NOISE_GLSL}
      ${SWEEP_GLSL}
      void main(){
        float m = sweepMask(vUv.x, uSweep, 0.05);
        float across = 1.0 - abs(vUv.y*2.0 - 1.0);
        float body = pow(across, uSharp);
        float n = fbm(vec2(vUv.x*26.0 - uTime*0.7, vUv.y*3.0 + uTime*0.4));
        body *= 0.55 + n*0.85;
        float edge = smoothstep(0.04, 0.0, abs(vUv.x - uSweep));
        float a = body * m * uAlpha;
        vec3 col = uColor * (1.0 + edge*3.0 + pow(across, 8.0)*1.6);
        if(a <= 0.004) discard;
        gl_FragColor = vec4(col * a, a);
      }`,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

/* ==================================================================
   MagicCircle — a stack of rings, runes, stars and ticks that assemble
   ring by ring as `sweep` rises from 0 to 1.
   ================================================================== */
export class MagicCircle {
  /**
   * layers describe the reveal window of each ring, so the mandala builds
   * from the outside in rather than everything appearing at once.
   */
  constructor({ radius = 1, seed = 1, color = 0xffa03c, dense = true } = {}) {
    this.group = new THREE.Group();
    this.radius = radius;
    this.materials = [];
    this.spins = [];
    const col = new THREE.Color(color);

    const add = (geo, mat, mode, spin, from, to) => {
      const mesh = mode === 'lines' ? new THREE.LineSegments(geo, mat)
                                    : new THREE.Mesh(geo, mat);
      mesh.userData.from = from;
      mesh.userData.to = to;
      this.group.add(mesh);
      this.materials.push(mat);
      this.spins.push({ mesh, spin });
      return mesh;
    };

    const R = radius;

    // outer band + ticks
    add(ringGeometry(R * 0.985, R * 1.015, 256), bandMaterial(col), 'mesh', 0.05, 0.00, 0.55);
    add(tickGeometry(R * 1.03, 72, R * 0.035), glyphMaterial(col), 'lines', 0.12, 0.00, 0.55);

    // primary rune ring
    add(runeRingGeometry({ radius: R * 0.86, count: 26, size: R * 0.10, seed, width: R * 0.012 }),
        glyphMaterial(col), 'mesh', -0.22, 0.10, 0.70);

    // inner band + star polygon
    add(ringGeometry(R * 0.735, R * 0.752, 192), bandMaterial(col), 'mesh', -0.08, 0.30, 0.85);
    add(starGeometry(R * 0.72, 12, 5), glyphMaterial(col), 'lines', 0.16, 0.30, 0.88);

    if (dense) {
      // secondary rune ring, counter-rotating
      add(runeRingGeometry({ radius: R * 0.56, count: 15, size: R * 0.085,
                             seed: seed + 7, width: R * 0.011 }),
          glyphMaterial(col), 'mesh', 0.34, 0.45, 0.95);
      add(starGeometry(R * 0.40, 8, 3), glyphMaterial(col), 'lines', -0.5, 0.62, 1.0);
    }

    // core ring
    add(ringGeometry(R * 0.15, R * 0.17, 96), bandMaterial(col), 'mesh', 0.4, 0.62, 1.0);
  }

  /** sweep 0..1 reveals the mandala; alpha scales the whole thing. */
  update(time, sweep = 1, alpha = 1, spinScale = 1) {
    for (const { mesh, spin } of this.spins) {
      mesh.rotation.z = time * spin * spinScale;
      const { from, to } = mesh.userData;
      const local = THREE.MathUtils.clamp((sweep - from) / (to - from), 0, 1);
      mesh.visible = local > 0.001;
      mesh.material.uniforms.uSweep.value = local;
      mesh.material.uniforms.uAlpha.value = alpha * local;
      mesh.material.uniforms.uTime.value = time;
    }
  }

  dispose() {
    this.group.traverse(o => {
      o.geometry?.dispose();
      o.material?.dispose();
    });
  }
}
