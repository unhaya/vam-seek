# 動画切り替え時のフレーム抽出改善 - 実装計画書

## 現状の問題

### 主要問題
- リストを頻繁に切り替えるとグリッド画像取得が止まってしまう
- ローディング中（フレーム抽出中）に別の動画に切り替えるとローディングが停止する
- 動画切り替え時の非同期処理の中断が正しく機能していない

### 原因分析
1. **イベントリスナーの蓄積**: `loadedmetadata`イベントリスナーが適切にクリーンアップされていない
2. **非同期処理の競合**: 複数の`generateThumbnails()`が同時実行される可能性がある
3. **中断検知の遅延**: `createExtractorVideo()`が最大10秒間、中断信号をチェックせずに待機する
4. **不完全なキャッシュ**: 抽出中断時に不完全なフレームキャッシュが残る可能性がある

## 実装目標

### 必須要件
1. ✅ 動画を頻繁に切り替えてもローディングが停止しない
2. ✅ 動画URL単位でキャッシュを管理（LRU、最大3動画）
3. ✅ 抽出中に動画を切り替えた場合、即座に処理を中断
4. ✅ 不完全な抽出のキャッシュは保存しない（完全に揃うまでキャッシュしない）
5. ✅ エラーメッセージを表示しない（堅牢でありながらUXを壊さない）

### 非機能要件
- シンプルな状態管理（複雑なフラグの組み合わせを避ける）
- ローカルファイルとリモートファイルの両方で正しく動作
- メモリリークの防止
- デバッグ可能なログ出力

## 設計方針

### 1. 単一の状態管理オブジェクト

**何をするべきか:**
```javascript
const STATE = {
    currentVideoUrl: null,        // 現在の動画URL（切り替え検知用）
    currentExtractionTask: null   // 現在実行中の抽出タスク（中断用）
};
```

**何をしないべきか:**
- ❌ 複数のフラグ（`aborted`, `generationAborted`, `isExtracting`, `isGenerating`）を使わない
- ❌ 状態の二重管理（フラグとURLの両方で管理しない）

**理由**:
- 1つの真実の情報源（Single Source of Truth）
- 状態遷移がシンプルで追跡しやすい
- レースコンディションが発生しにくい

### 2. タスクベースの中断機構

**何をするべきか:**
```javascript
class ExtractionTask {
    constructor(videoUrl) {
        this.videoUrl = videoUrl;
        this.aborted = false;
    }

    abort() {
        this.aborted = true;
    }

    isAborted() {
        return this.aborted;
    }
}
```

**何をしないべきか:**
- ❌ グローバルな`aborted`フラグを使わない
- ❌ 複数の中断方法を混在させない

**理由**:
- タスクごとに独立した中断状態を持つ
- 複数タスクが同時に存在しても混線しない
- 明示的な所有権（どのタスクが実行中か明確）

### 3. Promise連鎖による制御フロー

**何をするべきか:**
```javascript
async function selectVideo(id) {
    // 1. 前のタスクを中断
    if (STATE.currentExtractionTask) {
        STATE.currentExtractionTask.abort();
    }

    // 2. 新しいタスクを作成
    const task = new ExtractionTask(video.url);
    STATE.currentExtractionTask = task;
    STATE.currentVideoUrl = video.url;

    // 3. 動画ロード完了後に抽出開始
    video.addEventListener('loadedmetadata', async () => {
        // タスクが中断されていないことを確認
        if (!task.isAborted() && STATE.currentVideoUrl === video.url) {
            await extractFramesWithTask(task);
        }
    }, { once: true }); // 自動的にクリーンアップされる
}
```

**何をしないべきか:**
- ❌ イベントリスナーを手動で管理しない（`{ once: true }`を使う）
- ❌ ポーリングループで状態をチェックしない
- ❌ 複雑なtry-finallyでフラグをリセットしない

**理由**:
- `{ once: true }`により自動的にイベントリスナーがクリーンアップされる
- Promise連鎖により処理順序が明確
- エラーハンドリングがシンプル

### 4. LRUキャッシュの実装

