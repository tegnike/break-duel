#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from random import Random
from statistics import mean, median
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(REPO_ROOT))

from ai_break_duel.ai import choose_action
from ai_break_duel.cards import CARD_BY_ID, DeckArchetype, build_deck
from ai_break_duel.engine import (
    apply_action,
    end_turn,
    finish_if_turn_limit_reached,
    result_summary,
    start_turn,
)
from ai_break_duel.models import GameConfig, GameState, PlayerState


POWER_CARD_IDS: dict[int, tuple[str, ...]] = {
    1: (
        "AI-FIRE-1",
        "AI-FIRE-1B",
        "AI-FIRE-1C",
        "AI-WATER-1",
        "AI-WATER-1B",
        "AI-WATER-1C",
        "AI-WIND-1",
        "AI-WIND-1B",
        "AI-EARTH-1",
        "AI-EARTH-1B",
    ),
    2: (
        "AI-FIRE-2",
        "AI-FIRE-2B",
        "AI-WATER-2",
        "AI-WATER-2B",
        "AI-WIND-2",
        "AI-WIND-2B",
        "AI-WIND-2C",
        "AI-EARTH-2",
        "AI-EARTH-2B",
        "AI-EARTH-2C",
    ),
    3: (
        "AI-FIRE-3",
        "AI-FIRE-3B",
        "AI-WATER-3",
        "AI-WATER-3B",
        "AI-WIND-3",
        "AI-WIND-3B",
        "AI-EARTH-3",
        "AI-EARTH-3B",
    ),
    4: (
        "AI-FIRE-4",
        "AI-FIRE-4B",
        "AI-WATER-4",
        "AI-WATER-4B",
        "AI-WIND-4",
        "AI-WIND-4B",
        "AI-EARTH-4",
        "AI-EARTH-4B",
    ),
}

LOW_COST_CARD_IDS = (
    "AI-FIRE-1",
    "AI-FIRE-1B",
    "AI-FIRE-1C",
    "AI-FIRE-2",
    "AI-FIRE-2B",
    "AI-WATER-1",
    "AI-WATER-1B",
    "AI-WATER-1C",
    "AI-WATER-2",
    "AI-WATER-2B",
    "AI-WIND-1",
    "AI-WIND-1B",
    "AI-WIND-2",
    "AI-WIND-2B",
    "AI-WIND-2C",
    "AI-EARTH-1",
    "AI-EARTH-1B",
    "AI-EARTH-2",
    "AI-EARTH-2B",
    "AI-EARTH-2C",
    "AI-FIRE-1",
    "AI-WATER-1",
    "AI-WIND-1",
    "AI-EARTH-1",
)

MID_COST_CARD_IDS = (
    "AI-FIRE-3",
    "AI-FIRE-3B",
    "AI-WATER-3",
    "AI-WATER-3B",
    "AI-WIND-3",
    "AI-WIND-3B",
    "AI-EARTH-3",
    "AI-EARTH-3B",
    "AI-FIRE-2",
    "AI-FIRE-2B",
    "AI-WATER-2",
    "AI-WATER-2B",
    "AI-WIND-2",
    "AI-WIND-2B",
    "AI-WIND-2C",
    "AI-EARTH-2",
    "AI-EARTH-2B",
    "AI-EARTH-2C",
    "AI-FIRE-2",
    "AI-WATER-2",
)

HIGH_COST_CARD_IDS = (
    "AI-FIRE-3",
    "AI-FIRE-3B",
    "AI-FIRE-4",
    "AI-FIRE-4B",
    "AI-WATER-3",
    "AI-WATER-3B",
    "AI-WATER-4",
    "AI-WATER-4B",
    "AI-WIND-3",
    "AI-WIND-3B",
    "AI-WIND-4",
    "AI-WIND-4B",
    "AI-EARTH-3",
    "AI-EARTH-3B",
    "AI-EARTH-4",
    "AI-EARTH-4B",
    "AI-FIRE-3",
    "AI-WATER-3",
    "AI-WIND-3",
    "AI-EARTH-3",
)

