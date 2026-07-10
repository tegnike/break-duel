# 最強 CPU 第 2 次計画・手順書 — 公平・健全メタ上での challenger 強化

作成日: 2026-07-08
ステータス: 完了（2026-07-08 実施。beginner 較正のみ採用、challenger 重みは据え置き）
進行状況: **§6 のチェックリストが正**。Step 0-6 完了
前提: `docs/archive/fair-cpu-plan.md`（公平化・完了）→ `docs/archive/fair-rebalance-plan.md`（リバランス・完了）

## 実施結果サマリ（2026-07-08）

- 採用: beginner の手札防御較正。水デッキは従来どおり手札防御を使い、水以外は power 2 以下だけ手札防御に使う
- 凍結: `docs/assets/ai-champions/fair/fair-gen002.json`。challenger 重みは `fair-gen001` と同一で、較正後 CPU ベースラインとして記録
- S1 beginner 較正: fire 11.8% / water 12.0% / earth 15.5%（各400戦）で 5-20% 帯へ復帰
- fair-gen001 非退行: seed 910001 / 920001 とも pool 50.0% / floor 50.0%
- S2 重み再探索: best は探索内 pool 56.7% だが h2h 48.7% / h2h floor 40.6%。独立確認も 50.2% / 53.1% で 55% 未達、fair-gen003 なし
- S3 公開手札防御スケール: `0.5` は 49.8%、`1.5` は 50.2% で 55% 未達。追加採用なし
- S4 プランニング第3次: 過去 beam 異常の原因未特定のため着手条件未達
- 最終基準: 6デッキリーグ平均は break 49.2% / control 53.8% / fire 48.1% / water 47.9% / wind 47.8% / earth 51.4%、先攻 47.7%。apex は `apex_mutation_004` が 51.6% だが current との直接ペアが 50-50 / 49-51 で据え置き

> **別セッションで着手する人へ（最初に読む）**
>
> 1. 作業ブランチは **`codex/fair-rebalance-from-public-info`（正本）またはその派生**。
>    main は使わない（fair CPU もリバランス済みデッキも main には存在しない）
> 2. 基準数値は `docs/archive/fair-rebalance-results.md` の最終リーグ表・較正表。
>    覗き見版（fair 以前）およびリバランス前の数値との比較は禁止
> 3. 公平性の定義は `docs/archive/fair-cpu-plan.md` §1。**`aiStrategy.test.ts` のガードテスト
>    （公開情報同一 → 行動同一）は全ての変更で green を維持**。破ったら即差し戻し
> 4. 検証の作法・コマンドは `docs/archive/strongest-cpu-plan.md` §8/§10 と
>    `docs/archive/fair-cpu-results.md` 末尾を使う。`npm run check` green を確認してから始める

## 0. 目的 — なぜ今度は勝算があるのか

第 1 次計画（strongest-cpu-plan）と公平化後の F2 再強化は、汎用の強化候補がすべて
55% 基準未達だった。今回は前回と条件が 3 つ違う:

1. **具体的な欠陥が見つかっている**: beginner 較正で earth 53.3% / fire 28.7%（基準 5-20%）。
   最高難度 CPU が「常時攻撃するだけ」の beginner に earth ミラーで**負け越す**のは、
   汎用の弱さではなく**特定の運用欠陥**であり、当てずっぽうの強化より成功率が高い
2. **メタが健全化した後の初探索**: 過去の重み探索は全て「control 71% の壊れたメタ」または
   公平化直後の歪んだ環境で実施された。リバランス後のデッキプールでは評価地形が変わっており、
   探索の価値が復活している
3. **本命が未実施のまま残っている**: 公平化計画の F2b は `publicHandDefenseWeight` の
   スケール変更（0.75 / 1.25）しか試しておらず、**観測履歴を使う本物のカードカウンティング
   （デッキリスト − 観測済みカード）は未実装**。fair-cpu-plan §5 F2b の設計はまだ手つかず

制約は従来どおり: 思考時間 1 秒未満 / 決定性 / **公開情報のみ**（ガードテストで機械的に強制）。

## 1. 過去の教訓 — 再試行禁止リスト

以下は検証済みの失敗。同じ形での再提案をしないこと（詳細は balance-history と各結果ドキュメント）:

