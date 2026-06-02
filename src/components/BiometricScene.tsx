"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

type Mode = "field" | "prism" | "nebula" | "lattice";

const MODES: { id: Mode; name: string; tag: string }[] = [
  { id: "field",   name: "Aura Field", tag: "particle shell" },
  { id: "prism",   name: "Spectral Prism", tag: "rotating icosa" },
  { id: "nebula",  name: "Nebula", tag: "FBM volume" },
  { id: "lattice", name: "Crystal Lattice", tag: "shader inst" },
];

// =============================================================================
// Vertex shaders
// =============================================================================
const VS_FIELD = /* glsl */ `
attribute float a_size;
attribute vec3 a_color;
varying vec3 v_color;
varying float v_dist;
uniform float u_time;
uniform float u_level;
uniform float u_bass;
void main() {
  v_color = a_color;
  vec3 p = position;
  // gentle float drift
  p.x += sin(u_time*0.4 + a_size*5.0) * 0.1;
  p.y += cos(u_time*0.3 + a_size*3.7) * 0.1;
  p.z += sin(u_time*0.2 + a_size*7.1) * 0.1;
  v_dist = length(p);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = a_size * (300.0 / -mv.z) * (1.0 + u_bass*1.5);
  gl_Position = projectionMatrix * mv;
}
`;

const FS_FIELD = /* glsl */ `
precision highp float;
varying vec3 v_color;
varying float v_dist;
uniform float u_time;
uniform float u_level;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  if (d > 0.5) discard;
  float falloff = smoothstep(0.5, 0.0, d);
  vec3 col = v_color * falloff;
  col += vec3(0.2, 0.05, 0.4) * u_level * 0.4;
  gl_FragColor = vec4(col, falloff * 0.85);
}
`;

const VS_PRISM = /* glsl */ `
varying vec3 v_normal;
varying vec3 v_pos;
void main() {
  v_normal = normalize(normalMatrix * normal);
  v_pos = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FS_PRISM = /* glsl */ `
precision highp float;
varying vec3 v_normal;
varying vec3 v_pos;
uniform float u_time;
uniform float u_bass;
uniform float u_treble;
uniform float u_level;
// HSV → RGB
vec3 hsv(float h,float s,float v){return v*(0.5+0.5*cos(6.283*(h+vec3(0.0,0.33,0.67))))*mix(0.7,1.0,s);}

