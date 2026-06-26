from __future__ import annotations

import argparse
import json
import random
import sys
from copy import deepcopy
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from ai_break_duel import ai as ai_module
from ai_break_duel.cards import DeckArchetype
from ai_break_duel.models import AiProfile, GameConfig
from ai_break_duel.simulation import run_match


DECKS = (
    DeckArchetype.BREAK,
    DeckArchetype.CONTROL,
    DeckArchetype.FIRE,
    DeckArchetype.WATER,
    DeckArchetype.WIND,
    DeckArchetype.EARTH,
    DeckArchetype.APEX,
)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--iterations", type=int, default=24)
    parser.add_argument("--games-per-seat", type=int, default=12)
    parser.add_argument("--seed", type=int, default=730001)
    parser.add_argument("--out", type=Path, default=Path("tmp/ai-profile-tuning.json"))
    args = parser.parse_args()

    rng = random.Random(args.seed)
    baseline = deepcopy(ai_module.CHALLENGER_WEIGHTS)
    candidates = [baseline]
    for _ in range(args.iterations):
        candidates.append(_mutate_weights(baseline, rng))

    results = []
    for index, weights in enumerate(candidates):
        ai_module.CHALLENGER_WEIGHTS.clear()
        ai_module.CHALLENGER_WEIGHTS.update(weights)
        result = evaluate_candidate(weights, args.games_per_seat, args.seed + index * 10000)
        result["candidate_index"] = index
        results.append(result)

    ai_module.CHALLENGER_WEIGHTS.clear()
    ai_module.CHALLENGER_WEIGHTS.update(baseline)

    results.sort(key=lambda item: item["fitness"], reverse=True)
    report = {
        "seed": args.seed,
        "iterations": args.iterations,
        "games_per_seat": args.games_per_seat,
        "best": results[0],
        "top_5": results[:5],
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


def _mutate_weights(base: dict[str, int], rng: random.Random) -> dict[str, int]:
    weights = deepcopy(base)
    for key, value in weights.items():
        if rng.random() < 0.72:
            factor = rng.uniform(0.72, 1.32)
            mutated = round(value * factor)
            weights[key] = min(-1, mutated) if value < 0 else max(1, mutated)
    return weights


def evaluate_candidate(weights: dict[str, int], games_per_seat: int, seed: int) -> dict[str, Any]:
    beginner_rates = _profile_rates("challenger", "beginner", games_per_seat, seed)
    classic_rates = _profile_rates("challenger", "classic", games_per_seat, seed + 500000)
    beginner_floor = min(beginner_rates.values())
    classic_floor = min(classic_rates.values())
    beginner_average = sum(beginner_rates.values()) / len(beginner_rates)
    classic_average = sum(classic_rates.values()) / len(classic_rates)
    fitness = (
        beginner_average * 350
        + beginner_floor * 250
        + classic_average * 250
        + classic_floor * 150
    )
    return {
        "fitness": fitness,
        "weights": weights,
        "beginner_average": beginner_average,
        "beginner_floor": beginner_floor,
        "classic_average": classic_average,
        "classic_floor": classic_floor,
        "beginner_rates": beginner_rates,
        "classic_rates": classic_rates,
    }


def _profile_rates(
    challenger: AiProfile,
    opponent: AiProfile,
    games_per_seat: int,
    seed: int,
) -> dict[str, float]:
    rates = {}
    current_seed = seed
    for deck in DECKS:
        challenger_wins = 0
        total = 0
        for challenger_is_first in (True, False):
            config = GameConfig(
                ai_profiles=(challenger, opponent)
                if challenger_is_first
                else (opponent, challenger)
            )
            decks = (deck, deck)
            for _ in range(games_per_seat):
                result = run_match(current_seed, config, decks)
                current_seed += 1
                winner = result.summary["winner"]
                if winner == ("player_1" if challenger_is_first else "player_2"):
                    challenger_wins += 1
                total += 1
        rates[deck.value] = challenger_wins / total if total else 0
    return rates


if __name__ == "__main__":
    main()