**何をするべきか:**
```javascript
class FrameCache {
    constructor(maxFramesPerVideo = 200, maxVideos = 3) {
        this.caches = new Map(); // videoUrl -> { frames: Map, complete: boolean }
        this.maxFramesPerVideo = maxFramesPerVideo;
        this.maxVideos = maxVideos;
    }

    // 完全なキャッシュのみ保存
    saveComplete(videoUrl, frames) {
        if (this.caches.size >= this.maxVideos) {
            const firstKey = this.caches.keys().next().value;
            this.caches.delete(firstKey);
        }
        this.caches.set(videoUrl, { frames, complete: true });
    }

    // 不完全なキャッシュは保存しない
    get(videoUrl, timestamp) {
        const cache = this.caches.get(videoUrl);
        if (cache && cache.complete) {
            return cache.frames.get(timestamp);
        }
        return null;
    }
}
```

**何をしないべきか:**
- ❌ 抽出途中のフレームをキャッシュに入れない
- ❌ キャッシュの`put()`を抽出ループ内で呼ばない
- ❌ 不完全なキャッシュを`complete: false`として保存しない

**理由**:
- 不完全なキャッシュは無意味（グリッド表示が不完全）
- メモリの無駄遣いを防ぐ
- キャッシュヒット率の向上（完全なデータのみ）

### 5. 高速な中断検知

**何をするべきか:**
```javascript
async function extractFramesWithTask(task) {
    const extractorVideo = await createExtractorVideo(video.url, task);

    if (!extractorVideo || task.isAborted()) {
        return; // 静かに終了、エラーメッセージなし
    }

    const tempFrames = new Map();

    for (let i = 0; i < totalCells; i++) {
        // ループ内で頻繁にチェック
        if (task.isAborted()) {
            console.log('[extractFrames] 中断: 動画切り替え検知');
            return; // 不完全なキャッシュは破棄
        }

        const frame = await extractFrame(extractorVideo, timestamp);
        tempFrames.set(timestamp, frame);
    }

    // 全フレーム抽出完了後のみキャッシュに保存
    if (!task.isAborted()) {
        frameCache.saveComplete(task.videoUrl, tempFrames);
        console.log(`[extractFrames] 完了: ${tempFrames.size}フレームをキャッシュに保存`);
    }
}
```

**何をしないべきか:**
- ❌ `setInterval`でポーリングしない
- ❌ 長時間のタイムアウト待機をしない（10秒、3秒も不要）
- ❌ ループ外でしかチェックしない

**理由**:
- ループ内の各イテレーションで即座にチェック（最大遅延 = 1フレームの抽出時間）
- ポーリング不要（オーバーヘッドなし）
- タイムアウト不要（即座に中断）

### 6. createExtractorVideo()の改善

**何をするべきか:**
```javascript
function createExtractorVideo(url, task) {
    return new Promise((resolve) => {
        const video = document.createElement('video');
        video.src = url;
        video.muted = true;

        const onReady = () => {
            if (task.isAborted()) {
                cleanup();
                video.remove();
                resolve(null);
                return;
            }
            cleanup();
            resolve(video);
        };

        const onError = () => {
            cleanup();
            video.remove();
            resolve(null); // reject()ではなくresolve(null)でUXを壊さない
        };

        const cleanup = () => {
            video.removeEventListener('loadeddata', onReady);
            video.removeEventListener('error', onError);
        };

        video.addEventListener('loadeddata', onReady, { once: true });
        video.addEventListener('error', onError, { once: true });

        video.load();
    });
}
```

**何をしないべきか:**
- ❌ `setTimeout`でタイムアウトを設定しない（2秒、3秒、10秒すべて不要）
- ❌ `setInterval`でポーリングしない
- ❌ `readyState`を手動でチェックしない
- ❌ 複雑なフラグ管理（`resolved`フラグ等）をしない

**理由**:
- ブラウザのイベントを信頼する（`loadeddata`は必ず発火する）
- タイムアウトは不要（ローカルファイルは即座、リモートはネットワーク速度次第）
- エラーは`error`イベントで検知できる
- `{ once: true }`で自動クリーンアップ

## 実装ステップ

### Phase 1: 状態管理のリファクタリング
1. `ExtractionTask`クラスを作成
2. `STATE`を`currentVideoUrl`と`currentExtractionTask`のみに簡素化
3. 既存の`aborted`, `isExtracting`, `isGenerating`, `generationAborted`を削除

