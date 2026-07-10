# fair-gen005 採用結果

作成日: 2026-07-09
対象ブランチ: `codex/fair-rebalance-from-public-info`
対象課題: `docs/fair-cpu-followups.md` 課題 2c

## 結論

`fair-gen005` を採用する。候補(a)「beam 候補へ `end` を常時強制包含」は、遺物連続置き換えの再現局面で `end` を選べるようになり、fair プールへの 2 シード非退行も満たした。

前回 `docs/archive/fair-gen005-end-beam-results.md` では beginner 較正割れを理由に不採用としたが、2026-07-09 のユーザー決定により、この割れは「challenger が本当に強くなった」シグナルとして扱う。今回は beginner 側を追従再較正し、fire / water / earth をすべて 5-20% 帯に戻したため採用する。

`docs/assets/ai-champions/fair/fair-gen005.json` は `fair-gen004` と同じ重みで凍結した。世代差分はエンジン側の beam 候補生成と beginner プロファイル較正である。

## 実装

- challenger: `rankedAiActions(...).slice(0, beamWidth)` で `end` が刈られた場合でも、beam 展開候補に `end` を追加する `plannedAiActions()` を導入。
- beginner: fire だけ高 power 手札防御制限を残し、water / earth は合法な手札防御を使えるようにした。water は `CMD-TIDE-EDGE` を召喚より先に使い、強い召喚獣から出す。earth は旧固定優先順位に近い基本行動へ戻した。
- regression: beam が遺物の連続置き換えより `end` を選ぶテスト、earth の高 power 手札防御テスト、water の強い召喚優先テストを追加。

## 検証結果

### ガード / tutorial

- `npm run check`: green（typecheck + 19 test files / 292 tests + build）
- `npm run test:balance`: green（1 file / 7 tests）
- `npx vitest run src/game/aiStrategy.test.ts src/game/tutorial.test.ts`: green
- 追加テスト込みで 2 files / 22 tests green

### 遺物連続置き換え

再現しやすい「手札が遺物/低価値カードのみ、既に遺物あり」の局面で確認した。

| 項目 | 結果 |
| --- | --- |
| `chooseAiAction` | `{ type: "end" }` |
| beam 1 位 | `{ type: "end" }` |
| 即時スコア上位 | 遺物配置 126-137 |
| 終端評価 | `end` 61、遺物配置後 end 49 |
| browser 相当 timing | 200 回平均 0.684ms、最大 6.368ms |

`end` が beam に残ることで、即時スコアでは高く見える遺物置き換えより、ターン終了時の手札温存を選べる。

### fair プール ガントレット非退行

候補 JSON は `fair-gen004` と同じ重みを使い、エンジン側を候補(a)に差し替えて測定した。

| seed | games/seat | pool win rate | deck floor | 判定 |
| ---: | ---: | ---: | ---: | --- |
| 910001 | 120 | 59.3% | 48.3% | 非退行 |
| 920001 | 120 | 61.3% | 52.5% | 非退行 |

### beginner 追従再較正

`scripts/diagnoseResourceBurn.ts`（fire/water/earth、seed 4101 / 730001、先後 100 戦ずつ、各 400 戦）

| deck | beginner wins | games | beginner win rate | loss reason 内訳 |
| --- | ---: | ---: | ---: | --- |
| fire | 26 | 400 | 6.5% | lifeout 26 |
| water | 24 | 400 | 6.0% | lifeout 23 / resource 1 |
| earth | 33 | 400 | 8.25% | lifeout 32 / resource 1 |

全デッキが 5-20% 帯内。

### 弱点D / followups 2b 再診断

water の challenger 敗北に占める `resource_exhaustion` は、旧記録の 9/20 から 1/24 へ低下した。earth は 0/20 から 1/33 になった。長期戦での資源焼き尽くしは water では改善、earth は軽微な再発があるが主因ではない。

ただし、再ベースラインでは draw が大幅に増えているため、資源焼き尽くしとは別の「長期化/決着不足」課題として followups に起票した。

### 6 デッキリーグ

`league_report.py`（6 デッキ、100 games/ordered pair、seed 4101 / 730001）

