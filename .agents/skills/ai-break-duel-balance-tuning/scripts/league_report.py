#!/usr/bin/env python3
"""リーグ出力（league-summary.json）からデッキ別勝率と先攻勝率を集計し、合格基準を判定する。

使い方:
    python3 league_report.py tmp/league-A-42001 tmp/league-A-42002 ...

複数ディレクトリ（= 複数シード）を渡すと平均も表示する。
合格基準（docs/design-principles.md 3 節）:
    - 単色 4 デッキ（fire/water/wind/earth）が 45-55%
    - 先攻勝率 48-52%
"""
from __future__ import annotations

import json
import sys
from collections import Counter
from pathlib import Path

MONO_DECKS = ("fire", "water", "wind", "earth")
MONO_RANGE = (0.45, 0.55)
FIRST_PLAYER_RANGE = (0.48, 0.52)


def report(league_dir: Path) -> tuple[dict[str, float], float]:
    summary = json.loads((league_dir / "league-summary.json").read_text())
    wins: Counter[str] = Counter()
    games: Counter[str] = Counter()
    fp_wins = 0
    fp_games = 0
    for pair in summary["pairs"]:
        pair_summary = pair["summary"]
        first, second = pair["first_deck"], pair["second_deck"]
        w1 = pair_summary["wins"].get("player_1", 0)
        w2 = pair_summary["wins"].get("player_2", 0)
        total = pair_summary["games"]
        wins[first] += w1
        wins[second] += w2
        games[first] += total
        games[second] += total
        fp_wins += w1
        fp_games += total
    rates = {deck: wins[deck] / games[deck] for deck in sorted(games)}
    return rates, fp_wins / fp_games


def main() -> int:
    dirs = [Path(arg) for arg in sys.argv[1:]]
    if not dirs:
        print(__doc__)
        return 1

    all_rates: list[dict[str, float]] = []
    all_fp: list[float] = []
    for league_dir in dirs:
        rates, fp = report(league_dir)
        all_rates.append(rates)
        all_fp.append(fp)
        print(f"== {league_dir}")
        for deck, rate in rates.items():
            mark = ""
            if deck in MONO_DECKS and not (MONO_RANGE[0] <= rate <= MONO_RANGE[1]):
                mark = "  <-- 基準外 (45-55%)"
            print(f"  {deck}: {rate * 100:.1f}%{mark}")
        fp_mark = "" if FIRST_PLAYER_RANGE[0] <= fp <= FIRST_PLAYER_RANGE[1] else "  <-- 基準外 (48-52%)"
        print(f"  first_player: {fp * 100:.1f}%{fp_mark}")

    if len(dirs) > 1:
        decks = sorted({deck for rates in all_rates for deck in rates})
        print(f"== 平均（{len(dirs)} シード）")
        failures = []
        for deck in decks:
            avg = sum(rates.get(deck, 0.0) for rates in all_rates) / len(all_rates)
            mark = ""
            if deck in MONO_DECKS and not (MONO_RANGE[0] <= avg <= MONO_RANGE[1]):
                mark = "  <-- 基準外 (45-55%)"
                failures.append(deck)
            print(f"  {deck}: {avg * 100:.1f}%{mark}")
        fp_avg = sum(all_fp) / len(all_fp)
        fp_ok = FIRST_PLAYER_RANGE[0] <= fp_avg <= FIRST_PLAYER_RANGE[1]
        print(f"  first_player: {fp_avg * 100:.1f}%{'' if fp_ok else '  <-- 基準外 (48-52%)'}")
        print(f"== 判定: {'PASS' if not failures and fp_ok else 'CHECK NEEDED'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
