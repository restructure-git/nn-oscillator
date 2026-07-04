# n / n' Coupled Oscillators

N個の対等な点が「自分固有の振動 f_i」と「自分以外の重み付き重心 c_i」の間で緩和する結合振動子モデル。スマホで開くデモ用ページ。

## 数式

```
c_i(t) = Σ_{j≠i} w_j · x_j(t) / Σ_{j≠i} w_j
dx_i/dt = -γ ( x_i - [ (1-k)·f_i + k·c_i ] )
```

k=0 で各点は自分固有の attractor に落ち、k=1 で全点が結合の重心に呑み込まれる。

## 開発

```bash
npm install
npm run dev       # ローカル開発サーバ
npm run build     # dist/ に静的ファイルを出力
```

## Cloudflare Pages にデプロイ

`wrangler.jsonc` は `./dist` を assets ディレクトリとして指定済み。

```bash
npm run build
npx wrangler pages deploy dist --project-name nn-oscillator
```

初回は `wrangler login` が必要。以後は同じコマンドで再デプロイ。

Cloudflare ダッシュボード側で GitHub リポジトリを接続し、Build command: `npm run build` / Output directory: `dist` を指定してもよい。

## 操作

- 点をタップ → その点が「自己 n」になり、他の全点との結合線が表示される。もう一度タップで解除。
- 結合 k：0 で全員バラバラ、上げていくと同期し始める。
- N：3〜10 の点数。
- 速度：時間スケール。
- 軌跡リセット：溜まった attractor 描画を消す。

## モバイル

- 縦画面 1 画面完結、スクロールなし
- 44px タッチターゲット、`touch-action: none`
- 非表示タブ時は自動停止
- Three.js OrbitControls によるドラッグ回転・ピンチズーム
