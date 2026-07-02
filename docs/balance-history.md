# Break Duel バランス履歴

最終更新: 2026-07-02

この文書は、デッキやルールのバランス変更で採用判断に使った主要な検証結果を残す履歴です。現行ルールの正仕様は `docs/game-spec.md`、実装構成は `docs/architecture.md` を参照します。

## 2026-07-02 単色デッキ召喚獣再調整

### 背景

単色4デッキの勝率を 45-55% に収めるため、召喚獣効果を中心に再調整しました。カード追加は、劣勢側の再行動と1ドローで弱い単色デッキを救済する `CMD-COMEBACK-RITE` の1種類だけに限定しました。

### 採用変更

| カード | 変更 |
| --- | --- |
| `AI-FIRE-1` | 攻撃しても消耗しない |
| `AI-FIRE-3` | 攻撃値+1から、手札防御貫通へ変更 |
| `AI-WATER-1` | 登場時1ドローから、攻撃被防御時1ドローへ変更 |
| `AI-WATER-4` | 攻撃後退場時、手札へ戻る |
| `AI-WIND-1B` | 非消耗攻撃から、被防御時1ドロー・手札防御不可へ変更 |
| `AI-WIND-2B` | 登場時相手消耗に加え、消耗で出る |
| `AI-EARTH-1` | 攻撃被防御時に相手手札を1枚トラッシュへ送る |
| `AI-EARTH-2B` | 場防御成功時1ドロー |
| `AI-EARTH-3` | 場防御値+1 |
| `CMD-COMEBACK-RITE` | 相手よりライフが少ない場合、1ドローし、最高 power の消耗中召喚獣1体を回復する |

デッキ側では、火単色に `CMD-COMEBACK-RITE` 1枚、土単色に `CMD-COMEBACK-RITE` 2枚を入れました。各属性の 1-4 cost 召喚獣はそれぞれ最低2枚を維持しています。

### 最終単色リーグ

```bash
python3 -m ai_break_duel.cli league \
  --games-per-pair 1000 \
  --seed 2026070203 \
  --decks fire water wind earth \
  --out tmp/mono-final-balance-2026070203-1000
```

| デッキ | 勝率 | 成績 |
| --- | ---: | ---: |
| earth | 54.8% | 3270-2699-31 |
| wind | 51.0% | 3046-2928-26 |
| water | 47.5% | 2837-3141-22 |
| fire | 46.8% | 2807-3192-1 |

### 副作用確認

```bash
python3 -m ai_break_duel.cli league \
  --games-per-pair 120 \
  --seed 2026070202 \
  --decks break control fire water wind earth \
  --out tmp/six-candidate-e-2026070202-120
```

| デッキ | 勝率 |
| --- | ---: |
| break | 58.5% |
| control | 52.5% |
| water | 50.5% |
| earth | 47.8% |
| wind | 46.7% |
| fire | 44.0% |

`fire` は6デッキ全体ではまだ 45% をわずかに下回りますが、主対象の単色4デッキでは 46.8% まで戻りました。

コスト帯ストレス確認は次で実行しました。

```bash
python3 .agents/skills/ai-break-duel-balance-regression/scripts/run_cost_balance.py \
  --rule-set current \
  --include-preset-league \
  --games-per-order 400 \
  --seed 2026070204 \
  --out tmp/cost-balance-final-2026070204.json
```

プリセットリーグは `earth` 56.8%、`break` 55.5%、`control` 52.6%、`wind` 48.0%、`fire` 43.7%、`water` 43.3% でした。コスト帯ストレスでは `p2_3` 59.9%、`p3` 61.0%、`p3_4` 51.0%、`p4` 57.1% が RISK 判定です。今回の採用範囲は単色4デッキの属性間調整であり、高 power 帯ストレス構築の抑制は次回以降の課題として残します。

### 判断

採用します。単色4デッキは 1000 games/ordered pair の確認で全て 45-55% に収まりました。同属性同 cost の召喚獣も、攻撃持続、手札圧、手札防御制限、防御ドロー、防御値補正などの役割を分け、明確な完全上位互換を避けています。

## 2026-07-02 単色デッキ特化再構築

### 背景

多色デッキ、とくに `break` と `control` が単色デッキを大きく上回っていました。最初は単色ボーナスやCPU評価の調整も検討しましたが、単色デッキ自体が「各属性の召喚獣をすべて見せる」構成に近く、属性の強みへ十分寄せられていませんでした。

そこで、ルールやカード効果は変更せず、単色デッキだけを保存デッキと同じ構築制約内で再構築しました。

### 構築制約

- 20枚ちょうど。
- 同名カードは2枚まで。
- power 3以上の召喚獣は合計4枚まで。
- 単色デッキの召喚獣は同じ属性のみ。
- inactiveカードは使わない。

### 採用方針

| デッキ | 方針 |
| --- | --- |
| 火単色 | 火力、手札圧、`CMD-FIRE-RITE`、`CMD-RELEARN` に寄せる。 |
| 水単色 | P3中心のドロー、フィルター、回帰で息切れを抑える。 |
| 風単色 | 相手の消耗、自分の再行動、`CMD-WIND-RITE` に寄せる。 |
| 土単色 | 防御、回収、`CMD-EARTH-RITE`、大型保護に寄せる。 |

### 採用後リーグ

実装後に、6デッキの順序付き総当たりを各順序200戦、合計6000試合で再検証しました。

```bash
python3 -m ai_break_duel.cli league \
  --games-per-pair 200 \
  --seed 2026070261 \
  --decks break control fire water wind earth \
  --out tmp/final-mono-rebuild-league-200
```

| 指標 | 値 |
| --- | ---: |
| seed | `2026070261` |
| 試合数 | 6000 |
| 先攻勝率 | 49.5% |
| 引き分け率 | 0.2% |
| 平均ターン | 17.67 |
| ワンサイド率 | 17.6% |

| デッキ | 勝率 | 成績 |
| --- | ---: | ---: |
| break | 61.5% | 1228-770-2 |
| wind | 53.1% | 1060-937-3 |
| control | 50.9% | 1016-979-5 |
| water | 47.2% | 944-1055-1 |
| fire | 44.9% | 897-1101-2 |
| earth | 42.4% | 845-1148-7 |

### 変更前比較

同じ seed `2026070261`、同じ6000試合条件で、変更前の単色デッキは次の状態でした。

| デッキ | 変更前 | 変更後 |
| --- | ---: | ---: |
| break | 78.1% | 61.5% |
| control | 69.9% | 50.9% |
| fire | 44.6% | 44.9% |
| wind | 44.2% | 53.1% |
| earth | 31.8% | 42.4% |
| water | 31.4% | 47.2% |

| 指標 | 変更前 | 変更後 |
| --- | ---: | ---: |
| ワンサイド率 | 23.8% | 17.6% |
| 先攻勝率 | 49.5% | 49.5% |
| 平均ターン | 16.73 | 17.67 |

### 判断

採用します。多色デッキの優位は残っていますが、`break` / `control` の突出は大きく緩和され、単色側の下限も上がりました。ワンサイド率も下がっており、先攻勝率はほぼ中立です。

残る課題は、`fire` と `earth` がまだ下位に寄っていることです。ただし、この時点では追加ルールや単色ボーナスを入れるより、実プレイ感とCPU行動ログを見てから次の調整を判断する方が安全です。

### 検証

```bash
python3 -m unittest tests.test_core_rules tests.test_cost_balance
npm run check
python3 -m ai_break_duel.cli league --games-per-pair 200 --seed 2026070261 --decks break control fire water wind earth --out tmp/final-mono-rebuild-league-200
```
