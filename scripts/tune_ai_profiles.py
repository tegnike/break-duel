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
from ai_break_duel.ai import can_use_charge, choose_action
from ai_break_duel.cards import DeckArchetype
from ai_break_duel.engine import (
    apply_action,
    end_turn,
    finish_if_turn_limit_reached,
    new_game,
    start_turn,
)
from ai_break_duel.models import ActionType, AiProfile, GameConfig
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
    parser.add_argument(
        "--base-json",
        type=Path,
        default=None,
        help="Optional JSON file with a weights dict to mutate from (defaults to current CHALLENGER_WEIGHTS).",
    )
    args = parser.parse_args()

    rng = random.Random(args.seed)
    baseline = deepcopy(ai_module.CHALLENGER_WEIGHTS)
    mutation_base = baseline
    if args.base_json is not None:
        mutation_base = json.loads(args.base_json.read_text(encoding="utf-8"))
        missing = set(baseline) - set(mutation_base)
        if missing:
            raise SystemExit(f"--base-json is missing weight keys: {sorted(missing)}")

    candidates: list[dict[str, int]] = []
    if mutation_base is not baseline:
        candidates.append(deepcopy(mutation_base))
    while len(candidates) < args.iterations:
        candidates.append(_mutate_weights(mutation_base, rng))

    results = []
    try:
        for index, weights in enumerate(candidates):
            result = evaluate_candidate(
                weights, baseline, args.games_per_seat, args.seed + index * 100000
            )
            result["candidate_index"] = index
            results.append(result)
            print(
                f"candidate {index:03d}: h2h_vs_baseline={result['head_to_head_win_rate']:.3f} "
                f"floor={result['head_to_head_floor']:.3f}",
                file=sys.stderr,
            )
        results.sort(key=lambda item: item["fitness"], reverse=True)

        best = results[0]
        _set_weights(best["weights"])
        best["sanity_beginner_rates"] = _profile_rates(
            "challenger", "beginner", args.games_per_seat, args.seed + 77000000
        )
        best["sanity_classic_rates"] = _profile_rates(
            "challenger", "classic", args.games_per_seat, args.seed + 78000000
        )
    finally:
        _set_weights(baseline)

    report = {
        "seed": args.seed,
        "iterations": args.iterations,
        "games_per_seat": args.games_per_seat,
        "fitness_note": "fitness = head_to_head_win_rate + 0.15 * head_to_head_floor (candidate vs baseline weights, mirror decks, both seats)",
        "baseline_weights": baseline,
        "best": results[0],
        "top_5": results[:5],
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


def _set_weights(weights: dict[str, int]) -> None:
    ai_module.CHALLENGER_WEIGHTS.clear()
    ai_module.CHALLENGER_WEIGHTS.update(weights)


def _mutate_weights(base: dict[str, int], rng: random.Random) -> dict[str, int]:
    weights = deepcopy(base)
    keys = rng.sample(sorted(weights), k=rng.randint(2, 5))
    for key in keys:
        value = weights[key]
        factor = rng.uniform(0.65, 1.40)
        mutated = round(value * factor)
        weights[key] = min(-1, mutated) if value < 0 else max(1, mutated)
    return weights


def evaluate_candidate(
    weights: dict[str, int],
    baseline: dict[str, int],
    games_per_seat: int,
    seed: int,
) -> dict[str, Any]:
    per_deck: dict[str, float] = {}
    total_wins = 0
    total_games = 0
    current_seed = seed
    for deck in DECKS:
        wins = 0
        games = 0
        for candidate_is_first in (True, False):
            first_weights = weights if candidate_is_first else baseline
            second_weights = baseline if candidate_is_first else weights
            for _ in range(games_per_seat):
                winner = run_head_to_head(
                    current_seed, deck, first_weights, second_weights
                )
                current_seed += 1
                if winner is None:
                    continue
                games += 1
                if winner == (0 if candidate_is_first else 1):
                    wins += 1
        per_deck[deck.value] = wins / games if games else 0.0
        total_wins += wins
        total_games += games

    head_to_head = total_wins / total_games if total_games else 0.0
    floor = min(per_deck.values())
    return {
        "fitness": head_to_head + 0.15 * floor,
        "head_to_head_win_rate": head_to_head,
        "head_to_head_floor": floor,
        "head_to_head_by_deck": per_deck,
        "weights": weights,
    }


def run_head_to_head(
    seed: int,
    deck: DeckArchetype,
    first_weights: dict[str, int],
    second_weights: dict[str, int],
) -> int | None:
    """Run one challenger-vs-challenger match where each seat uses its own weights.

    CHALLENGER_WEIGHTS only influences the active player's action scoring, so
    swapping the module-level dict before every decision gives each seat an
    independent evaluation function.
    """
    config = GameConfig(ai_profiles=("challenger", "challenger"))
    state = new_game(seed, config, (deck, deck))
    weights_by_player = (first_weights, second_weights)
    while state.winner is None and not state.draw:
        start_turn(state)
        while (
            (state.actions_remaining > 0 or can_use_charge(state))
            and state.winner is None
            and not state.draw
        ):
            _set_weights(weights_by_player[state.active_player])
            action = choose_action(state)
            apply_action(state, action)
            if action.type == ActionType.END_TURN:
                break
        if state.winner is None and not state.draw:
            end_turn(state)
            finish_if_turn_limit_reached(state)
    return state.winner


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
