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

import { MAX_N, Simulation, type Node } from "./physics";

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
const bgColor = new Color(BG_COLOR);

function hueToColor(h: number): Color {
  return new Color().setHSL(h, 0.65, 0.62);
}

function createVisual(node: Node): NodeVisual {
  const baseColor = hueToColor(node.hue);
  const mesh = new Mesh(
    sharedSphereGeo,
    new MeshStandardMaterial({
      color: baseColor,
      emissive: baseColor.clone(),
      emissiveIntensity: 0.35,
      roughness: 0.45,
      metalness: 0.15,
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

function syncVisualsToSim(): void {
  while (visuals.length < sim.nodes.length) {
    visuals.push(createVisual(sim.nodes[visuals.length]));
  }
  while (visuals.length > sim.nodes.length) {
    const v = visuals.pop()!;
    disposeVisual(v);
  }
}

function resetTrails(): void {
  for (let i = 0; i < visuals.length; i++) {
    const v = visuals[i];
    const p = sim.nodes[i].position;
    for (let j = 0; j < TRAIL_LEN; j++) {
      v.history[j].copy(p);
    }
  }
}

// ---------- Coupling lines (selected node view) ----------
const couplingGeo = new BufferGeometry();
const couplingPositions = new Float32Array(MAX_N * 2 * 3);
couplingGeo.setAttribute("position", new BufferAttribute(couplingPositions, 3));
const couplingMat = new LineBasicMaterial({
  color: 0xffffff,
  transparent: true,
  opacity: 0.35,
});
const couplingLines = new LineSegments(couplingGeo, couplingMat);
couplingLines.visible = false;
scene.add(couplingLines);

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
  const hits = raycaster.intersectObjects(
    visuals.map((v) => v.mesh),
    false
  );
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

// ---------- Initial sync ----------
syncVisualsToSim();
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

function updateSelectionVisuals(): void {
  for (let i = 0; i < visuals.length; i++) {
    const v = visuals[i];
    const isSel = selectedId === sim.nodes[i].id;
    const isOther = selectedId !== null && !isSel;
    const scale = isSel ? 1.8 : 1.0;
    v.mesh.scale.setScalar(scale);
    const mat = v.mesh.material;
    if (isSel) {
      mat.color.copy(v.baseColor).multiplyScalar(1.2);
      mat.emissive.copy(v.baseColor);
      mat.emissiveIntensity = 0.7;
    } else if (isOther) {
      mat.color.copy(v.baseColor).multiplyScalar(0.55);
      mat.emissive.copy(v.baseColor);
      mat.emissiveIntensity = 0.15;
    } else {
      mat.color.copy(v.baseColor);
      mat.emissive.copy(v.baseColor);
      mat.emissiveIntensity = 0.35;
    }
  }

  if (selectedId !== null) {
    const selIdx = sim.nodes.findIndex((n) => n.id === selectedId);
    if (selIdx < 0) {
      couplingLines.visible = false;
      return;
    }
    const sp = sim.nodes[selIdx].position;
    let ptr = 0;
    for (let j = 0; j < sim.nodes.length; j++) {
      if (j === selIdx) continue;
      const op = sim.nodes[j].position;
      couplingPositions[ptr++] = sp.x;
      couplingPositions[ptr++] = sp.y;
      couplingPositions[ptr++] = sp.z;
      couplingPositions[ptr++] = op.x;
      couplingPositions[ptr++] = op.y;
      couplingPositions[ptr++] = op.z;
    }
    // 使わない頂点は同一点にして描画されないように
    for (; ptr < couplingPositions.length; ptr++) couplingPositions[ptr] = 0;
    couplingGeo.setDrawRange(0, (sim.nodes.length - 1) * 2);
    (couplingGeo.attributes.position as BufferAttribute).needsUpdate = true;
  }
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
    updateTrail(visuals[i], p);
  }
  updateSelectionVisuals();

  controls.update();
  renderer.render(scene, camera);
}

frame();
