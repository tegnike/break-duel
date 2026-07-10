---
name: ai-break-duel-cpu-improvement
description: Break Duel の CPU（challenger / beginner）を改善・強化・修正するための専用ワークフロー。「CPUを強くして」「最強CPUを更新して」「CPUの悪手を直して」「beginnerの難易度を調整して」「fair-genの次世代を作って」「ビーム/評価関数/カウンティングを改善して」のような依頼が来たら必ずこのスキルを使うこと。カード・デッキ・ルール側の変更が主目的なら ai-break-duel-balance-tuning を使う（CPU改善の副作用でゲーム側の修正が必要になった場合もそちらに切り替える）。
---

# Break Duel CPU 改善ワークフロー

challenger CPU はバランス検証全体の**計測器**であり、同時にプレイヤーと戦う**製品**。
このスキルは「最強 CPU v1」達成（2026-07-08、fair-gen004）までに確立した作法の蒸留である。
全史と教訓は `docs/strongest-cpu-v1-report.md` に、課題台帳は `docs/fair-cpu-followups.md` にある。

## 0. 着手前チェック（必ず全部やる）

1. **ブランチ**: 作業は正本ブランチ `codex/fair-rebalance-from-public-info`（またはその派生）で行う。
   main には fair CPU が存在しない。main との差分を「未マージの漏れ」と誤解してマージ PR を作らないこと
2. **現行チャンピオンの確認**: `docs/assets/ai-champions/fair/` の最新世代（fair-genNNN）が基準。
   `docs/balance-history.md` 先頭で最新の基準数値を確認する
3. **比較禁止ルール**: 覗き見時代（fair 以前）・旧世代時代の勝率数値と比較しない。基準は常に最新世代の再ベースライン値
4. `npm run check` green + ガードテスト green を確認:
   ```bash
   npm run check
   npx vitest run src/game/aiStrategy.test.ts src/game/tutorial.test.ts
   ```
5. `docs/fair-cpu-followups.md` を読み、着手しようとしている改善が既知課題・再試行禁止に該当しないか確認

## 1. 破ってはいけない原則

- **公平性（最重要）**: CPU の評価・行動選択は**公開情報のみ**を入力とする。
  相手の手札の中身・山札の順序は参照禁止（手札**枚数**・公開デッキリスト・観測履歴は合法）。
  `aiStrategy.test.ts` のガードテスト「公開情報が同一なら行動も同一」が機械的に守る。
  **全変更でこのテストを green に保ち、破れたら即差し戻す**
- **思考時間**: ブラウザで 1 ターン 1 秒未満。探索系を触ったら実ブラウザで平均/最大を実測する
  （参考: fair-gen004 は平均 0.2ms / 最大 2.0ms）
- **決定性**: 同一シードで再現可能。`Date.now()` / `Math.random()` を評価経路に入れない
- **計測器の中立性**: デッキ別の CPU 補正でゲームの歪みを CPU 側に吸わせない（ユーザー判断なしでは禁止）
- **CPU 変更とゲーム変更は別コミット・別検証**（計測器を動かしながら計測しない）

## 2. 採用ゲート（変更の種類で使い分ける）

| 変更の種類 | ゲート |
| --- | --- |
| challenger の強化 | 対現行チャンピオン直接対決 **55% 以上（2 シード一貫）** + デッキ床値非悪化。誤差圏は据え置き |
| challenger の欠陥修正（悪手の除去） | 55% は課さない。**当該悪手の解消**（再現局面での行動改善）+ 対現行**非退行**（全体・床値）+ beginner 較正 5-20% 維持 |
| beginner の難易度調整 | 同一デッキ較正で beginner 勝率 **5-20%**（fire/water/earth、2 シード） |

**beginner 較正割れは challenger 改善の却下理由にしない（2026-07-09 ユーザー決定）**:
challenger の正当な改善（欠陥修正・強化）で beginner 較正が 5% を割った場合、それは
「challenger が本当に強くなった」シグナルであり、**beginner 側の追従再較正を同タームで併走**させて
帯に戻す（前例: beginner の手札防御制限の調整）。challenger 変更と beginner 較正は別コミット。
この帯を challenger の強さの上限として使うと「最強 CPU」の目標と矛盾する。
| 公平性・原則の修正 | ゲートなし（弱体化しても記録の上で採用）。弱体幅を 2 シードで計測・記録 |
| エンジン共通の改善（推定器等） | **現行ガントレットでは勝率計測不能**（候補とチャンピオンの両方に効くため）。基盤改善として採否を判断し、その旨を明記 |

ガントレット:

```bash
npm run gauntlet:ai -- --candidate-json <candidate.json> --games-per-seat 120 --seed <seed> --out tmp/<name>.json
```

- ミラーデッキ先後ペア方式なので**リーグ（デッキバランス）が崩れていても計測は有効**
- 探索内の小標本勝率は信用しない。**必ず独立シードで再確認**（探索 best が独立確認で 5pt 落ちるのは通常）

## 3. 進め方 — 計画書駆動のターム

改善は「計画書 1 枚 = 1 ターム」で回す。過去の計画書（`docs/strongest-cpu*-plan.md` /
`docs/archive/fair-cpu-plan.md`）が形式の見本。必須要素:

1. **冒頭**: ステータス / 「別セッションで着手する人へ」の注意書き（ブランチ・基準・ゲート）
2. **§チェックリストが進行の正**: 1 step 終えるごとにチェック + 判断を行末に追記。
   結果の数値・シード・コマンドをチェックリストに直接書く（これが一次記録になる）
3. **完走ルール**: ゲート未達でも止まらず全トラックを消化する（「失敗 → 記録して次へ」）。
   例外は check/ガードテスト破損とユーザー判断が要る場合のみ。
   コンテキストが苦しくなったら「チェックリスト更新 → コミット → 新セッションが再開」
4. **再試行禁止リスト**: 過去に実証済みの失敗形を計画書に明記する（現行リストは
   `docs/archive/strongest-cpu3-plan.md` §1 と v1 レポート §5 を参照）
5. **順序の原則**: CPU 強化とゲーム側修正が両方あるタームでは、**強化を全部撃ち切ってから
   世界（リーグ・ストレス・較正）を 1 回で直す**（ガントレットはリーグ崩壊の影響を受けないため）

## 4. 採用時の処理（challenger は計測器なので必須）

1. 新世代を `docs/assets/ai-champions/fair/fair-genNNN.json` として凍結し、
   以降のゲート相手（チャンピオンプール）を最新世代に更新
2. **再ベースライン一式**を取り直す:
   - 6 デッキリーグ 2 シード（4101 / 730001）+ league_report
   - 盛り上がり指標（excitement_metrics）
   - ストレスデッキ回帰（`npm run balance:cost` + `npm run test:balance`）
   - beginner 較正（fire/water/earth、2 シード）
   - 必要に応じて apex 再探索（`npm run tune:apex`）
3. リーグ・ストレスが帯外になったら、それは「弱い CPU が隠していた問題」。
   カード/ルール側の課題として `docs/fair-cpu-followups.md` に起票し、
   `ai-break-duel-balance-tuning` の作法で別コミットで直す
4. `docs/balance-history.md` 先頭にエントリ追記（採用も却下も）。
   旧世代基準の数値は以後**比較禁止**になる旨を明記
5. 最終ゲート: `npm run check` + ガードテスト + tutorial テスト green

## 5. 落とし穴集（実際に踏んだものだけ）

- **ビーム探索の多重計上**: 行動スコアに盤面評価が含まれるものを深さ方向に累積すると補助行動が
  多重評価されて自滅する（第 3 次で根本修正済み。終端盤面評価に一本化・浅い系列優先が現行設計）
- **ビーム候補からの「パス」欠落**: 候補を即時スコア上位で絞ると `end`（≒スコア 0）が刈られ、
  「何もしない」が比較できず手札を無駄に吐く（課題 2c。修正時はこの構造を意識する）
- **性能が理不尽に悪いときはバグを疑う**: プランニングは 2 回「弱い」と誤判定された。
  チューニングの前に、自滅試合をシード付きで再現して幅 1 との選択 diff を取る
  （`scripts/diagnoseCpuPlanning.ts` が使える）
- **探索内勝率の過信**: tune:ai の fitness best は独立シードで必ず縮む。独立 2 シード確認を省略しない
- **単独で誤差圏の候補は合成を試す**: 床値落ちで単独不採用の候補同士が、合成で両立することがある
  （fair-gen004 = beam5 + 重み候補の合成で成立した実績）
- **beginner 較正は challenger を触るたびに壊れる**: 強化後は必ず再計測。beginner が challenger に
  勝ち越す場合は「beginner が強い」ではなく「challenger に運用欠陥がある」ことを先に疑う
- **人間プレイテストは最強の検出器**: シミュレーション数千戦が見逃す悪手を 1 戦で見つける。
  実プレイの違和感報告は必ず原因をコードまで追い、followups に起票する

## 6. 主要コマンド

```bash
# ガントレット（候補 vs チャンピオンプール）
npm run gauntlet:ai -- --candidate-json <c.json> --games-per-seat 120 --seed <seed> --out tmp/<name>.json

# 重み探索（複数パス・エリート継承・プール適応度対応）
npm run tune:ai -- --iterations 36 --passes 3 --elite-count 4 --games-per-seat 16 --seed <seed> --out tmp/<name>.json

# プランニング自滅の診断（幅別の選択 diff・スコアトレース）
npx tsx scripts/diagnoseCpuPlanning.ts --seed <seed> --deck <deck> --candidate-json <c.json> --candidate-seat 0 --search 300 --out tmp/<name>.json

# beginner 較正
npm run sim -- simulate --games 100 --seed <seed> --first-ai challenger --second-ai beginner \
  --first-deck <d> --second-deck <d> --out tmp/<name>

# 再ベースライン（リーグ・盛り上がり・ストレス）は ai-break-duel-balance-tuning §2 を参照
```

## 関連資料

- `docs/strongest-cpu-v1-report.md` — 全史・世代の系譜・教訓（最初に読む）
- `docs/fair-cpu-followups.md` — 課題台帳（既知の悪手・監視項目）
- `docs/archive/fair-cpu-plan.md` §1 — 公平性の定義（何が公開情報か）
- `.agents/skills/ai-break-duel-balance-tuning/SKILL.md` — ゲーム側（カード/デッキ/ルール）の調整
