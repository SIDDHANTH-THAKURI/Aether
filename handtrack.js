/* ==================================================================
   Shared hand-tracking layer.

   Wraps MediaPipe HandLandmarker with the things every project here
   needs and nobody wants to write twice:

     · camera picking (remembers your choice), resolution + mirror
     · One Euro filtering, so landmarks stop jittering without the
       lag a plain lerp introduces
     · pose helpers (extended fingers, fist, pinch, spread, velocity)
     · a boot overlay that reports the real error when something fails

   Usage:
     const tracker = await createTracker({ numHands: 2 });
     tracker.onFrame(hands => { ... });   // called once per video frame
   ================================================================== */

import { FilesetResolver, HandLandmarker, PoseLandmarker, FaceLandmarker }
  from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";

const VISION_CDN = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
const POSE_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";
const FACE_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

// Pose landmark indices worth naming — the ones anything body-attached needs.
export const POSE = {
  nose: 0, leftEye: 2, rightEye: 5, leftEar: 7, rightEar: 8,
  leftShoulder: 11, rightShoulder: 12,
  leftElbow: 13, rightElbow: 14, leftWrist: 15, rightWrist: 16,
  leftHip: 23, rightHip: 24, leftKnee: 25, rightKnee: 26,
  leftAnkle: 27, rightAnkle: 28, leftFoot: 31, rightFoot: 32,
};

/** Midpoint of two landmarks, in whatever space they came in. */
export const mid = (a, b) => ({
  x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: ((a.z || 0) + (b.z || 0)) / 2,
});

/**
 * Body frame derived from the pose: where the chest sits, how wide the
 * shoulders are on screen, and how far the torso is rolled. This is the
 * anchor anything worn on the body hangs from.
 */
export function bodyFrame(pose) {
  if (!pose || pose.length < 25) return null;
  const ls = pose[POSE.leftShoulder], rs = pose[POSE.rightShoulder];
  const lh = pose[POSE.leftHip], rh = pose[POSE.rightHip];
  if (!ls || !rs || !lh || !rh) return null;

  const shoulder = mid(ls, rs);
  const hip = mid(lh, rh);
  const width = Math.hypot(ls.x - rs.x, ls.y - rs.y);
  const torso = Math.hypot(shoulder.x - hip.x, shoulder.y - hip.y);
  // Shoulder tilt, measured right-shoulder → left-shoulder and flipped into
  // screen terms (image y runs down). Level shoulders read 0. Measuring it the
  // other way round reads ~π for anyone standing normally, which silently
  // turned everything hung off this frame upside down.
  const roll = Math.atan2(-(ls.y - rs.y), ls.x - rs.x);

  return {
    shoulder, hip, width, torso, roll,
    // Sternum: a little below the shoulder line, where a pendant would rest.
    chest: {
      x: shoulder.x + (hip.x - shoulder.x) * 0.26,
      y: shoulder.y + (hip.y - shoulder.y) * 0.26,
      z: shoulder.z + ((hip.z || 0) - (shoulder.z || 0)) * 0.26,
    },
    visible: Math.min(ls.visibility ?? 1, rs.visibility ?? 1),
  };
}

const LS_DEVICE = 'aether.camera.deviceId';
const LS_RES = 'aether.camera.res';
const LS_MIRROR = 'aether.camera.mirror';

/* ---------------------------------------------------------------- maths */

// One Euro filter: heavy smoothing when a point is still, almost none when
// it moves fast. That is what keeps a flick sharp while idle hands sit calm.
class OneEuro {
  constructor(minCutoff = 1.7, beta = 0.035, dCutoff = 1.0) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
    this.x = null; this.dx = 0;
  }
  static alpha(cutoff, dt) {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }
  filter(v, dt) {
    if (this.x === null) { this.x = v; return v; }
    dt = Math.max(dt, 1e-3);
    const dx = (v - this.x) / dt;
    const ad = OneEuro.alpha(this.dCutoff, dt);
    this.dx = ad * dx + (1 - ad) * this.dx;
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
    const a = OneEuro.alpha(cutoff, dt);
    this.x = a * v + (1 - a) * this.x;
    return this.x;
  }
}