SUPPORT_CARD_IDS = (
    "CMD-DISRUPT",
    "CMD-SANDBOX",
    "CMD-TRINITY",
    "CMD-OPTIMIZE",
    "MEM-CACHE",
    "MEM-FIREWALL",
)
FILLER_SUMMON_CARD_IDS = POWER_CARD_IDS[2] + POWER_CARD_IDS[1]

EXISTING_DECKS = (
    DeckArchetype.BREAK,
    DeckArchetype.CONTROL,
    DeckArchetype.FIRE,
    DeckArchetype.WATER,
    DeckArchetype.WIND,
    DeckArchetype.EARTH,
)

CANDIDATES: dict[str, tuple[str, tuple[str, ...]]] = {
    "p1": ("power 1 summon slots", POWER_CARD_IDS[1] * 3),
    "p2": ("power 2 summon slots", POWER_CARD_IDS[2] * 3),
    "p3": ("power 3 summon slots", POWER_CARD_IDS[3] * 3),
    "p4": ("power 4 summon slots", POWER_CARD_IDS[4] * 3),
    "p1_2": ("power 1-2 summon slots", LOW_COST_CARD_IDS),
    "p2_3": ("power 2-3 summon slots", MID_COST_CARD_IDS),
    "p3_4": ("power 3-4 summon slots", HIGH_COST_CARD_IDS),
}


@dataclass(frozen=True)
class EvalConfig:
    games_per_order: int
    seed: int
    max_turns: int


def twenty_cards(card_ids: tuple[str, ...]) -> tuple[str, ...]:
    summon_ids: list[str] = []
    high_power_seen: set[str] = set()
    low_power_counts: Counter[str] = Counter()
    for card_id in (*card_ids, *FILLER_SUMMON_CARD_IDS):
        card = CARD_BY_ID[card_id]
        if (card.power or 0) >= 3:
            if card_id in high_power_seen:
                continue
            high_power_seen.add(card_id)
        else:
            if low_power_counts[card_id] >= 2:
                continue
            low_power_counts[card_id] += 1
        summon_ids.append(card_id)
        if len(summon_ids) == 14:
            return tuple(summon_ids) + SUPPORT_CARD_IDS
    raise ValueError("Unable to build a 14 summon stress deck.")


def cards_from_ids(card_ids: tuple[str, ...]):
    return [CARD_BY_ID[card_id] for card_id in card_ids]


def new_custom_game(seed: int, first_deck, second_deck, config: GameConfig) -> GameState:
    rng = Random(seed)
    players = [
        PlayerState(name="player_1", life=config.life),
        PlayerState(name="player_2", life=config.life),
    ]
    for index, (player, source_deck) in enumerate(zip(players, (first_deck, second_deck))):
        deck = list(source_deck)
        rng.shuffle(deck)
        player.deck = deck
        initial_hand = (
            config.first_player_initial_hand
            if index == 0
            else config.second_player_initial_hand
        )
        player.draw(initial_hand or config.initial_hand, rng)
    state = GameState(seed=seed, rng=rng, players=players, config=config)
    state.log.append({"event": "setup", "seed": seed})
    return state


def run_match(seed: int, first_deck, second_deck, config: GameConfig) -> dict[str, Any]:
    state = new_custom_game(seed, first_deck, second_deck, config)
    while state.winner is None and not state.draw:
        start_turn(state)
        while state.actions_remaining > 0 and state.winner is None and not state.draw:
            apply_action(state, choose_action(state))
        if state.winner is None and not state.draw:
            end_turn(state)
            finish_if_turn_limit_reached(state)
    return result_summary(state)


