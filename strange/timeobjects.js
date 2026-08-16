/* ==================================================================
   Objects with a timeline.

   Each object's entire appearance is a pure function of t ∈ [0,1] —
   nothing accumulates frame to frame. That is what lets the Eye scrub
   them to any point, in either direction, at any speed, and land on
   exactly the same state every time.
   ================================================================== */

import * as THREE from 'three';

const NOISE = /* glsl */`
  float hash31(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719)))*43758.5453); }
  float vnoise3(vec3 p){
    vec3 i = floor(p), f = fract(p);
    f = f*f*(3.0-2.0*f);
    float n000=hash31(i), n100=hash31(i+vec3(1,0,0));
    float n010=hash31(i+vec3(0,1,0)), n110=hash31(i+vec3(1,1,0));
    float n001=hash31(i+vec3(0,0,1)), n101=hash31(i+vec3(1,0,1));
    float n011=hash31(i+vec3(0,1,1)), n111=hash31(i+vec3(1,1,1));
    return mix(mix(mix(n000,n100,f.x), mix(n010,n110,f.x), f.y),
               mix(mix(n001,n101,f.x), mix(n011,n111,f.x), f.y), f.z);
  }
  float fbm3(vec3 p){
    float v=0.0, a=0.5;
    for(int i=0;i<4;i++){ v += a*vnoise3(p); p *= 2.05; a *= 0.5; }
    return v;
  }`;

/* ==================================================================
   APPLE — whole → bitten → shrivelled → collapsed
   ================================================================== */
const APPLE_VERT = /* glsl */`
  uniform float uT;
  uniform float uTime;
  varying vec3 vPos;
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  ${NOISE}
  void main(){
    vec3 p = position;

    // apple silhouette: dimple the poles and give it a slight lobing
    float polar = p.y;
    p.xz *= 1.0 + 0.06*sin(atan(p.z, p.x)*5.0);
    p.y *= 0.94;
    p.y -= 0.16 * exp(-pow((polar - 1.0)*2.2, 2.0));
    p.y += 0.10 * exp(-pow((polar + 1.0)*2.2, 2.0));

    // decay begins after the bite: the fruit shrivels inward, unevenly
    float decay = smoothstep(0.22, 1.0, uT);
    float wrinkle = fbm3(position*3.4) - 0.5;
    p *= 1.0 - decay*0.20;
    p += normal * wrinkle * decay * 0.22;
    // and slumps under its own weight
    p.y -= decay*decay*0.16;

    vPos = position;
    vec4 world = modelMatrix * vec4(p, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vViewDir = normalize(cameraPosition - world.xyz);
    gl_Position = projectionMatrix * viewMatrix * world;
  }`;

const APPLE_FRAG = /* glsl */`
  precision highp float;
  uniform float uT, uTime, uSelected;
  varying vec3 vPos;
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  ${NOISE}

  void main(){
    // --- the bite: a sphere scooped out of the side, opening between t .10–.22
    vec3 biteCentre = normalize(vec3(0.92, 0.34, 0.55)) * 1.02;
    float biteR = smoothstep(0.10, 0.22, uT) * 0.62;
    float dBite = distance(vPos, biteCentre);
    if(dBite < biteR) discard;

    bool inside = !gl_FrontFacing;
    float decay = smoothstep(0.22, 1.0, uT);

    vec3 col;
    if(inside){
      // exposed flesh, which browns fastest
      vec3 flesh = vec3(0.94, 0.88, 0.66);
      vec3 brown = vec3(0.34, 0.20, 0.09);
      col = mix(flesh, brown, smoothstep(0.0, 0.55, decay));
      col *= 0.75 + 0.25*fbm3(vPos*9.0);
    } else {
      // skin: red → dull red → brown, with spreading blemishes
      vec3 red = vec3(0.72, 0.06, 0.05);
      vec3 deep = vec3(0.42, 0.09, 0.06);
      vec3 rot  = vec3(0.24, 0.15, 0.07);
      col = mix(red, deep, smoothstep(0.0, 0.45, decay));
      col = mix(col, rot, smoothstep(0.35, 1.0, decay));

      float spots = fbm3(vPos*4.6 + 11.0);
      float spotMask = smoothstep(0.62 - decay*0.35, 0.72 - decay*0.35, spots) * decay;
      col = mix(col, vec3(0.13, 0.10, 0.05), spotMask);

      // a highlight streak that dulls as the skin dries
      float spec = pow(max(dot(normalize(vNormalW), normalize(vViewDir)), 0.0), 22.0);
      col += vec3(1.0, 0.85, 0.75) * spec * (1.0 - decay*0.85) * 0.9;
    }

    // simple wrap lighting so it sits in the scene without a light rig
    float lam = 0.35 + 0.65*max(dot(normalize(vNormalW), normalize(vec3(0.4,0.8,0.6))), 0.0);
    col *= lam;

    // green temporal rim while this object is the one being scrubbed
    float fres = pow(1.0 - max(dot(normalize(vNormalW), normalize(vViewDir)), 0.0), 2.5);
    col += vec3(0.22, 1.0, 0.55) * fres * uSelected * 0.85;

    gl_FragColor = vec4(col, 1.0);
  }`;