void main() {
  vec3 n = normalize(v_normal);
  vec3 view = vec3(0.0,0.0,1.0);
  float fres = pow(1.0 - max(dot(n,view),0.0), 2.0);
  float hue = fract(u_time*0.06 + v_pos.y*0.2 + u_treble*0.3);
  vec3 base = hsv(hue, 0.7, 1.0);
  vec3 col = base * (0.4 + fres*0.8) + base * u_bass * 0.6;
  // facet edges
  float edges = pow(1.0 - abs(n.z), 6.0);
  col += vec3(1.0) * edges * (0.2 + u_level*0.4);
  gl_FragColor = vec4(col, 1.0);
}
`;

const VS_NEBULA = /* glsl */ `
varying vec2 v_uv;
varying vec3 v_pos;
void main() {
  v_uv = uv;
  v_pos = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FS_NEBULA = /* glsl */ `
precision highp float;
varying vec2 v_uv;
varying vec3 v_pos;
uniform float u_time;
uniform float u_bass;
uniform float u_mid;
uniform float u_level;

float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float noise(vec2 p){vec2 i=floor(p);vec2 f=fract(p);vec2 u=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),u.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x),u.y);}
float fbm(vec2 p){float v=0.0;float a=0.5;
  for(int i=0;i<6;i++){v+=a*noise(p);p*=2.02;a*=0.5;}return v;}
vec3 hsv(float h,float s,float v){return v*(0.5+0.5*cos(6.283*(h+vec3(0.0,0.33,0.67))))*mix(0.7,1.0,s);}

void main() {
  vec2 uv = v_uv - 0.5;
  uv.x *= 1.6;
  float t = u_time * 0.05;
  vec2 q = vec2(fbm(uv*3.0 + t), fbm(uv*3.0 + vec2(3.7,1.2) + t*0.8));
  vec2 r = vec2(fbm(uv*3.0 + 2.0*q + vec2(1.7,9.2) + t*0.5),
                fbm(uv*3.0 + 2.0*q + vec2(8.3,2.8) + t*0.6));
  float f = fbm(uv*3.0 + 2.0*r);
  float hue = fract(t*1.2 + r.x*0.6 + u_mid*0.4);
  vec3 col = hsv(hue, 0.7, pow(f, 1.4));
  col += vec3(0.3, 0.05, 0.5) * u_bass * 0.5 * smoothstep(0.0, 0.5, f);
  col += vec3(0.05, 0.3, 0.5) * u_treble * 0.4 * (1.0 - smoothstep(0.0, 0.5, f));
  col *= 1.0 + u_level * 0.6;
  gl_FragColor = vec4(col, 1.0);
}
`;

const VS_LATTICE = /* glsl */ `
attribute float a_offset;
varying float v_off;
varying vec3 v_pos;
void main() {
  v_off = a_offset;
  v_pos = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FS_LATTICE = /* glsl */ `
precision highp float;
varying float v_off;
varying vec3 v_pos;
uniform float u_time;
uniform float u_bass;
uniform float u_treble;
uniform float u_level;

vec3 hsv(float h,float s,float v){return v*(0.5+0.5*cos(6.283*(h+vec3(0.0,0.33,0.67))))*mix(0.7,1.0,s);}

void main() {
  float hue = fract(v_off + u_time*0.04);
  vec3 col = hsv(hue, 0.8, 1.0);
  // distance to camera
  float d = length(v_pos);
  float pulse = sin(d*3.0 - u_time*2.0) * 0.5 + 0.5;
  col *= 0.5 + pulse*0.5;
  col *= 1.0 + u_bass*0.6;
  col += vec3(1.0, 0.3, 0.9) * u_treble * 0.3 * pulse;
  gl_FragColor = vec4(col, 1.0);
}
`;

// =============================================================================
// Component
// =============================================================================

export default function BiometricScene() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const audioRef = useRef<{
    ctx: AudioContext;
    analyser: AnalyserNode;
    data: Uint8Array<ArrayBuffer>;
  } | null>(null);
  const [audioOn, setAudioOn] = useState(false);
  const [mode, setMode] = useState<Mode>("field");
  const [autoSpin, setAutoSpin] = useState(true);
  const [biometrics, setBiometrics] = useState({ hrv: 0.5, alpha: 0.3, beta: 0.2, theta: 0.4, optimal: 0 });
  const [level, setLevel] = useState(0);
  const [bass, setBass] = useState(0);
  const [mid, setMid] = useState(0);
  const [treble, setTreble] = useState(0);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const w = mount.clientWidth;
    const h = mount.clientHeight;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x06060c, 0.04);

    const camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 100);
    camera.position.set(0, 0, 5);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x06060c, 1);
    mount.appendChild(renderer.domElement);

    // -------------------------
    // Build all 4 modes
    // -------------------------
    const groups: Record<Mode, THREE.Object3D> = {
      field: new THREE.Group(),
      prism: new THREE.Group(),
      nebula: new THREE.Group(),
      lattice: new THREE.Group(),
    };

    // === field: 1500 particles on a sphere shell ===
    {
      const N = 1500;
      const positions = new Float32Array(N * 3);
      const sizes = new Float32Array(N);
      const colors = new Float32Array(N * 3);
      for (let i = 0; i < N; i++) {
        const phi = Math.acos(2 * Math.random() - 1);
        const theta = 2 * Math.PI * Math.random();
        const r = 1.6 + Math.random() * 0.6;
        positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
        positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
        positions[i * 3 + 2] = r * Math.cos(phi);
        sizes[i] = 0.5 + Math.random() * 1.5;
        // violet-magenta-cyan palette
        const t = Math.random();
        colors[i * 3] = 0.5 + 0.5 * t;
        colors[i * 3 + 1] = 0.2 + 0.4 * (1 - t);
        colors[i * 3 + 2] = 0.7 + 0.3 * (1 - t);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      g.setAttribute("a_size", new THREE.BufferAttribute(sizes, 1));
      g.setAttribute("a_color", new THREE.BufferAttribute(colors, 3));
      const m = new THREE.ShaderMaterial({
        vertexShader: VS_FIELD,
        fragmentShader: FS_FIELD,
        uniforms: {
          u_time: { value: 0 },
          u_level: { value: 0 },
          u_bass: { value: 0 },
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const points = new THREE.Points(g, m);
      groups.field.add(points);
    }

    // === prism: rotating icosahedron with shader material ===
    {
      const geo = new THREE.IcosahedronGeometry(1.4, 1);
      const mat = new THREE.ShaderMaterial({
        vertexShader: VS_PRISM,
        fragmentShader: FS_PRISM,
        uniforms: {
          u_time: { value: 0 },
          u_bass: { value: 0 },
          u_treble: { value: 0 },
          u_level: { value: 0 },
        },
      });
      const mesh = new THREE.Mesh(geo, mat);
      // wireframe outer
      const wireMat = new THREE.LineBasicMaterial({
        color: 0x7a4dff, transparent: true, opacity: 0.35,
      });
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), wireMat);
      mesh.add(edges);
      groups.prism.add(mesh);
    }

    // === nebula: a fullscreen plane with FBM shader, placed in front of camera ===
    {
      const geo = new THREE.PlaneGeometry(12, 8);
      const mat = new THREE.ShaderMaterial({
        vertexShader: VS_NEBULA,
        fragmentShader: FS_NEBULA,
        uniforms: {
          u_time: { value: 0 },
          u_bass: { value: 0 },
          u_mid: { value: 0 },
          u_level: { value: 0 },
        },
        transparent: true,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.z = -3;
      groups.nebula.add(mesh);
    }

    // === lattice: instanced icosahedrons on a 5x5x5 grid ===
    {
      const COUNT = 125;
      const geo = new THREE.IcosahedronGeometry(0.12, 0);
      const mat = new THREE.ShaderMaterial({
        vertexShader: VS_LATTICE,
        fragmentShader: FS_LATTICE,
        uniforms: {
          u_time: { value: 0 },
          u_bass: { value: 0 },
          u_treble: { value: 0 },
          u_level: { value: 0 },
        },
      });
      const offsets = new Float32Array(COUNT);
      const inst = new THREE.InstancedMesh(geo, mat, COUNT);
      const dummy = new THREE.Object3D();
      let i = 0;
      for (let x = -2; x <= 2; x++) {
        for (let y = -2; y <= 2; y++) {
          for (let z = -2; z <= 2; z++) {
            dummy.position.set(x * 0.6, y * 0.6, z * 0.6);
            dummy.updateMatrix();
            inst.setMatrixAt(i, dummy.matrix);
            offsets[i] = i / COUNT;
            i++;
          }
        }
      }
      geo.setAttribute("a_offset", new THREE.InstancedBufferAttribute(offsets, 1));
      inst.instanceMatrix.needsUpdate = true;
      groups.lattice.add(inst);
    }

    // add all groups to scene
    Object.values(groups).forEach((g) => scene.add(g));

    const setMode = (m: Mode) => {
      Object.entries(groups).forEach(([k, g]) => {
        g.visible = k === m;
      });
    };
    setMode(mode);

    // -------------------------
    // Simulated biometrics (when mic is off)
    // -------------------------
    let simTime = 0;

    // -------------------------
    // Animation loop
    // -------------------------
    const start = performance.now();
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const t = (performance.now() - start) / 1000;
      simTime += 0.016;

      // Pull audio bands if active
      let b = 0, midVal = 0, h = 0, lv = 0;
      const a = audioRef.current;
      if (a) {
        a.analyser.getByteFrequencyData(a.data);
        const d = a.data;
        const n = d.length;
        const third = Math.floor(n / 3);
        let s1 = 0, s2 = 0, s3 = 0;
        for (let i = 0; i < third; i++) s1 += d[i];
        for (let i = third; i < third * 2; i++) s2 += d[i];
        for (let i = third * 2; i < n; i++) s3 += d[i];
        b = s1 / (third * 255);
        midVal = s2 / (third * 255);
        h = s3 / (third * 255);
        let total = 0;
        for (let i = 0; i < n; i++) total += d[i];
        lv = total / (n * 255);
      } else {
        // Simulate breathing biometrics
        b = 0.25 + 0.2 * Math.sin(simTime * 0.7) + 0.1 * Math.sin(simTime * 2.3);
        midVal = 0.3 + 0.2 * Math.sin(simTime * 0.5 + 1.2);
        h = 0.15 + 0.15 * Math.sin(simTime * 1.1 + 2.4);
        lv = (b + midVal + h) / 3;
      }
      setBass(b); setMid(midVal); setTreble(h); setLevel(lv);

      // Simulated biometric indicators
      const hrv = 0.5 + 0.3 * Math.sin(simTime * 0.3);
      const alpha = Math.max(0, 0.4 + 0.3 * Math.sin(simTime * 0.8));
      const beta = Math.max(0, 0.3 + 0.2 * Math.sin(simTime * 1.4 + 0.5));
      const theta = Math.max(0, 0.2 + 0.25 * Math.sin(simTime * 0.4 + 1.0));
      let optimal = 0;
      if (hrv < 0.3) optimal = 0;
      else if (beta > 0.5) optimal = 2;
      else if (alpha > 0.6) optimal = 3;
      else if (theta > 0.4) optimal = 6;
      setBiometrics({ hrv, alpha, beta, theta, optimal });

      // Update uniforms across all groups
      Object.values(groups).forEach((g) => {
        g.traverse((obj) => {
          const mat = (obj as THREE.Mesh).material;
          if (mat && (mat as THREE.ShaderMaterial).uniforms) {
            const u = (mat as THREE.ShaderMaterial).uniforms;
            if (u.u_time) u.u_time.value = t;
            if (u.u_bass) u.u_bass.value = b;
            if (u.u_mid) u.u_mid.value = midVal;
            if (u.u_treble) u.u_treble.value = h;
            if (u.u_level) u.u_level.value = lv;
          }
        });
        if (autoSpin) g.rotation.y = t * 0.15;
        g.rotation.x = Math.sin(t * 0.2) * 0.1;
      });

      renderer.render(scene, camera);
    };
    tick();

    const onResize = () => {
      const w = mount.clientWidth, h = mount.clientHeight;
      camera.aspect = w / h; camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(mount);

    // -------------------------
    // Mouse parallax
    // -------------------------
    const onMouse = (e: MouseEvent) => {
      const rect = mount.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
      const y = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
      camera.position.x = x * 0.5;
      camera.position.y = -y * 0.5;
      camera.lookAt(0, 0, 0);
    };
    mount.addEventListener("mousemove", onMouse);

    // -------------------------
    // Update mode when prop changes
    // -------------------------
    const updateMode = (m: Mode) => setMode(m);
    (mount as unknown as { __setMode: (m: Mode) => void }).__setMode = updateMode;

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      mount.removeEventListener("mousemove", onMouse);
      mount.removeChild(renderer.domElement);
      Object.values(groups).forEach((g) => {
        g.traverse((obj) => {
          const m = obj as THREE.Mesh;
          if (m.geometry) m.geometry.dispose();
          const mat = m.material as THREE.Material | THREE.Material[] | undefined;
          if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
          else if (mat) (mat as THREE.Material).dispose();
        });
      });
      renderer.dispose();
    };
    // eslint-disable-next-line
  }, []);

  // Re-trigger mode change
  useEffect(() => {
    const mount = mountRef.current as unknown as { __setMode?: (m: Mode) => void } | null;
    if (mount?.__setMode) mount.__setMode(mode);
  }, [mode]);

  const startAudio = async () => {
    if (audioRef.current) return;
    try {
      const ctx = new (window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext)();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const src = ctx.createMediaStreamSource(stream);
      const an = ctx.createAnalyser();
      an.fftSize = 1024;
      an.smoothingTimeConstant = 0.85;
      src.connect(an);
      audioRef.current = {
        ctx,
        analyser: an,
        data: new Uint8Array(new ArrayBuffer(an.frequencyBinCount)),
      };
      setAudioOn(true);
    } catch (e) {
      console.warn("mic denied:", e);
    }
  };

  return (
    <main className="page">
      <div ref={mountRef} className="stage" />
      <aside className="hud">
        <div className="hud-head">
          <span className="tag live">●</span>
          <h1>BIOMETRIC<br/>ARSENAL</h1>
        </div>

        <section>
          <h2>Source</h2>
          {!audioOn ? (
            <button onClick={startAudio} className="enable-mic">
              ▶ ENABLE MIC
            </button>
          ) : (
            <div className="mic-pill"><span className="tag live">● MIC LIVE</span></div>
          )}
          <div className="hint">
            Without mic, the system simulates breathing biometrics.
            With mic, your voice/environment drives the field.
          </div>
        </section>

        <section>
          <h2>Mode</h2>
          <div className="mode-grid">
            {MODES.map((m) => (
              <button
                key={m.id}
                className={`mode-btn ${mode === m.id ? "active" : ""}`}
                onClick={() => setMode(m.id)}
              >
                <div className="mode-name">{m.name}</div>
                <div className="mode-tag">{m.tag}</div>
              </button>
            ))}
          </div>
        </section>

        <section>
          <h2>Bands</h2>
          <div className="bar-row">
            <span className="bar-label">BASS</span>
            <div className="bar-track"><div className="bar-fill" style={{ width: `${bass * 100}%`, background: "var(--violet)" }} /></div>
            <span className="bar-val">{bass.toFixed(2)}</span>
          </div>
          <div className="bar-row">
            <span className="bar-label">MID</span>
            <div className="bar-track"><div className="bar-fill" style={{ width: `${mid * 100}%`, background: "var(--magenta)" }} /></div>
            <span className="bar-val">{mid.toFixed(2)}</span>
          </div>
          <div className="bar-row">
            <span className="bar-label">TRE</span>
            <div className="bar-track"><div className="bar-fill" style={{ width: `${treble * 100}%`, background: "var(--cyan)" }} /></div>
            <span className="bar-val">{treble.toFixed(2)}</span>
          </div>
          <div className="bar-row">
            <span className="bar-label">LVL</span>
            <div className="bar-track"><div className="bar-fill" style={{ width: `${level * 100}%`, background: "var(--gold)" }} /></div>
            <span className="bar-val">{level.toFixed(2)}</span>
          </div>
        </section>

        <section>
          <h2>Biometrics</h2>
          {([
            { k: "hrv", l: "HRV", v: biometrics.hrv },
            { k: "alpha", l: "α", v: biometrics.alpha },
            { k: "beta", l: "β", v: biometrics.beta },
            { k: "theta", l: "θ", v: biometrics.theta },
          ] as { k: string; l: string; v: number }[]).map((row) => (
            <div key={row.k} className="bar-row">
              <span className="bar-label">{row.l}</span>
              <div className="bar-track"><div className="bar-fill" style={{ width: `${row.v * 100}%`, background: "var(--ink-d)" }} /></div>
              <span className="bar-val">{row.v.toFixed(2)}</span>
            </div>
          ))}
          <div className="opt-line">
            optimal freq: <span className="opt-num">{biometrics.optimal}</span>
          </div>
        </section>

        <section>
          <h2>Options</h2>
          <label className="opt-toggle">
            <input type="checkbox" checked={autoSpin} onChange={(e) => setAutoSpin(e.target.checked)} />
            <span>Auto-rotate</span>
          </label>
        </section>

        <div className="foot">
          <a href="https://github.com/kajica2/biometric-arsenal" target="_blank" rel="noreferrer">github</a>
          <span className="sep">·</span>
          <span>three.js + custom ShaderMaterial</span>
        </div>
      </aside>

      <style jsx>{`
        .page {
          display: grid;
          grid-template-columns: 1fr 360px;
          height: 100vh; width: 100vw;
        }
        .stage { position: relative; background: #06060c; overflow: hidden; }
        .hud {
          background: var(--bg);
          border-left: 1px solid var(--border);
          padding: 1.25rem;
          overflow-y: auto;
          font-size: 0.8rem;
        }
        .hud-head { margin-bottom: 1.25rem; }
        .hud h1 {
          font-size: 1rem; margin-top: 0.5rem; line-height: 1.1;
        }
        section { margin-bottom: 1.25rem; }
        .enable-mic {
          width: 100%; margin-bottom: 0.5rem;
          background: rgba(122, 77, 255, 0.12);
          border-color: var(--violet);
        }
        .mic-pill { margin-bottom: 0.5rem; }
        .hint {
          font-size: 0.7rem; color: var(--ink-d);
          line-height: 1.5;
        }
        .mode-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.4rem; }
        .mode-btn {
          padding: 0.6rem; text-align: left; text-transform: none;
          letter-spacing: 0;
        }
        .mode-btn.active {
          background: linear-gradient(135deg, rgba(122, 77, 255, 0.2), rgba(255, 77, 200, 0.1));
          border-color: var(--violet);
          box-shadow: 0 0 12px rgba(122, 77, 255, 0.25);
        }
        .mode-name {
          font-family: 'Cinzel', serif;
          font-size: 0.75rem;
          color: var(--ink);
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }
        .mode-tag {
          font-size: 0.65rem; color: var(--ink-d);
          margin-top: 0.15rem;
        }
        .bar-row {
          display: grid;
          grid-template-columns: 36px 1fr 38px;
          align-items: center;
          gap: 0.5rem;
          margin-bottom: 0.3rem;
        }
        .bar-label { font-size: 0.65rem; color: var(--ink-d); letter-spacing: 0.1em; }
        .bar-track {
          height: 4px; background: rgba(255, 255, 255, 0.08);
          position: relative; border-radius: 2px; overflow: hidden;
        }
        .bar-fill { height: 100%; transition: width 0.05s linear; }
        .bar-val { font-size: 0.7rem; color: var(--ink); text-align: right; }
        .opt-line {
          font-size: 0.7rem; color: var(--ink-d);
          margin-top: 0.5rem;
        }
        .opt-n { color: var(--magenta); }
        .opt-toggle {
          display: flex; align-items: center; gap: 0.5rem;
          font-size: 0.75rem; color: var(--ink);
        }
        .opt-num { color: var(--magenta); font-weight: bold; }
        .foot {
          border-top: 1px solid var(--border);
          padding-top: 0.75rem; font-size: 0.65rem;
          color: var(--ink-d);
        }
        .foot a { color: var(--ink-d); }
        .sep { margin: 0 0.4rem; }
        @media (max-width: 768px) {
          .page { grid-template-columns: 1fr; grid-template-rows: 60vh 1fr; }
          .hud { border-left: none; border-top: 1px solid var(--border); }
        }
      `}</style>
    </main>
  );
}