def evaluate_candidate(
    candidate_key: str,
    card_ids: tuple[str, ...],
    eval_config: EvalConfig,
) -> dict[str, Any]:
    config = GameConfig(max_turns=eval_config.max_turns)
    candidate_deck = cards_from_ids(twenty_cards(card_ids))
    current_seed = eval_config.seed
    wins = Counter()
    per_opponent = {}
    turns = []
    life_diffs = []

    for archetype in EXISTING_DECKS:
        existing_deck = build_deck(archetype)
        pair = Counter()
        for candidate_is_first in (True, False):
            for _ in range(eval_config.games_per_order):
                if candidate_is_first:
                    summary = run_match(current_seed, candidate_deck, existing_deck, config)
                    candidate_won = summary["winner"] == "player_1"
                else:
                    summary = run_match(current_seed, existing_deck, candidate_deck, config)
                    candidate_won = summary["winner"] == "player_2"

                if summary["winner"] is None:
                    pair["draws"] += 1
                    wins["draws"] += 1
                elif candidate_won:
                    pair["candidate_wins"] += 1
                    wins["candidate_wins"] += 1
                else:
                    pair["existing_wins"] += 1
                    wins["existing_wins"] += 1

                turns.append(summary["turn_count"])
                life_diffs.append(
                    abs(summary["player_1_final_life"] - summary["player_2_final_life"])
                )
                current_seed += 1

        pair_games = sum(pair.values())
        per_opponent[archetype.value] = {
            "candidate_win_rate": pair["candidate_wins"] / pair_games,
            "candidate_wins": pair["candidate_wins"],
            "existing_wins": pair["existing_wins"],
            "draws": pair["draws"],
            "games": pair_games,
        }

    total_games = sum(wins.values())
    return {
        "candidate": candidate_key,
        "games": total_games,
        "candidate_win_rate": wins["candidate_wins"] / total_games,
        "existing_win_rate": wins["existing_wins"] / total_games,
        "draw_rate": wins["draws"] / total_games,
        "candidate_wins": wins["candidate_wins"],
        "existing_wins": wins["existing_wins"],
        "draws": wins["draws"],
        "average_turns": mean(turns),
        "median_turns": median(turns),
        "average_life_difference": mean(life_diffs),
        "per_opponent": per_opponent,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run AI Break Duel biased-cost deck balance checks.",
    )
    parser.add_argument(
        "--candidate",
        choices=sorted(CANDIDATES),
        action="append",
        help="Candidate to run. Repeat for multiple. Defaults to all candidates.",
    )
    parser.add_argument("--games-per-order", type=int, default=1000)
    parser.add_argument("--seed", type=int, default=3_000_000)
    parser.add_argument("--max-turns", type=int, default=60)
    parser.add_argument("--threshold", type=float, default=0.5)
    parser.add_argument("--json", action="store_true", help="Print JSON only.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    selected = args.candidate or sorted(CANDIDATES)
    results = []
    seed = args.seed
    for key in selected:
        _, card_ids = CANDIDATES[key]
        result = evaluate_candidate(
            key,
            card_ids,
            EvalConfig(
                games_per_order=args.games_per_order,
                seed=seed,
                max_turns=args.max_turns,
            ),
        )
        results.append(result)
        seed += args.games_per_order * len(EXISTING_DECKS) * 2 + 10_000

    output = {
        "seed": args.seed,
        "games_per_order": args.games_per_order,
        "max_turns": args.max_turns,
        "threshold": args.threshold,
        "results": results,
    }
    if args.json:
        print(json.dumps(output, ensure_ascii=False, indent=2))
    else:
        print(
            f"seed={args.seed} games_per_order={args.games_per_order} "
            f"threshold={args.threshold:.3f}"
        )
        for result in results:
            label = CANDIDATES[result["candidate"]][0]
            status = "RISK" if result["candidate_win_rate"] > args.threshold else "OK"
            print(
                f"{result['candidate']:>4} {label:<18} "
                f"win_rate={result['candidate_win_rate']:.4f} "
                f"wins={result['candidate_wins']}/{result['games']} {status}"
            )
            rates = ", ".join(
                f"{deck}:{values['candidate_win_rate']:.3f}"
                for deck, values in result["per_opponent"].items()
            )
            print(f"     by_opponent {rates}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
