# 公平 CPU 計画 実施結果

作成日: 2026-07-08
対象ブランチ: `codex/fair-cpu-public-info`
元ワークツリー: `claude/zealous-leakey-b41008` / `f54b94d`

## 結論

公平 CPU 計画は完了。出荷 CPU の攻撃評価から、相手の実手札の中身を読む経路を除去し、公開情報のみを使う `fair-gen001` を新しい基準として採用した。

旧覗き見版 `gen001` に対して fair 版は 43.9% / 45.1% まで弱体化したが、これは強化候補ではなく公平性原則の修正なので採用ゲート対象外とした。以後の CPU 強化・採用判定は `docs/assets/ai-champions/fair/fair-gen001.json` を基準にする。

F2 の再強化候補はすべて 55% 採用基準に届かず、`fair-gen002` は追加しない。最終状態は `fair-gen001` 維持。

## 採用した変更

- 通常攻撃評価の `chooseAiDefense(defender, ...)` フォールバックを廃止
- STRIKE 評価の `chooseStrikeHandDefense(opponent, ...)` を公開情報ベースの推定に置換
- classic 優先行動の `bestDamagingAttacker` から相手実手札依存を除去
- beginner の攻撃可否判定から相手実手札依存を除去
- `chooseAiAction` レベルで「公開情報が同一なら相手の実手札が違っても同じ行動を選ぶ」ガードテストを追加
- `docs/assets/ai-champions/fair/fair-gen001.json` を凍結
- `npm run gauntlet:ai` / `npm run tune:ai` の既定チャンピオンプールを `docs/assets/ai-champions/fair` に変更

防御側自身が実際の防御選択として自分の手札を読む経路は合法なので維持した。

## F0 公平化

棚卸しで違反と判断した経路:

| 経路 | 判断 |
| --- | --- |
| `chooseAttackEvaluationDefense` の覗き見フォールバック | 公開情報推定へ置換 |
| STRIKE 評価内の `chooseStrikeHandDefense(opponent, ...)` | 公開情報推定へ置換 |
| classic 優先行動の `bestDamagingAttacker` | 公開情報推定へ置換 |
| beginner の `legalHandDefenders(defender, ...)` | 手札中身を読まない判定へ変更 |

旧覗き見版 `gen001` との直接対決:

| seed | pool win rate | deck floor |
| --- | ---: | ---: |
| 950001 | 43.9% | 38.5% |
| 960001 | 45.1% | 37.0% |

## F1 再ベースライン

6 デッキリーグ:

| デッキ | seed 4101 | seed 730001 | 平均 |
| --- | ---: | ---: | ---: |
| break | 45.9% | 45.2% | 45.6% |
| control | 72.5% | 70.8% | 71.6% |
| fire | 50.6% | 54.1% | 52.4% |
| water | 36.6% | 33.9% | 35.2% |
| wind | 40.1% | 39.6% | 39.9% |
| earth | 52.6% | 54.0% | 53.3% |
| 先攻勝率 | 50.5% | 45.1% | 47.8% |

判定: CHECK NEEDED。water / wind の低勝率、control の突出、先攻 47.8% はカード/デッキ/ルール側の後続課題として分離した。

盛り上がり指標（1000 戦、seed 4101、標準対戦 break vs control）:

| 指標 | fair-gen001 |
| --- | ---: |
| 平均ターン | 25.2 |
| 中央値ターン | 25 |
| 先攻勝率（break 側） | 26.7% |
| リード交代あり | 59.6% |
| 平均リード交代 | 0.94 回 |
| 2点ビハインド逆転 | 47.3% |
| 先に2点差をつけた側の勝率 | 56.9% |
| 最大スイング 3 点以上 | 88.2% |
| 最大スイング 4 点以上 | 65.1% |
| 決着形態 | lifeout 64.0% / resource 35.8% / draw 0.2% |

ストレスデッキ回帰:

| 候補 | win rate | 判定 |
| --- | ---: | --- |
| p1 | 0.13% | OK |
| p1-2 | 3.63% | OK |
| p2 | 15.93% | OK |
| p2-3 | 43.83% | OK |
| p3 | 30.48% | OK |
| p3-4 | 28.33% | OK |
| p4 | 23.05% | OK |

apex 再探索:

- best: `apex_mutation_056`
- 探索リーグ: 54.8%
- current_apex: 49.1%
- current との直接ペア合算: 候補 120 / current 77 / draw 3
- デッキ変更は CPU 計画に混ぜず、後続課題へ分離

beginner 較正:

- 同一デッキ fire / water / earth、2 seed、先後 100 戦ずつ
- beginner 勝率: 27.8%
- 5-20% 目安を超過。特に earth 同一デッキで 56-65% と高い

## F2 再強化の採否

| フェーズ | 候補 | 結果 | 判断 |
| --- | --- | ---: | --- |
| F2a | 重み再探索 best | 50.4% / 51.5% | 55% 未達、不採用 |
| F2b | `publicHandDefenseWeight=0.75` | 50.0% | 不採用 |
| F2b | `publicHandDefenseWeight=1.25` | 49.9% | 不採用 |
| F2c | 既存 beam2 / beam3 | 31.6% / 26.2% | 不採用 |
| F2c | 終端盤面評価 beam2 / beam3 | 34.9% / 30.4% | 不採用 |
| F2d | 相手ターン読み | 未着手 | F2b/F2c 不採用のため見送り |

ターン内プランニングは、1 手スコアと盤面スコアを深さごとに積み上げる設計が弱化原因と判断し、終端盤面評価版も試したが採用ラインに届かなかった。

## 後続課題

詳細は `docs/fair-cpu-followups.md` に分離した。

1. water / wind の低勝率と control の突出
2. beginner 較正の上振れ
3. apex 再探索候補 `apex_mutation_056`

これらは CPU 公平化そのものには混ぜず、カード/ルール/デッキ/CPU較正の別タスクとして扱う。

## 検証コマンド

```bash
npx vitest run src/game/aiStrategy.test.ts src/game/tutorial.test.ts
npm run check

npm run sim -- league --games-per-pair 100 --seed 4101 --decks break control fire water wind earth --out tmp/fair-rebase-league-4101
npm run sim -- league --games-per-pair 100 --seed 730001 --decks break control fire water wind earth --out tmp/fair-rebase-league-730001
python3 .agents/skills/ai-break-duel-balance-tuning/scripts/league_report.py tmp/fair-rebase-league-4101 tmp/fair-rebase-league-730001

npm run sim -- simulate --games 1000 --seed 4101 --out tmp/fair-rebase-sim-4101
python3 .agents/skills/ai-break-duel-balance-tuning/scripts/excitement_metrics.py tmp/fair-rebase-sim-4101

npm run balance:cost -- --games-per-order 500 --seed 3000000 --out tmp/fair-rebase-cost.json
npm run tune:apex -- --pool-size 120 --top 4 --screen-games 4 --league-games 100 --seed 810101 --out tmp/fair-rebase-apex.json

npm run tune:ai -- --iterations 36 --passes 3 --elite-count 4 --games-per-seat 16 --seed 730001 --out tmp/fair-ai-tuning-pool.json
npm run gauntlet:ai -- --candidate-json tmp/fair-ai-top1.json --games-per-seat 120 --seed 910001 --out tmp/fair-ai-top1-910001.json
npm run gauntlet:ai -- --candidate-json tmp/fair-ai-top1.json --games-per-seat 120 --seed 920001 --out tmp/fair-ai-top1-920001.json
```

## 最終検証

`npm run check` green。

- typecheck: pass
- vitest: 19 files / 283 tests pass
- build: pass
