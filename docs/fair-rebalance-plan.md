# 公平基準リバランス計画・手順書 — fair-gen001 で露見した課題の解消

作成日: 2026-07-08
ステータス: 完了（残課題起票あり）
進行状況: **§9 のチェックリストが正**。作業を進めたら必ず §9 を更新すること
前提計画: `docs/fair-cpu-plan.md`（完了）→ `docs/fair-cpu-results.md`（結果）→ `docs/fair-cpu-followups.md`（課題の一次記録）

## 実施結果サマリ（2026-07-08）

- 採用: control / fire / water / earth のデッキ調整と `CMD-WATER-RITE` 2 ドロー化。
- 解消: 6 デッキリーグは全デッキ 45-55% 帯（2 シード平均: break 49.2 / control 53.8 / fire 48.1 / water 47.9 / wind 47.8 / earth 51.4）。
- 継続課題: 先攻勝率 47.7%、resource 決着 22.4%、beginner fire/earth 較正未達は `docs/fair-cpu-followups.md` に起票。
- apex: 再探索で明確な差し替え候補なし。current_apex 据え置き。

> **別セッションで着手する人へ（最初に読む）**
>
> 1. 着手前にブランチ `codex/fair-cpu-public-info` が main へマージ済みであることを確認する。
>    未マージなら、このブランチ上（または派生ブランチ）で作業する（fair-gen001 と
>    ガードテストがまだ main に存在しないため）
> 2. 基準数値は `docs/fair-cpu-results.md` の F1 再ベースライン値（本書 §1 に転記）。
>    **覗き見版（fair 以前）の勝率数値との比較は禁止**
> 3. `docs/design-principles.md`（却下済み案）と `.claude/skills/ai-break-duel-balance-tuning/SKILL.md`
>    （検証の作法）を読むこと。`npm run check` green を確認してから始める
> 4. コマンドは `docs/fair-cpu-results.md` 末尾の検証コマンド一覧と `docs/strongest-cpu-plan.md` §10 を使う

## 0. 目的と位置づけ

CPU 公平化（fair-gen001）によって、覗き見 AI が隠していたゲームバランスの実態が初めて見えた。
人間プレイヤーも相手の手札は見えないため、**fair-gen001 が出す数値の方が実際のプレイ体験に近い**。
本計画はその実態に対する修正、つまり CPU 強化投資の**回収フェーズ**である。

対象は 3 課題（`docs/fair-cpu-followups.md` より）:

1. **リーグ崩れ**: control 71.6% / water 35.2% / wind 39.9%（基準は単色 45-55%）— 本丸
2. **beginner 較正の上振れ**: 27.8%（基準 5-20%）、特に earth 同一デッキで 56-65%
3. **apex 差し替え候補**: `apex_mutation_056`（対 current 直接ペア 120-77-3）

課題 2・3 はカードバランスが動くと結果が変わるため、**課題 1 の完了後に着手する**（順序厳守）。

## 1. 開始時の基準数値（fair-gen001、2026-07-08）

6 デッキリーグ（seed 4101 / 730001 平均）:

| デッキ | 平均勝率 | 判定 |
| --- | ---: | --- |
| break | 45.6% | 帯内（下限際） |
| control | **71.6%** | **突出** |
| fire | 52.4% | 帯内 |
| water | **35.2%** | **沈み** |
| wind | **39.9%** | **沈み** |
| earth | 53.3% | 帯内 |
| 先攻勝率 | 47.8%（730001 単独では 45.1%） | 帯割れ疑い |

盛り上がり指標（break vs control、1000 戦）: 平均 25.2 ターン、リード交代あり 59.6%、
2点ビハインド逆転 47.3%、決着 lifeout 64.0% / resource 35.8%。
ストレスデッキ回帰: 全候補 OK。beginner 較正: 27.8%（超過）。

## 2. 原則（この計画で守ること）

- **CPU（fair-gen001）は触らない**。カード/デッキ/ルールの変更と CPU の変更は別コミット・別検証
  （計測器を動かしながら計測しない）。`aiStrategy.test.ts` のガードテスト（公開情報同一 → 行動同一）は常に green
