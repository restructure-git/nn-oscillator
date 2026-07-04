import { Vector3 } from "three";

const MAX_N = 10;
const GAMMA = 2.4;
const NPRIME_ID = -1;

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

  const amp = new Vector3(1.2 + rand() * 0.8, 1.2 + rand() * 0.8, 1.0 + rand() * 0.8);
  const omega = new Vector3(0.35 + rand() * 0.5, 0.35 + rand() * 0.5, 0.35 + rand() * 0.5);
  const phase = new Vector3(rand() * Math.PI * 2, rand() * Math.PI * 2, rand() * Math.PI * 2);
  const center = new Vector3(r() * 0.4, r() * 0.4, r() * 0.4);

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

/**
 * N' 用の特別ノード。振幅・周波数を抑えめにして、N の重心近くに寄って
 * 「みんなを見ている一つの点」の挙動になるように調整。
 */
function makeNPrime(): Node {
  return {
    id: NPRIME_ID,
    position: new Vector3(0, 0, 0),
    center: new Vector3(0, 0, 0),
    amp: new Vector3(0.6, 0.5, 0.6),
    omega: new Vector3(0.22, 0.18, 0.25),
    phase: new Vector3(0, Math.PI / 3, Math.PI / 5),
    weight: 1.5, // N 側の centroid でも少し強めに効く
    hue: 0, // 使わない（マテリアル側で銀色に）
  };
}

export class Simulation {
  nodes: Node[] = [];
  nprime: Node = makeNPrime();
  t = 0;

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

  private ownAt(node: Node, t: number, out: Vector3): Vector3 {
    out.set(
      node.center.x + node.amp.x * Math.sin(node.omega.x * t + node.phase.x),
      node.center.y + node.amp.y * Math.sin(node.omega.y * t + node.phase.y),
      node.center.z + node.amp.z * Math.sin(node.omega.z * t + node.phase.z * 1.7)
    );
    return out;
  }

  /**
   * i 番の N ノードから見た「相手側の重み付き重心」。
   * 自分以外の N ノード + N' を含める。
   */
  private centroidForN(i: number, out: Vector3): Vector3 {
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
    // N' も相手側に含める（＝N は N' に引かれる）
    const p = this.nprime.position;
    const w = this.nprime.weight;
    out.x += w * p.x;
    out.y += w * p.y;
    out.z += w * p.z;
    wsum += w;

    if (wsum > 0) out.multiplyScalar(1 / wsum);
    return out;
  }

  /**
   * N' から見た相手側は「N ノード全部」。
   */
  private centroidForNPrime(out: Vector3): Vector3 {
    out.set(0, 0, 0);
    let wsum = 0;
    for (let j = 0; j < this.nodes.length; j++) {
      const nj = this.nodes[j];
      out.x += nj.weight * nj.position.x;
      out.y += nj.weight * nj.position.y;
      out.z += nj.weight * nj.position.z;
      wsum += nj.weight;
    }
    if (wsum > 0) out.multiplyScalar(1 / wsum);
    return out;
  }

  step(dt: number, k: number, speed: number): void {
    const effDt = dt * speed;
    this.t += effDt;

    // target をまとめて計算（旧位置ベースで同期更新）
    const targets: Vector3[] = [];
    for (let i = 0; i < this.nodes.length; i++) {
      this.ownAt(this.nodes[i], this.t, this._tmpF);
      this.centroidForN(i, this._tmpC);
      targets.push(
        new Vector3(
          (1 - k) * this._tmpF.x + k * this._tmpC.x,
          (1 - k) * this._tmpF.y + k * this._tmpC.y,
          (1 - k) * this._tmpF.z + k * this._tmpC.z
        )
      );
    }

    // N' の target
    this.ownAt(this.nprime, this.t, this._tmpF);
    this.centroidForNPrime(this._tmpC);
    const nprimeTarget = new Vector3(
      (1 - k) * this._tmpF.x + k * this._tmpC.x,
      (1 - k) * this._tmpF.y + k * this._tmpC.y,
      (1 - k) * this._tmpF.z + k * this._tmpC.z
    );

    const alpha = Math.min(1, GAMMA * effDt);
    for (let i = 0; i < this.nodes.length; i++) {
      const p = this.nodes[i].position;
      const t = targets[i];
      p.x += (t.x - p.x) * alpha;
      p.y += (t.y - p.y) * alpha;
      p.z += (t.z - p.z) * alpha;
    }
    {
      const p = this.nprime.position;
      p.x += (nprimeTarget.x - p.x) * alpha;
      p.y += (nprimeTarget.y - p.y) * alpha;
      p.z += (nprimeTarget.z - p.z) * alpha;
    }
  }
}

export { MAX_N, NPRIME_ID };
