# 終盤設計改訂 第四弾・手順書 — P4c3 仮採用と世界の再構築（完成ターム）

作成日: 2026-07-09
ステータス: §6 手続きで停止（デッキリバランス単独では p2-3 と単色帯を同時達成できず）
進行状況: **§7 のチェックリストが正**。作業を進めたら必ず §7 を更新すること
前提: 第一〜三弾（`docs/archive/endgame-redesign-plan.md` / `2` / `3`）すべて完了・採用構成なし。
ユーザー決定（2026-07-09）: §6 の 3 択から **(a) 複合案** を選択

> **別セッションで着手する人へ（最初に読む）**
>
> 1. 作業ブランチは **`codex/fair-rebalance-from-public-info`（正本）またはその派生**。main は使わない。
>    **第三弾の実験コードが未コミットで残っている場合は、着手前にまずコミットすること**
> 2. CPU は fair-gen005 凍結。全ガードテスト green 維持。検証の作法は
>    `.agents/skills/ai-break-duel-balance-tuning/SKILL.md`（§2g 原因分析ファースト含む）
> 3. 本計画の考え方: **ルール単体にリーグ帯まで要求しない**。過去の時代遷移
>    （公平化・プランナー導入）はすべて「ルール/CPU 変更 → 世界が崩れる → リバランスで回収」の
>    順で完成した。今回も P4c3 ルールを土台に固定し、デッキ側の再構築まで含めた
>    **完成形パッケージ**で最終判定する

## 0. 背景

3 ラウンドの比較検証で、終盤ルールの探索は **P4c3**（C0+P1+手札防御 power3 以下制限）に収束した:

- 合格済み: draw 0.3% / 平均 26.5T / リード交代 54.8% / 逆転 34.0% /
  スノーボール 69.9%（全実験初のゲート内）/ **先攻 48.7%（プロジェクト史上初の帯内）**
- 残る不合格は 2 つで、いずれもデッキ側で動く性質:
  - 単色帯の崩れ: **water 27.6%（沈み）/ fire 67.0%（跳ね）**
  - **p2-3 ストレス 57.7%**（対戦相手はプリセットデッキなので、break/control の
    アグロ耐性調整で動く。動かなければルール側の追加を検討）
- 診断済みの water 死因: 敗北の 65.4% が衰弱自滅（敗北時平均 24.7 枚ドロー・山札残 0.3 枚）。
  ドロー依存の緩和と山札耐性で回収余地あり
- 完全決着した知見: 膠着の病巣は「確実に機能する防御の存在」自体。セット防御系
  （可視化）は抑止を強めて悪化させるため全廃案（再提案禁止）

## 1. 土台ルール（本計画中は固定。「仮採用」フェーズ）

- **C0**: ターン上限 40 でライフ判定（同値のみ draw）+ 自ターン終了時の手札上限 6
- **P1**: 自ターン開始時にドローできなければ 1 ダメージ（固定）
- **P4c3**: 手札防御に使えるカードは power 3 以下のみ（`handDefenseLimit: 1` 維持）
- 運用: 既定値はまだ変えず、**全計測に `--endgame-package p4c3` を必ず付けて**リバランスを行う。
  既定値化（本採用）は §4 の最終合格後のみ
- 本計画中の土台ルール変更は禁止（リバランスで届かない場合のルール追加は §6 の手続きで）

## 2. 最終合格条件（完成形パッケージに対して一括判定）

**一次**: draw ≤2% / 平均ターン 20〜30 / full ストレス全候補 OK（p2-3 重点、break/control 合算 50% 以下）

**二次**: リード交代 50% 以上 / 2 点ビハインド逆転 30〜45% / スノーボール 70% 以下 /
単色 4 デッキ 45-55% / 先攻 48-52% / beginner 較正 5-20%（fire/water/earth）

**最終ゲート**: `npm run check` + 全ガードテスト + tutorial green

## 3. 世界の再構築（リバランス。作法は fair-rebalance-plan と同じ）

**B0 — 診断（カードを触る前に）**

1. P4c3 世界の 6 デッキリーグをフル取得（2 シード）し、全デッキの帯位置を確定
2. fire 67.0% の勝ち筋分解（何で勝っているか。P4c3 で power4 攻撃が手札で止まらなく
   なった恩恵をどのデッキより受けているか）
3. water の衰弱自滅の定量を最新化（第三弾診断の再確認 + どのカードがドロー過多の主因か）
4. p2-3 ストレスの貫通経路の再確認（break/control 相手に何が通っているか）
5. 修正仮説を影響の小さい順に列挙（§7 に記録）

**B1 — fire のナーフ**（67.0% → 45-55 帯。過剰ナーフの跳ね返りに注意。1 変更 = 2 シード）

