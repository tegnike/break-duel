# 公平 CPU 計画で露見した後続課題

作成日: 2026-07-08
ステータス: **課題6を監視中**

CPU 公平化と fair-gen001 再ベースラインで露見した課題を、CPU 計画本体から分離して記録する。カード/ルール/デッキ側の変更は公平 CPU 計画へ混ぜない。

> 最終対応: 課題 1/2/2b/2c/3/4 は各先行計画で完了。残っていた先攻勝率、draw/長期化、resource 決着、スノーボールは `docs/archive/endgame-adoption-plan.md` の時計世界本採用で完成ゲート内へ戻り、全クローズした。

## 6. 現developの長期化とfire / water / wind再ドリフト

2026-07-12、人間対CPUログの終盤停止を調べる過程で現developを同一条件で再計測したところ、安全弁OFFでもfire 60.3% / water 31.9% / wind 54.9%、break vs control平均30.1T / 2点逆転21.7%となり、2026-07-10の記録から再ドリフトしていた。

- 種別: CPU評価 / デッキ / 現develop再ベースライン課題。
- 今回の対応: 3アクション全放棄かつ手札超過の5実戦局面だけを局所安全弁で修正。water 41.0% / fire 57.6%へ改善したが、wind 57.2%と逆転率20.2%は残る。
- 判断: 局所安全弁は採用。全面的な行動価値復帰とbeam 1は、それぞれデッキ帯破壊・現行CPUへの明確な弱体化で不採用。
- 次回: 現developのどの後続変更で2026-07-10基準からドリフトしたかを同一シードで二分探索し、CPUを止めずに20〜30T・2点逆転30〜45%・単色45〜55%を同時回復する。
- 詳細: `docs/balance-history.md` 2026-07-12エントリ。

## 5. fair-gen006 が露出させた water 突出 / fire・wind・先攻率の崩れ

最強 CPU 第5次計画で `fair-gen006`（beam7 + 時計世界の重み再探索 + 手札上限評価）を採用した。
対 `fair-gen005` 直接対決は 65.01% / 62.28%、deck floor 58.75% / 56.67% で強化ゲートを通過した一方、
同じ時計世界ルールの6デッキ再ベースラインで、弱い CPU が隠していたデッキ差が再び露出した。

- 種別: カード / デッキ側のバランス課題（CPU 採用は戻さない）
- 6デッキ 2 seed 平均: water 70.5%、control 50.7%、earth 46.2%、break 45.0%、wind 44.0%、fire 40.9%、先攻 45.8%
- 時計世界本採用基準: water 46.7%、fire 48.9%、wind 52.6%、先攻 49.1%。ルール母集団は同一なので比較可能
- 盛り上がり（break vs control、1000戦）: draw 0.1%、平均24.7T、リード交代55.1%、2点逆転35.0%、スノーボール69.0%で基準内
- beginner は追従再較正後 fire 6.5% / water 5.75% / earth 8.5% で帯内
- full stress: p2-3 54.29% / break+control 56.88%（60%警報線未満）、p3 cap 51.85% / 52.60%（境界監視）。他5候補はbreak/controlでも50%未満
- 判断: `docs/archive/swarm-answer-plan.md` の既存カード再調整タームへ統合し、B0 で water の勝ち筋と fire/wind の損失経路を p2-3 診断と同時に分解する。CPU とコアルールは凍結する
- 対応（2026-07-10）: 既存3召喚獣へ相手3面時の場防御+2を付与し、`CMD-TIDE-EDGE` を攻撃値+2へ戻すA案を部分採用。2 seed平均は fire 55.0%、water 45.9%、wind 52.6%、earth 47.7%、先攻47.9%。単色帯は再収束し、先攻だけ48%へ0.1pt未達。p2-3は総合51.98% / break+control 52.70%で60%警報線内の監視を継続する。CPU fair-gen006は無変更
- 再現:
  - `npm run sim -- league --games-per-pair 100 --seed 4101 --decks break control fire water wind earth --out tmp/strongest-cpu5-final/league-4101`
  - `npm run sim -- league --games-per-pair 100 --seed 730001 --decks break control fire water wind earth --out tmp/strongest-cpu5-final/league-730001`
  - `python3 .agents/skills/ai-break-duel-balance-tuning/scripts/league_report.py tmp/strongest-cpu5-final/league-4101 tmp/strongest-cpu5-final/league-730001`
  - `npm run balance:cost -- --candidate p2_3 --games-per-order 1000 --seed 3066000 --out tmp/strongest-cpu5-final/cost-p2_3.json --json`

## 2026-07-09 最終クローズ

`C0 + P1 + P4c3 + 第四弾デッキ変更 3 件` を標準化し、A1 攻撃回数制限は不採用とした。CPU challenger は fair-gen005 を凍結し、beginner water だけ追従再較正した。