- 1 変更 = 1 検証。カード数値を 1 つ動かすごとにリーグ 2 シード（4101 / 730001）で確認
- 合否基準: 単色 45-55% / 先攻 48-52% / ストレスデッキ全 OK 維持 / 盛り上がり指標が明確に悪化しない
- カード変更時は `docs/` の該当仕様（game-spec / collection-spec 等）と balance-history を必ず更新
- 却下案も balance-history に記録（再提案防止）

## 3. Phase R0 — 原因分析（カードを触る前に必ずやる）

数値をいじる前に、**何がどう勝たせて/負けさせているか**を matches.jsonl から特定する。

1. control の勝ち筋の分解: 決着形態（lifeout/resource）別の勝率、勝利試合で使用された
   カードの寄与、対 water/wind 戦と対 break/fire 戦の差
2. water / wind の負け筋の分解: 攻撃が手札防御で止められている率、平均与ダメージ、
   リソース切れ距離。**「fair 化で攻撃が読めなくなった」ことが直撃している仮説**を確認する
3. リソース決着 35.8% を balance-history の過去エントリ（fair 以前）と比較し、
   異常上振れなら独立課題として起票する
4. 先攻勝率 45.1%（seed 730001）が control 突出の巻き添えか独立問題かの当たりをつける
5. 分析結果から**修正仮説を 3〜5 個**列挙し、影響が小さい順に並べる（本書 §9 に追記）

**成果物**: 仮説リスト。ここまでコード変更ゼロ。

## 4. Phase R1 — control のナーフ（突出 71.6% の解消）

- 修正対象は R0 の仮説から選ぶ。先入観での変更禁止（`docs/design-principles.md` の却下済み案に注意）
- 進め方: 最小の変更（1 カードの 1 数値）から。1 変更ごとにリーグ 2 シード
- 目標: control 55% 以下。ただし**過剰ナーフで 45% を割らないこと**（跳ね返り注意）
- water / wind は control が下がるだけで浮く可能性がある。R1 の各計測で water/wind の
  数値も同時に見て、R2 の必要量を見積もる

## 5. Phase R2 — water / wind のバフ（残った沈みの解消）

- R1 完了後の数値で必要量を判断。control ナーフだけで 45% 帯に入るなら R2 はスキップ可
- fair 化の直撃（攻撃が読めない）を踏まえると、単純な打点バフより
  「手札防御に強い性質（pierce 等の既存メカニクス）や、止められても損しない効果」の方向が
  仮説として有力。ただし最終判断は R0 の分析に従う
- 進め方は R1 と同じ（1 変更 = 2 シードリーグ）

## 6. Phase R3 — 先攻勝率と総仕上げ再ベースライン

1. R1/R2 適用後に先攻勝率を再計測。48-52% に入っていれば解消（control 巻き添え説の確認）。
   入らなければルール側の独立課題として起票（このフェーズでは深追いしない）
2. 全数値の取り直し（リーグ 2 シード + league_report / 盛り上がり指標 / ストレスデッキ回帰）
3. balance-history 先頭に「公平基準リバランス」エントリを追記（採用変更の一覧と新基準値）
4. `npm run check` green

## 7. Phase R4 — beginner 較正（課題 2。R3 完了後）

1. **切り分けから入る**: beginner 27.8% は「beginner が強くなった」のか
   「fair challenger が弱くなった/earth が苦手」なのかを分離する。
   earth 同一デッキ 56-65% は beginner が challenger に勝ち越しており、
   challenger 側の earth 運用の欠陥の可能性がある（beginner を触る前に必ず確認）
2. 原因に応じて: beginner の弱体化（挙動の単純化・意図的な悪手率）または
   challenger の earth 特化課題の起票（CPU 変更になるため本計画とは別コミット・
   ガントレット必須で `docs/fair-cpu-plan.md` の作法に従う）
3. 合否: 同一デッキ較正で beginner 勝率 5-20%（fire/water/earth、2 シード）

## 8. Phase R5 — apex 差し替え判断（課題 3。R3 完了後）

1. R1/R2 でカードプールが動いた場合、`apex_mutation_056` の優位が残っているかを再確認
   （プール変更後は apex 再探索からやり直しが安全）