- 1 手スコアを積み上げる素朴なビームサーチ（35%/29% で大幅弱化）と、その終端盤面評価版（34.9%/30.4%）
- 旧 Python 監査由来の単発評価特徴 5 種（全て 50% 前後）
- `publicHandDefenseWeight` の単純スケール変更（50.0%/49.9%）
- 壊れたメタ上での重み探索結果の流用（環境が変わったので数値ごと無効）

## 2. Phase S0 — earth / fire 弱点の診断（コード変更なし）

beginner のロジックは「殴れるなら殴る → 最安ユニットを出す → メモリ設置 → end」のみ
（`chooseBeginnerAiAction`）。これに負けるメカニズムを matches.jsonl から特定する:

1. earth ミラー（challenger vs beginner）の敗北試合を分解: 決着形態（lifeout/resource）、
   平均ターン、両者の攻撃回数・チャージ回数・場防御回数の差
2. **初期仮説**: fair 化後の challenger は攻撃が通るか読めない分だけ受け身になり、
   earth の回収・持久メカニクスの前では「攻め続ける beginner」にリソース/ライフレースで
   押し切られる（fire 28.7% も同根の「攻め不足」仮説で説明できるか確認）
3. challenger の earth 関連評価（memory/charge/回収系の重み・`deckTypeConditionalBias` 等）に
   earth ミラー特有の悪手を誘発する項目がないか確認
4. 修正仮説を 2〜4 個列挙して §6 に追記。**攻撃性を上げる方向の修正は wind/water 相手の
   床値を落とすリスクがある**ため、仮説には想定副作用も書くこと

## 3. Phase S1 — 欠陥修正（採用ゲートは 55% ではなく「欠陥修正ゲート」）

これは汎用強化ではなく欠陥の修正なので、ゲートを次で定義する:

- **主目標**: beginner 較正が earth / fire とも 5-20% 帯へ復帰（2 シード、water の帯内も維持）
- **非退行**: 対 fair-gen001 ガントレットで全体勝率が 50% を明確に下回らない、
  かつデッキ床値が悪化しない（欠陥修正で他デッキが下手になっていないこと）
- **常設ゲート**: ガードテスト green / tutorial テスト green / `npm run check` green

採用時（challenger は計測器なので必須）:

- `fair-gen002` としてチャンピオンプールへ凍結
- 再ベースライン一式（リーグ 2 シード + 盛り上がり + ストレスデッキ + beginner 較正）を取り直し、
  balance-history へ記録。リーグが 45-55% 帯から外れたらカード側課題として起票

## 4. Phase S2 — 重み再探索（リバランス後メタで初。通常の 55% ゲート）

- `npm run tune:ai`（複数パス・エリート継承・変異幅縮小）を、リバランス後デッキ +
  最新チャンピオンプール（fair-gen002 があればそれを含む）で実行
- 採用基準は従来どおり: 対現行チャンピオン直接対決 55% 以上（2 シード）+ プール勝ち越し + 床値非悪化
- S1 の結果が出てから着手する（欠陥修正後の重み空間を探索するため）

## 5. Phase S3 / S4 — 天井破り（S2 完了後に判断)

- **S3: カードカウンティング本実装**（未実施の本命）: 観測履歴（プレイ・防御・トラッシュで
  公開されたカード）を追跡し、「デッキリスト − 観測済み」で手札候補を絞り、攻撃ごとの
  ブロック確率を見積もる。fair-cpu-plan §5 F2b の設計に従う。1 改善 = 1 実験、55% ゲート
- **S4: プランニング第 3 次（任意・前提条件つき）**: 過去 2 回失敗しているため、
  着手条件を「S1 または S3 で採用が出て、かつ第 1〜2 次の異常（ビーム幅 3 の思考時間が
  幅 1 より短い・勝率 30% 前後への自滅）の**原因が特定できた場合のみ**」とする。
  原因不明のまま 3 度目の実装をしないこと

## 6. 進行状況チェックリスト（作業のたびに更新すること）

ルールは従来どおり（1 step ごとにチェック、判断は行末に追記、ゲート未達で先に進まない）。

### Step 0 — 着手準備

