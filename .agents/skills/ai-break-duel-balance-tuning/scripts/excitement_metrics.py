#!/usr/bin/env python3
"""simulate 出力（matches.jsonl）から「盛り上がり指標」を集計する。

使い方:
    python3 excitement_metrics.py tmp/sim-A tmp/sim-B ...

複数ディレクトリを渡すと全試合を合算して集計する。
各指標の目安値は docs/balance-history.md の直近エントリを参照
（例: 2026-07-03 改訂時 = 2点ビハインド逆転 53.3% / 先2点差側勝率 56.3% /
最大スイング3点以上 94% / 平均 17.0 ターン / デッキ切れ 5.5%）。
"""
from __future__ import annotations

import json
import sys
from pathlib import Path
from statistics import mean, median


def collect(match: dict) -> dict | None:
    summary = match["summary"]
    log = match["log"]
    life_series = [tuple(e["life"]) for e in log if e.get("event") == "turn_start"]
    end = next((e for e in log if e.get("event") == "game_end"), None)
    if end is not None and "life" in end:
        life_series.append(tuple(end["life"]))
    if not life_series:
        return None

    initial_life = summary["config"]["life"]
    winner = summary.get("winner")  # "player_1" | "player_2" | None(引き分け)
    winner_index = {"player_1": 0, "player_2": 1}.get(winner)

    first_damage_turn = None
    lead_changes = 0
    prev_sign = 0
    max_swing = 0
    winner_max_behind = 0
    first_to_two = None  # 先に 2 点差をつけた側 (0/1)
    for turn_index, (p1, p2) in enumerate(life_series, start=1):
        diff = p1 - p2
        if first_damage_turn is None and (p1 < initial_life or p2 < initial_life):
            first_damage_turn = turn_index
        sign = (diff > 0) - (diff < 0)
        if sign != 0:
            if prev_sign != 0 and sign != prev_sign:
                lead_changes += 1
            prev_sign = sign
        max_swing = max(max_swing, abs(diff))
        if first_to_two is None and abs(diff) >= 2:
            first_to_two = 0 if diff > 0 else 1
        if winner_index is not None:
            behind = (p2 - p1) if winner_index == 0 else (p1 - p2)
            winner_max_behind = max(winner_max_behind, behind)

    final_life = life_series[-1]
    turn_count = summary["turn_count"]
    max_turns = summary["config"]["max_turns"]
    if summary.get("draw"):
        ending = "draw"
    elif min(final_life) <= 0:
        ending = "lifeout"
    elif turn_count >= max_turns:
        ending = "turn_limit"
    else:
        ending = "resource"  # 山札・手札・場の同時枯渇による強制決着

    return {
        "turns": turn_count,
        "first_player_won": winner == "player_1",
        "has_winner": winner_index is not None,
        "first_damage_turn": first_damage_turn,
        "lead_changes": lead_changes,
        "winner_max_behind": winner_max_behind,
        "max_swing": max_swing,
        "first_to_two": first_to_two,
        "first_to_two_won": (first_to_two == winner_index) if (first_to_two is not None and winner_index is not None) else None,
        "ending": ending,
    }


def main() -> int:
    dirs = [Path(arg) for arg in sys.argv[1:]]
    if not dirs:
        print(__doc__)
        return 1

    rows = []
    for sim_dir in dirs:
        with (sim_dir / "matches.jsonl").open() as handle:
            for line in handle:
                row = collect(json.loads(line))
                if row:
                    rows.append(row)
    if not rows:
        print("試合データがありません")
        return 1

    games = len(rows)
    decided = [r for r in rows if r["has_winner"]]
    first_damage = [r["first_damage_turn"] for r in rows if r["first_damage_turn"] is not None]
    two_lead = [r for r in rows if r["first_to_two_won"] is not None]
    comeback = sum(1 for r in decided if r["winner_max_behind"] >= 2)
    endings = {}
    for r in rows:
        endings[r["ending"]] = endings.get(r["ending"], 0) + 1

    print(f"試合数: {games}")
    print(f"平均ターン: {mean(r['turns'] for r in rows):.1f} / 中央値 {median(r['turns'] for r in rows):.0f}")
    print(f"先攻勝率: {sum(r['first_player_won'] for r in decided) / len(decided) * 100:.1f}%")
    if first_damage:
        print(f"先制ダメージ手番（中央値）: {median(first_damage):.0f}")
    print(f"リード交代あり: {sum(1 for r in rows if r['lead_changes'] >= 1) / games * 100:.1f}% / 平均交代 {mean(r['lead_changes'] for r in rows):.2f} 回")
    print(f"2点ビハインドからの逆転勝ち: {comeback / len(decided) * 100:.1f}%")
    if two_lead:
        print(f"先に2点差をつけた側の勝率: {sum(r['first_to_two_won'] for r in two_lead) / len(two_lead) * 100:.1f}%")
    print(f"最大スイング3点以上: {sum(1 for r in rows if r['max_swing'] >= 3) / games * 100:.1f}%（4点以上 {sum(1 for r in rows if r['max_swing'] >= 4) / games * 100:.1f}%）")
    print("決着形態: " + " / ".join(f"{key} {count / games * 100:.1f}%" for key, count in sorted(endings.items())))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
