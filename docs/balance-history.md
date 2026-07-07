# Break Duel バランス履歴

最終更新: 2026-07-07

この文書は、デッキやルールのバランス変更で採用判断に使った主要な検証結果を残す履歴です。現行ルールの正仕様は `docs/game-spec.md`、実装構成は `docs/architecture.md` を参照します。

## 2026-07-07 場防御時効果の失敗場防御対応: 採用

### 背景

`場防御成功時` の効果は、特に power 1 召喚獣では「攻撃を止められる場面が少なく、カード効果として機能しづらい」というレビューがあった。プレイヤー向けには、場の召喚獣を差し出してでも1ドロー/回収する判断を作る方が分かりやすいため、条件を `場防御時` に変更した。

### 採用変更 / 変更内容

Python/TypeScript 両方で、場防御は防御値不足でも選択可能に変更。防御値不足の場合、防御召喚獣はトラッシュされ、攻撃は通り、攻撃召喚獣の power 分ダメージとブレイクドローが発生する。

`場防御時` 効果は防御値不足でも発動する。対象は `AI-EARTH-1B` / `AI-EARTH-2B` / `AI-EARTH-4B` / `AI-EARTH-1D` / `AI-WATER-2D` / `MEM-TIDAL-MIRROR`。一方、`攻撃が防御された時` の攻撃側効果は、攻撃を止めた場合だけ発動する。

### 検証

今回は裁定変更の実装同期と回帰確認のみ。勝率・盛り上がり指標の数値評価は未実施のため、バランス上の優劣は主張しない。

- TypeScript typecheck: pass
- TypeScript unit: 231 passed
- Python unittest: 228 passed
- Vite build: pass

### 判断

採用。1コストの場防御時効果が「止められる時だけ」ではなく「場の召喚獣を差し出して資源化する」役割を持つようになり、カード本文とプレイ判断が一致する。

### 検証コマンド

```bash
PATH="/Users/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" node node_modules/typescript/bin/tsc --noEmit
PATH="/Users/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" node node_modules/vitest/vitest.mjs run
python3 -m unittest
PATH="/Users/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" node node_modules/vite/bin/vite.js build
```

## 2026-07-06 ユーザーレビュー反映13件のカード効果修正後の再検証: 採用（現状維持）

### 背景

第2弾30種の初回バランス調整（echoes 55.4%達成、直下エントリ）後、ユーザーレビューを受けて13件のカード効果修正を実施済み（`npm run check` は全て通過済みだが、修正後のバランス検証は未実施の状態からの着手）。

修正のうち、ゲームバランスに影響するもの6件:

1. `CMD-RELIC-CRUSH` 遺物砕き: 「相手に遺物がなければドロー」を削除し「相手の遺物があるときしか使用できない」に変更（弱体化）
2. `MEM-DUAL-BANNER` 双色の軍旗: ドロー1→2枚（強化）
3. `AI-FIRE-2D` 焔喰いガルル: 条件付き攻撃値ボーナス +1→+2（強化）
4. `AI-EARTH-2D` 苔纏いドルモ: 条件付き防御値ボーナス +1→+2（強化）
5. `AI-FIRE-3D` 焔角のグレンド: 攻撃値+1を削除、貫通1ダメージのみに（弱体化）
6. `AI-FIRE-4D` 灰滅竜ヴァレン: 退場時ドローを削除、条件付き攻撃値+1のみに（弱体化）
7. `AI-WATER-3D` 深響のセレナ: 登場時ドローを削除、防御された時ドローのみに（弱体化）
8. `AI-WATER-4D` 海淵帝グランマーレ: 登場時ドローに「相手も1枚引く」代償を追加（弱体化）

残り（強制発動→任意発動、自己言及テキスト削除、術式条件文統一、名称変更等）は文言・UX 調整でロジック不変。

`echoes` は水属性の弱体化4枚（グランマーレ×2・セレナ×1・水渦のシラス経由の水軸強化含む）を主力に据えているため、前回 55.4% だった echoes の勝率が下がる懸念があった。

### 変更内容

このエントリでは**コード変更なし**（対象の13件修正はセッション開始前に実装済み）。Python/TypeScript 両実装の同期を diff で個別確認（`ai_break_duel/cards.py`・`engine.py` と `src/game.ts`・`src/game/actions.ts` の該当箇所を突合）し、以下が両側で一致していることを確認:

- `relic_crush`: 発動条件に `opponent.memory is not None` / `Boolean(opponent.memory)` を追加、条件を満たさない場合はドロー分岐なし
- `dual_banner`: `player.draw(2, ...)` / `drawCards(player, 2)` に統一
- `discard_commands_attack_plus_1`（焔喰いガルル）: bonus += 2 に統一
- `defense_plus_1_with_memory`（苔纏いドルモ）: bonus += 2 に統一
- `hand_defense_pierce`（焔角のグレンド）: 攻撃値ボーナスなし、貫通のみ
- `discard_ai_attack_plus_1`（灰滅竜ヴァレン）: bonus += 1 のみ、`draws_on_play` 系リストに含まれない（退場時ドロー廃止済み）
- `return_after_overheat_opponent_draw_on_play`（海淵帝グランマーレ）: 登場時に自分と相手が両方ドローする効果文言で両側一致

`npx vitest run src/game/tutorial.test.ts` も pass（チュートリアル破損なし）。

### 検証

**リーグ**（8 デッキ総当たり、100 games/ordered pair × 3 シード = 16800 戦、seed 2026070701 / 2026070702 / 907771。league_report 判定 **PASS**）:

| デッキ | 前回（2026-07-06 デュアル差し替え後・3シード平均） | 今回（13件修正後・3シード平均） |
| --- | ---: | ---: |
| echoes | 55.4% | **54.1%** |
| apex | 68.0% | 68.0% |
| water | 50.5% | **50.0%** |
| earth | 49.6% | 49.9% |
| wind | 47.7% | 47.2% |
| fire | 45.5% | 45.3% |
| break | 43.5% | 44.1% |
| control | 39.5% | 41.1% |
| 先攻勝率 | 49.0% | 48.8% |

echoes の弱体化6枚（グランマーレ×2・セレナ×1 を含む）の影響は軽微（-1.3pt）で、50% 台・目安レンジ（52〜56%）の下限付近に留まった。水単も 50.0% で 50% 台前半を維持。

echoes の相手別勝率（3シード合算、各600戦）: apex 37.5% / break 51.2% / control 59.7% / earth 62.0% / fire 51.2% / water 60.8% / wind 56.2%。先手時 51.9% / 後手時 56.2%（先後で 4pt 程度の差はあるが前回エントリと同水準の傾向で新規の偏りではない）。ワンサイド率（one_sided_game_rate 加重平均）は全体 48.7%、echoes 絡み 53.6%（前回 48.1% / 52.9%）で、僅かな上振れはあるが既存基準から悪化とは言えない範囲。

**盛り上がり指標**（simulate 1000 戦ずつ、seed 2026070741/742/743）:

| 指標 | 前回基準（2026-07-05 / 07-06 エントリ） | 今回 |
| --- | ---: | ---: |
| 標準対戦 平均ターン | 14.4 | 14.4 |
| 標準対戦 リード交代あり | 64.4-64.5% | 64.9% |
| 標準対戦 2点ビハインド逆転 | 51.5-52.0% | 52.6% |
| 標準対戦 先2点差側勝率 | 58.7-58.8% | 57.7% |
| echoes vs water 平均ターン | 15.6-16.5 | 17.8 |
| echoes vs water 逆転率 | 52.4-52.5% | 50.3% |
| echoes vs water 先2点差側勝率 | 57.5-58.4% | 57.4% |
| echoes vs apex 平均ターン | 17.6 | 20.2 |
| echoes vs apex 逆転率 | 49.8-52.4% | 47.0% |
| echoes vs apex 先2点差側勝率 | 56.9-59.7% | 62.2% |

水単・echoes 絡みの対戦がやや長引く傾向（弱体化カードにより決着が伸びる方向）が見られるが、ワンサイド化の悪化は確認されず、決着形態も lifeout 主体で健全。

**弱体化カードの実戦での機能確認**（echoes vs water simulate 1000 戦の card_usage）: 海淵帝グランマーレは登場時ドロー（相手ドローとセット）1563 回・攻撃後手札帰還 1350 回・攻撃 1482 回で主力フィニッシャーとして機能継続。深響のセレナは防御された時ドロー 253 回・攻撃 544 回で運用継続。潮渦のシラス・古磐熊ゴロン・苔纏いドルモも通常運用範囲内でプレイされている。弱体化後もデッキの勝ち筋として機能しており、単に採用率が落ちた形跡はない。

**壊れ監視**: `貫きの眼光` / `天嵐王ジェイル` は今回の13件修正の対象外（未変更）。前回エントリ（2026-07-06）で「壊れとは逆方向（むしろ弱い）」の判定済みであり、今回の変更が影響する経路もないため再検証は不要と判断。

**ストレスデッキ回帰**（`run_cost_balance.py` --games-per-order 1000、seed 2026070751、各帯 12000 戦）: 全7帯 **OK**。p1 0.03% / p1-2 3.43% / p2 9.37% / p2-3 37.57% / p3 32.66% / p3-4 41.41% / p4 43.36%。前回（seed 2026070481: 0.0 / 3.7 / 9.4 / 38.4 / 33.0 / 41.9 / 44.9）とほぼ同水準で、コストカーブの破綻はなし。13件の修正は攻撃値・防御値・ドロー条件のみでコスト構造に触れていないため、この結果は想定通り。

`npm run check` green（typecheck + TS unit + build + Python unittest 228 件）。

### 判断

**現行構成のまま採用（デッキ調整不要）**。13件の効果修正後も echoes 54.1%・water 50.0% は合格基準（echoes 50%台で既存よりやや強い水準、目安52-56%／water 50%台前半）を満たしており、60%を超えるケースも発生していない。弱体化6枚の影響は事前に懸念したほど大きくなく、echoes は目安レンジの下限付近（54.1%）に着地した。先攻勝率・ワンサイド率・盛り上がり指標も既存基準から悪化なし。ストレスデッキ回帰も全帯OKでコストカーブの破綻なし。したがって `docs/set2-design.md` のバランス目標に照らして echoes の再構成（第1弾カード混合等）は不要と判断した。

監視点・残課題:

- echoes vs water / echoes vs apex の平均ターンがやや伸びる傾向（17.8 / 20.2 ターン）が見られる。弱体化カードにより決着が長引く方向のため、次回の弾で水軸をさらに強化する際はこの傾向の再拡大に注意する
- apex 68.0% の突出は継続の残課題（前回エントリから変化なし、今回の13件修正はapexの構成カードに影響しないため未再探索）
- control 41.1% / break 44.1% は前回からわずかに上昇（echoes・water の相対弱体化に伴う自然な変動、対応不要）

### 検証コマンド

