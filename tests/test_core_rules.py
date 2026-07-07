from __future__ import annotations

import unittest

from ai_break_duel.cards import (
    AI_CARD_POOL,
    COMMAND_CARD_POOL,
    Card,
    CardType,
    CardStatus,
    DeckArchetype,
    MEMORY_CARD_POOL,
    Attribute,
    attack_combat_value,
    build_deck,
    build_player_deck,
    can_defend,
    card_attributes,
    has_attribute,
    pierces_hand_defense,
    shares_attribute,
    validate_same_name_limit,
)
from ai_break_duel.ai import choose_action
from ai_break_duel.engine import (
    add_turn_field_attack_bonus,
    add_turn_global_attack_bonus,
    apply_action,
    command_is_usable,
    end_turn,
    finish_if_turn_limit_reached,
    has_charged_this_turn,
    new_game,
    recover_memory_from_discard,
    revive_ai_from_discard,
    set_next_attack_unblockable,
    start_turn,
    trash_memory,
    turn_attack_bonus,
    _can_upgrade,
    _remove_field_stack,
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
            DeckArchetype.ECHOES: 6,
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

    def test_ai_uses_optimize_even_without_useful_effect_then_ends_turn(self) -> None:
        # 2026-07-06 のリワークで CMD-OPTIMIZE の「手札2枚以上」制約を撤廃したため、
        # 山札が空でも自分自身をトラッシュへ送るだけの発動が選ばれ得る。
        state = new_game(1, no_opening_hands())
        state.players[0].hand = [command("CMD-OPTIMIZE")]
        state.players[0].deck = []
        start_turn(state)
        action = choose_action(state)
        self.assertEqual(action.type, ActionType.USE_COMMAND)
        apply_action(state, action)
        self.assertEqual(state.players[0].hand, [])
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
        set1_ai_ids = {item.id for item in AI_CARD_POOL if item.card_set == 1}
        set2_ai_ids = {item.id for item in AI_CARD_POOL if item.card_set == 2}
        self.assertEqual(len(ai_ids), 58)
        self.assertEqual(len(set1_ai_ids), 40)
        self.assertEqual(len(set2_ai_ids), 18)
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

    def test_card_pool_totals_ninety_active_cards(self) -> None:
        from ai_break_duel.cards import ACTIVE_CARD_POOL

        self.assertEqual(len(AI_CARD_POOL), 58)
        self.assertEqual(len(COMMAND_CARD_POOL), 20)
        self.assertEqual(len(MEMORY_CARD_POOL), 12)
        self.assertEqual(len(ACTIVE_CARD_POOL), 90)
        # 第2弾は 30 種（召喚獣18 + 術式8 + 遺物4）
        self.assertEqual(
            sum(1 for item in ACTIVE_CARD_POOL if item.card_set == 2), 30
        )

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

    def test_earth_2b_attempts_field_defense_even_when_attack_breaks_through(self) -> None:
        state = new_game(1, no_opening_hands())
        state.players[0].field_ai = [card("AI-WATER-4")]
        state.players[1].field_ai = [card("AI-EARTH-2B")]
        start_turn(state)
        apply_action(state, Action(ActionType.ATTACK, 0))
        self.assertEqual(state.players[1].life, 4)
        self.assertEqual(state.players[1].field_ai, [])
        self.assertEqual([item.id for item in state.players[1].discard], ["AI-EARTH-2B"])
        self.assertEqual(state.stats.failed_defenses, 1)

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

    def test_relearn_with_single_hand_card_skips_discard_cost(self) -> None:
        # 2026-07-06 のリワークで CMD-RELEARN の「手札2枚以上」制約を撤廃。
        # 手札が幻獣回帰の巻自身のみの場合、代償のトラッシュは自然にスキップされる。
        state = new_game(1, no_opening_hands())
        state.players[0].hand = [command("CMD-RELEARN")]
        state.players[0].discard = [card("AI-WATER-4")]
        start_turn(state)
        apply_action(state, Action(ActionType.USE_COMMAND, 0))
        self.assertEqual(state.players[0].hand[0].id, "AI-WATER-4")
        self.assertEqual([item.id for item in state.players[0].discard], ["CMD-RELEARN"])

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

    def test_strike_hand_defense_saves_valuable_stack(self) -> None:
        state = new_game(1, no_opening_hands())
        state.players[0].field_ai = [card("AI-WATER-4")]
        state.players[1].field_ai = [card("AI-WIND-3")]
        state.players[1].field_stacks = [[card("AI-WIND-2")]]
        state.players[1].hand = [card("AI-WATER-4")]
        start_turn(state)
        apply_action(state, Action(ActionType.STRIKE, 0, 0))
        self.assertEqual([item.id for item in state.players[1].field_ai], ["AI-WIND-3"])
        self.assertEqual([item.id for item in state.players[1].discard], ["AI-WATER-4"])
        self.assertEqual(state.players[1].hand, [])
        self.assertEqual(state.players[1].hand_defenses_used_this_turn, 1)
        self.assertEqual(state.players[1].life, 8)
        # power 4 の攻撃後退場はプレイヤーへの攻撃と同様に適用される
        # （AI-WATER-4 は攻撃後退場時に手札へ戻る個別効果を持つ）
        self.assertEqual(state.players[0].field_ai, [])
        self.assertEqual([item.id for item in state.players[0].hand], ["AI-WATER-4"])

    def test_strike_hand_defense_skips_low_value_target(self) -> None:
        state = new_game(1, no_opening_hands())
        state.players[0].field_ai = [card("AI-WATER-3")]
        state.players[1].field_ai = [card("AI-WIND-1")]
        state.players[1].hand = [card("AI-WIND-3")]
        start_turn(state)
        apply_action(state, Action(ActionType.STRIKE, 0, 0))
        self.assertEqual(state.players[1].field_ai, [])
        self.assertEqual([item.id for item in state.players[1].hand], ["AI-WIND-3"])
        self.assertEqual(state.players[1].hand_defenses_used_this_turn, 0)

    def test_strike_hand_defense_never_blocks_trades(self) -> None:
        state = new_game(1, no_opening_hands())
        state.players[0].field_ai = [card("AI-WATER-3")]
        state.players[1].field_ai = [card("AI-WIND-3")]
        state.players[1].hand = [card("AI-WATER-4")]
        start_turn(state)
        apply_action(state, Action(ActionType.STRIKE, 0, 0))
        self.assertEqual(state.players[0].field_ai, [])
        self.assertEqual(state.players[1].field_ai, [])
        self.assertEqual([item.id for item in state.players[1].hand], ["AI-WATER-4"])

    def test_strike_hand_defense_shares_per_turn_limit(self) -> None:
        state = new_game(1, no_opening_hands())
        state.players[0].field_ai = [card("AI-WATER-4")]
        state.players[1].field_ai = [card("AI-WIND-3")]
        state.players[1].field_stacks = [[card("AI-WIND-2")]]
        state.players[1].hand = [card("AI-WATER-4")]
        start_turn(state)
        state.players[1].hand_defenses_used_this_turn = 1
        apply_action(state, Action(ActionType.STRIKE, 0, 0))
        self.assertEqual(state.players[1].field_ai, [])
        self.assertEqual([item.id for item in state.players[1].hand], ["AI-WATER-4"])

    def test_strike_hand_defense_can_be_disabled(self) -> None:
        state = new_game(1, no_opening_hands(hand_defense_vs_strike="off"))
        state.players[0].field_ai = [card("AI-WATER-4")]
        state.players[1].field_ai = [card("AI-WIND-3")]
        state.players[1].field_stacks = [[card("AI-WIND-2")]]
        state.players[1].hand = [card("AI-WATER-4")]
        start_turn(state)
        apply_action(state, Action(ActionType.STRIKE, 0, 0))
        self.assertEqual(state.players[1].field_ai, [])
        self.assertEqual([item.id for item in state.players[1].hand], ["AI-WATER-4"])

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


def dual_card(
    attribute: Attribute = Attribute.FIRE,
    sub_attribute: Attribute = Attribute.EARTH,
    power: int = 3,
) -> Card:
    return Card(
        id="AI-DUAL-TEST",
        name="デュアルテスト獣",
        type=CardType.AI,
        attribute=attribute,
        power=power,
        sub_attribute=sub_attribute,
    )


class Set2MechanicsTests(unittest.TestCase):
    def test_has_attribute_matches_primary_and_sub_attribute(self) -> None:
        magma = dual_card()
        self.assertTrue(has_attribute(magma, Attribute.FIRE))
        self.assertTrue(has_attribute(magma, Attribute.EARTH))
        self.assertFalse(has_attribute(magma, Attribute.WATER))
        self.assertEqual(card_attributes(magma), [Attribute.FIRE, Attribute.EARTH])
        single = card("AI-FIRE-1")
        self.assertTrue(has_attribute(single, Attribute.FIRE))
        self.assertFalse(has_attribute(single, Attribute.EARTH))
        self.assertEqual(card_attributes(single), [Attribute.FIRE])

    def test_shares_attribute_keeps_single_attribute_behavior(self) -> None:
        self.assertTrue(shares_attribute(card("AI-FIRE-1"), card("AI-FIRE-2")))
        self.assertFalse(shares_attribute(card("AI-FIRE-1"), card("AI-WATER-2")))
        magma = dual_card()
        self.assertTrue(shares_attribute(magma, card("AI-EARTH-2")))
        self.assertTrue(shares_attribute(card("AI-EARTH-2"), magma))
        self.assertFalse(shares_attribute(magma, card("AI-WATER-2")))

    def test_dual_attribute_satisfies_rite_command_conditions(self) -> None:
        state = new_game(1, no_opening_hands())
        state.players[0].field_ai = [dual_card()]
        state.players[0].discard = [card("AI-EARTH-1")]
        state.players[0].hand = [
            command("CMD-FIRE-RITE"),
            command("CMD-EARTH-RITE"),
            command("CMD-WATER-RITE"),
        ]
        start_turn(state)
        self.assertTrue(command_is_usable(state, 0))
        self.assertTrue(command_is_usable(state, 1))
        self.assertFalse(command_is_usable(state, 2))

    def test_dual_attribute_can_upgrade_from_either_attribute_source(self) -> None:
        magma = dual_card()
        self.assertTrue(_can_upgrade(card("AI-FIRE-2"), magma))
        self.assertTrue(_can_upgrade(card("AI-EARTH-2"), magma))
        self.assertFalse(_can_upgrade(card("AI-WATER-2"), magma))
        # 既存単属性カードの挙動は不変
        self.assertTrue(_can_upgrade(card("AI-FIRE-2"), card("AI-FIRE-3")))
        self.assertFalse(_can_upgrade(card("AI-FIRE-2"), card("AI-WATER-3")))

    def test_turn_field_attack_bonus_breaks_through_field_defense(self) -> None:
        state = new_game(1, no_opening_hands())
        state.players[0].field_ai = [card("AI-FIRE-1")]
        state.players[1].field_ai = [card("AI-WATER-1")]
        start_turn(state)
        attacker = state.players[0]
        defender = state.players[1]
        add_turn_field_attack_bonus(attacker, 0, 1)
        self.assertEqual(turn_attack_bonus(attacker, 0), 1)
        self.assertEqual(turn_attack_bonus(attacker, 1), 0)
        life_before = defender.life
        apply_action(state, Action(ActionType.ATTACK, 0))
        # 防御値1 < 攻撃値2 で攻撃は通る。ダメージは power 由来のまま1点
        self.assertEqual(defender.life, life_before - 1)
        self.assertEqual(len(defender.field_ai), 1)

    def test_turn_global_attack_bonus_applies_to_all_own_summons(self) -> None:
        state = new_game(1, no_opening_hands())
        state.players[0].field_ai = [card("AI-FIRE-1"), card("AI-WATER-1")]
        start_turn(state)
        attacker = state.players[0]
        add_turn_global_attack_bonus(attacker, 1)
        self.assertEqual(turn_attack_bonus(attacker, 0), 1)
        self.assertEqual(turn_attack_bonus(attacker, 1), 1)
        self.assertEqual(
            attack_combat_value(
                attacker.field_ai[1], attack_power_bonus=turn_attack_bonus(attacker, 1)
            ),
            2,
        )

    def test_next_attack_unblockable_disables_hand_defense_and_is_consumed(self) -> None:
        state = new_game(1, no_opening_hands())
        state.players[0].field_ai = [card("AI-FIRE-1")]
        state.players[1].hand = [card("AI-WATER-4")]
        state.players[1].deck = []
        start_turn(state)
        attacker = state.players[0]
        defender = state.players[1]
        set_next_attack_unblockable(attacker)
        life_before = defender.life
        apply_action(state, Action(ActionType.ATTACK, 0))
        self.assertEqual(defender.life, life_before - 1)
        self.assertEqual(len(defender.hand), 1)
        self.assertFalse(attacker.next_attack_unblockable)

    def test_hand_defense_still_works_without_unblockable_flag(self) -> None:
        state = new_game(1, no_opening_hands())
        state.players[0].field_ai = [card("AI-FIRE-1")]
        state.players[1].hand = [card("AI-WATER-4")]
        start_turn(state)
        defender = state.players[1]
        life_before = defender.life
        apply_action(state, Action(ActionType.ATTACK, 0))
        self.assertEqual(defender.life, life_before)
        self.assertEqual(len(defender.hand), 0)

    def test_turn_attack_buffs_reset_at_end_of_turn(self) -> None:
        state = new_game(1, no_opening_hands())
        state.players[0].field_ai = [card("AI-FIRE-1")]
        state.players[0].hand = [card("AI-FIRE-2")]
        start_turn(state)
        attacker = state.players[0]
        add_turn_field_attack_bonus(attacker, 0, 2)
        add_turn_global_attack_bonus(attacker, 1)
        set_next_attack_unblockable(attacker)
        end_turn(state)
        self.assertEqual(attacker.turn_field_attack_bonuses, {})
        self.assertEqual(attacker.turn_global_attack_bonus, 0)
        self.assertFalse(attacker.next_attack_unblockable)

    def test_turn_field_attack_bonus_indexes_shift_on_field_removal(self) -> None:
        state = new_game(1, no_opening_hands())
        player = state.players[0]
        player.field_ai = [card("AI-FIRE-1"), card("AI-FIRE-2"), card("AI-WATER-2")]
        add_turn_field_attack_bonus(player, 1, 1)
        add_turn_field_attack_bonus(player, 2, 2)
        _remove_field_stack(player, 0)
        self.assertEqual(player.turn_field_attack_bonuses, {0: 1, 1: 2})

    def test_revive_puts_discarded_summon_onto_field_spent(self) -> None:
        state = new_game(1, no_opening_hands())
        player = state.players[0]
        player.discard = [command("CMD-OPTIMIZE"), card("AI-FIRE-2")]
        revived = revive_ai_from_discard(state, player, 1)
        self.assertIsNotNone(revived)
        self.assertEqual(revived.id, "AI-FIRE-2")
        self.assertEqual([item.id for item in player.field_ai], ["AI-FIRE-2"])
        self.assertIn(0, player.spent_field_ai)
        self.assertEqual([item.id for item in player.discard], ["CMD-OPTIMIZE"])

    def test_revive_rejects_non_summons_and_full_field(self) -> None:
        state = new_game(1, no_opening_hands())
        player = state.players[0]
        player.discard = [command("CMD-OPTIMIZE"), card("AI-FIRE-2")]
        self.assertIsNone(revive_ai_from_discard(state, player, 0))
        player.field_ai = [card("AI-FIRE-1"), card("AI-WATER-1"), card("AI-WIND-1")]
        self.assertIsNone(revive_ai_from_discard(state, player, 1))
        self.assertEqual(len(player.discard), 2)

    def test_trash_memory_sends_relic_to_discard(self) -> None:
        state = new_game(1, no_opening_hands())
        opponent = state.players[1]
        self.assertIsNone(trash_memory(opponent))
        opponent.memory = memory("MEM-CACHE")
        trashed = trash_memory(opponent)
        self.assertEqual(trashed.id, "MEM-CACHE")
        self.assertIsNone(opponent.memory)
        self.assertEqual(opponent.discard[-1].id, "MEM-CACHE")

    def test_recover_memory_from_discard_returns_only_relics(self) -> None:
        state = new_game(1, no_opening_hands())
        player = state.players[0]
        player.discard = [card("AI-FIRE-1"), memory("MEM-FIREWALL")]
        self.assertIsNone(recover_memory_from_discard(player, 0))
        recovered = recover_memory_from_discard(player, 1)
        self.assertEqual(recovered.id, "MEM-FIREWALL")
        self.assertEqual([item.id for item in player.hand], ["MEM-FIREWALL"])
        self.assertEqual([item.id for item in player.discard], ["AI-FIRE-1"])

    def test_has_charged_this_turn_reflects_charge_and_resets(self) -> None:
        state = new_game(1, no_opening_hands())
        state.players[0].hand = [card("AI-FIRE-1")]
        state.players[0].deck = [card("AI-FIRE-2"), card("AI-FIRE-2")]
        state.players[1].deck = [card("AI-WATER-2")]
        start_turn(state)
        player = state.players[0]
        self.assertFalse(has_charged_this_turn(player))
        apply_action(state, Action(ActionType.CHARGE, 0))
        self.assertTrue(has_charged_this_turn(player))
        end_turn(state)
        start_turn(state)
        end_turn(state)
        start_turn(state)
        self.assertFalse(has_charged_this_turn(player))


class Set2CardTests(unittest.TestCase):
    """第2弾「残響の胎動」カードの代表挙動テスト。"""

    def test_glend_hand_defense_pierce(self) -> None:
        # 焔角のグレンド: hand_defense_pierce と同じ効果（戦闘値ボーナスなし）。手札防御されても相手に1ダメージ
        state = new_game(1, no_opening_hands())
        state.players[0].field_ai = [card("AI-FIRE-3D")]
        state.players[1].hand = [card("AI-WATER-4")]
        state.players[1].deck = []
        start_turn(state)
        self.assertEqual(attack_combat_value(card("AI-FIRE-3D")), 3)
        life_before = state.players[1].life
        apply_action(state, Action(ActionType.ATTACK, 0))
        self.assertEqual(state.players[1].life, life_before - 1)
        self.assertEqual(len(state.players[1].hand), 0)

    def test_serena_draws_only_on_blocked_attack(self) -> None:
        # 深響のセレナ: 登場時のドローはない。攻撃が防御された時にだけ1枚引く
        state = new_game(1, no_opening_hands(first_player_first_turn_actions=3))
        state.players[0].hand = [card("AI-WATER-3D")]
        state.players[0].deck = [card("AI-FIRE-1"), card("AI-FIRE-2")]
        start_turn(state)
        apply_action(state, Action(ActionType.PLAY_AI, 0))
        self.assertEqual([item.id for item in state.players[0].hand], [])
        self.assertEqual(len(state.players[0].deck), 2)

        blocked = new_game(2, no_opening_hands())
        blocked.players[0].field_ai = [card("AI-WATER-3D")]
        blocked.players[0].deck = [card("AI-FIRE-1")]
        blocked.players[1].hand = [card("AI-WATER-4")]
        blocked.players[1].deck = []
        start_turn(blocked)
        life_before = blocked.players[1].life
        apply_action(blocked, Action(ActionType.ATTACK, 0))
        # 貫通は持たないためダメージなし。防御された時ドローだけが発動する
        self.assertEqual(blocked.players[1].life, life_before)
        self.assertEqual([item.id for item in blocked.players[0].hand], ["AI-FIRE-1"])

    def test_hayate_charge_spends_enemy_and_readies_ally(self) -> None:
        # 翠嵐鷹ハヤテ: チャージ時、相手の最高power未消耗を消耗させ、自分の最高power消耗中を回復（自動対象）
        state = new_game(1, no_opening_hands())
        state.players[0].hand = [card("AI-WIND-3C")]
        state.players[0].field_ai = [card("AI-WIND-1")]
        state.players[1].field_ai = [card("AI-FIRE-2"), card("AI-FIRE-1")]
        start_turn(state)
        state.players[0].spent_field_ai = {0}
        apply_action(state, Action(ActionType.CHARGE, 0))
        self.assertEqual(state.players[1].spent_field_ai, {0})
        self.assertEqual(state.players[0].spent_field_ai, set())

    def test_goron_charge_recovers_summon_without_hand_limit(self) -> None:
        # 古磐熊ゴロン: 手札枚数条件なしでトラッシュの召喚獣を回収。チャージした自分自身は対象外
        state = new_game(1, no_opening_hands())
        state.players[0].hand = [
            card("AI-EARTH-3C"),
            card("AI-FIRE-1"),
            card("AI-FIRE-2"),
            card("AI-WATER-1"),
        ]
        state.players[0].discard = [card("AI-EARTH-2")]
        start_turn(state)
        apply_action(state, Action(ActionType.CHARGE, 0))
        self.assertIn("AI-EARTH-2", [item.id for item in state.players[0].hand])

        self_only = new_game(2, no_opening_hands())
        self_only.players[0].hand = [card("AI-EARTH-3C")]
        start_turn(self_only)
        apply_action(self_only, Action(ActionType.CHARGE, 0))
        self.assertEqual(len(self_only.players[0].hand), 0)
        self.assertEqual(
            [item.id for item in self_only.players[0].discard], ["AI-EARTH-3C"]
        )

    def test_garuru_attack_bonus_with_two_commands_in_trash(self) -> None:
        state = new_game(1, no_opening_hands())
        state.players[0].field_ai = [card("AI-FIRE-2D")]
        state.players[0].discard = [command("CMD-OPTIMIZE"), command("CMD-PURGE")]
        state.players[1].field_ai = [card("AI-WATER-2")]
        start_turn(state)
        life_before = state.players[1].life
        apply_action(state, Action(ActionType.ATTACK, 0))
        # 攻撃値4(power2+2) > 防御値2 で場防御不可。ダメージは power 由来の2点
        self.assertEqual(state.players[1].life, life_before - 2)
        self.assertEqual(len(state.players[1].field_ai), 1)

    def test_valen_attack_bonus_without_overheat_draw(self) -> None:
        state = new_game(1, no_opening_hands())
        state.players[0].field_ai = [card("AI-FIRE-4D")]
        state.players[0].discard = [card("AI-FIRE-1"), card("AI-FIRE-2"), card("AI-WATER-1")]
        state.players[0].deck = [card("AI-WIND-1")]
        state.players[1].deck = [card("AI-WATER-1"), card("AI-WATER-2")]
        start_turn(state)
        life_before = state.players[1].life
        apply_action(state, Action(ActionType.ATTACK, 0))
        self.assertEqual(state.players[1].life, life_before - 4)
        # 攻撃後退場するが、山札からは引かない（2026-07-06 効果変更）
        self.assertEqual(len(state.players[0].field_ai), 0)
        self.assertEqual([item.id for item in state.players[0].hand], [])
        self.assertEqual([item.id for item in state.players[0].deck], ["AI-WIND-1"])

    def test_granmare_draws_and_gives_opponent_a_draw_on_play_then_returns_after_overheat(self) -> None:
        # 海淵帝グランマーレ: 登場時に自分と相手が1枚ずつ引く（2026-07-06 効果変更で相手ドローの代償を追加）。
        # 攻撃後退場時はトラッシュではなく手札に戻る。
        state = new_game(1, no_opening_hands())
        state.players[0].hand = [card("AI-WATER-4D")]
        state.players[0].deck = [card("AI-FIRE-1")]
        state.players[1].deck = [card("AI-WATER-1")]
        state.actions_remaining = 5
        apply_action(state, Action(ActionType.PLAY_AI, 0))
        self.assertEqual([item.id for item in state.players[0].hand], ["AI-FIRE-1"])
        self.assertEqual([item.id for item in state.players[1].hand], ["AI-WATER-1"])
        apply_action(state, Action(ActionType.ATTACK, 0))
        self.assertEqual(state.players[0].field_ai, [])
        self.assertEqual(state.players[0].discard, [])
        self.assertEqual([item.id for item in state.players[0].hand], ["AI-FIRE-1", "AI-WATER-4D"])

    def test_grave_call_revives_low_power_summon_spent(self) -> None:
        state = new_game(1, no_opening_hands())
        state.players[0].hand = [command("CMD-GRAVE-CALL")]
        state.players[0].discard = [card("AI-FIRE-4"), card("AI-FIRE-3")]
        start_turn(state)
        apply_action(state, Action(ActionType.USE_COMMAND, 0))
        self.assertEqual([item.id for item in state.players[0].field_ai], ["AI-FIRE-3"])
        self.assertIn(0, state.players[0].spent_field_ai)
        self.assertEqual(
            [item.id for item in state.players[0].discard],
            ["AI-FIRE-4", "CMD-GRAVE-CALL"],
        )

    def test_grave_call_rejects_power_four_target(self) -> None:
        state = new_game(1, no_opening_hands())
        state.players[0].hand = [command("CMD-GRAVE-CALL")]
        state.players[0].discard = [card("AI-FIRE-4"), card("AI-FIRE-2")]
        start_turn(state)
        with self.assertRaises(ValueError):
            apply_action(state, Action(ActionType.USE_COMMAND, 0, 0))
        self.assertEqual(len(state.players[0].hand), 1)

    def test_salvage_recovers_command_but_not_itself(self) -> None:
        state = new_game(1, no_opening_hands())
        state.players[0].hand = [command("CMD-SALVAGE")]
        state.players[0].discard = [command("CMD-SALVAGE"), command("CMD-OPTIMIZE")]
        start_turn(state)
        apply_action(state, Action(ActionType.USE_COMMAND, 0))
        self.assertEqual([item.id for item in state.players[0].hand], ["CMD-OPTIMIZE"])

        blocked = new_game(2, no_opening_hands())
        blocked.players[0].hand = [command("CMD-SALVAGE")]
        blocked.players[0].discard = [command("CMD-SALVAGE")]
        start_turn(blocked)
        self.assertFalse(command_is_usable(blocked, 0))

    def test_overdrive_requires_charge_and_draws_two(self) -> None:
        state = new_game(1, no_opening_hands())
        state.players[0].hand = [command("CMD-OVERDRIVE"), card("AI-FIRE-1")]
        state.players[0].deck = [card("AI-WATER-1"), card("AI-WATER-2"), card("AI-WATER-3")]
        start_turn(state)
        self.assertFalse(command_is_usable(state, 0))
        apply_action(state, Action(ActionType.CHARGE, 1))
        self.assertTrue(command_is_usable(state, 0))
        apply_action(state, Action(ActionType.USE_COMMAND, 0))
        self.assertEqual(len(state.players[0].hand), 2)

    def test_relic_crush_trashes_relic(self) -> None:
        state = new_game(1, no_opening_hands())
        state.players[0].hand = [command("CMD-RELIC-CRUSH")]
        state.players[1].memory = memory("MEM-CACHE")
        start_turn(state)
        apply_action(state, Action(ActionType.USE_COMMAND, 0))
        self.assertIsNone(state.players[1].memory)
        self.assertEqual([item.id for item in state.players[1].discard], ["MEM-CACHE"])

    def test_relic_crush_is_not_usable_without_enemy_relic(self) -> None:
        no_relic = new_game(2, no_opening_hands())
        no_relic.players[0].hand = [command("CMD-RELIC-CRUSH")]
        no_relic.players[0].deck = [card("AI-FIRE-1")]
        start_turn(no_relic)
        self.assertFalse(command_is_usable(no_relic, 0))
        with self.assertRaises(ValueError):
            apply_action(no_relic, Action(ActionType.USE_COMMAND, 0))
        self.assertEqual([item.id for item in no_relic.players[0].hand], ["CMD-RELIC-CRUSH"])
        self.assertEqual([item.id for item in no_relic.players[0].deck], ["AI-FIRE-1"])

    def test_deep_current_draws_three_and_discards_one(self) -> None:
        state = new_game(1, no_opening_hands())
        state.players[0].hand = [command("CMD-DEEP-CURRENT")]
        state.players[0].field_ai = [card("AI-WATER-1"), card("AI-WATER-3D")]
        state.players[0].deck = [card("AI-FIRE-1"), card("AI-FIRE-2"), card("AI-FIRE-3")]
        start_turn(state)
        apply_action(state, Action(ActionType.USE_COMMAND, 0))
        self.assertEqual(len(state.players[0].hand), 2)
        self.assertEqual(len(state.players[0].discard), 2)

        mono = new_game(2, no_opening_hands())
        mono.players[0].hand = [command("CMD-DEEP-CURRENT")]
        mono.players[0].field_ai = [card("AI-WATER-1"), card("AI-FIRE-1")]
        mono.players[0].deck = [card("AI-FIRE-2")]
        start_turn(mono)
        self.assertFalse(command_is_usable(mono, 0))

    def test_war_cry_and_tide_edge_apply_turn_attack_buffs(self) -> None:
        state = new_game(1, no_opening_hands(first_player_first_turn_actions=2))
        state.players[0].hand = [command("CMD-WAR-CRY"), command("CMD-TIDE-EDGE")]
        state.players[0].field_ai = [card("AI-WATER-1"), card("AI-WATER-2")]
        start_turn(state)
        apply_action(state, Action(ActionType.USE_COMMAND, 0))
        self.assertEqual(state.players[0].turn_global_attack_bonus, 1)
        apply_action(state, Action(ActionType.USE_COMMAND, 0, 1))
        self.assertEqual(state.players[0].turn_field_attack_bonuses, {1: 2})
        self.assertEqual(turn_attack_bonus(state.players[0], 1), 3)

    def test_pierce_sight_disables_hand_defense_for_next_attack(self) -> None:
        state = new_game(1, no_opening_hands(first_player_first_turn_actions=2))
        state.players[0].hand = [command("CMD-PIERCE-SIGHT")]
        state.players[0].field_ai = [card("AI-FIRE-1")]
        state.players[1].hand = [card("AI-WATER-4")]
        state.players[1].deck = []
        start_turn(state)
        apply_action(state, Action(ActionType.USE_COMMAND, 0))
        life_before = state.players[1].life
        apply_action(state, Action(ActionType.ATTACK, 0))
        self.assertEqual(state.players[1].life, life_before - 1)
        self.assertEqual(len(state.players[1].hand), 1)

    def test_echo_urn_draws_once_per_turn_on_recovery(self) -> None:
        state = new_game(1, no_opening_hands(first_player_first_turn_actions=2))
        state.players[0].memory = memory("MEM-ECHO-URN")
        state.players[0].hand = [command("CMD-EARTH-RITE"), command("CMD-EARTH-RITE")]
        state.players[0].field_ai = [card("AI-EARTH-1")]
        state.players[0].discard = [card("AI-FIRE-2"), card("AI-FIRE-1")]
        state.players[0].deck = [card("AI-WATER-1"), card("AI-WATER-2")]
        start_turn(state)
        apply_action(state, Action(ActionType.USE_COMMAND, 0))
        # 回収1枚 + 骨壺ドロー1枚
        self.assertEqual(len(state.players[0].hand), 3)
        self.assertEqual(len(state.players[0].deck), 1)
        apply_action(state, Action(ActionType.USE_COMMAND, 0))
        # 2回目の回収では1ターン1回制限でドローしない
        self.assertEqual(len(state.players[0].hand), 3)
        self.assertEqual(len(state.players[0].deck), 1)

    def test_storm_core_spends_enemy_after_charge(self) -> None:
        state = new_game(1, no_opening_hands())
        state.players[0].memory = memory("MEM-STORM-CORE")
        state.players[0].hand = [card("AI-FIRE-1")]
        state.players[1].field_ai = [card("AI-WATER-2")]
        start_turn(state)
        apply_action(state, Action(ActionType.CHARGE, 0))
        self.assertEqual(state.players[1].spent_field_ai, {0})

    def test_tidal_mirror_draws_on_field_defense_even_when_attack_breaks_through(self) -> None:
        state = new_game(1, no_opening_hands())
        state.players[0].field_ai = [card("AI-FIRE-2")]
        state.players[1].memory = memory("MEM-TIDAL-MIRROR")
        state.players[1].field_ai = [card("AI-EARTH-1")]
        state.players[1].deck = [card("AI-WATER-1")]
        start_turn(state)
        life_before = state.players[1].life
        apply_action(state, Action(ActionType.ATTACK, 0))
        self.assertEqual([item.id for item in state.players[1].hand], ["AI-WATER-1"])
        self.assertEqual(state.players[1].life, life_before - 2)
        self.assertEqual(len(state.players[1].field_ai), 0)

    def test_dual_banner_draws_at_turn_start_with_two_attributes(self) -> None:
        state = new_game(1, no_opening_hands())
        state.players[0].memory = memory("MEM-DUAL-BANNER")
        state.players[0].field_ai = [card("AI-FIRE-1"), card("AI-WATER-1")]
        state.players[0].deck = [card("AI-WATER-1"), card("AI-WATER-2"), card("AI-WIND-1")]
        start_turn(state)
        self.assertEqual(len(state.players[0].hand), 2)

        mono = new_game(2, no_opening_hands())
        mono.players[0].memory = memory("MEM-DUAL-BANNER")
        mono.players[0].field_ai = [card("AI-FIRE-1"), card("AI-FIRE-2")]
        mono.players[0].deck = [card("AI-WATER-1")]
        start_turn(mono)
        self.assertEqual(len(mono.players[0].hand), 0)

    def test_remi_trashes_enemy_relic_and_enters_spent(self) -> None:
        state = new_game(1, no_opening_hands())
        state.players[0].hand = [card("AI-FIRE-1D")]
        state.players[1].memory = memory("MEM-CACHE")
        start_turn(state)
        apply_action(state, Action(ActionType.PLAY_AI, 0))
        self.assertIsNone(state.players[1].memory)
        self.assertEqual([item.id for item in state.players[1].discard], ["MEM-CACHE"])
        self.assertIn(0, state.players[0].spent_field_ai)

        no_relic = new_game(2, no_opening_hands())
        no_relic.players[0].hand = [card("AI-FIRE-1D")]
        start_turn(no_relic)
        apply_action(no_relic, Action(ActionType.PLAY_AI, 0))
        self.assertNotIn(0, no_relic.players[0].spent_field_ai)

    def test_kanata_readies_other_ally_and_enters_spent(self) -> None:
        state = new_game(1, no_opening_hands(first_player_first_turn_actions=2))
        state.players[0].hand = [card("AI-WIND-2D")]
        state.players[0].field_ai = [card("AI-WIND-1")]
        start_turn(state)
        state.players[0].spent_field_ai = {0}
        apply_action(state, Action(ActionType.PLAY_AI, 0))
        # 味方（風信の1体目）は回復し、自分自身は消耗で出る
        self.assertEqual(state.players[0].spent_field_ai, {1})

    def test_nayu_draws_only_with_four_or_more_discard(self) -> None:
        state = new_game(1, no_opening_hands())
        state.players[0].hand = [card("AI-WATER-1D")]
        state.players[0].discard = [
            card("AI-FIRE-1"),
            card("AI-FIRE-2"),
            command("CMD-OPTIMIZE"),
            card("AI-WIND-1"),
        ]
        state.players[0].deck = [card("AI-WATER-2")]
        start_turn(state)
        apply_action(state, Action(ActionType.PLAY_AI, 0))
        self.assertEqual([item.id for item in state.players[0].hand], ["AI-WATER-2"])

        shallow = new_game(2, no_opening_hands())
        shallow.players[0].hand = [card("AI-WATER-1D")]
        shallow.players[0].discard = [card("AI-FIRE-1"), card("AI-FIRE-2")]
        shallow.players[0].deck = [card("AI-WATER-2")]
        start_turn(shallow)
        apply_action(shallow, Action(ActionType.PLAY_AI, 0))
        self.assertEqual(len(shallow.players[0].hand), 0)

    def test_galion_recovers_relic_from_discard_on_play(self) -> None:
        state = new_game(1, no_opening_hands(first_player_first_turn_actions=4))
        state.players[0].hand = [card("AI-EARTH-4D")]
        state.players[0].discard = [memory("MEM-CACHE"), card("AI-FIRE-1")]
        start_turn(state)
        apply_action(state, Action(ActionType.PLAY_AI, 0))
        self.assertEqual([item.id for item in state.players[0].hand], ["MEM-CACHE"])
        self.assertEqual([item.id for item in state.players[0].discard], ["AI-FIRE-1"])

    def test_earth_bone_collector_recovers_summon_on_field_defense(self) -> None:
        state = new_game(1, no_opening_hands())
        state.players[0].field_ai = [card("AI-FIRE-2")]
        state.players[1].field_ai = [card("AI-EARTH-1D")]
        state.players[1].discard = [card("AI-WATER-3")]
        state.players[1].deck = []
        start_turn(state)
        life_before = state.players[1].life
        apply_action(state, Action(ActionType.ATTACK, 0))
        # 防御値不足でも、場防御した時点で回収が発動する
        self.assertEqual([item.id for item in state.players[1].hand], ["AI-WATER-3"])
        self.assertEqual(state.players[1].life, life_before - 2)
        self.assertEqual(len(state.players[1].field_ai), 0)

    def test_orca_charge_filters_and_wind_1d_charge_draw_needs_other_summon(self) -> None:
        state = new_game(1, no_opening_hands())
        state.players[0].hand = [card("AI-WATER-3C")]
        state.players[0].deck = [card("AI-FIRE-1"), card("AI-FIRE-2")]
        start_turn(state)
        apply_action(state, Action(ActionType.CHARGE, 0))
        self.assertEqual(len(state.players[0].hand), 1)
        self.assertEqual(len(state.players[0].discard), 2)

        wind = new_game(2, no_opening_hands())
        wind.players[0].hand = [card("AI-WIND-1D")]
        wind.players[0].deck = [card("AI-FIRE-2")]
        start_turn(wind)
        apply_action(wind, Action(ActionType.CHARGE, 0))
        # トラッシュに自分しかいないのでドローしない
        self.assertEqual(len(wind.players[0].hand), 0)

    def test_jail_charge_spends_all_ready_enemies(self) -> None:
        state = new_game(1, no_opening_hands())
        state.players[0].hand = [card("AI-WIND-4D")]
        state.players[1].field_ai = [card("AI-FIRE-1"), card("AI-FIRE-2"), card("AI-WATER-1")]
        start_turn(state)
        state.players[1].spent_field_ai = {2}
        apply_action(state, Action(ActionType.CHARGE, 0))
        self.assertEqual(state.players[1].spent_field_ai, {0, 1, 2})

    def test_echoes_deck_is_playable_by_cpu(self) -> None:
        result = run_match(
            4242,
            GameConfig(ai_profiles=("challenger", "challenger")),
            (DeckArchetype.ECHOES, DeckArchetype.WATER),
        )
        self.assertIn(result.summary["winner"], ("player_1", "player_2", None))


if __name__ == "__main__":
    unittest.main()
