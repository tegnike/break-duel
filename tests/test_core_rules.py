from __future__ import annotations

from collections import Counter
import unittest

from ai_break_duel.cards import (
    AI_CARD_POOL,
    ACTIVE_CARD_POOL,
    COMMAND_CARD_POOL,
    CardType,
    CardStatus,
    DeckArchetype,
    MEMORY_CARD_POOL,
    Attribute,
    attack_combat_value,
    build_deck,
    build_player_deck,
    can_defend,
    validate_same_name_limit,
)
from ai_break_duel.ai import choose_action
from ai_break_duel.engine import (
    apply_action,
    end_turn,
    finish_if_turn_limit_reached,
    new_game,
    start_turn,
)
from ai_break_duel.models import Action, ActionType, GameConfig, PlayerState
from ai_break_duel.simulation import run_league, run_simulation


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
    def test_preset_decks_keep_curated_size_and_same_name_limit(self) -> None:
        for archetype in DeckArchetype:
            with self.subTest(archetype=archetype.value):
                deck = build_deck(archetype)
                validate_same_name_limit(deck)
                self.assertEqual(len(deck), 20)

    def test_preset_decks_do_not_duplicate_high_power_summons(self) -> None:
        for archetype in DeckArchetype:
            with self.subTest(archetype=archetype.value):
                high_power_counts = Counter(
                    card.id
                    for card in build_deck(archetype)
                    if card.type == CardType.AI and (card.power or 0) >= 3
                )
                duplicated = {
                    card_id: count
                    for card_id, count in high_power_counts.items()
                    if count > 1
                }
                self.assertEqual(duplicated, {})

    def test_preset_decks_limit_total_high_power_summons(self) -> None:
        for archetype in DeckArchetype:
            with self.subTest(archetype=archetype.value):
                high_power_count = sum(
                    1
                    for card in build_deck(archetype)
                    if card.type == CardType.AI and (card.power or 0) >= 3
                )
                self.assertLessEqual(high_power_count, 4)

    def test_power_3_recovery_delay_is_standard_rule(self) -> None:
        self.assertTrue(GameConfig().power_3_attack_recovery_delay)

    def test_mono_sample_decks_only_use_matching_attribute_summons(self) -> None:
        expectations = {
            DeckArchetype.FIRE: Attribute.FIRE,
            DeckArchetype.WATER: Attribute.WATER,
            DeckArchetype.WIND: Attribute.WIND,
            DeckArchetype.EARTH: Attribute.EARTH,
        }
        for archetype, expected_attribute in expectations.items():
            with self.subTest(archetype=archetype.value):
                attributes = {
                    card.attribute
                    for card in build_deck(archetype)
                    if card.type == CardType.AI
                }
                self.assertEqual(attributes, {expected_attribute})

    def test_same_attribute_requires_equal_or_higher_power(self) -> None:
        self.assertTrue(can_defend(card("AI-WATER-3"), card("AI-WATER-3")))
        self.assertTrue(can_defend(card("AI-WATER-3"), card("AI-WATER-4")))
        self.assertFalse(can_defend(card("AI-WATER-3"), card("AI-WATER-2")))

    def test_different_attributes_do_not_change_defense_by_matchup(self) -> None:
        self.assertFalse(can_defend(card("AI-FIRE-3"), card("AI-WATER-2")))
        self.assertTrue(can_defend(card("AI-WATER-3"), card("AI-WIND-3")))

    def test_neutral_attribute_can_defend_by_power(self) -> None:
        self.assertTrue(can_defend(card("AI-WATER-3"), card("AI-WIND-3")))
        self.assertFalse(can_defend(card("AI-WATER-4"), card("AI-WIND-3")))

    def test_legacy_matchup_options_do_not_change_attribute_defense(self) -> None:
        self.assertTrue(can_defend(card("AI-WATER-3"), card("AI-WIND-4")))
        self.assertTrue(
            can_defend(
                card("AI-WATER-3"),
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

    def test_resource_exhaustion_forces_loss_when_one_player_is_empty(self) -> None:
        state = new_game(1, no_opening_hands())
        state.players[0].deck = []
        state.players[0].hand = []
        state.players[0].field_ai = []
        state.players[1].deck = [card("AI-FIRE-1")]
        state.players[0].life = 4
        state.players[1].life = 2
        start_turn(state)
        self.assertEqual(state.winner, 1)
        self.assertFalse(state.draw)
        self.assertEqual(state.phase, "finished")
        self.assertEqual(state.log[-1]["event"], "resource_exhaustion")
        self.assertEqual(state.log[-1]["result"], "forced_loss")
        self.assertEqual(state.log[-1]["losers"], ["player_1"])

    def test_resource_exhaustion_draws_when_both_players_are_empty(self) -> None:
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
        self.assertEqual(state.log[-1]["result"], "mutual_forced_loss")
        self.assertEqual(state.log[-1]["losers"], ["player_1", "player_2"])

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

    def test_ai_ends_when_no_useful_charge_or_action_exists(self) -> None:
        state = new_game(1, no_opening_hands())
        state.players[0].hand = [command("CMD-OPTIMIZE")]
        state.players[0].deck = []
        start_turn(state)
        self.assertEqual(choose_action(state).type, ActionType.END_TURN)

    def test_ai_can_choose_charge_at_zero_actions(self) -> None:
        state = new_game(1, no_opening_hands())
        state.players[0].hand = [card("AI-FIRE-1"), card("AI-WATER-1")]
        start_turn(state)
        state.actions_remaining = 0
        action = choose_action(state)
        self.assertEqual(action.type, ActionType.CHARGE)
        self.assertEqual(action.source_index, 0)

    def test_ai_ends_at_zero_actions_when_charge_is_not_useful(self) -> None:
        state = new_game(1, no_opening_hands())
        state.players[0].hand = [command("CMD-OPTIMIZE")]
        state.players[0].deck = []
        start_turn(state)
        state.actions_remaining = 0
        self.assertEqual(choose_action(state).type, ActionType.END_TURN)

    def test_players_use_different_decks_by_default(self) -> None:
        player_1_deck = [item.id for item in build_player_deck(0)]
        player_2_deck = [item.id for item in build_player_deck(1)]
        self.assertEqual(len(player_1_deck), 20)
        self.assertEqual(len(player_2_deck), 20)
        self.assertNotEqual(player_1_deck, player_2_deck)
        self.assertIn("MEM-CACHE", player_1_deck)
        self.assertIn("MEM-FIREWALL", player_2_deck)

    def test_fixed_decks_cover_card_pool_and_required_card_types(self) -> None:
        used_card_ids = set()
        for archetype in DeckArchetype:
            deck = build_deck(archetype)
            self.assertEqual(len(deck), 20, archetype.value)
            validate_same_name_limit(deck)
            used_card_ids.update(card.id for card in deck)

            self.assertGreaterEqual(
                sum(1 for card in deck if card.type == CardType.AI),
                2,
                archetype.value,
            )
            self.assertGreaterEqual(
                sum(1 for card in deck if card.type == CardType.EVENT),
                2,
                archetype.value,
            )
            self.assertGreaterEqual(
                sum(1 for card in deck if card.type == CardType.MEMORY),
                2,
                archetype.value,
            )

        all_card_ids = {card.id for card in ACTIVE_CARD_POOL}
        self.assertFalse(all_card_ids - used_card_ids)

    def test_inactive_cards_stay_out_of_fixed_decks(self) -> None:
        inactive_card_ids = {
            card.id
            for card in [*AI_CARD_POOL, *COMMAND_CARD_POOL, *MEMORY_CARD_POOL]
            if card.status == CardStatus.INACTIVE.value
        }
        self.assertIn("CMD-PATCH", inactive_card_ids)
        for archetype in DeckArchetype:
            deck_ids = {card.id for card in build_deck(archetype)}
            self.assertFalse(inactive_card_ids & deck_ids, archetype.value)

    def test_single_color_decks_use_only_their_attribute_summons(self) -> None:
        expected_attributes = {
            DeckArchetype.FIRE: Attribute.FIRE,
            DeckArchetype.WATER: Attribute.WATER,
            DeckArchetype.WIND: Attribute.WIND,
            DeckArchetype.EARTH: Attribute.EARTH,
        }

        for archetype, attribute in expected_attributes.items():
            deck = build_deck(archetype)
            summon_ids = {card.id for card in deck if card.type == CardType.AI}
            expected_summon_ids = {
                card.id for card in AI_CARD_POOL if card.attribute == attribute
            }
            self.assertTrue(expected_summon_ids <= summon_ids, archetype.value)
            self.assertEqual(
                {card.attribute for card in deck if card.type == CardType.AI},
                {attribute},
                archetype.value,
            )

    def test_undefended_attack_deals_damage_without_drawing(self) -> None:
        state = new_game(1, no_opening_hands())
        state.players[0].field_ai = [card("AI-WATER-4")]
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
        state.players[0].field_ai = [card("AI-WATER-3")]
        state.players[1].field_ai = [card("AI-FIRE-2")]
        state.players[1].hand = [card("AI-WATER-3")]
        start_turn(state)
        apply_action(state, Action(ActionType.ATTACK, 0))
        self.assertEqual(state.players[1].life, 5)
        self.assertEqual([item.id for item in state.players[1].field_ai], ["AI-FIRE-2"])
        self.assertEqual([item.id for item in state.players[0].field_ai], ["AI-WATER-3"])
        self.assertEqual(state.players[1].discard[0].id, "AI-WATER-3")
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
        state.players[0].field_ai = [card("AI-WATER-3")]
        state.players[1].field_ai = [card("AI-WATER-4")]
        start_turn(state)
        apply_action(state, Action(ActionType.ATTACK, 0))
        self.assertEqual(state.players[0].field_ai, [])
        self.assertEqual([item.id for item in state.players[1].field_ai], ["AI-WATER-4"])
        self.assertIn(0, state.players[1].spent_field_ai)
        self.assertEqual(state.players[0].discard[0].id, "AI-WATER-3")
        self.assertEqual(state.players[1].discard, [])
        self.assertEqual(state.stats.successful_defenses, 1)

    def test_equal_field_defense_discards_both_ai(self) -> None:
        state = new_game(1, no_opening_hands())
        state.players[0].field_ai = [card("AI-WATER-3")]
        state.players[1].field_ai = [card("AI-WATER-3")]
        start_turn(state)
        apply_action(state, Action(ActionType.ATTACK, 0))
        self.assertEqual(state.players[0].field_ai, [])
        self.assertEqual(state.players[1].field_ai, [])
        self.assertEqual(state.players[0].discard[0].id, "AI-WATER-3")
        self.assertEqual(state.players[1].discard[0].id, "AI-WATER-3")
        self.assertEqual(state.stats.successful_defenses, 1)

    def test_fire_ai_attacks_with_plus_one_attack_value(self) -> None:
        state = new_game(1, no_opening_hands())
        state.players[0].field_ai = [card("AI-FIRE-2")]
        state.players[1].field_ai = [card("AI-WATER-3")]
        start_turn(state)
        apply_action(state, Action(ActionType.ATTACK, 0))
        self.assertEqual(state.players[0].field_ai, [])
        self.assertEqual(state.players[1].field_ai, [])
        self.assertEqual(state.log[-1]["defense_result"], "success_trade")

    def test_draw_on_play_ai_draws_one_card_when_played(self) -> None:
        state = new_game(1, no_opening_hands())
        state.players[0].hand = [card("AI-WATER-1")]
        state.players[0].deck = [card("AI-FIRE-1")]
        start_turn(state)
        apply_action(state, Action(ActionType.PLAY_AI, 0))
        self.assertEqual(state.players[0].cards_drawn, 1)
        self.assertEqual([item.id for item in state.players[0].hand], ["AI-FIRE-1"])

    def test_wind_ai_does_not_spend_after_attacking(self) -> None:
        state = new_game(1, no_opening_hands())
        state.players[0].field_ai = [card("AI-WIND-1")]
        start_turn(state)
        apply_action(state, Action(ActionType.ATTACK, 0))
        self.assertNotIn(0, state.players[0].spent_field_ai)

    def test_filter_on_play_ai_draws_and_discards(self) -> None:
        state = new_game(1, no_opening_hands(first_player_first_turn_actions=2))
        state.players[0].hand = [card("AI-WATER-2"), card("AI-FIRE-1")]
        state.players[0].deck = [card("AI-EARTH-1"), card("AI-WIND-1")]
        start_turn(state)
        apply_action(state, Action(ActionType.PLAY_AI, 0))
        self.assertEqual(state.players[0].cards_drawn, 2)
        self.assertEqual([item.id for item in state.players[0].discard], ["AI-EARTH-1"])
        self.assertEqual([item.id for item in state.players[0].hand], ["AI-FIRE-1", "AI-WIND-1"])

    def test_recover_ai_on_upgrade_does_not_return_source_immediately(self) -> None:
        state = new_game(1, no_opening_hands(first_player_first_turn_actions=2))
        state.players[0].field_ai = [card("AI-EARTH-1")]
        state.players[0].hand = [card("AI-EARTH-4")]
        start_turn(state)
        apply_action(state, Action(ActionType.UPGRADE_AI, 0, target_index=0))
        self.assertEqual([item.id for item in state.players[0].hand], [])
        self.assertEqual([item.id for item in state.players[0].discard], ["AI-EARTH-1"])

    def test_spend_enemy_on_play_ai_spends_ready_opponent(self) -> None:
        state = new_game(1, no_opening_hands(first_player_first_turn_actions=2))
        state.players[0].hand = [card("AI-WIND-3")]
        state.players[1].field_ai = [card("AI-FIRE-1"), card("AI-FIRE-4")]
        start_turn(state)
        apply_action(state, Action(ActionType.PLAY_AI, 0))
        self.assertIn(1, state.players[1].spent_field_ai)

    def test_recover_ai_on_play_returns_ai_from_discard(self) -> None:
        state = new_game(1, no_opening_hands(first_player_first_turn_actions=2))
        state.players[0].hand = [card("AI-EARTH-4")]
        state.players[0].discard = [command("CMD-PATCH"), card("AI-EARTH-2")]
        start_turn(state)
        apply_action(state, Action(ActionType.PLAY_AI, 0))
        self.assertEqual([item.id for item in state.players[0].hand], ["AI-EARTH-2"])
        self.assertEqual([item.id for item in state.players[0].discard], ["CMD-PATCH"])

    def test_ai_without_draw_effect_does_not_draw_when_played(self) -> None:
        state = new_game(1, no_opening_hands())
        state.players[0].hand = [card("AI-FIRE-1")]
        state.players[0].deck = [card("AI-WATER-1")]
        start_turn(state)
        apply_action(state, Action(ActionType.PLAY_AI, 0))
        self.assertEqual(state.players[0].field_ai[0].id, "AI-FIRE-1")
        self.assertEqual(state.players[0].hand, [])

    def test_ai_card_pool_has_two_base_variants_and_charge_cycle_cards(self) -> None:
        ai_ids = {item.id for item in AI_CARD_POOL}
        self.assertEqual(len(ai_ids), 36)
        for code in ("FIRE", "WATER", "WIND", "EARTH"):
            for power in (1, 2, 3, 4):
                self.assertIn(f"AI-{code}-{power}", ai_ids)
                self.assertIn(f"AI-{code}-{power}B", ai_ids)
        self.assertIn("AI-FIRE-1C", ai_ids)
        self.assertIn("AI-WATER-1C", ai_ids)
        self.assertIn("AI-WIND-2C", ai_ids)
        self.assertIn("AI-EARTH-2C", ai_ids)

    def test_block_pressure_discards_after_successful_hand_defense(self) -> None:
        state = new_game(1, no_opening_hands())
        state.players[0].field_ai = [card("AI-FIRE-1B")]
        state.players[1].hand = [card("AI-EARTH-1"), card("AI-WATER-1")]
        start_turn(state)
        apply_action(state, Action(ActionType.ATTACK, 0))
        self.assertEqual(state.players[1].life, 5)
        self.assertEqual([item.id for item in state.players[1].discard], ["AI-EARTH-1", "AI-WATER-1"])
        self.assertEqual(state.log[-1]["block_pressure_discarded_card"], "AI-WATER-1")

    def test_hand_defense_pierce_still_deals_damage(self) -> None:
        state = new_game(1, no_opening_hands())
        state.players[0].field_ai = [card("AI-FIRE-2B")]
        state.players[1].hand = [card("AI-EARTH-2")]
        start_turn(state)
        apply_action(state, Action(ActionType.ATTACK, 0))
        self.assertEqual(state.players[1].life, 4)
        self.assertEqual(state.players[1].discard[0].id, "AI-EARTH-2")

    def test_ai_uses_field_defense_over_hand_defense_against_pierce(self) -> None:
        state = new_game(
            1,
            no_opening_hands(
                first_player_first_turn_actions=2,
                first_player_first_turn_can_attack=True,
            ),
        )
        state.players[0].field_ai = [card("AI-FIRE-2B")]
        state.players[1].field_ai = [card("AI-WIND-2")]
        state.players[1].hand = [card("AI-EARTH-2")]
        start_turn(state)
        apply_action(state, Action(ActionType.ATTACK, 0))
        self.assertEqual(state.players[1].life, 5)
        self.assertEqual(state.log[-1]["defense_result"], "success_trade")
        self.assertEqual(state.log[-1]["defense_ai"], "AI-WIND-2")
        self.assertEqual([item.id for item in state.players[1].hand], ["AI-EARTH-2"])

    def test_low_life_finisher_blocks_hand_defense(self) -> None:
        state = new_game(1, no_opening_hands())
        state.players[0].field_ai = [card("AI-FIRE-4B")]
        state.players[1].life = 2
        state.players[1].hand = [card("AI-EARTH-4B")]
        start_turn(state)
        apply_action(state, Action(ActionType.ATTACK, 0))
        self.assertEqual(state.players[1].life, 1)
        self.assertEqual([item.id for item in state.players[1].hand], ["AI-EARTH-4B"])

    def test_self_damage_on_play_cost_loses_one_life(self) -> None:
        state = new_game(1, no_opening_hands(first_player_first_turn_actions=2))
        state.players[0].hand = [card("AI-FIRE-4B")]
        start_turn(state)
        apply_action(state, Action(ActionType.PLAY_AI, 0))
        self.assertEqual(state.players[0].life, 4)
        self.assertEqual(state.log[-1]["effect_self_damage"], 1)

    def test_opponent_draw_on_play_cost_draws_for_opponent(self) -> None:
        state = new_game(1, no_opening_hands(first_player_first_turn_actions=2))
        state.players[0].hand = [card("AI-WATER-4B")]
        state.players[1].deck = [card("AI-FIRE-1")]
        start_turn(state)
        apply_action(state, Action(ActionType.PLAY_AI, 0))
        self.assertEqual([item.id for item in state.players[1].hand], ["AI-FIRE-1"])
        self.assertEqual(state.log[-1]["effect_opponent_draw_count"], 1)

    def test_wind_3b_draws_and_readies_spent_summon(self) -> None:
        state = new_game(1, no_opening_hands(first_player_first_turn_actions=2))
        state.players[0].field_ai = [card("AI-WIND-1")]
        state.players[0].spent_field_ai = {0}
        state.players[0].hand = [card("AI-WIND-3B")]
        state.players[0].deck = [card("AI-FIRE-1")]
        start_turn(state)
        state.players[0].spent_field_ai = {0}
        apply_action(state, Action(ActionType.PLAY_AI, 0))
        self.assertEqual(state.players[0].spent_field_ai, set())
        self.assertEqual([item.id for item in state.players[0].hand], ["AI-FIRE-1"])
        self.assertEqual(state.players[0].deck, [])
        self.assertEqual(state.log[-1]["draw_count"], 1)
        self.assertEqual(state.log[-1]["effect_recovered_ai"], "AI-WIND-1")

    def test_cannot_hand_defend_drawback_prevents_hand_defense(self) -> None:
        state = new_game(1, no_opening_hands())
        state.players[0].field_ai = [card("AI-FIRE-1")]
        state.players[1].hand = [card("AI-WATER-1B")]
        start_turn(state)
        apply_action(state, Action(ActionType.ATTACK, 0))
        self.assertEqual(state.players[1].life, 4)
        self.assertEqual([item.id for item in state.players[1].hand], ["AI-WATER-1B"])

    def test_power_3_cannot_hand_defend_when_configured(self) -> None:
        state = new_game(1, no_opening_hands(power_3_cannot_hand_defend=True))
        state.players[0].field_ai = [card("AI-FIRE-1")]
        state.players[1].hand = [card("AI-WATER-3")]
        start_turn(state)
        apply_action(state, Action(ActionType.ATTACK, 0))
        self.assertEqual(state.players[1].life, 4)
        self.assertEqual([item.id for item in state.players[1].hand], ["AI-WATER-3"])

    def test_power_3_cannot_field_defend_when_configured(self) -> None:
        state = new_game(1, no_opening_hands(power_3_cannot_field_defend=True))
        state.players[0].field_ai = [card("AI-FIRE-1")]
        state.players[1].field_ai = [card("AI-WATER-3")]
        start_turn(state)
        apply_action(state, Action(ActionType.ATTACK, 0))
        self.assertEqual(state.players[1].life, 4)
        self.assertEqual([item.id for item in state.players[1].field_ai], ["AI-WATER-3"])

    def test_enters_spent_drawback_spends_card_on_play(self) -> None:
        state = new_game(1, no_opening_hands(first_player_first_turn_actions=2))
        state.players[0].hand = [card("AI-WIND-4B")]
        start_turn(state)
        apply_action(state, Action(ActionType.PLAY_AI, 0))
        self.assertIn(0, state.players[0].spent_field_ai)

    def test_wind_power_4b_returns_to_hand_after_attack(self) -> None:
        state = new_game(1, no_opening_hands())
        state.players[0].field_ai = [card("AI-WIND-4B")]
        start_turn(state)
        apply_action(state, Action(ActionType.ATTACK, 0))
        self.assertEqual([item.id for item in state.players[0].hand], ["AI-WIND-4B"])
        self.assertEqual(state.players[0].discard, [])

    def test_wind_power_4_overheats_to_discard_after_attack(self) -> None:
        state = new_game(1, no_opening_hands())
        state.players[0].field_ai = [card("AI-WIND-4")]
        start_turn(state)
        apply_action(state, Action(ActionType.ATTACK, 0))
        self.assertEqual(state.players[0].hand, [])
        self.assertEqual([item.id for item in state.players[0].discard], ["AI-WIND-4"])

    def test_defense_plus_1_ai_gets_defense_bonus(self) -> None:
        state = new_game(1, no_opening_hands())
        state.players[0].field_ai = [card("AI-WATER-3")]
        state.players[1].field_ai = [card("AI-EARTH-2")]
        start_turn(state)
        apply_action(state, Action(ActionType.ATTACK, 0))
        self.assertEqual(state.players[0].discard[0].id, "AI-WATER-3")
        self.assertEqual(state.players[1].field_ai, [])
        self.assertEqual(state.players[1].discard[0].id, "AI-EARTH-2")
        self.assertEqual(state.stats.successful_defenses, 1)

    def test_earth_2b_has_no_effect(self) -> None:
        state = new_game(1, no_opening_hands())
        state.players[0].field_ai = [card("AI-WATER-4")]
        state.players[1].field_ai = [card("AI-EARTH-2B")]
        start_turn(state)
        apply_action(state, Action(ActionType.ATTACK, 0))
        self.assertEqual(state.players[1].life, 4)
        self.assertEqual([item.id for item in state.players[1].field_ai], ["AI-EARTH-2B"])
        self.assertEqual(state.stats.undefended_attacks, 1)

    def test_defense_plus_1_ai_does_not_get_hand_defense_bonus(self) -> None:
        state = new_game(1, no_opening_hands())
        state.players[0].field_ai = [card("AI-WATER-3")]
        state.players[1].hand = [card("AI-EARTH-2")]
        start_turn(state)
        apply_action(state, Action(ActionType.ATTACK, 0))
        self.assertEqual(state.players[1].life, 4)
        self.assertEqual([item.id for item in state.players[1].hand], ["AI-EARTH-2"])
        self.assertEqual(state.stats.undefended_attacks, 1)

    def test_large_ai_requires_two_actions_to_play_directly(self) -> None:
        state = new_game(1, no_opening_hands())
        state.players[0].hand = [card("AI-FIRE-3")]
        start_turn(state)
        state.actions_remaining = 1
        with self.assertRaises(ValueError):
            apply_action(state, Action(ActionType.PLAY_AI, 0))

    def test_large_ai_direct_play_cost_can_be_configured_to_three(self) -> None:
        state = new_game(
            1,
            no_opening_hands(
                first_player_first_turn_actions=3,
                large_ai_play_cost=3,
            ),
        )
        state.players[0].hand = [card("AI-FIRE-3")]
        start_turn(state)
        apply_action(state, Action(ActionType.PLAY_AI, 0))
        self.assertEqual(state.actions_remaining, 0)

    def test_power_3_play_cost_can_be_configured(self) -> None:
        state = new_game(
            1,
            no_opening_hands(
                first_player_first_turn_actions=2,
                power_3_play_cost=2,
            ),
        )
        state.players[0].hand = [card("AI-FIRE-3")]
        start_turn(state)
        apply_action(state, Action(ActionType.PLAY_AI, 0))
        self.assertEqual(state.actions_remaining, 0)

    def test_power_3_play_cost_override_does_not_change_power_4_cost(self) -> None:
        state = new_game(
            1,
            no_opening_hands(
                first_player_first_turn_actions=3,
                power_3_play_cost=3,
            ),
        )
        state.players[0].hand = [card("AI-FIRE-4")]
        start_turn(state)
        apply_action(state, Action(ActionType.PLAY_AI, 0))
        self.assertEqual(state.actions_remaining, 1)

    def test_power_4_play_cost_can_be_configured(self) -> None:
        state = new_game(
            1,
            no_opening_hands(
                first_player_first_turn_actions=2,
                power_4_play_cost=1,
            ),
        )
        state.players[0].hand = [card("AI-FIRE-4")]
        start_turn(state)
        apply_action(state, Action(ActionType.PLAY_AI, 0))
        self.assertEqual(state.actions_remaining, 1)

    def test_fire_3_gets_attack_plus_1(self) -> None:
        self.assertEqual(attack_combat_value(card("AI-FIRE-3")), 4)

    def test_power_3_defense_modifier_can_be_configured(self) -> None:
        state = new_game(1, no_opening_hands(power_3_defense_modifier=-1))
        state.players[0].field_ai = [card("AI-FIRE-3")]
        state.players[1].field_ai = [card("AI-WATER-3")]
        start_turn(state)
        apply_action(state, Action(ActionType.ATTACK, 0))
        self.assertEqual(state.players[1].life, 4)
        self.assertEqual(state.players[0].field_ai, [card("AI-FIRE-3")])
        self.assertEqual(state.players[1].field_ai, [card("AI-WATER-3")])

    def test_power_4_enters_ready(self) -> None:
        state = new_game(1, no_opening_hands(first_player_first_turn_actions=2))
        state.players[0].hand = [card("AI-FIRE-4")]
        start_turn(state)
        apply_action(state, Action(ActionType.PLAY_AI, 0))
        self.assertNotIn(0, state.players[0].spent_field_ai)
        self.assertEqual(state.actions_remaining, 0)

    def test_power_3_can_enter_spent_when_configured(self) -> None:
        state = new_game(
            1,
            no_opening_hands(
                first_player_first_turn_actions=2,
                power_3_enters_spent=True,
            ),
        )
        state.players[0].hand = [card("AI-FIRE-3")]
        start_turn(state)
        apply_action(state, Action(ActionType.PLAY_AI, 0))
        self.assertEqual(state.players[0].spent_field_ai, {0})

    def test_power_3_can_discard_on_play_when_configured(self) -> None:
        state = new_game(
            1,
            no_opening_hands(
                first_player_first_turn_actions=2,
                power_3_discards_on_play=True,
            ),
        )
        state.players[0].hand = [card("AI-FIRE-3"), card("AI-FIRE-1")]
        start_turn(state)
        apply_action(state, Action(ActionType.PLAY_AI, 0))
        self.assertEqual([item.id for item in state.players[0].field_ai], ["AI-FIRE-3"])
        self.assertEqual(state.players[0].hand, [])
        self.assertEqual([item.id for item in state.players[0].discard], ["AI-FIRE-1"])
        self.assertEqual(state.log[-1]["power_3_discarded_card"], "AI-FIRE-1")

    def test_power_4_overheats_after_attack(self) -> None:
        state = new_game(1, no_opening_hands())
        state.players[0].field_ai = [card("AI-WATER-4")]
        state.players[1].deck = [card("AI-WATER-1")]
        start_turn(state)
        apply_action(state, Action(ActionType.ATTACK, 0))
        self.assertEqual(state.players[1].life, 4)
        self.assertEqual(state.players[0].field_ai, [])
        self.assertEqual(state.players[0].discard[0].id, "AI-WATER-4")

    def test_power_3_can_overheat_after_attack_when_configured(self) -> None:
        state = new_game(
            1,
            no_opening_hands(power_3_overheats_after_attack=True),
        )
        state.players[0].field_ai = [card("AI-FIRE-3")]
        start_turn(state)
        apply_action(state, Action(ActionType.ATTACK, 0))
        self.assertEqual(state.players[1].life, 4)
        self.assertEqual(state.players[0].field_ai, [])
        self.assertEqual([item.id for item in state.players[0].discard], ["AI-FIRE-3"])

    def test_power_4_overheat_can_be_disabled(self) -> None:
        state = new_game(
            1,
            no_opening_hands(power_4_overheats_after_attack=False),
        )
        state.players[0].field_ai = [card("AI-WATER-4")]
        start_turn(state)
        apply_action(state, Action(ActionType.ATTACK, 0))
        self.assertEqual(state.players[1].life, 4)
        self.assertEqual([item.id for item in state.players[0].field_ai], ["AI-WATER-4"])
        self.assertEqual(state.players[0].discard, [])

    def test_fire_4_draws_two_when_power_4_overheats(self) -> None:
        state = new_game(1, no_opening_hands())
        state.players[0].field_ai = [card("AI-FIRE-4")]
        state.players[0].deck = [card("AI-FIRE-1"), card("AI-FIRE-2")]
        start_turn(state)
        apply_action(state, Action(ActionType.ATTACK, 0))
        self.assertEqual(state.players[0].field_ai, [])
        self.assertEqual([item.id for item in state.players[0].discard], ["AI-FIRE-4"])
        self.assertEqual([item.id for item in state.players[0].hand], ["AI-FIRE-2", "AI-FIRE-1"])
        self.assertEqual(state.log[-1]["overheat_draw_count"], 2)

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

    def test_optimize_discards_one_card_before_drawing_two(self) -> None:
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
        ])
        self.assertEqual([item.id for item in state.players[0].hand], [
            "AI-WATER-1",
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
        state.players[0].hand = [command("CMD-RELEARN"), card("AI-FIRE-1")]
        state.players[0].discard = [card("AI-FIRE-1"), card("AI-WATER-4")]
        start_turn(state)
        apply_action(state, Action(ActionType.USE_COMMAND, 0))
        self.assertEqual(state.players[0].hand[0].id, "AI-WATER-4")
        self.assertEqual([item.id for item in state.players[0].discard], [
            "AI-FIRE-1",
            "AI-FIRE-1",
            "CMD-RELEARN",
        ])
        self.assertEqual(state.players[0].discard[-1].id, "CMD-RELEARN")

    def test_relearn_requires_another_hand_card_to_discard(self) -> None:
        state = new_game(1, no_opening_hands())
        state.players[0].hand = [command("CMD-RELEARN")]
        state.players[0].discard = [card("AI-WATER-4")]
        start_turn(state)
        with self.assertRaisesRegex(ValueError, "another hand card"):
            apply_action(state, Action(ActionType.USE_COMMAND, 0))

    def test_trinity_trashes_full_field_and_deals_one_damage(self) -> None:
        state = new_game(1, no_opening_hands())
        state.players[0].hand = [command("CMD-TRINITY")]
        state.players[0].field_ai = [
            card("AI-FIRE-1"),
            card("AI-WATER-2"),
            card("AI-WIND-3"),
        ]
        state.players[0].spent_field_ai = {1}
        start_turn(state)
        state.players[0].spent_field_ai = {1}
        apply_action(state, Action(ActionType.USE_COMMAND, 0))
        self.assertEqual(state.players[0].field_ai, [])
        self.assertEqual(state.players[0].spent_field_ai, set())
        self.assertEqual(state.players[1].life, 4)
        self.assertEqual([item.id for item in state.players[0].discard], [
            "AI-FIRE-1",
            "AI-WATER-2",
            "AI-WIND-3",
            "CMD-TRINITY",
        ])
        self.assertEqual(state.log[-1]["sacrificed_ai"], [
            "AI-FIRE-1",
            "AI-WATER-2",
            "AI-WIND-3",
        ])

    def test_disrupt_can_target_a_specific_ready_ai(self) -> None:
        state = new_game(1, no_opening_hands())
        state.players[0].hand = [command("CMD-DISRUPT")]
        state.players[1].field_ai = [card("AI-FIRE-4"), card("AI-WATER-1")]
        start_turn(state)
        apply_action(state, Action(ActionType.USE_COMMAND, 0, 1))
        self.assertNotIn(0, state.players[1].spent_field_ai)
        self.assertIn(1, state.players[1].spent_field_ai)

    def test_fire_rite_requires_fire_and_pressures_opponent_hand(self) -> None:
        state = new_game(1, no_opening_hands())
        state.players[0].hand = [command("CMD-FIRE-RITE")]
        state.players[0].field_ai = [card("AI-FIRE-1")]
        state.players[1].hand = [card("AI-WATER-1")]
        start_turn(state)
        apply_action(state, Action(ActionType.USE_COMMAND, 0))
        self.assertEqual([item.id for item in state.players[1].discard], ["AI-WATER-1"])
        self.assertEqual(state.players[1].life, 5)
        self.assertEqual(state.players[0].discard[0].id, "CMD-FIRE-RITE")

    def test_fire_rite_deals_damage_when_opponent_hand_is_empty(self) -> None:
        state = new_game(1, no_opening_hands())
        state.players[0].hand = [command("CMD-FIRE-RITE")]
        state.players[0].field_ai = [card("AI-FIRE-1")]
        start_turn(state)
        apply_action(state, Action(ActionType.USE_COMMAND, 0))
        self.assertEqual(state.players[1].life, 4)

    def test_water_rite_draws_one_without_discarding_hand(self) -> None:
        state = new_game(1, no_opening_hands())
        state.players[0].hand = [command("CMD-WATER-RITE"), card("AI-FIRE-1")]
        state.players[0].field_ai = [card("AI-WATER-1")]
        state.players[0].deck = [card("AI-WIND-1"), card("AI-EARTH-1")]
        start_turn(state)
        apply_action(state, Action(ActionType.USE_COMMAND, 0))
        self.assertEqual([item.id for item in state.players[0].discard], ["CMD-WATER-RITE"])
        self.assertEqual([item.id for item in state.players[0].hand], [
            "AI-FIRE-1",
            "AI-EARTH-1",
        ])
        self.assertEqual([item.id for item in state.players[0].deck], ["AI-WIND-1"])
        self.assertEqual(state.log[-1]["draw_count"], 1)

    def test_wind_rite_disrupts_enemy_and_readies_wind(self) -> None:
        state = new_game(1, no_opening_hands())
        state.players[0].hand = [command("CMD-WIND-RITE")]
        state.players[0].field_ai = [card("AI-WIND-1"), card("AI-FIRE-4")]
        state.players[0].spent_field_ai = {0, 1}
        state.players[1].field_ai = [card("AI-WATER-2")]
        start_turn(state)
        state.players[0].spent_field_ai = {0, 1}
        apply_action(state, Action(ActionType.USE_COMMAND, 0))
        self.assertNotIn(0, state.players[0].spent_field_ai)
        self.assertIn(1, state.players[0].spent_field_ai)
        self.assertIn(0, state.players[1].spent_field_ai)

    def test_earth_rite_recovers_ai_without_readying_earth(self) -> None:
        state = new_game(1, no_opening_hands())
        state.players[0].hand = [command("CMD-EARTH-RITE")]
        state.players[0].field_ai = [card("AI-EARTH-2")]
        state.players[0].spent_field_ai = {0}
        state.players[0].discard = [card("AI-FIRE-1"), card("AI-WATER-4")]
        start_turn(state)
        state.players[0].spent_field_ai = {0}
        apply_action(state, Action(ActionType.USE_COMMAND, 0))
        self.assertEqual([item.id for item in state.players[0].hand], ["AI-WATER-4"])
        self.assertIn(0, state.players[0].spent_field_ai)
        self.assertEqual(state.players[0].discard[-1].id, "CMD-EARTH-RITE")

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

    def test_pipeline_memory_draws_power_1_without_discarding(self) -> None:
        state = new_game(1, no_opening_hands())
        state.players[0].memory = memory("MEM-PIPELINE")
        state.players[0].hand = [card("AI-FIRE-1"), card("AI-WATER-2")]
        state.players[0].deck = [card("AI-EARTH-1")]
        start_turn(state)
        apply_action(state, Action(ActionType.PLAY_AI, 0))
        self.assertEqual([item.id for item in state.players[0].hand], [
            "AI-WATER-2",
            "AI-EARTH-1",
        ])
        self.assertEqual(state.players[0].discard, [])
        self.assertEqual(state.log[-1]["pipeline_draw_count"], 1)
        self.assertIsNone(state.log[-1]["pipeline_discarded_card"])

    def test_accelerator_memory_sacrifices_one_ai_and_adds_one_action(self) -> None:
        state = new_game(1, no_opening_hands(first_player_first_turn_actions=2))
        state.players[0].memory = memory("MEM-ACCELERATOR")
        state.players[0].field_ai = [card("AI-FIRE-1"), card("AI-WATER-2")]
        state.players[0].spent_field_ai = {1}
        start_turn(state)
        state.players[0].spent_field_ai = {1}
        apply_action(state, Action(ActionType.USE_MEMORY, target_index=1))
        self.assertEqual(state.actions_remaining, 3)
        self.assertEqual([item.id for item in state.players[0].field_ai], ["AI-FIRE-1"])
        self.assertEqual(state.players[0].spent_field_ai, set())
        self.assertEqual([item.id for item in state.players[0].discard], ["AI-WATER-2"])
        self.assertTrue(state.players[0].pending_effects["accelerator_used"])

    def test_charge_discards_one_hand_card_and_adds_restricted_action(self) -> None:
        state = new_game(1, no_opening_hands(first_player_first_turn_actions=2))
        state.players[0].hand = [card("AI-FIRE-1"), card("AI-WATER-3")]
        state.players[0].turns_started = 1
        state.turn = 1
        start_turn(state)
        apply_action(state, Action(ActionType.CHARGE, 0))
        self.assertEqual(state.actions_remaining, 3)
        self.assertEqual(state.charged_actions_remaining, 1)
        self.assertEqual([item.id for item in state.players[0].discard], ["AI-FIRE-1"])
        self.assertTrue(state.players[0].pending_effects["charge_used"])

    def test_charge_can_be_used_on_players_first_turn(self) -> None:
        state = new_game(1, no_opening_hands(first_player_first_turn_actions=1))
        state.players[0].hand = [card("AI-FIRE-1"), card("AI-WATER-3")]
        start_turn(state)
        apply_action(state, Action(ActionType.CHARGE, 0))
        self.assertEqual(state.actions_remaining, 2)
        self.assertEqual(state.charged_actions_remaining, 1)

    def test_charge_can_be_used_at_zero_actions(self) -> None:
        state = new_game(1, no_opening_hands(first_player_first_turn_actions=2))
        state.players[0].hand = [card("AI-FIRE-1")]
        start_turn(state)
        state.actions_remaining = 0
        apply_action(state, Action(ActionType.CHARGE, 0))
        self.assertEqual(state.actions_remaining, 1)
        self.assertEqual(state.charged_actions_remaining, 1)
        self.assertTrue(state.players[0].pending_effects["charge_used"])

    def test_power_3_or_higher_summons_cannot_be_charged(self) -> None:
        state = new_game(1, no_opening_hands(first_player_first_turn_actions=2))
        state.players[0].hand = [card("AI-WATER-3")]
        state.players[0].turns_started = 1
        state.turn = 1
        start_turn(state)
        with self.assertRaisesRegex(ValueError, "cannot be charged"):
            apply_action(state, Action(ActionType.CHARGE, 0))

    def test_charged_action_is_spent_first_by_non_attack_actions(self) -> None:
        state = new_game(1, no_opening_hands(first_player_first_turn_actions=2))
        state.players[0].hand = [card("AI-FIRE-1"), card("AI-WATER-1")]
        state.players[0].turns_started = 1
        state.turn = 1
        start_turn(state)
        apply_action(state, Action(ActionType.CHARGE, 0))
        apply_action(state, Action(ActionType.PLAY_AI, 0))
        self.assertEqual(state.actions_remaining, 2)
        self.assertEqual(state.charged_actions_remaining, 0)

    def test_charging_prevents_attacking_for_the_rest_of_turn(self) -> None:
        state = new_game(1, no_opening_hands(first_player_first_turn_actions=1))
        state.players[0].field_ai = [card("AI-WIND-1")]
        state.players[0].hand = [card("AI-FIRE-1")]
        state.players[1].deck = [card("AI-EARTH-1")]
        state.players[0].turns_started = 1
        state.turn = 1
        start_turn(state)
        apply_action(state, Action(ActionType.CHARGE, 0))
        self.assertEqual(state.actions_remaining, 3)
        self.assertEqual(state.charged_actions_remaining, 1)
        with self.assertRaisesRegex(ValueError, "cannot attack"):
            apply_action(state, Action(ActionType.ATTACK, 0))

    def test_fire_charge_summon_discards_opponent_hand_when_opponent_has_three_or_more(self) -> None:
        state = new_game(1, no_opening_hands(first_player_first_turn_actions=2))
        state.players[0].hand = [card("AI-FIRE-1C")]
        state.players[1].hand = [card("AI-WATER-1"), card("AI-WATER-2"), card("AI-WATER-3")]
        state.players[0].turns_started = 1
        state.turn = 1
        start_turn(state)
        apply_action(state, Action(ActionType.CHARGE, 0))
        self.assertEqual([item.id for item in state.players[1].hand], ["AI-WATER-2", "AI-WATER-3"])
        self.assertEqual([item.id for item in state.players[1].discard], ["AI-WATER-1"])

    def test_water_charge_summon_draws_one_card(self) -> None:
        state = new_game(1, no_opening_hands(first_player_first_turn_actions=2))
        state.players[0].hand = [card("AI-WATER-1C")]
        state.players[0].deck = [card("AI-FIRE-1")]
        state.players[0].turns_started = 1
        state.turn = 1
        start_turn(state)
        apply_action(state, Action(ActionType.CHARGE, 0))
        self.assertEqual([item.id for item in state.players[0].hand], ["AI-FIRE-1"])
        self.assertEqual([item.id for item in state.players[0].discard], ["AI-WATER-1C"])

    def test_wind_charge_summon_readies_spent_summon(self) -> None:
        state = new_game(1, no_opening_hands(first_player_first_turn_actions=2))
        state.players[0].field_ai = [card("AI-WIND-1")]
        state.players[0].spent_field_ai = {0}
        state.players[0].hand = [card("AI-WIND-2C")]
        state.players[0].turns_started = 1
        state.turn = 1
        start_turn(state)
        state.players[0].spent_field_ai = {0}
        apply_action(state, Action(ActionType.CHARGE, 0))
        self.assertEqual(state.players[0].spent_field_ai, set())

    def test_earth_charge_summon_adds_selected_next_defense_bonus_until_next_turn(self) -> None:
        state = new_game(1, no_opening_hands(first_player_first_turn_actions=2))
        state.players[0].field_ai = [card("AI-EARTH-3")]
        state.players[0].hand = [card("AI-EARTH-2C")]
        state.players[0].turns_started = 1
        state.turn = 1
        start_turn(state)
        apply_action(state, Action(ActionType.CHARGE, 0))
        self.assertEqual(state.players[0].charge_guarded_field_ai, {0})
        state.players[1].field_ai = [card("AI-FIRE-3B")]
        end_turn(state)
        start_turn(state)
        apply_action(state, Action(ActionType.ATTACK, 0))
        self.assertEqual(state.stats.successful_defenses, 1)
        self.assertEqual([item.id for item in state.players[0].discard], ["AI-EARTH-2C", "AI-EARTH-3"])

    def test_earth_charge_summon_does_not_boost_unselected_field_ai(self) -> None:
        state = new_game(1, no_opening_hands(first_player_first_turn_actions=2))
        state.players[0].field_ai = [card("AI-EARTH-2B"), card("AI-EARTH-3")]
        state.players[0].hand = [card("AI-EARTH-2C")]
        state.players[0].turns_started = 1
        state.turn = 1
        start_turn(state)
        apply_action(state, Action(ActionType.CHARGE, 0))
        self.assertEqual(state.players[0].charge_guarded_field_ai, {1})
        state.players[1].field_ai = [card("AI-FIRE-2")]
        end_turn(state)
        start_turn(state)
        apply_action(state, Action(ActionType.ATTACK, 0))
        self.assertEqual([item.id for item in state.players[0].field_ai], ["AI-EARTH-2B", "AI-EARTH-3"])
        self.assertEqual(state.players[0].spent_field_ai, {1})

    def test_resonator_memory_draws_after_charge_when_hand_is_low(self) -> None:
        state = new_game(1, no_opening_hands(first_player_first_turn_actions=2))
        state.players[0].memory = memory("MEM-RESONATOR")
        state.players[0].hand = [card("AI-FIRE-1")]
        state.players[0].deck = [card("AI-WATER-1")]
        state.players[0].turns_started = 1
        state.turn = 1
        start_turn(state)
        apply_action(state, Action(ActionType.CHARGE, 0))
        self.assertEqual([item.id for item in state.players[0].hand], ["AI-WATER-1"])
        self.assertEqual([item.id for item in state.players[0].discard], ["AI-FIRE-1"])

    def test_accelerator_added_action_can_be_used_to_attack(self) -> None:
        state = new_game(1, no_opening_hands(first_player_first_turn_actions=2))
        state.players[0].memory = memory("MEM-ACCELERATOR")
        state.players[0].field_ai = [card("AI-FIRE-1"), card("AI-WIND-1")]
        state.players[1].deck = [card("AI-EARTH-1")]
        start_turn(state)
        apply_action(state, Action(ActionType.USE_MEMORY, target_index=0))
        self.assertEqual(state.actions_remaining, 3)
        self.assertEqual(state.charged_actions_remaining, 0)
        apply_action(state, Action(ActionType.ATTACK, 0))
        self.assertEqual(state.actions_remaining, 2)

    def test_firewall_memory_adds_one_power_to_off_attribute_field_defense(self) -> None:
        state = new_game(1, no_opening_hands())
        state.players[0].field_ai = [card("AI-WATER-4")]
        state.players[1].field_ai = [card("AI-FIRE-4")]
        state.players[1].memory = memory("MEM-FIREWALL")
        state.players[1].hand = [card("AI-EARTH-1")]
        start_turn(state)
        apply_action(state, Action(ActionType.ATTACK, 0))
        self.assertEqual(state.stats.successful_defenses, 1)
        self.assertEqual(state.players[0].field_ai, [])
        self.assertEqual([item.id for item in state.players[1].field_ai], ["AI-FIRE-4"])
        self.assertIn(0, state.players[1].spent_field_ai)
        self.assertEqual(state.players[1].discard[0].id, "AI-EARTH-1")

    def test_firewall_memory_does_not_boost_same_attribute_field_defense(self) -> None:
        state = new_game(1, no_opening_hands())
        state.players[0].field_ai = [card("AI-WATER-4")]
        state.players[1].field_ai = [card("AI-WATER-3")]
        state.players[1].memory = memory("MEM-FIREWALL")
        state.players[1].hand = [card("AI-EARTH-1")]
        start_turn(state)
        apply_action(state, Action(ActionType.ATTACK, 0))
        self.assertEqual(state.stats.undefended_attacks, 1)
        self.assertEqual(state.players[1].life, 4)
        self.assertEqual([item.id for item in state.players[1].hand], ["AI-EARTH-1"])

    def test_sandbox_command_can_prevent_next_power_4_overheat(self) -> None:
        state = new_game(
            1,
            no_opening_hands(
                first_player_first_turn_actions=2,
                first_player_first_turn_can_attack=True,
            ),
        )
        state.players[0].field_ai = [card("AI-WATER-4")]
        state.players[0].hand = [command("CMD-SANDBOX")]
        state.players[1].deck = [card("AI-WATER-1")]
        start_turn(state)
        apply_action(state, Action(ActionType.USE_COMMAND, 0))
        apply_action(state, Action(ActionType.ATTACK, 0))
        self.assertEqual(state.players[0].field_ai[0].id, "AI-WATER-4")
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

    def test_exact_upgrade_step_blocks_skipping_power(self) -> None:
        state = new_game(
            1,
            no_opening_hands(
                first_player_first_turn_actions=2,
                exact_upgrade_step=True,
            ),
        )
        state.players[0].field_ai = [card("AI-FIRE-1")]
        state.players[0].hand = [card("AI-FIRE-3")]
        start_turn(state)
        with self.assertRaises(ValueError):
            apply_action(state, Action(ActionType.UPGRADE_AI, 0, 0))

    def test_exact_upgrade_step_allows_next_power(self) -> None:
        state = new_game(
            1,
            no_opening_hands(
                first_player_first_turn_actions=1,
                exact_upgrade_step=True,
            ),
        )
        state.players[0].field_ai = [card("AI-FIRE-2")]
        state.players[0].hand = [card("AI-FIRE-3")]
        start_turn(state)
        apply_action(state, Action(ActionType.UPGRADE_AI, 0, 0))
        self.assertEqual(state.players[0].field_ai[0].id, "AI-FIRE-3")

    def test_power_3_attack_recovery_delay_skips_next_ready_step(self) -> None:
        state = new_game(
            1,
            no_opening_hands(
                first_player_first_turn_actions=2,
                power_3_attack_recovery_delay=True,
            ),
        )
        state.players[0].field_ai = [card("AI-FIRE-3")]
        state.players[1].hand = [command("CMD-OPTIMIZE")]
        start_turn(state)
        apply_action(state, Action(ActionType.ATTACK, 0))
        self.assertIn(0, state.players[0].spent_field_ai)
        self.assertIn(0, state.players[0].power_3_recovery_delayed_field_ai)

        end_turn(state)
        start_turn(state)
        end_turn(state)
        start_turn(state)

        self.assertIn(0, state.players[0].spent_field_ai)
        self.assertEqual(state.players[0].power_3_recovery_delayed_field_ai, set())

        end_turn(state)
        start_turn(state)
        end_turn(state)
        start_turn(state)

        self.assertNotIn(0, state.players[0].spent_field_ai)

    def test_power_3_recovery_delay_clears_when_upgraded(self) -> None:
        state = new_game(
            1,
            no_opening_hands(
                first_player_first_turn_actions=2,
                power_3_attack_recovery_delay=True,
            ),
        )
        state.players[0].field_ai = [card("AI-FIRE-3")]
        state.players[0].hand = [card("AI-FIRE-4")]
        state.players[1].hand = [command("CMD-OPTIMIZE")]
        start_turn(state)
        apply_action(state, Action(ActionType.ATTACK, 0))
        apply_action(state, Action(ActionType.UPGRADE_AI, 0, 0))

        self.assertEqual(state.players[0].field_ai[0].id, "AI-FIRE-4")
        self.assertNotIn(0, state.players[0].spent_field_ai)
        self.assertEqual(state.players[0].power_3_recovery_delayed_field_ai, set())

    def test_large_ai_upgrade_cost_can_be_configured_to_one(self) -> None:
        state = new_game(
            1,
            no_opening_hands(
                first_player_first_turn_actions=1,
                large_ai_play_cost=3,
                large_ai_upgrade_cost=1,
            ),
        )
        state.players[0].field_ai = [card("AI-FIRE-1")]
        state.players[0].hand = [card("AI-FIRE-4")]
        start_turn(state)
        apply_action(state, Action(ActionType.UPGRADE_AI, 0, 0))
        self.assertEqual(state.players[0].field_ai[0].id, "AI-FIRE-4")
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

    def test_mono_attribute_decks_are_valid_twenty_card_decks(self) -> None:
        for archetype, attribute in (
            (DeckArchetype.FIRE, Attribute.FIRE),
            (DeckArchetype.WATER, Attribute.WATER),
            (DeckArchetype.WIND, Attribute.WIND),
            (DeckArchetype.EARTH, Attribute.EARTH),
        ):
            deck = build_deck(archetype)
            self.assertEqual(len(deck), 20)
            validate_same_name_limit(deck)
            ai_cards = [item for item in deck if item.attribute is not None]
            self.assertEqual({item.attribute for item in ai_cards}, {attribute})

    def test_league_returns_standings_for_selected_decks(self) -> None:
        summary = run_league(
            2,
            1,
            None,
            GameConfig(max_turns=50),
            (DeckArchetype.FIRE, DeckArchetype.WATER, DeckArchetype.WIND),
        )
        self.assertEqual(summary["total_games"], 12)
        self.assertEqual(set(summary["standings"]), {"fire", "water", "wind"})
        self.assertEqual(len(summary["pairs"]), 6)


if __name__ == "__main__":
    unittest.main()