class TimeObject {
  constructor(label) {
    this.group = new THREE.Group();
    this.label = label;
    this.t = 0;
    this.selected = 0;
  }
  setTime(t) { this.t = THREE.MathUtils.clamp(t, 0, 1); }
  setSelected(v, dt = 1 / 60) {
    this.selected += (v - this.selected) * (1 - Math.pow(0.0002, dt));
  }
  dispose() {
    this.group.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); });
  }
}

export class Apple extends TimeObject {
  constructor() {
    super('Apple');
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uT: { value: 0 }, uTime: { value: 0 }, uSelected: { value: 0 } },
      vertexShader: APPLE_VERT, fragmentShader: APPLE_FRAG,
      side: THREE.DoubleSide,
    });
    this.body = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), this.mat);
    this.group.add(this.body);

    // stem and leaf, which also wither
    this.stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.06, 0.42, 8),
      new THREE.MeshStandardMaterial({ color: 0x4a3318, roughness: 0.9 }));
    this.stem.position.y = 1.02;
    this.group.add(this.stem);

    const leafShape = new THREE.Shape();
    leafShape.moveTo(0, 0);
    leafShape.quadraticCurveTo(0.28, 0.16, 0.52, 0.02);
    leafShape.quadraticCurveTo(0.28, -0.04, 0, 0);
    this.leafMat = new THREE.MeshStandardMaterial({
      color: 0x4e8b2a, roughness: 0.75, side: THREE.DoubleSide });
    this.leaf = new THREE.Mesh(new THREE.ShapeGeometry(leafShape), this.leafMat);
    this.leaf.position.set(0.06, 1.18, 0);
    this.leaf.rotation.set(-0.5, 0, 0.25);
    this.group.add(this.leaf);
  }

  update(dt, time) {
    this.mat.uniforms.uT.value = this.t;
    this.mat.uniforms.uTime.value = time;
    this.mat.uniforms.uSelected.value = this.selected;

    const decay = THREE.MathUtils.clamp((this.t - 0.22) / 0.78, 0, 1);
    this.leafMat.color.setRGB(
      THREE.MathUtils.lerp(0.31, 0.35, decay),
      THREE.MathUtils.lerp(0.55, 0.22, decay),
      THREE.MathUtils.lerp(0.16, 0.06, decay));
    this.leaf.scale.setScalar(1 - decay * 0.45);
    this.leaf.rotation.x = -0.5 - decay * 1.2;      // curls as it dries
    this.stem.scale.y = 1 - decay * 0.25;
  }
}

/* ==================================================================
   VASE — whole → cracked → shattered on the floor
   ================================================================== */
export class Vase extends TimeObject {
  constructor({ shards = 14 } = {}) {
    super('Vase');

    const profile = [];
    const add = (x, y) => profile.push(new THREE.Vector2(x, y));
    add(0.00, -1.00); add(0.42, -1.00); add(0.50, -0.86); add(0.44, -0.55);
    add(0.56, -0.18); add(0.66, 0.22); add(0.58, 0.58); add(0.40, 0.80);
    add(0.34, 0.94); add(0.40, 1.00); add(0.36, 1.02); add(0.30, 0.96);
    add(0.34, 0.80); add(0.50, 0.56); add(0.58, 0.22); add(0.48, -0.18);
    add(0.36, -0.55); add(0.42, -0.86); add(0.34, -0.96); add(0.00, -0.96);

    const mat = new THREE.MeshStandardMaterial({
      color: 0x9a6a4a, roughness: 0.62, metalness: 0.05, side: THREE.DoubleSide,
    });
    this.mat = mat;

    // Slicing the lathe by angle gives real, separable shards.
    this.shards = [];
    for (let i = 0; i < shards; i++) {
      const phiStart = (i / shards) * Math.PI * 2;
      const phiLen = (Math.PI * 2 / shards) * 0.985;
      const geo = new THREE.LatheGeometry(profile, 10, phiStart, phiLen);
      const mesh = new THREE.Mesh(geo, mat);

      // where this shard ends up once it has fallen and settled
      const dir = new THREE.Vector3(
        Math.cos(phiStart + phiLen / 2), 0, Math.sin(phiStart + phiLen / 2));
      const spread = 1.1 + Math.random() * 1.9;
      this.shards.push({
        mesh,
        end: dir.clone().multiplyScalar(spread).setY(-0.94),
        endRot: new THREE.Euler(
          (Math.random() - 0.5) * 2.4, Math.random() * 6.28, (Math.random() - 0.5) * 2.4),
        delay: Math.random() * 0.18,
        arc: 0.5 + Math.random() * 0.9,
        spin: (Math.random() - 0.5) * 6,
      });
      this.group.add(mesh);
    }
  }

