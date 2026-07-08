# 最強 CPU 第 3 次計画・手順書 — 総力戦: 4 トラック完全消化

作成日: 2026-07-08
ステータス: 完了（2026-07-08。fair-gen003 採用、副作用あり）
進行状況: **§8 のチェックリストが正**。作業を進めたら必ず §8 を更新すること
前提: `docs/strongest-cpu2-plan.md`（第 2 次・完了）まで全て。基準は fair-gen002（重みは fair-gen001 と同一）

実施結果サマリ:

- 採用: P トラックの beam 根本修正 + `turnPlanBeamWidth=3`。`docs/assets/ai-champions/fair/fair-gen003.json` を凍結
- 採用: C トラックの公開既知手札カウンティング。勝率準リードではなく、公開情報推定の基盤改善として保持
- 不採用: R トラック単独、P+R 合成。いずれも P 単独 beam3 より弱い
- 最終ベースライン: fair champion 直接対決は 69% 台で突破。ただし 6 デッキリーグは earth 70.2% / wind 62.5% / water 36.9% / control 39.1%、ストレス p2-3/p3/p3-4/p4 は RISK、earth beginner は 2.0% で下限未達
- 記録先: `docs/strongest-cpu3-results.md` と `docs/balance-history.md`。副作用は `docs/fair-cpu-followups.md` に後続課題として記録

> **別セッションで着手する人へ（最初に読む）**
>
> 1. 作業ブランチは **`codex/fair-rebalance-from-public-info`（正本）またはその派生**。main は使わない
> 2. 公平性の定義は `docs/fair-cpu-plan.md` §1。`aiStrategy.test.ts` のガードテスト
>    （公開情報同一 → 行動同一）は全変更で green 維持。作法・コマンドは
>    `docs/strongest-cpu-plan.md` §8/§10 と `docs/fair-cpu-results.md` 末尾
> 3. **この計画は途中で止めない**。§1 の完走ルールを最初に読むこと

## 0. 目的と、今回のやり方が過去と違う点

過去 3 計画で challenger 強化は全滅し、線形+貪欲の局所最適への到達がほぼ実証された。
一方で以下の**未回収の手がかり**が残っている:

- **[リードA]** 第 2 次 S1 の「resource 極振り」候補が対 fair-gen001 直接対決 **54.8%**（歴代最接近。
  beginner 較正未達で落ちたが、較正は beginner 側修正で解決済みのため**再挑戦の障害が消えている**）
- **[リードB]** beam 異常（幅 3 の思考時間が幅 1 より短い・勝率 30% 前後への自滅）は
  実装バグの症状に見えるが、**一度も根本原因調査をしていない**
- **[リードC]** カードカウンティング本実装（観測追跡 + ブロック確率化）は 2 計画連続で
  「重みスケール変更」に置き換えられ、**本体は未実装のまま**
- **[リードD]** S0 診断で判明した構造的弱点「長期戦で資源を焼き尽くす」は未解消
  （beginner 較正では隠しただけ。手札温存の消耗戦で人間にも突かれ得る）

本計画はこれらを **4 トラックの総力戦**として 1 ターム で全部消化する。

## 1. 完走ルール（今回の最重要ルール）

- **トラック P → R → C → X の順に、失敗しても止まらず全トラックを消化する**。
  「ゲート未達 → 計画終了」ではなく「ゲート未達 → 記録して次のトラックへ」
- 例外は 2 つだけ: `npm run check` / ガードテストが直せない形で壊れた場合（即差し戻し）と、
  ユーザーへの確認が必要な仕様判断が出た場合
- 各トラックの成果（採用/不採用/学び）は必ずチェックリストに 1 行以上残す。
  途中でコンテキストが苦しくなったら、チェックリスト更新 → コミット → 続きは新セッションで再開してよい
  （そのための進行記録である）
