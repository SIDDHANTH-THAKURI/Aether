/* ==================================================================
   Procedural armour.

   Every plate is generated from primitives at runtime — lathes, bevelled
   extrusions and tapered shells — then given real metallic PBR materials
   so they pick up the environment. Nothing is loaded from disk.

   Each piece declares how it attaches to the body: which two pose
   landmarks form its axis, how it scales against them, and where along
   that axis it sits. The suit-up sequence just walks this list.
   ================================================================== */

import * as THREE from 'three';
import { POSE } from '../handtrack.js';

const RED       = 0x8f1717;
const RED_DARK  = 0x5d0f0f;
const GOLD      = 0xd0a02c;
const STEEL     = 0x9aa3ad;

export function materials(env) {
  const mk = (color, roughness, metalness = 1) => new THREE.MeshStandardMaterial({
    color, roughness, metalness, envMap: env || null, envMapIntensity: 1.5,
  });
  return {
    red: mk(RED, 0.28),
    redDark: mk(RED_DARK, 0.36),
    gold: mk(GOLD, 0.22),
    steel: mk(STEEL, 0.34),
    glow: new THREE.MeshBasicMaterial({
      color: 0x9fe8ff, transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }),
  };
}

/* ---------------------------------------------------------------- helpers */

/** Rounded plate: a box with its edges eased, used for most flat armour. */
function plate(w, h, d, r = 0.06, seg = 3) {
  const shape = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  shape.moveTo(x + r, y);
  shape.lineTo(x + w - r, y);
  shape.quadraticCurveTo(x + w, y, x + w, y + r);
  shape.lineTo(x + w, y + h - r);
  shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  shape.lineTo(x + r, y + h);
  shape.quadraticCurveTo(x, y + h, x, y + h - r);
  shape.lineTo(x, y + r);
  shape.quadraticCurveTo(x, y, x + r, y);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: d, bevelEnabled: true, bevelThickness: d * 0.28,
    bevelSize: d * 0.3, bevelSegments: seg, curveSegments: 8,
  });
  geo.translate(0, 0, -d / 2);
  return geo;
}

/** Tapered shell for limbs: a cylinder with a raised ridge down its length. */
function limbShell(rTop, rBottom, len, { ridge = true } = {}) {
  const parts = [];
  const body = new THREE.CylinderGeometry(rTop, rBottom, len, 20, 1, false);
  parts.push(body);
  if (ridge) {
    const r = new THREE.BoxGeometry(rTop * 0.5, len * 0.92, rTop * 0.34);
    r.translate(0, 0, rBottom * 0.86);
    parts.push(r);
  }
  return parts;
}

/** Merge helper that keeps material groups intact by returning a Group. */
function group(...meshes) {
  const g = new THREE.Group();
  for (const m of meshes) if (m) g.add(m);
  return g;
}

/* ---------------------------------------------------------------- pieces */

/**
 * Helmet: skull shell, faceplate with a raised brow, jaw, and the eye slits
 * as emissive geometry so bloom picks them up.
 */
function buildHelmet(M) {
  const g = new THREE.Group();

  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.5, 32, 24), M.red);
  skull.scale.set(1, 1.12, 1.05);
  g.add(skull);

  // gold faceplate: a shallow shell across the front of the skull
  const face = new THREE.Mesh(
    new THREE.SphereGeometry(0.505, 28, 20, Math.PI * 0.68, Math.PI * 0.64,
      Math.PI * 0.22, Math.PI * 0.56), M.gold);
  face.scale.set(1, 1.12, 1.05);
  g.add(face);

  // brow ridge
  const brow = new THREE.Mesh(plate(0.62, 0.09, 0.10, 0.03), M.gold);
  brow.position.set(0, 0.12, 0.44);
  brow.rotation.x = -0.18;
  g.add(brow);

  // jaw
  const jaw = new THREE.Mesh(plate(0.44, 0.16, 0.16, 0.05), M.gold);
  jaw.position.set(0, -0.34, 0.34);
  jaw.rotation.x = 0.35;
  g.add(jaw);

  // eye slits
  const eyes = new THREE.Group();
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(plate(0.17, 0.055, 0.03, 0.02), M.glow);
    eye.position.set(s * 0.155, 0.045, 0.485);
    eye.rotation.z = -s * 0.16;
    eye.rotation.y = -s * 0.22;
    eyes.add(eye);
  }
  g.add(eyes);
  g.userData.eyes = eyes;

  // side vents
  for (const s of [-1, 1]) {
    const vent = new THREE.Mesh(plate(0.1, 0.2, 0.06, 0.02), M.redDark);
    vent.position.set(s * 0.48, -0.05, 0.05);
    vent.rotation.y = s * Math.PI / 2;
    g.add(vent);
  }
  return g;
}

