# 終盤設計改訂 第五弾・手順書 — 最後の 1 指標: 攻撃回数制限で p2-3 を締める

作成日: 2026-07-09
ステータス: A1 不合格。ノブ 2 種も不合格。A2 は既存土台に含まれるため、ユーザー判断待ち
進行状況: **§7 のチェックリストが正**。作業を進めたら必ず §7 を更新すること
前提: 第一〜四弾すべて完了。第四弾（`docs/endgame-redesign4-plan.md`）で残った不合格は
**p2-3 ストレスただ 1 つ**。ユーザー決定（2026-07-09）: ルール追加候補 ①攻撃回数制限を採択

> **別セッションで着手する人へ（最初に読む）**
>
> 1. 作業ブランチは **`codex/fair-rebalance-from-public-info`（正本）またはその派生**。main は使わない
> 2. CPU は fair-gen005 凍結。全ガードテスト green 維持
> 3. 土台 = **P4c3 ルール + 第四弾のデッキ変更**（コミット 8343a16 に収録済み:
>    fire `AI-FIRE-4D → AI-FIRE-1B` / water `CMD-WATER-RITE → CMD-TIDE-EDGE`,
>    `AI-WATER-4 → AI-WATER-3D` / wind `AI-WIND-4B → AI-WIND-3`）。**この土台は変更禁止**
> 4. デッキ側の p2-3 対策は第四弾 B1〜B7 で試行済み・全滅（シーソー実証）。
>    デッキでの再挑戦はしない

## 0. 背景 — あと 1 指標

第四弾終了時点の成績（P4c3 + 新デッキ）:

- **合格**: 単色帯全 PASS（fire 48.8 / water 46.7 / wind 51.8 / earth 47.4）、
  break 48.2 / control 54.0、**先攻 48.6%**、draw / 平均ターンは P4c3 基準で帯内
- **不合格（唯一）**: p2-3 ストレス 58-59%（break/control 合算 55%。基準は合算 50% 以下）
- **未計測**: 最終パッケージ（新デッキ込み）の盛り上がり指標（第四弾 Step 5-1 が未実施のまま停止）

p2-3（中型スワーム）が時計世界で構造的に強い理由: 遅いデッキが長期戦で磨り潰す時間が
もう存在せず、3 アクション全部の連打を防御 1 回/ターンでは受け切れないため。

## 1. 土台（本計画中は固定）

- ルール: C0（ライフ判定 + 手札上限 6）+ P1（衰弱 1）+ P4c3（手札防御 power3 以下）
- デッキ: 第四弾の変更 3 件（上記ヘッダー参照）を含む現行プリセット
- 全計測に `--endgame-package p4c3`（+ 本計画の追加ルールフラグ）を付ける。既定値化は最終合格後のみ

## 2. 追加ルール候補

### A1 — 攻撃回数制限（本命。ユーザー採択済み）

- **プレイヤーへの攻撃（attack）は 1 ターンに 2 回まで**。STRIKE（召喚獣への攻撃）は制限しない
  - 狙い: スワームの勝ち筋（3 連打の顔面ダメージ）だけを削る。通常デッキはほぼ 2 回以下しか
    殴らないため巻き添えが小さい。盤面での応酬（STRIKE）は自由なままにして受け側の反撃を殺さない
  - プレイヤー向けの一行ルール「攻撃は 1 ターン 2 回まで」で説明できる可読性
- 実装: `CONFIG.attacksPerTurnLimit`（既定 null = 無制限）をフラグ化し、合法手生成と
  実行処理に反映。単体テスト（3 回目の攻撃が非合法になる、STRIKE は数えない）を追加
- **ノブ**（A1 が惜しい場合のみ）: 回数 3 回版 / STRIKE も数える版

### A2 — power3 遅延回復（バックアップ。A1 不合格時のみ）

- 攻撃した power3 召喚獣は、次の自ターン開始時に回復しない（1 ターン遅れて回復）
- A1 が p2-3 に効かない・または副作用（逆転率やリード交代の悪化）が大きい場合のみ実装

## 3. 合格条件（最終パッケージへの一括判定。全項目必須）

**一次**: draw ≤2% / 平均ターン 20〜30 / **full ストレス全候補 OK（p2-3 の break/control 合算 50% 以下）**

**二次**: リード交代 50% 以上 / 2 点ビハインド逆転 30〜45% / スノーボール 70% 以下 /
単色 4 デッキ 45-55% / 先攻 48-52% / beginner 較正 5-20%（fire/water/earth、2 シード）

**盛り上がり指標は必ず再計測する**（第四弾でスキップされた項目。break vs control 1000 戦）。

## 4. CPU の扱い

- fair-gen005 凍結。A1 は合法手の変更なので、合法手生成に反映されれば beam は自然に追従する。
  評価重みの変更は不要（してはいけない）
- 全ガードテスト（公開情報同一 → 行動同一 + セット札中身無視）green 維持