| デッキ | seed 4101 | seed 730001 | 平均 |
| --- | ---: | ---: | ---: |
| break | 11.0% | 11.5% | 11.2% |
| control | 1.9% | 1.3% | 1.6% |
| earth | 2.4% | 2.7% | 2.6% |
| fire | 17.8% | 15.8% | 16.8% |
| water | 5.5% | 4.4% | 5.0% |
| wind | 11.2% | 9.8% | 10.5% |
| 先攻勝率 | 8.0% | 6.8% | 7.4% |

`league_report` は draw を分母に含めるため、最大 40 手番 draw の増加がそのまま低勝率として表れている。これは採用ゲートでは深追いせず、カード/ルール/ゲーム形状側の後続課題として起票した。

### 盛り上がり指標

break vs control、1000 戦、seed 4101:

- 平均ターン 38.5 / 中央値 40
- 先攻勝率 64.4%
- 先制ダメージ手番（中央値）8
- リード交代あり 13.7%、平均交代 0.17 回
- 2点ビハインドからの逆転勝ち 25.0%
- 先に2点差をつけた側の勝率 77.9%
- 最大スイング 3点以上 36.0%、4点以上 21.7%
- 決着形態: draw 89.6% / lifeout 10.4%

### ストレスデッキ回帰

`npm run balance:cost -- --games-per-order 500 --seed 3000000` と 100/order は完走前に停止し、出力ファイルが残らなかった。draw 増加により高 power 帯の試合が長期化している可能性が高い。

`npm run test:balance` の guard test は単独 green（1 file / 7 tests）。full regression の未完走は CLI 回帰計測側の課題として followups に起票した。

確認用の 10/order smoke では候補勝率だけなら上限超えはないが、p3_4 / p4 で draw が非常に多い。

| 候補 | candidate win rate | draw rate | avg turns |
| --- | ---: | ---: | ---: |
| p1 | 0.0% | 0.0% | 9.23 |
| p1_2 | 1.67% | 14.17% | 22.50 |
| p2 | 5.0% | 29.17% | 31.52 |
| p2_3 | 25.83% | 43.33% | 40.07 |
| p3 | 15.0% | 50.83% | 41.61 |
| p3_4 | 7.5% | 74.17% | 51.11 |
| p4 | 4.17% | 89.17% | 56.01 |

full stress regression の未完走と draw 多発は followups に起票し、このタームでは深追いしない。

## 採用判断

採用。2c の悪手は解消し、fair プールへの非退行と beginner 較正 5-20% を満たした。

一方で、再ベースラインのリーグ・盛り上がり・ストレス smoke は draw/長期化の強い副作用を示した。これは候補(a)の採用を止める理由にはせず、`docs/fair-cpu-followups.md` に別課題として残す。

## 主要コマンド

```bash
npm run check
npm run test:balance
npx vitest run src/game/aiStrategy.test.ts src/game/tutorial.test.ts
npm run gauntlet:ai -- --candidate-json docs/assets/ai-champions/fair/fair-gen004.json --games-per-seat 120 --seed 910001 --out tmp/fair-gen005-adopt/gauntlet-910001.json
npm run gauntlet:ai -- --candidate-json docs/assets/ai-champions/fair/fair-gen004.json --games-per-seat 120 --seed 920001 --out tmp/fair-gen005-adopt/gauntlet-920001.json
npx tsx scripts/diagnoseResourceBurn.ts --out tmp/fair-gen005-adopt/beginner-final.json
npm run sim -- league --games-per-pair 100 --seed 4101 --decks break control fire water wind earth --out tmp/fair-gen005-adopt/league-4101
npm run sim -- league --games-per-pair 100 --seed 730001 --decks break control fire water wind earth --out tmp/fair-gen005-adopt/league-730001
python3 .agents/skills/ai-break-duel-balance-tuning/scripts/league_report.py tmp/fair-gen005-adopt/league-4101 tmp/fair-gen005-adopt/league-730001
npm run sim -- simulate --games 1000 --seed 4101 --first-deck break --second-deck control --out tmp/fair-gen005-adopt/sim-break-control-4101
python3 .agents/skills/ai-break-duel-balance-tuning/scripts/excitement_metrics.py tmp/fair-gen005-adopt/sim-break-control-4101
npm run balance:cost -- --games-per-order 10 --seed 3000000 --out tmp/fair-gen005-adopt/cost-g10.json --json
```
