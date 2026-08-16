/* ==================================================================
   The Eye of Agamotto.

   Generated geometry, no model files: a lathed gold housing, four iris
   leaves on real hinges that fold back to reveal the stone, an emissive
   Time Stone with a fresnel rim, and a chain of instanced links strung
   along a curve between the shoulders.
   ================================================================== */

import * as THREE from 'three';

const GOLD = 0xc9922c;
const GOLD_DARK = 0x8a6318;
const STONE_GREEN = 0x39ff9a;

function goldMaterial(env, { color = GOLD, rough = 0.28 } = {}) {
  return new THREE.MeshStandardMaterial({
    color, metalness: 1.0, roughness: rough,
    envMap: env || null, envMapIntensity: 1.35,
  });
}

/** Housing profile, revolved: a stepped disc with a raised bezel. */
function housingGeometry(r) {
  const pts = [];
  const add = (x, y) => pts.push(new THREE.Vector2(x * r, y * r));
  add(0.00, -0.10);
  add(0.62, -0.12);
  add(0.78, -0.06);
  add(0.86,  0.02);
  add(1.00,  0.05);
  add(1.04,  0.12);
  add(0.98,  0.17);
  add(0.80,  0.15);
  add(0.66,  0.10);
  add(0.50,  0.09);
  add(0.30,  0.06);
  add(0.00,  0.05);
  return new THREE.LatheGeometry(pts, 72);
}

/**
 * One iris leaf: a sector plate whose hinge sits on the outer rim, so
 * rotating it about that hinge folds it back the way the film's do.
 *
 * The span has to clear a quarter turn for four leaves to actually meet —
 * anything narrower leaves the stone showing through the gaps when shut.
 */
function leafGeometry(r, spanDeg = 96) {
  const span = THREE.MathUtils.degToRad(spanDeg);
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.absarc(0, 0, r, -span / 2, span / 2, false);
  shape.lineTo(0, 0);

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: r * 0.06, bevelEnabled: true,
    bevelThickness: r * 0.03, bevelSize: r * 0.035, bevelSegments: 2, curveSegments: 24,
  });
  geo.translate(-r, 0, -r * 0.03);      // hinge (outer arc midpoint) to the origin
  return geo;
}

const STONE_VERT = /* glsl */`
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  varying vec3 vPos;
  void main(){
    vec4 world = modelMatrix * vec4(position, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vViewDir = normalize(cameraPosition - world.xyz);
    vPos = position;
    gl_Position = projectionMatrix * viewMatrix * world;
  }`;

/** Time Stone: deep green body, hot core, fresnel rim that flares open. */
const STONE_FRAG = /* glsl */`
  precision highp float;
  uniform float uTime, uOpen;
  uniform vec3 uColor;
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  varying vec3 vPos;

  float hash(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719)))*43758.5453); }

  void main(){
    float fres = pow(1.0 - max(dot(normalize(vNormalW), normalize(vViewDir)), 0.0), 2.4);

    // slow internal churn, so the stone never looks like flat plastic
    float churn = 0.5 + 0.5*sin(uTime*1.6 + vPos.x*9.0 + vPos.y*7.0)
                      * sin(uTime*1.1 - vPos.z*8.0);
    float core = pow(churn, 2.0);

    vec3 col = uColor * (0.25 + core*0.9);
    col += vec3(0.75, 1.0, 0.85) * pow(core, 3.0) * 1.4;
    col += uColor * fres * 2.2;

    // brightens hard once the leaves are open
    float lit = mix(0.22, 1.0, uOpen);
    gl_FragColor = vec4(col * lit, 1.0);
  }`;

