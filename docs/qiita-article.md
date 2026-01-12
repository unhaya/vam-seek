# 1Dシークバーに絶望したので、2Dで動画をナビゲーションするライブラリを作った

## TL;DR

- 動画のシークバーを2Dサムネイルグリッドに置き換えるJSライブラリ「VAM Seek」を作りました
- **15KB**、依存ゼロ、1行で導入可能
- サーバー負荷ゼロ（クライアントサイドでフレーム抽出）

**GitHub**: https://github.com/unhaya/vam-seek
**デモ**: https://haasiy.main.jp/vam_web/deploy/lolipop/index.html

## 従来のシークバーの問題

動画サイトで「あのシーンどこだっけ？」となったとき、こんな経験ありませんか？

- シークバーを行ったり来たり
- サムネイルプレビューが小さすぎて見えない
- 結局、早送りしながら目視で探す

**1Dのシークバーでは、時間軸しか見えない。**

見たいのは「映像」なのに、なぜ1次元の線をドラッグしているのか？

## 解決策：2Dで動画を俯瞰する

VAM Seekは、動画の横に2Dサムネイルグリッドを表示します。

| 従来のシークバー | VAM Seek |
|------------------|----------|
| 1D、試行錯誤 | 2D、一目で全体把握 |
| サーバーでサムネイル生成 | クライアントサイドでCanvas抽出 |
| 重いインフラ | サーバー負荷ゼロ、15KB |
| 複雑な導入 | 1行で統合 |

## デモ

![VAM Seek Demo](https://github.com/unhaya/vam-seek/releases/download/v1.0.0/2026-01-11.114423.png)

**実際に触れるデモ**: https://haasiy.main.jp/vam_web/deploy/lolipop/index.html

## 導入方法（1行）

```html
<script src="https://cdn.jsdelivr.net/gh/unhaya/vam-seek/dist/vam-seek.js"></script>

<script>
  VAMSeek.init({
    video: document.getElementById('myVideo'),
    container: document.getElementById('seekGrid')
  });
</script>
```

これだけで、`#seekGrid` に2Dサムネイルグリッドが表示されます。

## 設定オプション

```javascript
VAMSeek.init({
  video: document.getElementById('myVideo'),
  container: document.getElementById('seekGrid'),
  columns: 3,           // グリッドの列数（デフォルト: 3）
  secondsPerCell: 5,    // 1セルあたりの秒数（デフォルト: 5）
  cacheSize: 200,       // LRUキャッシュサイズ
  onSeek: (time) => {   // シーク時のコールバック
    console.log(`Seeked to ${time}s`);
  }
});
```

## 技術的なポイント

### 1. クライアントサイドでフレーム抽出

```javascript
// Canvas APIで動画フレームを抽出
const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d');
ctx.drawImage(video, 0, 0, width, height);
```

サーバーでFFmpegを回す必要なし。ユーザーのブラウザで全て完結します。

### 2. LRUキャッシュで高速化

一度抽出したフレームはメモリにキャッシュ。同じ位置への再シークは即座に表示されます。

### 3. 60fps マーカーアニメーション

`requestAnimationFrame` で現在再生位置のマーカーを滑らかに更新。

### 4. X-continuous タイムスタンプ計算

グリッドをドラッグすると、セルをまたいで連続的にシークできます（VAMアルゴリズム）。

## 対応環境

- Chrome, Firefox, Safari, Edge（モダンブラウザ全て）
- モバイル対応
- React, Vue, vanilla JS どれでもOK

## ライセンス

- **非商用**: 無料
- **商用**: 要連絡（info@haasiy.jp）

## まとめ

1Dシークバーの時代は終わりです。

15KBのJSファイル1つで、動画のUXが劇的に変わります。

ぜひ試してみてください。フィードバック歓迎です！

**GitHub**: https://github.com/unhaya/vam-seek
**デモ**: https://haasiy.main.jp/vam_web/deploy/lolipop/index.html

---

**タグ**: `JavaScript`, `HTML5`, `video`, `フロントエンド`, `OSS`