### Phase 2: イベントリスナーの改善
1. `selectVideo()`で`{ once: true }`を使用
2. `pendingMetadataHandler`の手動管理を削除
3. `createExtractorVideo()`で`{ once: true }`を使用

### Phase 3: LRUキャッシュの実装
1. `FrameCache`クラスを書き換え（`complete`フラグ付き）
2. `saveComplete()`メソッドを追加
3. `get()`で`complete: true`のみ返す

### Phase 4: 抽出処理の改善
1. `extractFramesWithTask(task)`を新規作成
2. 一時的な`tempFrames`を使用
3. 完了後のみ`frameCache.saveComplete()`を呼ぶ
4. ループ内で`task.isAborted()`を頻繁にチェック

### Phase 5: createExtractorVideo()の簡素化
1. タイムアウトロジックを削除
2. ポーリングロジックを削除
3. `{ once: true }`による自動クリーンアップ
4. `resolve(null)`によるエラーハンドリング

### Phase 6: テストとデバッグ
1. ローカルファイルで頻繁な切り替えをテスト
2. リモートファイルで頻繁な切り替えをテスト
3. コンソールログで状態遷移を確認
4. メモリリークをチェック（Developer Tools）

## 期待される効果

### 問題解決
- ✅ 頻繁な切り替えでもローディングが停止しない
- ✅ 中断が即座に反映される（最大遅延 = 1フレーム抽出時間）
- ✅ 不完全なキャッシュが残らない
- ✅ メモリリークが発生しない
- ✅ ローカル/リモート両方で正しく動作

### コード品質
- ✅ 状態管理がシンプル（1タスクオブジェクトのみ）
- ✅ レースコンディションが発生しにくい
- ✅ デバッグしやすい（明確な所有権とライフサイクル）
- ✅ 保守性が高い（少ないフラグ、明確な責任分離）

### UX改善
- ✅ エラーメッセージが表示されない
- ✅ スムーズな動画切り替え
- ✅ 予測可能な動作

## リスク管理

### 低リスク
- イベントリスナーの`{ once: true }`は標準機能で安定
- Promise連鎖は読みやすく、デバッグしやすい
- タスクオブジェクトによる所有権は明確

### 注意点
- `loadeddata`イベントのタイミング（ローカル vs リモート）
  - 解決策: タスクの中断チェックをイベントハンドラー内で実施
- ブラウザ間の互換性
  - 解決策: 標準APIのみ使用、ポリフィル不要

### テスト項目
1. ✅ ローカルファイル: 連続10回切り替え → ローディング停止しない
2. ✅ リモートファイル: 連続10回切り替え → ローディング停止しない
3. ✅ ローカル→リモート→ローカル切り替え → 正しく動作
4. ✅ 抽出完了前に切り替え → 不完全なキャッシュが残らない
5. ✅ 同じ動画を再選択 → キャッシュヒット確認
6. ✅ 4本目の動画 → 1本目のキャッシュが削除される（LRU）

## まとめ

### 核心的な変更
1. **タスクオブジェクトによる所有権管理** - グローバルフラグを排除
2. **`{ once: true }`による自動クリーンアップ** - 手動管理を排除
3. **完全なキャッシュのみ保存** - 不完全なデータを排除
4. **即座の中断検知** - ポーリングとタイムアウトを排除

### 削除するもの
- ❌ `STATE.aborted`
- ❌ `STATE.generationAborted`
- ❌ `STATE.isExtracting`
- ❌ `STATE.isGenerating`
- ❌ `STATE.pendingMetadataHandler`
- ❌ `createExtractorVideo()`内のタイムアウト・ポーリングロジック
- ❌ 複雑なtry-finallyによるフラグリセット

### 追加するもの
- ✅ `ExtractionTask`クラス
- ✅ `STATE.currentExtractionTask`
- ✅ `FrameCache.saveComplete()`メソッド
- ✅ `extractFramesWithTask(task)`関数
- ✅ `{ once: true }`イベントオプション

この計画により、シンプルで堅牢、かつUXを損なわない実装が実現できます。
