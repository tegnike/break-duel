# 最強 CPU 第5次計画 結果まとめ — fair-gen006

作成日: 2026-07-09
対象ブランチ: `codex/fair-rebalance-from-public-info`
関連計画: `docs/archive/strongest-cpu5-plan.md`

## 結論

時計世界で評価地形を再探索し、`fair-gen006` を採用した。

最終世代は `fair-gen005` に対し 65.01% / 62.28%（120 games/seat、独立2 seed）、
deck floor 58.75% / 56.67% で、55%×2 seed + 床値非悪化ゲートを通過した。
構成は beam 幅7、W1 重み探索 best、手札上限6枚の評価を合成した3要素版。

最終 `fair-gen006` のブラウザ200回実測は平均0.0875ms / 最大0.3000msで、1ターン1秒制約を十分に満たす。
公開情報ガード、決定性、tutorial は維持した。

## 採用変更

- `turnPlanBeamWidth`: 5 → 7
- W1 重み: `attackPower` 14、`badAttack` -71、`charge` 39、`chargeFuturePlan` 1、
  `lifeRacePressure` 1、`sacrificialFollowupDamage` 69、`strikeTargetPower` 30、`upgrade` 83
- `handLimitAwareness=1`: 6枚を超える手札の線形価値を相殺し、時計世界の手札上限を終端評価へ反映
- 不採用特徴は既定0: `fatigueClockPressure` / `lifeJudgementPressure` / `power4UnblockableAttack`
- `fair-gen006.json` を凍結し、旧世代JSONに新キーがなくても既定値を補う互換読込を追加
- W1 探索に `--exclude-keys` を追加し、再試行禁止・W2/W3別トラック・デッキ別補正を固定

## W1 — 重み再探索

12候補×3 pass、elite 4、8 games/seat、seed 975001。探索内 best `p2c008` は
63.06% / floor 50.00%、runner-up `p2c009` は61.82% / floor 56.25%。

独立120 games/seatで best は54.57% / 54.66%（floor 49.17% / 48.75%）、
runner-upは51.98% / 53.44%（floor 49.58% / 50.00%）。単独採用はなく、bestだけを
両seed 52%超の準リードとしてW4へ送った。

## W2 — 時計世界の新評価特徴

4特徴は重み0で変更前後100戦（seed 976001、break vs control）の全出力がビット一致した。

| 特徴 | seed 977001 | seed 978001 | floor | 判断 |
| --- | ---: | ---: | ---: | --- |
| 衰弱クロック 24 | 52.41% | 50.64% | 44.17% / 43.75% | 床崩れで不採用 |
| 手札上限 1 | 52.88% | 51.74% | 48.88% / 48.33% | 準リード、合成のみ |
| ライフ判定 24 | 50.33% | 50.40% | 50.00% / 50.00% | 不採用 |
| power4 明示加点 40 | 50.00% | 50.00% | 50.00% / 50.00% | 行動差なし、不採用 |

## W3 — ビーム幅再掃引

| 幅 | seed 979001 | seed 980001 | floor | ブラウザ平均 / 最大 |
| ---: | ---: | ---: | ---: | ---: |
| 3 | 38.92% | 40.33% | 28.75% / 22.08% | 0.0545 / 0.3000ms |
| 5 | 50.00% | 50.00% | 50.00% / 50.00% | 0.0655 / 0.2000ms |
| 7 | **58.63%** | **57.97%** | **54.01% / 52.50%** | **0.0860 / 0.3000ms** |

幅7だけが単独で採用ゲートを通過した。

## W4 — 合成

| 候補 | seed A | seed B | floor A / B | 判断 |
| --- | ---: | ---: | ---: | --- |
| beam7 + W1 best | 60.18% | 59.25% | 54.17% / 54.17% | 2要素首位 |
| beam7 + W1 runner-up | 58.79% | 59.14% | 54.17% / 55.00% | 通過、次点 |
| beam7 + hand-cap | 62.04% | 60.19% | 48.61% / 51.56% | 片seed床割れ |
| beam7 + W1 best + hand-cap | **65.01%** | **62.28%** | **58.75% / 56.67%** | **採用** |
| beam7 + runner-up + hand-cap | 63.31% | 60.78% | 57.08% / 54.58% | 通過、採用候補に劣る |

## 再ベースライン

### 6デッキリーグ

100 games/ordered pair、seed 4101 / 730001。

| デッキ | seed 4101 | seed 730001 | 平均 | 時計世界基準 |
| --- | ---: | ---: | ---: | ---: |
| break | 44.9% | 45.1% | 45.0% | 48.2% |
| control | 52.0% | 49.4% | 50.7% | 55.3% |
| fire | 40.1% | 41.7% | 40.9% | 48.9% |
| water | 72.7% | 68.3% | 70.5% | 46.7% |
| wind | 42.1% | 45.8% | 44.0% | 52.6% |
| earth | 45.6% | 46.9% | 46.2% | 48.4% |
| 先攻 | 46.1% | 45.4% | 45.8% | 49.1% |

water突出、fire/wind/先攻率の帯外を `docs/fair-cpu-followups.md` 課題5へ起票し、
`docs/archive/swarm-answer-plan.md` の既存カード再調整タームへ統合した。CPU採用は戻さない。

### 盛り上がり

break vs control、1000戦、seed 4101。

- draw 0.1% / 平均24.7T / 中央値25
- リード交代あり55.1% / 2点ビハインド逆転35.0%
- 先に2点差をつけた側の勝率69.0%
- lifeout 99.3% / turn-limit life judgement 0.6%

