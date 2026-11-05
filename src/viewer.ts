import {
  AmbientLight, Box3, CanvasTexture, CylinderGeometry, DirectionalLight, Group, HemisphereLight, LinearFilter, MathUtils, Mesh, MeshBasicMaterial,
  MeshStandardMaterial, NeutralToneMapping, Object3D, PCFShadowMap, PerspectiveCamera, PlaneGeometry, PMREMGenerator, Scene, SRGBColorSpace,
  Vector3, WebGLRenderer, Matrix4, Color,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
export type Ver = 'v1' | 'pixel';
const modelUrl = (id: string, _ver?: Ver) => `./models/${id}.glb`;

interface Loaded { scene: Object3D; box: Box3 }
interface Slot {
  id: string; ver: Ver; root: Group; // root: 位置/缩放；inner: 模型本体
  inner: Object3D; parts: Map<string, Mesh>; disc: Mesh; baseScale: number; height: number; t0: number; leaving?: boolean; tOut?: number;
}

const ease = (t: number) => 1 - Math.pow(1 - t, 3);
const backOut = (t: number) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };

export interface ViewerOpts { poster?: boolean; onFirstFrame?: () => void; onInteract?: () => void; onFps?: (fps: number) => void }

export class Viewer {
  renderer: WebGLRenderer; scene = new Scene(); camera = new PerspectiveCamera(30, 1, 0.1, 60);
  controls: OrbitControls; key: DirectionalLight; fill: DirectionalLight;
  private cache = new Map<string, Promise<Loaded>>();
  private loader = new GLTFLoader();
  private slots: Slot[] = [];
  private discGeo: CylinderGeometry; private discMat: MeshStandardMaterial;
  private blobTex: CanvasTexture; private blobMat: MeshBasicMaterial;
  private running = false; private visible = true; private raf = 0; private dirty = true;
  private w = 1; private h = 1; private dpr = 1; private minDpr = 0.75;
  private frameTimes: number[] = []; private lastT = 0;
  private frame = { halfW: 1.5, halfH: 1.2, cy: 0.85 };
  private camTween: { t0: number; dur: number; from: Vector3; to: Vector3; tFrom: Vector3; tTo: Vector3 } | null = null;
  private explode = 0; private explodeTarget = 0; private firstFrame = false;
  private hidden = new Set<string>();
  private keyOffset = new Vector3(-2.2, 4.2, 3.2);
  opts: ViewerOpts;

