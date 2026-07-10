# 終盤設計改訂 比較検証結果

作成日: 2026-07-09
対象ブランチ: `codex/fair-rebalance-from-public-info`
対象計画: `docs/archive/endgame-redesign-plan.md`
CPU: `fair-gen005` 固定（重み・探索変更なし）

## 結論

相互パッシブ膠着は全構成で解消した。break vs control 1000 戦の draw 率は、現状の 89.6% から
最大でも 1.2% まで低下した。

ただし、一次判定をすべて満たす構成は出なかった。主な未達は次の 2 点。

- 平均ターン: C0/P1/P2 系は 31T 台で長く、P3/P4a 系は 9.5〜18.5T で短すぎる。
- stress 回帰: P4a 系の有望候補は p2-3 stress が 50% を超え、特に `p2a+p4a_h7` は p2-3 stress 62.9%。

最も近い候補は `p4a_h7` または `p2a+p4a_h7` だが、どちらもそのまま本採用するにはリスクが残る。
Step 4 へは進まず、採用判断はユーザー承認待ちとする。

## 実験条件

- league: `games-per-pair 100`、seed `4101` / `730001`、decks `break control fire water wind earth`
- excitement: break vs control、1000 戦、seed `4101`
- stress: 有望 P4a 系のみ全7候補、`games-per-order 80`、seed `3000000`、maxTurns 40
- CLI: `npm run sim -- ... --endgame-package <package>`
- 手札上限ノブ: `h7` / `h8` は `--endgame-hand-limit 7 / 8`

## 単独パッケージ

| 構成 | draw | 平均T | リード交代 | 2点ビハインド逆転 | 先2点差側勝率 | water | 先攻 | 単色帯 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| C0+P1 | 1.2% | 31.7 | 43.7% | 22.8% | 78.9% | 23.7% | 48.4% | 23.7-72.4% |
| P2a | 1.1% | 32.2 | 43.9% | 23.6% | 78.3% | 21.0% | 47.9% | 21.0-69.0% |
| P2b | 0.9% | 31.5 | 41.3% | 22.3% | 78.8% | 23.0% | 48.4% | 23.0-67.6% |
| P3 | 0.0% | 14.5 | 52.3% | 21.0% | 79.9% | 85.9% | 47.7% | 30.3-85.9% |
| P4a | 0.1% | 18.3 | 55.7% | 35.5% | 71.0% | 45.0% | 45.6% | 40.2-57.3% |

## 組み合わせ

| 構成 | draw | 平均T | リード交代 | 2点ビハインド逆転 | 先2点差側勝率 | water | 先攻 | 単色帯 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| P2a+P3 | 0.0% | 14.4 | 51.9% | 19.3% | 81.4% | 86.8% | 47.5% | 30.2-86.8% |
| P2a+P4a | 0.1% | 18.3 | 54.4% | 34.2% | 72.7% | 51.2% | 45.5% | 40.2-54.4% |
| P2b+P3 | 0.0% | 14.0 | 53.4% | 20.6% | 80.3% | 85.3% | 47.9% | 30.7-85.3% |
| P2b+P4a | 0.1% | 14.9 | 53.6% | 34.0% | 72.7% | 60.3% | 44.5% | 39.3-60.3% |
| P3+P4a | 0.0% | 10.9 | 60.9% | 25.5% | 77.9% | 79.0% | 48.6% | 32.3-79.0% |
| P2a+P3+P4a | 0.0% | 10.9 | 60.3% | 24.5% | 78.3% | 80.9% | 48.2% | 32.1-80.9% |
| P2b+P3+P4a | 0.0% | 9.5 | 60.6% | 29.3% | 74.5% | 75.4% | 47.1% | 34.2-75.4% |

## 手札上限ノブ

| 構成 | draw | 平均T | リード交代 | 2点ビハインド逆転 | 先2点差側勝率 | water | 先攻 | 単色帯 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| P4a h7 | 0.0% | 18.1 | 55.4% | 34.8% | 72.5% | 45.9% | 45.8% | 40.2-56.4% |
| P4a h8 | 0.1% | 18.1 | 53.3% | 34.2% | 73.4% | 46.8% | 46.9% | 39.1-56.4% |
| P2a+P4a h7 | 0.0% | 18.5 | 53.5% | 33.2% | 73.8% | 51.0% | 45.7% | 41.4-54.4% |
| P2a+P4a h8 | 0.1% | 18.5 | 52.1% | 32.1% | 75.4% | 51.8% | 46.8% | 40.3-55.2% |

## Stress 回帰（有望 P4a 系）

`games-per-order 80` の全7候補完走確認。表は候補勝率 / break+control 合算勝率。

| 構成 | p2-3 | p3 | p3-4 | p4 | 判定 |
| --- | ---: | ---: | ---: | ---: | --- |
| P2a+P4a h7 | 62.9% / 61.6% | 44.1% / 45.6% | 45.1% / 41.6% | 39.7% / 39.1% | p2-3 RISK |
| P4a h7 | 58.5% / 54.1% | 44.9% / 44.1% | 48.3% / 42.8% | 41.5% / 38.8% | p2-3 RISK |
| P4a h8 | 59.7% / 57.2% | 46.0% / 43.4% | 48.1% / 42.5% | 41.6% / 39.4% | p2-3 RISK |

## 判断

厳密な採用構成は未決定。draw 膠着だけなら P4a 系で根本解消するが、以下の副作用が残る。

- 平均ターンが 20 未満で、試合が短くなりすぎる。
- 先に2点差をつけた側の勝率が 71-75% 台で、65% 以下基準を超える。
- p2-3 stress が 58-63% まで上がり、競技基準の break/control にも 54-62% 勝つ。

現時点で本採用に進むなら、最小候補は `P4a h7`。ただしこれは「手札防御全廃」という手触りの大きい変更で、
stress リスクも残るため、承認なしに Step 4 へ進めない。

## 主なコマンド

```bash
npm run sim -- league --games-per-pair 100 --seed 4101 --decks break control fire water wind earth --endgame-package p4a --endgame-hand-limit 7 --out tmp/endgame-matrix/p4a_h7/league-4101
npm run sim -- league --games-per-pair 100 --seed 730001 --decks break control fire water wind earth --endgame-package p4a --endgame-hand-limit 7 --out tmp/endgame-matrix/p4a_h7/league-730001
npm run sim -- simulate --games 1000 --seed 4101 --first-deck break --second-deck control --endgame-package p4a --endgame-hand-limit 7 --out tmp/endgame-matrix/p4a_h7/sim-break-control-4101
npm run balance:cost -- --games-per-order 80 --seed 3000000 --endgame-package p4a --endgame-hand-limit 7 --max-turns 40 --out tmp/endgame-matrix/p4a_h7/cost-g80.json --json
```
