# 公平基準リバランス 実施結果

作成日: 2026-07-08
対象ブランチ: `codex/fair-rebalance-from-public-info`
前提ブランチ: `codex/fair-cpu-public-info`
関連計画: `docs/fair-rebalance-plan.md`

## 結論

公平 CPU `fair-gen001` で露見したカード/デッキ側のバランス崩れは、デッキ調整と `CMD-WATER-RITE` の 2 ドロー化で解消した。

最終 6 デッキリーグでは、全デッキが 45-55% 帯に収まった。control の突出、water / wind の低勝率は解消したため、本リバランスは採用する。

一方で、先攻勝率 47.7%、resource 決着 22.4%、beginner fire/earth 較正未達は残った。これらはカード/デッキ調整だけで深追いせず、`docs/fair-cpu-followups.md` に独立課題として残す。

## 開始時の課題

`fair-gen001` 再ベースラインでは、6 デッキリーグ平均が以下の状態だった。

| デッキ | 開始時平均 | 判定 |
| --- | ---: | --- |
| break | 45.6% | 帯内 |
| control | 71.6% | 突出 |
| fire | 52.4% | 帯内 |
| water | 35.2% | 沈み |
| wind | 39.9% | 沈み |
| earth | 53.3% | 帯内 |
| 先攻勝率 | 47.8% | 帯割れ疑い |

盛り上がり指標では、break vs control の resource 決着が 35.8% まで上がっていた。

## 採用した変更

### デッキ変更

- control: `CMD-PURGE` → `AI-WIND-1`
- control: `AI-EARTH-4` → `AI-EARTH-1C`
- control: `CMD-EARTH-RITE` → `AI-EARTH-1`
- fire: `AI-FIRE-3` 1 枚 → `AI-FIRE-1B`
- water: `AI-WATER-1B` → `CMD-DEEP-CURRENT`
- earth: `CMD-EARTH-RITE` 1 枚 → `AI-EARTH-1`

### ルール変更

- `CMD-WATER-RITE`: 1 ドロー → 2 ドロー

反映先:

- `src/game.ts`
- `src/game/actions.ts`
- `src/components/cardPresentation.ts`
- `src/game/cardEffectCoverage.test.ts`
- `docs/game-spec.md`
- `docs/balance-history.md`
- `docs/fair-cpu-followups.md`

## 最終リーグ結果

6 デッキリーグ（100 games/ordered pair、seed 4101 / 730001、各 3000 戦）:

| デッキ | seed 4101 | seed 730001 | 平均 |
| --- | ---: | ---: | ---: |
| break | 49.4% | 49.0% | 49.2% |
| control | 55.0% | 52.6% | 53.8% |
| fire | 47.9% | 48.3% | 48.1% |
| water | 48.1% | 47.7% | 47.9% |
| wind | 46.9% | 48.6% | 47.8% |
| earth | 51.0% | 51.9% | 51.4% |
| 先攻勝率 | 48.0% | 47.4% | 47.7% |

デッキ別勝率は全て 45-55% 帯内。先攻勝率のみ平均 47.7% で、48-52% 目安を 0.3pt 下回った。

## 盛り上がり指標

1000 戦、seed 4101、標準対戦 break vs control:

| 指標 | 結果 |
| --- | ---: |
| 平均ターン | 23.1 |
| 中央値ターン | 24 |
| 先攻勝率（break 側） | 40.2% |
| リード交代あり | 57.5% |
| 平均リード交代 | 0.91 回 |
| 2点ビハインド逆転 | 49.9% |
| 先に2点差をつけた側の勝率 | 54.5% |
| 最大スイング 3 点以上 | 91.9% |
| 最大スイング 4 点以上 | 73.5% |
| 決着形態 | lifeout 77.5% / resource 22.4% / draw 0.1% |

resource 決着は開始時の 35.8% から 22.4% へ下がった。ただし過去基準よりは高いため、継続監視に回す。

## ストレスデッキ回帰

500 games/order、seed 3000000:

| 候補 | win rate | 判定 |
| --- | ---: | --- |
| p1 | 0.15% | OK |
| p1-2 | 4.50% | OK |
| p2 | 18.27% | OK |
| p2-3 | 49.43% | OK |
| p3 | 36.63% | OK |
| p3-4 | 33.18% | OK |
| p4 | 26.37% | OK |

全候補 OK。召喚コスト帯のガードレールは維持された。

## beginner 較正

同一デッキ fire / water / earth、2 seed、先後 100 戦ずつ:

| デッキ | beginner 勝率 | 判定 |
| --- | ---: | --- |
| fire | 28.7% | 5-20% 目安を超過 |
| water | 11.8% | 帯内 |
| earth | 53.3% | 大きく超過 |

water は帯内。fire と earth は未達で、特に earth は beginner が勝ち越す。beginner の一律弱体ではなく、challenger の earth 運用弱点として CPU 側の別課題に分離する。

## apex 差し替え判断

プール変更後に apex 再探索を実施した。

- seed: 810101
- best: `apex_mutation_004`
- 探索リーグ: 51.6%
- current_apex: 50.6%
- current との直接ペア: 50-50 / 49-51

明確な勝ち越しがないため、apex は据え置く。

## 却下した候補

- control `MEM-RECOVERY-CACHE` → `AI-WIND-1`: control 72.8% / 73.6% で突出が解消せず
- control `CMD-PURGE` → `AI-WIND-1` 単独: control 65.8% / 63.9% で不足
- R1-B + `CMD-WIND-RITE` → `AI-WIND-1`: control 67.5% / 62.8% で不採用
- R1-D から `AI-WIND-3B` または `AI-EARTH-3` を追加弱体: control 40% 前後まで落ち過剰
- `AI-WATER-4B` / `AI-WATER-4D` / `AI-EARTH-1D`: water 崩れまたは earth 過強化で不採用
- apex 差し替え: 再探索候補が current_apex に明確な勝ち越しを示さず不採用

## 残課題

詳細は `docs/fair-cpu-followups.md` に記録した。

1. 先攻勝率 47.7% の継続監視
2. resource 決着 22.4% の継続監視
3. beginner fire / earth 較正未達の CPU 側対応

## 検証コマンド

```bash
PATH=/Users/user/.nvm/versions/node/v22.17.0/bin:$PATH npm run sim -- league --games-per-pair 100 --seed 4101 --decks break control fire water wind earth --out tmp/fair-r2h-league-4101
PATH=/Users/user/.nvm/versions/node/v22.17.0/bin:$PATH npm run sim -- league --games-per-pair 100 --seed 730001 --decks break control fire water wind earth --out tmp/fair-r2h-league-730001
python3 .agents/skills/ai-break-duel-balance-tuning/scripts/league_report.py tmp/fair-r2h-league-4101 tmp/fair-r2h-league-730001
PATH=/Users/user/.nvm/versions/node/v22.17.0/bin:$PATH npm run sim -- simulate --games 1000 --seed 4101 --out tmp/fair-final-sim-4101
python3 .agents/skills/ai-break-duel-balance-tuning/scripts/excitement_metrics.py tmp/fair-final-sim-4101
PATH=/Users/user/.nvm/versions/node/v22.17.0/bin:$PATH npm run balance:cost -- --games-per-order 500 --seed 3000000 --out tmp/fair-final-cost-3000000.json
PATH=/Users/user/.nvm/versions/node/v22.17.0/bin:$PATH npm run tune:apex -- --pool-size 120 --top 4 --screen-games 4 --league-games 100 --seed 810101 --out tmp/fair-final-apex-810101.json
PATH=/Users/user/.nvm/versions/node/v22.17.0/bin:$PATH npm run check
PATH=/Users/user/.nvm/versions/node/v22.17.0/bin:$PATH npm run test:balance
```

## 検証済み項目

- `npm run check`: green
- `npm run test:balance`: green
- `git diff --check`: green
