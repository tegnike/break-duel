# React + TypeScript 移行記録

最終更新: 2026-06-24

## 実装状況

2026-06-23 時点で、ブラウザ UI は React + TypeScript + Vite 構成へ移行済み。

この文書は移行作業の記録です。現在の実装構成は `docs/architecture.md`、ゲームルールの正仕様は `docs/game-spec.md` を参照してください。下部には実装前の計画を履歴として残していますが、現構成と異なる記述があります。

現在の主要ファイル:

- `package.json`
- `tsconfig.json`
- `vite.config.ts`
- `index.html`
- `src/main.tsx`
- `src/App.tsx`: アプリ状態、通知、音、イベント配線
- `src/game.ts`: TypeScript 側カード定義、設定、純粋ルール、自動判断
- `src/game/actions.ts`: ゲーム状態を変更する操作処理
- `src/game/selectors.ts`: UI用の状態参照
- `src/components/`: React表示コンポーネント
- `src/styles.css`
- `web/` は `npm run build` 後の配信成果物

標準チェック:

```bash
npm run check
```

このコマンドで次を確認する。

- TypeScript 型チェック
- Vite 本番ビルド
- 既存 Python ルールテスト

ブラウザ確認済み項目:

- `http://localhost:8017/` でReact版が表示される。
- 新規対戦が開始され、先攻初期手札 5 枚、先攻初ターンのドローなしが表示される。
- 手札の召喚獣を選択して場に出せる。
- 2アクション消費後にターンが自動で相手へ移る。
- ライバルが自動でカードを場に出す。
- 自分の場の召喚獣で攻撃できる。
- ライバルが手札防御できる。
- トラッシュをクリックして一覧とモーダル内カード詳細を見られる。
- ブラウザコンソールエラーなし。

2026-06-23 追加整理:

- `App.tsx` から表示コンポーネントを `src/components/` へ分離。
- カード表示のラベル、色、アート指定を `src/components/cardPresentation.ts` へ分離。
- ゲーム操作処理を `src/game/actions.ts` へ分離。
- メイン画面の選択参照を `src/game/selectors.ts` へ分離。
- `App.tsx` は 1457 行から約 531 行へ縮小。

## 目的

ブラウザ UI を React + TypeScript 構成へ移行し、今後のカード追加、ルール調整、UI改善を安全に進められる状態にする。

現在の Python シミュレータは正規ルール実装として維持する。今回の主対象はブラウザ UI 側で、型安全化だけでなく、状態管理・描画・イベント処理をコンポーネント単位へ整理する。

## 現状

- UI は `src/main.tsx` から React を起動する構成。
- `src/App.tsx` に画面操作とReactコンポーネント、`src/game.ts` にゲームルールと自動判断を置く。
- CSS は `src/styles.css` に置く。
- Python 側には同じゲームルールの実装とテストがある。
- 現在の検証コマンド:

```bash
npm run check
python3 -m http.server 8017 --directory web
```

## 実装後の方針

Vite + React + TypeScript への移行は完了済み。今後もゲームルールや画面デザインの意味変更は、移行作業とは分けて扱う。

採用方針:

- Vite + React + TypeScript を使う。
- React は関数コンポーネントと hooks を使う。
- Redux 等の外部状態管理は入れていない。現状は `useState + cloneGame` で更新している。状態更新が増えた場合は `useReducer` への移行を検討する。
- CSS は旧 `web/styles.css` を元に `src/styles.css` へ移した。
- ルール計算は React コンポーネントから分離し、`src/game.ts` と `src/game/actions.ts` に置く。
- アニメーションは旧版より簡略化されている。効果音は React 版に移行済み。
- ルールの意味変更はしない。移行中に見つけたバグ修正は別作業として明示する。

## 非目標

- Python シミュレータの TypeScript 移植はしない。
- ルール再設計、カードバランス調整、デザイン刷新はしない。
- CSS全面整理はしない。
- Zustand / Redux / XState などの追加状態管理ライブラリは初期移行では入れない。
- Tailwind やUIコンポーネントライブラリは初期移行では入れない。

## 目標成果物

この節以降は実装前計画の履歴です。現時点の実装済み構成は上部の「実装状況」と `docs/architecture.md` を参照してください。

- `package.json`
- `tsconfig.json`
- `vite.config.ts`
- React entry (`src/main.tsx`)
- React app (`src/App.tsx`)
- 型定義とゲームロジック (`src/game.ts`)
- ゲーム操作処理 (`src/game/actions.ts`)
- React コンポーネント (`src/components/`)
- 既存ゲームがブラウザで同等に遊べる状態
- TypeScript の型チェックが通る状態
- 既存 Python テストが通る状態

## 推奨ディレクトリ構成

```text
src/
  main.tsx
  App.tsx
  types.ts
  constants.ts
  game/
    cards.ts
    config.ts
    reducer.ts
    rules.ts
    ai.ts
    selectors.ts
  components/
    TopBar.tsx
    Board.tsx
    PlayerPanel.tsx
    DuelPanel.tsx
    CardView.tsx
    DeckPile.tsx
    DiscardModal.tsx
    DefensePanel.tsx
    AffinityGuide.tsx
    LogList.tsx
    RulesModal.tsx
  effects/
    audio.ts
    animation.ts
  styles.css
```