- 再試行禁止（過去実証済みの失敗形）: 素朴ビーム（原因調査なしの再実装）、監査由来の単発特徴、
  `publicHandDefenseWeight` の**あらゆる**単純スケール変更、壊れたメタ時代の探索結果の流用

## 2. トラック P — プランニングの根本解決（リードB→本命）

**P1: beam 異常の根本原因調査**（コード変更はデバッグ用に限る）

1. 幅 2 で challenger が自滅負けする試合を 1 つ特定（シード付きで再現可能にする）
2. 同一局面で幅 1 と幅 2 の選択系列を diff し、**最初に選択が分かれた手**のスコア内訳をトレース
3. 疑うべき箇所（順に）: 系列中の攻撃価値の**時点不整合**（攻撃は実行時点、盤面はターン終了時点で
   評価される二重取り/取りこぼし）、乱数打ち切りの評価落差、`spentFieldIndexes` 等の
   状態コピー漏れ、系列シミュレーション中の副作用
4. 思考時間計測の矛盾（幅 3 平均 1.4ms < 幅 1 平均 2.1ms）の原因を特定
   （計測バグか、幅 3 が異常に早く投了性の悪手を選ぶ短期化か）
5. **成果物: 原因の文書化**（§8 に記録）。修正可能なバグなら修正して単体テスト追加

**P2: プランニング第 3 次実装**（P1 で原因が特定できた場合のみ。3 変種まで試す）

- 変種例: ①攻撃価値をターン終了評価に一本化 ②系列中の資源消費に明示ペナルティ
  ③乱数効果を「打ち切り」でなく「期待値の下界で継続」
- 各変種: ビーム幅 1 = 現行の等価テスト → ガントレット 2 シード → 55% ゲート
- 思考時間実測（1 秒制約）と tutorial テストを忘れない

## 3. トラック R — resource 極振りの回収（リードA+D。最有望・最安）

1. 第 2 次の `tmp/strongest-cpu2-s1/race-resource-screen.json` 相当の候補（h2h 54.8%）を復元し、
   **beginner 較正済みの現環境で**独立 2 シード再計測（較正未達で落ちた候補の再審理）
2. 54.8% 候補を初期エリートにして近傍を集中探索
   （`npm run tune:ai` のエリート継承を利用、変異幅を小さく）
3. 資源系重み（`deckOutPressure` / `lifeRacePressure` / `handCard` 等）の複合変更を
   グリッドで 6〜10 点試す（単発変更は過去に失敗済み。**複合**が今回の新規性）
4. ゲート: 通常の 55%（2 シード）。54% 台で一貫する候補は「準リード」として X トラックへ回す
5. 採用の有無に関わらず、弱点D（資源焼き尽くし）が改善したかを earth ミラー消耗戦の
   再診断（第 2 次 S0 と同じ計測）で確認し、`docs/fair-cpu-followups.md` に
   「challenger の既知弱点」として現状を明記する（未解消なら未解消と書く）

## 4. トラック C — カードカウンティング本実装（リードC。今度こそ本体を作る)

**禁止事項を先に**: `publicHandDefenseWeight` のスケール変更は実装に含めない。作るのは推定の**中身**。

1. 観測追跡: 対戦中に公開された情報（プレイ・防御・トラッシュ・効果で公開されたカード）から
   「相手デッキリスト − 観測済み」の残候補集合を維持する（公開情報のみ。ガードテストで保証）
2. ブロック確率化: 攻撃評価を「手札防御される/されない」の二値期待値から、
   **この攻撃が止まる確率 p を残候補と手札枚数から見積もり、p で加重した期待値**に変える
3. 段階検証: 推定器単体の精度テスト（実対戦ログで p の較正誤差を計測）→ 行動選択への接続 →
   ガントレット 2 シード → 55% ゲート
4. 未達でも 52% 超なら準リードとして X トラックへ

## 5. トラック X — 合成テスト（過去 3 計画で一度もやっていない新手）