class LandmarkFilter {
  constructor(n = 21, opts = {}) {
    const { minCutoff = 1.7, beta = 0.035 } = opts;
    this.f = Array.from({ length: n }, () => ({
      x: new OneEuro(minCutoff, beta), y: new OneEuro(minCutoff, beta),
      z: new OneEuro(minCutoff * 1.5, beta * 1.4),
    }));
  }
  apply(lm, dt) {
    return lm.map((p, i) => {
      const f = this.f[i] || (this.f[i] = {
        x: new OneEuro(), y: new OneEuro(), z: new OneEuro(2.5, 0.05),
      });
      return {
        x: f.x.filter(p.x, dt),
        y: f.y.filter(p.y, dt),
        z: f.z.filter(p.z || 0, dt),
        visibility: p.visibility,
      };
    });
  }
}

/* ---------------------------------------------------------------- pose helpers */
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export function palmCenter(lm) {
  let x = 0, y = 0;
  for (const i of [0, 5, 9, 13, 17]) { x += lm[i].x; y += lm[i].y; }
  return { x: x / 5, y: y / 5 };
}

// Wrist → middle knuckle: the hand's own scale, so thresholds are
// independent of how far the person is standing from the camera.
export const handScale = lm => Math.max(dist(lm[0], lm[9]), 1e-4);

export function spread(lm) {
  const c = palmCenter(lm), s = handScale(lm);
  return [8, 12, 16, 20].reduce((a, i) => a + dist(lm[i], c), 0) / 4 / s;
}

const TIPS = { thumb: 4, index: 8, middle: 12, ring: 16, pinky: 20 };
const PIPS = { thumb: 2, index: 6, middle: 10, ring: 14, pinky: 18 };

// A finger counts as extended when its tip sits further from the wrist
// than its middle joint does — orientation-independent, unlike a y-compare.
export function extended(lm, finger) {
  const w = lm[0];
  return dist(lm[TIPS[finger]], w) > dist(lm[PIPS[finger]], w) * 1.12;
}

export function fingersUp(lm) {
  return {
    thumb: extended(lm, 'thumb'), index: extended(lm, 'index'),
    middle: extended(lm, 'middle'), ring: extended(lm, 'ring'),
    pinky: extended(lm, 'pinky'),
  };
}

export const isFist = lm => spread(lm) < 1.05;
export const isOpenPalm = lm => spread(lm) > 1.5;

// Index out, the other three curled — the pose you trace a circle with.
export function isPointing(lm) {
  const f = fingersUp(lm);
  return f.index && !f.middle && !f.ring && !f.pinky;
}

export const pinchGap = lm => dist(lm[4], lm[8]) / handScale(lm);

/* ==================================================================
   3D ORIENTATION

   The 2D landmark positions alone cannot tell a palm from the back of
   a hand — an upside-down hand produces almost the same fingertip
   spread as an upright one, which is why gestures used to fire from
   poses that made no sense. These helpers reconstruct the hand's
   actual orientation so every gesture can be gated on a plausible pose.

   MediaPipe image space: +x right, +y DOWN, +z away from the camera
   (landmarks closer to the lens have smaller/more negative z).
   ================================================================== */

const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: (a.z || 0) - (b.z || 0) });
const cross = (a, b) => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
const len3 = v => Math.hypot(v.x, v.y, v.z);
const norm3 = v => { const l = len3(v) || 1e-6; return { x: v.x / l, y: v.y / l, z: v.z / l }; };

/**
 * Full orientation read for one hand.
 *
 *  normal      unit vector out of the palm
 *  facing      +1 palm square to the camera, -1 back of hand to the camera,
 *              0 edge-on. This is the number nearly every gate wants.
 *  uprightness +1 fingers point up, -1 fingers point down
 *  roll        angle of the wrist→middle-knuckle axis in the image plane
 *  planarity   how well-formed the palm triangle is (0 = degenerate, 1 = ideal);
 *              doubles as a confidence measure for the whole reading
 */
