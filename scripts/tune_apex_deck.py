from __future__ import annotations

import argparse
import json
import random
import sys
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from ai_break_duel.ai import CHALLENGER_WEIGHTS, _card_value, choose_action
from ai_break_duel.cards import (
    ACTIVE_CARD_POOL,
    Card,
    CardType,
    DeckArchetype,
    build_deck,
    validate_same_name_limit,
)
from ai_break_duel.engine import (
    apply_action,
    end_turn,
    finish_if_turn_limit_reached,
    result_summary,
    start_turn,
)
from ai_break_duel.models import GameConfig, GameState, PlayerState


AI_SLOTS = 14
EVENT_SLOTS = 4
MEMORY_SLOTS = 2
HIGH_POWER_LIMIT = 4
CARD_COUNT = 20
EXISTING_OPPONENTS = (
    DeckArchetype.BREAK,
    DeckArchetype.CONTROL,
    DeckArchetype.FIRE,
    DeckArchetype.WATER,
    DeckArchetype.WIND,
    DeckArchetype.EARTH,
)


@dataclass(frozen=True)
class Candidate:
    name: str
    card_ids: tuple[str, ...]
    source: str


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--pool-size", type=int, default=220)
    parser.add_argument("--top", type=int, default=4)
    parser.add_argument("--screen-games", type=int, default=8)
    parser.add_argument("--league-games", type=int, default=80)
    parser.add_argument("--seed", type=int, default=810001)
    parser.add_argument("--out", type=Path, default=Path("tmp/apex-tuning.json"))
    args = parser.parse_args()

    rng = random.Random(args.seed)
    current = Candidate(
        name="current_apex",
        card_ids=tuple(card.id for card in build_deck(DeckArchetype.APEX)),
        source="current",
    )
    generated = generate_candidates(args.pool_size, rng, current.card_ids)
    screened = screen_candidates(generated, args.screen_games, args.seed + 10000)
    challengers = [item["candidate"] for item in screened[: args.top]]
    league_decks = [current, *challengers]
    league = run_candidate_league(league_decks, args.league_games, args.seed + 900000)
    best_name = max(
        league["standings"],
        key=lambda name: (league["standings"][name]["win_rate"], league["standings"][name]["wins"]),
    )
    report = {
        "seed": args.seed,
        "pool_size": args.pool_size,
        "screen_games_per_ordered_matchup": args.screen_games,
        "league_games_per_ordered_pair": args.league_games,
        "screen_top": [_public_screen_row(row) for row in screened[:10]],
        "league": league,
        "best": {
            "name": best_name,
            "card_ids": list(next(item.card_ids for item in league_decks if item.name == best_name)),
            "standing": league["standings"][best_name],
        },
        "candidate_decks": [
            {"name": item.name, "source": item.source, "card_ids": list(item.card_ids)}
            for item in league_decks
        ],
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


def generate_candidates(pool_size: int, rng: random.Random, current_apex: tuple[str, ...]) -> list[Candidate]:
    cards = list(ACTIVE_CARD_POOL)
    by_type = {
        CardType.AI: [card for card in cards if card.type == CardType.AI],
        CardType.EVENT: [card for card in cards if card.type == CardType.EVENT],
        CardType.MEMORY: [card for card in cards if card.type == CardType.MEMORY],
    }
    candidates: list[Candidate] = []
    seen = {current_apex}
    attempts = 0
    while len(candidates) < pool_size and attempts < pool_size * 300:
        attempts += 1
        card_ids = (
            weighted_slots(by_type[CardType.AI], AI_SLOTS, rng)
            + weighted_slots(by_type[CardType.EVENT], EVENT_SLOTS, rng)
            + weighted_slots(by_type[CardType.MEMORY], MEMORY_SLOTS, rng)
        )
        if "MEM-RESONATOR" not in card_ids:
            continue
        if not deck_is_legal(card_ids):
            continue
        canonical = tuple(card_ids)
        if canonical in seen:
            continue
        seen.add(canonical)
        candidates.append(Candidate(f"apex_candidate_{len(candidates) + 1:03d}", canonical, "weighted_random"))
    if len(candidates) < pool_size:
        raise RuntimeError(f"only generated {len(candidates)} legal candidates")
    return candidates


def weighted_slots(cards: list[Card], slots: int, rng: random.Random) -> list[str]:
    selected: list[str] = []
    counts: Counter[str] = Counter()
    while len(selected) < slots:
        available = [
            card for card in cards
            if counts[card.id] < 2
            and (card.type != CardType.AI or (card.power or 0) < 3 or counts[card.id] == 0)
        ]
        weights = [max(1.0, _sampling_value(card)) for card in available]
        card = rng.choices(available, weights=weights, k=1)[0]
        selected.append(card.id)
        counts[card.id] += 1
    return selected


def _sampling_value(card: Card) -> float:
    value = _card_value(card)
    if card.type == CardType.EVENT:
        value += {
            "trinity": 82,
            "fire_rite": 64,
            "water_rite": 68,
            "wind_rite": 74,
            "earth_rite": 54,
            "disrupt": 76,
            "sandbox": 80,
            "optimize": 36,
            "relearn": 40,
        }.get(card.effect, 0)
    if card.type == CardType.MEMORY:
        value += 35
    if card.type == CardType.AI and (card.power or 0) >= 3:
        value += 20
    return value


def deck_is_legal(card_ids: tuple[str, ...] | list[str]) -> bool:
    if len(card_ids) != CARD_COUNT:
        return False
    counts = Counter(card_ids)
    if any(count > 2 for count in counts.values()):
        return False
    cards = [card_by_id(card_id) for card_id in card_ids]
    if sum(1 for card in cards if card.type == CardType.AI) != AI_SLOTS:
        return False
    if sum(1 for card in cards if card.type == CardType.EVENT) != EVENT_SLOTS:
        return False
    if sum(1 for card in cards if card.type == CardType.MEMORY) != MEMORY_SLOTS:
        return False
    high_power = [card.id for card in cards if card.type == CardType.AI and (card.power or 0) >= 3]
    if len(high_power) > HIGH_POWER_LIMIT:
        return False
    if len(high_power) != len(set(high_power)):
        return False
    validate_same_name_limit(cards)
    return True


def screen_candidates(candidates: list[Candidate], games: int, seed: int) -> list[dict[str, Any]]:
    rows = []
    current_seed = seed
    for candidate in candidates:
        challenger_wins = 0
        total = 0
        for opponent in EXISTING_OPPONENTS:
            opponent_ids = tuple(card.id for card in build_deck(opponent))
            for candidate_first in (True, False):
                for _ in range(games):
                    decks = (candidate.card_ids, opponent_ids) if candidate_first else (opponent_ids, candidate.card_ids)
                    result = run_match_with_ids(current_seed, decks)
                    current_seed += 1
                    winner = result["winner"]
                    if winner == ("player_1" if candidate_first else "player_2"):
                        challenger_wins += 1
                    total += 1
        rows.append(
            {
                "candidate": candidate,
                "win_rate": challenger_wins / total,
                "wins": challenger_wins,
                "games": total,
            }
        )
    return sorted(rows, key=lambda row: (row["win_rate"], row["wins"]), reverse=True)


def run_candidate_league(candidates: list[Candidate], games: int, seed: int) -> dict[str, Any]:
    standings = {
        candidate.name: {"wins": 0, "losses": 0, "draws": 0, "games": 0}
        for candidate in candidates
    }
    pairs = []
    current_seed = seed
    for first in candidates:
        for second in candidates:
            if first == second:
                continue
            wins = Counter()
            summaries = []
            for _ in range(games):
                result = run_match_with_ids(current_seed, (first.card_ids, second.card_ids))
                current_seed += 1
                summaries.append(result)
                standings[first.name]["games"] += 1
                standings[second.name]["games"] += 1
                if result["winner"] == "player_1":
                    standings[first.name]["wins"] += 1
                    standings[second.name]["losses"] += 1
                    wins[first.name] += 1
                elif result["winner"] == "player_2":
                    standings[second.name]["wins"] += 1
                    standings[first.name]["losses"] += 1
                    wins[second.name] += 1
                else:
                    standings[first.name]["draws"] += 1
                    standings[second.name]["draws"] += 1
                    wins["draw"] += 1
            pairs.append(
                {
                    "first": first.name,
                    "second": second.name,
                    "wins": dict(wins),
                    "average_turns": sum(item["turn_count"] for item in summaries) / len(summaries),
                }
            )
    for values in standings.values():
        decisive = values["wins"] + values["losses"]
        values["win_rate"] = values["wins"] / decisive if decisive else 0
    return {
        "total_games": games * len(candidates) * (len(candidates) - 1),
        "standings": dict(sorted(standings.items(), key=lambda item: item[1]["win_rate"], reverse=True)),
        "pairs": pairs,
    }


def run_match_with_ids(seed: int, decks: tuple[tuple[str, ...], tuple[str, ...]]) -> dict[str, Any]:
    rng = random.Random(seed)
    config = GameConfig(ai_profiles=("challenger", "challenger"))
    players = [
        PlayerState(name="player_1", life=config.life),
        PlayerState(name="player_2", life=config.life),
    ]
    for index, player in enumerate(players):
        deck = [card_by_id(card_id) for card_id in decks[index]]
        validate_same_name_limit(deck)
        rng.shuffle(deck)
        player.deck = deck
        initial_hand = config.first_player_initial_hand if index == 0 else config.second_player_initial_hand
        player.draw(initial_hand or config.initial_hand, rng)
    state = GameState(seed=seed, rng=rng, players=players, config=config)
    while state.winner is None and not state.draw:
        start_turn(state)
        while state.winner is None and not state.draw:
            if state.actions_remaining <= 0 and not any_actionless_charge_possible(state):
                break
            action = choose_action(state, "challenger")
            apply_action(state, action)
            if action.type.value == "end_turn":
                break
        if state.winner is None and not state.draw:
            end_turn(state)
            finish_if_turn_limit_reached(state)
    return result_summary(state)


def any_actionless_charge_possible(state: GameState) -> bool:
    from ai_break_duel.ai import can_use_charge

    return can_use_charge(state)


def card_by_id(card_id: str) -> Card:
    return next(card for card in ACTIVE_CARD_POOL if card.id == card_id)


def _public_screen_row(row: dict[str, Any]) -> dict[str, Any]:
    candidate = row["candidate"]
    return {
        "name": candidate.name,
        "win_rate": row["win_rate"],
        "wins": row["wins"],
        "games": row["games"],
        "card_ids": list(candidate.card_ids),
    }


if __name__ == "__main__":
    main()