時計世界基準（draw ≤2%、20-30T、交代50%+、逆転30-45%、スノーボール≤70%）内。

### beginner追従再較正

初回は fire 6.5% / water 1.5% / earth 8.5%。waterだけ下限割れしたため、
water beginner の power3 手札防御を解禁し、別コミットで追従再較正した。

| デッキ | 再較正後 | 判定 |
| --- | ---: | --- |
| fire | 6.5% | 帯内 |
| water | 5.75% | 帯内 |
| earth | 8.5% | 帯内 |

### apex再探索

`apex_mutation_005` が5候補リーグ51.95%で首位。currentとの直接2順は109-89-2（55.1%）だが、
単一seedの境界値で複数seedの明確差を満たさないためcurrent apexを維持した。

### full stress

1000 games/order、直列実行と同じ seed 区間（3000000から22,000刻み）、各候補12,000戦。

| 候補 | 6デッキ合算 | break/control | one-sided | 平均T | 判断 |
| --- | ---: | ---: | ---: | ---: | --- |
| p1 | 0.00% | 0.00% | 99.91% | 9.14 | OK（極端に弱い） |
| p1-2 | 4.60% | 3.45% | 90.18% | 17.42 | OK |
| p2 | 14.04% | 11.20% | 81.23% | 20.84 | OK |
| p2-3 | 54.29% | 56.88% | 67.82% | 22.47 | 60%警報線未満・監視 |
| p3 cap | 51.85% | 52.60% | 66.04% | 23.19 | 境界監視 |
| p3-4 cap | 45.40% | 46.70% | 63.86% | 23.82 | OK |
| p4 cap | 34.02% | 34.88% | 69.13% | 22.69 | OK |

全候補で draw 0% / resource exhaustion 0%。guard test 7/7 green。p2-3 は時計世界本採用時の
総合56.55%から下がった一方、break/controlは55.20%から56.88%へ上がった。p3も境界を越えたため、
リーグ崩れと合わせて後続カード再調整の監視対象に残す。

## 主要コマンド

```bash
npm run tune:ai -- --base-json docs/assets/ai-champions/fair/fair-gen005.json --champions-dir tmp/strongest-cpu5/champions --iterations 12 --passes 3 --elite-count 4 --games-per-seat 8 --mutation-min 0.75 --mutation-max 1.25 --exclude-keys fatigueClockPressure handLimitAwareness lifeJudgementPressure power4UnblockableAttack turnPlanBeamWidth publicHandDefenseWeight deckTypeConditionalBias --seed 975001 --out tmp/strongest-cpu5/w1-tuning-975001.json
npm run gauntlet:ai -- --candidate-json tmp/strongest-cpu5/w4-beam7-w1-best-hand-cap.json --champions-dir tmp/strongest-cpu5/champions --games-per-seat 120 --seed 987001 --out tmp/strongest-cpu5/w4-beam7-w1-best-hand-cap-987001.json
npm run gauntlet:ai -- --candidate-json tmp/strongest-cpu5/w4-beam7-w1-best-hand-cap.json --champions-dir tmp/strongest-cpu5/champions --games-per-seat 120 --seed 988001 --out tmp/strongest-cpu5/w4-beam7-w1-best-hand-cap-988001.json
npm run sim -- league --games-per-pair 100 --seed 4101 --decks break control fire water wind earth --out tmp/strongest-cpu5-final/league-4101
npm run sim -- league --games-per-pair 100 --seed 730001 --decks break control fire water wind earth --out tmp/strongest-cpu5-final/league-730001
python3 .agents/skills/ai-break-duel-balance-tuning/scripts/league_report.py tmp/strongest-cpu5-final/league-4101 tmp/strongest-cpu5-final/league-730001
npm run sim -- simulate --games 1000 --seed 4101 --first-deck break --second-deck control --out tmp/strongest-cpu5-final/break-control-4101
python3 .agents/skills/ai-break-duel-balance-tuning/scripts/excitement_metrics.py tmp/strongest-cpu5-final/break-control-4101
npm run balance:cost -- --candidate p1 --games-per-order 1000 --seed 3000000 --out tmp/strongest-cpu5-final/cost-p1.json --json
npm run balance:cost -- --candidate p1_2 --games-per-order 1000 --seed 3022000 --out tmp/strongest-cpu5-final/cost-p1_2.json --json
npm run balance:cost -- --candidate p2 --games-per-order 1000 --seed 3044000 --out tmp/strongest-cpu5-final/cost-p2.json --json
npm run balance:cost -- --candidate p2_3 --games-per-order 1000 --seed 3066000 --out tmp/strongest-cpu5-final/cost-p2_3.json --json
npm run balance:cost -- --candidate p3 --games-per-order 1000 --seed 3088000 --out tmp/strongest-cpu5-final/cost-p3.json --json
npm run balance:cost -- --candidate p3_4 --games-per-order 1000 --seed 3110000 --out tmp/strongest-cpu5-final/cost-p3_4.json --json
npm run balance:cost -- --candidate p4 --games-per-order 1000 --seed 3132000 --out tmp/strongest-cpu5-final/cost-p4.json --json
npx tsx scripts/diagnoseResourceBurn.ts --out tmp/strongest-cpu5-final/beginner-recalibrated.json
npm run tune:apex -- --pool-size 120 --top 4 --screen-games 4 --league-games 100 --seed 810101 --out tmp/strongest-cpu5-final/apex-810101.json
npm run check
```
