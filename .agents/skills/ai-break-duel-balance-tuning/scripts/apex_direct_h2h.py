"""Fixed-deck direct head-to-head check for a specific apex candidate.

tune_apex_deck.py regenerates a random candidate pool per seed, so a candidate
that beats current apex in one run cannot be re-tested by name in another run.
This script pins two exact card-id lists and runs many challenger-vs-challenger
games (both orders) across a chosen seed, so a promising candidate found by
tune_apex_deck.py can be validated across multiple independent seeds before a
replacement decision (per SKILL.md 2f: only replace on a clear, multi-seed win).

Usage:
    python3 .agents/skills/ai-break-duel-balance-tuning/scripts/apex_direct_h2h.py \
        --candidate-ids AI-FIRE-2,AI-FIRE-2,...,CMD-PATCH \
        --games-per-order 300 --seed 900001
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from ai_break_duel.cards import DeckArchetype, build_deck
from scripts.tune_apex_deck import run_match_with_ids


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--candidate-ids", required=True, help="comma-separated 25 card ids")
    parser.add_argument("--games-per-order", type=int, default=200)
    parser.add_argument("--seed", type=int, default=900001)
    args = parser.parse_args()

    current = tuple(card.id for card in build_deck(DeckArchetype.APEX))
    candidate = tuple(args.candidate_ids.split(","))

    cur_wins = cand_wins = draws = 0
    seed = args.seed
    for _ in range(args.games_per_order):
        result = run_match_with_ids(seed, (current, candidate))
        seed += 1
        if result["winner"] == "player_1":
            cur_wins += 1
        elif result["winner"] == "player_2":
            cand_wins += 1
        else:
            draws += 1
    for _ in range(args.games_per_order):
        result = run_match_with_ids(seed, (candidate, current))
        seed += 1
        if result["winner"] == "player_1":
            cand_wins += 1
        elif result["winner"] == "player_2":
            cur_wins += 1
        else:
            draws += 1

    total = cur_wins + cand_wins + draws
    print(json.dumps({
        "seed": args.seed,
        "games_per_order": args.games_per_order,
        "total_games": total,
        "current_apex_wins": cur_wins,
        "candidate_wins": cand_wins,
        "draws": draws,
        "current_apex_win_rate": cur_wins / total,
        "candidate_win_rate": cand_wins / total,
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