/** Chest: torso shell, pectoral plates, and the arc reactor housing. */
function buildChest(M) {
  const g = new THREE.Group();

  const torso = new THREE.Mesh(new THREE.SphereGeometry(0.62, 32, 24), M.red);
  torso.scale.set(1.08, 1.28, 0.72);
  g.add(torso);

  for (const s of [-1, 1]) {
    const pec = new THREE.Mesh(plate(0.5, 0.42, 0.2, 0.14), M.red);
    pec.position.set(s * 0.3, 0.34, 0.4);
    pec.rotation.set(-0.12, -s * 0.24, s * 0.08);
    g.add(pec);
  }

  const abs = new THREE.Mesh(plate(0.72, 0.5, 0.22, 0.1), M.redDark);
  abs.position.set(0, -0.42, 0.34);
  abs.rotation.x = 0.14;
  g.add(abs);

  // arc reactor: gold ring, steel core, glowing centre
  const reactor = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.045, 12, 40), M.gold);
  reactor.add(ring);
  const inner = new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.03, 10, 32), M.steel);
  reactor.add(inner);
  const core = new THREE.Mesh(new THREE.CircleGeometry(0.13, 32), M.glow.clone());
  core.position.z = 0.01;
  reactor.add(core);
  // triangular vanes inside, the classic Mark tell
  for (let i = 0; i < 3; i++) {
    const v = new THREE.Mesh(plate(0.035, 0.16, 0.02, 0.01), M.steel);
    v.position.set(Math.cos(i * 2.094) * 0.09, Math.sin(i * 2.094) * 0.09, 0.02);
    v.rotation.z = i * 2.094;
    reactor.add(v);
  }
  reactor.position.set(0, 0.18, 0.47);
  g.add(reactor);
  g.userData.reactor = reactor;
  g.userData.reactorCore = core;

  return g;
}

function buildShoulder(M, side) {
  const g = new THREE.Group();
  const cap = new THREE.Mesh(
    new THREE.SphereGeometry(0.34, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.62), M.red);
  cap.scale.set(1.1, 0.92, 1.1);
  g.add(cap);
  const trim = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.035, 10, 32), M.gold);
  trim.rotation.x = Math.PI / 2;
  trim.position.y = -0.02;
  g.add(trim);
  const flare = new THREE.Mesh(plate(0.30, 0.16, 0.12, 0.05), M.red);
  flare.position.set(side * 0.20, 0.06, 0);
  flare.rotation.z = side * -0.5;
  g.add(flare);
  return g;
}

/** Arm and leg segments share a shell with different proportions. */
function buildLimb(M, { rTop, rBot, len, gold = false, cuff = false }) {
  const g = new THREE.Group();
  const mat = gold ? M.gold : M.red;
  for (const geo of limbShell(rTop, rBot, len)) g.add(new THREE.Mesh(geo, mat));
  if (cuff) {
    const c = new THREE.Mesh(new THREE.TorusGeometry(rBot * 1.02, rBot * 0.16, 10, 28), M.gold);
    c.rotation.x = Math.PI / 2;
    c.position.y = -len / 2 + rBot * 0.2;
    g.add(c);
  }
  return g;
}

/** Gauntlet: forearm shell, wrist cuff, and the repulsor in the palm. */
function buildGauntlet(M, side) {
  const g = new THREE.Group();
  for (const geo of limbShell(0.17, 0.20, 0.46)) g.add(new THREE.Mesh(geo, M.red));

  const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.04, 10, 28), M.gold);
  cuff.rotation.x = Math.PI / 2;
  cuff.position.y = -0.2;
  g.add(cuff);

  // palm plate carrying the emitter
  const palm = new THREE.Group();
  const back = new THREE.Mesh(plate(0.26, 0.28, 0.1, 0.07), M.red);
  palm.add(back);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.022, 10, 26), M.steel);
  ring.position.z = 0.055;
  palm.add(ring);
  const emitter = new THREE.Mesh(new THREE.CircleGeometry(0.075, 24), M.glow.clone());
  emitter.position.z = 0.06;
  emitter.material.opacity = 0;
  palm.add(emitter);
  palm.position.set(0, -0.34, 0.02);
  g.add(palm);

  g.userData.emitter = emitter;
  g.userData.palm = palm;
  return g;
}