| 監視課題 | 本採用後 | クローズ判断 |
| --- | ---: | --- |
| 先攻勝率 | 49.1%（6デッキ・2シード・6000戦） | 48-52% 帯内 |
| draw / 長期化 | draw 0.3% / 平均 26.5T | draw ≤2% / 20-30T 帯内 |
| resource 決着 | break vs control で 0.0%、turn-limit life judgement 1.4% | 即時 resource 枯渇への偏重なし。デッキ切れは衰弱経由へ移行 |
| リード交代 | 54.8% | 50% 以上 |
| 2点ビハインド逆転 | 34.0% | 30-45% 帯内 |
| スノーボール | 69.9% | 70% 以下 |
| p2-3 stress | 56.55% / break+control 55.20% | 合否ゲートから外し、60% 警報線つき監視へ移行 |
| p3 stress | 50.93% / break+control 48.48% | 総合 50% 境界監視へ移行 |
| beginner | fire 10.25% / water 19.75% / earth 12.25% | 全デッキ 5-20% 帯内 |
| apex | 候補の current 直接対決 104-93-3 | 明確差なし、current 維持 |

以後は本採用値を時計世界の新基準とし、旧 fair-gen005 世界の数値と直接比較しない。p2-3 への対抗手段はコアルールではなく、新カード追加の最優先テーマとして扱う。

## 1. water / wind の低勝率と control の突出

fair-gen001 の 6 デッキリーグ平均（seed 4101 / 730001）で、water 35.2%、wind 39.9%、control 71.6%、先攻 47.8% となり基準外だった。

- 種別: カード/デッキ/ルール側のバランス課題
- 判断: `docs/archive/fair-rebalance-plan.md` で対応完了。調整後の 2 シード平均は control 53.8%、water 47.9%、wind 47.8%、fire 48.1%、earth 51.4%
- 再現:
  - `npm run sim -- league --games-per-pair 100 --seed 4101 --decks break control fire water wind earth --out tmp/fair-rebase-league-4101`
  - `npm run sim -- league --games-per-pair 100 --seed 730001 --decks break control fire water wind earth --out tmp/fair-rebase-league-730001`
  - `python3 .agents/skills/ai-break-duel-balance-tuning/scripts/league_report.py tmp/fair-rebase-league-4101 tmp/fair-rebase-league-730001`

## 2. beginner 較正の上振れ

fair-gen001 では、同一デッキ先後の challenger vs beginner 較正（fire/water/earth、2 seed、1200 戦相当）で beginner 勝率が 27.8% となり、5-20% 目安を超えた。特に earth 同一デッキで 56-65% と大きく上振れしている。

- 種別: CPU プロファイル較正課題
- 判断: `docs/archive/strongest-cpu4-plan.md` で再調整完了。最終 beginner 勝率は fire 11.0%、water 5.0%、earth 5.0% で 5-20% 帯内。

## 2a. 先攻勝率とリソース決着率の継続監視

公平基準リバランス後、6 デッキリーグの先攻勝率は平均 47.7% で 48% を 0.3pt 下回った。最強 CPU v1 仕上げ後も 47.0% で 48-52% 帯に届いていない。一方、break vs control の resource 決着率は最終 7.1% まで下がった。

- 種別: ルール/CPU/ゲーム長の監視課題
- 判断: **クローズ**。終盤設計本採用後の先攻勝率は 49.1% で 48-52% 帯内。resource 枯渇決着も break vs control 1000 戦で 0.0%、draw 0.3%。

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
- 判断: `fair-gen005` で解消済み。候補(a) `end` をビーム候補に常時強制包含する最小修正を採用し、`docs/assets/ai-champions/fair/fair-gen005.json` を凍結した。
- 再現: 手札が遺物/低価値カードのみ + 場に有効な行動が少ない局面で発生しやすい
- 2026-07-09 採用結果: `docs/archive/fair-gen005-results.md`。再現局面では `chooseAiAction` と beam 1 位が `{ type: "end" }` になり、無駄な遺物置き換えとターン内の手札吐き尽くしは消えた。ガントレットは非退行（seed 910001: 59.3% / floor 48.3%、seed 920001: 61.3% / floor 52.5%）。当初の beginner 較正割れ（water 0.0% / earth 0.25%）はユーザー決定により却下理由にせず、beginner 側を追従再較正して fire 6.5% / water 6.0% / earth 8.25% に戻した。

## 2b. challenger の長期戦リソース焼き尽くし

最強 CPU 第 3 次計画の R トラックで、resource 極振り候補を再審理した。旧 54.8% 候補は現環境の独立 2 シードで pool 52.7% / 51.7% に落ち、近傍探索・複合グリッドも 55% ゲート未達だった。

- 種別: CPU プロファイル/評価関数課題
- 判断: R トラック単独では採用なし。最強 CPU v1 仕上げ後の消耗戦診断では beginner 勝率 fire 11.0% / water 5.0% / earth 5.0%。water の challenger 敗北 20 件中 resource_exhaustion は 9 件、earth は 20 件中 0 件だった。`fair-gen005` 採用後の再診断では fire 6.5% / water 6.0% / earth 8.25%。water の resource_exhaustion は 1/24 まで低下し、earth は 1/33。water の長期戦焼き尽くしは改善したが、ゲーム全体は draw/長期化へ寄っているため別課題として監視する。
- 再現:
  - `npx tsx scripts/diagnoseResourceBurn.ts --out tmp/strongest-cpu3-r/resource-burn-diagnosis.json`
  - `npx tsx scripts/diagnoseResourceBurn.ts --out tmp/fair-gen005-adopt/beginner-final.json`

