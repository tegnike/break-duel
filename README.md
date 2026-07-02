# Break Duel

`Break Duel` は、20 枚デッキで遊ぶ 2 人対戦の小型オリジナルカードゲームです。
React + TypeScript のブラウザ UI で実際に対戦でき、Python シミュレータで自動対戦とバランス検証を回せます。

![Break Duel battle board](docs/assets/break-duel-board.png)

## 特徴

- 1 試合が短く終わる、軽量な対戦カードゲームです。
- 召喚獣、指令、遺物の 3 種類のカードを使います。
- 各ターンは基本 2 アクションで、カードをチャージすると一時的に 3 アクションまで伸ばせます。
- 火、水、風、土の 4 属性は相性補正ではなく、カード個別効果で特徴を出します。
- 手札防御、場防御、アップグレード、遺物、トラッシュ回収などを実装しています。
- ブラウザ UI では固定デッキと保存済みカスタムデッキを、自分側と相手側で個別に選べます。
- 相手 CPU は `初心者` と `挑戦者` から選べます。`挑戦者` は自動探索した評価関数で合法手を比較します。
- Python CLI で大量の自動対戦、リーグ戦、ルール実験を実行できます。

## ゲーム概要

各プレイヤーは 20 枚デッキを使い、召喚獣を場に出して攻撃します。相手のライフを 0 にするか、最大手番後のライフ判定で勝利します。

標準ルール:

- 初期ライフ: 5
- デッキ枚数: 20
- 先攻初期手札: 5
- 後攻初期手札: 5
- 通常アクション数: 2
- 先攻 1 ターン目: 1 アクション、開始時ドローなし、攻撃不可
- 後攻 1 ターン目: 開始時ドローなし、2 アクション、攻撃可能
- 場の召喚獣上限: 3
- 遺物スロット: 1
- 手札防御: 1 回 / ターン
- 最大手番数: 60
- 属性相性補正: なし

カード種別:

| 種別 | 役割 |
| --- | --- |
| 召喚獣 | 場に出して攻撃、防御、アップグレードに使うカード |
| 指令 | 1 回使い切りのアクションカード |
| 遺物 | 1 枚だけ配置できる継続効果カード |

詳しいルールは [docs/game-spec.md](docs/game-spec.md) を参照してください。

## デッキ

ブラウザ UI には 7 つの固定デッキがあります。

| ID | 概要 |
| --- | --- |
| `break` | 火と水を中心にした攻撃圧、妨害、リソース補充のデッキ |
| `control` | 風と土を中心にした防御、再利用、テンポ制御のデッキ |
| `fire` | 火単色。攻撃圧、手札防御への圧力、フィニッシャー重視 |
| `water` | 水単色。ドロー、手札調整、継戦力重視 |
| `wind` | 風単色。消耗操作、テンポ、再攻撃機会重視 |
| `earth` | 土単色。場防御、遺物、防御成功時のリターン重視 |
| `apex` | 挑戦者CPUリーグで採用した混合の最強候補デッキ |

デッキ制作画面では保存デッキを作れます。保存条件は次の通りです。

- 20 枚ちょうど
- 同名カード 2 枚まで
- power 3 以上の召喚獣は合計 4 枚まで

保存デッキはブラウザの `localStorage` に保存されます。

## クイックスタート

必要なもの:

- Node.js
- npm
- Python 3.9 以上

インストール:

```bash
npm install
```

開発サーバーで遊ぶ:

```bash
npm run dev -- --host 127.0.0.1
```

表示されたローカル URL をブラウザで開いてください。通常は `http://127.0.0.1:5173/` です。

本番ビルドを静的配信する:

```bash
npm run build
python3 -m http.server 8000 --directory web
```

`http://localhost:8000/` を開くと、ビルド済み UI で遊べます。ポート 8000 が使用中なら、別のポートを指定してください。

## シミュレーション

標準対戦を 1000 戦実行:

```bash
python3 -m ai_break_duel.cli simulate --games 1000 --seed 1 --out tmp/simulate_1
```

固定デッキ同士を指定:

```bash
python3 -m ai_break_duel.cli simulate \
  --games 1000 \
  --seed 21001 \
  --out tmp/break_control_21001 \
  --first-deck break \
  --second-deck control
```

