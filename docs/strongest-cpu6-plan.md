# 最強 CPU 第 6 次計画: 対人搾取（デッキアウト自滅・受け身）の欠陥修正

作成日: 2026-07-12
ステータス: **完了（真因はエンジン回帰バグ da19212。修正採用・CPU 重み変更なし。詳細は §7 と balance-history 2026-07-12 エントリ）**

## 別セッションで着手する人へ

- 作業ブランチ: `claude/goofy-meitner-f8d539`（main 由来。fair CPU 一式は main にマージ済みで、`codex/fair-rebalance-from-public-info` に main 未取込のコミットは無いことを確認済み）
- 基準チャンピオン: `docs/assets/ai-champions/fair/fair-gen006.json`（2026-07-09 採用・凍結）
- ゲート種別: **challenger の欠陥修正**（55% 強化ゲートは課さない）
  1. 当該悪手の解消（対人ログ再現局面での行動改善）
  2. 対 fair-gen006 非退行（全体・床値、独立 2 シード）
  3. beginner 較正 5-20% 維持（fire/water/earth、2 シード）
  4. 公平性ガードテスト green（公開情報のみ・同一公開情報で同一行動）
- 比較禁止: 旧世代・覗き見時代の数値と比較しない。基準は 2026-07-10 A案採用後の再ベースライン値（`docs/balance-history.md` 先頭）

## 0. 発端（2026-07-11 対人戦ログ 4 戦の分析）

`ai-break-duel-human-battle-logs/tmp/human-battle-logs/2026-07-11/` の対人 4 戦（全て challenger）で:

- 人間の 3 勝は全て「ニケの山札切れ→衰弱死」。人間はライフ 8 の完全ノーダメ
- ニケの攻撃は 4 戦合計 5 回のみ。人間のライフへの攻撃ダメージは 4 戦通して 0
- ニケは毎試合 25 枚引き切り自滅。ドロー系コマンドを乱発し、手札 6-10 枚を溜めては手札上限トラッシュ（最大 8 回/戦）
- 唯一のニケ勝利も人間側の完全リソース切れによるライフ 1 の辛勝

## 1. 原因（スコアトレースで裏取り済み）

`scripts/diagnoseHumanBattleLogs.ts`（本計画で新規作成）でログから GameState を復元し、
`debugChallengerActionScores` を実対局の選択と突き合わせた。

1. **山札=寿命の無自覚**: 時計世界（衰弱 1 ダメージ/ターン）では山札が寿命なのに、
   `fatigueClockPressure=0` / `deckOutPressure=1` で、ドローの山札コストが評価にほぼ存在しない。
   ドロー系コマンドは `handCard=12/枚` の得にしか見えず、seed 4114466439 ではニケが T18 で山札 0（人間は 8 枚残し）
2. **消耗レースの無自覚**: seed 4114466439 T8（ライフ 7 vs 8、アクション 2 残し）で `end`（総合 210）が
   攻撃（154）に勝つ。盤面温存が常に最善に見え、「先に衰弱で死ぬ」情報がスコアに無い。
   T16 はライフ 2 で手札 7 枚を抱えたまま 3 アクション残して即 `end`
3. **手札上限超過の無罰**: `handOverflow * handCard * handLimitAwareness(=1)` は超過分の価値を
   0 に相殺するだけで負にならず、溜め込み→上限トラッシュの損失が見えない

## 2. 設計（再試行禁止形の回避）

- 禁止形: `fatigueClockPressure=24` の一律加点は第 5 次 step 2-1 で fire/wind 床値 44% 台に落ち不採用済み。同じ形は使わない
- 新特徴 **消耗レース項（attritionRace）**: `doom(p) = p.deck.length + p.life`（衰弱時計での残り寿命の近似。公開情報のみ）として

  ```
  + (min(oppDoom, H) - min(aiDoom, H)) * attritionRacePressure   // H = attritionRaceHorizon
  ```

  H で飽和させるため、両者の寿命が H ターンより長い序中盤は**完全に不活性**（床値を壊した一律形との本質的な違い）。
  終盤に近づくと、自分のドローは寿命コストとして減点され、チップ攻撃は相手のライフ+ブレイクドローの
  二重で相手の寿命を削るため加点される
- **handLimitAwareness 1→2**: 超過 1 枚あたり実質 -12（純粋な重み変更、コード変更なし）

## 3. チェックリスト（進行の正）

