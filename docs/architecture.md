# Break Duel アーキテクチャ

最終更新: 2026-06-23

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

src/
  main.tsx          React entry
  App.tsx           アプリ状態、通知、音、イベント配線
  game.ts           TypeScript 側カード定義、設定、純粋ルール、自動判断
  game/
    actions.ts      TypeScript 側ゲーム状態を変更する操作処理
    selectors.ts    UI用の状態参照
  components/
    CardView.tsx    カード表示
    PlayerPanel.tsx プレイヤー盤面
    DuelPanel.tsx   中央操作、詳細、防御候補、ログ
    Modals.tsx      ルール、トラッシュモーダル
    Overlays.tsx    トースト、ターン/結果バナー
    cardPresentation.ts カード表示ラベル、色、画像
  styles.css        ブラウザUIスタイル

tests/
  test_core_rules.py Python 側ルールテスト

docs/
  game-spec.md      現行ゲーム仕様
  architecture.md   この文書
  evolution-design.md 次期進化設計
  typescript-migration-plan.md React + TypeScript 移行記録

web/
  index.html        Vite ビルド成果物
  assets/           Vite ビルド成果物と静的画像
```

## 実行方法

標準チェック:

```bash
npm run check
```

内訳:

- `npm run typecheck`: TypeScript 型チェック
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

## 状態管理

React 側は外部状態管理ライブラリを使っていません。`App.tsx` が `useState<GameState>` を持ち、更新時は `cloneGame` でコピーした draft を変更してから `setGame` します。

重要な状態:

- `players`: 2 プレイヤーの山札、手札、場、遺物、トラッシュ、ライフ
- `active`: 現在のターンプレイヤー
- `turn`: 手番数
- `actionsRemaining`: 残りアクション
- `chargedActionsRemaining`: チャージで増えた未消費アクション数。UI では通常アクションと別色で表示する
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

`src/game/actions.ts` は、`GameState` を変更する操作処理を置きます。

- 召喚獣を場に出す
- アップグレードする
- 指令を使う
- 攻撃を開始する
- 防御を解決する
- 自動プレイヤーの行動を実行する
- 手札コストを捨てる

`src/components/` は表示だけを担当します。カード効果や勝敗判定をここに増やさないでください。

## 変更時の注意

ルールを変える場合:

1. `docs/game-spec.md` を更新する。
2. Python 側の `ai_break_duel/` を更新する。
3. TypeScript 側の `src/game.ts` / `src/game/actions.ts` を更新する。
4. 必要なら `tests/test_core_rules.py` を追加・更新する。
5. `npm run check` を通す。
6. ブラウザで主要操作を確認する。

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
- `web/` はビルド成果物だが、画像アセットも同居している。

## 将来の整理候補

- カード定義とデッキ定義を共通 JSON 化する。
- Python と TypeScript が同じカード定義を読むようにする。
- `src/game.ts` を `cards.ts`、`rules.ts`、`ai.ts`、`config.ts` に分割する。
- 状態更新が増えたら `useReducer` へ移行する。
- ブラウザE2Eスモークテストを追加する。