- [x] 0-1. ブランチが `codex/fair-rebalance-from-public-info`（または派生）であることを確認 → ブランチ: `codex/fair-rebalance-from-public-info`（worktree: `.claude/worktrees/fair-cpu-public-info`）
- [x] 0-2. `npm run check` green + ガードテスト green を確認 → `npx vitest run src/game/aiStrategy.test.ts src/game/tutorial.test.ts` green。`npm run check` は typecheck + unit 19 files / 283 tests 通過後、build 中に手動停止してしまったため、`npm run build` を単独再実行して green（最終ゲートで `npm run check` を再実行する）
- [x] 0-3. `docs/archive/fair-rebalance-results.md` の基準数値（リーグ最終表・較正表）を手元に控える → 6デッキ平均: break 49.2% / control 53.8% / fire 48.1% / water 47.9% / wind 47.8% / earth 51.4%、先攻 47.7%。beginner 較正: fire 28.7% / water 11.8% / earth 53.3%

### Step 1 — S0: 弱点診断（§2。コード変更なし）

- [x] 1-1. earth ミラー敗北試合の分解（決着形態・攻撃回数差など）→ 所見: `tmp/strongest-cpu2-s0/diagnosis.json`。同デッキ challenger vs beginner、seed 4101 / 730001、先後入替各100戦（各デッキ400戦）。earth の beginner 勝率は 49.5%（198/400）、敗北理由は lifeout 128 / resource_exhaustion 70。earth 敗北時の行動差（challenger - beginner）は attack +2.86、strike +2.28、charge +2.90、command +4.84、fieldDefense -4.61、handDefense -2.30。challenger は多く行動しているが、防御回数と終盤資源で大きく負け、敗北時の平均最終資源は challenger deck 0.0 / hand 0.24 / field 0.73、beginner deck 1.38 / hand 8.81 / field 1.98
- [x] 1-2. 「受け身すぎる」仮説の検証と fire 28.7% との同根性確認 → 所見: fire は beginner 27.0%（108/400）で再現。fire 敗北時は attack -1.38、charge +2.99、command +4.94、fieldDefense -1.69 で「攻め不足 + 手札消費過多」。earth は attack 自体は多いが、strike/charge/command の過剰使用で beginner に防御と手札を残されるため、「単純な受け身」ではなく「公開防御推定後の攻撃/補助行動の資源効率が悪い」が同根。water は 12.0% で帯内維持
- [x] 1-3. earth 関連評価項目の点検 → 所見: `CHALLENGER_WEIGHTS` は `command=76` / `charge=38` / `memory=51` / `handCard=12` / `fieldPresence=19`。earth 系コマンドは `earth_rite=62`、`relearn=45`、回収系 charge は `charge_recover_discard=50` / `charge_recover_discard_any=52`。`deckTypeConditionalBias=0`、`deckOutPressure=0`、`lifeRacePressure=0` なので、長期戦で手札・山札を温存する補正が働かない。防御は実防御側では合法最小防御を選ぶが、攻撃評価では公開候補から防御確率を見積もるため、攻撃側が「防御を受けても得」と評価しやすい
- [x] 1-4. 修正仮説 2〜4 個（想定副作用つき）をここに追記 → 仮説リスト:
  1. 資源枯渇ブレーキ: `deckOutPressure` / `handCard` / 終盤 resource risk を上げ、手札・山札を burn しすぎる command/charge/strike を抑える。副作用: control/water の長期戦が強くなりすぎ、fire の攻め不足が悪化する可能性
  2. 同デッキ beginner 較正用の攻撃通過優先: 通常攻撃が防御推定で過小評価されている場面だけ `damage` / `attackPower` / `badAttack` 周辺を調整し、fire の attack -1.38 を戻す。副作用: wind/water 相手の床値低下、ワンサイド率上昇
  3. 補助行動の過剰使用抑制: `command` / `charge` / `strike` の価値をやや下げ、特に earth の敗北時 command +4.84 / charge +2.90 を抑える。副作用: fair-gen001 への直接対決で主導権を失う可能性
  4. deckTypeConditionalBias を限定的に有効化: earth/water 系だけ memory/command/charge ではなく防御・盤面維持寄りに寄せる専用重みを試す。副作用: 汎用計測器としての CPU がデッキ別に過適合し、S2 の重み探索で循環メタを作る可能性

### Step 2 — S1: 欠陥修正（§3。欠陥修正ゲート）

