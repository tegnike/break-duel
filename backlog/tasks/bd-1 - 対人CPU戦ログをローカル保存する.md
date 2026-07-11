---
id: BD-1
title: 対人CPU戦ログをローカル保存する
status: Done
assignee: []
created_date: '2026-07-11 20:55'
updated_date: '2026-07-11 20:58'
labels:
  - logging
  - ai-training
dependencies: []
modified_files:
  - src/App.tsx
  - vite.config.ts
  - src/humanBattleLog.ts
  - src/humanBattleLog.test.ts
  - docs/human-battle-logs.md
priority: medium
ordinal: 1000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ローカルで人間がCPUと対戦した記録を、AIが後から検索・解析して方策改善に利用できる構造化JSONLとして自動保存する。画面上のログ閲覧UIは追加しない。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 通常の人間対CPU戦で開始・状態遷移・終了結果が1対局1JSONLへ保存される
- [x] #2 デッキ、各ゾーン、ライフ、行動数、防御・チャージ・攻城状態をカードID中心の構造化データで参照できる
- [x] #3 チュートリアルは対象外で、途中離脱はmatch_abandonedとして識別できる
- [x] #4 保存機能はローカル開発サーバー限定で、本番対戦や画面UIを妨げない
- [x] #5 型チェック、ユニットテスト、ビルドが成功する
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. 最新develop上にローカル保存APIを追加する
2. GameStateをAI解析向けスナップショットへ変換して対局単位で逐次保存する
3. テストと利用ドキュメントを追加する
4. 全チェックと実保存を検証する
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
実装済み。npm run checkで33ファイル371テスト、型チェック、ビルド成功。保存APIへPOSTしてJSONL生成とHTTP 204を確認済み。

最新origin/develop（5f2fceb）へリベース後、npm ciとnpm run checkを再実行。33テストファイル、371テスト、型チェック、ビルドが成功した。
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
通常の人間対CPU戦をAI解析向けJSONLへ逐次保存する開発サーバー専用機能を追加した。完全な対局状態、勝敗、途中離脱を記録し、ユニットテスト・全チェック・実ファイル生成で検証した。
<!-- SECTION:FINAL_SUMMARY:END -->
