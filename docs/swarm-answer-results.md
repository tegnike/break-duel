# スワーム対策・既存カード再調整 実施結果

作成日: 2026-07-09
最終更新: 2026-07-10
ステータス: **A案で4変更を部分採用（B3完了）**
正本: `codex/fair-rebalance-from-public-info`
基準 CPU: fair-gen006（凍結）

## B0 診断

### 再現

- p2-3（1000 games/order、seed 3066000）: 総合54.29%、break/control 56.88%。相手別は break 60.10 / control 53.65 / fire 69.50 / water 21.30 / wind 63.05 / earth 58.15%。
- 6デッキリーグ（100 games/ordered pair、seed 4101 / 730001）: water 70.5 / control 51.8 / earth 47.3 / break 45.0 / wind 44.3 / fire 40.9%、先攻45.8%（draw を除く集計方法差で履歴の control 50.7 / wind 44.0 / earth 46.2% と表示差はあるが、raw 勝敗と崩れは一致）。

### p2-3 の勝ち筋

別 seed の100 games/seat×6デッキ（1200戦）で行動を追跡した。

- p2-3 の攻撃 6502 回中 5674 回（87.3%）は自分の場が3体の時に発生。
- 勝利試合は平均5.42攻撃・4.46ダメージイベント、敗北試合は2.21攻撃・1.69ダメージイベント。
- 勝利時の攻撃ダメージ量4503点中3340点（74.2%）を power 3 が供給。
- 結論: 旧診断の「power 3 が低power防御を踏み抜く」は継続しているが、より正確には**3面を埋め、power 2 のモンスター攻撃で壁を処理し、power 3 の複数回攻撃を通す**経路。

### water 70.5% の勝ち筋

water を全5相手に100 games/seat（1000戦）で追跡した。

- 勝率73.9%。勝利は平均16.1T、最終ライフ5.41、最終山札2.11、最終手札5.47。
- 勝利試合でも行動由来ドローは平均10.22枚。主要源は `AI-WATER-3B` 3141枚/1000戦、`AI-WATER-2` 2645枚、`AI-WATER-2D` 1557枚、`CMD-WATER-RITE` 848枚。
- `CMD-TIDE-EDGE` は1566回（1.57回/試合）使用。ドローで upgrade 元と `潮刃の付与` を揃え、power 3/4 の戦闘値を上げて短期で防御を踏み抜く。
- water 敗北時だけ平均23.9T・最終山札0まで伸びる。過剰ドローの代償は長期戦では働くが、通常は代償が来る前に勝つ。
- water は先攻時平均66.9%、後攻時平均74.1%。後攻初手番の3アクション+ドローを高い手札速度へ変換するため、リーグ先攻率45.8%も同時に押し下げる。

### fire / wind の負け筋

- fire / wind の対waterはともに21.5%。対water平均は fire 13.9T・最終山札4.33・手札8.21・ライフ0.67、wind 17.5T・最終山札2.42・手札7.69・ライフ0.69。
- 全相手への被攻撃解決のうち、防御失敗または無防御は fire 85.1%、wind 79.9%。手札・山札を残してライフアウトするため、ドロー不足ではなく**低power盤面が強化済みwater攻撃を止められない防御テンポ負け**。

### 候補と事前予測

| 順 | カード | 変更案 | 事前予測 |
| ---: | --- | --- | --- |
| 1 | `AI-FIRE-1` | 攻撃後非消耗を「相手3面時、場防御+2」へ | break対p2-3 -2〜4pt、fire +2〜4pt |
| 2 | `AI-WIND-1B` | 攻撃時ドロー/手札防御不可を同条件の場防御+2へ | control対p2-3 -2〜4pt、wind +3〜5pt |
| 3 | `AI-WATER-3B` | 登場時2ドロー1捨てを1ドローへ | water -8〜12pt、p2-3 -1〜2pt |
| 4（B1再選定） | `CMD-TIDE-EDGE` | 攻撃値+3を+2へ戻す | waterのドロー→攻撃変換だけを弱め、他5デッキへ勝率を戻す。p2-3自体には影響なし |
| 5（B1再選定） | `AI-FIRE-1C` | チャージ時手札圧を相手3面時の場防御+2へ | break/fireの追加回答。p2-3 break戦 -3〜5pt |

候補1/2/5は条件付きアンチスワーム。候補3/4はwater再収束を狙う別軸の数値是正であり、CPU・コアルールは変更しない。

B1候補3で「純増+1のまま山札消費だけ減らすとwaterを強化する」と判明したため、未着手の候補4/5は診断結果から再選定した。候補4はwaterが平均1.57回/試合使う攻撃変換札の旧+2へのロールバック、候補5はbreak/fireに自然配備される2枚目の条件付き回答とする。試行カード総数は5枚のまま。

## B1 改修実験

### 候補1: `AI-FIRE-1` 相手3面時の場防御+2

変更: 「攻撃しても消耗しない」を「相手の場に召喚獣が3体いる間、場防御時、防御値+2」へ置換。CPUは変更なし。

