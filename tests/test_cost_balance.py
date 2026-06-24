from __future__ import annotations

from random import Random
import unittest

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


EXISTING_DECKS = (
    DeckArchetype.BREAK,
    DeckArchetype.CONTROL,
    DeckArchetype.FIRE,
    DeckArchetype.WATER,
    DeckArchetype.WIND,
    DeckArchetype.EARTH,
)

POWER_CARD_IDS = {
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

BALANCE_CONFIG = GameConfig(max_turns=60)
BALANCE_GAMES_PER_ORDERED_MATCHUP = 500
MAX_COST_BUCKET_WIN_RATE = 0.5


def synthetic_twenty_card_deck(card_ids: tuple[str, ...]) -> tuple[str, ...]:
    """Build a 20-card stress deck from one cost bucket.

    These decks intentionally stress one cost band rather than modeling a legal
    deck-workshop list. There are only eight unique summon IDs per power.
    """

    return (card_ids * 3)[:20]


def cards_from_ids(card_ids: tuple[str, ...]):
    return [CARD_BY_ID[card_id] for card_id in card_ids]


def run_custom_match(seed: int, first_deck, second_deck) -> dict:
    rng = Random(seed)
    players = [
        PlayerState(name="player_1", life=BALANCE_CONFIG.life),
        PlayerState(name="player_2", life=BALANCE_CONFIG.life),
    ]

    for index, (player, source_deck) in enumerate(
        zip(players, (first_deck, second_deck))
    ):
        deck = list(source_deck)
        rng.shuffle(deck)
        player.deck = deck
        initial_hand = (
            BALANCE_CONFIG.first_player_initial_hand
            if index == 0
            else BALANCE_CONFIG.second_player_initial_hand
        )
        player.draw(initial_hand or BALANCE_CONFIG.initial_hand, rng)

    state = GameState(seed=seed, rng=rng, players=players, config=BALANCE_CONFIG)
    state.log.append({"event": "setup", "seed": seed})
    while state.winner is None and not state.draw:
        start_turn(state)
        while state.actions_remaining > 0 and state.winner is None and not state.draw:
            apply_action(state, choose_action(state))
        if state.winner is None and not state.draw:
            end_turn(state)
            finish_if_turn_limit_reached(state)
    return result_summary(state)


def cost_bucket_win_rate(card_ids: tuple[str, ...], seed: int) -> float:
    candidate_deck = cards_from_ids(card_ids)
    candidate_wins = 0
    total_games = 0
    current_seed = seed

    for archetype in EXISTING_DECKS:
        existing_deck = build_deck(archetype)
        for candidate_is_first in (True, False):
            for _ in range(BALANCE_GAMES_PER_ORDERED_MATCHUP):
                if candidate_is_first:
                    summary = run_custom_match(current_seed, candidate_deck, existing_deck)
                    candidate_won = summary["winner"] == "player_1"
                else:
                    summary = run_custom_match(current_seed, existing_deck, candidate_deck)
                    candidate_won = summary["winner"] == "player_2"
                candidate_wins += int(candidate_won)
                total_games += 1
                current_seed += 1

    return candidate_wins / total_games


class TestCostBalanceRegression(unittest.TestCase):
    def assert_not_stronger_than_existing_decks(
        self,
        label: str,
        card_ids: tuple[str, ...],
        seed: int,
    ) -> None:
        win_rate = cost_bucket_win_rate(card_ids, seed)
        self.assertLessEqual(
            win_rate,
            MAX_COST_BUCKET_WIN_RATE,
            f"{label} win rate {win_rate:.3f} exceeded "
            f"{MAX_COST_BUCKET_WIN_RATE:.3f} against the six existing decks",
        )

    def test_power_1_only_deck_does_not_beat_existing_decks(self) -> None:
        self.assert_not_stronger_than_existing_decks(
            "power 1 only",
            synthetic_twenty_card_deck(POWER_CARD_IDS[1]),
            1_200_000,
        )

    def test_power_2_only_deck_does_not_beat_existing_decks(self) -> None:
        self.assert_not_stronger_than_existing_decks(
            "power 2 only",
            synthetic_twenty_card_deck(POWER_CARD_IDS[2]),
            1_250_000,
        )

    def test_power_3_only_deck_does_not_beat_existing_decks(self) -> None:
        self.assert_not_stronger_than_existing_decks(
            "power 3 only",
            synthetic_twenty_card_deck(POWER_CARD_IDS[3]),
            1_300_000,
        )

    def test_power_4_only_deck_does_not_beat_existing_decks(self) -> None:
        self.assert_not_stronger_than_existing_decks(
            "power 4 only",
            synthetic_twenty_card_deck(POWER_CARD_IDS[4]),
            1_350_000,
        )

    def test_low_and_high_cost_band_decks_do_not_beat_existing_decks(self) -> None:
        for label, card_ids, seed in (
            ("power 1-2 only", LOW_COST_CARD_IDS, 1_400_000),
            ("power 3-4 only", HIGH_COST_CARD_IDS, 1_450_000),
        ):
            with self.subTest(label=label):
                self.assert_not_stronger_than_existing_decks(label, card_ids, seed)