2. 複数シードの直接対決で明確（55% 相当の一貫した勝ち越し）なら apex を差し替え、
   `npm run test:balance` のガードレールと関連 docs を更新
3. 誤差圏内なら据え置きで完了

## 9. 進行状況チェックリスト（作業のたびに更新すること）

ルールは従来どおり（1 step ごとにチェック、判断は行末に追記、ゲート未達で先に進まない）。

### Step 0 — 着手準備

- [x] 0-1. `codex/fair-cpu-public-info` の main マージ状態を確認 → 状態: `origin/main...codex/fair-cpu-public-info` は 9/4 差分、`codex/fair-cpu-public-info` は `origin/main` に未マージ（ancestor_status=1）。派生ブランチ `codex/fair-rebalance-from-public-info` で続行。
- [x] 0-2. design-principles / SKILL.md を読む。`npm run check` green を確認 → `PATH=/Users/user/.nvm/versions/node/v22.17.0/bin:$PATH npm run check` green（typecheck / 19 files・283 vitest / build）

### Step 1 — R0: 原因分析（§3。コード変更なし）

- [x] 1-1. control の勝ち筋分解 → 所見: 既存リーグで control は water に 74/84%（seed 4101）・71/81%（730001）、wind に 80/77%・77/76%。追加 500 戦では control vs water が 72.0% / water vs control が control 80.4%、control vs wind が 70.4% / wind vs control が control 76.0%。control 勝ちは lifeout と resource の両方で成立し、対 water では control 勝利 762 件中 resource 446 件（58.5%）、対 wind では 732 件中 resource 325 件（44.4%）。
- [x] 1-2. water / wind の負け筋分解（手札防御による攻撃停止率を含む）→ 所見: 対 control 追加 500 戦で総ブロック率は water 対面 49.6〜51.7%、wind 対面 45.1%。control 側の土手札防御は攻撃比 4.1〜5.4% 程度だが、土/風の場防御・回収・再行動で長期化し、water は resource 敗北、wind は lifeout/resource の両面で押し切られる。water は control 以外にも fire/earth/break へ負け越しており、control ナーフ後も R2 判断が必要。
- [x] 1-3. リソース決着 35.8% の過去比較 → 判断: 旧基準の 5〜8% 許容や 2026-07-05 の 0.8〜0.9% から大きく上振れ。2026-07-08 TS 統一時点でも 29.0% まで上がっており、fair-gen001 では 35.8% に悪化。control の持久力と fair 化後の攻撃不確実性が重なった独立監視課題として扱う。
- [x] 1-4. 先攻 45.1% の当たりづけ → 仮説: seed 730001 の 45.1% は、water/wind が先攻席で control/fire/earth に大きく負ける対面の寄与が大きい。control が先攻なら 56〜77% 勝つため、先攻ルール単独の問題というよりデッキ強弱の巻き添えが第一仮説。R3 で再計測し、残れば独立起票。
- [x] 1-5. 修正仮説 3〜5 個をここに追記 → 仮説リスト: (1) control の回復/回収/持久札を 1 枚削る（最小変更、resource 勝ちを減らす） (2) control の `CMD-PURGE` か `CMD-WIND-RITE` を 1 枚削る（盤面除去/再行動テンポを落として lifeout も下げる） (3) water に手札防御されても損しにくい既存水カードを 1 枚追加（control ナーフ後も 45% 未満なら） (4) wind の `CMD-COMEBACK-RITE` / 回復系を tempo 札へ差し替え、先攻時の攻め損を減らす（R2 候補） (5) resource 決着率が R3 後も高ければデッキ枚数/リソース判定ではなく control 固有の再利用密度を追加で削る。

### Step 2 — R1: control ナーフ（§4）

