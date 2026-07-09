---
name: ai-break-duel-release
description: ai-break-duel（Break Duel）リポジトリでバージョンタグ付けとGitHubリリース作成を最初から最後まで実行するワークフロー。「リリースして」「タグを切って」「vX.Y.Z にして」「リリースノートを書いて」「バージョンを上げて」のような依頼が来たら必ずこのスキルを使うこと。タグだけ・ノートだけの部分的な依頼でも、リリースに関する作業ならこのスキルの対象。
---

# Break Duel リリースワークフロー

バージョンタグ付けと GitHub リリースノート作成を、事前検証つきで一貫して行う。
リリースノートの正本は `docs/releases/vX.Y.Z.md` に置く（docs 正本ルール）。
GitHub Release は同じ内容の配信面として作成する。

## 1. バージョン番号を決める

セマンティックバージョニング（`v` プレフィックス付き）を使う。

- **major**: ルールやセーブデータの互換性が壊れる変更
- **minor**: カード追加・新メカニクス・UI 機能追加など後方互換の機能追加
- **patch**: バグ修正・バランス数値調整・文言修正のみ

ユーザーがバージョンを指定していればそれに従う。指定がなければ前回タグからの
変更内容（feat があれば minor、fix のみなら patch）を根拠に提案し、確認を取る。

## 2. 事前チェック

すべて満たしてから先へ進む。満たせない場合は理由を報告して停止する。

```bash
git status --short            # 未コミットの変更がないこと
git branch --show-current     # main であること
git fetch && git status -sb   # origin/main と同期していること（ahead/behind なし）
git tag                       # 予定バージョンが既存タグと重複しないこと
npm run check                 # typecheck + vitest + build 全合格
gh run list --branch main -L 3  # 直近の CI が成功していること（実行中なら完了を待つ）
```

注意: このリポジトリは npm 標準。pnpm は使わない（vitest が壊れる）。

## 3. 変更内容を収集する

```bash
git describe --tags --abbrev=0   # 前回タグ（初リリース時は存在しない）
git log <前回タグ>..HEAD --oneline   # 初リリース時は git log --oneline で全履歴
```

コミットプレフィックス（feat / fix / chore / docs / refactor / test）で分類する。
コミットメッセージの本文（`git log --format='%h %s%n%b'`）や
`docs/balance-history.md` も参照して、プレイヤー目線の変化を拾う。

## 4. リリースノートを書く

`docs/releases/vX.Y.Z.md` を以下のテンプレートで作成する。
読者は「このゲームを遊ぶ人」。内部実装の詳細より、遊んで分かる変化を優先して書く。

```markdown
# vX.Y.Z (YYYY-MM-DD)

ひとこと要約（このリリースで何が変わるかを1〜2文で）。

## ハイライト

- プレイヤーに一番影響が大きい変更を2〜4個

## 変更点

### 新機能・カード
- feat 系の変更（なければセクションごと省く）

### バランス調整
- 数値・ルール調整（docs/balance-history.md と整合させる）

### 修正
- fix 系の変更

### その他
- chore / docs / 開発基盤

## 検証

- npm run check の結果（テスト件数）と CI の状態
```

日付はコミット日ベースの実際の日付を使う。誇張せず、コミットに裏付けのある内容だけを書く。

## 5. タグ付けとリリース作成

リリースノートのコミット → 注釈付きタグ → push → GitHub Release の順で実行する。
（ノートを先にコミットすることで、タグがノートを含む状態になる）

```bash
git add docs/releases/vX.Y.Z.md
git commit -m "docs: vX.Y.Z リリースノートを追加"
git tag -a vX.Y.Z -m "vX.Y.Z: ひとこと要約"
git push origin main --follow-tags
gh release create vX.Y.Z --title "vX.Y.Z" --notes-file docs/releases/vX.Y.Z.md
```

## 6. 完了報告

リリース URL（`gh release view vX.Y.Z --json url -q .url`）、タグ、
ノートの場所を報告する。CI がタグ push で走る場合はその状態も添える。