export class EyeOfAgamotto {
  /** All dimensions are relative to `radius`, the housing's outer radius. */
  constructor({ radius = 1, env = null } = {}) {
    this.group = new THREE.Group();
    this.radius = radius;
    this.open = 0;             // 0 closed, 1 fully open
    this.target = 0;

    const R = radius;
    this.amulet = new THREE.Group();
    this.group.add(this.amulet);

    // --- housing
    const housing = new THREE.Mesh(housingGeometry(R), goldMaterial(env));
    housing.rotation.x = Math.PI / 2;
    this.amulet.add(housing);

    // engraved outer band
    const band = new THREE.Mesh(
      new THREE.TorusGeometry(R * 1.02, R * 0.055, 12, 96),
      goldMaterial(env, { color: GOLD_DARK, rough: 0.42 }));
    this.amulet.add(band);

    // --- four hinged leaves
    //
    // Two nested objects per leaf on purpose. The outer one carries the leaf
    // out to its hinge point on the rim; the inner one does the folding, so
    // the fold happens about the leaf's own tangent. Putting both rotations on
    // one object folds every leaf about the parent's Y axis instead, which
    // makes the ones at the sides twist in place rather than open.
    this.leaves = [];
    const leafGeo = leafGeometry(R * 0.92);
    for (let i = 0; i < 4; i++) {
      const theta = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const pivot = new THREE.Object3D();
      pivot.rotation.z = theta;
      // Sit the leaves just proud of the bezel (the housing face tops out at
      // 0.17R) with a small stagger so overlapping leaves do not z-fight.
      pivot.position.set(Math.cos(theta) * R * 0.92, Math.sin(theta) * R * 0.92,
        R * (0.20 + i * 0.012));
      const fold = new THREE.Object3D();
      fold.add(new THREE.Mesh(leafGeo, goldMaterial(env, { rough: 0.22 })));
      pivot.add(fold);
      this.amulet.add(pivot);
      this.leaves.push(fold);
    }

    // --- the stone, behind the leaves
    this.stoneMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 }, uOpen: { value: 0 },
        uColor: { value: new THREE.Color(STONE_GREEN) },
      },
      vertexShader: STONE_VERT, fragmentShader: STONE_FRAG,
    });
    // Flattened and set back into the housing. A full sphere of this radius
    // stood proud of the bezel, so it showed straight through the shut leaves
    // and the Eye never looked closed.
    this.stone = new THREE.Mesh(new THREE.IcosahedronGeometry(R * 0.34, 2), this.stoneMat);
    this.stone.scale.set(1, 1, 0.45);
    this.stone.position.z = -R * 0.04;
    this.amulet.add(this.stone);

    // glow shell that blooms once the leaves part
    this.glowMat = new THREE.MeshBasicMaterial({
      color: STONE_GREEN, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.glow = new THREE.Mesh(new THREE.SphereGeometry(R * 0.62, 24, 16), this.glowMat);
    this.amulet.add(this.glow);

    this.light = new THREE.PointLight(STONE_GREEN, 0, R * 14, 2);
    this.amulet.add(this.light);

    // --- chain, strung up to both shoulders
    this.chain = this.#buildChain(R, env);
    this.group.add(this.chain);
  }

  #buildChain(R, env) {
    const curveL = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-R * 0.55, R * 0.95, 0),
      new THREE.Vector3(-R * 1.9, R * 2.3, -R * 0.25),
      new THREE.Vector3(-R * 2.6, R * 3.5, -R * 0.7),
    ]);
    const curveR = new THREE.CatmullRomCurve3([
      new THREE.Vector3(R * 0.55, R * 0.95, 0),
      new THREE.Vector3(R * 1.9, R * 2.3, -R * 0.25),
      new THREE.Vector3(R * 2.6, R * 3.5, -R * 0.7),
    ]);

    // Spaced so consecutive links just overlap. Packed much tighter than this
    // the ring shapes stop being readable and the whole thing looks like a
    // coil spring rather than a chain.
    const perSide = 16;
    const link = new THREE.TorusGeometry(R * 0.11, R * 0.032, 8, 18);
    const mesh = new THREE.InstancedMesh(link, goldMaterial(env, { rough: 0.34 }),
      perSide * 2);

    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 0, 1);
    const flip = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
    const one = new THREE.Vector3(1, 1, 1);
    let n = 0;
    for (const curve of [curveL, curveR]) {
      for (let i = 0; i < perSide; i++) {
        const t = i / (perSide - 1);
        const p = curve.getPointAt(t);
        const tan = curve.getTangentAt(t);
        q.setFromUnitVectors(up, tan);
        // Every other link turns 90° so the chain reads as interlocking. This
        // has to be about an axis across the link — turning it about `up`
        // spins a torus around its own axis of symmetry and changes nothing.
        if (i % 2) q.multiply(flip);
        m.compose(p, q, one);
        mesh.setMatrixAt(n++, m);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    return mesh;
  }

  /** 0 shut, 1 open. The page drives this from the gesture. */
  setOpen(t) { this.target = THREE.MathUtils.clamp(t, 0, 1); }
  toggle() { this.setOpen(this.target > 0.5 ? 0 : 1); }
  get isOpen() { return this.open > 0.5; }

  update(dt, time) {
    // leaves ease rather than snap, and lag slightly behind the target
    this.open += (this.target - this.open) * (1 - Math.pow(0.005, dt));

    const e = this.open * this.open * (3 - 2 * this.open);
    this.leaves.forEach((fold, i) => {
      // a small stagger so they do not move as one rigid piece
      const stagger = THREE.MathUtils.clamp(e * 1.25 - i * 0.06, 0, 1);
      fold.rotation.y = -stagger * THREE.MathUtils.degToRad(118);
    });

    this.stoneMat.uniforms.uTime.value = time;
    this.stoneMat.uniforms.uOpen.value = e;
    this.stone.rotation.y = time * 0.4;
    this.stone.rotation.x = Math.sin(time * 0.3) * 0.2;

    const pulse = 0.55 + 0.45 * Math.sin(time * 2.4);
    this.glowMat.opacity = e * (0.18 + pulse * 0.22);
    this.glow.scale.setScalar(1 + e * 0.35 + pulse * 0.08);
    this.light.intensity = e * (2 + pulse * 1.2);
  }

  dispose() {
    this.group.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); });
  }
}
