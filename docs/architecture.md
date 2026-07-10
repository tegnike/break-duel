# Break Duel アーキテクチャ

最終更新: 2026-07-10

この文書は、現在の `Break Duel` 実装を引き継ぐための開発者向け構成メモです。ゲームルールの正仕様は `docs/game-spec.md` を参照します。

## 全体構成

`Break Duel` は TypeScript の単一実装です。`src/game.ts` / `src/game/actions.ts` のゲームエンジンを、ブラウザ UI（React）とヘッドレスシミュレーション CLI（`src/sim/`）が共有します。

- Browser 側: 実際に人間が対戦する UI
- `src/sim/`: 同じエンジンを使うヘッドレスシミュレーション（バランス検証、自動対戦）
- `docs/game-spec.md`: 現行ルールの正仕様
- `web/`: `npm run build` で生成される配信成果物

かつて存在した Python シミュレータ（`ai_break_duel/`）は 2026-07-08 に廃止し、TypeScript 実装に統一しました（`docs/balance-history.md` 参照）。ルール変更時は `docs/game-spec.md` を先に更新し、`src/game.ts` / `src/game/actions.ts` へ反映してください。シミュレーションと UI は同じコードを使うため、二重反映は不要です。

## カードカタログの正本

カードの ID、名前、種類、属性、power、効果、状態、収録弾は `src/game.ts` の `CARD_CATALOG` が唯一の正本です。定義はアプリ起動時に一度だけ生成され、各カードオブジェクトと配列は不変として扱います。

- `CARD_BY_ID`: ID から正規カードを引く共通インデックス
- `ACTIVE_CARD_CATALOG`: 対戦・カード一覧・デッキ製作・パック開封が共有する有効カード一覧
- `cardPool()` / `activeCardPool()`: 呼び出し側が並べ替えできる防御的な配列コピー。中のカードオブジェクトは正本を共有する
- `makeDeck()` / `makeCustomDeck()`: 対戦中の同名カードを1枚ずつ識別できるよう、正本から対戦用コピーを作る唯一の境界

カード画像や表示文言は `src/components/cardPresentation.ts`、レアリティ計算は `src/rarity.ts` に置きます。これらは表示用の派生情報であり、画面側に別のカード定義を作らないでください。

## 主要ディレクトリ

```text
scripts/
  tuneAiProfiles.ts CPU評価重みの自動探索
  tuneApexDeck.ts   APEX候補デッキの生成・スクリーニング・リーグ評価
  runCostBalance.ts ストレスデッキのコストバランス回帰

src/
  main.tsx          React entry
  App.tsx           アプリ状態、通知、音、イベント配線
  savedDecks.ts     保存デッキの型、永続化、validation
  duelSetup.ts      デッキ選択解決と相手プロフィール参照整合性
  opponents/
    types.ts        キャラクター、保存プロフィール、進行中snapshot型
    nike.ts         ニケの画像、台詞、音声定義
    catalog.ts      組み込み＋管理画面登録キャラクターの実行時カタログと素材fallback
    characterStorage.ts 管理画面キャラクターのIndexedDB永続化とvalidation
    storage.ts      version付きプロフィール永続化とCRUD
    asyncGuard.ts   前試合のtimer/audio callbackをmatchIdで遮断
  game.ts           TypeScript 側カード定義、設定、純粋ルール、自動判断
  summonFx.ts       属性召喚/遺物配置の着地演出定義と属性SFXのその場で合成
  summonParticles.ts 属性召喚/遺物配置の着地演出（カード素材が属性ごとに反応する Canvas 2D 演出）
  game/
    actions.ts      ゲーム状態を変更する操作処理
    selectors.ts    UI用の状態参照
    *.test.ts       vitest によるルール・カード効果・ガードレールテスト
  sim/
    cli.ts          ヘッドレスシミュレーション CLI（simulate / league）
    runner.ts       1 試合の自動実行
    stats.ts        試合結果の集計（summary.json / standings.json）
    costBalance.ts  ストレスデッキ定義とコストバランス評価
    random.ts       シード付き乱数
  components/
    CardView.tsx    カード表示
    PlayerPanel.tsx プレイヤー盤面
    DuelPanel.tsx   中央操作、詳細、防御候補、ログ
    Modals.tsx      ルール、トラッシュモーダル
    Overlays.tsx    トースト、ターン/結果バナー
    DuelSetupPanel.tsx 保存相手プロフィールの選択・編集UI
    CharacterAdminPage.tsx キャラクター素材・セリフ・音声の管理UI
    cardPresentation.ts カード表示ラベル、色、画像
    packParticles.ts パック開封確定演出（Canvas 2D パーティクルエンジン）
  styles.css        ブラウザUIスタイル

docs/
  game-spec.md      現行ゲーム仕様（正本）
  balance-history.md バランス検証履歴（追記専用）
  design-principles.md 設計原則・却下案・検証合格基準
  architecture.md   この文書
  evolution-design.md 次期進化設計
  archive/          完了済み作業の記録（移行記録、作業パッケージ）

web/
  index.html        Vite ビルド成果物（git 管理外、ビルドごとにクリーン）
  assets/           Vite ビルド成果物
```