export function orientation(lm, key = 'Right') {
  const wrist = lm[0], idx = lm[5], pky = lm[17], knuckle = lm[9];

  const v1 = sub(idx, wrist);
  const v2 = sub(pky, wrist);
  let n = cross(v1, v2);

  // The cross product's sign depends on which hand it is: the same physical
  // pose mirrors the index/pinky order. Flip the left hand so "facing" means
  // the same thing for both.
  if (key === 'Left') n = { x: -n.x, y: -n.y, z: -n.z };

  const area = len3(n);
  const planarity = Math.min(1, area / (len3(v1) * len3(v2) + 1e-6));
  n = norm3(n);

  // +z points away from the camera, so a palm aimed at the lens has n.z < 0.
  const facing = -n.z;

  const axis = sub(knuckle, wrist);
  const axisLen = Math.hypot(axis.x, axis.y) || 1e-6;
  const uprightness = -axis.y / axisLen;          // y is down, so negate
  const roll = Math.atan2(axis.y, axis.x);

  return {
    normal: n, facing, uprightness, roll, planarity,
    palmToward: facing > 0.30,
    palmAway: facing < -0.30,
    edgeOn: Math.abs(facing) <= 0.30,
    fingersUp: uprightness > 0.35,
    fingersDown: uprightness < -0.35,
  };
}

/**
 * Hysteresis gate. Feed it a 0..1 confidence each frame; it only switches on
 * once the value has held above `enter` for `hold` seconds, and only switches
 * off once it has held below `exit` for `release` seconds. That kills the
 * on/off flicker you get when a raw threshold sits right at the boundary.
 */
export class Gate {
  constructor({ enter = 0.6, exit = 0.4, hold = 0.07, release = 0.12 } = {}) {
    Object.assign(this, { enter, exit, hold, release });
    this.active = false; this.value = 0; this.above = 0; this.below = 0; this.since = 0;
  }
  update(value, dt) {
    this.value = value;
    this.since += dt;
    if (value >= this.enter) { this.above += dt; this.below = 0; }
    else if (value <= this.exit) { this.below += dt; this.above = 0; }
    else { this.above = 0; this.below = 0; }

    if (!this.active && this.above >= this.hold) { this.active = true; this.since = 0; }
    else if (this.active && this.below >= this.release) { this.active = false; this.since = 0; }
    return this.active;
  }
  reset() { this.active = false; this.above = this.below = 0; this.value = 0; }
}

/** Maps a raw measurement onto 0..1 confidence between two bounds. */
export const conf = (v, lo, hi) => Math.min(1, Math.max(0, (v - lo) / (hi - lo || 1e-6)));

/* ---------------------------------------------------------------- debug draw */

/**
 * Orientation debug overlay: skeleton, the palm normal drawn as a projected
 * arrow, and a live pass/fail list of whatever conditions the page registers.
 *
 * checks: (hand) => [{ label, pass, value }]
 */
const DEBUG_BONES = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],
  [11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];

