# 公平 CPU 計画で露見した後続課題

作成日: 2026-07-08

CPU 公平化と fair-gen001 再ベースラインで露見した課題を、CPU 計画本体から分離して記録する。カード/ルール/デッキ側の変更は公平 CPU 計画へ混ぜない。

> 対応計画: 3 課題すべて `docs/fair-rebalance-plan.md`（公平基準リバランス計画）で確認した。
> 課題 1 は完了。課題 2 は CPU 側の独立課題として継続、課題 3 は apex 据え置きで完了。

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
- 判断: `docs/fair-rebalance-plan.md` で再確認。water は 11.8% で帯内だが、fire 28.7%、earth 53.3% が未達。特に earth は beginner が勝ち越すため、beginner の一律弱体化ではなく challenger の earth 運用改善を別 CPU 課題として扱う

## 2a. 先攻勝率とリソース決着率の継続監視

公平基準リバランス後、6 デッキリーグの先攻勝率は平均 47.7% で 48% を 0.3pt 下回った。break vs control の resource 決着率は 35.8% から 22.4% へ下がったが、過去の許容目安よりは高い。

- 種別: ルール/CPU/ゲーム長の監視課題
- 判断: デッキ別勝率は解消済みのため、本リバランスでは深追いしない。次回以降、先攻補正と resource 決着を独立評価する

## 3. apex 再探索候補

fair-gen001 の apex 再探索で `apex_mutation_056` が探索リーグ 54.8%、current_apex は 49.1% だった。current との直接ペアでは候補が 120-77-3 で勝ち越している。

- 種別: apex デッキ更新候補
- 判断: 公平基準リバランス後の再探索では best `apex_mutation_004` が 51.6%、current_apex が 50.6%。current との直接ペアも明確な勝ち越しなしのため据え置き
- 再現:
  - `npm run tune:apex -- --pool-size 120 --top 4 --screen-games 4 --league-games 100 --seed 810101 --out tmp/fair-rebase-apex.json`