## 実行方法

標準チェック:

```bash
npm run check
```

GitHub Actions の `CI` ワークフローが push / PR ごとに同じチェックを実行します。バランス回帰は `Balance Regression` ワークフロー（週次 + 手動）、本番反映は `Deploy` ワークフロー（main の CI 成功後に Cloudflare Pages へ）が担当します。

内訳:

- `npm run typecheck`: TypeScript 型チェック
- `npm run test:unit`: vitest によるルール・カード効果・ガードレールテスト。効果 ID の登録漏れも検知する
- `npm run build`: Vite 本番ビルド。成果物は `web/` に出力される

ブラウザで遊ぶ:

```bash
npm install
npm run build
python3 -m http.server 8017 --directory web
```

開発サーバー:

```bash
npm run dev -- --host 127.0.0.1
```

バランス確認（ヘッドレスシミュレーション）:

```bash
npm run sim -- simulate --games 1000 --seed 4101 --out tmp/current_check
npm run sim -- league --games-per-pair 100 --seed 4101 --decks break control fire water wind earth --out tmp/current_league
```

ストレスデッキのコストバランス回帰:

```bash
npm run balance:cost -- --games-per-order 500 --seed 3000000 --out tmp/cost-balance.json
```

CPU プロファイル探索:

```bash
npm run tune:ai -- --iterations 16 --games-per-seat 10 --seed 730101 --out tmp/ai-profile-tuning.json
```

`npm run tune:ai` で採用する `CHALLENGER_WEIGHTS` は `src/game.ts` の 1 箇所だけを更新すれば、ブラウザとシミュレーションの両方に反映されます。

APEX 候補探索:

```bash
npm run tune:apex -- --pool-size 120 --top 4 --screen-games 4 --league-games 100 --seed 810101 --out tmp/apex-tuning.json
```

## 開発用ツール（DEV ビルド限定）

いずれも `import.meta.env.DEV` でガードされており、本番ビルドには含まれません。

URL パラメータ:

- `/duel?devScenario=firewall`: 竜盾の紋章の検証シナリオ（固定盤面）で開始する
- `/duel?resultPreview=win|lose|draw`: 決着演出をプレビュー表示する

盤面エディタ（DevPanel）:

開発サーバーの対戦画面では右下に `DEV` ボタンが表示され、クリックすると盤面エディタが開きます。通常対戦で特定の状況まで進めなくても、UI/UX を手動テストするための盤面を直接作れます。

- カード配置: 任意のカードを両プレイヤーの手札・場・メモリー・山札（上/下）・トラッシュへ追加/削除。場のカードは行動済み/未行動も切り替え可能
- 数値系: ライフ、ターン数、残りアクション、チャージ、手番プレイヤーの直接編集
- 状況トリガー: ライバルの場の召喚獣による即時攻撃（防御選択 UI が開く）、勝利/敗北/引き分け演出の発火と解除
- ターン内フラグ（召喚済み・チャージ済み・手札防御回数など）の一括リセット

実装は `src/components/DevPanel.tsx`（UI）と `src/game/devTools.ts`（状態ミューテータ）。ミューテータは `cloneGame` 済みの draft に対して呼ぶ前提で、`fieldStacks` やインデックス系 Set/Map の同期を内部で処理します（テスト: `src/game/devTools.test.ts`）。

## 状態管理

React 側は外部状態管理ライブラリを使っていません。`App.tsx` が `useState<GameState>` を持ち、更新時は `cloneGame` でコピーした draft を変更してから `setGame` します。

重要な状態:

- `players`: 2 プレイヤーの山札、手札、場、遺物、トラッシュ、ライフ
- `active`: 現在のターンプレイヤー
- `turn`: 手番数
- `actionsRemaining`: 残りアクション
- `chargedActionsRemaining`: チャージで増えた未消費アクション数。非攻撃行動で優先消費し、攻撃可能判定に使う
- `PlayerState.chargeUsed`: このターンにチャージ済みか。チャージ済みのターンは攻撃できない
- `selected`: メイン画面の手札/場カード選択
- `pendingAttack`: 防御待ちの攻撃
- `pendingTarget`: 指令や効果コストの選択待ち
- `discardViewerOwner` / `discardViewerIndex`: トラッシュモーダル専用の選択状態

`selected` とトラッシュモーダルの選択は必ず分離します。トラッシュ内カードを選んでも、メイン画面のカード詳細は変えません。

## ルール処理の境界

`src/game.ts` は、なるべく UI に依存しない処理を置きます。

