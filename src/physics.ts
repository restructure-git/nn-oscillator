import { Vector3 } from "three";

const MAX_N = 10;
const GAMMA = 2.4;

export interface Node {
  id: number;
  position: Vector3;
  center: Vector3;
  amp: Vector3;
  omega: Vector3;
  phase: Vector3;
  weight: number;
  hue: number;
}

function seededHash(seed: number): () => number {
  let s = Math.imul(seed ^ 0x9e3779b1, 0x85ebca6b) >>> 0;
  return () => {
    s = Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) >>> 0;
    s = Math.imul(s ^ (s >>> 12), 0x297a2d39) >>> 0;
    s ^= s >>> 15;
    return ((s >>> 0) % 100000) / 100000;
  };
}

function makeNode(id: number, total: number): Node {
  const rand = seededHash(id * 1013 + 7);
  const r = () => rand() * 2 - 1;

  // 各点は「同じ構造」だが、固有の周波数・位相・振幅をもつ
  const amp = new Vector3(1.2 + rand() * 0.8, 1.2 + rand() * 0.8, 1.0 + rand() * 0.8);
  const omega = new Vector3(0.35 + rand() * 0.5, 0.35 + rand() * 0.5, 0.35 + rand() * 0.5);
  const phase = new Vector3(rand() * Math.PI * 2, rand() * Math.PI * 2, rand() * Math.PI * 2);
  const center = new Vector3(r() * 0.4, r() * 0.4, r() * 0.4);

  // 初期位置は自分の attractor 上のどこか
  const position = new Vector3(
    center.x + amp.x * Math.sin(phase.x),
    center.y + amp.y * Math.sin(phase.y),
    center.z + amp.z * Math.sin(phase.z)
  );

  const hue = (id / total + 0.05) % 1;

  return {
    id,
    position,
    center,
    amp,
    omega,
    phase,
    weight: 1.0,
    hue,
  };
}

export class Simulation {
  nodes: Node[] = [];
  t = 0;

  private _tmpTarget = new Vector3();
  private _tmpF = new Vector3();
  private _tmpC = new Vector3();

  constructor(n: number) {
    this.resize(n);
  }

  resize(n: number): void {
    n = Math.max(2, Math.min(MAX_N, Math.floor(n)));
    if (n > this.nodes.length) {
      for (let i = this.nodes.length; i < n; i++) {
        this.nodes.push(makeNode(i, MAX_N));
      }
    } else if (n < this.nodes.length) {
      this.nodes.length = n;
    }
  }

  /**
   * 各点 i の固有の f_i(t)。結合がないときに漸近する attractor 上の点。
   */
  own(i: number, t: number, out: Vector3): Vector3 {
    const n = this.nodes[i];
    out.set(
      n.center.x + n.amp.x * Math.sin(n.omega.x * t + n.phase.x),
      n.center.y + n.amp.y * Math.sin(n.omega.y * t + n.phase.y),
      n.center.z + n.amp.z * Math.sin(n.omega.z * t + n.phase.z * 1.7)
    );
    return out;
  }

  /**
   * 自分以外の重み付き重心 c_i。
   */
  private centroidExcept(i: number, out: Vector3): Vector3 {
    out.set(0, 0, 0);
    let wsum = 0;
    for (let j = 0; j < this.nodes.length; j++) {
      if (j === i) continue;
      const nj = this.nodes[j];
      out.x += nj.weight * nj.position.x;
      out.y += nj.weight * nj.position.y;
      out.z += nj.weight * nj.position.z;
      wsum += nj.weight;
    }
    if (wsum > 0) out.multiplyScalar(1 / wsum);
    return out;
  }

  /**
   * dx_i/dt = -γ ( x_i - [ (1-k) f_i + k c_i ] )
   * を陽的 Euler で 1 step 進める。
   */
  step(dt: number, k: number, speed: number): void {
    const effDt = dt * speed;
    this.t += effDt;

    // まず全点の target を先に計算（同期更新のため、centroid は旧位置ベース）
    const targets: Vector3[] = [];
    for (let i = 0; i < this.nodes.length; i++) {
      this.own(i, this.t, this._tmpF);
      this.centroidExcept(i, this._tmpC);
      this._tmpTarget.set(
        (1 - k) * this._tmpF.x + k * this._tmpC.x,
        (1 - k) * this._tmpF.y + k * this._tmpC.y,
        (1 - k) * this._tmpF.z + k * this._tmpC.z
      );
      targets.push(this._tmpTarget.clone());
    }

    const alpha = Math.min(1, GAMMA * effDt);
    for (let i = 0; i < this.nodes.length; i++) {
      const p = this.nodes[i].position;
      const t = targets[i];
      p.x += (t.x - p.x) * alpha;
      p.y += (t.y - p.y) * alpha;
      p.z += (t.z - p.z) * alpha;
    }
  }
}

export { MAX_N };
