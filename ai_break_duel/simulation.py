from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
from pathlib import Path
import json
from statistics import mean, median
from typing import Any

from .cards import DeckArchetype
from .ai import choose_action
from .engine import (
    apply_action,
    end_turn,
    finish_if_turn_limit_reached,
    new_game,
    result_summary,
    start_turn,
)
from .models import GameConfig


@dataclass(frozen=True)
class MatchResult:
    summary: dict[str, Any]
    log: list[dict[str, Any]]


def run_match(
    seed: int,
    config: GameConfig | None = None,
    decks: tuple[DeckArchetype, DeckArchetype] | None = None,
) -> MatchResult:
    state = new_game(seed, config, decks)
    while state.winner is None and not state.draw:
        start_turn(state)
        while state.actions_remaining > 0 and state.winner is None and not state.draw:
            action = choose_action(state)
            apply_action(state, action)
        if state.winner is None and not state.draw:
            end_turn(state)
            finish_if_turn_limit_reached(state)
    return MatchResult(summary=result_summary(state), log=state.log)


def run_simulation(
    games: int,
    seed: int,
    out_dir: Path | None = None,
    config: GameConfig | None = None,
    decks: tuple[DeckArchetype, DeckArchetype] | None = None,
) -> dict[str, Any]:
    results = [run_match(seed + offset, config, decks) for offset in range(games)]
    summaries = [result.summary for result in results]
    summary = summarize_results(summaries, seed)

    if out_dir is not None:
        out_dir.mkdir(parents=True, exist_ok=True)
        (out_dir / "summary.json").write_text(
            json.dumps(summary, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        with (out_dir / "matches.jsonl").open("w", encoding="utf-8") as fp:
            for result in results:
                fp.write(
                    json.dumps(
                        {"summary": result.summary, "log": result.log},
                        ensure_ascii=False,
                    )
                    + "\n"
                )

    return summary


def run_league(
    games_per_pair: int,
    seed: int,
    out_dir: Path | None = None,
    config: GameConfig | None = None,
    decks: tuple[DeckArchetype, ...] = (
        DeckArchetype.FIRE,
        DeckArchetype.WATER,
        DeckArchetype.WIND,
        DeckArchetype.EARTH,
    ),
) -> dict[str, Any]:
    if games_per_pair <= 0:
        raise ValueError("games_per_pair must be positive.")
    if len(decks) < 2:
        raise ValueError("At least two decks are required.")

    standings: dict[str, dict[str, int]] = {
        deck.value: {"wins": 0, "losses": 0, "draws": 0, "games": 0}
        for deck in decks
    }
    pair_results = []
    current_seed = seed

    for first in decks:
        for second in decks:
            if first == second:
                continue
            summaries = []
            for _ in range(games_per_pair):
                result = run_match(current_seed, config, (first, second))
                current_seed += 1
                summaries.append(result.summary)

                first_row = standings[first.value]
                second_row = standings[second.value]
                first_row["games"] += 1
                second_row["games"] += 1
                if result.summary["winner"] == "player_1":
                    first_row["wins"] += 1
                    second_row["losses"] += 1
                elif result.summary["winner"] == "player_2":
                    second_row["wins"] += 1
                    first_row["losses"] += 1
                else:
                    first_row["draws"] += 1
                    second_row["draws"] += 1

            pair_results.append(
                {
                    "first_deck": first.value,
                    "second_deck": second.value,
                    "summary": summarize_results(summaries, current_seed - games_per_pair),
                }
            )

    league = {
        "seed": seed,
        "games_per_ordered_pair": games_per_pair,
        "total_games": games_per_pair * len(decks) * (len(decks) - 1),
        "decks": [deck.value for deck in decks],
        "standings": _standings_with_rates(standings),
        "pairs": pair_results,
    }

    if out_dir is not None:
        out_dir.mkdir(parents=True, exist_ok=True)
        (out_dir / "league-summary.json").write_text(
            json.dumps(league, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )

    return league


def summarize_results(summaries: list[dict[str, Any]], seed: int) -> dict[str, Any]:
    if not summaries:
        raise ValueError("At least one game is required.")

    winners = Counter(summary["winner"] for summary in summaries)
    winner_counts = {
        player_name: count for player_name, count in winners.items() if player_name is not None
    }
    non_draws = [summary for summary in summaries if not summary["draw"]]
    turn_counts = [summary["turn_count"] for summary in summaries]
    successful_defenses = sum(summary["successful_defenses"] for summary in summaries)
    failed_defenses = sum(summary["failed_defenses"] for summary in summaries)
    undefended_attacks = sum(summary["undefended_attacks"] for summary in summaries)
    attacks = sum(summary["attacks"] for summary in summaries)
    total_defense_events = successful_defenses + failed_defenses + undefended_attacks

    first_player_wins = winners["player_1"]
    decisive_games = len(non_draws)
    one_sided_games = sum(
        1
        for summary in non_draws
        if max(summary["player_1_final_life"], summary["player_2_final_life"]) >= 4
    )

    return {
        "seed": seed,
        "config": summaries[0]["config"],
        "games": len(summaries),
        "wins": winner_counts,
        "draws": winners[None],
        "first_player_win_rate": _rate(first_player_wins, decisive_games),
        "average_turns": mean(turn_counts),
        "median_turns": median(turn_counts),
        "average_life_difference": mean(
            abs(summary["player_1_final_life"] - summary["player_2_final_life"])
            for summary in summaries
        ),
        "defense_success_rate": _rate(successful_defenses, total_defense_events),
        "defense_failure_rate": _rate(failed_defenses, total_defense_events),
        "undefended_attack_rate": _rate(undefended_attacks, total_defense_events),
        "average_ai_lost": mean(
            summary["player_1_ai_lost"] + summary["player_2_ai_lost"]
            for summary in summaries
        ),
        "average_cards_drawn": mean(
            summary["player_1_cards_drawn"] + summary["player_2_cards_drawn"]
            for summary in summaries
        ),
        "average_final_hand_size": mean(
            sum(summary["final_hand_sizes"]) / 2 for summary in summaries
        ),
        "one_sided_game_rate": _rate(one_sided_games, decisive_games),
        "attacks": attacks,
        "successful_defenses": successful_defenses,
        "failed_defenses": failed_defenses,
        "undefended_attacks": undefended_attacks,
        "attack_by_attribute": _merge_nested_counter(
            summary["attack_by_attribute"] for summary in summaries
        ),
        "card_usage": _merge_nested_counter(summary["card_usage"] for summary in summaries),
    }


def _rate(numerator: int, denominator: int) -> float | None:
    if denominator == 0:
        return None
    return numerator / denominator


def _merge_nested_counter(items: Any) -> dict[str, dict[str, int]]:
    merged: dict[str, Counter[str]] = {}
    for item in items:
        for key, values in item.items():
            counter = merged.setdefault(key, Counter())
            counter.update(values)
    return {key: dict(counter) for key, counter in sorted(merged.items())}


def _standings_with_rates(standings: dict[str, dict[str, int]]) -> dict[str, dict[str, Any]]:
    rows = {}
    for deck, values in standings.items():
        decisive_games = values["wins"] + values["losses"]
        rows[deck] = {
            **values,
            "win_rate": _rate(values["wins"], decisive_games),
        }
    return dict(
        sorted(
            rows.items(),
            key=lambda item: (
                item[1]["win_rate"] is None,
                -(item[1]["win_rate"] or 0),
                item[0],
            ),
        )
    )
