# 終盤設計改訂計画・手順書 — 相互パッシブ膠着の根本解消

作成日: 2026-07-09
ステータス: 完了（2026-07-09 ユーザー判断: 採用構成なし・Step 4 は実施しない。第二弾へ引き継ぎ）
進行状況: **§7 のチェックリストが正**（Step 3-2 で停止・完了扱い）

## 最終判断（2026-07-09・ユーザー決定）

- 膠着は全構成で完治（draw 89.6% → ≤1.2%）。時計（C0+P1）は第二弾の確定枠に昇格
- 最有力 `P4a h7`（手札防御全廃）は副作用 3 点（p2-3 ストレス RISK / 平均 18T 短すぎ /
  スノーボール 72.5%）で**採用見送り**。ただし「見えない後出し防御が病巣」という診断は実証された
- P3（シージ）は廃案（短期化 + water 爆発）。P2 は無攻撃世界では無風のため、攻撃が発生する
  世界（第二弾）でノブとして再検証する
- **後続**: 防御の中間用量（セット防御 / 制限つき手札防御）を比較する
  `docs/archive/endgame-redesign2-plan.md`（第二弾）へ引き継ぎ。結果の一次記録は
  `docs/archive/endgame-redesign-results.md`
前提: fair-gen005 採用済み（`docs/archive/fair-gen005-results.md`）。本計画は**ゲーム側（ルール）の改訂**であり、
CPU は原則触らない（新ルールの最小限の評価対応のみ許可。§4 参照）

> **別セッションで着手する人へ（最初に読む）**
>
> 1. 作業ブランチは **`codex/fair-rebalance-from-public-info`（正本）またはその派生**。main は使わない
> 2. 検証の作法は `.agents/skills/ai-break-duel-balance-tuning/SKILL.md`（§2g 原因分析ファースト含む）。
>    ガードテスト（公開情報同一 → 行動同一）は全変更で green 維持
> 3. **fair-gen005 時代のリーグ/ストレス数値は draw 汚染で崩壊している**（draw が分母に入るため）。
>    本計画の「改善」は draw 除外指標と盛り上がり指標で判定し、勝率帯の最終判定は draw 率が
>    正常化した後の再ベースラインで行う
> 4. パッケージ実験は config/ルールの一時変更で行い、**比較が終わるまで既定値を動かさない**
>    （採用決定後に一括で本採用 + docs 改訂）

## 0. 背景 — 病気の全貌（診断確定済み）

fair-gen005（パスを覚えた最強 CPU）同士の対戦で、break vs control の **draw 率 89.6%・
平均 38.5 ターン（中央値 = 上限 40）** に達した。最適プレイ同士だと試合が終わらない。

構造要因（コードで確認済み）:

1. **攻撃は二重に期待値マイナス**: ①見えない手札防御に刺さるリスク（`handDefenseLimit: 1`）、
   ②ダメージを与えると**その点数ぶん相手がドロー**（`drawOnAttackDamage: "point"`、ブレイク機構）
2. **待機が完全にタダ**: 手札上限なし（`handLimit: null`）で無限備蓄可能。手札が 1 枚でも残ると
   resource_exhaustion（手札・山札・場が全て空で発動）に到達しない
3. **逃げ切り先に draw**: `maxTurns: 40` 到達で無条件引き分け（`checkTurnLimit`）

## 1. 守るべきアイデンティティ（改訂で壊さないもの）

- **「手札は逆転の資源」**（design-principles）: ブレイクドロー（殴られた側が引く）は
  ゲームの魂なので**廃止しない**。レートの調整（point → event）までを許容範囲とする
- 逆転劇の量: 2 点ビハインド逆転率 **40% 前後を維持**（これが下がりすぎる案は却下）
- 思考時間・決定性・公平性の CPU 三原則はそのまま
- 既存の却下済み案（design-principles）を再提案しない

## 2. ルールパッケージ定義（ユーザー承認済み・2026-07-09）

### C0 — 共通土台（全パッケージに同梱）

- **ターン上限判定**: 40 ターン到達時、引き分け → **ライフ判定**（多い方の勝ち。同値のみ draw）。
  既存の `finishByLifeJudgement` を流用
- **手札上限 6 枚**: **自分のターン終了時**に超過分をトラッシュ（相手ターン中に手札が増えるのは可。
  現行 `enforceHandLimit` の呼び出し位置が自ターン終了時なので実装は素直）。
  6 で指標が歪む場合は 5 / 7 / 8 をノブとして試してよい

### P1 — 衰弱の刻（時計。対照実験を兼ねる）

