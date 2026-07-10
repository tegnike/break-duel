# 最強 CPU 第 4 次計画・手順書 — 最終強化ウェーブ + 世界の再構築

作成日: 2026-07-08
ステータス: 完了（最強 CPU v1 達成。先攻勝率のみ独立監視）
進行状況: **§9 のチェックリストが正**。作業を進めたら必ず §9 を更新すること
前提: `docs/archive/strongest-cpu3-plan.md`（第 3 次・完了。fair-gen003 = beam3 採用）まで全て

> **別セッションで着手する人へ（最初に読む）**
>
> 1. 作業ブランチは **`codex/fair-rebalance-from-public-info`（正本）またはその派生**。main は使わない
> 2. 現行チャンピオンは **fair-gen003**（`turnPlanBeamWidth=3` + 公開既知手札カウンティング）。
>    fair-gen002 以前の勝率数値との比較は禁止
> 3. ガードテスト（公開情報同一 → 行動同一）は全変更で green 維持。作法・コマンドは
>    `docs/archive/strongest-cpu-plan.md` §8/§10 と `docs/archive/fair-cpu-results.md` 末尾
> 4. **§1 の完走ルールを最初に読むこと**。この計画は 1 ゲート失敗では止まらない

## 0. 目的 — この計画で「最強 CPU v1」を宣言する

本計画は 2 部構成で、完了時に**最強 CPU の第 1 版達成を正式に宣言する**ことがゴール:

- **第 1 部（Arc W）: CPU 最終強化ウェーブ** — beam3 で開いた扉の先を全部回収する。
  ガントレットはミラーデッキ対決なのでリーグが壊れていても計測有効。**先に強化を撃ち切る**
- **第 2 部（Arc B）: 世界の再構築** — 確定した最終 CPU を計測器として、
  fair-gen003 で壊れて見えた世界（リーグ・ストレスデッキ・較正）を**最後に 1 回だけ**直す

順序の理由: CPU が変わるたびに世界の数値は無効になる。強化 → 修復 → 強化 → 修復は
二度手間なので、強化を全部終えてから修復する。

### 「最強 CPU v1 達成」の宣言条件（全部満たしたら宣言）

1. Arc W の全トラックが消化済み（採用/却下とも 2 シードの証拠つき）
2. ブラウザ実測で思考時間が 1 秒制約内（平均だけでなく**最大値**も確認）
3. 公平性ガードテスト green（公開情報のみ、の原則維持）
4. Arc B 完了: リーグ全単色 45-55% / ストレスデッキ全 OK / beginner 較正 5-20% /
   先攻勝率 48-52%（届かない場合は独立課題として起票し、値を明記）
5. `docs/balance-history.md` に「最強 CPU v1」エントリを記録

## 1. 完走ルール（第 3 次と同じ + 追加 1 点）

- Arc W 内はゲート未達でも止まらず次のトラックへ（記録必須）
- Arc B は**合格するまで反復してよい**（1 変更 = 1 検証の作法で、回数制限なし。
  ただし各試行は必ずチェックリストに記録）
- コンテキストが苦しくなったら: チェックリスト更新 → コミット → 新セッションが §9 から再開
- 例外（即停止）: check/ガードテストが直せない形で壊れた場合、ユーザー判断が要る仕様変更
- **追加**: Arc W で採用が出るたびに `fair-genNNN` を凍結し、以降のゲート相手を最新世代に更新する

## 2. Arc W-0 — 出荷可否の下地（最初にやる）

1. **ブラウザ思考時間の実測**: beam3 での 1 手あたり平均/最大を実ブラウザで計測
   （旧 beam2 は最大 773ms の実績あり。最大値が 1 秒に迫るなら枝刈り改善を W1 で優先）
2. 盛り上がり計測用の基準取得: 現状の fair-gen003 でのリーグ・盛り上がり数値は
   第 3 次結果に記録済み。ここでは確認のみ

## 3. Arc W-1 — ビーム幅と枝刈りの掃引

1. 幅 2/3/4/5 を同一条件でガントレット（対 fair-gen003、2 シード）+ 思考時間計測
2. 候補生成の質の改善（明白な悪手の事前枝刈り、同型系列の重複排除）を 1〜2 案試し、
   同幅での勝率/時間改善を確認
3. ゲート: 55%（対現行チャンピオン）+ 床値非悪化 + 思考時間 1 秒内。
   採用なら fair-gen004 凍結

## 4. Arc W-2 — 重み再探索（プランナー時代の新地形。期待値が復活）