最初から細かく分けすぎない。最低限 `types.ts`、`game/rules.ts`、`game/reducer.ts`、`components/` は分ける。

## 型設計

最初に定義する主要型:

```ts
type Attribute = "火" | "水" | "風" | "土";
type CardType = "ai" | "event" | "memory";
type CommandEffect = "optimize" | "patch" | "disrupt" | "relearn" | "sandbox" | "trinity";
type MemoryEffect = "firewall" | "cache" | "pipeline" | "accelerator";

type AiCard = {
  id: string;
  name: string;
  type: "ai";
  attribute: Attribute;
  power: 1 | 2 | 3 | 4;
};

type EventCard = {
  id: string;
  name: string;
  type: "event";
  effect: CommandEffect;
};

type MemoryCard = {
  id: string;
  name: string;
  type: "memory";
  effect: MemoryEffect;
};

type Card = AiCard | EventCard | MemoryCard;
```

重要な制約:

- `card.attribute` と `card.power` は `AiCard` のみに存在させる。
- `card.effect` は `EventCard` / `MemoryCard` のみに存在させる。
- メイン選択状態とトラッシュモーダル選択状態は分離する。
- 防御候補表示は `defenseCombatValue` と同じ計算を使う。

## 状態管理方針

実装前計画では `useReducer` を想定していたが、現在は `useState<GameState> + cloneGame` で更新している。状態更新がさらに増えた場合に `useReducer` 化を検討する。

主な state:

- `players`
- `active`
- `turn`
- `actionsRemaining`
- `winner`
- `draw`
- `selected`
- `pendingAttack`
- `pendingTarget`
- `discardViewer`
- `log`
- `uiEffects`

`state.selected` はメイン画面の手札・場カードの選択に限定する。トラッシュモーダルは次のように別管理する。

```ts
type DiscardViewerState = {
  ownerIndex: 0 | 1;
  selectedIndex: number | null;
} | null;
```

## 移行手順

### Phase 1: React + Vite 基盤を追加する

1. `package.json` を追加する。
2. `react`、`react-dom`、`vite`、`typescript`、`@vitejs/plugin-react` を追加する。
3. `tsconfig.json` と `vite.config.ts` を追加する。
4. `src/main.tsx` と `src/App.tsx` を作る。
5. まず空の React 画面を起動する。

確認:

```bash
npm install
npm run typecheck
npm run dev -- --host 127.0.0.1
python3 -m unittest
```

### Phase 2: 純粋なゲームロジックを TypeScript へ移す

React化より先に、DOMに依存しない関数を `src/game/` へ移す。

対象:

- カード定義
- デッキ定義
- `canDefend`
- `defenseCombatValue`
- `playCost`
- `upgradeCost`
- `canUpgrade`
- `commandUsable`
- `chooseAiAction`
- `legalFieldDefenders`
- `legalHandDefenders`

移行作業中は旧JS実装と新 `src/game.ts` が一時的に重複してよい。完了後は旧JS実装を残さない。

### Phase 3: React コンポーネントで画面骨格を作る

以下を React コンポーネント化する。

- `TopBar`
- `Board`
- `PlayerPanel`
- `DuelPanel`
- `CardView`
- `LogList`
- `RulesModal`

この段階では、まだ全操作を完全実装しなくてよい。まず現行画面に近い静的表示を作る。

確認ポイント:

- Seed、ターン表示、プレイヤー情報が出る。
- 手札、場、遺物、山札、トラッシュが表示される。
- カード見た目が現行と大きく崩れていない。

### Phase 4: reducer にゲーム操作を移す

`game/reducer.ts` にアクションを定義する。

主な action:

- `newGame`
- `startTurn`
- `endTurn`
- `playAi`
- `playMemory`
- `upgradeAi`
- `useCommand`
- `attack`
- `resolveDefense`
- `charge`
- `openDiscard`
- `selectDiscardCard`
- `closeDiscard`
- `selectCard`

注意:

- React state は直接変更しない。
- 現在は `cloneGame` でコピーした draft に対して配列や `Set` を変更し、最後に `setGame` する。
- `Set<number>` は `cloneGame` 内で新しい `Set` を作る。

### Phase 5: 操作 UI を接続する

既存操作を React events に置き換える。

確認する操作:

- 手札から召喚獣を場に出す。
- 遺物を配置する。
- アップグレードする。
- 指令を使う。
- 攻撃する。
- 防御する。
- 手札防御する。
- チャージする。手札1枚をトラッシュして残りアクションを最大3まで増やし、そのターンは攻撃できない。
- ターン終了する。
- トラッシュを見る。
- トラッシュ内カードを選んでもメイン詳細が変わらない。

### Phase 6: モーダル・防御候補・ログを仕上げる

重点:

- `DiscardModal` 内にカード一覧と詳細ペインを出す。
- `DefensePanel` は場/手札、防御値、結果が読めるカード型候補にする。
- `AffinityGuide` は攻撃選択時に相手の防御候補を候補ごとに表示する。
- `LogList` は最新行が下に追加され、スクロール可能にする。

### Phase 7: アニメーション・効果音を戻す

最後に現行の体験を戻す。

対象:

- ターン開始バナー
- 攻撃ビーム
- ダメージ表示
- カード移動演出
- BGM / 効果音

この段階で難しければ、見た目を壊さない最低限の演出に留める。

### Phase 8: 旧ファイル整理

1. ブラウザUIは `src/` を編集対象にし、`web/` はビルド成果物として扱う。
2. 必要なら `web/app.legacy.js` として退避する。
3. `web/index.html` のキャッシュバスター付き script 読み込みをやめ、Vite entry に置き換える。
4. README の起動手順を Vite 前提に更新する。
5. 静的配布方法を決める。

候補:

- 開発中: `npm run dev -- --host 127.0.0.1`
- 配布用: `npm run build` で `dist/` を生成

## 検証コマンド

React + TypeScript 移行後の標準検証:

```bash
npm run typecheck
npm run build
python3 -m unittest
```

ブラウザ確認:

```bash
npm run dev -- --host 127.0.0.1
```

必要に応じて:

```bash
python3 -m ai_break_duel.cli simulate --games 1000 --seed 4101 --out tmp/react_ts_migration_smoke_1000
```

## 手動確認チェックリスト

- Seed 1 で開始できる。
- 先攻初ターンは攻撃できない。
- 通常は2アクションで、チャージや `刻火の加速炉` により残りアクションが最大3まで増える。
- チャージしたターンは攻撃できず、`刻火の加速炉` で増えたアクションでは攻撃できる。
- `CMD-SANDBOX` は指令として使える。
- power 4 は攻撃後退場する。
- 蒼殻バリア使用後の power 4 は1回だけ場に残る。
- トラッシュモーダル内に効果が表示される。
- トラッシュカード選択でメイン画面の詳細が変わらない。
- 防御候補が候補ごとに読める。
- 場ブロックと手札ブロックの結果が現行仕様通り。
- ルールモーダルが開閉できる。
- ログがスクロールできる。
- 新規対戦で状態が完全に初期化される。

## 注意点

- React化により、直接DOMを書き換える処理は基本的に廃止する。
- アニメーションはDOM座標が必要なため、`ref` と効果専用コンポーネントで扱う。
- 現行の `state` 直接変更をそのまま持ち込まない。
- トラッシュモーダルの選択状態はメイン選択と分離する。
- 防御候補表示は `defenseCombatValue` と同じ計算を使う。
- ブラウザ保存データ対策は Vite のハッシュ付きビルドに任せる。
- Python 側が正仕様なので、カード定義やルールが二重管理になる点は残る。将来的には共通JSON化を検討する。

## リスク

| リスク | 対応 |
| --- | --- |
| React化で一気に挙動差分が増える | 先に `src/game/` に純粋ロジックを移し、UI移行と分けて確認する |
| state の直接変更癖が残る | reducer で immutable 更新に統一する |
| DOM座標依存のアニメーションが壊れる | アニメーションは最後に戻し、先にゲーム操作を完成させる |
| 型定義が複雑になりすぎる | 最初は主要型だけに絞り、細部は後から締める |
| Python版とカード定義がズレる | `docs/game-spec.md` を正とし、移行後に共通JSON化を別タスク化する |
| Vite導入で起動手順が変わる | README に新手順を明記する |

## 完了条件

- `npm run typecheck` が通る。
- `npm run build` が通る。
- `python3 -m unittest` が通る。
- React版ブラウザUIで1試合を開始できる。
- 攻撃、防御、指令、遺物、アップグレード、チャージ、トラッシュ閲覧が動く。
- トラッシュモーダル内詳細とメイン詳細が独立している。
- `docs/game-spec.md` と README が新しい起動手順に合っている。

## 別セッションへの依頼文

```text
/Users/user/WorkSpace/ai-break-duel を React + TypeScript 化してください。

まず docs/typescript-migration-plan.md を読み、計画に沿って進めてください。
目的はブラウザUIを React + TypeScript + Vite 構成へ移行することです。ゲームルールの変更やUIデザイン刷新はしないでください。

優先事項:
- 既存のブラウザUI挙動を維持する
- React + TypeScript + Vite で進める
- Redux等の状態管理ライブラリは初期移行では導入しない
- まず src/game/ に純粋なゲームロジックを移す
- React側は `useState<GameState> + cloneGame` を維持し、必要になったら `useReducer` を検討する
- トラッシュモーダルの選択状態はメイン画面の selected と分離する
- 防御候補表示、蒼殻バリア指令、先攻初ターン攻撃不可を壊さない
- アニメーションと効果音は最後に戻す

完了時には以下を確認してください:
- npm run typecheck
- npm run build
- python3 -m unittest
- ブラウザで新規対戦、トラッシュ閲覧、攻撃時の防御候補表示を確認
```