過去の全候補は**単独**でしか検証されていない。誤差圏（50-54%）の候補同士が
直交する弱点を突いている場合、合成で 55% を超える可能性がある。

1. P/R/C の採用候補・準リード（52% 以上）を列挙する
2. 2 個組み合わせ → 3 個組み合わせの順にガントレット（組み合わせ爆発を避けるため
   準リードは各トラック最大 2 個まで）
3. ゲート: 55%（2 シード）+ 床値非悪化
4. 合成採用時は必ず**切り分け再計測**（どの成分が効いたか、単独値も再記録）

## 6. 採用処理と最終総括

- 採用が出たら: `fair-gen003` 凍結 → 再ベースライン一式（リーグ 2 シード + 盛り上がり +
  ストレスデッキ + beginner 較正）→ balance-history 記録。リーグが帯外になったらカード側課題起票
- **全滅した場合の総括義務**: 本計画は「線形アーキテクチャの限界実証」の最終試行を兼ねる。
  P/R/C/X が全て 55% 未達なら、`docs/strongest-cpu-plan.md` §9 の再検討条項に基づき、
  「線形の限界が実証された。次の選択肢は (a) NN 評価関数の解禁検討 (b) 現状を天井として受け入れ、
  以後はコンテンツ拡張に集中」の判断材料（各選択肢のコスト・制約への影響）を
  結果ドキュメントに書き、**ユーザーの判断を仰ぐ**（勝手に NN へ進まない）

## 7. 想定作業量の目安

1 ターム = このチェックリスト全消化。トラック P の調査（P1）は数試合のトレースで安価、
R は探索の回し直しが主で計算時間が支配的、C は実装が主、X は R/C の結果次第。
どこかで疲弊したらチェックリスト更新 + コミットで中断し、次セッションが §8 から再開する。

## 8. 進行状況チェックリスト（作業のたびに更新すること）

### Step 0 — 着手準備

- [x] 0-1. 正本ブランチ（または派生）であることを確認 → ブランチ: `codex/fair-rebalance-from-public-info`（worktree: `.claude/worktrees/fair-cpu-public-info`）
- [x] 0-2. `npm run check` green + ガードテスト green → `npm run check` green（typecheck + unit 19 files / 285 tests + build）。`npx vitest run src/game/aiStrategy.test.ts src/game/tutorial.test.ts` green（2 files / 15 tests）
- [x] 0-3. 基準の確認: fair-gen002 プール、リーグ最終表（fair-rebalance-results.md）→ fair-gen002 は challenger 重み fair-gen001 同一。最終リーグ平均: break 49.2% / control 53.8% / fire 48.1% / water 47.9% / wind 47.8% / earth 51.4%、先攻 47.7%。beginner 較正: fire 11.8% / water 12.0% / earth 15.5%

### Step 1 — トラック P: beam 異常の根本解決（§2）