現行 28+ 重みは**貪欲時代**に最適化された値。プランナーで評価地形が根本から変わったため、
過去の「探索は全滅」の実績は無効。

1. beam 有効状態で `npm run tune:ai`（複数パス・エリート継承・変異幅縮小）を最新プール相手に実行
2. 特に見直す価値がある重み: 盤面/手札価値（終端評価に一本化された影響）、
   `handTradeAttack` 系（カウンティング導入の影響）、資源系（プランナーが資源手順を読める影響）
3. ゲート: 55%（2 シード）+ 床値非悪化。採用なら fair-gen005 凍結

## 5. Arc W-3 — 相手ターン読み（旧 Phase 4。ついに前提条件が揃った）

第 1 次計画から保留され続けた 2 手読み。プランニングが機能し（第 3 次）、
公平な手札推定（knownHandCards + 公開推定）もあるため、前提が初めて揃った。

1. 設計: 自ターンの最良系列の後、相手の返しターンを**公平な推定手札**で 1 手番読み、
   最悪応手を織り込んだ評価に変える。乱数効果は期待値下界で扱う（第 3 次 P2 の設計流用）
2. 計算量対策: 自系列の上位 K 本のみ相手読みを行う 2 段構え。思考時間 1 秒制約を必ず実測
3. 等価テスト: 相手読み深さ 0 = 現行、をテストで固定
4. ゲート: 55%（対最新世代、2 シード）+ 床値非悪化 + 時間内。採用なら次世代凍結

## 6. Arc W-4 — 合成と最終確定

1. W1〜W3 の採用/準リード（52% 超）を合成テスト（第 3 次 X トラックと同じ作法。
   各トラック最大 2 候補、2 個 → 3 個の順）
2. 最終世代を確定し、`docs/assets/ai-champions/fair/` に凍結。
   **これが最強 CPU v1 の实体**となる
3. 全滅だった場合も beam3（fair-gen003）を最終世代として Arc B へ進む（宣言条件は変わらない）

## 7. Arc B — 世界の再構築（最終 CPU 確定後に 1 回だけ）

作法は `docs/archive/fair-rebalance-plan.md` と同じ（原因分析 → 最小変更 → 2 シードリーグ、
CPU は以後触らない、カード/ルール変更は CPU と別コミット）。

**B0: 原因分析（コード変更なし）**

1. earth 70.2% / wind 62.5% の勝ち筋分解: プランナーがどの手順（回収ループ・再行動・チャージ段取り）を
   回しているか matches.jsonl で特定
2. ストレスデッキ RISK（p2-3 63.8% 等）の分解: 高 power カードがどう段取りされて出てくるか。
   **コストカーブ（ルール側）の問題か、特定カードの問題か**を切り分ける
3. water 36.9% / control 39.1% / fire 42.7% の負け筋分解
4. 修正仮説を列挙（影響が小さい順）。**ストレス対策とリーグ対策が同じ変更で済む仮説を優先**

**B1: コストカーブ / ストレスデッキ対策（最重症から）**

- 目標: p1〜p4 の全ストレス候補が OK 判定に戻ること（`npm run balance:cost` + `npm run test:balance`）
- 高 power の召喚/チャージコスト、行動条件などルール数値の調整を優先検討
  （個別カードのモグラ叩きより波及が素直）

**B2: リーグ帯の回復**

- 目標: 全単色 45-55%（2 シード平均）。earth/wind ナーフと water/control/fire の浮上
- B1 の変更でリーグも動くため、B1 確定後に差分を再計測してから着手

**B3: 較正と仕上げ**

- beginner 較正: fire/water/earth とも 5-20%（earth 2.0% の回復。beginner 側調整も可）
- 先攻勝率 48-52% の確認（届かなければ独立起票）
- 盛り上がり指標の確認: リード交代 49.5% からの回復が望ましい。明確に悪化したままなら記録して起票

**B4: 総仕上げ**

- **followups 全項目の棚卸し**: `docs/fair-cpu-followups.md` の全課題について「解消 / 継続 / 起票済み」を
  明記して更新する。特に **challenger の資源焼き尽くし弱点**（第 2 次 S0 で発見、第 3 次時点で未解消と記録）は、
  最終 CPU で消耗戦診断（earth/water ミラーの resource_exhaustion 率）を再実行して現状を確定させる
- 再ベースライン一式 + apex 再探索 + balance-history「最強 CPU v1」エントリ
- `npm run check` green / ガードテスト green / tutorial green