```bash
npm run check
npx vitest run src/game/tutorial.test.ts
python3 -m ai_break_duel.cli league --games-per-pair 100 --seed 2026070701 --decks break control fire water wind earth apex echoes --out tmp/postfix-2026070701
python3 -m ai_break_duel.cli league --games-per-pair 100 --seed 2026070702 --decks break control fire water wind earth apex echoes --out tmp/postfix-2026070702
python3 -m ai_break_duel.cli league --games-per-pair 100 --seed 907771 --decks break control fire water wind earth apex echoes --out tmp/postfix-907771
python3 .agents/skills/ai-break-duel-balance-tuning/scripts/league_report.py tmp/postfix-2026070701 tmp/postfix-2026070702 tmp/postfix-907771
python3 -m ai_break_duel.cli simulate --games 1000 --seed 2026070741 --out tmp/postfix-sim-default
python3 -m ai_break_duel.cli simulate --games 1000 --seed 2026070742 --first-deck echoes --second-deck water --out tmp/postfix-sim-ew
python3 -m ai_break_duel.cli simulate --games 1000 --seed 2026070743 --first-deck echoes --second-deck apex --out tmp/postfix-sim-ea
python3 .agents/skills/ai-break-duel-balance-tuning/scripts/excitement_metrics.py tmp/postfix-sim-default
python3 .agents/skills/ai-break-duel-balance-regression/scripts/run_cost_balance.py --games-per-order 1000 --seed 2026070751 --rule-set current --out tmp/postfix-stress-regression.json
```

## 2026-07-06 power 3+ 合計 5 枚上限の再検証: ルールは現状維持（変更なし）

### 背景

「power 3-4 の投入枚数制限は過去の名残では」という疑問を受け、現行ルール（コスト=power、モンスター攻撃への手札防御割り込み込み）の下でも、power 3+ 召喚獣を積めば積むほど単調に強くなり続けるのか、上限を動かした場合にどこで頭打ちになるのか、5 枚という現行値が数ある選択肢の中で最良かどうかを検証した。ルール変更は行わず、検証のみ。

### 変更内容

なし（ゲーム本体のルール・カードは無変更）。検証のため、`.agents/skills/ai-break-duel-balance-regression/scripts/run_cost_balance.py` の `RULE_SETS` に実験用の `high_cap_1` / `high_cap_7` / `high_cap_8` / `high_cap_9` / `high_cap_10` / `high_cap_12` / `high_cap_14` / `high_cap_16` / `high_cap_19` を追加した（既存の `high_cap_2` / `high_cap_3` / `high_cap_4` / `high_cap_6` / `current`(5) と合わせて 1〜19 枚を一通り試せるようにするための追加。`.agents/skills/ai-break-duel-balance-regression/SKILL.md` の「Useful experimental rule sets」にも追記）。

### 検証

`p3_4`（power 3-4 cap stress deck; low-power filler may be added）を、power 3+ 上限 1/2/3/4/5(現行)/6/7/8/9/10/12/14/16/19 枚でそれぞれ構築し、既存 6 デッキ（break/control/fire/water/wind/earth）と 1000 games/ordered pair（計 12000 戦/条件）で総当たり。2 シード（4200001 / 5300001）で実施し、両シードはほぼ一致（誤差 1pt 未満）。

| power3+上限 | 総合勝率 | 判定 |
| ---: | ---: | --- |
| 1 | 6.3% | OK |
| 2 | 11.5% | OK |
| 3 | 21.6% | OK |
| 4 | 32.7% | OK |
| **5（現行）** | **42.3%** | OK（break 単体は 49.2%/50.0% とほぼ互角） |
| 6 | 54.0% | RISK |
| 7 | 67.3% | RISK |
| 8 | 74.1% | RISK |
| 9 | 80.9% | RISK |
| 10 | 85.4% | RISK |
| 12 | 91.4% | RISK |
| 14 | 95.2% | RISK |
| 16 | 95.4% | RISK |
| 19（実質無制限） | 95.8% | RISK |

上限 1〜10 枚のあたりでは頭打ちの気配がなく、1 枚刻みで +7〜13pt という急勾配で単調増加し続ける。頭打ち（飽和）が始まるのは 12〜14 枚あたりからで、14 枚以降はおよそ 95% 前後でほぼ横ばい（19 枚まで測っても 95.8% が上限）。95% で頭打ちになるのは、相手側の防御・除去・引き分け・先攻補正などの下振れ要素が残るため。

`npm run check` はゲーム本体に変更がないため実行不要（今回変更したのは検証スクリプトの実験用ルールセット定義のみ）。

### 判断

**現状維持。ルール変更は行わない。**

- power 3+ の投入枚数は「過去の名残」ではなく、現行ルール下でも実効性のある制限。上限を外す・緩めるほど単調に、かつ 10 枚程度までは頭打ちなく強くなり続けるため、緩和は確実にバランスを崩す。
- 5 枚未満（4 枚以下）に絞ると、大型偏重戦略そのものが競技ベースライン（break/control）に対して明確に見劣りする（4 枚で総合 32.7%）ため、戦略として成立しなくなる。
- 6 枚以上にすると即座に RISK 判定（54%）に転化し、7 枚以降は加速度的に悪化する。
- **現行の 5 枚は、「大型偏重戦略として成立するが支配はしない」という境界にちょうど位置する最適点**。5 枚未満・5 枚超過のどちらの方向にも、現行より良いバランスの選択肢はない。
- この検証により、`docs/design-principles.md` の「power 3+ 上限の 6 枚以上への緩和 → 大型偏重で消化試合度が悪化（検証済み）」という却下済み事項は、より広い範囲（1〜19 枚）のデータで裏付けられた。今後 power 3+ の投入枚数制限を変更する提案がある場合は、本エントリの単調増加カーブを踏まえた新しい検証データを添えること。

### 検証コマンド

```bash
python3 .agents/skills/ai-break-duel-balance-regression/scripts/run_cost_balance.py --candidate p3_4 --rule-set high_cap_2 --rule-set high_cap_3 --rule-set high_cap_4 --rule-set current --rule-set high_cap_6 --games-per-order 1000 --seed 4200001 --out tmp/p34-capcurve-4200001.json
python3 .agents/skills/ai-break-duel-balance-regression/scripts/run_cost_balance.py --candidate p3_4 --rule-set high_cap_2 --rule-set high_cap_3 --rule-set high_cap_4 --rule-set current --rule-set high_cap_6 --games-per-order 1000 --seed 5300001 --out tmp/p34-capcurve-5300001.json
python3 .agents/skills/ai-break-duel-balance-regression/scripts/run_cost_balance.py --candidate p3_4 --rule-set high_cap_1 --rule-set high_cap_7 --rule-set high_cap_8 --rule-set high_cap_9 --rule-set high_cap_10 --rule-set high_cap_12 --rule-set high_cap_14 --rule-set high_cap_16 --rule-set high_cap_19 --games-per-order 1000 --seed 4200001 --out tmp/p34-capcurve-ext-4200001.json
python3 .agents/skills/ai-break-duel-balance-regression/scripts/run_cost_balance.py --candidate p3_4 --rule-set high_cap_1 --rule-set high_cap_7 --rule-set high_cap_8 --rule-set high_cap_9 --rule-set high_cap_10 --rule-set high_cap_12 --rule-set high_cap_14 --rule-set high_cap_16 --rule-set high_cap_19 --games-per-order 1000 --seed 5300001 --out tmp/p34-capcurve-ext-5300001.json
```

## 2026-07-06 第2弾デュアル属性4種を単属性代替4種に差し替え: 採用

### 背景

第2弾 30 種は同日のバランス調整（直下エントリ）で検証済みだったが、**ユーザー判断で「デュアル属性（2属性持ちカード）は第2弾では時期尚早」となり将来の弾に延期**が決定。デュアル属性カード4種を削除し、単属性の power 3 代替4種に差し替えた。デュアル以外の第2弾新要素（ターン限定バフ・蘇生・遺物破壊回収・術式回収・チャージ p3/p4 拡張）は承認済みで変更なし。エンジンのデュアル属性基盤（`subAttribute` / `hasAttribute` 等、TS+Python）は使用カードゼロの予約仕様として残置。遺物 `双色の軍旗`（MEM-DUAL-BANNER）はデュアル機構を使わないため変更なしで続投。

### 変更内容（Python / TypeScript 両実装に同期）

| OUT（削除） | IN（追加・すべて単属性 power 3 / set 2 / 既存効果語彙の合成） |
| --- | --- |
| `AI-MAGMA-3` 溶岩甲ヴァルカ（火土） | `AI-FIRE-3D` 焔角のグレンド（火）: 戦闘時、攻撃値 +1。手札防御されても相手に1ダメージ |
| `AI-STEAM-3` 蒸気竜スチマー（火水） | `AI-WATER-3D` 深響のセレナ（水）: 登場時に1枚引く。攻撃が防御された時に1枚引く |
| `AI-MIST-3` 霧幻蝶ルウ（水風） | `AI-WIND-3C` 翠嵐鷹ハヤテ（風・チャージ対応）: チャージ時、相手の未消耗召喚獣1体を消耗させ、自分の消耗中召喚獣1体を回復（旋風転身術と同じ自動対象規則） |
| `AI-DUST-3` 砂嵐狼ザラン（風土） | `AI-EARTH-3C` 古磐熊ゴロン（土・チャージ対応）: チャージ時、トラッシュの召喚獣1枚を手札に戻す（手札枚数条件なし。チャージした自分自身は対象外 = AI-EARTH-1C 裁定に準拠） |

- 効果 ID も差し替え: `attack_plus_1_defense_plus_1` / `draw_on_blocked_attack_pierce` / `draw_spend_enemy_on_play` / `ready_ally_on_play_defense_draw` → `attack_plus_1_hand_defense_pierce` / `draw_on_play_blocked_attack_draw` / `charge_spend_enemy_ready_ally` / `charge_recover_discard_any`
- `echoes` デッキ: 霧幻蝶ルウ×1 → 深響のセレナ×1、蒸気竜スチマー×1 → 古磐熊ゴロン×1（25枚 / 同名2枚 / power 3+ 5枚を維持。他プリセットにデュアルは未投入で変更なし）
- CPU 評価値（TS `aiCardValue`・`chargeAiValue` / Python `_card_value`・`_charge_effect_value`、両側同値）と代表テスト（`cardEffectCoverage.test.ts` 4件差し替え + `tests/test_core_rules.py` 4件差し替え）を同期更新
- ルール数値・第1弾カード・遺物・術式の変更はなし

### 検証

**リーグ**（8 デッキ総当たり、100 games/ordered pair × 3 シード = 16800 戦、seed 2026070651 / 2026070652 / 907771。league_report 判定 **PASS**）:

| デッキ | 差し替え前（同日直下エントリ・3シード平均） | 差し替え後（3シード平均） |
| --- | ---: | ---: |
| echoes | 56.8% | **55.4%** |
| apex | 68.2% | 68.0% |
| water | 50.6% | 50.5% |
| earth | 50.3% | 49.6% |
| wind | 47.8% | 47.7% |
| fire | 45.1% | 45.5% |
| break | 41.5% | 43.5% |
| control | 39.5% | 39.5% |
| 先攻勝率 | 49.3% | **49.0%** |

echoes の相手別勝率（3シード合算、各 600 戦）: apex 39.3% / break 54.7% / control 65.5% / earth 59.7% / fire 53.2% / water 58.8% / wind 56.8%。先手時 54.2% / 後手時 56.7% で先後依存なし。ワンサイド率（one_sided_game_rate 加重平均）は全体 48.1%（差し替え前 49.0%）、echoes 絡み 52.9%（同 54.6%）で悪化なし。

**盛り上がり指標**（simulate 1000 戦ずつ）: echoes vs water（seed 2026070662）は平均ターン 16.5 / 2点ビハインド逆転 52.4% / 先2点差側勝率 57.5%（差し替え前 58.4%）、echoes vs apex（seed 2026070663）は平均ターン 17.6 / 逆転 52.4% / 先2点差側 56.9%（同 59.7%）。ワンサイド度は同水準〜微改善。