export function drawHandDebug(ctx, { hands, toScreen, W, H, dpr = 1, checks = null }) {
  const S = Math.max(W, H) / 1400;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.font = `${12 * dpr}px ui-monospace,Consolas,monospace`;
  ctx.textAlign = 'left';

  hands.forEach((hand, hi) => {
    const { lm, key } = hand;
    const o = hand.o || orientation(lm, key);

    ctx.lineWidth = 1.6 * S;
    ctx.strokeStyle = o.palmToward ? 'rgba(120,255,170,.75)'
                    : o.palmAway   ? 'rgba(255,110,110,.7)'
                                   : 'rgba(255,210,120,.7)';
    for (const [a, b] of DEBUG_BONES) {
      const p = toScreen(lm[a], W, H), q = toScreen(lm[b], W, H);
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
    }

    // palm normal, projected: length shrinks as it turns edge-on
    const c = toScreen(palmCenter(lm), W, H);
    const L = 110 * S;
    const mirror = toScreen({ x: 0.5, y: 0 }, W, H).x > toScreen({ x: 0.6, y: 0 }, W, H).x ? -1 : 1;
    const tipX = c.x + o.normal.x * L * mirror;
    const tipY = c.y + o.normal.y * L;
    const zScale = 0.45 + Math.abs(o.facing) * 0.75;
    ctx.strokeStyle = o.facing > 0 ? 'rgba(120,255,170,.95)' : 'rgba(255,110,110,.95)';
    ctx.lineWidth = 3.5 * S * zScale;
    ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(tipX, tipY); ctx.stroke();
    ctx.beginPath();
    ctx.arc(tipX, tipY, (5 + 9 * Math.abs(o.facing)) * S, 0, Math.PI * 2);
    ctx.fillStyle = o.facing > 0 ? 'rgba(120,255,170,.9)' : 'rgba(255,110,110,.9)';
    ctx.fill();

    // per-hand readout
    const lines = [
      `${key.toUpperCase()}  ${o.palmToward ? 'PALM → CAMERA'
        : o.palmAway ? 'BACK OF HAND' : 'EDGE-ON'}`,
      `facing ${o.facing >= 0 ? ' ' : ''}${o.facing.toFixed(2)}   ` +
      `upright ${o.uprightness >= 0 ? ' ' : ''}${o.uprightness.toFixed(2)}`,
      `normal ${o.normal.x.toFixed(2)} ${o.normal.y.toFixed(2)} ${o.normal.z.toFixed(2)}`,
      `planarity ${o.planarity.toFixed(2)}   roll ${(o.roll * 180 / Math.PI).toFixed(0)}°`,
    ];
    const rows = checks ? checks(hand) : [];

    const x = 16 * dpr + hi * 300 * dpr;
    let y = 26 * dpr;
    ctx.fillStyle = 'rgba(6,8,14,.72)';
    ctx.fillRect(x - 8 * dpr, y - 16 * dpr,
      286 * dpr, (lines.length + rows.length + 1) * 17 * dpr + 12 * dpr);

    ctx.fillStyle = '#dfe7f5';
    for (const l of lines) { ctx.fillText(l, x, y); y += 17 * dpr; }
    y += 5 * dpr;
    for (const r of rows) {
      ctx.fillStyle = r.pass ? '#7dff9b' : '#ff8d8d';
      ctx.fillText(`${r.pass ? '✓' : '✗'} ${r.label}${
        r.value !== undefined ? '  ' + r.value : ''}`, x, y);
      y += 17 * dpr;
    }
  });

  if (!hands.length) {
    ctx.fillStyle = 'rgba(6,8,14,.72)';
    ctx.fillRect(8 * dpr, 10 * dpr, 210 * dpr, 30 * dpr);
    ctx.fillStyle = '#8a95a8';
    ctx.fillText('no hands detected', 16 * dpr, 30 * dpr);
  }
  ctx.restore();
}

