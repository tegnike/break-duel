---
name: ai-break-duel-balance-tuning
description: ai-break-duel（Break Duel）のバランス調整を、検証つきで最初から最後まで実行するワークフロー。カード効果・デッキ構成・ルール数値・CPU（AIプロファイル）の強化/弱体化/調整、勝率やゲームバランスの検証、リーグ戦シミュレーション、盛り上がり（試合展開）の分析、バランス変更の採用判断と記録を頼まれたら必ずこのスキルを使うこと。「〜が強すぎる/弱すぎる」「ナーフして」「勝率を調べて」「バランスを見て」「デッキを調整して」「CPUを強くして」のような曖昧な依頼でも、ai-break-duel リポジトリでの作業ならこのスキルの対象。
---

# Break Duel バランス調整ワークフロー

カード・デッキ・ルール・CPU の変更を「実装 → 検証 → 採用判断 → 記録」の一連で行うための手順。
このゲームのバランス作業は **数値の主張がすべてシミュレーションで裏付けられていること** で品質が決まる。
実装は TypeScript の単一実装（`src/game.ts` が正）で、ブラウザ UI とシミュレーション CLI が同じエンジンを共有する。

## 0. 前提知識（着手前に必ず読む）

1. `docs/game-spec.md` — 現行ルールの正仕様
2. `docs/balance-history.md` — 直近エントリ 2〜3 件。**現在の基準数値**（勝率レンジ・盛り上がり指標の目安）と直近の変更意図がここにある
3. `docs/design-principles.md` — 守るべき設計原則と**却下済みの案**、検証の合格基準
4. 作業開始前に `npm run check` が green であることを確認する（ベースラインが壊れていると検証結果が信用できない）
5. **計測器（challenger CPU）の世代を確認する**: 全勝率数値は CPU 世代（`docs/assets/ai-champions/fair/`
   の最新 fair-genNNN）に紐づく。**CPU 世代が違う時代の数値と比較してはいけない**（覗き見時代・
   旧世代時代の数値は現行と互換性がない）。基準は常に balance-history 最新エントリの再ベースライン値。
   CPU 自体を変更する場合も、同じ基準値・同じ champion 世代管理で検証し、`docs/balance-history.md`
   と `docs/fair-cpu-followups.md` に採用判断を残す

### 変更してはいけない/再提案してはいけないもの

検証の結果として意図的に選ばれた設計。変更提案には新しいシミュレーションデータが必須。

- **コスト = power の完全一致**（power 別の割引・変則コストは却下済み）
- **手札は逆転の資源、盤面は優勢側の資源**（追撃粛清=逆転装置、モンスター攻撃=決着装置の同時採用はこの相殺のため）
- 却下済み: 無条件除去術式 / 「消耗中への攻撃は必ず破壊」 / デッキ30枚化 / power 3+ 上限 6 枚以上 / 序盤限定コスト割引
- デッキ切れ決着はコントロールの勝ち筋として少量（数%）残す設計

### 構築ルール（デッキをいじるとき）

25 枚 / 同名 2 枚まで / power 3+ は合計 5 枚まで。

## 1. 実装 — TS 単一実装（`src/game.ts` が正）

実装は TypeScript のみ（旧 Python シミュレータは 2026-07-08 に廃止）。ブラウザ UI とシミュレーション CLI
（`src/sim/`）が同じエンジンを共有するため、1 箇所の変更がそのまま両方に反映される。二重反映は不要。

| 変更対象 | ファイル |
| --- | --- |
| カード定義・デッキ | `src/game.ts` |
| ルール処理 | `src/game.ts` / `src/game/actions.ts` |
| CPU 判断 | `src/game.ts`（`CHALLENGER_WEIGHTS` 含む） |
| テスト | `src/game/*.test.ts`（vitest） |

- カード効果を追加・変更したら `src/game/cardEffectCoverage.test.ts` への登録が必須（怠ると unit テストが落ちる設計）
- **チュートリアルの破損確認**: `src/tutorial.ts` は特定カードの ID・コスト・効果・ドロー順に依存した固定進行。
  ルールやカードを変えたら `npx vitest run src/game/tutorial.test.ts` を回し、チュートリアル採用カード
  （教材・練習デッキ）に触れた場合は固定進行を机上で追って詰みがないか確認する
  （前例: コスト=power 化と初心者CPUの防御解禁が、それぞれ別の形でチュートリアルを静かに詰ませた）
- 「挙動を変えていない」と主張するリファクタは、同シードのリーグが変更前後で**ビット一致**することを確認して初めて主張できる（後述の A/B 手順）

## 2. 検証パイプライン

### 2a. リーグ検証（バランスの合否判定）

```bash
npm run sim -- league --games-per-pair 100 --seed <seed> \
  --decks break control fire water wind earth --out tmp/<name>-<seed>
```

- **必ず 2 シード以上**で回す。1 シードでは構成変更の影響とノイズを区別できない
- 集計と合否判定は同梱スクリプトで（分析専用の Python スクリプト。TS CLI の出力 JSON と互換）:

```bash
python3 .agents/skills/ai-break-duel-balance-tuning/scripts/league_report.py tmp/<name>-<seed1> tmp/<name>-<seed2>
```

合格基準: 単色 4 デッキ（fire/water/wind/earth）45-55%、先攻勝率 48-52%。
break/control は多色の競技基準デッキなので単色より高くてよい。

### 2b. 盛り上がり指標（試合展開の質）

