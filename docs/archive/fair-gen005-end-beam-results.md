# fair-gen005 候補(a) end 強制包含 実験結果

作成日: 2026-07-09
対象ブランチ: `codex/fair-rebalance-from-public-info`
対象課題: `docs/fair-cpu-followups.md` 課題 2c

> 追記（2026-07-09）: この不採用判断は、ユーザー決定済み A 案により上書きされた。beginner 較正割れは challenger 改善の却下理由にせず、beginner 側を追従再較正したうえで `fair-gen005` として採用した。最終結果は `docs/archive/fair-gen005-results.md` を参照。

## 結論

候補(a)「beam 候補へ `end` を常時強制包含」は採用しない。`fair-gen005` は凍結しない。

理由は、fair-cpu 採用ゲートのうち beginner 較正が 5-20% 帯を下回ったため。ガントレット非退行とガードテストは通ったが、water / earth の beginner 勝率が 0.0% / 0.25% まで落ち、最高難度 CPU が強くなりすぎる。

実験パッチは最終コードへ残していない。

## 実験内容

`choosePlannedChallengerAiAction()` と `debugChallengerBeam()` の各展開で、`rankedAiActions(...).slice(0, beamWidth)` に入らなかった `end` を追加候補として残す最小修正を試した。

狙いは、遺物配置や低価値補助行動が即時スコアで上位を埋めたときにも、「何もしない」を終端評価に比較させること。

## 検証

### ガードテスト

`npx vitest run src/game/aiStrategy.test.ts`

- 結果: green
- 追加確認: 既存の beam planning 回帰テストも通過

### fair プール ガントレット非退行

候補 JSON は `fair-gen004` と同じ重みを使い、エンジン側だけを候補(a)に差し替えて測定した。

| seed | games/seat | pool win rate | deck floor | 判定 |
| ---: | ---: | ---: | ---: | --- |
| 910001 | 120 | 59.3% | 48.3% | 非退行 |
| 920001 | 120 | 61.3% | 52.5% | 非退行 |

`fair-gen004` 同士の比較は同一重み・同一エンジンのため各 seed 50.0% / floor 50.0%。

### beginner 較正

`scripts/diagnoseResourceBurn.ts`（fire/water/earth、seed 4101 / 730001、先後 100 戦ずつ、各 400 戦）

| deck | beginner wins | games | beginner win rate | 判定 |
| --- | ---: | ---: | ---: | --- |
| fire | 26 | 400 | 6.5% | 帯内 |
| water | 0 | 400 | 0.0% | 下限未達 |
| earth | 1 | 400 | 0.25% | 下限未達 |

5-20% の fair-cpu 較正基準を満たさない。

### ストレスデッキ回帰

`npm run balance:cost -- --games-per-order 500 --seed 3000000 --out tmp/fair-gen005-a/cost-3000000.json` を開始したが、採用必須ゲートの beginner 較正が先に失敗し、かつ実行プロセスが `ps` 上で見えない状態で PTY セッションだけが残ったため中断した。

この実験の採否は beginner 較正失敗だけで確定する。

## 判断

候補(a)は 2c の原因に直接効く可能性が高い一方、`end` を全局面で比較可能にすると、water / earth ミラーで challenger が beginner を圧倒しすぎる。fair-cpu 作法では初心者較正 5-20% が採用条件のため、`fair-gen005` としては採用しない。

次の候補は、1 実験 1 検証を維持するなら、(b) `boardAiScore` に遺物スロット価値を追加する案を別実験として扱うのが自然。候補(a)のように全局面のパス判断を強めるより、遺物置き換えの無駄だけを評価へ入れる方が副作用を狭められる可能性がある。

## 再現コマンド

```bash
PATH=/Users/user/.nvm/versions/node/v24.13.0/bin:/Users/user/.nvm/versions/node/v22.17.0/bin:$PATH npx vitest run src/game/aiStrategy.test.ts

PATH=/Users/user/.nvm/versions/node/v24.13.0/bin:/Users/user/.nvm/versions/node/v22.17.0/bin:$PATH npm run gauntlet:ai -- --candidate-json docs/assets/ai-champions/fair/fair-gen004.json --games-per-seat 120 --seed 910001 --out tmp/fair-gen005-a/gauntlet-910001.json

PATH=/Users/user/.nvm/versions/node/v24.13.0/bin:/Users/user/.nvm/versions/node/v22.17.0/bin:$PATH npm run gauntlet:ai -- --candidate-json docs/assets/ai-champions/fair/fair-gen004.json --games-per-seat 120 --seed 920001 --out tmp/fair-gen005-a/gauntlet-920001.json

PATH=/Users/user/.nvm/versions/node/v24.13.0/bin:/Users/user/.nvm/versions/node/v22.17.0/bin:$PATH npx tsx scripts/diagnoseResourceBurn.ts --out tmp/fair-gen005-a/beginner-calibration.json
```
