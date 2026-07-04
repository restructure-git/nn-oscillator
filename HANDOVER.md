# 引き継ぎ書 — nn-oscillator

作成: 2026-07-04

## 1. これは何

「n / n' 結合振動子モデル」の Claude Chat プロトタイプを、モバイルで開ける公開デモに落とし込んだもの。指示書は Claude Chat 側で起こしたもの（本リポジトリには含めていない）。他人にその場で見せることを最優先の目的とする、単一 URL の 3D 可視化アプリ。

- **リポジトリ**: `github.com/restructure-git/nn-oscillator`
- **ローカル**: `D:\projects\nn-oscillator`
- **デプロイ**: Cloudflare Pages（GitHub 連携で `master` push 自動デプロイの想定）
- **技術**: Three.js + Vite + TypeScript / 完全クライアントサイド

## 2. モデル（実装している数式）

N 個の対等な点 `x_i(t) ∈ R³` と、そのすべてと結合する 1 つの特別点 `x_{N'}(t) ∈ R³`。

- 各点固有の振動: `f_i(t)` = ノードごとに異なる 3D Lissajous
- 相手側の重み付き重心（i 番から見た）: `c_i(t) = Σ_j w_j x_j(t) / Σ_j w_j`（j は自分以外の N ノード + N'）
- N' から見た相手側は N ノード全部
- 運動方程式: `dx_i/dt = -γ ( x_i - [ (1-k) f_i + k c_i ] )`
- 陽的 Euler で 1 step 進める（`alpha = min(1, γ·Δt)` の LERP）

k=0 で各点は自分の attractor に落ち、k=1 で全員が集合の重心に呑まれる。N' の振幅・周波数は N より抑えめ（「みんなを静かに見ている」挙動）。

## 3. UI

**縦画面固定・スクロールなし** の 1 画面レイアウト:

- 上: タイトルと操作ヒント
- 中央: WebGL キャンバス（Three.js シーン）
- 下: 半透過 HUD
  - スライダー 3 本（k, N, 速度） — すべて `height: 44px`, `input[type=range]` のつまみ 28px
  - トグル 2 個（横並び）: `N の軌跡` / `N' の軌跡`
  - トグル 1 個（幅いっぱい）: `N' の軌跡を溜め続ける（消えない）`
  - `軌跡をリセット` ボタン

**タッチ操作**:
- OrbitControls: ドラッグで回転、ピンチでズーム（`controls.touches` で明示）
- 点をタップ → その点を「自己」に切替、他ノードへの結合線を表示
- タップ vs ドラッグ判定: 300ms 以内 & 10px 以内

**軌跡表示の既定**: N オフ / N' オン。「N' の軌跡が主役」との運用意図から。

## 4. 3D 描画

- `MeshStandardMaterial`（自発光付き）で球を陰影表示
- 光源 3 灯: Key（右上白）+ Fill（左下青）+ Rim（背後ピンク）
- Y=-3.2 に薄い `GridHelper` を敷いて奥行きの参照フレーム
- 選択ノードは 1.6 倍拡大＋発光強化、他は 0.55 倍暗く
- 常時表示の N'↔N 薄い青白リンク線 + 選択時の追加白線
- N' 選択時はリンク線の opacity を強調

**軌跡の 2 系統**:

| 種類 | 実装 | 長さ | 特徴 |
|---|---|---|---|
| N 軌跡 | `Line` + `LineBasicMaterial` (vertexColors) | 1400 点 | 細線、fade 0.55、既定オフ |
| N' 軌跡（rolling） | `Line2` + `LineMaterial` | 3600 点 | **太線 4.5px**、fade 0.28、既定オン |
| N' 軌跡（persistent） | `Line2` + `LineMaterial`（別インスタンス） | 上限 36000 セグメント | **フェードなし・消えない**、太さ 3.8px、既定オフ |

## 5. ファイル構成

```
nn-oscillator/
├── package.json          three@0.169 / vite@5.4 / typescript@5.6
├── tsconfig.json         strict + noUnusedLocals
├── vite.config.ts        base "./" 相対パス（Cloudflare Pages 用）
├── wrangler.jsonc        Pages 設定（assets = ./dist）
├── index.html            portrait ビューポート、HUD 構造
├── src/
│   ├── style.css         44px タッチターゲット、safe-area 対応
│   ├── physics.ts        Simulation クラス（N ノード + N'）
│   └── main.ts           Three.js シーン、軌跡、UI wiring
├── dist/                 vite build 出力（gitignore）
├── README.md             公開向け説明・デプロイ手順
└── HANDOVER.md           このファイル
```

**サイズ**: `dist/assets/index-*.js` 約 530 KB / **gzip 約 135 KB**（3秒以内目標の範囲内）。

## 6. 触るときのポイント（gotchas）

### 6.1 Line2 の内部バッファ書き換え

