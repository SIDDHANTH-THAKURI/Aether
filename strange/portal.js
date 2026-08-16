/* ==================================================================
   Portal.

   Built as real geometry rather than a disc with a picture on it: a
   burning rim, a tunnel receding into the screen, and a vista capping
   the far end. Because the tunnel is actual geometry, a portal opened
   off to one side is seen at an angle and shows its inner wall — the
   parallax is real, not faked in a shader.
   ================================================================== */

import * as THREE from 'three';
import { NOISE_GLSL } from './magic.js';

const RIM_VERT = /* glsl */`
  varying vec2 vUv;
  varying vec3 vPos;
  void main(){
    vUv = uv;
    vPos = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

/** The burning rim: layered turbulence licking outward off a torus. */
const RIM_FRAG = /* glsl */`
  precision highp float;
  uniform float uTime, uAlpha, uOpen;
  uniform vec3 uColorHot, uColorCool;
  varying vec2 vUv;
  ${NOISE_GLSL}
  void main(){
    float around = vUv.x;
    float across = vUv.y;

    // flames stream around the ring and flick outward
    float n1 = fbm(vec2(around*22.0 - uTime*1.6, across*3.0 + uTime*2.2));
    float n2 = fbm(vec2(around*46.0 + uTime*2.4, across*5.0 - uTime*3.1));
    float flame = n1*0.65 + n2*0.45;

    float centre = 1.0 - abs(across*2.0 - 1.0);
    float body = pow(centre, 1.6) * (0.35 + flame*1.3);
    float core = pow(centre, 7.0) * 1.5;

    // sparks racing around the circumference
    float spark = pow(max(0.0, sin(around*180.0 - uTime*9.0) * flame), 9.0) * 2.2;

    float a = clamp(body + core + spark, 0.0, 2.0) * uAlpha * uOpen;
    vec3 col = mix(uColorCool, uColorHot, clamp(core + spark*0.6 + flame*0.35, 0.0, 1.0));
    if(a <= 0.004) discard;
    gl_FragColor = vec4(col * a, a);
  }`;

/** Inner wall of the tunnel: energy streaks pulled toward the far end. */
const TUNNEL_FRAG = /* glsl */`
  precision highp float;
  uniform float uTime, uAlpha, uOpen;
  varying vec2 vUv;
  ${NOISE_GLSL}
  void main(){
    // v runs along the tunnel: 0 at the mouth, 1 at the far end
    float depth = vUv.y;
    float around = vUv.x;

    float streak = fbm(vec2(around*30.0, depth*4.0 - uTime*2.6));
    float bands = pow(max(0.0, sin(depth*26.0 - uTime*7.0 + streak*6.0)), 6.0);

    // the wall glows near the mouth and falls into darkness further in
    float falloff = pow(1.0 - depth, 2.2);
    float glow = falloff * (0.30 + streak*0.85) + bands*falloff*0.9;

    vec3 col = mix(vec3(0.35,0.09,0.01), vec3(1.0,0.62,0.18), glow);
    col += vec3(1.0,0.85,0.55) * bands * falloff * 0.7;

    float a = clamp(glow, 0.0, 1.0) * uAlpha * uOpen;
    if(a <= 0.004) discard;
    gl_FragColor = vec4(col * a, a);
  }`;

/** The other side: a warm sky with cloud banks, a low sun and a skyline. */
const VISTA_FRAG = /* glsl */`
  precision highp float;
  uniform float uTime, uOpen, uSeed;
  varying vec2 vUv;
  ${NOISE_GLSL}

  float skyline(vec2 p){
    // blocky silhouette built from stacked steps — reads as a far city
    float h = 0.0;
    for(int i=0;i<7;i++){
      float fi = float(i);
      float w = 0.11 + hash21(vec2(fi, uSeed))*0.09;
      float x = mod(p.x*0.5 + fi*0.37 + uSeed*0.13, 1.0);
      float top = 0.18 + hash21(vec2(fi*3.1, uSeed*2.0))*0.26;
      float block = step(abs(x-0.5), w*0.5) * top;
      h = max(h, block);
    }
    return h;
  }

  void main(){
    vec2 uv = vUv;
    // slow drift so the far side is never static
    vec2 p = uv + vec2(uTime*0.006, 0.0);

    // sky gradient
    vec3 sky = mix(vec3(0.55,0.20,0.05), vec3(0.06,0.05,0.13), pow(uv.y, 0.75));
    sky = mix(sky, vec3(1.0,0.62,0.22), pow(max(0.0, 1.0-uv.y*1.6), 3.0)*0.7);

    // cloud banks
    float cl = fbm(p*vec2(3.2,5.0) + vec2(0.0, uTime*0.02));
    float cl2 = fbm(p*vec2(6.0,9.0) - vec2(uTime*0.03, 0.0));
    float clouds = smoothstep(0.42, 0.85, cl*0.7 + cl2*0.45) * (1.0 - uv.y*0.5);
    sky = mix(sky, vec3(1.0,0.74,0.40), clouds*0.55);

    // low sun
    vec2 sunP = vec2(0.5 + sin(uSeed)*0.18, 0.30);
    float d = length((uv - sunP) * vec2(1.6, 1.0));
    sky += vec3(1.0,0.78,0.42) * exp(-d*7.0) * 1.5;
    sky += vec3(1.0,0.55,0.20) * exp(-d*2.2) * 0.35;

    // distant skyline along the bottom
    float sl = skyline(uv*vec2(2.0,1.0));
    float mask = step(uv.y, sl*0.55 + 0.06);
    sky = mix(sky, vec3(0.03,0.02,0.05), mask*0.92);

    // a few lit windows
    float win = step(0.93, hash21(floor(uv*vec2(90.0,60.0)) + uSeed));
    sky += vec3(1.0,0.72,0.35) * win * mask * 0.55;

    gl_FragColor = vec4(sky * uOpen, 1.0);
  }`;

const SPARK_VERT = /* glsl */`
  attribute float aSize;
  attribute float aSeed;
  varying float vSeed;
  void main(){
    vSeed = aSeed;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * (300.0 / max(-mv.z, 0.001));
    gl_Position = projectionMatrix * mv;
  }`;

const SPARK_FRAG = /* glsl */`
  precision highp float;
  uniform float uTime, uAlpha;
  varying float vSeed;
  void main(){
    vec2 d = gl_PointCoord - 0.5;
    float r = dot(d,d)*4.0;
    if(r > 1.0) discard;
    float glow = pow(1.0 - r, 2.6);
    float tw = 0.55 + 0.45*sin(uTime*24.0 + vSeed*40.0);
    vec3 col = mix(vec3(1.0,0.45,0.08), vec3(1.0,0.95,0.75), glow*tw);
    float a = glow * uAlpha * tw;
    gl_FragColor = vec4(col * a, a);
  }`;

export class Portal {
  constructor({ radius = 1, depth = 2.4, seed = Math.random() * 10 } = {}) {
    this.group = new THREE.Group();
    this.radius = radius;
    this.depth = depth;
    this.open = 0;          // 0..1 iris
    this.state = 'closed';  // closed | opening | open | closing
    this.age = 0;
    this.spin = Math.random() < 0.5 ? -1 : 1;

    const uni = () => ({
      uTime: { value: 0 }, uAlpha: { value: 1 }, uOpen: { value: 0 },
    });

    // --- rim
    this.rimMat = new THREE.ShaderMaterial({
      uniforms: { ...uni(),
        uColorHot:  { value: new THREE.Color(1.0, 0.92, 0.70) },
        uColorCool: { value: new THREE.Color(1.0, 0.36, 0.05) } },
      vertexShader: RIM_VERT, fragmentShader: RIM_FRAG,
      transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.DoubleSide,
    });
    this.rim = new THREE.Mesh(
      new THREE.TorusGeometry(radius, radius * 0.075, 20, 220), this.rimMat);
    this.group.add(this.rim);

    // a second, larger and fainter rim gives the fire some volume
    this.rimOuterMat = this.rimMat.clone();
    this.rimOuterMat.uniforms.uAlpha.value = 0.45;
    this.rimOuter = new THREE.Mesh(
      new THREE.TorusGeometry(radius * 1.02, radius * 0.19, 14, 200), this.rimOuterMat);
    this.group.add(this.rimOuter);

    // --- tunnel: open cylinder receding away from the viewer
    this.tunnelMat = new THREE.ShaderMaterial({
      uniforms: uni(),
      vertexShader: RIM_VERT, fragmentShader: TUNNEL_FRAG,
      transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.BackSide,
    });
    const tunnelGeo = new THREE.CylinderGeometry(radius, radius * 0.72, depth, 64, 1, true);
    tunnelGeo.rotateX(Math.PI / 2);          // axis now runs along z
    tunnelGeo.translate(0, 0, -depth / 2);   // mouth at z=0, far end behind
    this.tunnel = new THREE.Mesh(tunnelGeo, this.tunnelMat);
    this.group.add(this.tunnel);

    // --- the far side, capping the tunnel
    this.vistaMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uOpen: { value: 0 }, uSeed: { value: seed } },
      vertexShader: RIM_VERT, fragmentShader: VISTA_FRAG,
      depthWrite: true, side: THREE.DoubleSide,
    });
    this.vista = new THREE.Mesh(
      new THREE.CircleGeometry(radius * 0.74, 64), this.vistaMat);
    this.vista.position.z = -depth;
    this.group.add(this.vista);

    // --- sparks orbiting the rim
    const N = 420;
    const pos = new Float32Array(N * 3);
    const size = new Float32Array(N);
    const seeds = new Float32Array(N);
    this.sparkState = [];
    for (let i = 0; i < N; i++) {
      const a = Math.random() * Math.PI * 2;
      this.sparkState.push({
        a, speed: (0.4 + Math.random() * 1.6) * (Math.random() < 0.5 ? 1 : -1),
        r: radius * (0.96 + Math.random() * 0.12),
        drift: (Math.random() - 0.5) * radius * 0.25,
        life: Math.random(),
      });
      size[i] = 2 + Math.random() * 6;
      seeds[i] = Math.random();
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    sg.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    sg.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    this.sparkMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uAlpha: { value: 0 } },
      vertexShader: SPARK_VERT, fragmentShader: SPARK_FRAG,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.sparks = new THREE.Points(sg, this.sparkMat);
    this.group.add(this.sparks);

    // light that spills out of the mouth onto whatever is nearby
    this.light = new THREE.PointLight(0xff8a25, 0, radius * 9, 2);
    this.group.add(this.light);

    this.group.visible = false;
  }

  openAt(position, radius) {
    if (radius && radius !== this.radius) this.setRadius(radius);
    this.group.position.copy(position);
    this.group.visible = true;
    this.state = 'opening';
    this.age = 0;
  }

  setRadius(radius) {
    const k = radius / this.radius;
    this.radius = radius;
    this.group.scale.setScalar(1);
    this.rim.scale.setScalar(k);
    this.rimOuter.scale.setScalar(k);
    this.tunnel.scale.setScalar(k);
    this.vista.scale.setScalar(k);
    this.sparks.scale.setScalar(k);
    this._k = k;
  }

  close() { if (this.state !== 'closed') this.state = 'closing'; }

  get isOpen() { return this.state === 'open' || this.state === 'opening'; }

  update(dt, time) {
    if (this.state === 'closed') { this.group.visible = false; return; }
    this.age += dt;

    if (this.state === 'opening') {
      this.open = Math.min(1, this.open + dt / 0.7);
      if (this.open >= 1) this.state = 'open';
    } else if (this.state === 'closing') {
      this.open = Math.max(0, this.open - dt / 0.45);
      if (this.open <= 0) { this.state = 'closed'; this.group.visible = false; return; }
    }

    // iris easing — the hole punches open rather than fading in
    const e = this.open * this.open * (3 - 2 * this.open);
    const k = this._k || 1;
    this.rim.scale.setScalar(k * (0.25 + e * 0.75));
    this.rimOuter.scale.setScalar(k * (0.25 + e * 0.75));
    this.tunnel.scale.set(k * e, k * e, k);
    this.vista.scale.setScalar(k * e * 0.98);
    this.sparks.scale.setScalar(k * (0.3 + e * 0.7));

    this.rim.rotation.z = time * 0.28 * this.spin;
    this.rimOuter.rotation.z = -time * 0.17 * this.spin;

    for (const m of [this.rimMat, this.rimOuterMat, this.tunnelMat]) {
      m.uniforms.uTime.value = time;
      m.uniforms.uOpen.value = e;
    }
    this.vistaMat.uniforms.uTime.value = time;
    this.vistaMat.uniforms.uOpen.value = e;
    this.sparkMat.uniforms.uTime.value = time;
    this.sparkMat.uniforms.uAlpha.value = e;

    // sparks ride the rim, occasionally flying off and respawning
    const arr = this.sparks.geometry.attributes.position.array;
    this.sparkState.forEach((s, i) => {
      s.a += s.speed * dt * 1.3;
      s.life += dt * 0.6;
      if (s.life > 1) { s.life = 0; s.r = this.radius * (0.96 + Math.random() * 0.12); }
      const fly = s.life * s.life * this.radius * 0.5;
      const r = s.r + fly;
      arr[i * 3] = Math.cos(s.a) * r;
      arr[i * 3 + 1] = Math.sin(s.a) * r;
      arr[i * 3 + 2] = s.drift + Math.sin(s.a * 3 + time) * this.radius * 0.05;
    });
    this.sparks.geometry.attributes.position.needsUpdate = true;

    this.light.intensity = e * 3.5;
    this.light.distance = this.radius * 9;
  }

  dispose() {
    this.group.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); });
  }
}