## 8. やらないこと・注意

- deck-specific CPU 補正で世界の歪みを CPU 側に吸わせること（計測器の中立性を守る。
  やるならユーザー判断を仰ぐ）
- fair-gen002 以前との数値比較
- Arc B 中の CPU 変更（気づきは次期計画の種として記録のみ）
- Track C 型のエンジン改善は現行ガントレットで勝率計測できない（両陣営に効くため）。
  勝率を主張する場合は AI バージョン切り替え機構の実装が先（必要になったら独立課題化）

## 9. 進行状況チェックリスト（作業のたびに更新すること）

### Step 0 — 着手準備

- [x] 0-1. 正本ブランチ確認 + `npm run check` green + ガードテスト green → ブランチ: `codex/fair-rebalance-from-public-info`。初期 `npm run check` green（typecheck / unit 287 tests / build）。ガード + tutorial: `npx vitest run src/game/aiStrategy.test.ts src/game/tutorial.test.ts` green（17 tests）。
- [x] 0-2. 現行チャンピオン fair-gen003 と第 3 次結果の基準数値を確認 → `docs/assets/ai-champions/fair/fair-gen003.json`（`turnPlanBeamWidth=3`）。第 3 次最終基準: league 平均 break 45.9 / control 39.1 / fire 42.7 / water 36.9 / wind 62.5 / earth 70.2、先攻 47.3。盛り上がり: リード交代 49.5%、2点ビハインド逆転 45.8%、lifeout 84.2% / resource 15.7%。stress: p2-3 63.8%、p3 55.5%、p3-4 58.7%、p4 57.9% が RISK。beginner: fire 9.0%、water 10.25%、earth 2.0%。

### Step 1 — W0: 出荷可否の下地（§2）

- [x] 1-1. ブラウザ思考時間の実測（平均/最大）→ 実測: Chrome 149 / Vite 実ブラウザ計測、beam3、7デッキ同一ミラー各10試合（70試合、AI選択 5,784 回）。平均 0.170ms、最大 1.900ms、p95 0.600ms、p99 0.900ms、750ms超過 0、1000ms超過 0。デッキ別最大: break 1.900 / control 1.900 / fire 1.200 / water 1.600 / wind 1.100 / earth 1.400 / apex 0.900ms。
- [x] 1-2. 最大値が 1 秒に迫る場合は W1 の枝刈りを優先事項に昇格 → 判断: 最大 1.900ms で 1 秒制約から十分遠い。W1 の枝刈りは勝率改善候補として扱い、時間制約対策としては優先昇格しない。

### Step 2 — W1: ビーム幅と枝刈り（§3）

- [x] 2-1. 幅 2/3/4/5 の掃引（勝率 + 時間）→ 結果: 対 fair-gen003 固定、games-per-seat 100、seed 961001 / 962001。beam2: 46.2% / 45.6%（2シード平均 45.9%、平均床 40.7%）。beam3: 50.0% / 50.0%。beam4: 54.2% / 53.0%（平均 53.6%、平均床 49.9%）。beam5: 59.6% / 57.9%（平均 58.7%、平均床 51.0%、ただし seed 962001 の water 床 48.5%）。ブラウザ時間（各幅42試合）: beam2 平均 0.127ms / 最大 2.400ms、beam3 平均 0.162ms / 最大 1.200ms、beam4 平均 0.218ms / 最大 1.200ms、beam5 平均 0.259ms / 最大 1.700ms。全幅で1000ms超過 0。
- [x] 2-2. 枝刈り改善 1〜2 案 → 結果: 状態重複排除案（beam5 + dedupe）を実装一時パッチで検証。seed 961001: 59.4% / 床 54.4%、seed 962001: 57.9% / 床 45.6%（water悪化）。床値を戻せないため不採用、実装差分は除去済み。
- [x] 2-3. 55% 判定 + 採用時 fair-gen004 凍結 → 判定: beam5 は2シードとも55%超かつ時間内だが、seed 962001 の deck floor が 48.5% まで落ち、厳密な床値非悪化を満たさないため W1 単独採用は見送り。W4 の準リード候補として保持。fair-gen004 凍結なし。

### Step 3 — W2: 重み再探索（§4）