## 5. 合格 → 承認 → 本採用

1. §3 の全ゲート合格の比較表を作成し、**ユーザーへ報告・承認を待つ**
2. 承認後の本採用（第四弾 §4 の内容を継承）:
   - ルール一式の既定値化（C0 + P1 + P4c3 + A1）+ カードテキスト / UI 文言 / チュートリアル確認
   - `docs/game-spec.md` / `docs/design-principles.md` 改訂（手札上限 6・衰弱・ライフ判定・
     手札防御 power3 以下・攻撃 2 回制限・「デッキ切れ決着少量」原則の改訂）
   - beginner 較正 5-20% 確認（割れたら追従再較正・別コミット）
   - apex 再探索（新世界の最強候補確認）+ `npm run test:balance` ガードレール更新
   - `docs/balance-history.md` に「終盤設計改訂（全 5 弾）」エントリ +
     followups の膠着・draw・長期化課題を全クローズ
3. 最終ゲート: `npm run check` + 全ガードテスト + tutorial green
4. 本採用後の次期作業（本計画には含めない）: 新世界向け CPU 再強化（fair-gen006 候補の
   重み再探索）を別計画で起案

## 6. 不合格時の手続き

1. A1（+ ノブ）が不合格 → A2 を同じゲートで検証
2. A2 も不合格 → 試行の総括と「p2-3 ゲート自体の妥当性再検討（時計世界での基準再設計）」を
   含む選択肢を列挙し、**実装せずに**ユーザー判断を仰ぐ

## 7. 進行状況チェックリスト（作業のたびに更新すること）

### Step 0 — 着手準備

- [x] 0-1. 正本ブランチ確認 + 未コミット差分の確認（あればコミット）→ 状態:
      worktree `/Users/user/WorkSpace/ai-break-duel/.claude/worktrees/fair-cpu-public-info`、
      branch `codex/fair-rebalance-from-public-info`、HEAD `8343a16`。開始時の未コミット差分は
      本計画書 `docs/endgame-redesign5-plan.md` の未追跡のみ。別 worktree
      `/Users/user/WorkSpace/ai-break-duel` の未追跡アセットは本作業対象外。
- [x] 0-2. `npm run check` green + 全ガードテスト green → 結果:
      Node PATH 明示で `npm run check` green（19 files / 305 tests / build pass）。
      A1 実装後のガード確認も
      `npx vitest run src/game/aiStrategy.test.ts src/game/costBalance.guard.test.ts src/game/tutorial.test.ts`
      green（3 files / 32 tests）。
- [x] 0-3. 第四弾の最終数値（§0 の表）と土台デッキ変更 3 件を確認 → 確認:
      `docs/endgame-redesign4-plan.md` の Step 4 / §8 で、合格帯
      break 48.2 / control 54.0 / fire 48.8 / water 46.7 / wind 51.8 / earth 47.4、
      先攻 48.6%、p2-3 58.4%、break/control 合算 55.0% を確認。
      土台変更は fire `AI-FIRE-4D -> AI-FIRE-1B`、water
      `CMD-WATER-RITE -> CMD-TIDE-EDGE` + `AI-WATER-4 -> AI-WATER-3D`、
      wind `AI-WIND-4B -> AI-WIND-3`。本作業では変更なし。

### Step 1 — A1 実装

- [x] 1-1. `attacksPerTurnLimit` フラグ実装（攻撃 2 回まで・STRIKE 対象外）+ 単体テスト → 実装:
      `CONFIG.attacksPerTurnLimit`（既定 `null`）と `PlayerState.playerAttacksThisTurn` を追加。
      顔面攻撃だけ `canActivePlayerAttackOpponent` で上限判定し、`beginAttackInDraft` で宣言時に加算。
      `strikeInDraft` は従来どおり `canActivePlayerAttack` のみを見るため STRIKE は数えない。
      `src/game/strikeRules.test.ts` に「3回目の顔面攻撃 no-op」「STRIKE は上限 0 でも通る」を追加。
- [x] 1-2. 合法手生成 / 実行処理 / beam 追従の確認 + 全ガードテスト green → 結果:
      `legalAiActions` は顔面攻撃だけ `canActivePlayerAttackOpponent` で列挙し、STRIKE は残す。
      `performAiActionInDraft` の attack 実行も同じ合法判定に同期。`npm run typecheck` green。
      ガードは `src/game/aiStrategy.test.ts` + `src/game/costBalance.guard.test.ts` green。
- [x] 1-3. tutorial テスト green（既定値不変）→ 結果:
      `npx vitest run src/game/strikeRules.test.ts src/game/aiStrategy.test.ts src/game/tutorial.test.ts`
      green（3 files / 40 tests）。既定値 `null` のため tutorial 既定進行は不変。

### Step 2 — 一括計測（土台 + A1）

