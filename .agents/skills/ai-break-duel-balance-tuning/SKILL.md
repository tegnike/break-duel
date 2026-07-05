---
name: ai-break-duel-balance-tuning
description: ai-break-duel（Break Duel）のバランス調整を、検証つきで最初から最後まで実行するワークフロー。カード効果・デッキ構成・ルール数値・CPU（AIプロファイル）の強化/弱体化/調整、勝率やゲームバランスの検証、リーグ戦シミュレーション、盛り上がり（試合展開）の分析、バランス変更の採用判断と記録を頼まれたら必ずこのスキルを使うこと。「〜が強すぎる/弱すぎる」「ナーフして」「勝率を調べて」「バランスを見て」「デッキを調整して」「CPUを強くして」のような曖昧な依頼でも、ai-break-duel リポジトリでの作業ならこのスキルの対象。
---

# Break Duel バランス調整ワークフロー

カード・デッキ・ルール・CPU の変更を「実装 → 検証 → 採用判断 → 記録」の一連で行うための手順。
このゲームのバランス作業は **数値の主張がすべてシミュレーションで裏付けられていること** と
**Python/TypeScript の二重実装が常に同じ挙動であること** の 2 点で品質が決まる。

## 0. 前提知識（着手前に必ず読む）

1. `docs/game-spec.md` — 現行ルールの正仕様
2. `docs/balance-history.md` — 直近エントリ 2〜3 件。**現在の基準数値**（勝率レンジ・盛り上がり指標の目安）と直近の変更意図がここにある
3. `docs/design-principles.md` — 守るべき設計原則と**却下済みの案**、検証の合格基準
4. 作業開始前に `npm run check` が green であることを確認する（ベースラインが壊れていると検証結果が信用できない）

### 変更してはいけない/再提案してはいけないもの

検証の結果として意図的に選ばれた設計。変更提案には新しいシミュレーションデータが必須。

- **コスト = power の完全一致**（power 別の割引・変則コストは却下済み）
- **手札は逆転の資源、盤面は優勢側の資源**（追撃粛清=逆転装置、モンスター攻撃=決着装置の同時採用はこの相殺のため）
- 却下済み: 無条件除去術式 / 「消耗中への攻撃は必ず破壊」 / デッキ30枚化 / power 3+ 上限 6 枚以上 / 序盤限定コスト割引
- デッキ切れ決着はコントロールの勝ち筋として少量（数%）残す設計

### 構築ルール（デッキをいじるとき）

25 枚 / 同名 2 枚まで / power 3+ は合計 5 枚まで。

## 1. 実装 — 二重実装の同期が絶対条件

Python（`ai_break_duel/` — シミュレータの正）と TypeScript（`src/` — ブラウザ UI）は同じルールの二重実装。
**ルール・カード・AI に触れたら必ず両方に同じ変更を入れ、両方のテストを更新する。** 片側だけの変更は
シミュレーション結果と実プレイが乖離するため、検証自体が無意味になる。

| 変更対象 | Python | TypeScript |
| --- | --- | --- |
| カード定義・デッキ | `ai_break_duel/cards.py` | `src/game.ts` |
| ルール処理 | `ai_break_duel/engine.py` | `src/game.ts` / `src/game/actions.ts` |
| CPU 判断 | `ai_break_duel/ai.py` | `src/game.ts`（`CHALLENGER_WEIGHTS` は両側で同期必須） |
| テスト | `tests/test_core_rules.py` | `src/game/*.test.ts` |

- カード効果を追加・変更したら `src/game/cardEffectCoverage.test.ts` への登録が必須（怠ると unit テストが落ちる設計）
- **チュートリアルの破損確認**: `src/tutorial.ts` は特定カードの ID・コスト・効果・ドロー順に依存した固定進行。
  ルールやカードを変えたら `npx vitest run src/game/tutorial.test.ts` を回し、チュートリアル採用カード
  （教材・練習デッキ）に触れた場合は固定進行を机上で追って詰みがないか確認する
  （前例: コスト=power 化と初心者CPUの防御解禁が、それぞれ別の形でチュートリアルを静かに詰ませた）
- 「挙動を変えていない」と主張するリファクタは、同シードのリーグが変更前後で**ビット一致**することを確認して初めて主張できる（後述の A/B 手順）

## 2. 検証パイプライン

### 2a. リーグ検証（バランスの合否判定）

```bash
python3 -m ai_break_duel.cli league --games-per-pair 100 --seed <seed> \
  --decks break control fire water wind earth --out tmp/<name>-<seed>
```

- **必ず 2 シード以上**で回す。1 シードでは構成変更の影響とノイズを区別できない
- 集計と合否判定は同梱スクリプトで:

```bash
python3 .agents/skills/ai-break-duel-balance-tuning/scripts/league_report.py tmp/<name>-<seed1> tmp/<name>-<seed2>
```

合格基準: 単色 4 デッキ（fire/water/wind/earth）45-55%、先攻勝率 48-52%。
break/control は多色の競技基準デッキなので単色より高くてよい。