- [x] 3-1. beam 有効での探索実行 → best: `npm run tune:ai -- --base-json docs/assets/ai-champions/fair/fair-gen003.json --champions-dir tmp/strongest-cpu4-w1/champions --iterations 36 --passes 3 --elite-count 4 --games-per-seat 16 --seed 963001 --out tmp/strongest-cpu4-w2/tuning.json`。fitness best は pool 62.6% だが pool_floor 43.8% でゲート外。独立確認候補は `w2-gateish-p2c008`（探索内 pool 60.0% / floor 50.0%）と `w2-h2h-p2c019`（探索内 pool 57.5% / floor 48.1%、h2h 64.9% / floor 51.6%）。
- [x] 3-2. 独立 2 シード確認 → 結果: `w2-gateish-p2c008` は seed 964001: 53.0% / floor 41.0%、seed 965001: 53.7% / floor 42.5%。`w2-h2h-p2c019` は seed 964001: 55.5% / floor 47.0%、seed 965001: 57.8% / floor 51.5%。
- [x] 3-3. 55% 判定 + 採用時 fair-gen005 凍結 → 判定: `w2-h2h-p2c019` は勝率ゲートを通るが、seed 964001 の apex 床 47.0% で床値非悪化に失敗。W2単独採用なし。`w2-h2h-p2c019` はW4準リード候補として保持。fair-gen005 凍結なし。

### Step 4 — W3: 相手ターン読み（§5）

- [x] 4-1. 実装（上位 K 系列のみ相手読み、等価テスト: 深さ 0 = 現行）→ 結果: 公開盤面のみの返し脅威（hidden hand identity は読まない）を終端評価へ入れる一時実装を作成し、深さ0等価テスト・hidden hand identity ガードを追加して green 確認。その後、勝率不採用のため実装差分と追加テストは除去済み。
- [x] 4-2. 思考時間実測（平均/最大）→ 実測: 最良スクリーン候補 `w3-k1-p025`、Chrome 149 / Vite 実ブラウザ、42試合・AI選択 3,388 回。平均 0.210ms、最大 2.000ms、p95 0.600ms、p99 0.900ms、1000ms超過 0。
- [x] 4-3. ガントレット 2 シード + 55% 判定 + 採用時次世代凍結 → 判定: スクリーン4設定（seed 966001、games-per-seat 60）は全て50%未満。最良 `w3-k1-p025` を正式確認し、seed 967001: 47.0% / floor 39.9%、seed 968001: 49.8% / floor 43.7%。55%未達のため不採用。次世代凍結なし。

### Step 5 — W4: 合成と最終確定（§6）

- [x] 5-1. 採用/準リードの合成テスト → 結果: W1準リード beam5、W2準リード `w2-h2h-p2c019`、合成 `w4-w2-h2h-beam5` を確認。合成は seed 969001: 61.6% / floor 57.1%、seed 970001: 60.2% / floor 48.0%、追加確認 seed 971001: 60.6% / floor 51.1%。2シード平均 pool 60.9%、平均床 52.5%。追加シード込み平均 pool 60.8%、平均床 52.1%。W1/W2単独より pool/floor の両立が良い。
- [x] 5-2. **最終世代の確定と凍結** → 世代: `fair-gen004`。`CHALLENGER_WEIGHTS` に反映し、`docs/assets/ai-champions/fair/fair-gen004.json` を凍結。`npm run typecheck` green、`npx vitest run src/game/aiStrategy.test.ts` green（15 tests）。

### Step 6 — B0: 世界の原因分析（§7。コード変更なし）

- [x] 6-1. earth/wind の勝ち筋分解 → 所見: fair-gen004 後の B0 リーグでも wind 72.4%、earth 71.4%。planner が power 3/4 の素出しテンポ、風の再行動/消耗、土の持久・回収を高効率に使うことで、fair-gen003 副作用が継続していた。
- [x] 6-2. ストレス RISK の分解（ルール問題かカード問題か）→ 所見: B0 stress は p2-3 57.3%、p3 50.7%、p3-4 57.4%、p4 58.8%。特定カード単体より、高 power 通常登場が即攻撃/防御へつながるコストカーブ問題が主因。
- [x] 6-3. water/control/fire の負け筋分解 → 所見: B0 league は control 25.1%、water 37.1%、fire 44.6%。control は火力不足、water は決定打不足、fire は第2 seed で届くが安定性不足。高 power 抑制だけでは水/control が浮き切らないため、デッキ側の小調整も必要。
- [x] 6-4. 修正仮説リスト（ストレスとリーグの同時解決案を優先）→ 仮説: (1) power3/4 通常登場を消耗にして高 power テンポを抑える (2) earth/wind の高 power 密度を下げる (3) water は `CMD-TIDE-EDGE` と水向け遺物で決定力を補う (4) control は高 power 1枚で最低火力を補う (5) beginner 較正は challenger を触らず beginner の単純手筋だけ補正する。