- カード定義
- デッキ定義
- 防御値計算
- 召喚獣個別効果
- 使用条件
- 自動行動選択
- 勝敗判定

CPU（`beginner` / `challenger`）の行動選択・防御選択は `src/game.ts` に一元化されています。変更する場合は `docs/game-spec.md` を同期してください。シミュレーション CLI は `--first-ai` / `--second-ai`（beginner / challenger、省略時 challenger）でプロファイルを切り替えます。ブラウザ UI は相手プレイヤーの `PlayerState.aiProfile` を使います。

## 相手プロフィールと進行中スナップショット

キャラクターそのものの編集は `/admin/characters` で扱う。組み込みの `NIKE_CHARACTER` は読み取り専用で、管理画面から追加した `SavedOpponentCharacter` は使用デッキ、CPU難度、画像・音声のData URLを含むためIndexedDBへ保存する。起動時とCRUD後に `savedCharacterToDefinition` で実行時定義へ変換し、`setCustomOpponentCharacters` で組み込みカタログへ合流する。互換用プロフィールstoreは大きなバイナリや対戦設定を権威データとして持たず、選択中の `characterId` を維持するためだけに使う。

相手の静的表現は `src/opponents/catalog.ts` のカタログ、ユーザーが編集する設定は `src/opponents/storage.ts` のversion付きstore、進行中の相手は `ResolvedOpponentSnapshot` の3層に分けます。`localStorage` には `characterId` だけを保存し、画像URL・音声URL・台詞本文は保存しません。

`DuelSetupPanel` は次戦向けstoreだけを更新します。対戦開始時に `App.tsx` の `activateOpponent` がsnapshotのstate/refを同期更新し、`createGameFromSetup` へ解決済みの相手名・デッキ・CPUを渡します。ゲーム中の立ち絵、リアクション、吹き出し、音声、カットインはactive snapshotから解決します。timer、Audioの`ended`、pending cueはmatchIdでガードし、前試合の非同期処理を次試合へ持ち込みません。

既存の `createGame` はシミュレーションと既存呼び出し向け互換ラッパーです。ブラウザはobject境界の `createGameFromSetup` を使い、両方とも同一RNGを `createGameCore` へ渡します。

`src/game/actions.ts` は、`GameState` を変更する操作処理を置きます。

- 召喚獣を場に出す
- アップグレードする
- 指令を使う
- 攻撃を開始する
- 防御を解決する
- 自動プレイヤーの行動を実行する
- 手札コストを捨てる

`src/components/` は表示だけを担当します。カード効果や勝敗判定をここに増やさないでください。

## チュートリアル対戦

ブラウザ UI には初回向けのチュートリアル対戦があります。固定の練習デッキ、固定初期手札、固定のニケ手札を `src/tutorial.ts` で作り、通常の `GameState` と既存アクション処理の上で進行します。保存中の相手プロフィールは参照しません。

- 初回表示の完了状態は `localStorage` の `break-duel:tutorial-completed` に保存します。
- チュートリアル中の進行判定と操作ガードは `src/tutorial.ts` の `currentTutorialStep` と `App.tsx` 側の UI ガードで扱います。
- ルール処理は通常対戦と同じ `src/game.ts` / `src/game/actions.ts` を使います。チュートリアル専用のルール分岐は増やさないでください。
- ライバルの序盤召喚と攻撃、turn 4 の `AI-EARTH-2` 展開、turn 8 の攻撃は、説明順を安定させるため `tutorialForcedAiAction` で固定します。

## 変更時の注意

ルールを変える場合:

1. `docs/game-spec.md` を更新する。
2. `src/game.ts` / `src/game/actions.ts` を更新する。
3. カード効果を追加・変更した場合は `src/game/cardEffectCoverage.test.ts` に効果ケースを追加・更新する。
4. 必要なら `src/game/*.test.ts` のルールテストを追加・更新する。
5. `npm run check` を通す。
6. ブラウザで主要操作を確認する。

UIだけを変える場合:

1. `src/components/` または `src/styles.css` を更新する。
2. ルール処理を変えない。
3. `npm run typecheck && npm run build` を通す。
4. ブラウザで該当画面を確認する。

バランスを変える場合:

1. 変更理由を `docs/game-spec.md` または新しい検討メモに残す。
2. `npm run sim -- simulate|league ...` でシミュレーションを回して検証する。
3. 結果を `docs/balance-history.md` に記録する。

## 現在の既知の技術的負債

- TypeScript 側は `useReducer` ではなく `useState + cloneGame` で状態更新している。
- アニメーションは旧 JavaScript 版より簡略化されている。

## 将来の整理候補

- カード定義とデッキ定義を共通 JSON 化する。
- `src/game.ts` を `cards.ts`、`rules.ts`、`ai.ts`、`config.ts` に分割する。
- 状態更新が増えたら `useReducer` へ移行する。
- ブラウザE2Eスモークテストを追加する。