- [x] 3-0. 着手前チェック: npm ci、`npm run check` + ガードテスト green（2026-07-12、ベースライン確認済み）
- [x] 3-1. 診断ハーネス `scripts/diagnoseHumanBattleLogs.ts` 作成、実対局の再現一致を確認（seed 4114466439 の CPU 25 手番を復元、実選択と一致）
- [x] 3-2. コード変更: `attritionRacePressure` / `attritionRaceHorizon` / `deckStockValue` を CHALLENGER_WEIGHTS に追加（literal は 0/12/0 で挙動不変）、boardAiScore に消耗レース項と山札資産項を実装。ガードテスト green → 判断: 消耗レース項単体（C1/C2、horizon 12）は対人ログ 99 手番で行動差分 0。自滅ドローは山札 15 枚以上の序中盤に起きるため horizon 12 では活性化が遅すぎ、horizon を上げる案は第 5 次で床値を壊した一律形に戻るため却下。自分の山札に直接値付けする `deckStockValue` を追加設計した
- [x] 3-3. 診断ハーネスに `--candidate-json` を追加し、候補重みで対人ログ再現局面の行動改善を確認 → 結果: C3/C4（deckStockValue=8）で自滅ドローの急所が改善（seed 4114466439 T4 若葉の息吹→磁鉄虫フェルム召喚、T6 逆転再起術→岩壁継承術、計 6-7 差分）。C5（+attritionRacePressure=20）はさらに終盤の early-end 4 箇所が strike/memory/charge に変化（seed 729113170 T18 end→ヴァレン strike、seed 1664610365 T16 end→strike）。C5 を本命とする
- [x] 3-4. 候補ガントレット（対 fair-gen006、キー補完プール、2 シード、120 games/seat）→ 結果:
  - C5（stock8+aware2+race20）: pool 40.60% / 40.56%、floor 32.34% / 35.98%。**大幅退行で不合格**。毒は race=20（一律に近い盤面歪み）
  - C4（stock8+aware2）: pool **58.43% / 58 → 57.61%**、floor 49.58% / 46.03%（240戦/デッキ、se≈3.2pt の誤差圏）。欠陥修正の非退行ゲートを大幅に超え、55% 強化ゲート水準
  - C6（race8）/ C7（race12,h8）: 低ドーズでは終盤 early-end→strike の受け身修正が消える（C4 比差分 2 のみ）
  - 判断: **C4 を採用**。受け身（終盤 end 連打・チップ攻撃で相手のブレイクドローを強制しない）は未解決課題として followups 起票。attritionRace 系のコードは残し重み 0（fatigueClockPressure と同じ扱い）
- [x] 3-5. C4 の beginner 較正 → **不合格で C4 差し戻し**: fire 32.0% / water 21.75% / earth 18.25%（帯 5-20%、基準 fire 6.75% / water 7.0% / earth 8.5%）。fire の負け筋をシード付き再現（seed 4123 / 4140、tmp/strongest-cpu6/diagnoseBeginnerExploit.ts）した結果、c4 の fire challenger は中盤から「ドロー→上限トラッシュ→end」の亀になり、ラッシュのチップ+衰弱に負ける。fire の攻撃はほぼ全て攻撃後退場ドロー付きのため、stock=8 の静的課税が攻撃マージンを一律 -8 して受けに歪めた疑い。literal は gen006 相当へ差し戻し、早まって凍結した fair-gen007.json も撤回
- [x] 3-5b. 行動スコア側の外科的減点（drawOverflowPenalty、上限からあふれる山札ドローのみ減点）を実装して検証 → **構造的に不発**: 計画 challenger のビームは終端盤面スコアのみで最終順位を決め、行動スコアは候補足切りにしか使われない（第 3 次の多重計上修正の帰結）。commandAiValue を -50 しても足切りを生き残れば選択は変わらない（seed 4114466439 T6 で確認）。行動レベルの評価修正は原則効かないという教訓を §6 に記録。機能はコードに残し重み 0
- [x] 3-6. 分解実験の途中、**基準値そのものが再現しない**ことを発見（純正 HEAD でも beginner fire 35.75% / water 33.75% / earth 18.0%。docs 基準は 6.75% / 7.0% / 8.5%）。fire 単独 1 シードの高速較正でバイセクト:
  - 0415de6（A案採用 = 基準測定時点）: fire 6.50% ✓ 再現
  - 26af1ed（develop マージ）: fire 6.50% ✓ 健全
  - **da19212「Fix CodeRabbit review findings」: fire 36.00% ← 破壊コミット特定**
- [x] 3-7. **真因はエンジンの仕様違反バグ**: da19212 が `performAiActionInDraft` のアップグレード処理から「power 3/4 でもアップグレード登場は未消耗」の実装を削除（game-spec §基本ルール「アップグレード登場では通常通り未消耗状態で場に出る」および「アップグレードで消耗を解除できる既存挙動は維持」に違反）。同コミットは upgrade.test.ts のアサーションも逆向き（消耗保持）に書き換えてバグを固定化していた。App 側（人間パス）は元から同じ違反を持っており、da19212 は食い違いをバグ側に統一していた。修正は `applyPlayEffects` にアップグレード判定（元カード引数の有無）を一元実装し、両パス同時に仕様準拠へ復旧。テストも元のアサーションへ戻し、power3/4 のアップグレード未消耗回帰テストを追加
- [x] 3-8. 修正後の検証: fire 高速較正 6.50%（バグ導入前と完全一致）、upgrade/aiStrategy/tutorial 44 テスト green、npm run check green、test:balance 7 件 green。対人ログ再現では**差分 31 手、early-end 16→5 に激減**（end 連打が「準備完了のアップグレード」に置き換わる）。CPU 評価重みの変更は**不採用**（c4/c5 の測定はバグ入りエンジン上のもので無効。新特徴はコードに inert（重み 0）で温存）
- [x] 3-9. 仕上げ → 結果: beginner 較正フル fire 6.75% / water 7.0% / earth 8.5%（基準完全一致）、6 デッキリーグ 2 シード平均 break 43.5 / control 52.6 / fire 55.0 / water 45.9 / wind 52.6 / earth 47.7 / 先攻 47.9（A案採用時の基準値と全項目一致 = バグ前世界の完全復旧）。balance-history 2026-07-12 エントリ起票、エンジン修正は eea790f でコミット済み