- C0 + **自分のターン開始時にドローできなかったら（山札 0）、1 ダメージ**（固定。累積なし）
- design-principles の「デッキ切れ決着を少量残す」は「衰弱経由の決着」に改訂（採用時）
- **観察項目**: water（大量ドローデッキ）への影響。ドロー加速が「時計の早回し＝自傷」に
  変わるか、それでも回るか。water の勝率とデッキ切れ距離を専用に記録する

### P2 — ブレイクの代償（攻撃経済の再均衡。本命候補）

- P1 + **ブレイクドローのレート変更**: `drawOnAttackDamage: "point" → "event"`
  （ダメージ点数ぶん → 攻撃 1 回につき 1 枚）。power 4 の大打点が「相手を 4 枚太らせる」
  歪みを解消し、高 power 攻撃のコスト対効果を適正化する
- **攻撃側チャージ補償は 2 変種を別計測**（一方的試合化の懸念があるため）:
  - P2a: 補償なし（レート変更のみ）
  - P2b: 攻撃がダメージを通したら攻撃側 +1 チャージ
  - P2b で「先に 2 点差をつけた側の勝率」が 65% を超える場合は、1 ターン 1 回上限つき（P2c）を試す

### P3 — 戦線圧力（盤面プレッシャー）

- P1 + **ターン終了時、場のパワー合計が相手を上回っていたら相手ライフに 1 点**（シージ）
- シージの 1 点は**ブレイクドローを発生させない**（籠城側への資源供給を防ぐ）
- スノーボール緩和ノブ: 指標が悪化する場合「2 ターン連続で上回ったときのみ」を試す

### P4a — 手札防御の全廃（情報構造の最小実験）

- P1 + **手札防御の廃止**（`handDefenseLimit: 0`。設定 1 行で実験可能）
- 「見えない後出し」の病巣を最も安く検証する。ブラフは消えるが、攻撃リスクが激減する
- 実験段階ではカードテキスト・hand_defense 系効果の整理はしない（採用決定後に一括対応）。
  **チュートリアルが手札防御を使う場合は要注意**（tutorial テストで検出）
- 有望だが手触りが物足りない場合のみ、第二弾として P4b（セット防御 = 裏向き 1 枚を
  1 アクションで配置、それだけがブロック可能）を別計画で起案する

## 3. 実験マトリクスと判定基準

**実行順**: C0+P1（対照）→ P2a → P2b → P3 → P4a → 有望モジュールの組み合わせ（2 個 → 3 個）。
各構成につき: リーグ 2 シード（4101 / 730001）+ 盛り上がり指標（break vs control 1000 戦）。
全構成が同一シード・同一 CPU（fair-gen005）で比較できるよう、実験中は CPU・カードを凍結する。

**一次判定（足切り）**:

| 指標 | 基準 |
| --- | --- |
| draw 率 | **2% 以下** |
| 平均ターン | 20〜30 |
| リーグ全対戦の完走 | full stress regression が完走すること |

**二次判定（質の比較。一次を通った構成同士で）**:

| 指標 | 基準 |
| --- | --- |
| リード交代あり | 50% 以上（fair-gen005 直前値 13.7% からの回復） |
| 2 点ビハインド逆転 | 40% 前後を維持（逆転アイデンティティ） |
| 先に 2 点差をつけた側の勝率 | 65% 以下（スノーボール抑制。P2b はここを特に監視） |
| 単色リーグ帯 | 45-55%（draw 正常化後の値で判定） |
| water の健全性 | P1 の衰弱で water が帯外に沈まない/跳ねないこと（専用観察） |

**採用モデル**: 基準を最も良く満たした構成（単独モジュールでも複数併用でも可）を 1 つ選び、
本採用する。同等なら変更範囲が小さい方。

## 4. CPU の扱い（原則との折り合い)

- 新ルールを CPU が全く理解しないと、ルールの真価が測れない。ただし本格強化は禁止。
  許可されるのは**最小限の評価対応**のみ（例: 衰弱を lifeRace/deckOut 評価に反映、
  シージ点の盤面価値への反映）。対応はパッケージ実装の一部として同コミットでよいが、
  ガードテスト green 維持・fair-gen005 の重みは不変とする
- 実験結果が「CPU が新ルールを下手に打っているだけ」に見える場合はその旨を記録し、
  採用判断を保留して CPU 対応の要否をユーザーに確認する

## 5. 採用時の処理

1. 採用構成を既定値として本実装（config・カードテキスト・hand_defense 系効果の整理を含む）
2. `docs/game-spec.md` と `docs/design-principles.md` を改訂
   （「デッキ切れ決着少量」→ 衰弱、手札上限、ブレイクレート等、変えた原則を明文化）