**新カードが機能している確認**（echoes vs water simulate 1000 戦の card_usage）: 深響のセレナは登場 535 回・防御された時ドロー 224 回、古磐熊ゴロンはチャージ 285 回中トラッシュ回収 282 回（登場 315 回・攻撃 483 回）。どちらもデッキの動きに組み込まれている。翠嵐鷹ハヤテ・焔角のグレンドはプリセット未投入（コレクション/カスタムデッキ向け）。

`npm run check` green（typecheck + TS unit 140 件 + build + Python unittest 226 件）。

### 判断

採用します。echoes 55.4% は目標（50% 台・60% 以下）に収まり、先攻勝率 48-52% 帯・ワンサイド率も既存基準から悪化なし。差し替えはデッキパワーをほぼ中立に保ったまま（echoes -1.4pt）デュアル機構だけを外せています。監視点・残課題:

- デュアル属性基盤（`subAttribute` / `hasAttribute` / `dualCard` テスト群）は使用カードゼロで残置。将来の弾で再利用する
- `翠嵐鷹ハヤテ` / `焔角のグレンド` はプリセット未投入のため対戦データが薄い。パック実装後のカスタムデッキ環境で観察する
- apex 68.0% の突出と第2弾プール込みの apex 再探索未実施は前エントリから継続の残課題
- 第2弾カードアート生成・パック抽選の第2弾プール接続も継続の残タスク（`docs/set2-design.md`）

### 検証コマンド

```bash
npm run check
python3 -m ai_break_duel.cli league --games-per-pair 100 --seed 2026070651 --decks break control fire water wind earth apex echoes --out tmp/dualswap-2026070651
python3 -m ai_break_duel.cli league --games-per-pair 100 --seed 2026070652 --decks break control fire water wind earth apex echoes --out tmp/dualswap-2026070652
python3 -m ai_break_duel.cli league --games-per-pair 100 --seed 907771 --decks break control fire water wind earth apex echoes --out tmp/dualswap-907771
python3 .agents/skills/ai-break-duel-balance-tuning/scripts/league_report.py tmp/dualswap-2026070651 tmp/dualswap-2026070652 tmp/dualswap-907771
python3 -m ai_break_duel.cli simulate --games 1000 --seed 2026070662 --first-deck echoes --second-deck water --out tmp/dualswap-sim-ew
python3 -m ai_break_duel.cli simulate --games 1000 --seed 2026070663 --first-deck echoes --second-deck apex --out tmp/dualswap-sim-ea
python3 .agents/skills/ai-break-duel-balance-tuning/scripts/excitement_metrics.py tmp/dualswap-sim-ew
```

## 2026-07-06 第2弾「残響の胎動」バランス調整（echoes 再構成 + 残響召喚緩和 + 水単強化）: 採用

### 背景

第2弾 30 種と第2弾主体プリセット `echoes`（残響胎動デッキ）の実装後、初のリーグ検証。調整前ベースライン（8 デッキ総当たり、100 games/ordered pair × 2 シード = 11200 戦、seed 2026070611 / 2026070612）は echoes **34.8%**（対 apex 20.0% / 対 water 32.0% など全デッキに負け越し）、water 51.6%、apex 71.4%、先攻 50.1%。目標は `docs/set2-design.md` バランス目標（2026-07-06 緩和改訂）: echoes が 50% 台（既存よりやや強い水準、60% 超は要ユーザー確認）、水単は 50% 台前半へ上方修正、先攻勝率・ワンサイド率は既存基準を維持、`貫きの眼光` / `天嵐王ジェイル` が壊れていないこと。

敗因分析: 旧 echoes は power 1 が 6 枚（うち風信子スゥ×2 は挑戦者 CPU がほぼ活かせないチャージ依存）で盤面が軽すぎ、除去術式が 0 枚（ドロー系術式 8 枚）でカードアドバンテージが勝ち筋に変換できていなかった。

### 採用変更（Python / TypeScript 両実装に同期）

1. **echoes デッキ再構成**（25 枚、第2弾 23 枚 + 第1弾 2 枚。power 3+ は 5 枚のまま）
   - OUT: 風信子スゥ×2 / 氷晶亀セルキー×1 / 深層のオルカ×1（2→1）/ 遺灰回収×1 / 過負荷解放×1 / 遺物砕き×1 / 残響の骨壺×1（2→1）
   - IN: 旋律鳥カナタ×2 / 苔纏いドルモ×2 / 霧幻蝶ルウ×1 / 追撃粛清×1 / 黒蔦の足止め×1 / 潮鏡の祭具×1（1→2）
   - 狙い: power 2 帯の実体を 3→9 枚に増やして盤面を作れる形にし、第1弾の汎用除去 2 枚（追撃粛清・黒蔦の足止め）で勝ち筋への変換を補助。勝ち筋は第2弾コア（海淵帝グランマーレ×2・潮汲みモネ×2・残響召喚×2・深流呼び×2・潮鏡の祭具×2）のまま
2. **カード変更: `CMD-GRAVE-CALL` 残響召喚（第2弾）** — 蘇生対象を power 2 以下 → **power 3 以下** に緩和（消耗状態で出す・登場時効果なしは従来通り）。engine/ai（Python）、game.ts/actions.ts/App.tsx/cardPresentation.ts（TS）、tests/test_core_rules.py、cardEffectCoverage.test.ts、docs を同期更新
3. **water デッキ**: 透海リュミナ（`AI-WATER-1`）×2 → 潮汲みモネ（`AI-WATER-2D`）×2
4. AI プロファイル変更なし（挑戦者 CPU は第2弾効果の評価値を実装済みで、蘇生・ドロー系は活用できている。チャージ依存カードの活用度が低いのは残課題）

第1弾カードの効果変更・ルール数値変更はなし。

### 検証

**リーグ**（8 デッキ総当たり、100 games/ordered pair × 3 シード = 16800 戦、seed 2026070621 / 2026070622 / 907771。league_report 判定 **PASS**）:

| デッキ | 調整前（2シード平均） | 調整後（3シード平均） |
| --- | ---: | ---: |
| echoes | 34.8% | **56.8%** |
| water | 51.6% | **50.6%** |
| apex | 71.4% | 68.2% |
| earth | 54.6% | 50.3% |
| wind | 50.4% | 47.8% |
| fire | 48.9% | 45.1% |
| break | 46.1% | 41.5% |
| control | 42.1% | 39.5% |
| 先攻勝率 | 50.1% | 49.3% |

echoes の相手別勝率（seed 2026070621+622 合算、各 400 戦）: apex 43.2% / break 58.2% / control 68.5% / earth 54.2% / fire 54.2% / water 59.8% / wind 58.0%。先手時 54.6% / 後手時 59.0%（3 シード合算）で先後依存なし。単色 4 デッキは 45-55% 帯、先攻勝率 48-52% 帯に収まっています。

**盛り上がり指標**（simulate 1000 戦ずつ）: 標準対戦 break vs control（seed 2026070641）は平均ターン 14.4 / リード交代あり 64.5% / 2点ビハインド逆転 52.0% / 先2点差側勝率 58.7% / resource 0.6% で、2026-07-05 採用エントリの基準値（14.4 / 64.4% / 51.5% / 58.8% / 0.8%）と同水準（第1弾のみの対戦は今回の変更の影響を受けない）。echoes vs water（seed 2026070642）は 15.6 ターン / 逆転 52.5% / 先2点差側 58.4%、echoes vs apex（seed 2026070643）は 17.0 ターン / 逆転 49.8% / 先2点差側 59.7% で、新デッキ絡みの対戦もワンサイド度（先2点差側勝率）は既存基準と同水準です。

**第2弾が勝ち筋である確認**（echoes vs water simulate 1000 戦の card_usage）: 海淵帝グランマーレは攻撃 1653 回・手札帰還 1580 回（1 試合平均 1.6 回攻撃する主フィニッシャー）、潮汲みモネ登場 2150 回・防御ドロー 232 回、残響召喚 377 回・深流呼び 378 回使用、潮鏡の祭具の防御ドロー 319 回。第2弾コアが試合を動かしています。

**壊れ監視**（固定デッキ h2h、60 games/order × 7 相手 = 840 戦、seed 9200）: `貫きの眼光`×2 を echoes の除去 2 枚と入れ替えた構成は 47.0%（現行 echoes より弱い）、`天嵐王ジェイル`×2 を wind の power 4 と入れ替えた構成は 33.2%（現行 wind 47.8% より大幅に弱い）。どちらも壊れとは逆方向で、極端な勝率・ワンサイド化は確認されませんでした。

**ストレスデッキ回帰**（run_cost_balance.py 1000 games/order、seed 2026070481、各帯 12000 戦）: 全 7 帯 **OK**。p1 0.0% / p1-2 3.5% / p2 9.0% / p2-3 37.7% / p3 32.3% / p3-4 41.1% / p4 43.5% で、2026-07-05 採用エントリの同シード値（0.0 / 3.7 / 9.4 / 38.4 / 33.0 / 41.9 / 44.9）と同等かわずかに低下（water への潮汲みモネ投入でプリセット側が微強化された方向）。コストカーブの破綻はありません。

`npm run check` green（typecheck + TS unit + build + Python unittest 223 件）。

### 判断

採用します。echoes 56.8% は緩和後の目標（50% 台・既存よりやや強い・60% 以下）に収まり、水単 50.6% も 50% 台前半を維持。ワンサイド指標・先攻勝率は既存基準と同水準です。監視点・残課題:

- apex 68.2% は調整前（71.4%）から微減したものの引き続き突出。第2弾プールを含めた apex 再探索（`scripts/tune_apex_deck.py`）は未実施のフォローアップ
- `天嵐王ジェイル` と `貫きの眼光` はむしろ弱い側（チャージ依存・単発バフを挑戦者 CPU が活かしきれない）。壊れ監視は不要だが、将来の上方修正候補
- control 39.5% / break 41.5% は echoes 追加で相対的に低下（多色 2 デッキは単色基準の対象外）。次回の第1弾側調整で見直し候補
- 旧 echoes 構成（power 1 × 6 枚・除去 0 枚）は「ドロー枚数だけでは勝率に変換されない」実例として記録する

### 検証コマンド

```bash
npm run check
# ベースライン
python3 -m ai_break_duel.cli league --games-per-pair 100 --seed 2026070611 --decks break control fire water wind earth apex echoes --out tmp/echoes-base-2026070611
python3 -m ai_break_duel.cli league --games-per-pair 100 --seed 2026070612 --decks break control fire water wind earth apex echoes --out tmp/echoes-base-2026070612
# 採用構成
python3 -m ai_break_duel.cli league --games-per-pair 100 --seed 2026070621 --decks break control fire water wind earth apex echoes --out tmp/echoes-v2-2026070621
python3 -m ai_break_duel.cli league --games-per-pair 100 --seed 2026070622 --decks break control fire water wind earth apex echoes --out tmp/echoes-v2-2026070622
python3 -m ai_break_duel.cli league --games-per-pair 100 --seed 907771 --decks break control fire water wind earth apex echoes --out tmp/echoes-v2-907771
python3 .agents/skills/ai-break-duel-balance-tuning/scripts/league_report.py tmp/echoes-v2-2026070621 tmp/echoes-v2-2026070622 tmp/echoes-v2-907771
# 盛り上がり指標
python3 -m ai_break_duel.cli simulate --games 1000 --seed 2026070641 --out tmp/echoes-sim-default
python3 -m ai_break_duel.cli simulate --games 1000 --seed 2026070642 --first-deck echoes --second-deck water --out tmp/echoes-sim-ew
python3 -m ai_break_duel.cli simulate --games 1000 --seed 2026070643 --first-deck echoes --second-deck apex --out tmp/echoes-sim-ea
python3 .agents/skills/ai-break-duel-balance-tuning/scripts/excitement_metrics.py tmp/echoes-sim-default
# ストレスデッキ回帰
python3 .agents/skills/ai-break-duel-balance-regression/scripts/run_cost_balance.py --games-per-order 1000 --seed 2026070481 --rule-set current --out tmp/set2-stress-regression.json
```