  constructor(private host: HTMLElement, opts: ViewerOpts = {}) {
    this.opts = opts;
    const canvas = document.createElement('canvas');
    canvas.setAttribute('role', 'img');
    host.appendChild(canvas);
    const isTouch = matchMedia('(pointer:coarse)').matches;
    this.renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance', preserveDrawingBuffer: !!opts.poster });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = NeutralToneMapping;
    this.renderer.toneMappingExposure = 0.95;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFShadowMap;
    this.dpr = Math.min(window.devicePixelRatio || 1, opts.poster ? 2 : isTouch ? 2 : 2);

    const pm = new PMREMGenerator(this.renderer);
    this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.5;
    pm.dispose();
    this.scene.add(new HemisphereLight(0xffffff, 0xd9d2c4, 0.35));
    this.scene.add(new AmbientLight(0xffffff, 0.12));

    this.key = new DirectionalLight(0xfff4e6, 2.2);
    const sc = this.key.shadow.camera; sc.left = -3; sc.right = 3; sc.top = 3; sc.bottom = -3; sc.near = 0.5; sc.far = 14;
    this.key.castShadow = true;
    const ms = isTouch ? 1024 : 2048; this.key.shadow.mapSize.set(ms, ms);
    this.key.shadow.radius = 5; this.key.shadow.bias = -0.0004; this.key.shadow.normalBias = 0.012;
    this.scene.add(this.key, this.key.target);
    this.fill = new DirectionalLight(0xdfe9ff, 0.7); this.fill.position.set(3, 1.5, -2); this.scene.add(this.fill);

    this.discGeo = new CylinderGeometry(1.18, 1.22, 0.07, 72); this.discGeo.translate(0, -0.035, 0);
    this.discMat = new MeshStandardMaterial({ color: 0xece8de, roughness: 0.92, metalness: 0 });
    this.blobTex = makeBlob(); this.blobMat = new MeshBasicMaterial({ map: this.blobTex, transparent: true, depthWrite: false, opacity: 0.32 });

    this.camera.position.set(2.2, 1.7, 5.4);
    this.controls = new OrbitControls(this.camera, canvas);
    const c = this.controls;
    c.enablePan = false; c.enableDamping = true; c.dampingFactor = 0.075;
    c.minDistance = 2.2; c.maxDistance = 9; c.maxPolarAngle = Math.PI * 0.495; c.minPolarAngle = 0.18;
    c.autoRotate = true; c.autoRotateSpeed = 1.6; c.rotateSpeed = 0.9; c.zoomSpeed = 0.8;
    c.target.set(0, this.frame.cy, 0);
    c.addEventListener('start', () => { this.opts.onInteract?.(); this.camTween = null; this.wake(); });
    c.addEventListener('change', () => { this.dirty = true; });

    this.loader.setMeshoptDecoder(MeshoptDecoder);
    new ResizeObserver(() => this.resize()).observe(host);
    new IntersectionObserver((e) => { this.visible = e[0].isIntersecting; if (this.visible) this.wake(); }, { threshold: 0 }).observe(host);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.wake(); });
    canvas.addEventListener('webglcontextlost', (e) => e.preventDefault());
    canvas.addEventListener('webglcontextrestored', () => this.wake());
    this.resize();
  }

  // ---------- 加载 ----------
  load(id: string, ver: Ver): Promise<Loaded> {
    const k = `${id}-${ver}`;
    let p = this.cache.get(k);
    if (!p) {
      p = this.loader.loadAsync(modelUrl(id, ver)).then((g) => {
        const scene = g.scene;
        const flat = ver === 'pixel';
        // the GLBs come straight from 3MF: Z = print-up. Figures stand on Y (rotate); reliefs already face the camera (+Z).
        if (id.endsWith('-fig')) { const rx = new Matrix4().makeRotationX(-Math.PI / 2); [...scene.children].forEach((c) => c.applyMatrix4(rx)); scene.updateMatrixWorld(true); }
        scene.traverse((o) => {
          const m = o as Mesh; if (!m.isMesh) return;
          m.castShadow = m.receiveShadow = true;
          // one shared material in the file; the filament colour lives in the part name (NN_rrggbb) -> own material per part
          const hex = /_([0-9a-f]{6})$/i.exec(m.name)?.[1];
          if (hex) { m.material = (m.material as MeshStandardMaterial).clone(); (m.material as MeshStandardMaterial).color = new Color(`#${hex}`); }
          const mat = m.material as MeshStandardMaterial;
          mat.roughness = flat ? 0.68 : 0.4; mat.metalness = 0; mat.envMapIntensity = flat ? 0.9 : 1.05;
          m.name = m.name || mat.name;
        });
        return { scene, box: new Box3().setFromObject(scene) };
      });
      this.cache.set(k, p);
    }
    return p;
  }
  preload(list: [string, Ver][]) { list.forEach(([i, v]) => { this.load(i, v).catch(() => {}); }); }

  private async makeSlot(id: string, ver: Ver, scaleRef?: number): Promise<Slot> {
    const { scene, box } = await this.load(id, ver);
    const inner = scene.clone(true);
    const root = new Group(); root.add(inner);
    const size = box.getSize(new Vector3());
    const mm = size.clone();
    const own = Math.min(0.92 / (Math.hypot(mm.x, mm.z) / 2), 1.78 / mm.y);
    const baseScale = scaleRef ?? own;
    inner.scale.setScalar(baseScale);
    const parts = new Map<string, Mesh>();
    inner.traverse((o) => { const m = o as Mesh; if (m.isMesh) { parts.set(m.name, m); m.userData.base = m.position.clone(); } });
    const disc = new Mesh(this.discGeo, this.discMat); disc.receiveShadow = true; disc.castShadow = false; disc.visible = !this.opts.poster;
    const blob = new Mesh(new PlaneGeometry(this.opts.poster ? 1.5 : 2.6, this.opts.poster ? 1.5 : 2.6), this.blobMat); blob.rotation.x = -Math.PI / 2; blob.position.y = 0.002; blob.renderOrder = -1;
    root.add(disc, blob);
    this.scene.add(root);
    return { id, ver, root, inner, parts, disc, baseScale, height: mm.y * baseScale, t0: performance.now() };
  }

  // ---------- 展示 ----------
  async show(id: string, ver: Ver, opts: { keepView?: boolean } = {}) {
    const token = ++this.token;
    this.leaveAll();
    const slot = await this.makeSlot(id, ver);
    if (token !== this.token) { this.disposeSlot(slot); return; }
    this.slots.push(slot);
    this.applyHidden(slot);
    this.frame = { halfW: this.opts.poster ? 1.0 : 1.3, halfH: Math.max(0.7, slot.height * 0.5 + 0.5), cy: slot.height * 0.5 + 0.12 };
    this.fitCamera(!opts.keepView);
    this.wake();
  }
  async compare(id: string) {
    const token = ++this.token;
    this.leaveAll();
    const [a, b] = await Promise.all([this.load(id, 'v1'), this.load(id, 'pixel')]);
    const sa = a.box.getSize(new Vector3()), sb = b.box.getSize(new Vector3());
    // 对比模式用同一个缩放比例，保持真实大小关系
    const fit = (s: Vector3) => Math.min(0.92 / (Math.hypot(s.x, s.z) / 2), 1.78 / s.y);
    const ref = Math.min(fit(sa), fit(sb));
    const [s1, s2] = await Promise.all([this.makeSlot(id, 'v1', ref), this.makeSlot(id, 'pixel', ref)]);
    if (token !== this.token) { this.disposeSlot(s1); this.disposeSlot(s2); return; }
    s1.root.position.x = -1.3; s2.root.position.x = 1.3;
    this.slots.push(s1, s2);
    this.slots.forEach((s) => this.applyHidden(s));
    const h = Math.max(s1.height, s2.height);
    this.frame = { halfW: 2.45, halfH: Math.max(0.7, h * 0.5 + 0.5), cy: h * 0.5 + 0.12 };
    this.fitCamera(false);
    this.wake();
  }
  private token = 0;

  private leaveAll() {
    const now = performance.now();
    for (const s of this.slots) { s.leaving = true; s.tOut = now; }
  }
  private disposeSlot(s: Slot) { this.scene.remove(s.root); s.root.traverse((o) => { const m = o as Mesh; if (m.isMesh && m.geometry !== this.discGeo && m.material === this.blobMat) m.geometry.dispose(); }); }

  // ---------- 控制 ----------
  setAutoRotate(on: boolean) { this.controls.autoRotate = on; this.wake(); }
  get autoRotate() { return this.controls.autoRotate; }
  setExplode(on: boolean) { this.explodeTarget = on ? 1 : 0; this.wake(); }
  setPartHidden(key: string, hide: boolean) { hide ? this.hidden.add(key) : this.hidden.delete(key); this.slots.forEach((s) => this.applyHidden(s)); this.wake(); }
  setHidden(keys: Set<string>) { this.hidden = new Set(keys); this.slots.forEach((s) => this.applyHidden(s)); this.wake(); }
  resetHidden() { this.hidden.clear(); this.slots.forEach((s) => this.applyHidden(s)); this.wake(); }
  private applyHidden(s: Slot) { s.parts.forEach((m, k) => { const hex = k.includes('_') ? k.split('_').pop()! : k; m.visible = !this.hidden.has(k) && !this.hidden.has(hex); }); }
  resetView() {
    const d = this.fitDistance();
    const dir = new Vector3(0.38, 0.3, 1).normalize();
    this.tweenCamera(new Vector3(0, this.frame.cy, 0).addScaledVector(dir, d), new Vector3(0, this.frame.cy, 0));
  }
  private fitDistance() {
    const vf = MathUtils.degToRad(this.camera.fov); const aspect = this.w / this.h;
    const hf = 2 * Math.atan(Math.tan(vf / 2) * aspect);
    const dV = this.frame.halfH / Math.tan(vf / 2), dH = this.frame.halfW / Math.tan(hf / 2);
    return Math.max(dV, dH) * 1.04 + 0.5; // +深度余量，避免透视裁切
  }
  private fitCamera(snap: boolean) {
    const d = this.fitDistance();
    this.controls.maxDistance = d * 2.2; this.controls.minDistance = Math.min(2.2, d * 0.4);
    if (snap) this.resetView();
    else {
      const t = new Vector3(0, this.frame.cy, 0);
      const dir = this.camera.position.clone().sub(this.controls.target).normalize();
      this.tweenCamera(t.clone().addScaledVector(dir, d), t);
    }
  }
  private tweenCamera(to: Vector3, tTo: Vector3) {
    this.camTween = { t0: performance.now(), dur: 650, from: this.camera.position.clone(), to, tFrom: this.controls.target.clone(), tTo };
    this.wake();
  }

  // ---------- 渲染循环 ----------
  private resize() {
    const r = this.host.getBoundingClientRect();
    this.w = Math.max(2, Math.round(r.width)); this.h = Math.max(2, Math.round(r.height));
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setSize(this.w, this.h, false);
    this.camera.aspect = this.w / this.h; this.camera.updateProjectionMatrix();
    this.fitCamera(false);
    this.dirty = true; this.wake();
  }
  wake() { this.dirty = true; if (!this.running && this.visible && !document.hidden) { this.running = true; this.lastT = 0; this.raf = requestAnimationFrame(this.tick); } }
  private needsContinuous() {
    return this.controls.autoRotate || !!this.camTween || this.slots.some((s) => s.leaving || performance.now() - s.t0 < 900) ||
      Math.abs(this.explode - this.explodeTarget) > 0.002 || this.controlsMoving;
  }
  private controlsMoving = false;
  private tick = (now: number) => {
    this.raf = 0;
    if (!this.visible || document.hidden) { this.running = false; return; }
    const dt = this.lastT ? Math.min(0.05, (now - this.lastT) / 1000) : 0.016; this.lastT = now;
    // 相机补间
    if (this.camTween) {
      const k = Math.min(1, (now - this.camTween.t0) / this.camTween.dur); const e = 1 - Math.pow(1 - k, 3);
      this.camera.position.lerpVectors(this.camTween.from, this.camTween.to, e);
      this.controls.target.lerpVectors(this.camTween.tFrom, this.camTween.tTo, e);
      if (k >= 1) this.camTween = null;
    } else this.controls.target.y += (this.frame.cy - this.controls.target.y) * 0.1;
    this.controlsMoving = this.controls.update(dt) as unknown as boolean || false;
    // 光源跟着相机方位走：始终是“摄影师的灯”，旋转时受光面稳定
    const az = Math.atan2(this.camera.position.x - this.controls.target.x, this.camera.position.z - this.controls.target.z);
    this.key.position.copy(this.keyOffset).applyAxisAngle(UP, az); this.key.target.position.set(0, 0.6, 0); this.key.target.updateMatrixWorld();
    this.fill.position.set(3, 1.5, -2).applyAxisAngle(UP, az);
    // 出入场动画
    for (let i = this.slots.length - 1; i >= 0; i--) {
      const s = this.slots[i];
      if (s.leaving) {
        const k = Math.min(1, (now - (s.tOut as number)) / 200); const sc = 1 - ease(k);
        s.root.scale.setScalar(Math.max(0.001, sc)); s.root.position.y = -0.1 * ease(k);
        if (k >= 1) { this.scene.remove(s.root); this.slots.splice(i, 1); }
      } else {
        const k = Math.min(1, (now - s.t0) / 700);
        s.root.scale.setScalar(Math.max(0.001, 0.2 + 0.8 * backOut(k)));
      }
    }
    // 拆分
    this.explode += (this.explodeTarget - this.explode) * Math.min(1, dt * 7);
    if (Math.abs(this.explode - this.explodeTarget) < 0.002) this.explode = this.explodeTarget;
    for (const s of this.slots) this.applyExplode(s);

    if (this.dirty || this.needsContinuous()) { this.renderer.render(this.scene, this.camera); this.dirty = false; this.trackFps(now); if (!this.firstFrame) { this.firstFrame = true; this.opts.onFirstFrame?.(); } }
    if (this.needsContinuous() || this.dirty) this.raf = requestAnimationFrame(this.tick); else { this.running = false; this.frameTimes.length = 0; }
  };
  private applyExplode(s: Slot) {
    const keys = [...s.parts.keys()]; const n = keys.length; const e = ease(this.explode);
    keys.forEach((k, i) => {
      const m = s.parts.get(k) as Mesh;
      // 沿“镜头前方 + 向上”按颜色分层错开，露出各颜色零件如何嵌合
      const t = (i - (n - 1) / 2) / Math.max(1, n - 1);
      const base = m.userData.base as Vector3; const sc = 1 / (s.inner.scale.x || 1);
      m.position.set(base.x + t * 0.55 * e * sc, base.y + i * 0.09 * e * sc, base.z + (i * 0.5 - (n - 1) * 0.25) * e * sc);
    });
  }
  private trackFps(now: number) {
    this.frameTimes.push(now); if (this.frameTimes.length > 40) this.frameTimes.shift();
    if (this.frameTimes.length === 40 && !this.opts.poster) {
      const avg = (this.frameTimes[39] - this.frameTimes[0]) / 39;
      this.opts.onFps?.(1000 / avg);
      if (avg > 24 && this.dpr > this.minDpr && this.controls.autoRotate) { this.dpr = Math.max(this.minDpr, this.dpr - 0.25); this.frameTimes.length = 0; this.resize(); }
    }
  }
  get ready() { return this.firstFrame; }
  renderNow() { this.renderer.render(this.scene, this.camera); }
}

const UP = new Vector3(0, 1, 0);
function makeBlob() {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d') as CanvasRenderingContext2D;
  const grd = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  grd.addColorStop(0, 'rgba(60,45,30,0.85)'); grd.addColorStop(0.45, 'rgba(60,45,30,0.28)'); grd.addColorStop(1, 'rgba(60,45,30,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  const t = new CanvasTexture(c); t.minFilter = LinearFilter; t.colorSpace = SRGBColorSpace; return t;
}
