# 対人CPU戦ログ

`npm run dev` で起動したローカル開発サーバー上で人間対CPUの通常対戦を行うと、学習・分析用ログを自動保存する。画面上の閲覧機能は持たず、チュートリアルは記録対象外とする。

## 保存先

```text
tmp/human-battle-logs/YYYY-MM-DD/<開始日時>_seed-<seed>_<session-id>.jsonl
```

`tmp/` はGit管理外である。1対局につき1ファイルで、対局中も状態遷移ごとに追記する。ブラウザを閉じた場合も、それまでの記録は残る。対戦選択画面へ戻るか別画面へ移動した場合は `match_abandoned` を記録する。

## 記録形式

各行が独立したJSONで、`sequence` 順に読む。

- `match_start`: seed、ルール値、両者のデッキ名・CPUプロファイル、初期状態
- `state_transition`: 操作後の完全な状態と、その遷移で増えた日本語ゲームログ
- `match_end`: 勝敗と最終状態
- `match_abandoned`: 途中終了時点の状態

`state.players` には山札、手札、公開済み手札、伏せ防御、場、スタック、遺物、トラッシュをカードIDで保存する。消耗状態、残りアクション、攻撃回数、防御・チャージ・攻城関連フラグ、未解決の攻撃・対象選択も含む。対局後の方策分析用なので、CPUの手札や山札も含む完全情報ログである。

## AIからの利用例

```bash
find tmp/human-battle-logs -name '*.jsonl' -type f | sort
rg '"type":"match_end"' tmp/human-battle-logs
jq -c '{sequence,type,actor,new_log_entries,result,turn:.state.turn,life:[.state.players[].life]}' \
  tmp/human-battle-logs/YYYY-MM-DD/*.jsonl
```

AIには `match_start` のルール・デッキを読ませ、各 `state_transition` の遷移前後と `new_log_entries` を照合し、特に `actor: "human"` の選択をCPUの候補手と比較させる。
