# docs 索引 — どれを読めばいいか

最終更新: 2026-07-10（スワーム対策ターム完了時点）

## いま効いている正本（常に最新に保つ 4 冊）

| ドキュメント | 役割 |
| --- | --- |
| [game-spec.md](game-spec.md) | 現行ルールの正仕様（時計世界: ライフ判定・手札上限 6・衰弱・手札防御 power3 以下） |
| [design-principles.md](design-principles.md) | 設計原則・**却下済み案/廃案リスト**（新しい提案の前に必読） |
| [balance-history.md](balance-history.md) | 採用/却下の全判断ログ。**先頭エントリが現在の基準数値** |
| [fair-cpu-followups.md](fair-cpu-followups.md) | 課題台帳（監視項目の現在地: p2-3 / p3 / 先攻 / fire 上端 / break） |

補助の正本: [architecture.md](architecture.md) / [collection-spec.md](collection-spec.md) /
[set2-design.md](set2-design.md) / [evolution-design.md](evolution-design.md)

## 物語を知りたい人へ（総括レポート）

1. [strongest-cpu-v1-report.md](strongest-cpu-v1-report.md) — **前編**:
   最強 CPU 計画 → 覗き見発覚と公平化 → リバランス → beam 突破 → 最強 CPU v1 達成
2. [endgame-redesign-report.md](endgame-redesign-report.md) — **後編**:
   「にらめっこ」均衡の発覚 → 終盤設計改訂 全 5 弾 → 時計世界の本採用（+ 末尾に「その後」追記）

## 歴史的記録（計画書 = 一次記録。§チェックリストに全試行と数値）

各計画書は「別セッションが単体で実行できる手順書」として書かれ、完了後は結果が同じファイル
（または対の results）に記録されている。時系列順:

全 24 ファイルは [docs/archive/](archive/) 配下に保管されている（一次記録として保存、参照時は下表からたどる）。

| # | ターム | 計画書 | 結果 | 成果 |
| --- | --- | --- | --- | --- |
| 1 | 最強 CPU 第 1 次 | [strongest-cpu-plan.md](archive/strongest-cpu-plan.md) | [results](archive/strongest-cpu-results.md) | ガントレット計測基盤。強化候補は全滅 |
| 2 | CPU 公平化（B案） | [fair-cpu-plan.md](archive/fair-cpu-plan.md) | [results](archive/fair-cpu-results.md) | 覗き見除去、fair-gen001、ガードテスト常設 |
| 3 | 公平基準リバランス | [fair-rebalance-plan.md](archive/fair-rebalance-plan.md) | [results](archive/fair-rebalance-results.md) | control 71.6% 等の隠れた崩れを回収 |
| 4 | 最強 CPU 第 2 次 | [strongest-cpu2-plan.md](archive/strongest-cpu2-plan.md) | 計画書内 | beginner 較正（fair-gen002）。資源焼き尽くし弱点の発見 |
| 5 | 最強 CPU 第 3 次（総力戦） | [strongest-cpu3-plan.md](archive/strongest-cpu3-plan.md) | [results](archive/strongest-cpu3-results.md) | beam バグ根本解決 → fair-gen003（初の 55% 突破） |
| 6 | 最強 CPU 第 4 次 | [strongest-cpu4-plan.md](archive/strongest-cpu4-plan.md) | [results](archive/strongest-cpu4-results.md) | fair-gen004（beam5 合成）+ 世界再構築 → **最強 CPU v1 宣言** |
| 7 | 遺物連打の修正 | 課題 2c（followups） | [不採用実験](archive/fair-gen005-end-beam-results.md) / [採用](archive/fair-gen005-results.md) | fair-gen005（パスの習得）→ にらめっこ均衡が発覚 |
| 8 | 終盤設計改訂 第 1〜5 弾 | [1](archive/endgame-redesign-plan.md) / [2](archive/endgame-redesign2-plan.md) / [3](archive/endgame-redesign3-plan.md) / [4](archive/endgame-redesign4-plan.md) / [5](archive/endgame-redesign5-plan.md) | [第 1 弾 results](archive/endgame-redesign-results.md)、以降は各計画書内 | ルール探索（時計・防御制限・攻撃制限の比較検証） |
| 9 | 終盤設計 本採用 | [endgame-adoption-plan.md](archive/endgame-adoption-plan.md) | 計画書内 | **時計世界の既定化**（コアルール 4 件） |
| 10 | 最強 CPU 第 5 次 | [strongest-cpu5-plan.md](archive/strongest-cpu5-plan.md) | [results](archive/strongest-cpu5-results.md) | fair-gen006（beam7 + 時計世界重み + 手札上限評価） |
| 11 | スワーム対策・既存カード再調整 | [swarm-answer-plan.md](archive/swarm-answer-plan.md) | [results](archive/swarm-answer-results.md) | 条件付きアンチスワーム 3 枚 + TIDE-EDGE 適正化。世界再収束 |

## 現在地とバックログ（2026-07-10）

- CPU: **fair-gen006**（`assets/ai-champions/fair/` に全世代凍結）
- 基準数値: balance-history 先頭（fire 55.0 / water 45.9 / wind 52.6 / earth 47.7、先攻 47.9%、
  p2-3 51.98%（break/control 合算 52.70%、60% 警報線内監視））
- バックログ: [Issue #32](https://github.com/tegnike/break-duel/issues/32)（break 浮上 + p2-3 残余回答）/
  [Issue #29](https://github.com/tegnike/break-duel/issues/29)（手札上限のプレイヤー選択 UI）/
  main 統合判断（ユーザー保留）

## 作法（新しいタームを始める人へ）

- CPU を触る → `.agents/skills/ai-break-duel-cpu-improvement/SKILL.md`
- カード/デッキ/ルールを触る → `.agents/skills/ai-break-duel-balance-tuning/SKILL.md`
- 作業ブランチは **`codex/fair-rebalance-from-public-info`（正本）**。main は使わない
- 世代・時代をまたぐ勝率数値の比較は禁止（基準は常に balance-history 先頭）