## 2026-07-05 モンスター攻撃への手札防御割り込み: 採用

### 背景

直下のエントリ（同日）で「モンスター攻撃にも手札防御で割り込めるルールはバランスを崩さない」ことを確認済み。プレイヤーから「本体への攻撃は手札防御できるのに召喚獣への攻撃は守れないのが直感的でない」という指摘があり、ルールの一貫性（体感）を理由に標準ルールへ採用しました。

### 変更内容（Python / TypeScript 両実装に同期）

- ルール: モンスター攻撃に対しても手札防御で割り込める。条件は通常の手札防御と同じ（1 ターン 1 回の共通上限・防御値 >= 攻撃値・手札防御不可効果・低ライフ手札防御不可）。成功時は手札カードをトラッシュ、対象は生存、攻撃側は消耗のまま場に残り、power 4 の攻撃後退場・`手札防御されても1ダメージ`（貫通 1 点 + ブレイクドロー）・`攻撃が防御された時` 系効果もプレイヤーへの攻撃と同様に適用する。
- Python: `GameConfig.hand_defense_vs_strike` の標準値を `value` に変更（`off` / `eager` は検証用に残置）。`value` = 相打ちは防御しない + 救う対象スタックの power 合計 >= 消費する手札 power の時だけ防御、が自動プレイヤーの判断基準。挑戦者 CPU は攻撃側としてこの基準で読み、防御されるストライクを手札トレード相当（`hand_trade_attack`）で評価する。
- TypeScript: `CONFIG.handDefenseVsStrike = "value"`。CPU が人間の召喚獣へモンスター攻撃する時、人間に手札防御があれば防御選択（手札防御 / 防御しない）モーダルを表示（`pendingAttack.strikeTargetIndex`）。人間が CPU の召喚獣を攻撃する時は CPU が value 基準で即時判断する。challenger の strike 評価も Python と同期。
- チュートリアル: ライバルの防御なし方針をモンスター攻撃の手札防御にも適用（`performStrike` で `{type:"none"}` 固定）。tutorial.test 5 件 green、固定進行への影響なし。
- テスト: Python 5 件（価値スタック防御 / 低価値見送り / 相打ち不防御 / 上限共有 / off 無効化）、TypeScript 8 件（`src/game/strikeHandDefense.test.ts`）を追加。
- ドキュメント: `docs/game-spec.md` 10.6 / 11 / 12 節を更新。

### 検証

採用構成（value 標準）でのリーグ（100 games/ordered pair × 6 デッキ × 2 シード、計 12000 戦、seed 2026070521 / 2026070522）: break 47.4% / control 45.8% / fire 47.6% / water 53.4% / wind 53.3% / earth 52.5%、先攻 49.3%。league_report 判定 **PASS**。旧標準（off、同シード）との差は全デッキ 0.1pt 以内で実質同一です。

盛り上がり指標（simulate 1000 戦、seed 2026070531）: 平均ターン 14.4、リード交代あり 64.4%、2点ビハインド逆転 51.5%、先2点差側勝率 58.8%、リソース切れ 0.8% — 旧標準と同値です。value 基準の CPU 発火は 984 ストライク中 2 回で、CPU 同士の対戦はほぼ不変（この変更の実質的な受益者は選択肢を得る人間プレイヤー）。影響上限側の `eager`（防御可能なら常に防御、ストライクの約 12% を防御）でも PASS であることは直下のエントリで確認済み。

ストレスデッキ回帰（run_cost_balance.py 1000 games/order、seed 2026070481、各 12000 戦）: 全 7 帯 OK。p1 0.0% / p1-2 3.7% / p2 9.4% / p2-3 38.4% / p3 33.0% / p3-4 41.9% / p4 44.9% で、採用前（同シードの 2026-07-05 60種化エントリ）と全帯一致です。

ブラウザ実機確認: 対戦フローで防御モーダル表示・手札防御実行・1 ターン 1 回上限の UI 反映を確認。配信コード上で strike 宣言 → `pendingAttack.strikeTargetIndex` 設定 → 手札防御解決（対象生存・power 4 攻撃後退場）を確認。

`npm run check` green。

### 判断

採用します。CPU 同士の勝率・試合展開は実質不変で、ルールの一貫性（本体攻撃と同じ防御手段）と人間プレイヤーの選択肢が増えました。監視点: 人間プレイでは手札（=逆転資源）を盤面保護に回せるため、体感面で「守れるが手札が痩せる」トレードオフが機能しているかを今後のプレイテストで見ること。

### 検証コマンド

```bash
npm run check
python3 -m ai_break_duel.cli league --games-per-pair 100 --seed 2026070521 --decks break control fire water wind earth --out tmp/hdstrike-league-value-2026070521
python3 -m ai_break_duel.cli league --games-per-pair 100 --seed 2026070522 --decks break control fire water wind earth --out tmp/hdstrike-league-value-2026070522
python3 .agents/skills/ai-break-duel-balance-tuning/scripts/league_report.py tmp/hdstrike-league-value-2026070521 tmp/hdstrike-league-value-2026070522
python3 -m ai_break_duel.cli simulate --games 1000 --seed 2026070531 --out tmp/hdstrike-sim-value
python3 .agents/skills/ai-break-duel-balance-tuning/scripts/excitement_metrics.py tmp/hdstrike-sim-value
python3 .agents/skills/ai-break-duel-balance-regression/scripts/run_cost_balance.py --games-per-order 1000 --seed 2026070481 --rule-set current
```

## 2026-07-05 モンスター攻撃への手札防御割り込み: 検証（標準ルールには未採用、バランス上は問題なし）

### 背景

「場の召喚獣は攻撃され放題で止める手立てがない」というプレイフィールの指摘を受け、モンスター攻撃（相手の場の召喚獣への攻撃）に対しても手札防御で割り込めるルール変更がバランスを崩すかを検証しました。現行仕様ではモンスター攻撃は防御選択を挟まず即時解決です（`docs/game-spec.md` 10.6）。設計原則では「手札は逆転の資源、盤面は優勢側の資源」の相殺のため、モンスター攻撃は優勢側の決着装置として意図的に防御不可で採用されています（`docs/design-principles.md` 1 節）。

### 変更内容

標準ルールは変更していません。Python シミュレータのみに検証用 `GameConfig.hand_defense_vs_strike`（`off` / `eager` / `value`、デフォルト `off`）と CLI `--hand-defense-vs-strike` を追加しました（TypeScript 側は未実装。標準挙動が変わらないため二重実装同期の対象外）。挙動は次の通りです。

- 割り込み条件は通常の手札防御と同じ（1 ターン 1 回の共通上限・防御値 >= 攻撃値・手札防御不可効果・低ライフ手札防御不可）。防御成功時は手札カードをトラッシュし、対象は生存、攻撃側は消耗のまま場に残り、power 4 の攻撃後退場はプレイヤーへの攻撃と同様に適用。`手札防御されても1ダメージ` も同様に適用。
- 自動防御ポリシー: 相打ちになるモンスター攻撃は両モードとも防御しない（放置すれば攻撃側も落ちるため）。`eager` は防御可能なら常に防御、`value` は救う対象スタックの power 合計が消費する手札の power 以上の時だけ防御。
- 挑戦者 CPU は攻撃側として割り込みを読み、防御されるストライクは手札トレード相当で評価する。
- `off` 時の無影響はビット一致で確認済み（simulate 300 戦 seed 777、変更前後の matches.jsonl が新 config キー以外で全一致）。

### 検証

リーグ（100 games/ordered pair × 6 デッキ × 2 シード、各アーム計 12000 戦、seed 2026070521 / 2026070522）。`value` はスモークテスト（300 戦）で発火が 288 ストライク中 1 回とほぼ無影響のためリーグは `eager`（影響の上限側）のみ:

| デッキ | off（現行） | eager（割り込みあり） |
| --- | ---: | ---: |
| break | 47.5% | 48.9% |
| control | 45.8% | 45.5% |
| fire | 47.6% | 46.9% |
| water | 53.4% | 53.7% |
| wind | 53.2% | 52.6% |
| earth | 52.4% | 52.4% |
| 先攻勝率 | 49.3% | 49.7% |

両アームとも league_report 判定 **PASS**。最大変動は break の +1.4pt で、単色 4 デッキと先攻勝率はすべて基準内です。

盛り上がり指標（simulate 1000 戦、seed 2026070531、break vs control）: 平均ターン 14.4 → 14.4、リード交代あり 64.4% → 63.9%、2点ビハインド逆転 51.5% → 50.3%、先2点差側勝率 58.7% → 60.1%、リソース切れ決着 0.8% → 0.8%。いずれも 1000 戦のノイズ帯内ですが、逆転率はむしろ僅かに下がる方向でした（手札＝逆転資源を盤面保護に回すため、劣勢側の反撃資源が減る構図）。

発火頻度（同 simulate）: ストライク 986 → 976 回/1000 戦とストライク総数はほぼ不変、`eager` でそのうち 121 回（約 12%）が手札防御され、対プレイヤー手札防御は 2799 → 2780 回とほぼ食い合いなし。

`npm run check` green（TS unit 71 件 + Python unittest 179 件）。

### 判断

**バランスは崩れません**（勝率・先攻・決着形態・試合長すべて基準内、変動は誤差圏）。一方で「劣勢側を守る」効果も統計上は確認できず、逆転率はむしろ微減方向でした。モンスター攻撃が決着装置として機能する頻度（約 1 回/試合）と、手札防御に高 power 手札と 1 ターン 1 回の共通枠を要求するコストが、自然な歯止めになっています。標準ルールへの採用はバランスではなく体感（プレイヤーのエージェンシー）の判断であり、採用する場合は TypeScript 側の防御選択 UI・チュートリアル確認・仕様書更新が必要なため、本エントリでは検証用フラグの追加までとし標準ルールは据え置きます。

### 検証コマンド

```bash
python3 -m ai_break_duel.cli simulate --games 300 --seed 777 --out tmp/hdstrike-bitcheck-after   # off のビット一致確認
python3 -m ai_break_duel.cli league --games-per-pair 100 --seed 2026070521 --decks break control fire water wind earth --out tmp/hdstrike-league-off-2026070521
python3 -m ai_break_duel.cli league --games-per-pair 100 --seed 2026070521 --hand-defense-vs-strike eager --decks break control fire water wind earth --out tmp/hdstrike-league-eager-2026070521
# seed 2026070522 も同様に off / eager を実行
python3 .agents/skills/ai-break-duel-balance-tuning/scripts/league_report.py tmp/hdstrike-league-off-2026070521 tmp/hdstrike-league-off-2026070522
python3 .agents/skills/ai-break-duel-balance-tuning/scripts/league_report.py tmp/hdstrike-league-eager-2026070521 tmp/hdstrike-league-eager-2026070522
python3 -m ai_break_duel.cli simulate --games 1000 --seed 2026070531 --out tmp/hdstrike-sim-off
python3 -m ai_break_duel.cli simulate --games 1000 --seed 2026070531 --hand-defense-vs-strike eager --out tmp/hdstrike-sim-eager
python3 .agents/skills/ai-break-duel-balance-tuning/scripts/excitement_metrics.py tmp/hdstrike-sim-off
python3 .agents/skills/ai-break-duel-balance-tuning/scripts/excitement_metrics.py tmp/hdstrike-sim-eager
```

