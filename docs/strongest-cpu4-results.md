# 最強 CPU 第 4 次計画 結果まとめ

作成日: 2026-07-08
対象ブランチ: `codex/fair-rebalance-from-public-info`
関連計画: `docs/strongest-cpu4-plan.md`

## 結論

最強 CPU v1 は達成扱いとする。CPU 実体は `fair-gen004`。

Arc W は W0-W4 全トラックを消化し、beam5 と W2 重み探索準リードの合成を採用した。Arc B は高 power 通常登場、デッキ、`CMD-TIDE-EDGE`、beginner 較正、apex を再調整し、リーグ・ストレス・beginner 較正を合格まで戻した。

先攻勝率だけ 47.0% で 48-52% 目安に届かない。これは計画 §0 の扱いどおり、独立監視課題として `docs/fair-cpu-followups.md` に残す。

## 採用した変更

- `CHALLENGER_WEIGHTS`: `fair-gen004` を採用。`turnPlanBeamWidth=5`、`damage=129`、`handTradeAttack=48`、`classicPrior=76` などへ更新。
- ルール: power 3 / power 4 は通常登場時に消耗状態で場に出る。
- カード: `CMD-TIDE-EDGE` を攻撃値 +2 から +3 へ強化。
- デッキ: control / fire / water / wind / earth / break の一部構成を再調整。
- beginner: 水デッキは `CMD-TIDE-EDGE`、土デッキは場が埋まった後の単純アップグレードを使う。
- apex: `apex_mutation_007` を採用。

## 最終リーグ

6 デッキ、100 games/ordered pair、seed 4101 / 730001。

| デッキ | seed 4101 | seed 730001 | 平均 |
| --- | ---: | ---: | ---: |
| break | 53.7% | 55.0% | 54.3% |
| control | 45.3% | 46.8% | 46.1% |
| fire | 54.0% | 52.6% | 53.3% |
| water | 51.9% | 50.5% | 51.2% |
| wind | 45.7% | 47.3% | 46.5% |
| earth | 49.0% | 47.6% | 48.3% |
| 先攻勝率 | 47.7% | 46.3% | 47.0% |

全単色は 45-55% 内。

## ストレスデッキ

500 games/order、seed 3000000。

| 候補 | win rate | 判定 |
| --- | ---: | --- |
| p1 | 0.00% | OK |
| p1-2 | 6.53% | OK |
| p2 | 27.15% | OK |
| p2-3 | 49.95% | OK |
| p3 | 39.60% | OK |
| p3-4 | 46.05% | OK |
| p4 | 43.67% | OK |

## beginner 較正

fire / water / earth 同一デッキ、seed 4101 / 730001、先後入替 100 戦ずつ。

| デッキ | beginner 勝率 | 判定 |
| --- | ---: | --- |
| fire | 11.0% | OK |
| water | 5.0% | OK |
| earth | 5.0% | OK |

## 盛り上がり

break vs control、1000 戦、seed 4101。

- 平均ターン 27.3 / 中央値 28
- 先攻勝率 48.9%
- リード交代あり 57.9%、平均交代 1.00 回
- 2点ビハインド逆転 44.8%
- 先に2点差をつけた側の勝率 64.1%
- 最大スイング 3点以上 93.4%、4点以上 76.3%
- 決着形態: lifeout 86.8% / resource 7.1% / draw 6.1%

## apex 再探索

`npm run tune:apex -- --pool-size 120 --top 4 --screen-games 4 --league-games 100 --seed 810101 --out tmp/strongest-cpu4-final-apex-810101.json`

- best: `apex_mutation_007`
- 探索リーグ: 61.2%
- current 直接対決: candidate 106 / current 72 / draw 22

明確な勝ち越しとして採用。

## 検証コマンド

```bash
PATH=/Users/user/.nvm/versions/node/v24.13.0/bin:$PATH npm run sim -- league --games-per-pair 100 --seed 4101 --decks break control fire water wind earth --out tmp/strongest-cpu4-final-league-4101
PATH=/Users/user/.nvm/versions/node/v24.13.0/bin:$PATH npm run sim -- league --games-per-pair 100 --seed 730001 --decks break control fire water wind earth --out tmp/strongest-cpu4-final-league-730001
PATH=/Users/user/.nvm/versions/node/v24.13.0/bin:$PATH npm run balance:cost -- --games-per-order 500 --seed 3000000 --out tmp/strongest-cpu4-final-cost-3000000.json
PATH=/Users/user/.nvm/versions/node/v24.13.0/bin:$PATH npx tsx scripts/diagnoseResourceBurn.ts --out tmp/strongest-cpu4-final-beginner-resource-burn.json
PATH=/Users/user/.nvm/versions/node/v24.13.0/bin:$PATH npm run sim -- simulate --games 1000 --seed 4101 --first-deck break --second-deck control --out tmp/strongest-cpu4-final-sim-break-control-4101
python3 .agents/skills/ai-break-duel-balance-tuning/scripts/excitement_metrics.py tmp/strongest-cpu4-final-sim-break-control-4101
PATH=/Users/user/.nvm/versions/node/v24.13.0/bin:$PATH npm run tune:apex -- --pool-size 120 --top 4 --screen-games 4 --league-games 100 --seed 810101 --out tmp/strongest-cpu4-final-apex-810101.json
```