- p2-3: 52.38%（基準54.29%、-1.92pt）
- p2-3 vs break/control: 55.40 / 53.65%、合算54.53%（基準56.88%、-2.35pt）
- p2-3 vs fire: 62.70%（基準69.50%、-6.80pt）
- リーグ2 seed平均: break 42.6 / control 49.9 / fire 46.2 / water 69.3 / wind 43.9 / earth 45.4%、先攻46.7%
- 判断: p2-3とfireへの効果は明確。一方でbreakが45.0→42.6%へ落ちる副作用がある。water是正でbreak対waterが戻る可能性があるため暫定保持し、最終帯外なら候補1を撤回する。

### 候補2: `AI-WIND-1B` 相手3面時の場防御+2（候補1へ累積）

変更: 「攻撃が防御された時1ドロー。手札防御不可」を候補1と同じ条件付き場防御へ置換。CPUは変更なし。

- p2-3: 50.62%（候補1 52.38%、-1.76pt）
- p2-3 vs break/control: 55.40 / 51.05%、合算53.23%（候補1 54.53%、-1.30pt）
- p2-3 vs wind: 55.10%（基準63.05%、-7.95pt）
- リーグ2 seed平均: break 41.3 / control 50.2 / fire 44.3 / water 68.3 / wind 49.1 / earth 44.2%、先攻47.1%
- 判断: p2-3とwindへの効果は明確。wind強化でfire/earthが押され、water突出も残る。候補3のwater是正で他5デッキへ勝率が戻るかを見るため暫定保持。

### 候補3: `AI-WATER-3B` 1ドロー化（候補1/2へ累積）— 撤回

- p2-3: 51.28%（候補2 50.62%、+0.66pt）
- p2-3 vs break/control: 56.25 / 53.40%、合算54.83%（候補2 53.23%、+1.60pt）
- リーグ2 seed平均: break 39.9 / control 47.7 / fire 42.5 / water 77.4 / wind 48.1 / earth 41.9%、先攻47.3%
- 原因: 2ドロー1捨てと1ドローは手札純増が同じ+1。1ドロー化は山札消費だけを減らし、waterとp2-3の時計耐性を強化した。
- 判断: 逆効果。コード・仕様文言を候補2の状態へ即時復元し、再提案しない。

### 候補4: `CMD-TIDE-EDGE` 攻撃値+3→+2（候補1/2へ累積）

- p2-3: 54.01%（候補2 50.62%、+3.39pt）。water戦が21.30→41.65%となったため総合値は戻るが、60%警報線からは余裕あり。
- p2-3 vs break/control: 55.40 / 51.05%、合算53.23%（候補2と同一）
- リーグ2 seed平均: break 44.7 / control 54.2 / fire 48.2 / water 47.0 / wind 53.3 / earth 50.2%、先攻47.2%
- 判断: waterの攻撃変換率を適正化し、単色4色をすべて45-55%へ戻した。競技帯p2-3と先攻率は未達のため、候補5を重ねる。

### 候補5: `AI-FIRE-1C` 相手3面時の場防御+2（候補1/2/4へ累積）

変更: チャージ時手札圧を条件付き場防御へ置換。固定チュートリアルは旧チャージ効果でライバル手札を減らす前提だったため、同じチャージ時手札圧を持つ `AI-FIRE-2C` へ教材1枚を1対1差し替えた。通常プリセットとCPUは変更なし。

- p2-3: 51.98%（候補4 54.01%、-2.03pt）
- p2-3 vs break/control: 54.35 / 51.05%、合算52.70%（候補4 53.23%、-0.53pt）
- p2-3 vs fire: 51.60%（候補4 62.70%、-11.10pt）
- リーグ2 seed平均: break 43.5 / control 52.6 / fire 55.0 / water 45.9 / wind 52.6 / earth 47.7%、先攻47.9%
- 局所ゲート: typecheck、cardEffectCoverage、tutorial green（2 files / 97 tests）

## 撤退線判定

5枚（`AI-FIRE-1` / `AI-WIND-1B` / `AI-WATER-3B` / `CMD-TIDE-EDGE` / `AI-FIRE-1C`）を試した。

| 目標 | fair-gen006基準 | 5枚目累積 | 判定 |
| --- | ---: | ---: | --- |
| p2-3 総合 | 54.29% | 51.98% | 60%警報線から余裕、改善 |
| p2-3 break/control | 56.88% | 52.70% | **50%以下に2.70pt未達** |
| fire | 40.9% | 55.0% | 帯内上端 |
| water | 70.5% | 45.9% | 帯内 |
| wind | 44.0% | 52.6% | 帯内 |
| earth | 46.2% | 47.7% | 帯内 |
| 先攻 | 45.8% | 47.9% | **48%に0.1pt未達** |

ユーザー指定の撤退線に従って一度停止し、2026-07-10 にA案（候補1/2/4/5を部分採用候補としてB2へ進む）の承認を得た。第6カードは試さず、候補3は完全に復元した状態で収束確認した。