### 2b. 盛り上がり指標（試合展開の質）

勝率が健全でも試合が平坦なら失敗。`simulate` の出力から同梱スクリプトで集計する:

```bash
python3 -m ai_break_duel.cli simulate --games 1000 --seed <seed> --out tmp/<name>
python3 .agents/skills/ai-break-duel-balance-tuning/scripts/excitement_metrics.py tmp/<name>
```

見る指標: 2点ビハインド逆転率 / 先に2点差をつけた側の勝率（安全圏化の度合い）/ 先制ダメージ手番 /
最大スイング / 平均ターン / 決着形態（lifeout・resource・turn_limit）。
**目安値は `docs/balance-history.md` の直近エントリと比較する**（絶対値は改訂ごとに動く）。

### 2c. カード別統計（勝ち筋の偏り検出）

`simulate` の `summary.json` 内 `card_usage` にカード別の使用・攻撃・防御イベント数が集計される。
特定カードに勝率が依存していないか、過小カード（使われないカード）がないかをここで見る。

### 2d. ストレスデッキ回帰（コストカーブの破綻検出）

power 帯に偏らせた極端デッキがプリセットに勝ち越さないかのチェック。
詳細な使い方と解釈基準は `.agents/skills/ai-break-duel-balance-regression/SKILL.md` を読むこと。

```bash
python3 .agents/skills/ai-break-duel-balance-regression/scripts/run_cost_balance.py \
  --games-per-order 1000 --seed <seed> --rule-set current
```

RISK 判定は勝率 50% 超。単色デッキだけを狩って高勝率になっている場合は break/control 相手の勝率で判断する。

### 2e. CPU プロファイル検証（AI を触ったとき）

```bash
python3 -m ai_break_duel.cli simulate --games 100 --seed <seed> \
  --first-ai challenger --second-ai beginner --first-deck <a> --second-deck <b> --out tmp/<name>
```

- 初心者の目安: 挑戦者相手に勝率 5-20%、防御が毎試合発生（複数デッキペア×先後で測る）
- 挑戦者の重み変更: 旧重みとの**直接対決**で 55% 以上勝ち越して初めて採用（`scripts/tune_ai_profiles.py` が直接対決型の適応度に対応済み）

### 2f. apex デッキの追随（カード・デッキを大きく触ったとき）

apex（覇王結束）は標準の 6 デッキリーグに**含まれない** 7 番目のプリセットで、自動探索による最強候補という
位置づけ。カードプールやデッキ構成が大きく動いたら、apex が最強候補のままかを再探索で確認する:

```bash
python3 scripts/tune_apex_deck.py --pool-size 120 --top 4 --screen-games 4 --league-games 100 \
  --seed <seed> --out tmp/apex-tuning-<seed>.json
```

現行 apex に対して**明確に**（複数シードの直接対決で有意に）勝ち越す候補が出たときだけ差し替える。
僅差なら据え置き（前例: WP2 はランダム120+変異120候補で現行を上回れず据え置き）。

## 3. A/B 検証の作法

- **同一シード・同一条件**で変更前後を比較する。シードが違う比較は無意味
- 変更前のコードでの再実行が要るときは「一時パッチ → 実行 → 即復元」で行い、復元を grep で確認する
- 「影響なし」を主張するときはリーグ結果のビット一致（全数値が同一）まで確認する
- ノイズと効果の区別がつかない候補（誤差圏内の改善）は**据え置きが正解**。WP2（apex探索）・WP3（AI重み探索)は
  どちらも「候補が明確に勝ち越せない → 現行維持」で完了しており、これがこのリポジトリの判断基準

## 4. 採用判断と記録

採用・却下のどちらでも `docs/balance-history.md` の**先頭**にエントリを追記する（既存フォーマットに合わせる）:

```markdown
## <日付> <変更の一行要約>

### 背景
（何が問題だったか。数値で）
### 採用変更 / 変更内容
（変更点の表 or 箇条書き。Python/TS 両方に入れたことを明記）
### 検証
（シード・試合数・結果の数値。基準との比較）
### 判断
（採用/却下とその理由。却下案は「再提案しないこと」リスト入りを検討）
### 検証コマンド
（再現に必要なコマンドをそのまま貼る）
```

- ルールが変わったら `docs/game-spec.md` も同時に更新（正仕様とのズレは事故のもと）
- 数値の主張（「勝率が改善」「影響なし」）には必ず根拠となる試合数とシードを添える

## 5. 最終ゲート

```bash
npm run check   # typecheck + TS unit + build + Python unittest（ストレスデッキのガードレール込み）
```

green になるまで完了と言わない。`tests/test_cost_balance.py` のガードレール上限に引っかかった場合は、
上限を緩める前に「本当にその強さで良いのか」をリーグと盛り上がり指標で確認する。

## 関連スキル

- `.agents/skills/ai-break-duel-balance-regression` — ストレスデッキ回帰の詳細（2d の部品）
- `.agents/skills/ai-break-duel-card-addition` — カードの新規追加（実装・アート・文言まで含む場合はこちら）
