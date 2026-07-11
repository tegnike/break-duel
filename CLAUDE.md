# CLAUDE.md

Break Duel リポジトリでの開発ルール。

## UI の対応範囲（スマホ非対応）

- ブラウザ UI はデスクトップ（PC ブラウザ）のみを対象とする。
- スマホサイズ（狭幅ビューポート）への対応は一切考慮しなくてよい。モバイル向けは将来ネイティブアプリとして別途開発する予定のため。
- 新しい画面や演出を追加するときも、スマホ用の media query や狭幅レイアウトは追加しない。

## 基本事項

- パッケージ管理は npm 標準。pnpm は使わない（vitest が壊れる。復旧は `npm ci`）。
- 一括チェックは `npm run check`（typecheck + vitest + build）。
- ドキュメントは `docs/` 配下が正本。仕様変更時は docs も更新する。

<!-- BACKLOG.MD GUIDELINES START -->
<CRITICAL_INSTRUCTION>

## Backlog.md Workflow

This project uses Backlog.md for task and project management.

**For every user request in this project, run `npx backlog instructions overview` before answering or taking action.**

Use the overview to decide whether to search, read, create, or update Backlog tasks.

Use the detailed guides when needed:
- `npx backlog instructions task-creation` for creating or splitting tasks
- `npx backlog instructions task-execution` for planning and implementation workflow
- `npx backlog instructions task-finalization` for completion and handoff

Use `npx backlog <command> --help` before running unfamiliar commands. Help shows options, fields, and examples.

Do not edit Backlog task, draft, document, decision, or milestone markdown files directly. Use the `npx backlog` CLI so metadata, relationships, and history stay consistent.

</CRITICAL_INSTRUCTION>
<!-- BACKLOG.MD GUIDELINES END -->