**B2 — water の衰弱耐性改修**（27.6% → 帯内。方向性: ドロー枚数依存の緩和・山札回復/
リサイクル・「引く代わりに選ぶ」系への差し替え等。**「ドローと手札調整」のアイデンティティは
壊しすぎない**。1 変更 = 2 シード）

**B3 — 残りの帯外と p2-3 対策**（break/control のアグロ耐性を含む。wind/earth/break/control の
帯確認。p2-3 は B1〜B3 の変更後に full ストレスで再計測）

**B4 — 収束判定**: 全単色 45-55% + ストレス全 OK になるまで B1〜B3 を反復
（1 変更 = 1 検証・却下も記録・CPU とルールは凍結のまま）

## 4. 最終判定と本採用（ユーザー承認後のみ）

1. 完成形パッケージ（P4c3 ルール + 再構築済みデッキ）で §2 の全ゲートを一括計測
2. **ユーザーへ報告・承認**（ここが承認ゲート。合格数値と変更一覧を提示）
3. 承認後に本採用:
   - ルールの既定値化（config・カードテキスト・UI 文言・チュートリアル確認）
   - `docs/game-spec.md` / `docs/design-principles.md` 改訂
     （手札防御 power3 以下・手札上限 6・衰弱・ライフ判定・「デッキ切れ決着少量」原則の改訂）
   - beginner 較正 5-20% 確認（割れたら beginner 追従再較正・別コミット）
   - apex 再探索（新世界の最強候補確認）
   - `docs/balance-history.md` に「終盤設計改訂」エントリ + followups の膠着・draw 課題クローズ
4. 最終ゲート: `npm run check` + 全ガードテスト + tutorial green

## 5. CPU の扱い

- fair-gen005 凍結（重み・探索変更なし）。最小評価対応も既に第二〜三弾で実装済みの範囲を使う
- 新世界（P4c3 + 新デッキ）向けの CPU 再強化（重み再探索等）は本計画に**含めない**。
  本採用後に次期 CPU 計画として別途起案する

## 6. リバランスで届かない場合の手続き

B1〜B3 を尽くしても p2-3 ストレスまたは単色帯が回収できない場合:

1. ここまでの試行と「何が届かないか」を §7 に総括
2. ルール側の追加候補（例: 手札防御制限の別形態、コスト系の微調整）を**提案として**列挙し、
   **実装せずに**ユーザー判断を仰ぐ（土台ルールの変更は本計画中は禁止のため）

## 7. 進行状況チェックリスト（作業のたびに更新すること）

### Step 0 — 着手準備

- [x] 0-1. 正本ブランチ確認 + 第三弾実験コードの未コミット分があればコミット → 状態:
      `/Users/user/WorkSpace/ai-break-duel/.claude/worktrees/fair-cpu-public-info` が
      `codex/fair-rebalance-from-public-info` 正本。第三弾実験コードの未コミット差分はなし。
      未追跡は本計画書 `docs/archive/endgame-redesign4-plan.md` のみ。
- [x] 0-2. `npm run check` green + 全ガードテスト green → 結果:
      `npm run check` green（typecheck + unit 19 files / 305 tests + build）。
      `npm run test:balance` green（1 file / 7 tests）。
      `npx vitest run src/game/aiStrategy.test.ts src/game/tutorial.test.ts src/game/defenseChoice.test.ts src/game/turnPhase.test.ts src/game/strikeRules.test.ts`
      green（5 files / 70 tests）。
- [x] 0-3. 第三弾 P4c3 の基準数値を控える（draw 0.3% / 26.5T / 交代 54.8% / 逆転 34.0% /
      スノーボール 69.9% / 先攻 48.7% / water 27.6% / fire 67.0% / p2-3 57.7%）→ 確認:
      `docs/archive/endgame-redesign3-plan.md` Step 3-1 と本計画 §0 の数値を確認。

### Step 1 — B0: 診断（§3。コード変更なし）

- [x] 1-1. P4c3 世界の 6 デッキリーグ（2 シード）で全デッキ帯位置を確定 → 結果:
      `tmp/endgame4-b0/league-4101` / `tmp/endgame4-b0/league-730001`。
      平均: break 48.2% / control 50.4% / fire 67.0% / water 27.6% /
      wind 56.7% / earth 47.0% / 先攻 48.7%。第三弾基準と一致。
- [x] 1-2. fire 67.0% の勝ち筋分解 → 所見:
      fire は water 76.5% / earth 74.7% / control 68.4% / wind 61.2% に大きく勝ち越し、
      break だけ 55.0%。上位攻撃は `AI-FIRE-3B`（attacked 1909）と power4 3 種
      `AI-FIRE-4D` / `AI-FIRE-4` / `AI-FIRE-4B`（attacked 1267 / 1167 / 1188）。
      P4c3 で power4 が手札防御されない恩恵を、fire の 3 枚 power4 構成が最も強く受けている。
