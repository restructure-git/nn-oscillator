import {
  AmbientLight,
  BufferAttribute,
  BufferGeometry,
  Color,
  DirectionalLight,
  GridHelper,
  Line,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Raycaster,
  Scene,
  SphereGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import { MAX_N, NPRIME_ID, Simulation, type Node } from "./physics";

const TRAIL_LEN = 1400;
const TRAIL_FADE_POWER = 0.55;
const BG_COLOR = 0x05050a;

// ---------- DOM ----------
const canvas = document.querySelector<HTMLCanvasElement>("#stage")!;
const kSlider = document.querySelector<HTMLInputElement>("#k-slider")!;
const nSlider = document.querySelector<HTMLInputElement>("#n-slider")!;
const speedSlider = document.querySelector<HTMLInputElement>("#speed-slider")!;
const kVal = document.querySelector<HTMLSpanElement>("#k-val")!;
const nVal = document.querySelector<HTMLSpanElement>("#n-val")!;
const speedVal = document.querySelector<HTMLSpanElement>("#speed-val")!;
const resetBtn = document.querySelector<HTMLButtonElement>("#reset-btn")!;
const toggleNTrailBtn = document.querySelector<HTMLButtonElement>(
  "#toggle-n-trail"
)!;
const toggleNPrimeTrailBtn = document.querySelector<HTMLButtonElement>(
  "#toggle-nprime-trail"
)!;

// 軌跡表示状態（既定: N オフ / N' オン。N' の軌跡が主役）
let showNTrail = false;
let showNPrimeTrail = true;

// ---------- Renderer / Scene / Camera ----------
const renderer = new WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: "high-performance",
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(BG_COLOR, 1);

const scene = new Scene();
const camera = new PerspectiveCamera(50, 1, 0.1, 100);
camera.position.set(4.5, 3.5, 6.5);
camera.lookAt(0, 0, 0);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 3;
controls.maxDistance = 18;
controls.enablePan = false;
controls.rotateSpeed = 0.7;
controls.autoRotate = false;
controls.touches = {
  ONE: 0, // ROTATE
  TWO: 2, // DOLLY_PAN → ピンチズーム
};

// ---------- Lighting (spheres の 3D 陰影用) ----------
scene.add(new AmbientLight(0xffffff, 0.35));

const keyLight = new DirectionalLight(0xffffff, 1.0);
keyLight.position.set(6, 8, 5);
scene.add(keyLight);

const fillLight = new DirectionalLight(0x8fa8ff, 0.35);
fillLight.position.set(-4, -2, 3);
scene.add(fillLight);

const rimLight = new DirectionalLight(0xff9fbf, 0.25);
rimLight.position.set(0, -4, -6);
scene.add(rimLight);

// ---------- 空間参照（薄いグリッドで奥行きを見せる）----------
const grid = new GridHelper(8, 8, 0x2a2a45, 0x1a1a2a);
grid.position.y = -3.2;
(grid.material as LineBasicMaterial).transparent = true;
(grid.material as LineBasicMaterial).opacity = 0.35;
scene.add(grid);

// ---------- Simulation ----------
const sim = new Simulation(parseInt(nSlider.value, 10));

// ---------- Visual: nodes ----------
interface NodeVisual {
  mesh: Mesh<SphereGeometry, MeshStandardMaterial>;
  trailGeo: BufferGeometry;
  trailPositions: Float32Array;
  trailColors: Float32Array;
  trailLine: Line;
  baseColor: Color;
  history: Vector3[];
}

const nodeGroup = scene;
const visuals: NodeVisual[] = [];

const sharedSphereGeo = new SphereGeometry(0.13, 24, 16);
const nprimeSphereGeo = new SphereGeometry(0.22, 32, 20);
const bgColor = new Color(BG_COLOR);

function hueToColor(h: number): Color {
  return new Color().setHSL(h, 0.65, 0.62);
}

interface VisualStyle {
  baseColor: Color;
  emissive: Color;
  emissiveIntensity: number;
  roughness: number;
  metalness: number;
  geo: SphereGeometry;
}

function createVisual(node: Node, style: VisualStyle): NodeVisual {
  const baseColor = style.baseColor;
  const mesh = new Mesh(
    style.geo,
    new MeshStandardMaterial({
      color: baseColor,
      emissive: style.emissive.clone(),
      emissiveIntensity: style.emissiveIntensity,
      roughness: style.roughness,
      metalness: style.metalness,
    })
  );
  mesh.position.copy(node.position);
  mesh.userData.nodeId = node.id;
  nodeGroup.add(mesh);

  const trailPositions = new Float32Array(TRAIL_LEN * 3);
  const trailColors = new Float32Array(TRAIL_LEN * 3);
  for (let i = 0; i < TRAIL_LEN; i++) {
    trailPositions[i * 3 + 0] = node.position.x;
    trailPositions[i * 3 + 1] = node.position.y;
    trailPositions[i * 3 + 2] = node.position.z;
  }

  const trailGeo = new BufferGeometry();
  trailGeo.setAttribute("position", new BufferAttribute(trailPositions, 3));
  trailGeo.setAttribute("color", new BufferAttribute(trailColors, 3));
  const trailMat = new LineBasicMaterial({ vertexColors: true });
  const trailLine = new Line(trailGeo, trailMat);
  nodeGroup.add(trailLine);

  const history: Vector3[] = [];
  for (let i = 0; i < TRAIL_LEN; i++) {
    history.push(node.position.clone());
  }

  return {
    mesh,
    trailGeo,
    trailPositions,
    trailColors,
    trailLine,
    baseColor,
    history,
  };
}

function disposeVisual(v: NodeVisual): void {
  nodeGroup.remove(v.mesh);
  nodeGroup.remove(v.trailLine);
  v.mesh.material.dispose();
  v.trailGeo.dispose();
  (v.trailLine.material as LineBasicMaterial).dispose();
}

function nStyleFor(node: Node): VisualStyle {
  const c = hueToColor(node.hue);
  return {
    baseColor: c,
    emissive: c,
    emissiveIntensity: 0.35,
    roughness: 0.45,
    metalness: 0.15,
    geo: sharedSphereGeo,
  };
}

const NPRIME_BASE = new Color(0xdde3ff);
const NPRIME_EMISSIVE = new Color(0x6a7ab8);

function nprimeStyle(): VisualStyle {
  return {
    baseColor: NPRIME_BASE.clone(),
    emissive: NPRIME_EMISSIVE,
    emissiveIntensity: 0.55,
    roughness: 0.22,
    metalness: 0.7,
    geo: nprimeSphereGeo,
  };
}

function syncVisualsToSim(): void {
  while (visuals.length < sim.nodes.length) {
    const node = sim.nodes[visuals.length];
    const v = createVisual(node, nStyleFor(node));
    v.trailLine.visible = showNTrail;
    visuals.push(v);
  }
  while (visuals.length > sim.nodes.length) {
    const v = visuals.pop()!;
    disposeVisual(v);
  }
}

// N' の visual は 1 つだけ、resize では作り直さない
const nprimeVisual: NodeVisual = createVisual(sim.nprime, nprimeStyle());

function resetTrails(): void {
  for (let i = 0; i < visuals.length; i++) {
    const v = visuals[i];
    const p = sim.nodes[i].position;
    for (let j = 0; j < TRAIL_LEN; j++) {
      v.history[j].copy(p);
    }
  }
  const np = sim.nprime.position;
  for (let j = 0; j < TRAIL_LEN; j++) {
    nprimeVisual.history[j].copy(np);
  }
}

// ---------- Coupling lines (selected node view) ----------
// 選択された点から、他の全ノード(N + N')へ引く線
const couplingGeo = new BufferGeometry();
const couplingPositions = new Float32Array((MAX_N + 1) * 2 * 3);
couplingGeo.setAttribute("position", new BufferAttribute(couplingPositions, 3));
const couplingMat = new LineBasicMaterial({
  color: 0xffffff,
  transparent: true,
  opacity: 0.4,
});
const couplingLines = new LineSegments(couplingGeo, couplingMat);
couplingLines.visible = false;
scene.add(couplingLines);

// ---------- Persistent N' ↔ N links ----------
// N' は常時 N 全部と繋がっている（薄い線で表示）
const linkGeo = new BufferGeometry();
const linkPositions = new Float32Array(MAX_N * 2 * 3);
linkGeo.setAttribute("position", new BufferAttribute(linkPositions, 3));
const linkMat = new LineBasicMaterial({
  color: 0xb0c4ff,
  transparent: true,
  opacity: 0.22,
});
const linkLines = new LineSegments(linkGeo, linkMat);
scene.add(linkLines);

// ---------- Selection ----------
let selectedId: number | null = null;

function setSelected(id: number | null): void {
  selectedId = id;
  couplingLines.visible = id !== null;
}

// ---------- Tap vs drag detection ----------
const raycaster = new Raycaster();
raycaster.params.Line = { threshold: 0.15 };
const pointerNdc = new Vector2();
let downX = 0;
let downY = 0;
let downT = 0;

canvas.addEventListener("pointerdown", (e) => {
  downX = e.clientX;
  downY = e.clientY;
  downT = performance.now();
});

canvas.addEventListener("pointerup", (e) => {
  const dt = performance.now() - downT;
  const dx = e.clientX - downX;
  const dy = e.clientY - downY;
  if (dt > 300 || dx * dx + dy * dy > 100) return;

  const rect = canvas.getBoundingClientRect();
  pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  pointerNdc.y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
  raycaster.setFromCamera(pointerNdc, camera);
  const meshes = visuals.map((v) => v.mesh);
  meshes.push(nprimeVisual.mesh);
  const hits = raycaster.intersectObjects(meshes, false);
  if (hits.length > 0) {
    const nodeId = hits[0].object.userData.nodeId as number;
    if (selectedId === nodeId) {
      setSelected(null);
    } else {
      setSelected(nodeId);
    }
  } else {
    setSelected(null);
  }
});

// ---------- Resize ----------
function resize(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);
resize();

// ---------- Sliders ----------
let coupling = parseFloat(kSlider.value);
let speed = parseFloat(speedSlider.value);

kSlider.addEventListener("input", () => {
  coupling = parseFloat(kSlider.value);
  kVal.textContent = coupling.toFixed(2);
});
speedSlider.addEventListener("input", () => {
  speed = parseFloat(speedSlider.value);
  speedVal.textContent = speed.toFixed(2);
});
nSlider.addEventListener("input", () => {
  const n = parseInt(nSlider.value, 10);
  nVal.textContent = String(n);
  sim.resize(n);
  syncVisualsToSim();
  if (selectedId !== null && selectedId >= sim.nodes.length) {
    setSelected(null);
  }
});
resetBtn.addEventListener("click", resetTrails);

function applyTrailVisibility(): void {
  for (const v of visuals) v.trailLine.visible = showNTrail;
  nprimeVisual.trailLine.visible = showNPrimeTrail;
  toggleNTrailBtn.classList.toggle("on", showNTrail);
  toggleNPrimeTrailBtn.classList.toggle("on", showNPrimeTrail);
}

toggleNTrailBtn.addEventListener("click", () => {
  showNTrail = !showNTrail;
  if (showNTrail) {
    // 再表示時は現在位置で塗りつぶして「昔の残像」を出さない
    for (let i = 0; i < visuals.length; i++) {
      const p = sim.nodes[i].position;
      for (let j = 0; j < TRAIL_LEN; j++) visuals[i].history[j].copy(p);
    }
  }
  applyTrailVisibility();
});

toggleNPrimeTrailBtn.addEventListener("click", () => {
  showNPrimeTrail = !showNPrimeTrail;
  if (showNPrimeTrail) {
    const np = sim.nprime.position;
    for (let j = 0; j < TRAIL_LEN; j++) nprimeVisual.history[j].copy(np);
  }
  applyTrailVisibility();
});

// ---------- Initial sync ----------
syncVisualsToSim();
applyTrailVisibility();
kVal.textContent = coupling.toFixed(2);
nVal.textContent = String(sim.nodes.length);
speedVal.textContent = speed.toFixed(2);

// ---------- Update helpers ----------
function updateTrail(v: NodeVisual, pos: Vector3): void {
  const hist = v.history;
  // shift: index 0 が最古、末尾が最新
  const oldest = hist[0];
  for (let i = 0; i < hist.length - 1; i++) {
    hist[i] = hist[i + 1];
  }
  oldest.copy(pos);
  hist[hist.length - 1] = oldest;

  const base = v.baseColor;
  for (let i = 0; i < hist.length; i++) {
    const p = hist[i];
    v.trailPositions[i * 3 + 0] = p.x;
    v.trailPositions[i * 3 + 1] = p.y;
    v.trailPositions[i * 3 + 2] = p.z;

    // 古いほど背景に溶かす（透明の代替として背景色に lerp）
    const age = i / (hist.length - 1); // 0 = 最古, 1 = 最新
    const t = Math.pow(age, TRAIL_FADE_POWER);
    v.trailColors[i * 3 + 0] = bgColor.r + (base.r - bgColor.r) * t;
    v.trailColors[i * 3 + 1] = bgColor.g + (base.g - bgColor.g) * t;
    v.trailColors[i * 3 + 2] = bgColor.b + (base.b - bgColor.b) * t;
  }
  (v.trailGeo.attributes.position as BufferAttribute).needsUpdate = true;
  (v.trailGeo.attributes.color as BufferAttribute).needsUpdate = true;
}

function applyStyleToVisual(
  v: NodeVisual,
  isSel: boolean,
  isOther: boolean,
  baseIntensity: number,
  selIntensity: number,
  dimIntensity: number
): void {
  const mat = v.mesh.material;
  if (isSel) {
    mat.color.copy(v.baseColor).multiplyScalar(1.2);
    mat.emissive.copy(v.baseColor);
    mat.emissiveIntensity = selIntensity;
    v.mesh.scale.setScalar(1.6);
  } else if (isOther) {
    mat.color.copy(v.baseColor).multiplyScalar(0.55);
    mat.emissive.copy(v.baseColor);
    mat.emissiveIntensity = dimIntensity;
    v.mesh.scale.setScalar(1.0);
  } else {
    mat.color.copy(v.baseColor);
    mat.emissive.copy(v.baseColor);
    mat.emissiveIntensity = baseIntensity;
    v.mesh.scale.setScalar(1.0);
  }
}

function updateSelectionVisuals(): void {
  const nprimeSelected = selectedId === NPRIME_ID;

  for (let i = 0; i < visuals.length; i++) {
    const v = visuals[i];
    const isSel = selectedId === sim.nodes[i].id;
    const isOther = selectedId !== null && !isSel;
    applyStyleToVisual(v, isSel, isOther, 0.35, 0.75, 0.15);
  }

  // N' 自身は「選択時は光る／N が選ばれた時は少しだけ暗く」
  applyStyleToVisual(
    nprimeVisual,
    nprimeSelected,
    selectedId !== null && !nprimeSelected,
    0.55,
    1.0,
    0.3
  );
  // N' は元々大きいので選択時のスケールを整える
  nprimeVisual.mesh.scale.setScalar(nprimeSelected ? 1.35 : 1.0);

  // 常時表示の N' ↔ N リンク
  const np = sim.nprime.position;
  let lptr = 0;
  for (let i = 0; i < sim.nodes.length; i++) {
    const p = sim.nodes[i].position;
    linkPositions[lptr++] = np.x;
    linkPositions[lptr++] = np.y;
    linkPositions[lptr++] = np.z;
    linkPositions[lptr++] = p.x;
    linkPositions[lptr++] = p.y;
    linkPositions[lptr++] = p.z;
  }
  for (; lptr < linkPositions.length; lptr++) linkPositions[lptr] = 0;
  linkGeo.setDrawRange(0, sim.nodes.length * 2);
  (linkGeo.attributes.position as BufferAttribute).needsUpdate = true;
  // N' 選択時は N' 側リンクを一段明るく
  linkMat.opacity = nprimeSelected ? 0.55 : 0.22;

  // 選択された時のみ表示される coupling line
  if (selectedId === null) {
    couplingLines.visible = false;
    return;
  }
  couplingLines.visible = true;

  // 選択された点の位置と、その相手側の点のリスト
  let selPos: Vector3;
  let others: Vector3[];
  if (nprimeSelected) {
    selPos = np;
    others = sim.nodes.map((n) => n.position);
  } else {
    const selIdx = sim.nodes.findIndex((n) => n.id === selectedId);
    if (selIdx < 0) {
      couplingLines.visible = false;
      return;
    }
    selPos = sim.nodes[selIdx].position;
    others = [];
    for (let j = 0; j < sim.nodes.length; j++) {
      if (j !== selIdx) others.push(sim.nodes[j].position);
    }
    others.push(np); // 選択された N は N' とも繋がっている
  }

  let ptr = 0;
  for (const op of others) {
    couplingPositions[ptr++] = selPos.x;
    couplingPositions[ptr++] = selPos.y;
    couplingPositions[ptr++] = selPos.z;
    couplingPositions[ptr++] = op.x;
    couplingPositions[ptr++] = op.y;
    couplingPositions[ptr++] = op.z;
  }
  for (; ptr < couplingPositions.length; ptr++) couplingPositions[ptr] = 0;
  couplingGeo.setDrawRange(0, others.length * 2);
  (couplingGeo.attributes.position as BufferAttribute).needsUpdate = true;
}

// ---------- Loop ----------
let lastT = performance.now();
let paused = false;

document.addEventListener("visibilitychange", () => {
  paused = document.hidden;
  if (!paused) lastT = performance.now();
});

function frame(): void {
  requestAnimationFrame(frame);
  if (paused) return;

  const now = performance.now();
  let dt = (now - lastT) / 1000;
  lastT = now;
  if (dt > 0.1) dt = 0.1;

  sim.step(dt, coupling, speed);

  for (let i = 0; i < visuals.length; i++) {
    const p = sim.nodes[i].position;
    visuals[i].mesh.position.copy(p);
    if (showNTrail) updateTrail(visuals[i], p);
  }
  const np = sim.nprime.position;
  nprimeVisual.mesh.position.copy(np);
  if (showNPrimeTrail) updateTrail(nprimeVisual, np);
  updateSelectionVisuals();

  controls.update();
  renderer.render(scene, camera);
}

frame();
