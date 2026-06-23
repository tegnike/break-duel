from __future__ import annotations

import unittest

from ai_break_duel.cards import (
    AI_CARD_POOL,
    COMMAND_CARD_POOL,
    MEMORY_CARD_POOL,
    Attribute,
    build_player_deck,
    can_defend,
)
from ai_break_duel.engine import (
    apply_action,
    end_turn,
    finish_if_turn_limit_reached,
    new_game,
    start_turn,
)
from ai_break_duel.models import Action, ActionType, GameConfig, PlayerState
from ai_break_duel.simulation import run_simulation


def card(card_id: str):
    return next(item for item in AI_CARD_POOL if item.id == card_id)


def command(card_id: str):
    return next(item for item in COMMAND_CARD_POOL if item.id == card_id)


def memory(card_id: str):
    return next(item for item in MEMORY_CARD_POOL if item.id == card_id)


def no_opening_hands(**overrides):
    options = {
        "initial_hand": 0,
        "first_player_initial_hand": 0,
        "second_player_initial_hand": 0,
        "first_player_first_turn_draw": False,
        "first_player_first_turn_can_attack": True,
    }
    options.update(overrides)
    return GameConfig(**options)


class CoreRuleTests(unittest.TestCase):
    def test_same_attribute_requires_equal_or_higher_power(self) -> None:
        self.assertTrue(can_defend(card("AI-FIRE-3"), card("AI-FIRE-3")))
        self.assertTrue(can_defend(card("AI-FIRE-3"), card("AI-FIRE-4")))
        self.assertFalse(can_defend(card("AI-FIRE-3"), card("AI-FIRE-2")))

    def test_advantage_attribute_can_defend_with_minus_one_power(self) -> None:
        self.assertTrue(can_defend(card("AI-FIRE-3"), card("AI-WATER-2")))
        self.assertFalse(can_defend(card("AI-FIRE-3"), card("AI-WIND-3")))

    def test_neutral_attribute_can_defend_by_power(self) -> None:
        self.assertTrue(can_defend(card("AI-FIRE-3"), card("AI-EARTH-3")))
        self.assertFalse(can_defend(card("AI-FIRE-4"), card("AI-EARTH-3")))

    def test_tuned_defense_options_can_make_disadvantage_stricter(self) -> None:
        self.assertTrue(can_defend(card("AI-FIRE-3"), card("AI-WIND-4")))
        self.assertFalse(
            can_defend(
                card("AI-FIRE-3"),
                card("AI-WIND-4"),
                disadvantage_penalty=2,
            )
        )

    def test_player_draw_fails_when_deck_is_empty(self) -> None:
        player = PlayerState(name="p", deck=[], discard=[card("AI-FIRE-1")])
        drawn = player.draw(1, None)
        self.assertEqual(drawn, 0)
        self.assertEqual(player.hand, [])
        self.assertEqual(player.discard[0].id, "AI-FIRE-1")
        self.assertEqual(player.cards_drawn, 0)

    def test_resource_exhaustion_uses_life_judgement(self) -> None:
        state = new_game(1, no_opening_hands())
        for player in state.players:
            player.deck = []
            player.hand = []
            player.field_ai = []
        state.players[0].life = 4
        state.players[1].life = 2
        start_turn(state)
        self.assertEqual(state.winner, 0)
        self.assertFalse(state.draw)
        self.assertEqual(state.phase, "finished")
        self.assertEqual(state.log[-1]["event"], "resource_exhaustion")
        self.assertEqual(state.log[-1]["result"], "life_judgement")

    def test_resource_exhaustion_draws_on_equal_life(self) -> None:
        state = new_game(1, no_opening_hands())
        for player in state.players:
            player.deck = []
            player.hand = []
            player.field_ai = []
        state.players[0].life = 3
        state.players[1].life = 3
        start_turn(state)
        self.assertIsNone(state.winner)
        self.assertTrue(state.draw)
        self.assertEqual(state.phase, "finished")
        self.assertEqual(state.log[-1]["event"], "resource_exhaustion")
        self.assertEqual(state.log[-1]["result"], "draw")

    def test_turn_limit_uses_life_judgement(self) -> None:
        state = new_game(1, no_opening_hands(max_turns=10))
        state.turn = 10
        state.players[0].life = 2
        state.players[1].life = 4
        finish_if_turn_limit_reached(state)
        self.assertEqual(state.winner, 1)
        self.assertFalse(state.draw)
        self.assertEqual(state.phase, "finished")
        self.assertEqual(state.log[-1]["event"], "max_turns_reached")
        self.assertEqual(state.log[-1]["result"], "life_judgement")

    def test_turn_limit_draws_on_equal_life(self) -> None:
        state = new_game(1, no_opening_hands(max_turns=10))
        state.turn = 10
        state.players[0].life = 3
        state.players[1].life = 3
        finish_if_turn_limit_reached(state)
        self.assertIsNone(state.winner)
        self.assertTrue(state.draw)
        self.assertEqual(state.phase, "finished")
        self.assertEqual(state.log[-1]["event"], "max_turns_reached")
        self.assertEqual(state.log[-1]["result"], "draw")

    def test_opening_hands_are_asymmetric_by_default(self) -> None:
        state = new_game(1)
        self.assertEqual(len(state.players[0].hand), 5)
        self.assertEqual(len(state.players[1].hand), 4)

    def test_first_player_first_turn_skips_draw_by_default(self) -> None:
        state = new_game(1, GameConfig(initial_hand=0, first_player_initial_hand=0, second_player_initial_hand=0))
        state.players[0].deck = [card("AI-FIRE-1")]
        start_turn(state)
        self.assertEqual(state.players[0].cards_drawn, 0)
        self.assertEqual(state.players[0].hand, [])

    def test_first_player_first_turn_draw_can_be_enabled_for_variants(self) -> None:
        state = new_game(1, no_opening_hands(first_player_first_turn_draw=True))
        state.players[0].deck = [card("AI-FIRE-1")]
        start_turn(state)
        self.assertEqual(state.players[0].cards_drawn, 1)
        self.assertEqual([item.id for item in state.players[0].hand], ["AI-FIRE-1"])

    def test_players_use_different_decks_by_default(self) -> None:
        player_1_deck = [item.id for item in build_player_deck(0)]
        player_2_deck = [item.id for item in build_player_deck(1)]
        self.assertEqual(len(player_1_deck), 20)
        self.assertEqual(len(player_2_deck), 20)
        self.assertNotEqual(player_1_deck, player_2_deck)
        self.assertIn("MEM-CACHE", player_1_deck)
        self.assertIn("MEM-FIREWALL", player_2_deck)

    def test_undefended_attack_deals_damage_without_drawing(self) -> None:
        state = new_game(1, no_opening_hands())
        state.players[0].field_ai = [card("AI-FIRE-3")]
        state.players[1].deck = [card("AI-WATER-1")]
        start_turn(state)
        apply_action(state, Action(ActionType.ATTACK, 0))
        self.assertEqual(state.players[1].life, 4)
        self.assertEqual(len(state.players[1].hand), 0)
        self.assertEqual(state.players[1].cards_drawn, 0)
        self.assertEqual(state.stats.undefended_attacks, 1)

    def test_hand_defense_prevents_damage_without_removing_attacker(self) -> None:
        state = new_game(
            1,
            no_opening_hands(),
        )
        state.players[0].field_ai = [card("AI-FIRE-3")]
        state.players[1].hand = [card("AI-WATER-4")]
        start_turn(state)
        apply_action(state, Action(ActionType.ATTACK, 0))
        self.assertEqual(state.players[1].life, 5)
        self.assertEqual([item.id for item in state.players[0].field_ai], ["AI-FIRE-3"])
        self.assertIn(0, state.players[0].spent_field_ai)
        self.assertEqual(state.players[1].field_ai, [])
        self.assertEqual(state.players[1].discard[0].id, "AI-WATER-4")
        self.assertEqual(state.stats.successful_defenses, 1)

    def test_hand_defense_can_protect_even_when_field_is_not_empty(self) -> None:
        state = new_game(
            1,
            no_opening_hands(),
        )
        state.players[0].field_ai = [card("AI-FIRE-3")]
        state.players[1].field_ai = [card("AI-FIRE-3")]
        state.players[1].hand = [card("AI-WATER-2")]
        start_turn(state)
        apply_action(state, Action(ActionType.ATTACK, 0))
        self.assertEqual(state.players[1].life, 5)
        self.assertEqual([item.id for item in state.players[1].field_ai], ["AI-FIRE-3"])
        self.assertEqual([item.id for item in state.players[0].field_ai], ["AI-FIRE-3"])
        self.assertEqual(state.players[1].discard[0].id, "AI-WATER-2")
        self.assertEqual(state.stats.successful_defenses, 1)

    def test_hand_defense_is_limited_to_once_per_turn_by_default(self) -> None:
        state = new_game(
            1,
            no_opening_hands(first_player_first_turn_actions=2),
        )
        state.players[0].field_ai = [card("AI-FIRE-3"), card("AI-FIRE-3")]
        state.players[1].hand = [card("AI-WATER-4"), card("AI-WATER-4")]
        start_turn(state)
        apply_action(state, Action(ActionType.ATTACK, 0))
        apply_action(state, Action(ActionType.ATTACK, 1))
        self.assertEqual(state.players[1].life, 4)
        self.assertEqual(state.players[1].hand_defenses_used_this_turn, 1)
        self.assertEqual(len(state.players[1].hand), 1)
        self.assertEqual(len(state.players[1].discard), 1)
        self.assertEqual(state.stats.successful_defenses, 1)
        self.assertEqual(state.stats.undefended_attacks, 1)

    def test_successful_field_defense_discards_attacker_and_spends_defender(self) -> None:
        state = new_game(1, no_opening_hands())
        state.players[0].field_ai = [card("AI-FIRE-3")]
        state.players[1].field_ai = [card("AI-WATER-2")]
        start_turn(state)
        apply_action(state, Action(ActionType.ATTACK, 0))
        self.assertEqual(state.players[0].field_ai, [])
        self.assertEqual([item.id for item in state.players[1].field_ai], ["AI-WATER-2"])
        self.assertIn(0, state.players[1].spent_field_ai)
        self.assertEqual(state.players[0].discard[0].id, "AI-FIRE-3")
        self.assertEqual(state.players[1].discard, [])
        self.assertEqual(state.stats.successful_defenses, 1)

    def test_equal_field_defense_discards_both_ai(self) -> None:
        state = new_game(1, no_opening_hands())
        state.players[0].field_ai = [card("AI-FIRE-3")]
        state.players[1].field_ai = [card("AI-FIRE-3")]
        start_turn(state)
        apply_action(state, Action(ActionType.ATTACK, 0))
        self.assertEqual(state.players[0].field_ai, [])
        self.assertEqual(state.players[1].field_ai, [])
        self.assertEqual(state.players[0].discard[0].id, "AI-FIRE-3")
        self.assertEqual(state.players[1].discard[0].id, "AI-FIRE-3")
        self.assertEqual(state.stats.successful_defenses, 1)

    def test_earth_agent_trades_with_water_core_by_attribute_advantage(self) -> None:
        state = new_game(1, no_opening_hands())
        state.players[0].field_ai = [card("AI-WATER-4")]
        state.players[1].field_ai = [card("AI-EARTH-3")]
        start_turn(state)
        apply_action(state, Action(ActionType.ATTACK, 0))
        self.assertEqual(state.players[0].field_ai, [])
        self.assertEqual(state.players[1].field_ai, [])
        self.assertEqual([item.id for item in state.players[0].discard], ["AI-WATER-4"])
        self.assertEqual([item.id for item in state.players[1].discard], ["AI-EARTH-3"])
        self.assertEqual(state.log[-1]["defense_result"], "success_trade")
        self.assertFalse(state.log[-1]["attacker_overheated"])
        self.assertEqual(state.stats.successful_defenses, 1)

    def test_power_1_draws_when_played(self) -> None:
        state = new_game(1, no_opening_hands())
        state.players[0].hand = [card("AI-FIRE-1")]
        state.players[0].deck = [card("AI-WATER-1")]
        start_turn(state)
        apply_action(state, Action(ActionType.PLAY_AI, 0))
        self.assertEqual(state.players[0].field_ai[0].id, "AI-FIRE-1")
        self.assertEqual(state.players[0].hand[0].id, "AI-WATER-1")

    def test_power_2_gets_defense_bonus(self) -> None:
        state = new_game(1, no_opening_hands())
        state.players[0].field_ai = [card("AI-FIRE-4")]
        state.players[1].field_ai = [card("AI-WATER-2")]
        start_turn(state)
        apply_action(state, Action(ActionType.ATTACK, 0))
        self.assertEqual(state.players[0].discard[0].id, "AI-FIRE-4")
        self.assertEqual(state.players[1].field_ai, [])
        self.assertEqual(state.players[1].discard[0].id, "AI-WATER-2")
        self.assertEqual(state.stats.successful_defenses, 1)

    def test_large_ai_requires_two_actions_to_play(self) -> None:
        state = new_game(1, no_opening_hands())
        state.players[0].hand = [card("AI-FIRE-3")]
        start_turn(state)
        state.actions_remaining = 1
        with self.assertRaises(ValueError):
            apply_action(state, Action(ActionType.PLAY_AI, 0))

    def test_power_4_enters_spent(self) -> None:
        state = new_game(1, no_opening_hands(first_player_first_turn_actions=2))
        state.players[0].hand = [card("AI-FIRE-4")]
        start_turn(state)
        apply_action(state, Action(ActionType.PLAY_AI, 0))
        self.assertIn(0, state.players[0].spent_field_ai)
        self.assertEqual(state.actions_remaining, 0)

    def test_power_4_overheats_after_attack(self) -> None:
        state = new_game(1, no_opening_hands())
        state.players[0].field_ai = [card("AI-FIRE-4")]
        state.players[1].deck = [card("AI-WATER-1")]
        start_turn(state)
        apply_action(state, Action(ActionType.ATTACK, 0))
        self.assertEqual(state.players[1].life, 4)
        self.assertEqual(state.players[0].field_ai, [])
        self.assertEqual(state.players[0].discard[0].id, "AI-FIRE-4")

    def test_optimize_discards_one_and_draws_two(self) -> None:
        state = new_game(1, no_opening_hands())
        state.players[0].hand = [command("CMD-OPTIMIZE"), card("AI-FIRE-1")]
        state.players[0].deck = [card("AI-WATER-1"), card("AI-WIND-1")]
        start_turn(state)
        apply_action(state, Action(ActionType.USE_COMMAND, 0))
        self.assertEqual([item.id for item in state.players[0].discard], [
            "CMD-OPTIMIZE",
            "AI-FIRE-1",
        ])
        self.assertEqual(len(state.players[0].hand), 2)

    def test_optimize_discards_up_to_two_cards_before_drawing_two(self) -> None:
        state = new_game(1, no_opening_hands())
        state.players[0].hand = [
            command("CMD-OPTIMIZE"),
            card("AI-FIRE-1"),
            card("AI-WATER-1"),
        ]
        state.players[0].deck = [card("AI-WATER-1"), card("AI-WIND-1")]
        start_turn(state)
        apply_action(state, Action(ActionType.USE_COMMAND, 0))
        self.assertEqual([item.id for item in state.players[0].discard], [
            "CMD-OPTIMIZE",
            "AI-FIRE-1",
            "AI-WATER-1",
        ])
        self.assertEqual([item.id for item in state.players[0].hand], [
            "AI-WIND-1",
            "AI-WATER-1",
        ])

    def test_patch_readies_spent_ai(self) -> None:
        state = new_game(1, no_opening_hands())
        state.players[0].hand = [command("CMD-PATCH")]
        state.players[0].field_ai = [card("AI-FIRE-1")]
        state.players[0].spent_field_ai.add(0)
        start_turn(state)
        state.players[0].spent_field_ai.add(0)
        apply_action(state, Action(ActionType.USE_COMMAND, 0))
        self.assertNotIn(0, state.players[0].spent_field_ai)
        self.assertEqual(state.players[0].discard[0].id, "CMD-PATCH")

    def test_disrupt_exhausts_opposing_ready_ai(self) -> None:
        state = new_game(1, no_opening_hands())
        state.players[0].hand = [command("CMD-DISRUPT")]
        state.players[1].field_ai = [card("AI-FIRE-1")]
        start_turn(state)
        apply_action(state, Action(ActionType.USE_COMMAND, 0))
        self.assertIn(0, state.players[1].spent_field_ai)
        self.assertEqual(state.players[0].discard[0].id, "CMD-DISRUPT")

    def test_relearn_returns_ai_from_discard(self) -> None:
        state = new_game(1, no_opening_hands())
        state.players[0].hand = [command("CMD-RELEARN")]
        state.players[0].discard = [card("AI-FIRE-1"), card("AI-WATER-4")]
        start_turn(state)
        apply_action(state, Action(ActionType.USE_COMMAND, 0))
        self.assertEqual(state.players[0].hand[0].id, "AI-WATER-4")
        self.assertEqual(state.players[0].discard[-1].id, "CMD-RELEARN")

    def test_disrupt_can_target_a_specific_ready_ai(self) -> None:
        state = new_game(1, no_opening_hands())
        state.players[0].hand = [command("CMD-DISRUPT")]
        state.players[1].field_ai = [card("AI-FIRE-4"), card("AI-WATER-1")]
        start_turn(state)
        apply_action(state, Action(ActionType.USE_COMMAND, 0, 1))
        self.assertNotIn(0, state.players[1].spent_field_ai)
        self.assertIn(1, state.players[1].spent_field_ai)

    def test_memory_card_enters_memory_slot_and_replaces_existing_memory(self) -> None:
        state = new_game(1, no_opening_hands(first_player_first_turn_actions=2))
        state.players[0].hand = [memory("MEM-CACHE"), memory("MEM-FIREWALL")]
        start_turn(state)
        apply_action(state, Action(ActionType.PLAY_MEMORY, 0))
        self.assertEqual(state.players[0].memory.id, "MEM-CACHE")
        apply_action(state, Action(ActionType.PLAY_MEMORY, 0))
        self.assertEqual(state.players[0].memory.id, "MEM-FIREWALL")
        self.assertEqual(state.players[0].discard[0].id, "MEM-CACHE")

    def test_cache_memory_draws_when_turn_starts_with_small_hand(self) -> None:
        state = new_game(1, no_opening_hands())
        state.players[0].memory = memory("MEM-CACHE")
        state.players[0].hand = [card("AI-FIRE-1"), card("AI-WATER-1")]
        state.players[0].deck = [card("AI-EARTH-1")]
        start_turn(state)
        self.assertEqual(len(state.players[0].hand), 3)

    def test_firewall_memory_adds_one_power_to_same_attribute_field_defense(self) -> None:
        state = new_game(1, no_opening_hands())
        state.players[0].field_ai = [card("AI-FIRE-3")]
        state.players[1].field_ai = [card("AI-FIRE-3")]
        state.players[1].memory = memory("MEM-FIREWALL")
        state.players[1].hand = [card("AI-EARTH-1")]
        start_turn(state)
        apply_action(state, Action(ActionType.ATTACK, 0))
        self.assertEqual(state.stats.successful_defenses, 1)
        self.assertEqual(state.players[0].field_ai, [])
        self.assertEqual([item.id for item in state.players[1].field_ai], ["AI-FIRE-3"])
        self.assertIn(0, state.players[1].spent_field_ai)
        self.assertEqual(state.players[1].discard[0].id, "AI-EARTH-1")

    def test_sandbox_command_can_prevent_next_power_4_overheat(self) -> None:
        state = new_game(
            1,
            no_opening_hands(
                first_player_first_turn_actions=2,
                first_player_first_turn_can_attack=True,
            ),
        )
        state.players[0].field_ai = [card("AI-FIRE-4")]
        state.players[0].hand = [command("CMD-SANDBOX")]
        state.players[1].deck = [card("AI-WATER-1")]
        start_turn(state)
        apply_action(state, Action(ActionType.USE_COMMAND, 0))
        apply_action(state, Action(ActionType.ATTACK, 0))
        self.assertEqual(state.players[0].field_ai[0].id, "AI-FIRE-4")
        self.assertIn(0, state.players[0].spent_field_ai)
        self.assertEqual([item.id for item in state.players[0].discard], ["CMD-SANDBOX"])
        self.assertNotIn("sandbox_shield", state.players[0].pending_effects)
        self.assertTrue(state.log[-1]["sandbox_command_used"])

    def test_upgrade_replaces_lower_power_same_attribute_ai(self) -> None:
        state = new_game(1, no_opening_hands(first_player_first_turn_actions=2))
        state.players[0].field_ai = [card("AI-FIRE-1")]
        state.players[0].hand = [card("AI-FIRE-3")]
        start_turn(state)
        apply_action(state, Action(ActionType.UPGRADE_AI, 0, 0))
        self.assertEqual(state.players[0].field_ai[0].id, "AI-FIRE-3")
        self.assertEqual(state.players[0].discard[0].id, "AI-FIRE-1")

    def test_upgrade_cost_is_one_less_than_normal_play_cost(self) -> None:
        state = new_game(1, no_opening_hands(first_player_first_turn_actions=1))
        state.players[0].field_ai = [card("AI-FIRE-1")]
        state.players[0].hand = [card("AI-FIRE-3")]
        start_turn(state)
        apply_action(state, Action(ActionType.UPGRADE_AI, 0, 0))
        self.assertEqual(state.players[0].field_ai[0].id, "AI-FIRE-3")
        self.assertEqual(state.actions_remaining, 0)
        self.assertEqual(state.log[-1]["action_cost"], 1)

    def test_upgrade_keeps_remaining_hand_cards(self) -> None:
        state = new_game(1, no_opening_hands(first_player_first_turn_actions=2))
        state.players[0].field_ai = [card("AI-FIRE-1")]
        state.players[0].hand = [card("AI-FIRE-3"), command("CMD-PATCH")]
        start_turn(state)
        apply_action(state, Action(ActionType.UPGRADE_AI, 0, 0))
        self.assertEqual(state.players[0].field_ai[0].id, "AI-FIRE-3")
        self.assertEqual([item.id for item in state.players[0].discard], ["AI-FIRE-1"])
        self.assertEqual([item.id for item in state.players[0].hand], ["CMD-PATCH"])

    def test_end_turn_discards_low_priority_cards_over_hand_limit(self) -> None:
        state = new_game(1, no_opening_hands(hand_limit=3))
        state.players[0].hand = [
            command("CMD-PATCH"),
            card("AI-FIRE-1"),
            card("AI-FIRE-4"),
            card("AI-WATER-2"),
            card("AI-WIND-3"),
        ]
        start_turn(state)
        end_turn(state)
        self.assertEqual(len(state.players[0].hand), 3)
        self.assertEqual([item.id for item in state.players[0].discard], [
            "AI-FIRE-1",
            "CMD-PATCH",
        ])

    def test_attack_exhausts_ai_and_prevents_second_attack(self) -> None:
        state = new_game(1, no_opening_hands())
        state.players[0].field_ai = [card("AI-FIRE-1")]
        state.players[1].deck = [card("AI-WATER-1"), card("AI-WIND-1")]
        start_turn(state)
        apply_action(state, Action(ActionType.ATTACK, 0))
        self.assertIn(0, state.players[0].spent_field_ai)
        with self.assertRaises(ValueError):
            apply_action(state, Action(ActionType.ATTACK, 0))

    def test_exhausted_ai_cannot_defend_by_default(self) -> None:
        state = new_game(1, no_opening_hands())
        state.players[0].field_ai = [card("AI-FIRE-2")]
        state.players[1].field_ai = [card("AI-FIRE-1")]
        state.players[0].spent_field_ai.add(0)
        state.active_player = 1
        start_turn(state)
        apply_action(state, Action(ActionType.ATTACK, 0))
        self.assertEqual(state.players[0].life, 4)
        self.assertEqual(state.stats.undefended_attacks, 1)

    def test_first_player_first_turn_has_one_action_by_default(self) -> None:
        state = new_game(
            1,
            no_opening_hands(),
        )
        start_turn(state)
        self.assertEqual(state.actions_remaining, 1)

    def test_second_player_first_turn_has_two_actions(self) -> None:
        state = new_game(1, no_opening_hands())
        start_turn(state)
        state.actions_remaining = 0
        from ai_break_duel.engine import end_turn

        end_turn(state)
        start_turn(state)
        self.assertEqual(state.actions_remaining, 2)

    def test_first_player_first_turn_attack_is_disabled_by_default(self) -> None:
        state = new_game(1, no_opening_hands(first_player_first_turn_can_attack=False))
        state.players[0].field_ai = [card("AI-FIRE-1")]
        start_turn(state)
        with self.assertRaises(ValueError):
            apply_action(state, Action(ActionType.ATTACK, 0))

    def test_first_player_first_turn_attack_can_be_enabled_for_variants(self) -> None:
        state = new_game(
            1,
            GameConfig(
                initial_hand=0,
                first_player_initial_hand=0,
                second_player_initial_hand=0,
                first_player_first_turn_draw=False,
                first_player_first_turn_can_attack=True,
            ),
        )
        state.players[0].field_ai = [card("AI-FIRE-1")]
        start_turn(state)
        apply_action(state, Action(ActionType.ATTACK, 0))
        self.assertEqual(state.stats.attacks, 1)

    def test_first_player_first_turn_draw_can_be_disabled(self) -> None:
        state = new_game(
            1,
            no_opening_hands(first_player_first_turn_draw=False),
        )
        start_turn(state)
        self.assertEqual(state.players[0].cards_drawn, 0)

    def test_each_player_first_turn_attack_can_be_disabled(self) -> None:
        state = new_game(
            1,
            GameConfig(
                initial_hand=0,
                each_player_first_turn_can_attack=False,
            ),
        )
        state.players[0].field_ai = [card("AI-FIRE-1")]
        start_turn(state)
        with self.assertRaises(ValueError):
            apply_action(state, Action(ActionType.ATTACK, 0))

    def test_second_player_first_turn_draw_can_be_disabled(self) -> None:
        state = new_game(
            1,
            no_opening_hands(second_player_first_turn_draw=False),
        )
        start_turn(state)
        state.actions_remaining = 0
        from ai_break_duel.engine import end_turn

        end_turn(state)
        start_turn(state)
        self.assertEqual(state.players[1].cards_drawn, 0)

    def test_simulation_returns_expected_summary_shape(self) -> None:
        summary = run_simulation(10, 1, None, GameConfig(max_turns=50))
        self.assertEqual(summary["games"], 10)
        self.assertIn("first_player_win_rate", summary)
        self.assertIn(Attribute.FIRE.value, summary["attack_by_attribute"])


if __name__ == "__main__":
    unittest.main()