## 2026-07-05 apex（覇王結束）デッキ再探索: 据え置き

### 背景

同日のカードプール60種化（C系統補完4種・遺物2種・若葉の息吹復活、コミット `f7213d5`）でカードプールとデッキ構成が大きく動いたため、`docs/archive/work-packages.md` 由来のフォローアップとして apex が最強候補のままかを `scripts/tune_apex_deck.py` で再探索しました（前回エントリで「未実施のフォローアップ」と記載）。

### 変更内容

なし。探索の結果、現行 apex を明確に上回る候補が見つからなかったため据え置きます。

### 検証

`tune_apex_deck.py --pool-size 120 --top 4 --screen-games 4 --league-games 100` を 2 シードで実行（各回: 変異候補60+ランダム候補60から screen 4 でトップ4を選抜し、現行apexを含む5デッキで100 games/ordered pair のミニリーグ）:

| seed | 5デッキリーグでの current_apex 順位・勝率 | 現行apexとの直接対決（vs 各候補、200 games/pair） |
| --- | --- | --- |
| 2026070501 | 1位 / 57.5%（全体） | 対 mutation_013 53.5% / mutation_043 52.5% / mutation_017 60.0% / candidate_118 63.0%（全勝ち越し） |
| 2026070602 | 3位 / 50.9%（全体） | 対 mutation_038 53.5% / mutation_037 51.5% / mutation_043 53.0%（勝ち越し）、対 **mutation_016 43.5%（負け越し）** |

seed 2026070602 で現行apexに直接対決で勝ち越した唯一の候補 `apex_mutation_016` を精査したところ、現行apexから `AI-WATER-2B` を1枚減らし新規カード `CMD-PATCH`（若葉の息吹）を1枚加えただけの1枚差分でした。この候補単体を固定し、challenger同士・先後入替の直接対決を独立3シード×600戦（先後300戦ずつ）で追加検証:

| base seed | candidate（CMD-PATCH入り）勝率 | current_apex 勝率 | 引分 |
| --- | ---: | ---: | ---: |
| 900001 | 53.7% | 45.5% | 0.8% |
| 950001 | 48.5% | 50.2% | 1.3% |
| 20260710 | 51.8% | 47.3% | 0.8% |
| 合計 1800戦 | 51.3% | 47.7% | 1.0% |

3バッチ中1本で候補が負け越しており方向が一致せず、合計でも候補優位はおよそ+3.6ptと1800戦の標本誤差（±2SE ≈ 2.3pt換算のノイズ帯）に収まる差でした。「複数シードの直接対決で明確に勝ち越す」水準には届いていません。

### 判断

据え置きます。60種化・後攻ドロー補正後も apex は最強候補として妥当であり、`CMD-PATCH` 1枚差し替え案を含め、これを覆す明確な候補は見つかりませんでした（WP2 と同型の「候補が明確に勝ち越せない → 現行維持」判断）。`CMD-PATCH` 差し替え案は再提案しないこと、として却下済みリストに準ずる扱いとします。

### 検証コマンド

```bash
python3 scripts/tune_apex_deck.py --pool-size 120 --top 4 --screen-games 4 --league-games 100 --seed 2026070501 --out tmp/apex-tuning-2026070501.json
python3 scripts/tune_apex_deck.py --pool-size 120 --top 4 --screen-games 4 --league-games 100 --seed 2026070602 --out tmp/apex-tuning-2026070602.json
# 上記2シードでの直接対決内訳は league.pairs から current_apex 絡みの行を集計
# mutation_016（current_apex から AI-WATER-2B 1枚→CMD-PATCH 1枚）単体の追加直接対決検証:
CAND="AI-FIRE-2,AI-FIRE-2,AI-FIRE-2B,AI-FIRE-1C,AI-WATER-1,AI-WATER-2,AI-WATER-2B,AI-EARTH-2,AI-EARTH-2,AI-EARTH-2C,AI-WIND-2,AI-WIND-2,AI-WIND-3,AI-WIND-3B,AI-FIRE-3,AI-FIRE-4,AI-WATER-4,CMD-SANDBOX,CMD-WATER-RITE,CMD-WIND-RITE,CMD-DISRUPT,CMD-PURGE,MEM-FIREWALL,MEM-RECOVERY-CACHE,CMD-PATCH"
python3 .agents/skills/ai-break-duel-balance-tuning/scripts/apex_direct_h2h.py --candidate-ids "$CAND" --games-per-order 300 --seed 900001
python3 .agents/skills/ai-break-duel-balance-tuning/scripts/apex_direct_h2h.py --candidate-ids "$CAND" --games-per-order 300 --seed 950001
python3 .agents/skills/ai-break-duel-balance-tuning/scripts/apex_direct_h2h.py --candidate-ids "$CAND" --games-per-order 300 --seed 20260710
```

## 2026-07-05 カードプール60種化（C系統補完4種・遺物2種・若葉の息吹復活）と後攻ドロー補正

### 背景

カード種類数が 54（アクティブ 53）と中途半端で、チャージ対応 C 系統も各属性 1 枚（火1C/水1C/風2C/土2C）の非対称でした。遺物は 6 種でデッキ制作の選択肢が薄く、`CMD-PATCH`（若葉の息吹）は非アクティブのまま死蔵していました。総数・アクティブ数ともに 60 に揃えるため、C 系統補完 4 種＋遺物 2 種を新規追加し、若葉の息吹をリワークして復活させました。

また検証の過程で、変更前 HEAD の先攻勝率が 4 シード（2026070261 / 2026070462 / 42260701 / 42260901）で 54.3〜56.6% と基準（48-52%）を大きく外れていることが判明しました。前回エントリの 51.1% はその後のコード変更（power 4 召喚獣調整ほか）の後に再計測されておらず、先攻偏重は今回の追加以前から存在していたものです。

### 変更内容（Python / TypeScript 両実装に同期）

新カード 6 種と若葉の息吹リワーク:

| カード | 種別 | 効果 |
| --- | --- | --- |
| `AI-FIRE-2C` 烽火狐フレンネ | 火 power 2 | チャージ時、相手の手札が 2 枚以上なら 1 枚トラッシュへ送る |
| `AI-WATER-2C` 渦紡ぎシェルナ | 水 power 2 | チャージ時、手札が 2 枚以下なら山札からカードを 2 枚引く |
| `AI-WIND-1C` 辻風雀ツムジ | 風 power 1 | チャージ時、相手の未消耗召喚獣 1 体を選んで消耗させる |
| `AI-EARTH-1C` 種運びのクルミ | 土 power 1 | チャージ時、手札が 2 枚以下ならトラッシュの召喚獣 1 枚を回収（自身は不可） |
| `MEM-WAR-BANNER` 猛火の戦旗 | 遺物 | 1 ターンに 1 回、自分の攻撃で相手のライフが減った時 1 枚引く |
| `MEM-GROVE` 大樹の寝床 | 遺物 | ターン終了時、ライフ劣勢かつ消耗中召喚獣 2 体以上なら 1 体回復 |
| `CMD-PATCH` 若葉の息吹 | 術式 | リワーク: 消耗中召喚獣 1 体を回復し、山札からカードを 1 枚引く（再アクティブ化） |

カードプールは召喚獣 40 / 術式 12 / 遺物 8 の計 60 種（全アクティブ）になりました。

デッキ変更: `fire`（+2C×2, +戦旗, −RELEARN/−PURGE/−PIPELINE）、`water`（+2C×2, −1B/−RELEARN）、`wind`（+1C, −WIND-1）、`earth`（+1C×2, +寝床, +若葉, −E1/−E1B/−OPTIMIZE/−PIPELINE）、`control`（+若葉, −PURGE）、`break`（+2C, +戦旗, −1B/−加速炉）。`apex` は据え置き。

ルール変更（先攻補正）: **後攻は最初の自分ターンからターン開始ドローを行う**（`second_player_first_turn_draw` を標準で有効化）。上記の既存先攻偏重（約 55%)への対処で、A/B では後攻初期手札 6 枚化とほぼ同効果（いずれも約 −5.6pp）だったが、ターン開始ドローの一般則に寄せる方を採用。

調整過程のナーフ: 初版の `AI-EARTH-1C`（無条件回収）と `MEM-GROVE`（無条件回復）では earth が 59.5% まで跳ねたため、それぞれ「手札 2 枚以下」「ライフ劣勢」の条件を追加して 54.4% まで戻しました。

### 検証

リーグ（200 games/ordered pair × 2 シード、計 12000 戦、seed 2026070261 / 2026070462）:

| デッキ | 勝率（2シード平均） |
| --- | ---: |
| earth | 54.4% |
| water | 51.5% |
| wind | 51.0% |
| fire | 49.9% |
| break | 47.3% |
| control | 45.9% |

先攻勝率 49.3% / 49.9%（平均 49.6%）。league_report 判定 **PASS**（単色 45-55%・先攻 48-52%）。追加 2 シード（42260701 / 42260901、60/pair）でも先攻 50.9% / 50.4%、同シードの HEAD（56.6% / 54.3%）から補正されています。earth は 4 シード加重平均 54.6% と帯上限のため監視対象です。

試合の質（HEAD と同シード同条件の比較）: 平均ターン 14.55→14.55/14.60、ワンサイド率 44.9%→44.5/45.4% でいずれも変化なし。盛り上がり指標（simulate 1000 戦、seed 2026070471、break vs control）: 平均 14.4 ターン、2点ビハインド逆転勝ち 52.5%、先2点差側勝率 58.0%、リード交代あり 65.8%、リソース切れ決着 0.9%。

card_usage（同 simulate）: `AI-FIRE-2C` チャージ 396 回（効果発動率 100%）、`MEM-WAR-BANNER` ドロー 371 回、`CMD-PATCH` 素打ち 215 回 / チャージ燃料 197 回で、死にカードはありません。

ストレスデッキ回帰（run_cost_balance.py 1000 games/order、seed 2026070481、各 12000 戦）: 全 7 帯 OK。p1 0.0% / p1-2 3.7% / p2 9.4% / p2-3 38.4% / p3 33.0% / p3-4 41.9% / p4 44.9% で、いずれも RISK 閾値（50%）未満です。

`npm run check`（typecheck + TS unit 71 件 + build + Python unittest 179 件、コスト帯ガードレール込み）green。

### 判断

採用します。60 種化と C 系統の対称化を達成しつつ、単色 4 デッキと先攻勝率が基準内に収まりました。残る監視対象は (1) earth 54.4%（帯上限）、(2) break 47.3% / control 45.9%（多色基準デッキが単色を下回ったままで良いか）。apex の再探索（tune_apex_deck.py）は未実施のフォローアップです。

### 検証コマンド

```bash
npm run check
python3 -m ai_break_duel.cli league --games-per-pair 200 --seed 2026070261 --decks break control fire water wind earth --out tmp/sixty-cards-r3-league-2026070261
python3 -m ai_break_duel.cli league --games-per-pair 200 --seed 2026070462 --decks break control fire water wind earth --out tmp/sixty-cards-r3-league-2026070462
python3 .agents/skills/ai-break-duel-balance-tuning/scripts/league_report.py tmp/sixty-cards-r3-league-2026070261 tmp/sixty-cards-r3-league-2026070462
python3 -m ai_break_duel.cli simulate --games 1000 --seed 2026070471 --out tmp/sixty-cards-r3-sim
python3 .agents/skills/ai-break-duel-balance-tuning/scripts/excitement_metrics.py tmp/sixty-cards-r3-sim
python3 .agents/skills/ai-break-duel-balance-regression/scripts/run_cost_balance.py --games-per-order 1000 --seed 2026070481 --rule-set current
```