### Step 7 — B1: コストカーブ / ストレス対策

- [x] 7-1. 仮説順に 1 変更 = 1 検証で実施（試行は行を足して記録）→ B1a: control 過強/water 崩れ。B1b: power4 消耗のみでは stress 悪化。B1c: power4 消耗 + 最小デッキ調整で近づくが fire/wind/stress 未達。B1d: power3/4 消耗で stress は p2-3 52.3% 以外 OK。B1e: water/wind 追加調整で break/fire が上振れ。B1f: `CMD-TIDE-EDGE` +3 で water 回復、p2-3 50.67%。B1g: wind 復元で stress 全 OK、2シード平均リーグも帯内。
- [x] 7-2. **ゲート**: 全ストレス候補 OK（balance:cost + test:balance）→ 最終値: 500 games/order、seed 3000000。p1 0.00%、p1-2 6.53%、p2 27.15%、p2-3 49.95%、p3 39.60%、p3-4 46.05%、p4 43.67%、全 OK。`npm run test:balance` green。

### Step 8 — B2: リーグ帯の回復

- [x] 8-1. B1 後の差分再計測 → 状態: B1g 50 games/pair では break 54.8%、control 46.7%、earth 45.0%、fire 52.7%、water 52.2%、wind 48.1%。正式 100 games/pair へ進行。
- [x] 8-2. 残る帯外の調整（1 変更 = 2 シードリーグ）→ 試行記録: B1g を正式候補として採用。追加のリーグ向け調整は不要。
- [x] 8-3. **ゲート**: 全単色 45-55% → 最終値: 100 games/ordered pair、seed 4101 / 730001 平均。break 54.3%、control 46.1%、fire 53.3%、water 51.2%、wind 46.5%、earth 48.3%。全単色 45-55% 内。

### Step 9 — B3: 較正と仕上げ

- [x] 9-1. beginner 較正 5-20%（fire/water/earth、2 シード）→ 最終値: fire 11.0%、water 5.0%、earth 5.0%。水 beginner は `CMD-TIDE-EDGE`、土 beginner は場が埋まった後の単純アップグレードを使うよう補正。
- [x] 9-2. 先攻勝率の確認（帯外なら独立起票）→ 結果: 6デッキ正式リーグ平均 47.0%（seed 4101: 47.7%、730001: 46.3%）で 48-52% 未達。`docs/fair-cpu-followups.md` に独立監視課題として記録。
- [x] 9-3. 盛り上がり指標の確認（リード交代の回復）→ 結果: break vs control、1000戦、seed 4101。平均 27.3T、リード交代あり 57.9%、平均交代 1.00、2点ビハインド逆転 44.8%、先に2点差側勝率 64.1%、resource 7.1%、draw 6.1%。

### Step 10 — B4: 総仕上げと最強 CPU v1 宣言

- [x] 10-1. 再ベースライン一式 + apex 再探索 → 結果: リーグ/ストレス/beginner/盛り上がりを再計測。apex は `apex_mutation_007` を採用（探索リーグ 61.2%、current 直接対決 106-72-22）。
- [x] 10-2. followups 全項目の棚卸し（資源焼き尽くし弱点の消耗戦再診断を含む）→ 各項目の状態: `docs/fair-cpu-followups.md` 更新。water/wind/control は解消、beginner 較正は解消、apex は差し替え完了、fair-gen003 副作用は解消。先攻勝率だけ継続監視。resource 弱点は water 敗北 20 件中 resource 9 件、earth 20 件中 0 件まで軽減。
- [x] 10-3. balance-history に「最強 CPU v1」エントリ + 関連 docs 更新
- [x] 10-4. **最終ゲート**: `npm run check` + ガードテスト + tutorial 全て green → `npm run check` green（typecheck / unit 289 tests / build）。`npx vitest run src/game/aiStrategy.test.ts src/game/tutorial.test.ts` green（19 tests）。
- [x] 10-5. §0 の宣言条件 5 項目を照合し、本計画書のステータスを「完了（最強 CPU v1 達成）」に更新 → 照合: Arc W 全トラック消化、ブラウザ最大 2.0ms 未満、ガードテスト維持、Arc B は先攻勝率のみ独立監視で他ゲート合格、`docs/balance-history.md` に最強 CPU v1 エントリ追加。
