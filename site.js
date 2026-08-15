/* ------------------------------------------------------------------
   Shared shell behaviour for index.html and projects.html.
   Project pages don't use this — they stay self-contained.
------------------------------------------------------------------- */

export const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

export const esc = s => String(s).replace(/[&<>"]/g, ch =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

/* ---------------------------------------------------------- card markup */
export function cardHTML(p, i = 0) {
  const live = p.status === 'live';
  return `
  <article class="card reveal${live ? '' : ' soon'}"
           style="--accent:${esc(p.accent)};transition-delay:${(i * 0.08).toFixed(2)}s">
    <div class="card-top">
      <div class="glyph" aria-hidden="true">${esc(p.glyph)}</div>
      <div class="badge ${live ? 'live' : ''}">${live ? 'Live' : 'Soon'}</div>
    </div>
    <div>
      <p class="sub">${esc(p.subtitle)}</p>
      <h2>${esc(p.title)}</h2>
    </div>
    <div>
      <p class="desc">${esc(p.description)}</p>
      <div class="tags">${p.tags.map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>
    </div>
    <div class="card-foot">
      ${live
        ? `<a class="launch stretched" href="${esc(p.href)}">Launch
             <svg width="16" height="10" viewBox="0 0 18 10" fill="none" aria-hidden="true">
               <path d="M0 5h16M12 1l4 4-4 4" stroke="currentColor" stroke-width="1.5"
                     stroke-linecap="round" stroke-linejoin="round"/>
             </svg></a>`
        : `<span class="launch" style="color:var(--dim)">In progress</span>`}
      <span class="needs">${esc(p.needs)}</span>
    </div>
  </article>`;
}

/* ---------------------------------------------------------- reveal on scroll */
export function mountReveal(root = document) {
  const io = new IntersectionObserver(entries => {
    for (const e of entries)
      if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
  }, { rootMargin: '-8% 0px -8% 0px' });
  root.querySelectorAll('.reveal:not(.in)').forEach(el => io.observe(el));
  return io;
}

/* ---------------------------------------------------------- sticky nav */
export function mountNav(id = 'nav') {
  const nav = document.getElementById(id);
  if (!nav) return;
  const onScroll = () => nav.classList.toggle('stuck', scrollY > 30);
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

/* ---------------------------------------------------------- page transitions */
export function mountPageFade() {
  document.addEventListener('click', e => {
    const a = e.target.closest('a[href]');
    if (!a) return;
    const href = a.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('http') || a.target === '_blank') return;
    e.preventDefault();
    document.body.classList.add('leaving');
    setTimeout(() => { location.href = href; }, 380);
  });
  // Coming back via the browser's cache would otherwise leave the page faded out.
  addEventListener('pageshow', () => document.body.classList.remove('leaving'));
}

/* ==================================================================
   Background: a slow ember field in a fragment shader.
   Silently leaves the flat CSS background in place if WebGL is missing.
   ================================================================== */
export function mountBackground(id = 'bg') {
  const canvas = document.getElementById(id);
  if (!canvas || reduced) return;
  const gl = canvas.getContext('webgl', { alpha: true, antialias: false, depth: false });
  if (!gl) return;

  const VS = `
    attribute vec2 p;
    void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;

  const FS = `
    precision highp float;
    uniform vec2 uRes;
    uniform float uTime;
    uniform vec2 uMouse;

    float hash(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
    float noise(vec2 p){
      vec2 i = floor(p), f = fract(p);
      f = f*f*(3.0-2.0*f);
      return mix(mix(hash(i), hash(i+vec2(1,0)), f.x),
                 mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y);
    }
    float fbm(vec2 p){
      float v = 0.0, a = 0.5;
      for(int i=0;i<5;i++){ v += a*noise(p); p = p*2.02 + 7.3; a *= 0.5; }
      return v;
    }

    void main(){
      vec2 uv = gl_FragCoord.xy / uRes;
      vec2 st = uv;
      st.x *= uRes.x / uRes.y;

      float t = uTime * 0.035;

      // domain warp: the field folds through itself as it drifts upward
      vec2 q = vec2(fbm(st*1.6 + vec2(0.0, -t*3.0)),
                    fbm(st*1.6 + vec2(4.2, -t*2.4) + 5.1));
      float f = fbm(st*2.1 + q*1.4 + vec2(0.0, -t*4.0));

      // heat pools toward the bottom of the frame
      float base = smoothstep(1.15, -0.15, uv.y);
      float heat = pow(f, 2.1) * base * 1.35;

      // a wandering warm light that follows the cursor
      vec2 m = uMouse; m.x *= uRes.x / uRes.y;
      float glow = exp(-length(st - m) * 3.4) * 0.34;
      heat += glow * (0.55 + f);

      vec3 col = vec3(0.016, 0.018, 0.030);
      col += vec3(0.55, 0.12, 0.02) * heat;
      col += vec3(1.00, 0.52, 0.14) * pow(heat, 2.6) * 0.9;
      col += vec3(1.00, 0.90, 0.70) * pow(heat, 6.0) * 0.7;

      // sparse embers riding the flow
      float cells = 26.0;
      vec2 gv = st * cells;
      vec2 id = floor(gv);
      float rnd = hash(id);
      vec2 local = fract(gv) - 0.5;
      local.y += mod(uTime * (0.10 + rnd * 0.22) + rnd * 9.0, 1.4) - 0.7;
      local.x += sin(uTime * 0.5 + rnd * 20.0) * 0.09;
      float d = length(local);
      float ember = smoothstep(0.055, 0.0, d) * step(0.90, rnd) * base;
      col += vec3(1.0, 0.55, 0.2) * ember * 1.6;

      float vig = smoothstep(1.35, 0.25, length(uv - 0.5) * 1.7);
      col *= mix(0.55, 1.0, vig);

      gl_FragColor = vec4(col, 1.0);
    }`;

  const sh = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.error(gl.getShaderInfoLog(s)); return null; }
    return s;
  };
  const vs = sh(gl.VERTEX_SHADER, VS), fs = sh(gl.FRAGMENT_SHADER, FS);
  if (!vs || !fs) return;

  const prog = gl.createProgram();
  gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const uRes = gl.getUniformLocation(prog, 'uRes');
  const uTime = gl.getUniformLocation(prog, 'uTime');
  const uMouse = gl.getUniformLocation(prog, 'uMouse');

  // Half resolution: it is a soft, blurry field, so nobody can tell.
  const SCALE = 0.55;
  function resize() {
    canvas.width = Math.max(2, Math.floor(innerWidth * SCALE));
    canvas.height = Math.max(2, Math.floor(innerHeight * SCALE));
    gl.viewport(0, 0, canvas.width, canvas.height);
  }
  addEventListener('resize', resize);
  resize();

  let mx = 0.5, my = 0.38, tmx = 0.5, tmy = 0.38;
  addEventListener('pointermove', e => {
    tmx = e.clientX / innerWidth;
    tmy = 1 - e.clientY / innerHeight;
  }, { passive: true });

  const t0 = performance.now();
  (function frame() {
    requestAnimationFrame(frame);
    mx += (tmx - mx) * 0.045;
    my += (tmy - my) * 0.045;
    gl.uniform2f(uRes, canvas.width, canvas.height);
    gl.uniform1f(uTime, (performance.now() - t0) / 1000);
    gl.uniform2f(uMouse, mx, my);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  })();
}

/* ==================================================================
   The cursor leaves a short-lived ember wake.
   ================================================================== */
export function mountTrail(id = 'trail') {
  const c = document.getElementById(id);
  if (!c || reduced || matchMedia('(hover: none)').matches) return;
  const ctx = c.getContext('2d');
  let dpr = 1, parts = [], px = null, py = null, last = performance.now();

  function resize() {
    dpr = Math.min(devicePixelRatio || 1, 2);
    c.width = Math.floor(innerWidth * dpr);
    c.height = Math.floor(innerHeight * dpr);
  }
  addEventListener('resize', resize);
  resize();

  addEventListener('pointermove', e => {
    const x = e.clientX * dpr, y = e.clientY * dpr;
    const vx = px === null ? 0 : x - px, vy = py === null ? 0 : y - py;
    px = x; py = y;
    const speed = Math.hypot(vx, vy);
    const n = Math.min(4, 1 + speed / (26 * dpr));
    for (let i = 0; i < n; i++) {
      parts.push({
        x: x + (Math.random() - 0.5) * 10 * dpr,
        y: y + (Math.random() - 0.5) * 10 * dpr,
        vx: vx * 0.10 + (Math.random() - 0.5) * 34 * dpr,
        vy: vy * 0.10 - (34 + Math.random() * 90) * dpr,
        life: 0.45 + Math.random() * 0.65, age: 0,
        r: (1 + Math.random() * 2.6) * dpr,
        hue: 18 + Math.random() * 32,
      });
    }
    if (parts.length > 420) parts.splice(0, parts.length - 420);
  }, { passive: true });

  (function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.globalCompositeOperation = 'lighter';
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.age += dt;
      if (p.age > p.life) { parts.splice(i, 1); continue; }
      const k = 1 - p.age / p.life;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vy -= 60 * dpr * dt;                       // embers rise
      p.vx *= Math.pow(0.2, dt); p.vy *= Math.pow(0.45, dt);
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 7);
      g.addColorStop(0, `hsla(${p.hue},100%,${62 + k * 30}%,${k * 0.9})`);
      g.addColorStop(1, 'hsla(20,100%,50%,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * 7, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  })(performance.now());
}