- [x] 2-1. 仮説順に 1 変更 = 2 シードリーグで実施（試行と結果は行を足して記録）
  - R1-A: control `MEM-RECOVERY-CACHE` → `AI-WIND-1`。control 72.8% / 73.6% で不採用。
  - R1-B: control `CMD-PURGE` → `AI-WIND-1`。control 65.8% / 63.9% で不足。
  - R1-C: R1-B + `CMD-WIND-RITE` → `AI-WIND-1`。control 67.5% / 62.8% で不採用。
  - R1-D: R1-B + `AI-EARTH-4` → `AI-EARTH-1C`。control 59.0% / 59.6% で近いが不足。
  - R1-E/F: `AI-WIND-3B` または `AI-EARTH-3` 追加弱体。control 40% 前後まで落ち過剰で不採用。
  - R1-G: R1-D + control `CMD-EARTH-RITE` → `AI-EARTH-1`。control 52.0% / 51.0% で採用候補。
- [x] 2-2. **ゲート**: control 45-55% 帯内 + 他デッキの帯外悪化なし → 最終値: R2-H 後 control 55.0% / 52.6%（平均 53.8%）
- [x] 2-3. 採用変更の docs 反映 + balance-history 記録

### Step 3 — R2: water / wind バフ（§5。R1 の結果次第でスキップ可）

- [x] 3-1. R1 後の water/wind 値で要否判断 → 判断: R1-G 時点で water 39.9〜43.5%、wind 43.9〜45.3% のため R2 実施。
- [x] 3-2. （実施時）1 変更 = 2 シードリーグで実施 → 結果: water `AI-WATER-1B` → `CMD-DEEP-CURRENT`、`CMD-WATER-RITE` 1→2 ドロー、fire `AI-FIRE-3` → `AI-FIRE-1B`、earth `CMD-EARTH-RITE` → `AI-EARTH-1` を採用。中間案 `AI-WATER-4B` / `AI-WATER-4D` / `AI-EARTH-1D` は water 崩れまたは earth 過強化で不採用。
- [x] 3-3. **ゲート**: 全単色 45-55% → 最終値: fire 48.1%、water 47.9%、wind 47.8%、earth 51.4%（2 シード平均）

### Step 4 — R3: 総仕上げ再ベースライン（§6）

- [x] 4-1. 先攻勝率の再計測 → 結果: 48.0% / 47.4%（平均 47.7%。帯外なら独立課題起票 → 起票: `docs/fair-cpu-followups.md` 2a）
- [x] 4-2. リーグ 2 シード + 盛り上がり + ストレスデッキの全再計測 → リーグ全デッキ帯内。盛り上がり: 平均 23.1T、逆転 49.9%、resource 22.4%。ストレス全 OK。
- [x] 4-3. balance-history に「公平基準リバランス」エントリ
- [x] 4-4. **ゲート**: `npm run check` green + ガードテスト green → `npm run check` green、`npm run test:balance` green（costBalance guard 7 tests）

### Step 5 — R4: beginner 較正（§7）

- [x] 5-1. 原因の切り分け（beginner 強化 or challenger の earth 弱点）→ 結論: water は 11.8% で帯内。fire 28.7%、earth 53.3%、特に earth は beginner が勝ち越し。beginner 一律弱体ではなく challenger の earth 運用弱点。
- [x] 5-2. 対処の実施（CPU 変更になる場合は別コミット + fair-cpu-plan の作法）→ CPU 変更は本カード/デッキ調整に混ぜず、`docs/fair-cpu-followups.md` に独立課題として起票。
- [x] 5-3. **ゲート**: 較正 5-20%（2 シード）→ 最終値: fire 28.7%、water 11.8%、earth 53.3%。未達のため CPU 別課題。

### Step 6 — R5: apex 差し替え判断（§8）

- [x] 6-1. プール変更後の apex 再探索 or `apex_mutation_056` の複数シード再確認 → 結果: seed 810101 再探索 best `apex_mutation_004` 51.6%、current_apex 50.6%。current 直接ペアは 50-50 / 49-51 で明確な勝ち越しなし。
- [x] 6-2. 差し替え時: test:balance ガードレール + docs 更新。据え置きなら記録のみ → 据え置き。balance-history / followups に記録。

### Step 7 — クロージング

- [x] 7-1. 露見した独立課題（リソース決着率・先攻勝率等）の起票状況を確認 → `docs/fair-cpu-followups.md` に先攻勝率 / resource 決着 / beginner fire-earth 較正を記録。
- [x] 7-2. 本計画書のステータスを「完了」に更新し、実施結果サマリを冒頭に追記