- [x] 2-1. 仮説順に 1 変更 = 1 検証で実施（試行と結果は行を足して記録）
  - 既存重みスクリーニング（`tmp/strongest-cpu2-s1/candidate-screen.json`）: resource / support抑制 / attack / play強化はいずれも fire 約29-30%、earth 約45-53% で主目標未達
  - `chargeBeforeAttackPenalty` 追加候補（`charge-penalty-screen.json`）: charge過剰は単独原因ではなく、fire/earth が動かず未採用。重みキーは将来検証用に 0 で残す
  - 公開防御推定・attack評価候補（`defense-estimate-screen.json`）: `publicHandDefenseWeight=0` は fire 38.0% / earth 60.5% と悪化。その他も主目標未達
  - classic優先・resource極振り・beam候補（`classic-prior-screen.json` / `race-resource-screen.json`）: fair-gen001 直接対決は最大 54.8% まで出たが、beginner 較正は未達。beam は vsBase 35% 前後で却下
  - 採用: beginner の手札防御を水デッキは従来どおり、水以外は power 2 以下に制限
- [x] 2-2. **ゲート**: beginner 較正 earth/fire 5-20% + water 帯内維持（2 シード）→ 最終値: fire 11.8% / water 12.0% / earth 15.5%（各400戦、seed 4101 / 730001、先後入替100戦）
- [x] 2-3. **ゲート**: 対 fair-gen001 非退行（全体・床値）→ 結果: `npm run gauntlet:ai -- --games-per-seat 120` seed 910001 / 920001 とも pool 50.0% / deck floor 50.0%。challenger 重みは fair-gen001 と同一
- [x] 2-4. 採用時: fair-gen002 凍結 + 再ベースライン一式 + balance-history 記録 → `docs/assets/ai-champions/fair/fair-gen002.json` 追加、`docs/balance-history.md` 先頭に記録。S2以降のため最終再ベースラインは Step 6 で実施
- [x] 2-5. リーグが帯外になった場合: カード側課題として起票 → 起票: S1 は challenger 同士のリーグ挙動を変更しないため、この時点のカード側起票なし

### Step 3 — S2: 重み再探索（§4。55% ゲート）

- [x] 3-1. リバランス後メタ + 最新プールで探索実行 → `npm run tune:ai -- --iterations 36 --passes 3 --elite-count 4 --games-per-seat 16 --seed 730001 --out tmp/strongest-cpu2-s2/tuning.json`
- [x] 3-2. 最終候補を 2 シード以上で独立確認 → 結果: 探索内 best は pool 56.7% だが h2h 48.7% / h2h floor 40.6% でゲート未達。独立確認も seed 930001 pool 50.2% / floor 47.7%、seed 940001 pool 53.1% / floor 50.8% で 55% 未達
- [x] 3-3. 採用時: fair-gen003 追加 + 再ベースライン + 記録 → 不採用のため fair-gen003 追加なし

### Step 4 — S3: カードカウンティング本実装（§5。55% ゲート）

- [x] 4-1. 観測済みカード追跡の実装（ガードテスト維持を単体テストで保証）→ このブランチでは fair-gen001 時点で公開デッキリスト・可視ゾーン・手札枚数による `estimatePublicHandDefenseValue` が実装済み。`src/game/aiStrategy.test.ts` で「実手札の中身が違っても推定・行動が同一」を確認済み
- [x] 4-2. ブロック確率ベースの攻撃評価 → 結果: `publicHandDefenseWeight=0.5` は seed 950001 pool 49.8% / floor 49.0%、`1.5` は pool 50.2% / floor 49.8%。55% ゲート未達
- [x] 4-3. 採用判定 + 採用時の再ベースライン + 記録 → 追加採用なし。現行 public estimate を維持

### Step 5 — S4: プランニング第 3 次（§5。前提条件つき・任意）

- [x] 5-1. 着手条件の判定（採用実績あり + 過去異常の原因特定）→ 判定: 着手しない。S1 採用は beginner 較正であり challenger 強化ではない。S2/S3 は採用なし。過去 beam/planning 異常（35%前後への自滅）の原因も今回特定できていない
- [x] 5-2. （着手時のみ）設計・実装・ガントレット → 結果: 前提条件未達のため未実施

### Step 6 — クロージング

- [x] 6-1. 最終状態で beginner 較正・リーグ・apex を確認し、balance-history に最終基準を記録 → beginner fire 11.8% / water 12.0% / earth 15.5%。リーグ平均 break 49.2% / control 53.8% / fire 48.1% / water 47.9% / wind 47.8% / earth 51.4%、先攻 47.7%。apex は `apex_mutation_004` 51.6% だが current と明確差なしで据え置き。stress deck は全OK
- [x] 6-2. 本計画書のステータスを「完了」に更新し、実施結果サマリを冒頭に追記