- [x] 1-3. water 衰弱自滅の主因カード特定 → 所見:
      直接診断（2 シード相当、water 関与 2000 戦）で water 敗北時の平均ドロー 25.0 枚、
      平均最終山札 0.0 枚。敗北の 99.9% は山札 0 の lifeout、72.7% は water 自ターン開始の
      山札 0 衰弱ターンで終了。主因は `CMD-WATER-RITE` 2 枚、`AI-WATER-2D` 2 枚、
      `CMD-DEEP-CURRENT`、`AI-WATER-2C` / `AI-WATER-3B` 系のドロー密度過多。
- [x] 1-4. p2-3 の貫通経路再確認（対 break/control）→ 所見:
      `npm run balance:cost -- --games-per-order 80 --seed 3000000 --endgame-package p4c3 --max-turns 40`
      で p2-3 57.7% RISK。相手別は break 60.6% / control 49.4% / fire 57.5% /
      water 67.5% / wind 56.9% / earth 54.4%。break/control 合算は 55.0% で未達。
- [x] 1-5. 修正仮説リスト（影響小さい順）→ 仮説:
      B1: fire はまず `AI-FIRE-4D` を 1 枚だけ `AI-FIRE-3` に差し替え、power4 枚数を 3→2 に下げる。
      これで P4c3 の power4 手札防御不可の恩恵を削りつつ、火の攻撃的 identity と power3+ 5 枚は維持する。
      B2: water はドロー枚数を単純に増やさず、`CMD-WATER-RITE` / `CMD-DEEP-CURRENT` /
      `AI-WATER-2D` 密度を下げ、`CMD-TIDE-EDGE`・妨害・回復/選択系へ寄せて「引く」より
      「必要札を選び、山札を焼き切らない」方向へ移す。B3: p2-3 は B1/B2 後に再計測し、
      未達なら break/control の低中速耐性（場防御値、除去、回復、低コスト壁）を増やす。

### Step 2 — B1: fire ナーフ

- [x] 2-1. 1 変更 = 2 シードで実施（試行は行を足して記録）→ 試行:
      F1 `fire: AI-FIRE-4D → AI-FIRE-3` は実装時に fire が 24 枚になっていたため無効。
      デッキ制約テストで検出し、採否根拠から除外。
      F1 を正しく 25 枚（`AI-FIRE-3` 2 枚）に戻すと `tmp/endgame4-b4/valid-fire-fix` で
      fire 61.9%となり過強。却下。
      F2 `fire: AI-FIRE-4D → AI-FIRE-1B`。
      `tmp/endgame4-b4/fire-f2-valid/league-4101` / `league-730001`。
      平均: break 48.2% / control 54.0% / earth 47.4% / fire 48.8% /
      water 46.7% / wind 51.8% / 先攻 48.6%。単色帯は平均 PASS。
- [x] 2-2. **ゲート**: fire 45-55% + 他デッキの帯外悪化なし → 最終値:
      F2 採用候補。fire 48.8%。

### Step 3 — B2: water 衰弱耐性改修

- [x] 3-1. 1 変更 = 2 シードで実施（アイデンティティ維持に注意。試行は行を足して記録）→ 試行:
      W1 `water: CMD-WATER-RITE → CMD-TIDE-EDGE`。
      平均: break 46.1% / control 49.5% / earth 44.5% / fire 46.1% /
      water 57.0% / wind 53.8% / 先攻 48.6%。water 過補正で却下。
      W2 `water: CMD-WATER-RITE → CMD-PATCH`。
      平均: break 48.5% / control 53.8% / earth 49.5% / fire 49.0% /
      water 37.0% / wind 59.1% / 先攻 47.9%。water 未達で却下。
      W3 `water: CMD-WATER-RITE → CMD-TIDE-EDGE` + `AI-WATER-4 → AI-WATER-3D`。
      平均: break 47.9% / control 52.7% / earth 46.0% / fire 48.1% /
      water 45.6% / wind 56.5% / 先攻 49.0%。water は帯内、wind は B3 対象。
- [x] 3-2. **ゲート**: water 45-55% → 最終値:
      W3 採用。water 平均 45.6%（seed 730001 は 43.1%で低めのため最終候補では要監視）。

### Step 4 — B3/B4: 残り帯 + p2-3 収束