## 2d. fair-gen005 採用後の draw/長期化と再ベースライン崩れ

`fair-gen005` は 2c の悪手を解消した一方、`end` が正しく比較されることで CPU が無理なリソース消費を避け、最大 40 手番 draw が大幅に増えた。これは CPU 欠陥修正の採用を止める理由にはせず、カード/ルール/ゲーム形状側の後続課題として分離する。

- 種別: カード/ルール/ゲーム長/決着性のバランス課題
- リーグ: 6 デッキ 2 シード平均で break 11.2%、control 1.6%、earth 2.6%、fire 16.8%、water 5.0%、wind 10.5%、先攻 7.4%。`league_report` は CHECK NEEDED。raw 結果では draw が大半を占める。
- 盛り上がり: break vs control 1000 戦で draw 89.6%、平均ターン 38.5、中央値 40、リード交代あり 13.7%。
- ストレス: full regression（500/order と 100/order）は完走せず出力なし。10/order smoke では候補勝率の上限超えはないが、p3_4 draw 74.17%、p4 draw 89.17%。
- 判断: **クローズ**。終盤設計本採用後は draw 0.3% / 平均 26.5T / リード交代 54.8% / 2点逆転 34.0% / スノーボール 69.9% まで回復。
- 再現:
  - `npm run sim -- league --games-per-pair 100 --seed 4101 --decks break control fire water wind earth --out tmp/fair-gen005-adopt/league-4101`
  - `npm run sim -- league --games-per-pair 100 --seed 730001 --decks break control fire water wind earth --out tmp/fair-gen005-adopt/league-730001`
  - `python3 .agents/skills/ai-break-duel-balance-tuning/scripts/league_report.py tmp/fair-gen005-adopt/league-4101 tmp/fair-gen005-adopt/league-730001`
  - `npm run sim -- simulate --games 1000 --seed 4101 --first-deck break --second-deck control --out tmp/fair-gen005-adopt/sim-break-control-4101`
  - `python3 .agents/skills/ai-break-duel-balance-tuning/scripts/excitement_metrics.py tmp/fair-gen005-adopt/sim-break-control-4101`
  - `npm run balance:cost -- --games-per-order 10 --seed 3000000 --out tmp/fair-gen005-adopt/cost-g10.json --json`

## 3. apex 再探索候補

fair-gen001 の apex 再探索で `apex_mutation_056` が探索リーグ 54.8%、current_apex は 49.1% だった。current との直接ペアでは候補が 120-77-3 で勝ち越している。

- 種別: apex デッキ更新候補
- 判断: **クローズ**。最強 CPU v1 仕上げ時に `apex_mutation_007` へ差し替え済み。本採用後の再探索では新候補 `apex_mutation_053` が current との直接対決 104-93-3（52.8%）の僅差に留まり、current apex を維持。
- 再現:
  - `npm run tune:apex -- --pool-size 120 --top 4 --screen-games 4 --league-games 100 --seed 810101 --out tmp/fair-rebase-apex.json`

## 4. fair-gen003 採用後のデッキ/コスト副作用

最強 CPU 第 3 次計画で `fair-gen003`（beam3 + 公開既知手札カウンティング）を採用した。fair champion 直接対決では pool 69% 台に到達した一方、既定 CPU のリーグ・ストレスデッキ・beginner 較正に大きな副作用が出た。

- 種別: カード/デッキ/コスト/CPU 較正の再調整課題
- リーグ: 6 デッキ 2 シード平均で earth 70.2%、wind 62.5%、water 36.9%、control 39.1%、fire 42.7%、先攻 47.3%。`league_report` は CHECK NEEDED
- ストレスデッキ: p2-3 63.8%、p3 55.5%、p3-4 58.7%、p4 57.9% が RISK
- beginner 較正: fire 9.0%、water 10.25% は帯内、earth 2.0% は下限未達
- 判断: `docs/archive/strongest-cpu4-plan.md` で再調整完了。最終 6 デッキ平均は break 54.3%、control 46.1%、fire 53.3%、water 51.2%、wind 46.5%、earth 48.3%。ストレスデッキも全 OK。
- 再現:
  - `npm run sim -- league --games-per-pair 100 --seed 4101 --decks break control fire water wind earth --out tmp/strongest-cpu3-final-league-4101`
  - `npm run sim -- league --games-per-pair 100 --seed 730001 --decks break control fire water wind earth --out tmp/strongest-cpu3-final-league-730001`
  - `npm run balance:cost -- --games-per-order 500 --seed 3000000 --out tmp/strongest-cpu3-final-cost-3000000.json`