## 2026-07-04 突破ダメージのダメージ=power化

### 背景

ブレイクスルー改訂で導入した突破ダメージは攻撃値の段階制（1〜2→1点 / 3→2点 / 4以上→3点）でしたが、プレイテストで「power とライフ削りが一致しない」という違和感が指摘されました。設計意図も「パワー=削る量」だったため、ダメージを power そのまま（1〜4点）に改めました。攻撃値の個別効果補正（攻撃値+1 など）は防御突破・討伐判定専用となり、ダメージには影響しません。これに伴い、段階制を前提としていた `AI-FIRE-3B` のダメージ上限（2026-07-04 WP1）は不要となり撤廃しました。

### 採用変更

| 項目 | 変更 |
| --- | --- |
| 突破ダメージ | 攻撃値の段階制 → ダメージ = 攻撃召喚獣の power（1〜4点） |
| `AI-FIRE-3B` | ダメージ2点上限を撤廃（攻撃値+1・手札防御不可のみに戻す） |
| 火単色デッキ | `AI-FIRE-3` 2枚目を追加(p3+ 5枚化)、`CMD-PURGE` 2枚を採用、`CMD-RELEARN`/`CMD-COMEBACK-RITE`/`AI-FIRE-1B` を各1枚削減 |
| 大地守護デッキ | `AI-EARTH-4B` → `AI-EARTH-1`（p3+ 4枚化） |
| 水単色デッキ | `AI-WATER-4` 1枚 → `AI-WATER-3B`、`CMD-PURGE` 1枚 → `AI-WATER-1B` |

### 検証

デッキ再調整後のリーグ（3シード × 60 games/ordered pair、計 5400 戦、seed 42260701/42260901/42261101）:

| デッキ | 勝率 |
| --- | ---: |
| fire | 52.2% |
| wind | 51.8% |
| water | 50.7% |
| earth | 49.6% |
| break | 49.2% |
| control | 46.6% |

先攻勝率平均 51.1%。全 6 デッキが 46-53% に収束しました。

盛り上がり指標（challenger 同士 6 デッキ総当たり 750 戦、seed 50260710）:

| 指標 | 段階制 | ダメージ=power |
| --- | ---: | ---: |
| 2点ビハインドからの逆転勝ち | 53.3% | 60.9% |
| 先に2点差をつけた側の勝率 | 56.3% | 51.5% |
| リード交代なしの試合 | 29% | 27% |
| 最大スイング3点以上 | 94% | 100%（4点以上 88%） |
| 平均ターン | 17.0 | 14.2 |
| 先制ダメージ（中央値） | 6手番目 | 6手番目 |
| リソース切れ決着 | 5.5% | 2.7% |
| 先攻勝率 | 48.7% | 50.8% |

### 判断

採用します。ルールが「ダメージ = power」の一文で説明できるようになり、試合はさらに短く（14.2ターン）、リードの安全圏化はほぼ消え（先2点差側 51.5%）、懸案だったデッキ切れ決着も 2.7% まで低下しました。power 4 の一撃 4 点（ライフ8の半分）は、攻撃後退場・手札防御・蒼殻バリア・追撃粛清が counterplay として機能しています。

### 検証コマンド

```bash
python3 -m unittest
npm run check
python3 -m ai_break_duel.cli league --games-per-pair 60 --seed 42260701 --decks break control fire water wind earth --out tmp/power-damage-league-42260701
```

## 2026-07-04 WP4: 初心者CPUの改修（見習い化）

### 背景

`docs/archive/work-packages.md` WP4。従来の `初心者` は「場が空のときだけ最弱召喚獣を 1 体出す + 遺物配置」のみで、攻撃 0・防御 0・逆転 0% の完全な消化試合になっていました（挑戦者相手の勝率ほぼ 0%）。完了条件は「防御発生率が 0% でなくなり、勝率が 5-20% 程度」。

### 変更内容（Python `ai_break_duel/ai.py`・`engine.py` / TS `src/game.ts` 同期）

1. **防御の解禁**: エンジンの自動防御選択（`_choose_field_defender` / `_choose_hand_defender`、TS `chooseAiDefense`）にあった beginner スキップを撤廃。防御が成立するなら場防御・手札防御を行う
2. **盤面ベースの攻撃**: 相手の場防御で止まらない攻撃があるとき、最も強い未消耗召喚獣で攻撃する（classic と同じ `_best_damaging_attacker` プリミティブ。相手の手札防御は読まない）
3. **召喚の一般化**: 「場が空のとき」→「場に空きがあるとき」最弱召喚獣から出す（遺物は従来どおり 1 つまで）
4. 付随修正: `_expected_attack_damage`（挑戦者のリーサル推定）に `caps_reckless_damage` の上限を追加し TS `attackDamage` と一致させた

### 文書からの逸脱と根拠

WP4 原文の②は「リーサルになる攻撃のみ」でしたが、初心者は相手ライフを削る手段を他に持たないため、この制約下では勝率が構造的に 5% に届かないことを実測で確認しました（同条件 1200 戦: 防御+リーサルのみ = 1.5〜2.0%、うち勝ち筋はほぼ挑戦者のリソース切れのみ）。②を「盤面で防がれない攻撃なら攻撃する」に広げた版のみが完了条件を満たしたため、これを採用しました。手札防御を読まない・妨害/チャージ/アップグレード/モンスター攻撃をしない点は原文どおりで、「弱いが試合にはなる」水準は維持しています。

### 検証（3 デッキペア×先後×2 シード×100 戦 = 1200 戦、seed 41001/41002）

- 初心者側勝率 **15.2%**（マッチアップ別 3〜28%、fire 系が最も厳しい）
- 防御成功は平均 **6.3 回/試合**（従来 0 回）
- 挑戦者同士の 6 デッキリーグ（seed 42001/42002、各 3000 戦）は変更前後で**ビット一致**（`_expected_attack_damage` のキャップ追加を含め挑戦者の挙動に影響なし）。単色 4 デッキ 44.2〜51.8%、先攻 53.0%（fire 44.2% と先攻 53.0% は WP1〜3 時点からのシード依存の揺らぎで、本 WP の影響ではない）
- 単体テスト: 攻撃/非攻撃/防御/召喚の 4 ケースを `tests/test_core_rules.py` に追加。`test_challenger_profile_beats_beginner_same_deck` は全勝前提から 70% 以上勝ち越しに緩和

### 検証コマンド

```bash
python3 -m ai_break_duel.cli simulate --games 100 --seed 41001 --first-ai challenger --second-ai beginner --first-deck fire --second-deck water --out tmp/wp4v5-cb-fire-water-41001
python3 -m ai_break_duel.cli league --games-per-pair 100 --seed 42001 --decks break control fire water wind earth --out tmp/wp4-league-42001
npm run check
```

## 2026-07-04 WP3: 挑戦者CPU評価重みの再最適化 — 現行重みを据え置き

### 背景

`docs/archive/work-packages.md` WP3。挑戦者の評価重み（`CHALLENGER_WEIGHTS`）は旧ルール時代の自動探索の産物で、モンスター攻撃（STRIKE）と追撃粛清（PURGE）の評価値は改訂時に手調整で追加されたハードコード定数（STRIKE: 基礎26 + 34×対象power、+14 未消耗対象、相打ち −30×自power、power4 −46 / PURGE: 40 + 28×最大power）でした。これらは探索対象外で、また探索スクリプトの適応度が「対beginner/対classicの勝率」の代理指標だったため、完了条件（新重みが旧重みに55%以上で勝ち越し）を直接測れない構造でした。

### スクリプト・実装の拡張

- **STRIKE/PURGE 評価値の重み化**: ハードコード7定数を `CHALLENGER_WEIGHTS` の新キー（`strike_base` 26 / `strike_target_power` 34 / `strike_ready_target` 14 / `strike_trade_penalty` 30 / `strike_power4_penalty` 46 / `purge_base` 40 / `purge_target_power` 28）に移動。`ai_break_duel/ai.py` と `src/game.ts`（camelCase）の両実装で同期。値は同一のため挙動は不変（seed 20260720 の 6 デッキリーグ 9000 戦が改修前後でビット一致することを確認）
- **`scripts/tune_ai_profiles.py` の適応度を直接対決に変更**: `CHALLENGER_WEIGHTS` が能動側プレイヤーの行動採点にしか影響しないことを利用し、手番ごとに重みを差し替える `run_head_to_head` を実装。候補の適応度を「ベースライン重みとの直接対決勝率（7デッキ・ミラー・両席）」に変更し、完了条件をそのまま測れるようにした。`--base-json` で任意の開始重みからの探索も可能に

### 探索と検証

- **ラウンド1**（seed 20260706、24候補、広域変異=全キーの72%を±30%、各168戦スクリーニング）: 最良候補がスクリーニング57.5%だったが、大規模検証（3シード×計1675戦）で **49.7%** に回帰。対classicでもベースラインより劣化（0.518 vs 0.580）しており、ノイズと判定
- **ラウンド2**（seed 20260707、32候補、局所変異=2〜5キーのみ±35%、各224戦スクリーニング）: 上位2候補（スクリーニング55.4% / 54.7%）を同条件で大規模検証した結果、**52.2%**（シードによっては49.7%）と **49.6%**。いずれも採用基準の55%に届かず

### 判断

**現行重みを据え置きます。** 2つの変異戦略・計56候補のいずれも、検証で旧重みに55%以上で勝ち越せませんでした。現行重み（手調整のSTRIKE/PURGE評価を含む）は局所最適に近く、誤差圏内の候補への差し替えは行いません。重みが不変のため対人間の体感も不変です。今回の成果は (1) STRIKE/PURGE評価の重み化（今後の探索対象化）、(2) 完了条件を直接測れる探索基盤、の2点です。探索レポートは `tmp/ai-profile-tuning-20260706.json` / `tmp/ai-profile-tuning-20260707.json` に保存しました。

### 検証コマンド

```bash
python3 scripts/tune_ai_profiles.py --iterations 24 --games-per-seat 12 --seed 20260706 --out tmp/ai-profile-tuning-20260706.json
python3 scripts/tune_ai_profiles.py --iterations 32 --games-per-seat 16 --seed 20260707 --out tmp/ai-profile-tuning-20260707.json
npm run check
```

## 2026-07-04 WP2: 覇王結束（apex）デッキの新ルール自動探索 — 現行構成を据え置き

### 背景

`docs/archive/work-packages.md` WP2。現行 apex は 2026-07-03 改訂時に手作業で 25 枚化しただけで、新ルール下での自動探索は未実施でした。探索スクリプト `scripts/tune_apex_deck.py` も旧制約（20枚 / 14-4-2 固定構成 / power 3+ 上限4・同名1枚 / `MEM-RESONATOR` 必須）のままでした。

### スクリプトの新制約対応

- デッキ 20 枚 → 25 枚、power 3+ 上限 4 → 5、power 3+ の同名 2 枚を許容
- 構成比を 14-4-2 固定から可変（召喚獣 14-18 / 遺物 2-3 / 術式 4 以上）に変更
- 旧 apex の遺産だった `MEM-RESONATOR` 必須条件を削除（現行 apex は不採用）
- 候補サンプリング重みに新術式 `purge`(72) / `comeback_rite`(48) を追加
- 現行 apex の近傍を探索する変異候補生成（1〜4 枚入れ替え、`--pool-size` の半数）を追加