/* ---------------------------------------------------------------- UI chrome */
function injectStyles() {
  if (document.getElementById('aether-track-css')) return;
  const s = document.createElement('style');
  s.id = 'aether-track-css';
  s.textContent = `
    .at-boot {
      position: fixed; inset: 0; z-index: 60; display: grid; place-content: center;
      text-align: center; background: #04050a; color: #dfe6f2; padding: 10vh 8vw;
      font: 300 clamp(13px,1.9vh,19px)/1.9 system-ui,-apple-system,"Segoe UI",sans-serif;
      transition: opacity .7s ease;
    }
    .at-boot.gone { opacity: 0; pointer-events: none; }
    .at-boot small { display: block; margin-top: 2.4vh; color: #7b8598; letter-spacing: .08em; }
    .at-boot .err { color: #ff8f8f; font-family: ui-monospace,Consolas,monospace; font-size: .85em; }
    .at-boot .spin {
      width: 34px; height: 34px; margin: 0 auto 3vh; border-radius: 50%;
      border: 2px solid rgba(255,255,255,.14); border-top-color: currentColor;
      animation: at-spin .9s linear infinite;
    }
    @keyframes at-spin { to { transform: rotate(360deg); } }

    .at-gear {
      position: fixed; right: 2.2vh; bottom: 2.2vh; z-index: 40;
      width: 40px; height: 40px; border-radius: 50%; cursor: pointer;
      display: grid; place-items: center; font-size: 16px; line-height: 1;
      background: rgba(12,16,26,.62); color: #cfd8e6;
      border: 1px solid rgba(255,255,255,.16); backdrop-filter: blur(8px);
      transition: transform .25s ease, background .25s ease;
    }
    .at-gear:hover { transform: rotate(35deg); background: rgba(22,30,46,.85); }

    .at-panel {
      position: fixed; right: 2.2vh; bottom: calc(2.2vh + 52px); z-index: 41;
      width: min(310px, 78vw); padding: 1.1rem 1.2rem 1.25rem;
      background: rgba(10,13,22,.9); backdrop-filter: blur(14px);
      border: 1px solid rgba(255,255,255,.14); border-radius: 14px;
      color: #dbe3f0; font: 400 12.5px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;
      display: none; gap: .85rem; grid-auto-rows: min-content;
    }
    .at-panel.open { display: grid; }
    .at-panel h4 {
      margin: 0; font-size: 10.5px; letter-spacing: .26em; text-transform: uppercase;
      color: #7b8598; font-weight: 500;
    }
    .at-panel label { display: grid; gap: .35rem; }
    .at-panel select {
      width: 100%; padding: .55rem .6rem; border-radius: 8px;
      background: #10141f; color: #dbe3f0; border: 1px solid rgba(255,255,255,.16);
      font: inherit;
    }
    .at-panel .row { display: flex; align-items: center; justify-content: space-between; gap: .8rem; }
    .at-panel .stat { color: #7b8598; font-family: ui-monospace,Consolas,monospace; font-size: 11px; }
    .at-sw { position: relative; width: 38px; height: 21px; flex: none; }
    .at-sw input { position: absolute; opacity: 0; inset: 0; margin: 0; cursor: pointer; }
    .at-sw span {
      position: absolute; inset: 0; border-radius: 21px; background: #232a3a;
      transition: background .22s ease; pointer-events: none;
    }
    .at-sw span::after {
      content: ""; position: absolute; top: 3px; left: 3px; width: 15px; height: 15px;
      border-radius: 50%; background: #cfd8e6; transition: transform .22s ease;
    }
    .at-sw input:checked + span { background: #3f7fd1; }
    .at-sw input:checked + span::after { transform: translateX(17px); }
  `;
  document.head.appendChild(s);
}

