# 最強 CPU 第 3 次計画 実施結果

作成日: 2026-07-08

## 結論

`fair-gen003` を採用した。採用内容は、beam 計画の根本修正と `turnPlanBeamWidth=3` の既定化、公開情報だけを使う既知手札カウンティングである。

直接対決ゲートは beam3 単独で明確に突破した。一方で、最終ベースラインでは earth/wind と高 power ストレスデッキが大きく上振れ、water/control/fire と earth beginner 較正が崩れた。これは `docs/fair-cpu-followups.md` に後続課題として記録した。

## Step 0

- ブランチ: `codex/fair-rebalance-from-public-info`
- 初期 `npm run check`: green
- 初期ガード + tutorial: green
- 基準: fair-gen002 は fair-gen001 と同一重み。6デッキ平均は break 49.2% / control 53.8% / fire 48.1% / water 47.9% / wind 47.8% / earth 51.4%、先攻 47.7%

## Track P

旧 beam 自滅の原因は、行動スコアに含まれる盤面評価を探索深さごとに累積し、さらに終端盤面を足していたことだった。これにより補助行動・アップグレード・メモリが多重評価された。加えて、チャージ後に増えるアクションを深さ上限で読めず、同点時に深い資源消費系列を優先していた。

修正:

- beam 評価を終端盤面評価に一本化
- 探索深さを `CONFIG.actionsPerTurn + 1` に固定
- 同点時は浅い系列を優先
- seed 940001 の回帰テストを追加

結果:

| 候補 | seed | pool win rate | deck floor |
| --- | ---: | ---: | ---: |
| beam2 | 951001 | 66.2% | 55.4% |
| beam2 | 952001 | 63.9% | 50.6% |
| beam3 | 951001 | 69.1% | 55.4% |
| beam3 | 952001 | 69.2% | 55.1% |

採用候補は beam3。

## Track R

第 2 次 S1 の resource 極振り候補を再審理したが、旧 54.8% は再現しなかった。

- `surviveMode`: 52.7% / 51.7%
- `survive-neighborhood-best`: 51.7% / 53.4%
- 8点グリッド best `resource-grid-d`: 52.7% / floor 48.9%

R単独採用なし。`resource-grid-d` と `survive-neighborhood-best` は弱い準リードとして X に回した。

資源焼き尽くし診断では、beginner 勝率は fire 10.5% / water 11.25% / earth 18.5% で帯内。ただし water は敗北 45 件中 29 件、earth は 74 件中 39 件が resource_exhaustion で、長期戦リソース弱点は未解消。

## Track C

`PlayerState.knownHandCards` を追加し、公開されたあと手札へ戻ったカードを追跡するようにした。通常ドローなど非公開情報は追跡しない。

対象:

- relearn / earth_rite / salvage
- recover-on-play / recover-on-defense
- charge recover
- overheat return

較正:

- 22,739 サンプル
- MAE 0.274
- Brier 0.145
- 既知手札サンプル 2,198 件、実防御率 93.7%

Cはエンジン側改善で、同じコード上では champion 側にも効くため、fair-gen002 重みでのガントレットは 50.0% / 50.0%。勝率準リードにはしないが、公開情報推定の基盤改善として採用した。

## Track X

合成候補:

- P: beam3
- R: `resource-grid-d`, `survive-neighborhood-best`
- C: 勝率準リードなし

結果:

| 候補 | seed | pool win rate | deck floor |
| --- | ---: | ---: | ---: |
| beam3-resource-grid-d | 981001 | 67.4% | 50.9% |
| beam3-resource-grid-d | 982001 | 65.4% | 50.0% |
| beam3-survive-neighborhood | 981001 | 67.9% | 51.3% |
| beam3-survive-neighborhood | 982001 | 68.2% | 54.1% |

合成は 55% を超えたが、beam3 単独より pool/floor が落ちるため不採用。

## 採用内容

- `CHALLENGER_WEIGHTS.turnPlanBeamWidth = 3`
- `docs/assets/ai-champions/fair/fair-gen003.json` を追加
- 公開既知手札カウンティングを実装

## 最終ベースライン

### 6デッキリーグ

| デッキ | seed 4101 | seed 730001 | 平均 |
| --- | ---: | ---: | ---: |
| break | 47.1% | 44.7% | 45.9% |
| control | 37.6% | 40.7% | 39.1% |
| fire | 42.7% | 42.7% | 42.7% |
| water | 38.3% | 35.4% | 36.9% |
| wind | 62.1% | 63.0% | 62.5% |
| earth | 69.8% | 70.6% | 70.2% |
| 先攻勝率 | 48.2% | 46.4% | 47.3% |

判定: CHECK NEEDED。

### 盛り上がり

- 平均ターン 23.4 / 中央値 24
- 先攻勝率 54.6%
- リード交代あり 49.5%、平均交代 0.75 回
- 2点ビハインド逆転 45.8%
- 先に2点差をつけた側の勝率 59.0%
- 最大スイング 3点以上 95.6%、4点以上 81.4%
- 決着形態: lifeout 84.2% / resource 15.7% / draw 0.1%

### ストレスデッキ

| 候補 | win rate | 判定 |
| --- | ---: | --- |
| p1 | 0.0% | OK |
| p1-2 | 4.9% | OK |
| p2 | 29.9% | OK |
| p2-3 | 63.8% | RISK |
| p3 | 55.5% | RISK |
| p3-4 | 58.7% | RISK |
| p4 | 57.9% | RISK |

### beginner 較正

| デッキ | beginner 勝率 | 判定 |
| --- | ---: | --- |
| fire | 9.0% | 帯内 |
| water | 10.25% | 帯内 |
| earth | 2.0% | 下限未達 |

## 残るリスク

fair-gen003 は直接対決では明確に強いが、デッキ・コスト・初心者較正の副作用が大きい。特に earth 70.2%、wind 62.5%、water 36.9%、control 39.1%、p2-3 63.8%、earth beginner 2.0% は次回調整の優先課題。

この計画で線形アーキテクチャの限界は「全滅」とは判定しない。Pトラックで明確な採用が出たため、次は NN 解禁ではなく、fair-gen003 前提のカード/デッキ再調整または deck-specific CPU 補正を検討する。