  update(dt, time) {
    // Break starts at t=0.35; before that the shards only ease apart, which
    // reads as the cracks opening up.
    for (const s of this.shards) {
      const raw = THREE.MathUtils.clamp((this.t - 0.35 - s.delay) / (0.65 - s.delay), 0, 1);
      const e = raw * raw;                       // accelerating, like falling
      const pre = THREE.MathUtils.clamp(this.t / 0.35, 0, 1) * 0.035;

      s.mesh.position.copy(s.end).multiplyScalar(e);
      s.mesh.position.addScaledVector(s.end.clone().normalize(), pre);
      // a small hop before landing, so pieces do not just slide outward
      s.mesh.position.y += Math.sin(raw * Math.PI) * s.arc * 0.5;

      s.mesh.rotation.set(s.endRot.x * e, s.endRot.y * e + raw * s.spin, s.endRot.z * e);
    }
    this.mat.emissive?.setRGB(0, this.selected * 0.22, this.selected * 0.1);
  }
}

/* ==================================================================
   CANDLE — fresh and tall → burned down to a stub
   ================================================================== */
const FLAME_FRAG = /* glsl */`
  precision highp float;
  uniform float uTime, uScale;
  varying vec2 vUv;
  ${NOISE}
  void main(){
    vec2 p = vUv*2.0 - 1.0;
    // teardrop: narrow at the top, rounded at the base
    float body = 1.0 - smoothstep(0.0, 1.0, length(vec2(p.x*1.9, (p.y-0.15)*0.85)));
    float flick = fbm3(vec3(p*3.0, uTime*2.6));
    body *= 0.55 + flick*0.8;
    if(body <= 0.02) discard;
    vec3 col = mix(vec3(1.0,0.35,0.02), vec3(1.0,0.92,0.62), pow(body, 1.6));
    col = mix(col, vec3(0.35,0.55,1.0), smoothstep(0.55, 0.0, p.y+0.6)*0.5*body);
    gl_FragColor = vec4(col*body*1.6, body);
  }`;

export class Candle extends TimeObject {
  constructor() {
    super('Candle');

    this.waxMat = new THREE.MeshStandardMaterial({
      color: 0xded0b0, roughness: 0.6, metalness: 0.0,
      emissive: 0x140a03, emissiveIntensity: 1,
    });
    this.body = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.36, 2, 32), this.waxMat);
    this.group.add(this.body);

    // pool of spent wax that grows at the base
    this.pool = new THREE.Mesh(
      new THREE.CylinderGeometry(0.36, 0.52, 0.12, 32), this.waxMat);
    this.group.add(this.pool);

    this.wick = new THREE.Mesh(
      new THREE.CylinderGeometry(0.022, 0.03, 0.22, 6),
      new THREE.MeshStandardMaterial({ color: 0x241a12, roughness: 1 }));
    this.group.add(this.wick);

    this.flameMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uScale: { value: 1 } },
      vertexShader: `varying vec2 vUv;
        void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: FLAME_FRAG,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.flame = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.85), this.flameMat);
    this.group.add(this.flame);

    // Kept deliberately weak: the lamp sits a few centimetres from pale wax, so
    // inverse-square makes anything stronger blow the candle out to flat white.
    this.light = new THREE.PointLight(0xffa542, 1.0, 5, 2);
    this.group.add(this.light);
  }

  update(dt, time) {
    const burn = this.t;
    const h = THREE.MathUtils.lerp(2.0, 0.34, burn);

    this.body.scale.y = h / 2;
    this.body.position.y = -1 + h / 2;

    this.pool.scale.set(1 + burn * 0.5, 1 + burn * 1.4, 1 + burn * 0.5);
    this.pool.position.y = -1 + 0.06;

    this.wick.position.y = -1 + h + 0.09;
    this.wick.scale.y = 1 - burn * 0.35;

    const flick = 0.9 + Math.sin(time * 11) * 0.06 + Math.sin(time * 27) * 0.03;
    this.flame.position.y = -1 + h + 0.34 * flick;
    this.flame.scale.setScalar((1 - burn * 0.35) * flick);
    this.flameMat.uniforms.uTime.value = time;

    this.light.position.y = -1 + h + 0.3;
    this.light.intensity = (1.1 - burn * 0.45) * flick;

    this.waxMat.emissive.setRGB(
      0.05, 0.026 + this.selected * 0.26, 0.008 + this.selected * 0.12);
  }
}

/** Every object the Eye can reach, in the order they are laid out. */
export function buildTimeObjects() {
  return [new Apple(), new Vase(), new Candle()];
}