`LineGeometry.setPositions(points)` は毎回 `Float32Array(6 * (points.length/3 - 1))` を新規確保して interleaved buffer にする。60fps でこれを呼ぶと GC 圧が上がるので、`main.ts` の N' 軌跡・persistent 軌跡はいずれも **初期化時に 1 度だけ `setPositions` を呼び、以後は `geo.attributes.instanceStart.data.array` を直接書き換えて `data.needsUpdate = true` するだけ**。

サイズ計算に注意:
- 入力 points 配列長を `3 * (segments + 1)` にすると、内部 interleaved buffer は `6 * segments` になる。
- 以前ここを間違えて `Float32Array.set()` が RangeError を投げ、モジュール初期化中に落ちて「スライダーだけ表示される」バグを出した（コミット `06a220b` → `05accf0` で修正）。

### 6.2 LineMaterial の resolution

`LineMaterial` は screen-space 線幅を計算するため `mat.resolution.set(w, h)` が必要。`main.ts` では `nprimeTrailMaterials: LineMaterial[]` に登録して、resize イベントで一括更新している。

### 6.3 physics の同期更新

全ノードの target を「旧位置ベース」で一括計算してから位置更新している（`sim.step`）。順序依存の非対称性を避けるため。

### 6.4 processed.json 的な問題は無い

このプロジェクトは完全クライアントサイド。サーバー状態や外部依存はない。

### 6.5 Cloudflare Pages のビルド

`wrangler.jsonc` は `./dist` を静的アセット元に指定。GitHub 連携経由の自動デプロイなら Cloudflare 側で「Build command: `npm run build`, Output directory: `dist`」を指定してあるはず（未確認）。CLI からは `npx wrangler pages deploy dist --project-name nn-oscillator`（要 `wrangler login`）。

## 7. コミット履歴（新しい順）

| SHA | 内容 |
|---|---|
| `05accf0` | fix: persistent trail 初期化バッファサイズを内部レイアウトに合わせる |
| `06a220b` | N' 軌跡を溜め続けるモードを追加（上限 36000 セグメント） |
| `c75f3db` | N' 軌跡を fat line (Line2) 化：太さ 4.5px・長さ 3600・fade 0.28 |
| `b2ed0ff` | N / N' の軌跡表示を個別トグルに（既定 N オフ / N' オン） |
| `96dc2be` | N' を追加：N 個の全ノードと結合する銀色の一つの点 |
| `0e34baf` | 3D 視認性を上げる：陰影マテリアル・ライト・グリッド |
| `500ce3b` | 軌跡を長く残す（TRAIL_LEN 220→1400、fade 0.55） |
| `1a70861` | 初回コミット |

## 8. 未着手 / 発展余地

指示書由来:
- **QR コード表示**（指示書 §5 発展要件）: 自 URL を QR に。`qrcode` 系軽量ライブラリで数十行。
- **蔵本モデル（Kuramoto）による同期の可視化**（指示書 §2.4 発展要件）: 結合強度 K を上げていくと全点が自然同期する挙動。現状は結合重心緩和のみで、位相同期は再現していない。
- **`wrangler login` を通した CLI デプロイ**: 実際に成功させたのは GitHub 連携経由の想定のみ。CLI 経路は未検証。

コード品質:
- `main.ts` が 500 行超になってきた。`scene.ts` / `ui.ts` / `nprime.ts` などに分割する余地。
- bundle が 530KB → gzip 135KB。target `es2020` で Three.js の tree-shaking はほぼ効いていない（Three 本体が大きい）。もし更に軽くしたければ `three` の代わりに個別モジュール import で削れるかも。
- Line2 の `worldUnits: false` は screen-space 線幅で mobile では DPR に注意（現状は問題なさそう）。

観察された挙動の注意:
- 高 k（0.9 以上）+ 少 N（3–4）だと N' と N の全員がほぼ同じ点に張り付いて動かなくなる。仕様通りだが「壊れて見える」ことがある。
- 蓄積モードで放置しすぎると 36000 上限で凍結する（60fps で約 10 分）。速度スライダを 2.5 にしていれば実時間 4 分。

## 9. 現状の動作確認方針

```powershell
cd D:\projects\nn-oscillator
npm run dev   # http://localhost:5173 で確認
npm run build # tsc --noEmit + vite build
```

デプロイ後の実機確認は URL を Cloudflare Pages ダッシュボードで拾ってスマホでアクセス。QR 化は現状ページ内実装なし（別途）。

## 10. 頭に入れておく設計判断

- **完全対等**: モデルの N ノードには「主人公」がいない。可視化でもハイライト差はタップ選択時のみ。
- **N' は「特別だが対等の変形」**: 独立の attractor を持ち、N の重心に引かれ、N も N' に引かれる（双方向）。「みんなを見ている一つの他者」の物理的表現として意図。
- **軌跡は 2 系統併存**: rolling（過ぎ去るもの）と persistent（アトラクター形の記録）を分離。UI で明示的に切り替え。
- **表示のデフォルトは N' 主役**: 他人に「これが n' の軌跡です」と見せる場面を想定して、初手で N の細い軌跡が邪魔をしないようにしている。