勝率が健全でも試合が平坦なら失敗。`simulate` の出力から同梱スクリプトで集計する:

```bash
npm run sim -- simulate --games 1000 --seed <seed> --out tmp/<name>
python3 .agents/skills/ai-break-duel-balance-tuning/scripts/excitement_metrics.py tmp/<name>
```

（`excitement_metrics.py` / `league_report.py` は出力 JSON を読むだけの分析専用 Python スクリプトとして存続）

見る指標: 2点ビハインド逆転率 / 先に2点差をつけた側の勝率（安全圏化の度合い）/ 先制ダメージ手番 /
最大スイング / 平均ターン / 決着形態（lifeout・resource・**draw**・turn_limit）。
**目安値は `docs/balance-history.md` の直近エントリと比較する**（絶対値は改訂ごとに動く）。
draw 率と平均ターンが同時に跳ねたらゲーム長期化のシグナル（前例: 2026-07-08 に draw 0.1%→6.1%。
turn_limit 到達の増加はルール変更の副作用として起票する）。

### 2c. カード別統計（勝ち筋の偏り検出）

`simulate` の `summary.json` 内 `card_usage` にカード別の使用・攻撃・防御イベント数が集計される。
特定カードに勝率が依存していないか、過小カード（使われないカード）がないかをここで見る。

### 2d. ストレスデッキ回帰（コストカーブの破綻検出）

power 帯に偏らせた極端デッキがプリセットに勝ち越さないかのチェック。
詳細な使い方と解釈基準は `npm run balance:cost -- --help` 相当の引数一覧と `docs/design-principles.md`
のストレスデッキ判定基準を参照する。

```bash
npm run balance:cost -- --games-per-order 1000 --seed <seed> --out tmp/<name>.json
```

RISK 判定は勝率 50% 超。単色デッキだけを狩って高勝率になっている場合は break/control 相手の勝率で判断する。

### 2e. CPU プロファイル検証（AI を触ったとき）

```bash
npm run sim -- simulate --games 100 --seed <seed> \
  --first-ai challenger --second-ai beginner --first-deck <a> --second-deck <b> --out tmp/<name>
```

- 初心者の目安: 挑戦者相手に勝率 5-20%、防御が毎試合発生（複数デッキペア×先後で測る）
- **CPU（challenger/beginner）の変更が主目的の作業**でも、採用前に champion pool ガントレット、
  公平性ガード、55% ゲート、計画書駆動の採用判断をこの手順内で完結させる。
  本節はカード/ルール変更のついでに CPU 較正を確認する場合の最小手順で、CPU 主目的なら
  `docs/fair-cpu-followups.md` と `docs/balance-history.md` に世代・数値・却下理由を必ず記録する

### 2f. apex デッキの追随（カード・デッキを大きく触ったとき）

apex（覇王結束）は標準の 6 デッキリーグに**含まれない** 7 番目のプリセットで、自動探索による最強候補という
位置づけ。カードプールやデッキ構成が大きく動いたら、apex が最強候補のままかを再探索で確認する:

```bash
npm run tune:apex -- --pool-size 120 --top 4 --screen-games 4 --league-games 100 \
  --seed <seed> --out tmp/apex-tuning-<seed>.json
```

現行 apex に対して**明確に**（複数シードの直接対決で有意に）勝ち越す候補が出たときだけ差し替える。
僅差なら据え置き（前例: WP2 はランダム120+変異120候補で現行を上回れず据え置き）。

### 2g. 原因分析ファースト（数値をいじる前に。2026-07-08 のリバランス 2 周で確立）

バランス崩れの報告値（「control 71.6%」等）だけを見てカードを触らない。必ずこの順で進める:

1. **分解**: `simulate` の matches.jsonl から勝ち筋/負け筋を分解する
   （決着形態別の勝率、対面別勝率、ブロック率、行動回数差、敗北時の残リソース）
2. **仮説リスト**: 修正仮説を 3〜5 個、**影響の小さい順**に列挙してから着手する
3. **最小変更**: 1 カードの 1 数値 / 1 枚差し替えから。1 変更 = 2 シードリーグで確認
4. **過剰調整の跳ね返りに注意**: ナーフを重ねると帯の反対側へ突き抜ける
   （前例: control 71.6% → 追加弱体で 40% 前後まで転落 → 戻して 53.8% で着地）
5. **系統的な壊れはルール数値を優先**: ストレスデッキが複数の power 帯で同時に RISK になるような
   コストカーブ級の問題は、個別カードのモグラ叩きではなくルール側の修正を検討する
   （前例: power 3/4 の通常登場を消耗状態にするルールで p2-3〜p4 の RISK を一括解消）

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
（変更点の表 or 箇条書き）
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
npm run check   # typecheck + vitest + build（ストレスデッキのガードレール込み）
```

green になるまで完了と言わない。`src/game/costBalance.guard.test.ts` のガードレール上限に引っかかった場合は、
上限を緩める前に「本当にその強さで良いのか」をリーグと盛り上がり指標で確認する。

## 関連スキル

- `.agents/skills/ai-break-duel-balance-regression` — ストレスデッキ回帰の詳細（2d の部品）
- `.agents/skills/ai-break-duel-card-addition` — カードの新規追加（実装・アート・文言まで含む場合はこちら）
- `.agents/skills/ai-break-duel-cpu-improvement` — CPU（challenger/beginner）の改善・強化・悪手修正（2e の本体）
