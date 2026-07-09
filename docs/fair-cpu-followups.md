# 公平 CPU 計画で露見した後続課題

作成日: 2026-07-08

CPU 公平化と fair-gen001 再ベースラインで露見した課題を、CPU 計画本体から分離して記録する。カード/ルール/デッキ側の変更は公平 CPU 計画へ混ぜない。

> 対応計画: 課題 1 は `docs/fair-rebalance-plan.md` で完了。課題 2/2b/4 は `docs/strongest-cpu4-plan.md` で再確認し、beginner 較正とストレスデッキは解消。先攻勝率は継続監視。課題 3 は最強 CPU v1 仕上げで apex 差し替え完了。

## 1. water / wind の低勝率と control の突出

fair-gen001 の 6 デッキリーグ平均（seed 4101 / 730001）で、water 35.2%、wind 39.9%、control 71.6%、先攻 47.8% となり基準外だった。

- 種別: カード/デッキ/ルール側のバランス課題
- 判断: `docs/fair-rebalance-plan.md` で対応完了。調整後の 2 シード平均は control 53.8%、water 47.9%、wind 47.8%、fire 48.1%、earth 51.4%
- 再現:
  - `npm run sim -- league --games-per-pair 100 --seed 4101 --decks break control fire water wind earth --out tmp/fair-rebase-league-4101`
  - `npm run sim -- league --games-per-pair 100 --seed 730001 --decks break control fire water wind earth --out tmp/fair-rebase-league-730001`
  - `python3 .agents/skills/ai-break-duel-balance-tuning/scripts/league_report.py tmp/fair-rebase-league-4101 tmp/fair-rebase-league-730001`

## 2. beginner 較正の上振れ

fair-gen001 では、同一デッキ先後の challenger vs beginner 較正（fire/water/earth、2 seed、1200 戦相当）で beginner 勝率が 27.8% となり、5-20% 目安を超えた。特に earth 同一デッキで 56-65% と大きく上振れしている。

- 種別: CPU プロファイル較正課題
- 判断: `docs/strongest-cpu4-plan.md` で再調整完了。最終 beginner 勝率は fire 11.0%、water 5.0%、earth 5.0% で 5-20% 帯内。

## 2a. 先攻勝率とリソース決着率の継続監視

公平基準リバランス後、6 デッキリーグの先攻勝率は平均 47.7% で 48% を 0.3pt 下回った。最強 CPU v1 仕上げ後も 47.0% で 48-52% 帯に届いていない。一方、break vs control の resource 決着率は最終 7.1% まで下がった。

- 種別: ルール/CPU/ゲーム長の監視課題
- 判断: デッキ別勝率と resource 決着は解消済み。先攻勝率だけ独立監視課題として継続する。

## 2b. challenger の長期戦リソース焼き尽くし

最強 CPU 第 3 次計画の R トラックで、resource 極振り候補を再審理した。旧 54.8% 候補は現環境の独立 2 シードで pool 52.7% / 51.7% に落ち、近傍探索・複合グリッドも 55% ゲート未達だった。

- 種別: CPU プロファイル/評価関数課題
- 判断: R トラック単独では採用なし。最強 CPU v1 仕上げ後の消耗戦診断では beginner 勝率 fire 11.0% / water 5.0% / earth 5.0%。water の challenger 敗北 20 件中 resource_exhaustion は 9 件、earth は 20 件中 0 件。長期戦の焼き尽くしは大幅に軽くなったが、water の消耗負けは監視対象として残す。
- 再現:
  - `npx tsx scripts/diagnoseResourceBurn.ts --out tmp/strongest-cpu3-r/resource-burn-diagnosis.json`

## 3. apex 再探索候補

fair-gen001 の apex 再探索で `apex_mutation_056` が探索リーグ 54.8%、current_apex は 49.1% だった。current との直接ペアでは候補が 120-77-3 で勝ち越している。

- 種別: apex デッキ更新候補
- 判断: 最強 CPU v1 仕上げ後の再探索で best `apex_mutation_007` が探索リーグ 61.2%、current との直接対決 106-72-22。明確な勝ち越しのため apex を差し替え済み。
- 再現:
  - `npm run tune:apex -- --pool-size 120 --top 4 --screen-games 4 --league-games 100 --seed 810101 --out tmp/fair-rebase-apex.json`

## 4. fair-gen003 採用後のデッキ/コスト副作用

最強 CPU 第 3 次計画で `fair-gen003`（beam3 + 公開既知手札カウンティング）を採用した。fair champion 直接対決では pool 69% 台に到達した一方、既定 CPU のリーグ・ストレスデッキ・beginner 較正に大きな副作用が出た。

- 種別: カード/デッキ/コスト/CPU 較正の再調整課題
- リーグ: 6 デッキ 2 シード平均で earth 70.2%、wind 62.5%、water 36.9%、control 39.1%、fire 42.7%、先攻 47.3%。`league_report` は CHECK NEEDED
- ストレスデッキ: p2-3 63.8%、p3 55.5%、p3-4 58.7%、p4 57.9% が RISK
- beginner 較正: fire 9.0%、water 10.25% は帯内、earth 2.0% は下限未達
- 判断: `docs/strongest-cpu4-plan.md` で再調整完了。最終 6 デッキ平均は break 54.3%、control 46.1%、fire 53.3%、water 51.2%、wind 46.5%、earth 48.3%。ストレスデッキも全 OK。
- 再現:
  - `npm run sim -- league --games-per-pair 100 --seed 4101 --decks break control fire water wind earth --out tmp/strongest-cpu3-final-league-4101`
  - `npm run sim -- league --games-per-pair 100 --seed 730001 --decks break control fire water wind earth --out tmp/strongest-cpu3-final-league-730001`
  - `npm run balance:cost -- --games-per-order 500 --seed 3000000 --out tmp/strongest-cpu3-final-cost-3000000.json`
