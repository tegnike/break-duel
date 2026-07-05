from __future__ import annotations

import unittest

from ai_break_duel.cards import (
    AI_CARD_POOL,
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
    pierces_hand_defense,
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
from ai_break_duel.simulation import run_league, run_match, run_simulation


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
                self.assertEqual(len(deck), 25)

    def test_preset_decks_limit_total_high_power_summons(self) -> None:
        for archetype in DeckArchetype:
            with self.subTest(archetype=archetype.value):
                high_power_count = sum(
                    1
                    for card in build_deck(archetype)
                    if card.type == CardType.AI and (card.power or 0) >= 3
                )
                self.assertLessEqual(high_power_count, 5)

    def test_preset_decks_keep_power_1_summons_trimmed(self) -> None:
        expectations = {
            DeckArchetype.BREAK: 3,
            DeckArchetype.CONTROL: 3,
            DeckArchetype.FIRE: 5,
            DeckArchetype.WATER: 6,
            DeckArchetype.WIND: 4,
            DeckArchetype.EARTH: 4,
        }
        for archetype, expected_count in expectations.items():
            with self.subTest(archetype=archetype.value):
                power_1_count = sum(
                    1
                    for card in build_deck(archetype)
                    if card.type == CardType.AI and card.power == 1
                )
                self.assertLessEqual(power_1_count, expected_count)

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

    def test_opening_hands_are_five_each_by_default(self) -> None:
        state = new_game(1)
        self.assertEqual(len(state.players[0].hand), 5)
        self.assertEqual(len(state.players[1].hand), 5)

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

    def test_beginner_profile_attacks_when_field_cannot_block(self) -> None:
        state = new_game(1, no_opening_hands(ai_profiles=("beginner", "challenger")))
        state.players[0].field_ai = [card("AI-FIRE-2")]
        state.players[1].field_ai = [card("AI-FIRE-1")]
        start_turn(state)
        action = choose_action(state)
        self.assertEqual(action.type, ActionType.ATTACK)
        self.assertEqual(action.source_index, 0)

    def test_beginner_profile_skips_attack_blocked_by_field_defender(self) -> None:
        state = new_game(1, no_opening_hands(ai_profiles=("beginner", "challenger")))
        state.players[0].field_ai = [card("AI-FIRE-1")]
        state.players[1].field_ai = [card("AI-WATER-2")]
        start_turn(state)
        self.assertEqual(choose_action(state).type, ActionType.END_TURN)

    def test_beginner_profile_defends_when_possible(self) -> None:
        state = new_game(1, no_opening_hands(ai_profiles=("challenger", "beginner")))
        state.players[0].field_ai = [card("AI-FIRE-1")]
        state.players[1].field_ai = [card("AI-WATER-2")]
        start_turn(state)
        apply_action(state, Action(ActionType.ATTACK, 0))
        self.assertEqual(state.players[1].life, 8)

    def test_beginner_profile_summons_with_field_room(self) -> None:
        state = new_game(1, no_opening_hands(ai_profiles=("beginner", "challenger")))
        state.players[0].field_ai = [card("AI-WATER-2")]
        state.players[0].hand = [card("AI-FIRE-1"), card("AI-FIRE-2")]
        state.players[1].field_ai = [card("AI-WATER-2")]
        start_turn(state)
        action = choose_action(state)
        self.assertEqual(action.type, ActionType.PLAY_AI)
        self.assertEqual(action.source_index, 0)

    def test_challenger_avoids_attack_crushed_by_field_defender(self) -> None:
        state = new_game(1, no_opening_hands(ai_profiles=("challenger", "challenger")))
        state.players[0].deck = []
        state.players[0].hand = []
        state.players[0].field_ai = [card("AI-WATER-1")]
        state.players[1].deck = []
        state.players[1].hand = []
        state.players[1].field_ai = [card("AI-FIRE-2")]
        start_turn(state)

        self.assertEqual(choose_action(state).type, ActionType.END_TURN)

    def test_challenger_skips_charge_without_followup_or_immediate_value(self) -> None:
        state = new_game(1, no_opening_hands(ai_profiles=("challenger", "challenger")))
        state.players[0].deck = []
        state.players[0].hand = [card("AI-FIRE-1C")]
        state.players[0].field_ai = []
        state.players[1].hand = []
        start_turn(state)
        state.actions_remaining = 0

        self.assertEqual(choose_action(state).type, ActionType.END_TURN)

    def test_challenger_skips_charge_for_summon_when_field_is_full(self) -> None:
        state = new_game(1, no_opening_hands(ai_profiles=("challenger", "challenger")))
        state.players[0].deck = []
        state.players[0].hand = [card("AI-FIRE-1"), card("AI-WIND-2")]
        state.players[0].field_ai = [card("AI-FIRE-2"), card("AI-WATER-2"), card("AI-EARTH-2")]
        state.players[0].spent_field_ai = {0, 1, 2}
        start_turn(state)
        state.actions_remaining = 2
        state.players[0].spent_field_ai = {0, 1, 2}

        self.assertEqual(choose_action(state).type, ActionType.END_TURN)

    def test_challenger_skips_accelerator_without_play_enable(self) -> None:
        state = new_game(1, no_opening_hands(ai_profiles=("challenger", "challenger")))
        state.players[0].deck = []
        state.players[0].hand = []
        state.players[0].memory = memory("MEM-ACCELERATOR")
        state.players[0].field_ai = [card("AI-WATER-1")]
        start_turn(state)
        state.actions_remaining = 1
        state.players[0].spent_field_ai = {0}

        self.assertEqual(choose_action(state).type, ActionType.END_TURN)

    def test_challenger_profile_beats_beginner_same_deck(self) -> None:
        challenger_wins = 0
        games = 24
        config = GameConfig(ai_profiles=("challenger", "beginner"))
        for offset in range(games):
            result = run_match(9000 + offset, config, (DeckArchetype.FIRE, DeckArchetype.FIRE))
            if result.summary["winner"] == "player_1":
                challenger_wins += 1
        # WP4 (2026-07-04) 以降、初心者は防御と単純攻撃を行うため全勝は期待しない。
        # 目標水準: 挑戦者が大きく勝ち越しつつ、初心者も 5-20% 程度勝てること。
        self.assertGreaterEqual(challenger_wins / games, 0.7)

    def test_players_use_different_decks_by_default(self) -> None:
        player_1_deck = [item.id for item in build_player_deck(0)]
        player_2_deck = [item.id for item in build_player_deck(1)]
        self.assertEqual(len(player_1_deck), 25)
        self.assertEqual(len(player_2_deck), 25)
        self.assertNotEqual(player_1_deck, player_2_deck)
        self.assertIn("MEM-RECOVERY-CACHE", player_1_deck)
        self.assertIn("MEM-RECOVERY-CACHE", player_2_deck)

    def test_fixed_decks_cover_card_pool_and_required_card_types(self) -> None:
        for archetype in DeckArchetype:
            deck = build_deck(archetype)
            self.assertEqual(len(deck), 25, archetype.value)
            validate_same_name_limit(deck)

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

    def test_inactive_cards_stay_out_of_fixed_decks(self) -> None:
        inactive_card_ids = {
            card.id
            for card in [*AI_CARD_POOL, *COMMAND_CARD_POOL, *MEMORY_CARD_POOL]
            if card.status == CardStatus.INACTIVE.value
        }
        # 2026-07-05 のリワークで CMD-PATCH は再アクティブ化済み。
        self.assertNotIn("CMD-PATCH", inactive_card_ids)
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
            self.assertEqual(
                {card.attribute for card in deck if card.type == CardType.AI},
                {attribute},
                archetype.value,
            )

    def test_undefended_attack_deals_scaled_damage_and_break_draw(self) -> None:
        state = new_game(1, no_opening_hands())
        state.players[0].field_ai = [card("AI-WATER-4")]
        state.players[1].deck = [card("AI-WATER-1")]
        start_turn(state)
        apply_action(state, Action(ActionType.ATTACK, 0))
        self.assertEqual(state.players[1].life, 4)
        self.assertEqual(len(state.players[1].hand), 1)
        self.assertEqual(state.players[1].cards_drawn, 1)
        self.assertEqual(state.stats.undefended_attacks, 1)

    def test_hand_defense_prevents_damage_without_removing_attacker(self) -> None:
        state = new_game(
            1,
            no_opening_hands(),
        )
        state.players[0].field_ai = [card("AI-WATER-3")]
        state.players[1].hand = [card("AI-WATER-4")]
        start_turn(state)
        apply_action(state, Action(ActionType.ATTACK, 0))
        self.assertEqual(state.players[1].life, 8)
        self.assertEqual([item.id for item in state.players[0].field_ai], ["AI-WATER-3"])
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
        self.assertEqual(state.players[1].life, 8)
        self.assertEqual([item.id for item in state.players[1].field_ai], ["AI-FIRE-2"])
        self.assertEqual([item.id for item in state.players[0].field_ai], ["AI-WATER-3"])
        self.assertEqual(state.players[1].discard[0].id, "AI-WATER-3")
        self.assertEqual(state.stats.successful_defenses, 1)

    def test_ai_prefers_surviving_field_defense_over_lower_hand_defense(self) -> None:
        state = new_game(1, no_opening_hands())
        state.players[0].field_ai = [card("AI-WATER-2")]
        state.players[1].field_ai = [card("AI-WATER-3")]
        state.players[1].hand = [card("AI-WATER-2")]
        start_turn(state)
        apply_action(state, Action(ActionType.ATTACK, 0))
        self.assertEqual([item.id for item in state.players[1].field_ai], ["AI-WATER-3"])
        self.assertIn(0, state.players[1].spent_field_ai)
        self.assertEqual([item.id for item in state.players[1].hand], ["AI-WATER-2"])
        self.assertEqual([item.id for item in state.players[0].discard], ["AI-WATER-2"])
        self.assertEqual(state.players[1].discard, [])
        self.assertEqual(state.log[-1]["defense_result"], "success")

    def test_ai_prefers_field_trade_over_hand_defense(self) -> None:
        state = new_game(1, no_opening_hands())
        state.players[0].field_ai = [card("AI-WATER-2")]
        state.players[1].field_ai = [card("AI-WATER-2")]
        state.players[1].hand = [card("AI-WATER-2")]
        start_turn(state)
        apply_action(state, Action(ActionType.ATTACK, 0))
        self.assertEqual(state.players[0].field_ai, [])
        self.assertEqual(state.players[1].field_ai, [])
        self.assertEqual([item.id for item in state.players[1].hand], ["AI-WATER-2"])
        self.assertEqual([item.id for item in state.players[1].discard], ["AI-WATER-2"])
        self.assertEqual(state.log[-1]["defense_result"], "success_trade")

    def test_hand_defense_is_limited_to_once_per_turn_by_default(self) -> None:
        state = new_game(
            1,
            no_opening_hands(first_player_first_turn_actions=2),
        )
        state.players[0].field_ai = [card("AI-WATER-3"), card("AI-WATER-3")]
        state.players[1].hand = [card("AI-WATER-4"), card("AI-WATER-4")]
        start_turn(state)
        apply_action(state, Action(ActionType.ATTACK, 0))
        apply_action(state, Action(ActionType.ATTACK, 1))
        self.assertEqual(state.players[1].life, 5)
        self.assertEqual(state.players[1].hand_defenses_used_this_turn, 1)
        self.assertEqual(len(state.players[1].hand), 4)
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
        state = new_game(1, no_opening_hands(first_player_first_turn_actions=3))
        state.players[0].hand = [card("AI-WATER-3")]
        state.players[0].deck = [card("AI-FIRE-1")]
        start_turn(state)
        apply_action(state, Action(ActionType.PLAY_AI, 0))
        self.assertEqual(state.players[0].cards_drawn, 1)
        self.assertEqual([item.id for item in state.players[0].hand], ["AI-FIRE-1"])

    def test_play_ai_keeps_field_stacks_aligned_with_field_ai(self) -> None:
        state = new_game(1, no_opening_hands())
        state.players[0].hand = [card("AI-FIRE-1")]
        start_turn(state)
        apply_action(state, Action(ActionType.PLAY_AI, 0))
        self.assertEqual(len(state.players[0].field_stacks), len(state.players[0].field_ai))
        self.assertEqual(state.players[0].field_stacks, [[]])

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
        state = new_game(1, no_opening_hands(first_player_first_turn_actions=3))
        state.players[0].field_ai = [card("AI-EARTH-1")]
        state.players[0].hand = [card("AI-EARTH-4")]
        start_turn(state)
        apply_action(state, Action(ActionType.UPGRADE_AI, 0, target_index=0))
        self.assertEqual([item.id for item in state.players[0].hand], [])
        self.assertEqual([item.id for item in state.players[0].field_stacks[0]], ["AI-EARTH-1"])
        self.assertEqual(state.players[0].discard, [])

    def test_spend_enemy_on_play_ai_spends_ready_opponent(self) -> None:
        state = new_game(1, no_opening_hands(first_player_first_turn_actions=4))
        state.players[0].hand = [card("AI-WIND-4B")]
        state.players[1].field_ai = [card("AI-FIRE-1"), card("AI-FIRE-4")]
        start_turn(state)
        apply_action(state, Action(ActionType.PLAY_AI, 0))
        self.assertIn(1, state.players[1].spent_field_ai)

    def test_recover_ai_on_play_returns_ai_from_discard(self) -> None:
        state = new_game(1, no_opening_hands(first_player_first_turn_actions=4))
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
        self.assertEqual(len(ai_ids), 40)
        for code in ("FIRE", "WATER", "WIND", "EARTH"):
            for power in (1, 2, 3, 4):
                self.assertIn(f"AI-{code}-{power}", ai_ids)
                self.assertIn(f"AI-{code}-{power}B", ai_ids)
        self.assertIn("AI-FIRE-1C", ai_ids)
        self.assertIn("AI-WATER-1C", ai_ids)
        self.assertIn("AI-WIND-2C", ai_ids)
        self.assertIn("AI-EARTH-2C", ai_ids)
        self.assertIn("AI-FIRE-2C", ai_ids)
        self.assertIn("AI-WATER-2C", ai_ids)
        self.assertIn("AI-WIND-1C", ai_ids)
        self.assertIn("AI-EARTH-1C", ai_ids)

    def test_card_pool_totals_sixty_active_cards(self) -> None:
        from ai_break_duel.cards import ACTIVE_CARD_POOL

        self.assertEqual(len(AI_CARD_POOL), 40)
        self.assertEqual(len(COMMAND_CARD_POOL), 12)
        self.assertEqual(len(MEMORY_CARD_POOL), 8)
        self.assertEqual(len(ACTIVE_CARD_POOL), 60)

    def test_fire_charge_plus_summon_discards_when_opponent_has_two_or_more(self) -> None:
        state = new_game(1, no_opening_hands(first_player_first_turn_actions=2))
        state.players[0].hand = [card("AI-FIRE-2C")]
        state.players[1].hand = [card("AI-WATER-1"), card("AI-WATER-2")]
        start_turn(state)
        apply_action(state, Action(ActionType.CHARGE, 0))
        self.assertEqual(len(state.players[1].hand), 1)
        self.assertEqual(len(state.players[1].discard), 1)

    def test_fire_charge_plus_summon_spares_a_single_opponent_card(self) -> None:
        state = new_game(1, no_opening_hands(first_player_first_turn_actions=2))
        state.players[0].hand = [card("AI-FIRE-2C")]
        state.players[1].hand = [card("AI-WATER-1")]
        start_turn(state)
        apply_action(state, Action(ActionType.CHARGE, 0))
        self.assertEqual(len(state.players[1].hand), 1)
        self.assertEqual(state.players[1].discard, [])

    def test_water_charge_surge_summon_draws_two_when_hand_is_low(self) -> None:
        state = new_game(1, no_opening_hands(first_player_first_turn_actions=2))
        state.players[0].hand = [card("AI-WATER-2C")]
        state.players[0].deck = [card("AI-FIRE-1"), card("AI-FIRE-2"), card("AI-FIRE-3")]
        start_turn(state)
        apply_action(state, Action(ActionType.CHARGE, 0))
        self.assertEqual(len(state.players[0].hand), 2)

    def test_water_charge_surge_summon_does_not_draw_with_three_or_more_in_hand(self) -> None:
        state = new_game(1, no_opening_hands(first_player_first_turn_actions=2))
        state.players[0].hand = [
            card("AI-WATER-2C"),
            card("AI-WATER-1"),
            card("AI-WATER-2"),
            card("AI-WATER-3"),
        ]
        state.players[0].deck = [card("AI-FIRE-1")]
        start_turn(state)
        apply_action(state, Action(ActionType.CHARGE, 0))
        self.assertEqual(len(state.players[0].hand), 3)

    def test_wind_charge_spend_summon_spends_strongest_ready_enemy(self) -> None:
        state = new_game(1, no_opening_hands(first_player_first_turn_actions=2))
        state.players[0].hand = [card("AI-WIND-1C")]
        state.players[1].field_ai = [card("AI-FIRE-1"), card("AI-FIRE-4")]
        start_turn(state)
        apply_action(state, Action(ActionType.CHARGE, 0))
        self.assertEqual(state.players[1].spent_field_ai, {1})

    def test_earth_charge_recover_summon_does_not_recover_with_large_hand(self) -> None:
        state = new_game(1, no_opening_hands(first_player_first_turn_actions=2))
        state.players[0].hand = [
            card("AI-EARTH-1C"),
            card("AI-EARTH-1"),
            card("AI-EARTH-2"),
            card("AI-EARTH-2B"),
        ]
        state.players[0].discard = [card("AI-EARTH-3")]
        start_turn(state)
        apply_action(state, Action(ActionType.CHARGE, 0))
        self.assertEqual(len(state.players[0].hand), 3)
        self.assertEqual(
            [item.id for item in state.players[0].discard],
            ["AI-EARTH-3", "AI-EARTH-1C"],
        )

    def test_earth_charge_recover_summon_returns_summon_but_not_itself(self) -> None:
        state = new_game(1, no_opening_hands(first_player_first_turn_actions=2))
        state.players[0].hand = [card("AI-EARTH-1C")]
        state.players[0].discard = [card("AI-EARTH-3")]
        start_turn(state)
        apply_action(state, Action(ActionType.CHARGE, 0))
        self.assertEqual([item.id for item in state.players[0].hand], ["AI-EARTH-3"])
        self.assertEqual([item.id for item in state.players[0].discard], ["AI-EARTH-1C"])

        empty = new_game(1, no_opening_hands(first_player_first_turn_actions=2))
        empty.players[0].hand = [card("AI-EARTH-1C")]
        start_turn(empty)
        apply_action(empty, Action(ActionType.CHARGE, 0))
        self.assertEqual(empty.players[0].hand, [])
        self.assertEqual([item.id for item in empty.players[0].discard], ["AI-EARTH-1C"])

    def test_patch_command_readies_summon_and_draws(self) -> None:
        state = new_game(1, no_opening_hands())
        state.players[0].hand = [command("CMD-PATCH")]
        state.players[0].field_ai = [card("AI-FIRE-2")]
        state.players[0].deck = [card("AI-WATER-1")]
        start_turn(state)
        state.players[0].spent_field_ai = {0}
        apply_action(state, Action(ActionType.USE_COMMAND, 0))
        self.assertEqual(state.players[0].spent_field_ai, set())
        self.assertEqual([item.id for item in state.players[0].hand], ["AI-WATER-1"])
        self.assertIn("CMD-PATCH", [item.id for item in state.players[0].discard])

    def test_war_banner_draws_once_per_turn_on_attack_damage(self) -> None:
        state = new_game(
            1,
            no_opening_hands(
                first_player_first_turn_actions=3,
                first_player_first_turn_can_attack=True,
            ),
        )
        state.players[0].memory = memory("MEM-WAR-BANNER")
        state.players[0].field_ai = [card("AI-FIRE-1"), card("AI-WIND-1")]
        state.players[0].deck = [card("AI-FIRE-2"), card("AI-FIRE-3")]
        state.players[1].deck = [card("AI-WATER-1"), card("AI-WATER-2"), card("AI-WATER-3")]
        start_turn(state)
        apply_action(state, Action(ActionType.ATTACK, 0))
        self.assertEqual(len(state.players[0].hand), 1)
        self.assertTrue(state.players[0].pending_effects["war_banner_used"])
        apply_action(state, Action(ActionType.ATTACK, 1))
        self.assertEqual(len(state.players[0].hand), 1)

    def test_grove_rest_readies_one_summon_at_end_of_turn_when_behind_and_two_are_spent(self) -> None:
        state = new_game(1, no_opening_hands())
        state.players[0].memory = memory("MEM-GROVE")
        state.players[0].life = 5
        state.players[0].field_ai = [card("AI-EARTH-2"), card("AI-EARTH-1")]
        state.players[1].deck = [card("AI-WATER-1")]
        start_turn(state)
        state.players[0].spent_field_ai = {0, 1}
        end_turn(state)
        self.assertEqual(state.players[0].spent_field_ai, {1})

    def test_grove_rest_does_nothing_with_a_single_spent_summon(self) -> None:
        state = new_game(1, no_opening_hands())
        state.players[0].memory = memory("MEM-GROVE")
        state.players[0].life = 5
        state.players[0].field_ai = [card("AI-EARTH-2")]
        state.players[1].deck = [card("AI-WATER-1")]
        start_turn(state)
        state.players[0].spent_field_ai = {0}
        end_turn(state)
        self.assertEqual(state.players[0].spent_field_ai, {0})

    def test_grove_rest_does_nothing_when_life_is_not_behind(self) -> None:
        state = new_game(1, no_opening_hands())
        state.players[0].memory = memory("MEM-GROVE")
        state.players[0].field_ai = [card("AI-EARTH-2"), card("AI-EARTH-1")]
        state.players[1].deck = [card("AI-WATER-1")]
        start_turn(state)
        state.players[0].spent_field_ai = {0, 1}
        end_turn(state)
        self.assertEqual(state.players[0].spent_field_ai, {0, 1})

    def test_block_pressure_discards_after_successful_hand_defense(self) -> None:
        state = new_game(1, no_opening_hands())
        state.players[0].field_ai = [card("AI-FIRE-1B")]
        state.players[1].hand = [card("AI-EARTH-1"), card("AI-WATER-1")]
        start_turn(state)
        apply_action(state, Action(ActionType.ATTACK, 0))
        self.assertEqual(state.players[1].life, 8)
        self.assertEqual([item.id for item in state.players[1].discard], ["AI-EARTH-1", "AI-WATER-1"])
        self.assertEqual(state.log[-1]["block_pressure_discarded_card"], "AI-WATER-1")

    def test_hand_defense_pierce_still_deals_damage(self) -> None:
        state = new_game(1, no_opening_hands())
        state.players[0].field_ai = [card("AI-FIRE-2B")]
        state.players[1].hand = [card("AI-EARTH-2")]
        start_turn(state)
        apply_action(state, Action(ActionType.ATTACK, 0))
        self.assertEqual(state.players[1].life, 7)
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
        self.assertEqual(state.players[1].life, 8)
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
        self.assertEqual(state.players[1].life, -2)
        self.assertEqual(state.players[1].hand[0].id, "AI-EARTH-4B")
        self.assertEqual(len(state.players[1].hand), 5)

    def test_low_life_finisher_play_has_no_self_damage(self) -> None:
        state = new_game(1, no_opening_hands(first_player_first_turn_actions=4))
        state.players[0].hand = [card("AI-FIRE-4B")]
        start_turn(state)
        apply_action(state, Action(ActionType.PLAY_AI, 0))
        self.assertEqual(state.players[0].life, 8)
        self.assertEqual(state.log[-1]["effect_self_damage"], 0)

    def test_opponent_draw_on_play_cost_draws_for_opponent(self) -> None:
        state = new_game(1, no_opening_hands(first_player_first_turn_actions=4))
        state.players[0].hand = [card("AI-WATER-4B")]
        state.players[1].deck = [card("AI-FIRE-1")]
        start_turn(state)
        apply_action(state, Action(ActionType.PLAY_AI, 0))
        self.assertEqual([item.id for item in state.players[1].hand], ["AI-FIRE-1"])
        self.assertEqual(state.log[-1]["effect_opponent_draw_count"], 1)

    def test_wind_3b_draws_and_readies_spent_summon(self) -> None:
        state = new_game(1, no_opening_hands(first_player_first_turn_actions=3))
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
        self.assertEqual(state.players[1].life, 7)
        self.assertEqual(state.players[1].hand[0].id, "AI-WATER-1B")
        self.assertEqual(len(state.players[1].hand), 2)

    def test_power_3_cannot_hand_defend_when_configured(self) -> None:
        state = new_game(1, no_opening_hands(power_3_cannot_hand_defend=True))
        state.players[0].field_ai = [card("AI-FIRE-1")]
        state.players[1].hand = [card("AI-WATER-3")]
        start_turn(state)
        apply_action(state, Action(ActionType.ATTACK, 0))
        self.assertEqual(state.players[1].life, 7)
        self.assertEqual(state.players[1].hand[0].id, "AI-WATER-3")
        self.assertEqual(len(state.players[1].hand), 2)

    def test_power_3_cannot_field_defend_when_configured(self) -> None:
        state = new_game(1, no_opening_hands(power_3_cannot_field_defend=True))
        state.players[0].field_ai = [card("AI-FIRE-1")]
        state.players[1].field_ai = [card("AI-WATER-3")]
        start_turn(state)
        apply_action(state, Action(ActionType.ATTACK, 0))
        self.assertEqual(state.players[1].life, 7)
        self.assertEqual([item.id for item in state.players[1].field_ai], ["AI-WATER-3"])

    def test_enters_spent_drawback_spends_card_on_play(self) -> None:
        state = new_game(1, no_opening_hands(first_player_first_turn_actions=4))
        state.players[0].hand = [card("AI-WIND-2B")]
        start_turn(state)
        apply_action(state, Action(ActionType.PLAY_AI, 0))
        self.assertIn(0, state.players[0].spent_field_ai)

    def test_earth_power_4b_play_does_not_enter_spent(self) -> None:
        state = new_game(1, no_opening_hands(first_player_first_turn_actions=4))
        state.players[0].hand = [card("AI-EARTH-4B")]
        start_turn(state)
        apply_action(state, Action(ActionType.PLAY_AI, 0))
        self.assertNotIn(0, state.players[0].spent_field_ai)

    def test_wind_power_4b_overheats_to_discard_after_attack(self) -> None:
        state = new_game(1, no_opening_hands())
        state.players[0].field_ai = [card("AI-WIND-4B")]
        start_turn(state)
        apply_action(state, Action(ActionType.ATTACK, 0))
        self.assertEqual(state.players[0].hand, [])
        self.assertEqual([item.id for item in state.players[0].discard], ["AI-WIND-4B"])

    def test_wind_power_4_returns_to_hand_after_attack(self) -> None:
        state = new_game(1, no_opening_hands())
        state.players[0].field_ai = [card("AI-WIND-4")]
        start_turn(state)
        apply_action(state, Action(ActionType.ATTACK, 0))
        self.assertEqual([item.id for item in state.players[0].hand], ["AI-WIND-4"])
        self.assertEqual(state.players[0].discard, [])

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
        self.assertEqual(state.players[1].life, 5)
        self.assertEqual(state.players[1].hand[0].id, "AI-EARTH-2")
        self.assertEqual(len(state.players[1].hand), 4)
        self.assertEqual(state.stats.undefended_attacks, 1)

    def test_summon_cost_matches_power(self) -> None:
        state = new_game(1, no_opening_hands())
        state.players[0].hand = [
            card("AI-FIRE-1"),
            card("AI-FIRE-2"),
            card("AI-FIRE-3"),
        ]
        start_turn(state)
        state.actions_remaining = 6
        apply_action(state, Action(ActionType.PLAY_AI, 0))
        apply_action(state, Action(ActionType.PLAY_AI, 0))
        apply_action(state, Action(ActionType.PLAY_AI, 0))
        self.assertEqual(state.actions_remaining, 0)
        self.assertEqual([item.id for item in state.players[0].field_ai], [
            "AI-FIRE-1",
            "AI-FIRE-2",
            "AI-FIRE-3",
        ])

    def test_power_3_requires_three_actions_to_play_directly(self) -> None:
        state = new_game(1, no_opening_hands(first_player_first_turn_actions=2))
        state.players[0].hand = [card("AI-FIRE-3")]
        start_turn(state)
        with self.assertRaises(ValueError):
            apply_action(state, Action(ActionType.PLAY_AI, 0))

    def test_power_4_requires_four_actions_to_play_directly(self) -> None:
        state = new_game(1, no_opening_hands(first_player_first_turn_actions=3))
        state.players[0].hand = [card("AI-FIRE-4")]
        start_turn(state)
        with self.assertRaises(ValueError):
            apply_action(state, Action(ActionType.PLAY_AI, 0))

    def test_recovery_cache_discounts_first_summon_when_behind(self) -> None:
        state = new_game(1, no_opening_hands(first_player_first_turn_actions=2))
        state.players[0].memory = memory("MEM-RECOVERY-CACHE")
        state.players[0].life = 3
        state.players[1].life = 5
        state.players[0].hand = [card("AI-FIRE-3")]
        start_turn(state)
        apply_action(state, Action(ActionType.PLAY_AI, 0))
        self.assertEqual(state.actions_remaining, 0)
        self.assertEqual([item.id for item in state.players[0].field_ai], ["AI-FIRE-3"])

    def test_recovery_cache_only_discounts_first_summon_each_turn(self) -> None:
        state = new_game(1, no_opening_hands(first_player_first_turn_actions=3))
        state.players[0].memory = memory("MEM-RECOVERY-CACHE")
        state.players[0].life = 3
        state.players[1].life = 5
        state.players[0].hand = [card("AI-FIRE-2"), card("AI-WATER-2")]
        start_turn(state)
        apply_action(state, Action(ActionType.PLAY_AI, 0))
        self.assertEqual(state.actions_remaining, 2)
        apply_action(state, Action(ActionType.PLAY_AI, 0))
        self.assertEqual(state.actions_remaining, 0)

    def test_fire_3_pierces_hand_defense(self) -> None:
        self.assertEqual(attack_combat_value(card("AI-FIRE-3")), 3)
        self.assertTrue(pierces_hand_defense(card("AI-FIRE-3")))

    def test_power_3_defense_modifier_can_be_configured(self) -> None:
        state = new_game(1, no_opening_hands(power_3_defense_modifier=-1))
        state.players[0].field_ai = [card("AI-FIRE-3")]
        state.players[1].field_ai = [card("AI-WATER-3")]
        start_turn(state)
        apply_action(state, Action(ActionType.ATTACK, 0))
        self.assertEqual(state.players[1].life, 5)
        self.assertEqual(state.players[0].field_ai, [card("AI-FIRE-3")])
        self.assertEqual(state.players[1].field_ai, [card("AI-WATER-3")])

    def test_power_4_enters_ready(self) -> None:
        state = new_game(1, no_opening_hands(first_player_first_turn_actions=4))
        state.players[0].hand = [card("AI-FIRE-4")]
        start_turn(state)
        apply_action(state, Action(ActionType.PLAY_AI, 0))
        self.assertNotIn(0, state.players[0].spent_field_ai)
        self.assertEqual(state.actions_remaining, 0)

    def test_power_3_can_enter_spent_when_configured(self) -> None:
        state = new_game(
            1,
            no_opening_hands(
                first_player_first_turn_actions=3,
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
                first_player_first_turn_actions=3,
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
        state.players[0].field_ai = [card("AI-FIRE-4")]
        state.players[1].deck = [card("AI-WATER-1")]
        start_turn(state)
        apply_action(state, Action(ActionType.ATTACK, 0))
        self.assertEqual(state.players[1].life, 4)
        self.assertEqual(state.players[0].field_ai, [])
        self.assertEqual(state.players[0].discard[0].id, "AI-FIRE-4")

    def test_power_3_can_overheat_after_attack_when_configured(self) -> None:
        state = new_game(
            1,
            no_opening_hands(power_3_overheats_after_attack=True),
        )
        state.players[0].field_ai = [card("AI-FIRE-3")]
        start_turn(state)
        apply_action(state, Action(ActionType.ATTACK, 0))
        self.assertEqual(state.players[1].life, 5)
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

    def test_fire_4_draws_one_when_power_4_overheats(self) -> None:
        state = new_game(1, no_opening_hands())
        state.players[0].field_ai = [card("AI-FIRE-4")]
        state.players[0].deck = [card("AI-FIRE-1"), card("AI-FIRE-2")]
        start_turn(state)
        apply_action(state, Action(ActionType.ATTACK, 0))
        self.assertEqual(state.players[0].field_ai, [])
        self.assertEqual([item.id for item in state.players[0].discard], ["AI-FIRE-4"])
        self.assertEqual([item.id for item in state.players[0].hand], ["AI-FIRE-2"])
        self.assertEqual(state.log[-1]["overheat_draw_count"], 1)

    def test_water_4b_draws_one_after_overheat_and_opponent_draws_on_play(self) -> None:
        state = new_game(1, no_opening_hands())
        state.players[0].hand = [card("AI-WATER-4B")]
        state.players[0].field_ai = [card("AI-WATER-2")]
        state.players[0].deck = [card("AI-WATER-1"), card("AI-WATER-2")]
        state.players[1].deck = [card("AI-FIRE-1")]
        state.actions_remaining = 4
        apply_action(state, Action(ActionType.UPGRADE_AI, 0, 0))
        self.assertEqual([item.id for item in state.players[1].hand], ["AI-FIRE-1"])
        apply_action(state, Action(ActionType.ATTACK, 0))
        self.assertEqual([item.id for item in state.players[0].discard], ["AI-WATER-4B", "AI-WATER-2"])
        self.assertEqual([item.id for item in state.players[0].hand], ["AI-WATER-2"])
        self.assertEqual(state.log[-1]["overheat_draw_count"], 1)

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
        self.assertEqual(state.players[1].life, 7)
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
        self.assertEqual(state.players[1].life, 8)
        self.assertEqual(state.players[0].discard[0].id, "CMD-FIRE-RITE")

    def test_fire_rite_deals_damage_when_opponent_hand_is_empty(self) -> None:
        state = new_game(1, no_opening_hands())
        state.players[0].hand = [command("CMD-FIRE-RITE")]
        state.players[0].field_ai = [card("AI-FIRE-1")]
        start_turn(state)
        apply_action(state, Action(ActionType.USE_COMMAND, 0))
        self.assertEqual(state.players[1].life, 7)

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

    def test_wind_rite_can_target_specific_enemy_and_wind_summons(self) -> None:
        state = new_game(1, no_opening_hands())
        state.players[0].hand = [command("CMD-WIND-RITE")]
        state.players[0].field_ai = [card("AI-WIND-1"), card("AI-WIND-3")]
        state.players[0].spent_field_ai = {0, 1}
        state.players[1].field_ai = [card("AI-FIRE-4"), card("AI-WATER-2")]
        start_turn(state)
        state.players[0].spent_field_ai = {0, 1}
        apply_action(state, Action(
            ActionType.USE_COMMAND,
            0,
            target_index=1,
            secondary_target_index=0,
        ))
        self.assertNotIn(0, state.players[0].spent_field_ai)
        self.assertIn(1, state.players[0].spent_field_ai)
        self.assertNotIn(0, state.players[1].spent_field_ai)
        self.assertIn(1, state.players[1].spent_field_ai)

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

    def test_earth_rite_can_target_a_specific_discarded_ai(self) -> None:
        state = new_game(1, no_opening_hands())
        state.players[0].hand = [command("CMD-EARTH-RITE")]
        state.players[0].field_ai = [card("AI-EARTH-2")]
        state.players[0].discard = [card("AI-FIRE-1"), card("AI-WATER-4")]
        start_turn(state)
        apply_action(state, Action(ActionType.USE_COMMAND, 0, 0))
        self.assertEqual([item.id for item in state.players[0].hand], ["AI-FIRE-1"])
        self.assertEqual([item.id for item in state.players[0].discard], [
            "AI-WATER-4",
            "CMD-EARTH-RITE",
        ])

    def test_comeback_rite_draws_and_readies_when_behind(self) -> None:
        state = new_game(1, no_opening_hands())
        state.players[0].life = 3
        state.players[1].life = 5
        state.players[0].hand = [command("CMD-COMEBACK-RITE")]
        state.players[0].field_ai = [card("AI-FIRE-2")]
        state.players[0].deck = [card("AI-FIRE-1"), card("AI-FIRE-1B")]
        start_turn(state)
        state.players[0].spent_field_ai = {0}
        apply_action(state, Action(ActionType.USE_COMMAND, 0))
        self.assertNotIn(0, state.players[0].spent_field_ai)
        self.assertEqual(
            sorted(item.id for item in state.players[0].hand),
            ["AI-FIRE-1", "AI-FIRE-1B"],
        )
        self.assertEqual(state.players[0].discard[-1].id, "CMD-COMEBACK-RITE")
        self.assertEqual(state.log[-1]["readied_ai"], "AI-FIRE-2")
        self.assertEqual(state.log[-1]["draw_count"], 2)

    def test_comeback_rite_can_target_a_specific_spent_summon(self) -> None:
        state = new_game(1, no_opening_hands())
        state.players[0].life = 3
        state.players[1].life = 5
        state.players[0].hand = [command("CMD-COMEBACK-RITE")]
        state.players[0].field_ai = [card("AI-FIRE-2"), card("AI-WATER-4")]
        state.players[0].deck = [card("AI-FIRE-1")]
        start_turn(state)
        state.players[0].spent_field_ai = {0, 1}
        apply_action(state, Action(ActionType.USE_COMMAND, 0, target_index=0))
        self.assertNotIn(0, state.players[0].spent_field_ai)
        self.assertIn(1, state.players[0].spent_field_ai)
        self.assertEqual(state.log[-1]["readied_ai"], "AI-FIRE-2")

    def test_comeback_rite_only_requires_lower_life(self) -> None:
        state = new_game(1, no_opening_hands())
        state.players[0].life = 3
        state.players[1].life = 5
        state.players[0].hand = [command("CMD-COMEBACK-RITE")]
        state.players[0].field_ai = [card("AI-FIRE-2")]
        state.players[0].deck = []
        start_turn(state)
        state.players[0].spent_field_ai = set()

        apply_action(state, Action(ActionType.USE_COMMAND, 0))

        self.assertEqual(state.players[0].hand, [])
        self.assertEqual(state.players[0].discard[-1].id, "CMD-COMEBACK-RITE")
        self.assertEqual(state.log[-1]["readied_ai"], None)
        self.assertEqual(state.log[-1]["draw_count"], 0)

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

    def test_cache_memory_uses_pre_draw_hand_size_for_turn_start_check(self) -> None:
        state = new_game(
            1, no_opening_hands(first_player_first_turn_draw=True)
        )
        state.players[0].memory = memory("MEM-CACHE")
        state.players[0].hand = [card("AI-FIRE-1"), card("AI-WATER-1")]
        state.players[0].deck = [card("AI-EARTH-1"), card("AI-WIND-1")]
        start_turn(state)
        self.assertEqual(len(state.players[0].hand), 4)
        self.assertEqual(state.log[-1]["draw_count"], 1)
        self.assertEqual(state.log[-1]["memory_draw_count"], 1)

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
        self.assertEqual(state.actions_remaining, 4)
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

    def test_power_3_and_4_summons_can_be_charged(self) -> None:
        for card_id in ("AI-WATER-3", "AI-WATER-4"):
            with self.subTest(card_id=card_id):
                state = new_game(1, no_opening_hands(first_player_first_turn_actions=2))
                state.players[0].hand = [card(card_id)]
                state.players[0].turns_started = 1
                state.turn = 1
                start_turn(state)
                apply_action(state, Action(ActionType.CHARGE, 0))
                self.assertEqual(state.actions_remaining, 4)
                self.assertEqual(state.charged_actions_remaining, 1)
                self.assertEqual([item.id for item in state.players[0].discard], [card_id])
                self.assertTrue(state.players[0].pending_effects["charge_used"])

    def test_charged_action_is_spent_first_by_non_attack_actions(self) -> None:
        state = new_game(1, no_opening_hands(first_player_first_turn_actions=2))
        state.players[0].hand = [card("AI-FIRE-1"), card("AI-WATER-1")]
        state.players[0].turns_started = 1
        state.turn = 1
        start_turn(state)
        apply_action(state, Action(ActionType.CHARGE, 0))
        apply_action(state, Action(ActionType.PLAY_AI, 0))
        self.assertEqual(state.actions_remaining, 3)
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
        self.assertEqual(state.actions_remaining, 4)
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

    def test_wind_charge_summon_can_target_a_specific_spent_summon(self) -> None:
        state = new_game(1, no_opening_hands(first_player_first_turn_actions=2))
        state.players[0].field_ai = [card("AI-WIND-1"), card("AI-FIRE-4")]
        state.players[0].spent_field_ai = {0, 1}
        state.players[0].hand = [card("AI-WIND-2C")]
        state.players[0].turns_started = 1
        state.turn = 1
        start_turn(state)
        state.players[0].spent_field_ai = {0, 1}
        apply_action(state, Action(ActionType.CHARGE, 0, target_index=0))
        self.assertNotIn(0, state.players[0].spent_field_ai)
        self.assertIn(1, state.players[0].spent_field_ai)

    def test_earth_charge_summon_adds_selected_next_defense_bonus_until_next_turn(self) -> None:
        state = new_game(1, no_opening_hands(first_player_first_turn_actions=2))
        state.players[0].field_ai = [card("AI-EARTH-2")]
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
        self.assertEqual([item.id for item in state.players[0].discard], ["AI-EARTH-2C", "AI-EARTH-2"])

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
        self.assertEqual(state.players[1].hand[0].id, "AI-EARTH-1")
        self.assertEqual(len(state.players[1].hand), 5)

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
        self.assertEqual([item.id for item in state.players[0].field_stacks[0]], ["AI-FIRE-1"])
        self.assertEqual(state.players[0].discard, [])

    def test_upgrade_cost_matches_power_difference(self) -> None:
        state = new_game(1, no_opening_hands(first_player_first_turn_actions=2))
        state.players[0].field_ai = [card("AI-FIRE-1")]
        state.players[0].hand = [card("AI-FIRE-3")]
        start_turn(state)
        apply_action(state, Action(ActionType.UPGRADE_AI, 0, 0))
        self.assertEqual(state.players[0].field_ai[0].id, "AI-FIRE-3")
        self.assertEqual(state.actions_remaining, 0)
        self.assertEqual(state.log[-1]["action_cost"], 2)

    def test_upgrade_from_power_2_to_power_4_costs_two_actions(self) -> None:
        state = new_game(1, no_opening_hands(first_player_first_turn_actions=2))
        state.players[0].field_ai = [card("AI-FIRE-2")]
        state.players[0].hand = [card("AI-FIRE-4")]
        start_turn(state)
        apply_action(state, Action(ActionType.UPGRADE_AI, 0, 0))
        self.assertEqual(state.players[0].field_ai[0].id, "AI-FIRE-4")
        self.assertEqual(state.actions_remaining, 0)
        self.assertEqual(state.log[-1]["action_cost"], 2)

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

    def test_upgrade_from_power_1_to_power_4_requires_three_actions(self) -> None:
        state = new_game(1, no_opening_hands(first_player_first_turn_actions=2))
        state.players[0].field_ai = [card("AI-FIRE-1")]
        state.players[0].hand = [card("AI-FIRE-4")]
        start_turn(state)
        with self.assertRaises(ValueError):
            apply_action(state, Action(ActionType.UPGRADE_AI, 0, 0))

    def test_upgrade_keeps_remaining_hand_cards(self) -> None:
        state = new_game(1, no_opening_hands(first_player_first_turn_actions=2))
        state.players[0].field_ai = [card("AI-FIRE-1")]
        state.players[0].hand = [card("AI-FIRE-3"), command("CMD-PATCH")]
        start_turn(state)
        apply_action(state, Action(ActionType.UPGRADE_AI, 0, 0))
        self.assertEqual(state.players[0].field_ai[0].id, "AI-FIRE-3")
        self.assertEqual([item.id for item in state.players[0].field_stacks[0]], ["AI-FIRE-1"])
        self.assertEqual(state.players[0].discard, [])
        self.assertEqual([item.id for item in state.players[0].hand], ["CMD-PATCH"])

    def test_upgraded_stack_moves_to_discard_with_top_card(self) -> None:
        state = new_game(1, no_opening_hands(first_player_first_turn_actions=3))
        state.players[0].field_ai = [card("AI-FIRE-1")]
        state.players[0].hand = [card("AI-FIRE-3")]
        state.players[1].field_ai = [card("AI-FIRE-4")]
        start_turn(state)
        apply_action(state, Action(ActionType.UPGRADE_AI, 0, 0))
        apply_action(state, Action(ActionType.ATTACK, 0))
        self.assertEqual(state.players[0].field_ai, [])
        self.assertEqual([item.id for item in state.players[0].discard], ["AI-FIRE-3", "AI-FIRE-1"])

    def test_power_4_overheat_discards_upgrade_stack(self) -> None:
        state = new_game(1, no_opening_hands(first_player_first_turn_actions=3))
        state.players[0].field_ai = [card("AI-FIRE-2")]
        state.players[0].hand = [card("AI-FIRE-4")]
        state.players[0].deck = [card("AI-FIRE-1")]
        start_turn(state)
        apply_action(state, Action(ActionType.UPGRADE_AI, 0, 0))
        apply_action(state, Action(ActionType.ATTACK, 0))
        self.assertEqual(state.players[0].field_ai, [])
        self.assertEqual([item.id for item in state.players[0].discard], ["AI-FIRE-4", "AI-FIRE-2"])

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
        state.players[0].field_ai = [card("AI-WATER-1")]
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
        self.assertEqual(state.players[0].life, 7)
        self.assertEqual(state.stats.undefended_attacks, 1)

    def test_first_player_first_turn_has_one_action_by_default(self) -> None:
        state = new_game(
            1,
            no_opening_hands(),
        )
        start_turn(state)
        self.assertEqual(state.actions_remaining, 1)

    def test_second_player_first_turn_has_three_actions(self) -> None:
        state = new_game(1, no_opening_hands())
        start_turn(state)
        state.actions_remaining = 0
        from ai_break_duel.engine import end_turn

        end_turn(state)
        start_turn(state)
        self.assertEqual(state.actions_remaining, 3)

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

    def test_second_player_first_turn_draw_is_enabled_by_default(self) -> None:
        # 2026-07-05 の60種化に伴う先攻補正: 後攻は最初の自分ターンからドローする。
        state = new_game(1, no_opening_hands())
        start_turn(state)
        state.actions_remaining = 0
        from ai_break_duel.engine import end_turn

        end_turn(state)
        start_turn(state)
        self.assertEqual(state.players[1].cards_drawn, 1)

    def test_second_player_first_turn_draw_can_be_disabled_for_variants(self) -> None:
        state = new_game(1, no_opening_hands(second_player_first_turn_draw=False))
        start_turn(state)
        state.actions_remaining = 0
        from ai_break_duel.engine import end_turn

        end_turn(state)
        start_turn(state)
        self.assertEqual(state.players[1].cards_drawn, 0)

    def test_second_player_first_turn_draw_can_be_enabled_for_variants(self) -> None:
        state = new_game(1, no_opening_hands(second_player_first_turn_draw=True))
        start_turn(state)
        state.actions_remaining = 0
        from ai_break_duel.engine import end_turn

        end_turn(state)
        start_turn(state)
        self.assertEqual(state.players[1].cards_drawn, 1)

    def test_simulation_returns_expected_summary_shape(self) -> None:
        summary = run_simulation(10, 1, None, GameConfig(max_turns=50))
        self.assertEqual(summary["games"], 10)
        self.assertIn("first_player_win_rate", summary)
        self.assertIn(Attribute.FIRE.value, summary["attack_by_attribute"])

    def test_mono_attribute_decks_are_valid_curated_decks(self) -> None:
        for archetype, attribute in (
            (DeckArchetype.FIRE, Attribute.FIRE),
            (DeckArchetype.WATER, Attribute.WATER),
            (DeckArchetype.WIND, Attribute.WIND),
            (DeckArchetype.EARTH, Attribute.EARTH),
        ):
            deck = build_deck(archetype)
            self.assertEqual(len(deck), 25)
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


class BreakthroughRevisionTests(unittest.TestCase):
    def test_scaled_damage_follows_power(self) -> None:
        for card_id, expected_life in (("AI-WATER-1", 7), ("AI-WATER-3", 5), ("AI-WATER-4", 4)):
            with self.subTest(card_id=card_id):
                state = new_game(1, no_opening_hands())
                state.players[0].field_ai = [card(card_id)]
                state.players[1].deck = []
                state.players[1].hand = [memory("MEM-CACHE")]
                start_turn(state)
                apply_action(state, Action(ActionType.ATTACK, 0))
                self.assertEqual(state.players[1].life, expected_life)

    def test_reckless_attacker_deals_power_damage(self) -> None:
        # AI-FIRE-3B has attack value 4 (power 3 + attack_plus_1) for combat
        # checks, but breakthrough damage always equals its power (3).
        state = new_game(1, no_opening_hands())
        state.players[0].field_ai = [card("AI-FIRE-3B")]
        state.players[1].deck = []
        state.players[1].hand = [memory("MEM-CACHE")]
        start_turn(state)
        apply_action(state, Action(ActionType.ATTACK, 0))
        self.assertEqual(state.players[1].life, 5)
        self.assertEqual(state.players[0].life, 8)


    def test_reckless_attacker_keeps_attack_value_for_blocking_and_strikes(self) -> None:
        # Even though its damage output is capped, AI-FIRE-3B's attack value
        # stays at 4, so it still requires a defense value of 4+ to block
        # (a defense value of 3 is not enough) and can still strike down a
        # power-4 summon.
        reckless = card("AI-FIRE-3B")
        self.assertEqual(attack_combat_value(reckless), 4)
        self.assertFalse(can_defend(reckless, card("AI-WIND-3")))

        state = new_game(1, no_opening_hands())
        state.players[0].field_ai = [card("AI-FIRE-3B")]
        state.players[1].field_ai = [card("AI-EARTH-4")]
        start_turn(state)
        apply_action(state, Action(ActionType.STRIKE, 0, 0))
        self.assertEqual(state.players[1].field_ai, [])

    def test_break_draw_matches_damage_taken(self) -> None:
        state = new_game(1, no_opening_hands())
        state.players[0].field_ai = [card("AI-WATER-4")]
        state.players[1].deck = [card("AI-EARTH-1"), card("AI-EARTH-1B"), card("AI-EARTH-2"), card("AI-EARTH-2B")]
        start_turn(state)
        apply_action(state, Action(ActionType.ATTACK, 0))
        self.assertEqual(state.players[1].life, 4)
        self.assertEqual(len(state.players[1].hand), 4)
        self.assertEqual(state.players[1].cards_drawn, 4)

    def test_break_draw_stops_when_deck_is_empty(self) -> None:
        state = new_game(1, no_opening_hands())
        state.players[0].field_ai = [card("AI-WATER-4")]
        state.players[1].deck = [card("AI-EARTH-1")]
        state.players[1].hand = [card("AI-EARTH-2")]
        start_turn(state)
        apply_action(state, Action(ActionType.ATTACK, 0))
        self.assertEqual(state.players[1].life, 4)
        self.assertEqual(len(state.players[1].hand), 2)

    def test_strike_destroys_weaker_summon_and_exhausts_attacker(self) -> None:
        state = new_game(1, no_opening_hands())
        state.players[0].field_ai = [card("AI-WATER-3")]
        state.players[1].field_ai = [card("AI-WIND-1")]
        start_turn(state)
        apply_action(state, Action(ActionType.STRIKE, 0, 1 - 1))
        self.assertEqual(state.players[1].field_ai, [])
        self.assertEqual(state.players[1].discard[0].id, "AI-WIND-1")
        self.assertEqual([item.id for item in state.players[0].field_ai], ["AI-WATER-3"])
        self.assertIn(0, state.players[0].spent_field_ai)
        self.assertEqual(state.players[1].life, 8)

    def test_strike_trade_trashes_both_summons(self) -> None:
        state = new_game(1, no_opening_hands())
        state.players[0].field_ai = [card("AI-WATER-3")]
        state.players[1].field_ai = [card("AI-WIND-3")]
        start_turn(state)
        apply_action(state, Action(ActionType.STRIKE, 0, 0))
        self.assertEqual(state.players[0].field_ai, [])
        self.assertEqual(state.players[1].field_ai, [])
        self.assertEqual(state.players[0].discard[0].id, "AI-WATER-3")
        self.assertEqual(state.players[1].discard[0].id, "AI-WIND-3")

    def test_strike_rejects_sturdier_target(self) -> None:
        state = new_game(1, no_opening_hands())
        state.players[0].field_ai = [card("AI-WIND-1")]
        state.players[1].field_ai = [card("AI-EARTH-2")]
        start_turn(state)
        with self.assertRaisesRegex(ValueError, "too sturdy"):
            apply_action(state, Action(ActionType.STRIKE, 0, 0))

    def test_strike_requires_monster_combat_enabled(self) -> None:
        state = new_game(1, no_opening_hands(monster_combat=False))
        state.players[0].field_ai = [card("AI-WATER-3")]
        state.players[1].field_ai = [card("AI-WIND-1")]
        start_turn(state)
        with self.assertRaisesRegex(ValueError, "disabled"):
            apply_action(state, Action(ActionType.STRIKE, 0, 0))

    def test_power_4_overheats_after_strike_win(self) -> None:
        state = new_game(1, no_opening_hands())
        state.players[0].field_ai = [card("AI-FIRE-4")]
        state.players[1].field_ai = [card("AI-WIND-2")]
        start_turn(state)
        apply_action(state, Action(ActionType.STRIKE, 0, 0))
        self.assertEqual(state.players[1].field_ai, [])
        self.assertEqual(state.players[0].field_ai, [])
        self.assertIn("AI-FIRE-4", [item.id for item in state.players[0].discard])

    def test_purge_trashes_spent_summon_with_stack(self) -> None:
        state = new_game(1, no_opening_hands())
        state.players[0].hand = [command("CMD-PURGE")]
        state.players[1].field_ai = [card("AI-WIND-3")]
        state.players[1].field_stacks = [[card("AI-WIND-2")]]
        state.players[1].spent_field_ai = {0}
        start_turn(state)
        apply_action(state, Action(ActionType.USE_COMMAND, 0))
        self.assertEqual(state.players[1].field_ai, [])
        self.assertEqual(
            [item.id for item in state.players[1].discard],
            ["AI-WIND-3", "AI-WIND-2"],
        )
        self.assertEqual(state.players[0].discard[0].id, "CMD-PURGE")

    def test_purge_requires_spent_target(self) -> None:
        state = new_game(1, no_opening_hands())
        state.players[0].hand = [command("CMD-PURGE")]
        state.players[1].field_ai = [card("AI-WIND-3")]
        start_turn(state)
        with self.assertRaisesRegex(ValueError, "spent opposing"):
            apply_action(state, Action(ActionType.USE_COMMAND, 0))

    def test_power_4_can_be_played_with_charge_in_one_turn(self) -> None:
        state = new_game(1, no_opening_hands())
        state.players[0].hand = [card("AI-FIRE-1"), card("AI-FIRE-4")]
        state.players[0].turns_started = 1
        state.turn = 1
        start_turn(state)
        apply_action(state, Action(ActionType.CHARGE, 0))
        self.assertEqual(state.actions_remaining, 4)
        apply_action(state, Action(ActionType.PLAY_AI, 0))
        self.assertEqual([item.id for item in state.players[0].field_ai], ["AI-FIRE-4"])
        self.assertEqual(state.actions_remaining, 0)


if __name__ == "__main__":
    unittest.main()
