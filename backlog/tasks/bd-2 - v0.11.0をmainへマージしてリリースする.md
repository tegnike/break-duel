---
id: BD-2
title: v0.11.0をmainへマージしてリリースする
status: In Progress
assignee: []
created_date: '2026-07-11 21:50'
labels:
  - release
dependencies: []
priority: high
ordinal: 2000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
developの対人CPU戦ログ機能をmainへ直接PRで取り込み、v0.11.0としてタグ付け・GitHub Release公開し、release後にdevelopをmainへ同期する。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 developからmainへの通常PRがレビュー・CI確認後にマージされる
- [ ] #2 docs/releases/v0.11.0.mdが正本として追加される
- [ ] #3 v0.11.0注釈付きタグとGitHub Releaseが公開される
- [ ] #4 origin/developとorigin/mainがリリースコミットまで同期する
- [ ] #5 npm run checkと関連CIが成功する
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. GitHub refs・認証・CI・既存PRを確認する
2. main専用コミットをdevelopへ取り込み、developからmainへ直接PRを作成する
3. レビュー後にマージし、clean main worktreeでv0.11.0ノートを作成・検証・コミットする
4. タグとGitHub Releaseを公開する
5. developをmainへfast-forward同期して最終確認する
<!-- SECTION:PLAN:END -->