/* ---------------------------------------------------------------- tracker */
export async function createTracker(opts = {}) {
  const {
    numHands = 2,
    minDetection = 0.5,
    minTracking = 0.5,
    smoothing = true,
    pose: wantPose = false,      // body landmarks, for anything worn or attached
    face: wantFace = false,      // face mesh, for helmets and visors
    bootText = 'Loading hand tracking…',
  } = opts;

  injectStyles();

  const boot = document.createElement('div');
  boot.className = 'at-boot';
  boot.innerHTML = `<div class="spin"></div>${bootText}
    <small>Allow camera access when your browser asks.</small>`;
  document.body.appendChild(boot);

  const fail = (e, hint) => {
    console.error(e);
    boot.classList.remove('gone');
    boot.innerHTML = `Could not start.<br><span class="err">${
      (e && e.message) ? e.message : e}</span><small>${hint || ''}</small>`;
  };

  const video = document.createElement('video');
  video.playsInline = true; video.muted = true;
  Object.assign(video.style, {
    position: 'fixed', width: '1px', height: '1px', opacity: '0', pointerEvents: 'none',
  });
  document.body.appendChild(video);

  let landmarker, poseLandmarker = null, faceLandmarker = null, stream = null;
  try {
    const fileset = await FilesetResolver.forVisionTasks(VISION_CDN);
    landmarker = await HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
      runningMode: 'VIDEO',
      numHands,
      minHandDetectionConfidence: minDetection,
      minTrackingConfidence: minTracking,
    });
    if (wantPose) {
      poseLandmarker = await PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: POSE_URL, delegate: 'GPU' },
        runningMode: 'VIDEO',
        numPoses: 1,
        minPoseDetectionConfidence: minDetection,
        minTrackingConfidence: minTracking,
      });
    }
    if (wantFace) {
      faceLandmarker = await FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: FACE_URL, delegate: 'GPU' },
        runningMode: 'VIDEO',
        numFaces: 1,
        outputFacialTransformationMatrixes: true,
      });
    }
  } catch (e) {
    fail(e, 'The tracking models load from a CDN — check your connection and reload.');
    throw e;
  }

  const state = {
    deviceId: localStorage.getItem(LS_DEVICE) || '',
    res: localStorage.getItem(LS_RES) || '1280x720',
    mirror: localStorage.getItem(LS_MIRROR) !== '0',
    fps: 0, detectMs: 0,
  };

  async function openCamera(deviceId) {
    if (stream) stream.getTracks().forEach(t => t.stop());
    const [w, h] = state.res.split('x').map(Number);
    const constraints = {
      audio: false,
      video: deviceId
        ? { deviceId: { exact: deviceId }, width: { ideal: w }, height: { ideal: h } }
        : { facingMode: 'user', width: { ideal: w }, height: { ideal: h } },
    };
    stream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = stream;
    await video.play();
    const track = stream.getVideoTracks()[0];
    state.deviceId = track.getSettings().deviceId || deviceId || '';
    if (state.deviceId) localStorage.setItem(LS_DEVICE, state.deviceId);
    return track;
  }

  try {
    await openCamera(state.deviceId);
  } catch (e) {
    // A remembered camera can disappear between sessions; fall back to any camera.
    try { await openCamera(''); }
    catch (e2) {
      fail(e2, 'The camera needs http://localhost or https, plus permission granted.');
      throw e2;
    }
  }

  /* ---------------- settings panel ---------------- */
  const gear = document.createElement('button');
  gear.className = 'at-gear';
  gear.title = 'Camera settings';
  gear.textContent = '⚙';
  const panel = document.createElement('div');
  panel.className = 'at-panel';
  panel.innerHTML = `
    <h4>Camera</h4>
    <label>Device <select data-dev></select></label>
    <label>Resolution
      <select data-res>
        <option value="640x480">640 × 480 — fastest</option>
        <option value="1280x720">1280 × 720 — balanced</option>
        <option value="1920x1080">1920 × 1080 — sharpest</option>
      </select>
    </label>
    <div class="row">Mirror view
      <span class="at-sw"><input type="checkbox" data-mirror><span></span></span>
    </div>
    <div class="row"><span class="stat" data-stat>—</span></div>`;
  document.body.append(gear, panel);
  gear.addEventListener('click', () => panel.classList.toggle('open'));

  const devSel = panel.querySelector('[data-dev]');
  const resSel = panel.querySelector('[data-res]');
  const mirrorBox = panel.querySelector('[data-mirror]');
  const statEl = panel.querySelector('[data-stat]');
  resSel.value = state.res;
  mirrorBox.checked = state.mirror;

  async function listDevices() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cams = devices.filter(d => d.kind === 'videoinput');
    devSel.innerHTML = cams.map((d, i) =>
      `<option value="${d.deviceId}">${d.label || `Camera ${i + 1}`}</option>`).join('');
    if (state.deviceId) devSel.value = state.deviceId;
  }
  listDevices();
  navigator.mediaDevices.addEventListener?.('devicechange', listDevices);

  devSel.addEventListener('change', () => openCamera(devSel.value).catch(e => fail(e)));
  resSel.addEventListener('change', () => {
    state.res = resSel.value;
    localStorage.setItem(LS_RES, state.res);
    openCamera(state.deviceId).catch(e => fail(e));
  });
  mirrorBox.addEventListener('change', () => {
    state.mirror = mirrorBox.checked;
    localStorage.setItem(LS_MIRROR, state.mirror ? '1' : '0');
  });

  /* ---------------- detection loop ---------------- */
  const filters = new Map();          // handedness key → LandmarkFilter
  const poseFilter = new LandmarkFilter(33, { minCutoff: 1.1, beta: 0.02 });
  const faceFilter = new LandmarkFilter(478, { minCutoff: 1.4, beta: 0.03 });
  let lastVideoTime = -1, lastT = performance.now(), fpsEMA = 60;
  let callback = () => {};
  let running = true;
  let raw = [], rawPose = null, rawFace = null, faceMatrix = null;

  function step(now) {
    if (!running) return;
    requestAnimationFrame(step);
    const dt = Math.min((now - lastT) / 1000, 0.05);
    lastT = now;
    fpsEMA = fpsEMA * 0.92 + (1 / Math.max(dt, 1e-3)) * 0.08;
    state.fps = fpsEMA;

    if (video.readyState >= 2 && video.currentTime !== lastVideoTime) {
      lastVideoTime = video.currentTime;
      const t0 = performance.now();
      const res = landmarker.detectForVideo(video, now);
      state.detectMs = state.detectMs * 0.9 + (performance.now() - t0) * 0.1;

      const lms = res.landmarks || [];
      const cats = res.handednesses || res.handedness || [];
      const used = new Set();
      raw = lms.map((lm, i) => {
        let key = cats[i]?.[0]?.categoryName;
        if (key !== 'Left' && key !== 'Right') key = i ? 'Right' : 'Left';
        if (used.has(key)) key = key === 'Left' ? 'Right' : 'Left';
        used.add(key);
        return { key, lm };
      });

      // Body and face run off the same frame and timestamp as the hands.
      if (poseLandmarker) {
        const pr = poseLandmarker.detectForVideo(video, now);
        rawPose = pr.landmarks?.[0] || null;
      }
      if (faceLandmarker) {
        const fr = faceLandmarker.detectForVideo(video, now);
        rawFace = fr.faceLandmarks?.[0] || null;
        faceMatrix = fr.facialTransformationMatrixes?.[0]?.data || null;
      }
    }

    const hands = raw.map(({ key, lm }) => {
      const out = smoothing
        ? { key, lm: (filters.has(key) || filters.set(key, new LandmarkFilter(21)),
                      filters.get(key).apply(lm, dt)) }
        : { key, lm };
      out.o = orientation(out.lm, key);   // every consumer gets orientation for free
      return out;
    });
    // Drop filters for hands that left, so a returning hand starts clean.
    for (const key of [...filters.keys()])
      if (!hands.some(h => h.key === key)) filters.delete(key);

    const pose = rawPose ? (smoothing ? poseFilter.apply(rawPose, dt) : rawPose) : null;
    const face = rawFace ? (smoothing ? faceFilter.apply(rawFace, dt) : rawFace) : null;
    const body = pose ? bodyFrame(pose) : null;
    api.pose = pose; api.face = face; api.body = body; api.faceMatrix = faceMatrix;

    if (panel.classList.contains('open')) {
      statEl.textContent =
        `${video.videoWidth}×${video.videoHeight} · ${state.fps.toFixed(0)} fps · ` +
        `detect ${state.detectMs.toFixed(1)} ms · ${hands.length} hand${hands.length === 1 ? '' : 's'}` +
        (poseLandmarker ? ` · body ${pose ? 'yes' : 'no'}` : '') +
        (faceLandmarker ? ` · face ${face ? 'yes' : 'no'}` : '');
    }

    callback(hands, dt, now * 0.001, { pose, face, body, faceMatrix });
  }

  const api = {
    video,
    state,
    pose: null, face: null, body: null, faceMatrix: null,
    onFrame(fn) { callback = fn; },
    // Landmarks are 0..1 in video space; this maps them to canvas pixels,
    // honouring the mirror setting so on-screen motion matches the user.
    toScreen(p, W, H) {
      return { x: (state.mirror ? 1 - p.x : p.x) * W, y: p.y * H };
    },
    // Same mapping into normalised device coords, for anything drawn in 3D.
    toNDC(p) {
      return { x: ((state.mirror ? 1 - p.x : p.x) * 2 - 1), y: -(p.y * 2 - 1) };
    },
    // Stop the detection loop too — leaving it running would keep calling
    // detectForVideo on a video whose track has already ended.
    stop() { running = false; stream?.getTracks().forEach(t => t.stop()); },
  };

  boot.classList.add('gone');
  setTimeout(() => boot.remove(), 900);
  requestAnimationFrame(step);

  return api;
}