3. 再ベースライン一式: リーグ 2 シード + 盛り上がり + **full ストレス回帰（完走確認込み）** +
   beginner 較正（5-20%）+ apex 再探索 + tutorial テスト
4. `docs/balance-history.md` 先頭にエントリ。followups の draw/長期化課題・停滞課題を解消済みに更新
5. 最終ゲート: `npm run check` + ガードテスト + tutorial green

## 6. やらないこと

- ブレイクドロー（逆転資源）の廃止
- CPU 本体の強化・弱体化（別計画。fair-gen005 の重み・探索は凍結）
- 実験途中での既定値変更・カード個別調整の混入（比較の同一条件を守る）
- P4b（セット防御）の実装（本計画では P4a まで。P4b は結果を見て別計画）

## 7. 進行状況チェックリスト（作業のたびに更新すること)

ルールは従来どおり（1 step ごとにチェック、判断は行末に追記）。実験は失敗しても止まらず
マトリクスを消化する（完走ルール）。

### Step 0 — 着手準備

- [x] 0-1. 正本ブランチ確認 + `npm run check` green + ガードテスト green → ブランチ: `codex/fair-rebalance-from-public-info`（正本 worktree: `/Users/user/WorkSpace/ai-break-duel/.claude/worktrees/fair-cpu-public-info`）。`npm run check` green（typecheck / unit 19 files・292 tests / build）。`npm run test:balance` green（1 file・7 tests）。公開情報同一ガード + tutorial: `npx vitest run src/game/aiStrategy.test.ts src/game/tutorial.test.ts` green（2 files・22 tests）。
- [x] 0-2. 現状の膠着ベースライン確認（draw 89.6% / 平均 38.5T / リード交代 13.7%）→ `docs/archive/fair-gen005-results.md` と `docs/balance-history.md` の fair-gen005 採用エントリで確認。break vs control 1000 戦 seed 4101: 平均 38.5T / 中央値 40 / draw 89.6% / lifeout 10.4% / リード交代あり 13.7% / 2点ビハインド逆転 25.0% / 先に2点差側勝率 77.9%。

### Step 1 — 実装（config/ルールフラグとして全パッケージを切替可能に）

- [x] 1-1. C0: ターン上限ライフ判定 + 自ターン終了時手札上限 6（フラグ化）→ 実装: `CONFIG.turnLimitResult: "life_judgement"` と `CONFIG.handLimit = 6` を `--endgame-package` 適用時のみ有効化。既定値は `draw` / `null` のまま。`src/game/turnPhase.test.ts` にライフ判定・手札上限テスト追加。
- [x] 1-2. P1: 自ターン開始時ドロー不能で 1 ダメージ（フラグ化）→ 実装: `CONFIG.deckOutFatigueDamage = 1` を `--endgame-package` 適用時のみ有効化。本来ドローするターン開始で山札 0 の場合だけ衰弱ダメージ。先攻1ターン目のルール上ドローなしは対象外。
- [x] 1-3. P2: ブレイクレート event 化 + チャージ補償（あり/なし切替）→ 実装: `CONFIG.drawOnAttackDamage = "event"`、`CONFIG.attackDamageChargeCompensation`、`CONFIG.attackDamageChargeCompensationOncePerTurn` を追加。`p2a` は event のみ、`p2b` は補償あり、`p2c` は1ターン1回上限。`src/game/strikeRules.test.ts` に event draw / 補償テスト追加。
- [x] 1-4. P3: シージ 1 点（ブレイクドロー非発生、連続条件ノブ）→ 実装: `CONFIG.siegeDamage = 1`、`CONFIG.siegeConsecutiveTurns` を追加。ターン終了時に場の power 合計が上回る側から相手へ直接 1 ダメージ（ブレイクドローなし）。`--siege-consecutive-turns` で連続条件を指定可能。
- [x] 1-5. P4a: `handDefenseLimit: 0` 切替の動作確認 → 実装: `--endgame-package p4a` で `CONFIG.handDefenseLimit = 0`。`src/game/defenseChoice.test.ts` に手札防御無効化テスト追加。
- [x] 1-6. CPU の最小評価対応（§4 の範囲）+ ガードテスト green → 内容: challenger / fair-gen005 の重み・探索は不変更。新ルール専用の評価強化は入れず、まずルール単体を同一CPUで比較する。必要なら Step 2 の結果に「CPU が新ルールを下手に打っている疑い」として記録。公開情報同一ガード + 追加ルールテスト: `npx vitest run src/game/aiStrategy.test.ts src/game/tutorial.test.ts src/game/turnPhase.test.ts src/game/strikeRules.test.ts src/game/defenseChoice.test.ts` green（5 files・64 tests）。`npm run test:balance` green（1 file・7 tests）。
- [x] 1-7. tutorial テスト green（特に C0 手札上限と P4a）→ 結果: `npx vitest run src/game/aiStrategy.test.ts src/game/tutorial.test.ts ...` 内で tutorial green（2 files・22 testsを含む）。既定値は current のままなので通常 tutorial 進行に影響なし。