- [x] 1-1. 幅 2 自滅試合の特定と再現手順の記録 → 再現: `npx tsx scripts/diagnoseCpuPlanning.ts --seed 940001 --deck water --candidate-json tmp/fair-beam2.json --candidate-seat 0 --search 300 --out tmp/strongest-cpu3-p/beam2-water-seat0.json`。旧 beam2 は seat0 water で 2-7 負け、最初の分岐は turn 3
- [x] 1-2. 幅 1 との選択 diff + スコア内訳トレース → 分岐点: turn 3 / actions 3。幅1は `play index 0`（即時 313.62 / 終端 169.02）、旧 beam2 は `command index 4 -> upgrade -> memory`（累積 811.46 + 終端 108.92）を選択
- [x] 1-3. 思考時間計測の矛盾の原因特定 → 原因: 旧計測の「幅3が幅1より速い」は実装上の高速化ではなく、弱い系列で試合・分岐が短くなるサンプル偏り。固定後の同 seed 診断では平均 beam1 0.51ms / beam2 2.56ms / beam3 2.01ms で、1 秒制約内
- [x] 1-4. **根本原因の文書化**（バグ/設計不備/その他）→ 結論: 設計不備。`scoreAiAction` が毎手 `boardAiScore` を含むのに、beam が深さごとに累積し、さらに終端盤面を加算していたため、ドロー/補助行動/アップグレードが盤面・手札価値を多重計上していた。加えて、チャージ後に増えるアクションを `game.actionsRemaining + 1` の深さ上限で読めず、同点時に深い系列を優先して無意味な資源消費を選んでいた
- [x] 1-5. （修正可能なら）修正 + 単体テスト → 結果: beam 比較を終端盤面評価に一本化、探索深さを `CONFIG.actionsPerTurn + 1` に固定、同点時は浅い系列優先。`src/game/aiStrategy.test.ts` に seed 940001 の回帰テスト追加。`npx vitest run src/game/aiStrategy.test.ts src/game/tutorial.test.ts` green（2 files / 16 tests）
- [x] 1-6. （P1 で原因特定できた場合のみ）プランニング変種を最大 3 つ実装・ガントレット → 結果: 終端評価 + 固定深さ + 浅い tie-break を検証。beam2: seed 951001 pool 66.2% floor 55.4%、seed 952001 pool 63.9% floor 50.6%。beam3: seed 951001 pool 69.1% floor 55.4%、seed 952001 pool 69.2% floor 55.1%
- [x] 1-7. 55% 判定 → 判定: beam3 が 2 シードとも 55% を大幅超過し採用候補。全トラック完走ルールにより final 凍結は Step 5 で実施し、Step 4 の合成候補にも含める

### Step 2 — トラック R: resource 極振りの回収（§3）

- [x] 2-1. 54.8% 候補の復元と現環境での再審理（2 シード）→ 結果: 第 2 次 S1 の `surviveMode`（`deckOutPressure:120`, `handCard:90`, `fieldPresence:70`, `classicPrior:180` 等）を復元。seed 953001 は pool 52.7% / floor 48.9%、seed 954001 は pool 51.7% / floor 48.1%。旧 54.8% は再現せず
- [x] 2-2. 候補を初期エリートにした近傍集中探索 → best: `survive-neighborhood-best`。探索内 small-sample は pool 56.9% / floor 46.9% まで出たが、独立 seed 956001 は pool 51.7% / floor 49.1%、seed 957001 は pool 53.4% / floor 50.6%。55% ゲート未達
- [x] 2-3. 資源系重みの複合グリッド 6〜10 点 → best: 8 点グリッドの best は `resource-grid-d`（seed 958001, pool 52.7% / floor 48.9%）。次点は `resource-grid-c`（52.6% / 48.9%）。race/control/tempo 系も 55% 未達
- [x] 2-4. 55% 判定 → 判定: R 単独採用なし。54% 台で一貫する候補もなし。Step 4 には準リードとして `resource-grid-d` と `survive-neighborhood-best` を最大候補扱いで回すが、堅い候補ではない
- [x] 2-5. 弱点D（資源焼き尽くし）の再診断と followups への現状明記 → 状態: `scripts/diagnoseResourceBurn.ts` で fire/water/earth を seed 4101/730001・各 400 戦診断。beginner 勝率は 10.5% / 11.25% / 18.5% で帯内だが、water は challenger 敗北 45 件中 29 件、earth は 74 件中 39 件が resource_exhaustion。`docs/fair-cpu-followups.md` に未解消弱点として追記

### Step 3 — トラック C: カードカウンティング本実装（§4）