### 探索と検証

**ラウンド1: 純ランダム 120 候補**（seed 20260704、screen 4 games × 6 プリセット × 両順序 → top4 を 100 games/pair 候補リーグ）: 現行 apex が勝率 61.5% で全候補に圧勝。次点 52.3%。

**ラウンド2: 変異 60 + ランダム 60 候補**（seed 20260705、screen 6 games）: 最良の `apex_mutation_016`（現行 − `AI-FIRE-2B` − `AI-EARTH-2C` + `CMD-SANDBOX` 2枚目 + `CMD-RELEARN`）が候補リーグ 52.2% vs 現行 51.5% と僅差で上回ったため、追加検証を実施。

**mutation_016 の直接対決検証**（3 シード × 両順序 300 games = 計 1800 戦）: 勝率 47.9% / 52.0% / 54.5%（平均 51.5%）。シードによっては負け越しで、現行と統計的に互角。プリセット 6 デッキ相手の総当たり（各 150 games × 両順序 = 3600 戦）でも 76.4% vs 現行 75.5% で誤差圏内でした。

### 判断

**現行 apex を据え置きます。** グローバル探索（ランダム）では現行が圧勝し、ローカル探索（変異）でも統計的に有意な改善候補は見つかりませんでした。誤差圏内の候補への差し替えは行いません。手作業で 25 枚化した現行構成が、新ルール下の自動探索でも最強候補であることを確認できたため、WP2 の目的（新ルールでの再チューニング）は達成とします。デッキ定義は無変更のため、6 デッキリーグへの影響はありません。探索レポートは `tmp/apex-tuning-20260704.json` / `tmp/apex-tuning-20260705.json` に保存しました。

### 検証コマンド

```bash
python3 scripts/tune_apex_deck.py --pool-size 120 --top 4 --screen-games 4 --league-games 100 --seed 20260704 --out tmp/apex-tuning-20260704.json
python3 scripts/tune_apex_deck.py --pool-size 120 --top 4 --screen-games 6 --league-games 100 --seed 20260705 --out tmp/apex-tuning-20260705.json
npm run check
```

## 2026-07-04 WP1: CMD-COMEBACK-RITE（逆転再起術）のドロー強化

### 背景

WP1 のカード監査で、`CMD-COMEBACK-RITE` が全術式中唯一「チャージ消費 > 実使用」（3シード集計で 8120 回チャージ vs 4850 回使用）の過小カードでした。原因は 2026-07-03 改訂で導入されたブレイクドロー（被弾時に受けた点数分ドロー）との役割重複です。劣勢時にしか使えないこのカードの価値の一部だった「劣勢時の 1 ドロー」が、ルール側で自動的に供給されるようになり、相対価値が目減りしていました。保有デッキ（fire ×2 / earth ×2 / wind ×1 / water ×1）のうち fire 48.0% / wind 47.9% / earth 49.4% と、単色の下位 3 デッキに集中している点も強化の後押し材料です。

### 採用変更

使用条件（相手よりライフが少ない）と回復効果は据え置きで、ドローを 1 枚 → 2 枚に強化しました。設計原則「手札は逆転の資源」に沿った強化です。挑戦者 CPU の評価値も両実装で同期して微調整しました（draw_bonus 34 → 48）。

- `ai_break_duel/engine.py`: ドロー枚数 1 → 2
- `ai_break_duel/ai.py` / `src/game.ts`: comeback_rite の draw_bonus 34 → 48（Python/TS 同期）
- `src/game/actions.ts`: ドロー枚数 1 → 2
- `src/components/cardPresentation.ts` / `docs/game-spec.md`: 効果説明を更新
- `tests/test_core_rules.py` / `src/game/cardEffectCoverage.test.ts`: 2 枚ドローを検証するよう更新

### 検証

3シード（20260720〜20260722）× 各順序ペア300 games、計27000戦（WP1 の前 2 調整と同条件・連続比較）。

| デッキ | 強化前 | 強化後 |
| --- | ---: | ---: |
| control | 54.7% | 54.5% |
| water | 54.0% | 53.4% |
| earth | 49.4% | 49.8% |
| fire | 48.0% | 48.7% |
| wind | 47.9% | 48.0% |
| break | 45.9% | 45.6% |

保有する下位デッキ（fire / earth）が上がり、非保有の上位（control）と保有 1 枚の water が僅かに下がって、分布が中央に寄りました。6 デッキ全て 45-55% を維持し、先攻勝率は 3 シードとも 50.7% で基準（48-52%）内です。実使用回数は約 1.5 倍（シードあたり約 1617 → 2359 回）に増え、「チャージで捨てられるだけのカード」から脱しています。break が 45.6% と下限寄りですが 3 シードとも同水準で安定しており、許容としました。

### 判断

採用します。`npm run check` green。

## 2026-07-04 WP1: AI-FIRE-3B（噴角イグナロス）の突破ダメージ超過を是正

### 背景

`docs/archive/work-packages.md` WP1 の背景で「要注視」と名指しされていた `AI-FIRE-3B`（攻撃値+1、reckless_attack_plus_1）について、1攻撃あたりの実ダメージを直接計測したところ、power3 カードの中で明確な外れ値でした。

`run_match` のログから `attack_ai` と `damage` を集計（6デッキ総当たり、2シード、計約18000攻撃イベント）。

| カード(power3) | 効果 | 平均ダメージ/攻撃 |
| --- | --- | ---: |
| `AI-FIRE-3B` | reckless_attack_plus_1 | **1.778** |
| `AI-FIRE-3` | hand_defense_pierce | 1.365 |
| `AI-WATER-3` | draw_on_play | 1.348 |
| `AI-WATER-3B` | filter_on_play | 1.293 |
| `AI-WIND-3` | spend_enemy_on_play | 1.222 |
| `AI-WIND-3B` | ready_ally_on_play_draw | 1.144 |
| `AI-EARTH-3B` | recover_ai_on_play | 1.124 |
| `AI-EARTH-3` | defense_plus_1 | 1.112 |

原因は、突破ダメージ制の導入で「攻撃値4以上→3点」という区分ができたため、power3の本体に+1する `reckless_attack_plus_1` が攻撃値4に到達し、本来 power4 専用だった最大ダメージ（3点）を cost3 で得ていたことです。デッキ勝率（fire 51.4%、break 50.0%）自体は45-55%の範囲内でしたが、カード単体では他の同コスト帯より30〜60%多いダメージを出しており、WP1完了条件の「特定カードへの勝率依存の緩和」に該当する過剰カードと判断しました。

### 検討した対応と却下した案

最初に「ダメージを与えると自分に1ダメージ」という reckless 相応の自傷ドローバックを試作しましたが、この効果の命中率が約73%と高く、ネット期待値（相手への平均ダメージ − 自傷）が0.99まで下がり、power3帯で最下位に転落。3シードのリーグ再検証で fire 44.0%・break 43.7%まで低下し、45%の合格ラインを割り込んだため **却下**しました（自傷は強すぎるナーフでした）。

### 採用変更

`attack_combat_value`（防御突破・討伐対象の判定）は 4 のまま維持しつつ、実ダメージ計算だけ攻撃値を3に丸めるキャップを追加しました。結果、`AI-FIRE-3B` は防御を崩す力・召喚獣を討ち取る力は据え置きで、与えるダメージは2点（tier3相当）が上限になります。

- `ai_break_duel/cards.py`: `caps_reckless_damage()` を追加
- `ai_break_duel/engine.py`: `_attack_damage()` で reckless カードの攻撃値を3にキャップ
- `src/game.ts` / `src/game/actions.ts`: 同等の `capsRecklessDamage()` / `attackDamage()` 修正
- `tests/test_core_rules.py`, `src/game/cardEffectCoverage.test.ts`: ダメージキャップと防御突破力維持の両方をテスト
- `docs/game-spec.md`: `AI-FIRE-3B` の効果説明を更新

### 検証（是正後）

3シード（20260720〜20260722）× 各順序ペア300 games、計27000戦（WP1の風是正と同じ条件・同じ手順で連続実施）。

| デッキ | 是正前 | 是正後 |
| --- | ---: | ---: |
| control | 53.1% | 54.7% |
| water | 52.8% | 54.0% |
| earth | 47.0% | 49.4% |
| wind | 45.6% | 47.9% |
| fire | 51.4% | 48.0% |
| break | 50.0% | 45.9% |

6デッキ全て45-55%の範囲を維持しました。`AI-FIRE-3B` の平均ダメージ/攻撃は1.778→1.198まで下がり、他power3カード（1.11〜1.36）のレンジに収まりました。break が45.9%とやや下限寄りですが、3シードとも同水準で安定しています。

### 判断

採用します。攻撃値（判定用の強さ）と実ダメージ（結果の大きさ）を分離する条件付けにより、「discardや討伐のしやすさ」というカードの役割は保ったまま、突破ダメージ制導入による意図しない火力インフレだけを是正できました。`npm run check` green。

### 検証コマンド（相当処理）

```bash
python3 -m unittest
npm run check
npx vitest run src/game/cardEffectCoverage.test.ts
# league 相当・ダメージ計測: ai_break_duel.simulation.run_match の log から attack_ai/damage を集計
```

## 2026-07-04 WP1: 風単色デッキの切札枚数不足を是正

### 背景

`docs/archive/work-packages.md` WP1（カード単体のバランス監査）の一環で、challenger 同士の6デッキ総当たりを `card_usage` 付きで再計測したところ、風単色デッキの勝率が合格基準（45-55%）を下回っていました。原因を確認したところ、`AI-WIND-4B`（天蓋裂きヴァユ）がカードプール・カードアートともに実装済みにもかかわらず、どのデッキ定義にも採用されておらず、風単色デッキだけ power 4 の切札が `AI-WIND-4` 1 種類しか無いことが判明しました（火・水・土は power 4 を2種採用）。

### 検証（是正前）

`python3 -m ai_break_duel.cli league` 相当の処理を直接呼び出し、`break control fire water wind earth` の6デッキで各順序ペア300 games、3シード（20260720〜20260722）、計 27000 戦。

| デッキ | 勝率（3シード平均） |
| --- | ---: |
| control | 53.1% |
| water | 52.8% |
| fire | 51.4% |
| break | 50.2% |
| earth | 47.8% |
| wind | 44.4% |

風単色のみ 45% を下回り、3シードとも同じ傾向でノイズではないことを確認しました。

### 採用変更

風単色デッキの `CMD-OPTIMIZE` 1枚を `AI-WIND-4B`（登場時に相手の未消耗召喚獣1体を消耗させる、power 4）に差し替え。デッキ枚数は25枚のまま、power 3+ の枚数は 4→5枚（上限ちょうど）。`ai_break_duel/cards.py` と `src/game.ts` の両方に反映し、`docs/game-spec.md` 6.3.3 節のデッキ表も更新しました。`AI-WIND-4B` の効果自体は既存カードで、テスト（`tests/test_core_rules.py` の `test_wind_power_4b_overheats_to_discard_after_attack` 等）とカードアートは既に存在していたため変更不要でした。

### 検証（是正後）

同条件（3シード×各順序ペア300 games、計27000戦）で再計測。

| デッキ | 勝率（3シード平均） |
| --- | ---: |
| control | 53.1% |
| water | 52.8% |
| fire | 51.4% |
| break | 50.0% |
| earth | 47.0% |
| wind | 45.6% |

6デッキ全てが 45-55% の範囲に収まりました。earth はわずかに低下しました（47.8%→47.0%）が範囲内です。