### Step 2 — 実験マトリクス（各構成: リーグ 2 シード + 盛り上がり 1000 戦）

- [x] 2-1. C0+P1（対照）→ draw率 / 平均T / リード交代 / 逆転率 / 先2点差側 / water: 1.2% / 31.7T / 43.7% / 22.8% / 78.9% / water 23.7%。draw は解消したが長い + water 崩壊。
- [x] 2-2. +P2a（レート変更のみ）→ 同上: 1.1% / 32.2T / 43.9% / 23.6% / 78.3% / water 21.0%。C0+P1から改善なし。
- [x] 2-3. +P2b（チャージ補償あり）→ 同上（スノーボール特別監視）: 0.9% / 31.5T / 41.3% / 22.3% / 78.8% / water 23.0%。先2点差側 78.8% でスノーボール基準外。
- [x] 2-4. +P3（シージ）→ 同上: 0.0% / 14.5T / 52.3% / 21.0% / 79.9% / water 85.9%。短すぎ + water 過剰。
- [x] 2-5. +P4a（手札防御全廃）→ 同上: 0.1% / 18.3T / 55.7% / 35.5% / 71.0% / water 45.0%。最有望だが平均T 20未満、先2点差側 65% 超。
- [x] 2-6. 一次判定の通過構成を列挙 → 通過: 厳密 PASS なし。全構成 draw 2% 以下は満たすが、平均ターン 20-30 を満たせない（C0/P1/P2系は31T台、P3/P4a系は9.5-18.5T）。有望 P4a 系 stress 80/order は完走したが p2-3 stress RISK。
- [x] 2-7. 有望モジュールの組み合わせ検証（2 個 → 3 個）→ 結果: 2個: P2a+P3 0.0%/14.4T/water86.8、P2a+P4a 0.1%/18.3T/water51.2、P2b+P3 0.0%/14.0T/water85.3、P2b+P4a 0.1%/14.9T/water60.3、P3+P4a 0.0%/10.9T/water79.0。3個: P2a+P3+P4a 0.0%/10.9T/water80.9、P2b+P3+P4a 0.0%/9.5T/water75.4。追加ノブ: P4a h7 0.0%/18.1T/water45.9、P4a h8 0.1%/18.1T/water46.8、P2a+P4a h7 0.0%/18.5T/water51.0、P2a+P4a h8 0.1%/18.5T/water51.8。詳細は `docs/archive/endgame-redesign-results.md`。

### Step 3 — 採用判断

- [x] 3-1. 二次判定の比較表を作成し、採用構成を決定 → 構成: 厳密な本採用構成なし。最も近い暫定候補は `P4a h7`（draw 0.0%、平均18.1T、リード交代55.4%、2点ビハインド逆転34.8%、water45.9%、単色40.2-56.4%、stress p2-3 58.5% / break+control 54.1%）。`P2a+P4a h7` は water/単色帯が良いが stress p2-3 62.9% / break+control 61.6% で悪化。
- [x] 3-2. ユーザーへ採用構成と根拠を報告（手触りが大きく変わる P4a を含む場合は特に明示）→ 承認: 報告済み。未承認（承認待ち）。Step 4 は停止。

### Step 4 — 本採用と再ベースライン（§5）

- [ ] 4-1. 既定値化 + カードテキスト/効果整理 + game-spec / design-principles 改訂
- [ ] 4-2. 再ベースライン一式（full ストレス完走確認込み）→ 結果:
- [ ] 4-3. beginner 較正 5-20% 確認（割れたら beginner 追従再較正。別コミット）→ 結果:
- [ ] 4-4. apex 再探索 → 結果:
- [ ] 4-5. balance-history 記録 + followups 更新（draw/長期化・停滞課題のクローズ）
- [ ] 4-6. **最終ゲート**: `npm run check` + ガードテスト + tutorial green
- [ ] 4-7. 本計画書のステータス更新 + 実施結果サマリを冒頭に追記 + コミット