- [x] 2-1. 6 デッキリーグ 2 シード → 単色帯 / break / control / 先攻:
      `tmp/endgame5-a1-league-2026070951` / `tmp/endgame5-a1-league-2026070952`、
      `--endgame-package p4c3 --attacks-per-turn-limit 2`。
      平均: break 47.0% / control 52.8% / fire 45.0% / water 50.6% /
      wind 56.7% / earth 45.9% / 先攻 46.3%。wind と先攻が基準外。
- [x] 2-2. 盛り上がり（break vs control 1000 戦）→ draw / 平均T / 交代 / 逆転 / スノーボール:
      `tmp/endgame5-a1-break-control-2026070953`。draw 0.2% / 平均 26.2T /
      リード交代あり 55.9% / 2点ビハインド逆転 36.5% /
      先に2点差をつけた側の勝率 68.0%。この項目は基準内。
- [x] 2-3. full ストレス回帰（全候補完走）→ p2-3（break/control 合算含む）/ 他候補:
      `tmp/endgame5-a1-cost-3000000.json`、1000 games/order、seed 3000000。
      p2-3 は全体 56.09%、break/control 合算 55.27%（break 57.1% / control 53.45%）で不合格。
      他候補: p1 0.00% / p1-2 3.02% / p2 10.76% / p3 51.24%
      （break/control 合算 48.80%）/ p3-4 45.45% / p4 30.13%。
- [x] 2-4. beginner 較正（fire/water/earth、2 シード）→ 結果:
      `tmp/endgame5-a1-beginner-calibration.json`。fire 9.5% / water 34.0% /
      earth 10.75%。water が 5-20% 帯を大きく超えて不合格。
- [x] 2-5. §3 全ゲート判定 → 判定:
      A1（攻撃 2 回、STRIKE 対象外）は不合格。失敗理由は p2-3 break/control 合算 55.27%、
      wind 56.7%、先攻 46.3%、beginner water 34.0%。盛り上がり単体は基準内。

### Step 3 — （不合格時のみ）ノブ / A2

- [x] 3-1. A1 ノブ（3 回版 / STRIKE 込み版）→ 結果:
      3 回版: `tmp/endgame5-a1-knob3-p2_3-cost-3000000.json`、p2-3 全体 57.05%、
      break/control 合算 56.15%（break 56.1% / control 56.2%）で不合格。
      STRIKE 込み 2 回版: `tmp/endgame5-a1-knob-strike-counts-p2_3-cost-3000000.json`、
      p2-3 全体 55.79%、break/control 合算 55.13%（break 55.7% / control 54.5%）で不合格。
- [x] 3-2. A2（power3 遅延回復）→ 結果:
      新規実装なし。`CONFIG.power3AttackRecoveryDelay` は現行土台ですでに `true`、
      `docs/game-spec.md` でも power3 攻撃後の次自ターン回復スキップが正式仕様。
      したがって本計画の A2 は追加差分としては実行不能（既存土台と同一）。
- [x] 3-3. それでも不合格なら §6-2 の総括を作成しユーザー判断待ちで終了 → 総括:
      攻撃回数制限系では p2-3 の break/control 合算を 50% 以下へ落とせなかった。
      2 回版は p2-3 を 55.27%までしか落とせず、同時に wind / 先攻 / beginner water を壊した。
      3 回版は副作用緩和以前に p2-3 が 56.15%で未達。STRIKE 込み版も 55.13%で未達。
      A2 は既存土台に含まれる。次は「p2-3 ゲート自体の妥当性再検討」または
      別系統（例: p2-3 ストレス生成条件・break/control 基準・時計世界の許容値）のユーザー判断待ち。
      最終確認: `npm run check` green（19 files / 308 tests / build pass）。

### Step 4 — 承認ゲート

- [ ] 4-1. 合格構成の比較表（第四弾時点との差分つき）を作成 → 表:
      合格構成なし。A1 / ノブとも不合格のため Step 4 承認ゲートへ進まない。
- [ ] 4-2. ユーザーへ報告し承認を待つ（**承認なしに Step 5 へ進まない**）→ 承認:
      本採用承認ではなく、§6-2 のユーザー判断待ちとして報告する。

### Step 5 — 本採用（§5。承認後のみ）

- [ ] 5-1. ルール一式の既定値化 + テキスト / UI / チュートリアル確認
- [ ] 5-2. game-spec / design-principles 改訂
- [ ] 5-3. beginner 較正確認（割れたら追従再較正・別コミット）→ 結果:
- [ ] 5-4. apex 再探索 + test:balance ガードレール更新 → 結果:
- [ ] 5-5. balance-history「終盤設計改訂（全 5 弾）」エントリ + followups 全クローズ
- [ ] 5-6. **最終ゲート**: `npm run check` + 全ガードテスト + tutorial green
- [ ] 5-7. 本計画書のステータス更新 + 実施結果サマリ追記 + コミット