function buildBoot(M, side) {
  const g = new THREE.Group();
  const foot = new THREE.Mesh(plate(0.30, 0.16, 0.52, 0.07), M.red);
  foot.rotation.x = Math.PI / 2;
  g.add(foot);
  const toe = new THREE.Mesh(plate(0.26, 0.13, 0.16, 0.06), M.gold);
  toe.rotation.x = Math.PI / 2;
  toe.position.set(0, -0.06, 0.28);
  g.add(toe);
  // sole thruster
  const thr = new THREE.Mesh(new THREE.CircleGeometry(0.09, 20), M.glow.clone());
  thr.material.opacity = 0;
  thr.rotation.x = Math.PI / 2;
  thr.position.set(0, -0.09, -0.02);
  g.add(thr);
  g.userData.thruster = thr;
  return g;
}

/* ==================================================================
   The manifest: what exists, how it attaches, and the order it flies in.

   `from`/`to` are pose landmark indices forming the piece's axis.
   `at` places it along that axis (0 = from, 1 = to).
   `scale` multiplies the axis length to size the piece.
   ================================================================== */
export function buildSuit(env) {
  const M = materials(env);

  const def = [
    { id: 'bootL',     build: () => buildBoot(M, -1),
      from: POSE.leftAnkle,  to: POSE.leftFoot,   at: 0.55, scale: 2.6, spin: 0 },
    { id: 'bootR',     build: () => buildBoot(M, 1),
      from: POSE.rightAnkle, to: POSE.rightFoot,  at: 0.55, scale: 2.6, spin: 0 },

    { id: 'shinL',     build: () => buildLimb(M, { rTop: 0.19, rBot: 0.16, len: 0.9, cuff: true }),
      from: POSE.leftKnee,   to: POSE.leftAnkle,  at: 0.5, scale: 1.0, align: true, nominal: 0.9 },
    { id: 'shinR',     build: () => buildLimb(M, { rTop: 0.19, rBot: 0.16, len: 0.9, cuff: true }),
      from: POSE.rightKnee,  to: POSE.rightAnkle, at: 0.5, scale: 1.0, align: true, nominal: 0.9 },

    { id: 'thighL',    build: () => buildLimb(M, { rTop: 0.25, rBot: 0.20, len: 0.9 }),
      from: POSE.leftHip,    to: POSE.leftKnee,   at: 0.5, scale: 1.0, align: true, nominal: 0.9 },
    { id: 'thighR',    build: () => buildLimb(M, { rTop: 0.25, rBot: 0.20, len: 0.9 }),
      from: POSE.rightHip,   to: POSE.rightKnee,  at: 0.5, scale: 1.0, align: true, nominal: 0.9 },

    { id: 'chest',     build: () => buildChest(M),
      from: POSE.leftShoulder, to: POSE.rightShoulder, at: 0.5, scale: 1.15,
      drop: 0.34, torso: true },

    { id: 'shoulderL', build: () => buildShoulder(M, -1),
      from: POSE.leftShoulder, to: POSE.leftElbow, at: 0.05, scale: 0.95 },
    { id: 'shoulderR', build: () => buildShoulder(M, 1),
      from: POSE.rightShoulder, to: POSE.rightElbow, at: 0.05, scale: 0.95 },

    { id: 'armL',      build: () => buildLimb(M, { rTop: 0.20, rBot: 0.17, len: 0.85 }),
      from: POSE.leftShoulder, to: POSE.leftElbow, at: 0.5, scale: 1.0, align: true, nominal: 0.85 },
    { id: 'armR',      build: () => buildLimb(M, { rTop: 0.20, rBot: 0.17, len: 0.85 }),
      from: POSE.rightShoulder, to: POSE.rightElbow, at: 0.5, scale: 1.0, align: true, nominal: 0.85 },

    { id: 'gauntletL', build: () => buildGauntlet(M, -1),
      from: POSE.leftElbow,  to: POSE.leftWrist,  at: 0.55, scale: 1.0, align: true, nominal: 0.46 },
    { id: 'gauntletR', build: () => buildGauntlet(M, 1),
      from: POSE.rightElbow, to: POSE.rightWrist, at: 0.55, scale: 1.0, align: true, nominal: 0.46 },

    { id: 'helmet',    build: () => buildHelmet(M),
      from: POSE.leftEar,    to: POSE.rightEar,   at: 0.5, scale: 2.1, head: true },
  ];

  const pieces = def.map((d, i) => {
    const obj = d.build();
    const holder = new THREE.Group();     // holds the piece; sequence animates this
    holder.add(obj);
    holder.visible = false;
    return { ...d, index: i, object: obj, holder, seated: false, t: 0 };
  });

  return { materials: M, pieces };
}