- [x] 4-1. 残りの帯外調整（break/control のアグロ耐性含む）→ 試行記録:
      N1 `wind: AI-WIND-4B → AI-WIND-3`。F2 修正後の正しい候補は
      `tmp/endgame4-b4/fire-f2-valid/league-4101` / `league-730001`。
      平均: break 48.2% / control 54.0% / earth 47.4% / fire 48.8% /
      water 46.7% / wind 51.8% / 先攻 48.6%。単色帯は平均 PASS。
      p2-3 full stress は `tmp/endgame4-b4/fire-f2-valid/cost-g80.json` で 59.1%、
      break 60.6% / control 49.4%（break/control 合算 55.0%）のため未達。

      p2-3 対策:
      B1 `break: MEM-WAR-BANNER → MEM-FIREWALL` は p2-3 に実効なしで却下。
      B2 `break: AI-FIRE-4B → AI-EARTH-2D` は p2-3 が悪化し却下。
      B3 `break: CMD-OPTIMIZE → CMD-TRINITY` は改善不足で却下。
      B4 `break: CMD-OPTIMIZE → CMD-PURGE` は p2-3 を改善するが、リーグで
      break 56.2% / water 45.4%（seed 730001 water 42.3%）となり却下。
      B5 `B4 + control: CMD-PATCH → CMD-PURGE` は p2-3 合算 48.3%まで改善するが、
      control 60.5% / water 45%未満となり却下。
      B6 `B4 + control: CMD-WIND-RITE → CMD-PURGE` は p2-3 合算 47.6%まで改善するが、
      control 61.1% / water 44.4%となり却下。
      B7 `B4 + break: AI-FIRE-4B → AI-FIRE-3` は p2-3 合算 50.0%境界だが、
      リーグで break 55.5% / water 45.7%（seed 730001 water 44.0%）となり却下。
- [x] 4-2. full ストレス回帰（全候補完走）→ p2-3:
      N1 時点の full stress は p2-3 58.4%、break/control 合算 55.0%で未達。
      break/control にデッキ回答を入れると p2-3 は下がるが、break/control のリーグ帯が崩れる。
- [x] 4-3. **ゲート**: 全単色 45-55% + ストレス全 OK → 最終値:
      未達。デッキリバランス単独では「単色帯 PASS」と「p2-3 break/control 合算 50%以下」を
      同時に満たせなかったため §6 手続きへ移行。

### Step 5 — 最終判定（ユーザー承認ゲート）

- [ ] 5-1. 完成形パッケージで §2 全ゲートの一括計測 → 比較表:
      未実施。Step 4 で p2-3 と単色帯の同時達成に届かず、§6 手続きで停止。
- [ ] 5-2. ユーザーへ合格数値と変更一覧を報告し承認を待つ（**承認なしに Step 6 へ進まない**）→ 承認:
      未承認・未実施。Step 6 には進まない。

### Step 6 — 本採用（§4。承認後のみ）

- [ ] 6-1. ルール既定値化 + テキスト/UI/チュートリアル確認 + game-spec / design-principles 改訂
- [ ] 6-2. beginner 較正 5-20%（割れたら追従再較正・別コミット）→ 結果:
- [ ] 6-3. apex 再探索 → 結果:
- [ ] 6-4. balance-history「終盤設計改訂」エントリ + followups の膠着/draw 課題クローズ
- [ ] 6-5. **最終ゲート**: `npm run check` + 全ガードテスト + tutorial green
- [ ] 6-6. 本計画書のステータス更新 + 実施結果サマリ追記 + コミット

## 8. §6 手続き: ルール側の追加候補（提案のみ。未実装）

結論: P4c3 + デッキリバランスだけでは、単色帯と p2-3 stress の重点条件を同時に満たせなかった。
特に p2-3 対策として break/control に `PURGE` 系回答を増やすと、p2-3 は下がる一方で
break/control 自身が 55-61% 帯へ跳ね、water が 45%未満へ落ちる。

追加候補（次セッションでユーザー判断後にだけ実装）:

1. **P4c3 + 中型連打への微制限**:
   power2-3 偏重デッキだけが通りすぎるため、power3 の遅延回復または同一ターン攻撃回数に小さな制限を足す。
   既存の P4c3 土台は維持し、power4 を再強化しない。
2. **手札防御制限の段階化**:
   power4 は手札防御不可のまま、power3 攻撃にだけ追加の公開情報/コスト条件を付ける。
   p2-3 を狙い撃ちし、fire/wind の power4 問題を再発させない。
3. **stress 専用ではなく全体ルールの小コスト化**:
   `PURGE` をデッキへ足すとリーグが壊れるため、カード追加ではなく中型盤面を自然に処理できる
   小さな共通コストまたは疲労処理を検討する。

現時点の採用可能なデッキ側変更（コードに残したもの）:

- fire: `AI-FIRE-4D → AI-FIRE-1B`
- water: `CMD-WATER-RITE → CMD-TIDE-EDGE`、`AI-WATER-4 → AI-WATER-3D`
- wind: `AI-WIND-4B → AI-WIND-3`

これらは単色帯を平均 PASS まで戻すが、p2-3 重点条件は未達のため、完成形としては未採用。
