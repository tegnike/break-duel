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

## 2c. fair-gen004 の遺物連続置き換え（実プレイで発見・原因特定済み）

2026-07-08、人間プレイヤーとの対戦で、challenger（fair-gen004）が手札の遺物 3 枚を同一ターンに
次々と配置（2 枚は既存遺物の置き換えでトラッシュ行き）し、手札を自ら空にする挙動を確認した。
手札は次ターンのチャージ燃料・手札防御のブラフとして温存価値があり、明確な悪手。

**原因（コード調査で特定済み）**: 複合要因のビーム探索の設計穴。

1. ビームの候補生成 `rankedAiActions().slice(0, beamWidth)` は**即時スコア順**で上位 5 件を残すが、
   `end`（パス）の即時スコアは 0 近傍のため、正スコアの行動が 5 つ以上あると
   **`end` がビームから刈られ、「何もしない」という選択肢を終端評価が比較できない**（`src/game.ts:2345,2365`）
2. 遺物配置の即時スコアは `memory=40`+効果値で正のため候補に残りやすい。既存遺物があっても
   配置は合法（旧遺物はトラッシュ、`src/game/actions.ts:1566` 以降）
3. 終端評価 `boardAiScore` は**遺物スロットの価値を一切持たない**（手札 12/枚のみが歯止めで、
   パスとの比較機会がなければ連続置き換えを止められない）
4. なお、この「パスできない構造」は 2b の資源焼き尽くし弱点の残存原因である可能性が高い（同根疑い）

- 種別: CPU 評価関数/ビーム探索の設計課題（fair-gen004 の既知悪手）
- 修正候補（各 1 実験、fair-cpu 作法でガントレット + beginner 較正必須）:
  (a) `end` をビーム候補に**常時強制包含**する（最小修正・本命）
  (b) `boardAiScore` に遺物スロット価値を追加（置き換えの無駄を可視化）
  (c) 手札温存/ブラフ価値の項を追加（手札 0 枚への追加ペナルティ）
- 再現: 手札が遺物/低価値カードのみ + 場に有効な行動が少ない局面で発生しやすい
- 2026-07-09 実験結果: 候補(a)は `docs/fair-gen005-end-beam-results.md` で検証し、不採用。
  ガントレットは非退行（seed 910001: 59.3% / floor 48.3%、seed 920001: 61.3% / floor 52.5%）だったが、
  beginner 較正が fire 6.5% / water 0.0% / earth 0.25% となり 5-20% 帯を満たさない。`fair-gen005` は凍結しない。

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
