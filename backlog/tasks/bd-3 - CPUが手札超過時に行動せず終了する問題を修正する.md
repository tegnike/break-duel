---
id: BD-3
title: CPUが手札超過時に行動せず終了する問題を修正する
status: Done
assignee: []
created_date: '2026-07-12 07:38'
updated_date: '2026-07-12 07:38'
labels:
  - bug
  - ai
  - balance
dependencies: []
modified_files:
  - src/game.ts
  - src/game/aiStrategy.test.ts
  - scripts/analyzeHumanBattleAi.ts
  - package.json
  - docs/human-battle-logs.md
  - docs/game-spec.md
  - docs/balance-history.md
priority: high
ordinal: 3000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
対人CPU戦ログでは、CPUが終盤に手札上限を超えていても全行動を残したままターン終了し、手札をトラッシュするケースがある。既存AIの判断を保ちながら、明白な手札超過停止だけを防ぐ。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 CPUが全3行動を残し手札上限を超えている場合、合法な手札削減行動があればターン終了より優先する
- [x] #2 通常のbeam7判断と既存CPU挙動を不要に変更しない
- [x] #3 実ログ由来の状態を使った回帰テストが追加される
- [x] #4 全テスト・型検査・ビルド・バランスガードが通る
<!-- AC:END -->



## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
対人戦ログを診断し、beam7が即終了を選ぶ手札超過状態だけに限定した安全介入を追加する。実ログ由来テストと診断スクリプトを整備し、回帰・型・ビルド・バランス検証を行う。
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
4件の対人戦ログを分析。CPU 41ターン中28回が未使用行動を残して終了し、18枚を手札上限超過でトラッシュしていた。限定介入により最悪5状態を救済し、広範な介入案はバランス悪化のため不採用。検証: balance guard 7/7、tests 375件、typecheck、build。
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
CPUが全行動を残した手札超過状態で即終了する場合のみ、合法な手札削減行動を優先する安全策を追加。実ログ診断、回帰テスト、仕様・バランス記録も更新し、全検証を通過。
<!-- SECTION:FINAL_SUMMARY:END -->