CPU モードを指定:

```bash
python3 -m ai_break_duel.cli simulate \
  --games 1000 \
  --seed 730500 \
  --out tmp/challenger_vs_beginner_fire \
  --first-deck fire \
  --second-deck fire \
  --first-ai challenger \
  --second-ai beginner
```

6 デッキの ordered round-robin league:

```bash
python3 -m ai_break_duel.cli league \
  --games-per-pair 1000 \
  --seed 4200000 \
  --out tmp/six_deck_league_4200000 \
  --decks break control fire water wind earth
```

出力:

- `summary.json`: `simulate` の集計
- `matches.jsonl`: `simulate` の各試合ログ
- `league-summary.json`: `league` の順位表と各組み合わせ結果

手札防御を無効化して比較したい場合:

```bash
python3 -m ai_break_duel.cli league \
  --games-per-pair 1000 \
  --seed 4200000 \
  --out tmp/no_hand_defense_league_4200000 \
  --decks break control fire water wind earth \
  --hand-defense-limit 0
```

挑戦者 CPU の評価重みを自動探索する:

```bash
python3 scripts/tune_ai_profiles.py \
  --iterations 16 \
  --games-per-seat 10 \
  --seed 730101 \
  --out tmp/ai-profile-tuning.json
```

APEX 候補を自動生成し、現行APEX+上位4候補の5デッキリーグで採用候補を選ぶ:

```bash
python3 scripts/tune_apex_deck.py \
  --pool-size 120 \
  --top 4 \
  --screen-games 4 \
  --league-games 100 \
  --seed 810101 \
  --out tmp/apex-tuning.json
```

## バランス回帰チェック

高コスト偏重デッキなどが既存デッキを大きく上回らないかを確認する補助スクリプトがあります。

```bash
python3 .agents/skills/ai-break-duel-balance-regression/scripts/run_cost_balance.py \
  --games-per-order 1000 \
  --seed 3000000
```

実験用ルールセットを比較する例:

```bash
python3 .agents/skills/ai-break-duel-balance-regression/scripts/run_cost_balance.py \
  --games-per-order 1000 \
  --seed 4300000 \
  --rule-set current \
  --rule-set hand_defense_0
```

## テスト

標準チェック:

```bash
npm run check
```

内訳:

- `npm run typecheck`
- `npm run test:unit`
- `npm run build`
- `python3 -m unittest`

カード効果を追加・変更した場合は、TypeScript 側の `src/game/cardEffectCoverage.test.ts` に効果ケースを追加してください。
このテストは有効カードプールに存在する効果 ID とテスト登録表の差分を検知するため、効果を実装してテスト登録を忘れると `npm run test:unit` が失敗します。

## プロジェクト構成

```text
ai_break_duel/
  cards.py        Python 側カード定義、デッキ定義
  models.py       Python 側状態型、設定
  engine.py       Python 側ルール解決
  ai.py           Python 側自動判断
  cli.py          シミュレーション CLI

src/
  App.tsx         ブラウザアプリ本体
  game.ts         TypeScript 側カード定義、設定、ルール補助
  game/actions.ts TypeScript 側ゲーム操作
  game/cardEffectCoverage.test.ts TypeScript 側カード効果テスト
  components/     UI コンポーネント
  styles.css      UI スタイル

tests/
  test_core_rules.py
  test_cost_balance.py

docs/
  game-spec.md
  balance-history.md
  architecture.md
  evolution-design.md

web/
  Vite のビルド出力
```

開発者向けの構成メモは [docs/architecture.md](docs/architecture.md) を参照してください。

## アセット

ブラウザ UI の一部アイコンには Kenney の `Board Game Icons` を使用しています。

- Source: https://kenney.nl/assets/board-game-icons
- License: Creative Commons CC0

ブラウザ UI の効果音には、以下の CC0 素材を編集して使用しています。詳細は [src/assets/audio/README.md](src/assets/audio/README.md) を参照してください。

- Kenney Casino Audio
- Kenney Impact Sounds
- Kenney Interface Sounds
- Card Game Sounds
- Level Up, Power Up, Coin Get (13 Sounds)

## ライセンス

このプロジェクトは MIT License です。詳細は [LICENSE](LICENSE) を参照してください。