## B2 収束確認

### fullストレス

1000 games/order、各候補12,000戦。CPUはfair-gen006のまま凍結。

| 候補 | 総合 | break/control | ワンサイド | 平均T | 判定 |
| --- | ---: | ---: | ---: | ---: | --- |
| p1 | 0.11% | 0.20% | 99.73% | 10.35 | 既存ガード内 |
| p1-2 | 3.03% | 2.65% | 92.61% | 18.74 | 既存ガード内 |
| p2 | 8.74% | 8.45% | 84.77% | 21.83 | 既存ガード内 |
| p2-3 | 51.98% | 52.70% | 63.33% | 24.03 | 60%警報線内、50%目標は未達 |
| p3 | 52.07% | 50.95% | 62.21% | 25.00 | 既存ガード内、50%目標は未達 |
| p3-4 | 45.13% | 44.63% | 62.23% | 25.59 | 既存ガード内 |
| p4 | 38.30% | 38.68% | 67.33% | 25.04 | 既存ガード内 |

p2-3の60%警報線は十分に下回ったが、競技基準break/controlは52.70%のため、`test:balance` の閾値は0.60を維持する。

### 6デッキリーグ・盛り上がり

リーグは100 games/ordered pair × seed 4101 / 730001。

| 指標 | 2 seed平均 | 判定 |
| --- | ---: | --- |
| break | 43.5% | 多色・参考 |
| control | 52.6% | 多色・参考 |
| fire | 55.0% | 単色帯内上端 |
| water | 45.9% | 単色帯内 |
| wind | 52.6% | 単色帯内 |
| earth | 47.7% | 単色帯内 |
| 先攻 | 47.9% | 48%へ0.1pt未達 |

break vs control 1000戦（seed 4101）は、draw 0.1%、平均25.2T、リード交代56.1%、2点ビハインド逆転37.4%、先に2点差をつけた側の勝率67.1%。盛り上がり基準をすべて満たした。

### beginner・apex

- beginner同デッキ較正（seed 4101 / 730001、両席100戦ずつ）: fire 6.75%、water 7.0%、earth 8.5%。全て5-20%帯内。
- apex再探索: `apex_mutation_060` 56.82%、current apex 49.23%。単一seedの探索結果であり、今回の4カード調整へ追加のデッキ変更を混ぜないためcurrentを維持し、候補だけ記録する。

## 最終判断

マスター承認のA案として、`AI-FIRE-1` / `AI-WIND-1B` / `AI-FIRE-1C` の条件付きアンチスワームと、`CMD-TIDE-EDGE` の攻撃値+2化を部分採用する。fair-gen006、カード枚数、通常プリセット、新カード、コアルールは変更しない。

fair-gen006基準からwater 70.5→45.9%、fire 40.9→55.0%、wind 44.0→52.6%、p2-3 54.29→51.98%へ改善した。残るp2-3 break/control 52.70%、p3 52.07% / 同50.95%、先攻47.9%は監視値として明記し、5枚撤退線を越える追加調整は行わない。

最終ゲートは `npm run check`（19 files / 312 tests + production build）、`npm run test:balance`（7/7）、`aiStrategy.test.ts` + `tutorial.test.ts`（28/28）でgreen。最初の`npm run check`は診断用`ESBUILD_BINARY_PATH`の版不一致でbuildだけ失敗したが、同指定を外した通常環境で全工程が完走した。依存物や設定ファイルは変更していない。

## 再現コマンド

```bash
npm run balance:cost -- --candidate p2_3 --games-per-order 1000 --seed 3066000 --out tmp/swarm-b0/cost-p2_3-3066000.json --json
npm run sim -- league --games-per-pair 100 --seed 4101 --decks break control fire water wind earth --out tmp/swarm-b0/league-4101
npm run sim -- league --games-per-pair 100 --seed 730001 --decks break control fire water wind earth --out tmp/swarm-b0/league-730001
npx tsx tmp/swarm-b0/diagnoseB0.ts

# B2
npm run balance:cost -- --candidate <p1|p1_2|p2|p2_3|p3|p3_4|p4> --games-per-order 1000 --seed <seed> --out tmp/swarm-b2-final/cost-<candidate>.json --json
python3 .agents/skills/ai-break-duel-balance-tuning/scripts/league_report.py tmp/swarm-b5-fire1c/league-4101 tmp/swarm-b5-fire1c/league-730001
npm run sim -- simulate --games 1000 --seed 4101 --first-deck break --second-deck control --out tmp/swarm-b2-final/break-control-4101
python3 .agents/skills/ai-break-duel-balance-tuning/scripts/excitement_metrics.py tmp/swarm-b2-final/break-control-4101
npx tsx scripts/diagnoseResourceBurn.ts --out tmp/swarm-b2-final/beginner.json
npm run tune:apex -- --pool-size 120 --top 4 --screen-games 4 --league-games 100 --seed 810101 --out tmp/swarm-b2-final/apex-810101.json
```