## 4. 候補

| 候補 | 内容 | 対人ログ再現での改善 |
| --- | --- | --- |
| C0 | handLimitAwareness=2 のみ | 差分 0（不発） |
| C1 | attritionRacePressure=20, horizon=12 | 差分 0（不発。horizon 12 は活性化が遅すぎる） |
| C2 | C1 + handLimitAwareness=2 | 差分 0（不発） |
| C3 | deckStockValue=8 | 差分 7。自滅ドローの急所が改善 |
| C4 | C3 + handLimitAwareness=2 | 差分 6。C3 とほぼ同等 |
| C5 | C4 + attritionRacePressure=20 | 差分 14。自滅ドロー改善 + 終盤 early-end 4 箇所が strike/memory 化 |

床値・全体勝率の非退行を満たしつつ、対人ログ再現局面の改善が最大の候補を採用する。
ゲート未達でも記録して次候補へ（完走ルール）。本命 C5、フォールバック C4/C3。

## 6. 本タームで得た構造的教訓

1. **行動スコアの修正は計画 challenger には原則効かない**: ビームの最終順位は
   `turnEndPlanScore`（終端盤面評価のみ）。`scoreAiAction` / `commandAiValue` 系の増減は
   `rankedAiActions` の足切り（beam 幅までの候補選抜）にしか影響しない。
   挙動を変えたいなら `boardAiScore` の静的項か、足切り境界を狙うしかない
2. **静的な山札課税は「攻撃後退場ドロー」デッキの攻撃マージンを直撃する**: fire の攻撃は
   ほぼ全て自分の山札を 1 枚引くため、deckStockValue はそのまま攻撃への税になる。
   ミラー長期戦（ガントレット）では +8pt 級の強化に見えても、ラッシュ相手の速攻レンジで
   受けに歪み、beginner 較正が壊れる（fire 6.75%→32.0%）
3. **beginner 較正は「challenger の運用欠陥検出器」として機能した**: ガントレット 58% 台でも
   較正が 5-20% 帯から上に割れたら、challenger に搾取可能な歪みがある

## 5. 記録

- C4 ガントレット: pool 58.43% / 57.61%、floor 49.58% / 46.03%（seed 611001 / 612001、120 games/seat、キー補完プール=fair-gen006 単独）— **バグ入りエンジン上の測定のため採用判断には無効**
- C5 ガントレット: pool 40.60% / 40.56% — race=20 は不採用（fatigueClockPressure=24 と同じ失敗形に接近）— 同上
- C4 beginner 較正: fire 32.0% / water 21.75% / earth 18.25% — 帯上抜け（後にバグ由来と判明。純正 HEAD でも fire 35.75%）
- バイセクト（fire 単独 seed 4101 両席 100 戦）: 0415de6 → 6.50%、26af1ed → 6.50%、**da19212 → 36.00%**
- エンジン修正後: fire 高速較正 6.50%、beginner 較正フル **fire 6.75% / water 7.0% / earth 8.5%（docs 基準値と完全一致）**
- 修正後の対人ログ再現: 差分 31 手、early-end（2 アクション以上残しの end）16→5、end 連打の大半が準備完了アップグレードへ置換

## 7. 結論と残課題

- 対人 4 戦で観測された「デッキアウト自滅・受け身」の**主因は da19212 のアップグレード消耗バグ**。
  challenger の主力ムーブ（アップグレード育成→攻撃）が丸ごと機能不全になり、手の出口を失った結果として
  溜め込み→上限トラッシュ→ドロー乱発→衰弱死が発生していた
- CPU 評価関数の変更（deckStockValue 等）は**本タームでは不採用**。fair-gen006 凍結を維持。
  新特徴 3 種（attritionRacePressure / attritionRaceHorizon / deckStockValue / drawOverflowPenalty）は
  コードに重み 0 で温存し、修正後エンジンでの再評価は将来タームの選択肢とする
- 残課題: da19212 の他の変更（canSetDefenseCard 厳格化、publicHandDefenseEstimateInput リファクタ）の
  仕様照合監査（別タスク起票済み）。修正後エンジンでの対人戦ログ収集を再開し、
  ブレイクドロー衰弱経路の対人搾取が実際に残るかを再観測する
