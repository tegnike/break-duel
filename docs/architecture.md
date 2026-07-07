# Break Duel アーキテクチャ

最終更新: 2026-06-28

この文書は、現在の `Break Duel` 実装を引き継ぐための開発者向け構成メモです。ゲームルールの正仕様は `docs/game-spec.md` を参照します。

## 全体構成

`Break Duel` は、Python シミュレータと React + TypeScript ブラウザ UI の 2 系統で構成されています。

- Python 側: ルール検証、自動対戦、バランス確認、単体テスト
- Browser 側: 実際に人間が対戦する UI
- `docs/game-spec.md`: 現行ルールの正仕様
- `web/`: `npm run build` で生成される配信成果物

現時点では、Python 側と TypeScript 側でカード定義・ルール処理を一部二重管理しています。ルール変更時は `docs/game-spec.md` を先に更新し、Python と TypeScript の両方へ反映してください。

## 主要ディレクトリ

```text
ai_break_duel/
  cards.py          Python 側カード定義とデッキ定義
  models.py         Python 側状態型と設定
  engine.py         Python 側ルール解決
  ai.py             Python 側自動判断
  cli.py            シミュレーションCLI

scripts/
  tune_ai_profiles.py CPU評価重みの自動探索
  tune_apex_deck.py   APEX候補デッキの生成・スクリーニング・リーグ評価

src/
  main.tsx          React entry
  App.tsx           アプリ状態、通知、音、イベント配線
  game.ts           TypeScript 側カード定義、設定、純粋ルール、自動判断
  summonFx.ts       属性召喚/遺物配置の着地演出定義と属性SFXのその場合成
  game/
    actions.ts      TypeScript 側ゲーム状態を変更する操作処理
    selectors.ts    UI用の状態参照
    cardEffectCoverage.test.ts TypeScript 側カード効果テスト
  components/
    CardView.tsx    カード表示
    PlayerPanel.tsx プレイヤー盤面
    DuelPanel.tsx   中央操作、詳細、防御候補、ログ
    Modals.tsx      ルール、トラッシュモーダル
    Overlays.tsx    トースト、ターン/結果バナー、属性着地バースト
    cardPresentation.ts カード表示ラベル、色、画像
  styles.css        ブラウザUIスタイル

tests/
  test_core_rules.py Python 側ルールテスト

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
- `npm run test:unit`: TypeScript 側カード効果テスト。効果 ID の登録漏れも検知する
- `npm run build`: Vite 本番ビルド。成果物は `web/` に出力される
- `python3 -m unittest`: Python 側ルールテスト

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

バランス確認:

```bash
python3 -m ai_break_duel.cli simulate --games 5000 --seed 4101 --out tmp/current_check
```

CPU プロファイル探索:

```bash
python3 scripts/tune_ai_profiles.py --iterations 16 --games-per-seat 10 --seed 730101 --out tmp/ai-profile-tuning.json
```

`scripts/tune_ai_profiles.py` で採用する `CHALLENGER_WEIGHTS` は Python 側の `ai_break_duel/ai.py` とブラウザ側の `src/game.ts` の両方に反映します。探索後に片方だけ更新すると、CLI とブラウザで挑戦者CPUの判断がずれます。

APEX 候補探索:

```bash
python3 scripts/tune_apex_deck.py --pool-size 120 --top 4 --screen-games 4 --league-games 100 --seed 810101 --out tmp/apex-tuning.json
```

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

CPU は Python 側 `ai_break_duel/ai.py` と TypeScript 側 `src/game.ts` の二重管理です。`beginner` / `challenger` の行動選択や防御選択を変える場合は、両方と `docs/game-spec.md` を同期してください。Python CLI は `GameConfig.ai_profiles` と `--first-ai` / `--second-ai` でプロファイルを切り替えます。ブラウザ UI は相手プレイヤーの `PlayerState.aiProfile` を使います。

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

ブラウザ UI には初回向けのチュートリアル対戦があります。固定の練習デッキ、固定初期手札、固定のライバル手札を `src/tutorial.ts` で作り、通常の `GameState` と既存アクション処理の上で進行します。

- 初回表示の完了状態は `localStorage` の `break-duel:tutorial-completed` に保存します。
- チュートリアル中の進行判定と操作ガードは `src/tutorial.ts` の `currentTutorialStep` と `App.tsx` 側の UI ガードで扱います。
- ルール処理は通常対戦と同じ `src/game.ts` / `src/game/actions.ts` を使います。チュートリアル専用のルール分岐は増やさないでください。
- ライバルの序盤召喚と攻撃、turn 4 の `AI-EARTH-2` 展開、turn 8 の攻撃は、説明順を安定させるため `tutorialForcedAiAction` で固定します。

## 変更時の注意

ルールを変える場合:

1. `docs/game-spec.md` を更新する。
2. Python 側の `ai_break_duel/` を更新する。
3. TypeScript 側の `src/game.ts` / `src/game/actions.ts` を更新する。
4. カード効果を追加・変更した場合は `src/game/cardEffectCoverage.test.ts` に効果ケースを追加・更新する。
5. 必要なら `tests/test_core_rules.py` を追加・更新する。
6. `npm run check` を通す。
7. ブラウザで主要操作を確認する。

UIだけを変える場合:

1. `src/components/` または `src/styles.css` を更新する。
2. ルール処理を変えない。
3. `npm run typecheck && npm run build` を通す。
4. ブラウザで該当画面を確認する。

バランスを変える場合:

1. 変更理由を `docs/game-spec.md` または新しい検討メモに残す。
2. Python 側シミュレーションを先に回す。
3. 結果が目標に入ったら TypeScript 側へ反映する。

## 現在の既知の技術的負債

- Python と TypeScript のカード定義が二重管理。
- TypeScript 側は `useReducer` ではなく `useState + cloneGame` で状態更新している。
- アニメーションは旧 JavaScript 版より簡略化されている。

## 将来の整理候補

- カード定義とデッキ定義を共通 JSON 化する。
- Python と TypeScript が同じカード定義を読むようにする。
- `src/game.ts` を `cards.ts`、`rules.ts`、`ai.ts`、`config.ts` に分割する。
- 状態更新が増えたら `useReducer` へ移行する。
- ブラウザE2Eスモークテストを追加する。