- [x] 3-1. 観測追跡の実装（公開情報のみ・ガードテスト保証・単体テスト）→ 結果: `PlayerState.knownHandCards` を追加し、トラッシュ/場から手札へ戻った公開カード（relearn / earth_rite / salvage / recover-on-play / recover-on-defense / charge recover / overheat return 等）を追跡。通常ドローなど非公開情報は追跡しない。`aiStrategy.test.ts` に「隠し手札同一性は読まず、公開既知手札だけ評価に反映する」単体テストを追加し、ガード + tutorial green
- [x] 3-2. ブロック確率 p の推定と較正誤差計測 → 誤差: `scripts/diagnoseHandDefenseCounting.ts --games 240 --seed 970001`。22,739 サンプル、MAE 0.274、Brier 0.145。既知手札サンプル 2,198 件では actual defense rate 93.7%。p bucket は 0.00-0.25: 16.1%、0.25-0.50: 31.2%、0.50-0.75: 50.3%、0.75-1.00: 91.1%
- [x] 3-3. 攻撃評価への接続 + ガントレット 2 シード → 結果: `estimatePublicHandDefenseProbability` を攻撃評価に接続済み。C はエンジン側推定改善であり重み差候補ではないため、fair-gen002 重み vs fair champions では seed 971001 / 972001 とも pool 50.0% / floor 50.0%（同じコード上で champion 側も同じ推定を使う）
- [x] 3-4. 55% 判定 → 判定: C 単独の勝率リードなし。準リードとしては Step 4 に回さない。ただし公開情報カウンティング本実装は採用可能な基盤改善として保持

### Step 4 — トラック X: 合成テスト（§5）

- [x] 4-1. 準リード一覧の確定（各トラック最大 2 個）→ 一覧: P=`fair-beam3`（採用候補、seed 951001/952001 で pool 69.1%/69.2%、floor 55.4%/55.1%）。R=`resource-grid-d` / `survive-neighborhood-best`（52-53% の弱い準リード）。C=勝率準リードなし
- [x] 4-2. 2 個合成のガントレット → 結果: `beam3-resource-grid-d` は seed 981001 pool 67.4% / floor 50.9%、seed 982001 pool 65.4% / floor 50.0%。`beam3-survive-neighborhood` は seed 981001 pool 67.9% / floor 51.3%、seed 982001 pool 68.2% / floor 54.1%
- [x] 4-3. （有望なら）3 個合成 → 結果: C は勝率準リードではなく、R 合成も P 単独より floor/pool を下げたため実施しない
- [x] 4-4. 55% 判定 + 採用時は切り分け再計測 → 判定: 合成は 55% を超えるが、P 単独 beam3（pool 69% 台、floor 55% 台）より弱い。採用は P 単独、R 合成は不採用

### Step 5 — 採用処理 / 最終総括（§6）

- [x] 5-1. 採用あり: fair-gen003 凍結 + 再ベースライン一式 + balance-history 記録 → 結果: `docs/assets/ai-champions/fair/fair-gen003.json` を追加し、`CHALLENGER_WEIGHTS.turnPlanBeamWidth=3` を既定化。リーグ 2 シード、盛り上がり、ストレスデッキ、beginner 較正を実施。`docs/balance-history.md` に採用エントリを追加
- [x] 5-2. 全滅の場合: 線形限界の総括と (a)NN 解禁検討 / (b)天井受容 の判断材料を
      結果ドキュメントに記載（勝手に進めず、ユーザー判断待ちで終了）→ 記載先: 全滅ではない。P トラックで採用が出たため、`docs/strongest-cpu3-results.md` には「次は NN 解禁ではなく fair-gen003 前提のカード/デッキ再調整または deck-specific CPU 補正」と記載
- [x] 5-3. **最終ゲート**: `npm run check` green + ガードテスト green + tutorial green → `npm run check` green（typecheck + unit 19 files / 287 tests + build）。`npx vitest run src/game/aiStrategy.test.ts src/game/tutorial.test.ts` green（2 files / 17 tests）
- [x] 5-4. 本計画書のステータス更新 + 実施結果サマリを冒頭に追記 + コミット → `Adopt fair-gen003 beam planning` を作成済み