### 判断

採用します。`AI-WIND-4B` は死蔵カードだったため、既存の攻撃力バランスや他デッキの構成には影響を与えず、風単色の切札不足だけをピンポイントに解消できました。`npm run check` green。

### 検証コマンド（相当処理）

```bash
python3 -m unittest
npm run check
# league 相当: ai_break_duel.simulation.run_league(300, seed, decks=(break,control,fire,water,wind,earth)) を seed 20260720-20260722 で実行
```

## 2026-07-03 ブレイクスルー改訂（テンションカーブ全面改修）

### 背景

勝率バランスは 45-55% に収まっていましたが、試合展開が平坦でした。ダメージが常に 1 点固定のため 1 試合の最大ライフスイングは 2 点止まり、先制ダメージは平均 8 手番目、先に 2 点差をつけた側の勝率は 79.3%、2 点ビハインドからの逆転勝ちは 18.9% でした。序盤は無風、中盤で実質決着、終盤は消化という曲線を根本から作り直すため、ルール一式を改訂しました。

### 採用変更

| 項目 | 変更 |
| --- | --- |
| 突破ダメージ制 | 防がれなかった攻撃のダメージを攻撃値連動に変更（1〜2→1点、3→2点、4以上→3点）。手札防御貫通ダメージは1点固定 |
| 初期ライフ | 5 → 8 |
| 通常アクション数 | 2 → 3（チャージで最大4）。各プレイヤー初回ターン2アクション特例を廃止。コスト=power は全帯で維持し、power 4 はチャージ経由で1ターン素出し可能に |
| ブレイクドロー | 攻撃ダメージを受けたプレイヤーは受けた点数分ドロー |
| モンスター攻撃 | 攻撃対象に相手の召喚獣を選択可能（場防御と同じ判定式、防御選択なしの即時解決） |
| `CMD-PURGE` 追撃粛清 | 新術式。相手の消耗中召喚獣1体をスタックごとトラッシュ |
| デッキ | 20枚 → 25枚。同名2枚は維持、power 3+ 上限は 4枚 → 5枚 |

### 検証（テンションカーブ）

challenger 同士の 6 デッキ総当たり 750 戦（seed 20260710）で、改訂前後の盛り上がり指標を比較しました。

| 指標 | 改訂前 | 改訂後 |
| --- | ---: | ---: |
| 2点ビハインドからの逆転勝ち | 18.9% | 53.3% |
| 先に2点差をつけた側の勝率 | 79.3% | 56.3% |
| リード交代なしの試合 | 45% | 29% |
| 最大スイング3点以上の試合 | 0% | 94% |
| 平均ターン | 18.3 | 17.0 |
| 先制ダメージ（中央値） | 7手番目 | 6手番目 |
| リソース切れ決着 | 4.1% | 5.5% |
| 先攻勝率 | 50.8% | 48.7% |

### デッキ再構成

プリセット 7 デッキを 25 枚で全面再構成しました。新ルールの初期リーグでは水単色が 27.0% まで沈みましたが、これはドロー個性がブレイクドローと重複したためです。カード効果は変更せず、手札防御に使える召喚獣への寄せ直し、`AI-WATER-4`（攻撃後に手札へ戻る）の2枚看板、`CMD-PURGE` の採用で 47% 台まで回復しました。火単色は power 3+ を 4 枚に抑えて過剰火力を絞っています。

最終リーグ（2 シード × 各 100 games/ordered pair、計 6000 戦、seed 20260706 / 20260707）:

| デッキ | 勝率 |
| --- | ---: |
| control | 56.1% |
| break | 54.8% |
| earth | 48.1% |
| wind | 47.7% |
| water | 46.9% |
| fire | 46.2% |

単色 4 デッキは 46-48% に収束し、先攻勝率平均は 50.2% でした。

### 判断

採用します。逆転率・接戦度・スイング幅が大幅に改善し、先攻後攻の公平性とデッキ間バランスを維持できました。リソース切れ決着（5.5%）はコントロール戦略の勝ち筋として許容し、プレイテストで問題になればデッキ枚数の追加増（実測: 30枚で2%）で緩和します。

### 検証コマンド

```bash
python3 -m unittest
npm run check
python3 -m ai_break_duel.cli league --games-per-pair 100 --seed 20260706 --decks break control fire water wind earth --out tmp/breakthrough-league-20260706
```

## 2026-07-02 単色デッキ召喚獣再調整

### 背景

単色4デッキの勝率を 45-55% に収めるため、召喚獣効果を中心に再調整しました。カード追加は、劣勢側の再行動と1ドローで弱い単色デッキを救済する `CMD-COMEBACK-RITE` の1種類だけに限定しました。

### 採用変更

| カード | 変更 |
| --- | --- |
| `AI-FIRE-1` | 攻撃しても消耗しない |
| `AI-FIRE-3` | 攻撃値+1から、手札防御貫通へ変更 |
| `AI-WATER-1` | 登場時1ドローから、攻撃被防御時1ドローへ変更 |
| `AI-WATER-4` | 攻撃後退場時、手札へ戻る |
| `AI-WIND-1B` | 非消耗攻撃から、被防御時1ドロー・手札防御不可へ変更 |
| `AI-WIND-2B` | 登場時相手消耗に加え、消耗で出る |
| `AI-EARTH-1` | 攻撃被防御時に相手手札を1枚トラッシュへ送る |
| `AI-EARTH-2B` | 場防御成功時1ドロー |
| `AI-EARTH-3` | 場防御値+1 |
| `CMD-COMEBACK-RITE` | 相手よりライフが少ない場合、1ドローし、最高 power の消耗中召喚獣1体を回復する |

デッキ側では、火単色に `CMD-COMEBACK-RITE` 1枚、土単色に `CMD-COMEBACK-RITE` 2枚を入れました。各属性の 1-4 cost 召喚獣はそれぞれ最低2枚を維持しています。

### 最終単色リーグ

```bash
python3 -m ai_break_duel.cli league \
  --games-per-pair 1000 \
  --seed 2026070203 \
  --decks fire water wind earth \
  --out tmp/mono-final-balance-2026070203-1000
```

| デッキ | 勝率 | 成績 |
| --- | ---: | ---: |
| earth | 54.8% | 3270-2699-31 |
| wind | 51.0% | 3046-2928-26 |
| water | 47.5% | 2837-3141-22 |
| fire | 46.8% | 2807-3192-1 |

### 副作用確認

```bash
python3 -m ai_break_duel.cli league \
  --games-per-pair 120 \
  --seed 2026070202 \
  --decks break control fire water wind earth \
  --out tmp/six-candidate-e-2026070202-120
```

| デッキ | 勝率 |
| --- | ---: |
| break | 58.5% |
| control | 52.5% |
| water | 50.5% |
| earth | 47.8% |
| wind | 46.7% |
| fire | 44.0% |

`fire` は6デッキ全体ではまだ 45% をわずかに下回りますが、主対象の単色4デッキでは 46.8% まで戻りました。

コスト帯ストレス確認は次で実行しました。

```bash
python3 .agents/skills/ai-break-duel-balance-regression/scripts/run_cost_balance.py \
  --rule-set current \
  --include-preset-league \
  --games-per-order 400 \
  --seed 2026070204 \
  --out tmp/cost-balance-final-2026070204.json
```

プリセットリーグは `earth` 56.8%、`break` 55.5%、`control` 52.6%、`wind` 48.0%、`fire` 43.7%、`water` 43.3% でした。コスト帯ストレスでは `p2_3` 59.9%、`p3` 61.0%、`p3_4` 51.0%、`p4` 57.1% が RISK 判定です。今回の採用範囲は単色4デッキの属性間調整であり、高 power 帯ストレス構築の抑制は次回以降の課題として残します。

### 判断

採用します。単色4デッキは 1000 games/ordered pair の確認で全て 45-55% に収まりました。同属性同 cost の召喚獣も、攻撃持続、手札圧、手札防御制限、防御ドロー、防御値補正などの役割を分け、明確な完全上位互換を避けています。

## 2026-07-02 単色デッキ特化再構築

### 背景

多色デッキ、とくに `break` と `control` が単色デッキを大きく上回っていました。最初は単色ボーナスやCPU評価の調整も検討しましたが、単色デッキ自体が「各属性の召喚獣をすべて見せる」構成に近く、属性の強みへ十分寄せられていませんでした。

そこで、ルールやカード効果は変更せず、単色デッキだけを保存デッキと同じ構築制約内で再構築しました。

### 構築制約

- 20枚ちょうど。
- 同名カードは2枚まで。
- power 3以上の召喚獣は合計4枚まで。
- 単色デッキの召喚獣は同じ属性のみ。
- inactiveカードは使わない。

### 採用方針

| デッキ | 方針 |
| --- | --- |
| 火単色 | 火力、手札圧、`CMD-FIRE-RITE`、`CMD-RELEARN` に寄せる。 |
| 水単色 | P3中心のドロー、フィルター、回帰で息切れを抑える。 |
| 風単色 | 相手の消耗、自分の再行動、`CMD-WIND-RITE` に寄せる。 |
| 土単色 | 防御、回収、`CMD-EARTH-RITE`、大型保護に寄せる。 |

### 採用後リーグ

実装後に、6デッキの順序付き総当たりを各順序200戦、合計6000試合で再検証しました。

```bash
python3 -m ai_break_duel.cli league \
  --games-per-pair 200 \
  --seed 2026070261 \
  --decks break control fire water wind earth \
  --out tmp/final-mono-rebuild-league-200
```

| 指標 | 値 |
| --- | ---: |
| seed | `2026070261` |
| 試合数 | 6000 |
| 先攻勝率 | 49.5% |
| 引き分け率 | 0.2% |
| 平均ターン | 17.67 |
| ワンサイド率 | 17.6% |

| デッキ | 勝率 | 成績 |
| --- | ---: | ---: |
| break | 61.5% | 1228-770-2 |
| wind | 53.1% | 1060-937-3 |
| control | 50.9% | 1016-979-5 |
| water | 47.2% | 944-1055-1 |
| fire | 44.9% | 897-1101-2 |
| earth | 42.4% | 845-1148-7 |

### 変更前比較

同じ seed `2026070261`、同じ6000試合条件で、変更前の単色デッキは次の状態でした。

| デッキ | 変更前 | 変更後 |
| --- | ---: | ---: |
| break | 78.1% | 61.5% |
| control | 69.9% | 50.9% |
| fire | 44.6% | 44.9% |
| wind | 44.2% | 53.1% |
| earth | 31.8% | 42.4% |
| water | 31.4% | 47.2% |

| 指標 | 変更前 | 変更後 |
| --- | ---: | ---: |
| ワンサイド率 | 23.8% | 17.6% |
| 先攻勝率 | 49.5% | 49.5% |
| 平均ターン | 16.73 | 17.67 |

### 判断

採用します。多色デッキの優位は残っていますが、`break` / `control` の突出は大きく緩和され、単色側の下限も上がりました。ワンサイド率も下がっており、先攻勝率はほぼ中立です。

残る課題は、`fire` と `earth` がまだ下位に寄っていることです。ただし、この時点では追加ルールや単色ボーナスを入れるより、実プレイ感とCPU行動ログを見てから次の調整を判断する方が安全です。

### 検証

```bash
python3 -m unittest tests.test_core_rules tests.test_cost_balance
npm run check
python3 -m ai_break_duel.cli league --games-per-pair 200 --seed 2026070261 --decks break control fire water wind earth --out tmp/final-mono-rebuild-league-200
```
