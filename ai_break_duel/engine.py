from __future__ import annotations

from random import Random
from typing import Any

from .ai import choose_defender, choose_hand_defender
from .cards import (
    Attribute,
    AiEffect,
    CardType,
    CommandEffect,
    DeckArchetype,
    MemoryEffect,
    attack_combat_value,
    build_deck,
    build_player_deck,
    blocks_low_life_hand_defense,
    can_defend,
    defense_combat_value,
    draws_after_overheat,
    draws_on_blocked_attack,
    draws_on_play,
    draws_on_successful_defense,
    draws_two_after_overheat,
    enters_spent_on_play,
    filters_on_play,
    keeps_ready_after_attack,
    opponent_draws_on_play,
    pierces_hand_defense,
    pressures_on_block,
    readies_ally_on_play,
    recovers_ai_on_play,
    returns_after_overheat,
    self_damages_on_play,
    spends_enemy_on_play,
    validate_same_name_limit,
)
from .models import Action, ActionType, GameConfig, GameState, PlayerState


def new_game(
    seed: int,
    config: GameConfig | None = None,
    decks: tuple[DeckArchetype, DeckArchetype] | None = None,
) -> GameState:
    config = config or GameConfig()
    rng = Random(seed)
    players = [
        PlayerState(name="player_1", life=config.life),
        PlayerState(name="player_2", life=config.life),
    ]
    initial_hands = []
    for index, player in enumerate(players):
        deck = build_deck(decks[index]) if decks is not None else build_player_deck(index)
        validate_same_name_limit(deck)
        rng.shuffle(deck)
        player.deck = deck
        initial_hand = _initial_hand_for_player(config, index)
        initial_hands.append(initial_hand)
        player.draw(initial_hand, rng)
    state = GameState(seed=seed, rng=rng, players=players, config=config)
    state.log.append(
        {
            "event": "setup",
            "seed": seed,
            "initial_hand": config.initial_hand,
            "initial_hands": initial_hands,
            "life": config.life,
        }
    )
    return state


def start_turn(state: GameState) -> None:
    state.turn += 1
    state.actions_remaining = _actions_for_turn(state)
    state.charged_actions_remaining = 0
    state.phase = "main"
    for player in state.players:
        player.hand_defenses_used_this_turn = 0
        player.played_ai_this_turn = False
    _ready_active_field_ai_for_turn(state)
    state.active().pending_effects["pipeline_used"] = False
    state.active().pending_effects["accelerator_used"] = False
    state.active().pending_effects["charge_used"] = False
    state.active().charge_guarded_field_ai.clear()
    state.active().pending_effects.pop("sandbox_shield", None)
    state.active().turns_started += 1
    hand_count_at_turn_start = len(state.active().hand)
    drawn = state.active().draw(1, state.rng) if _should_draw_for_turn(state) else 0
    memory_drawn = _apply_turn_start_memory(state, hand_count_at_turn_start)
    state.log.append(
        {
            "turn": state.turn,
            "active_player": state.active().name,
            "event": "turn_start",
            "draw_count": drawn,
            "memory_draw_count": memory_drawn,
            "actions_remaining": state.actions_remaining,
            "life": [player.life for player in state.players],
            "field": _field_state(state),
        }
    )
    _check_resource_exhaustion(state)


def end_turn(state: GameState) -> None:
    discarded_for_limit = _enforce_hand_limit(state, state.active())
    state.active().pending_effects.pop("sandbox_shield", None)
    state.log.append(
        {
            "turn": state.turn,
            "active_player": state.active().name,
            "event": "turn_end",
            "hand_limit_discarded": [card.id for card in discarded_for_limit],
            "life": [player.life for player in state.players],
            "field": _field_state(state),
        }
    )
    state.actions_remaining = 0
    state.charged_actions_remaining = 0
    state.active_player = state.non_active_player
    _check_resource_exhaustion(state)


def _ready_active_field_ai_for_turn(state: GameState) -> None:
    player = state.active()
    delayed = (
        set(player.power_3_recovery_delayed_field_ai)
        if state.config.power_3_attack_recovery_delay
        else set()
    )
    player.spent_field_ai.clear()
    player.spent_field_ai.update(
        index for index in delayed if 0 <= index < len(player.field_ai)
    )
    player.power_3_recovery_delayed_field_ai.clear()


def apply_action(state: GameState, action: Action) -> None:
    if state.winner is not None or state.draw:
        return
    if action.type == ActionType.END_TURN:
        state.log.append(_action_log_base(state, action) | {"result": "end_turn"})
        state.actions_remaining = 0
        state.charged_actions_remaining = 0
        return

    action_cost = _action_cost(state, action)
    if state.actions_remaining < action_cost:
        raise ValueError("No actions remaining.")

    if action.type == ActionType.PLAY_AI:
        _play_ai(state, action)
    elif action.type == ActionType.PLAY_MEMORY:
        _play_memory(state, action)
    elif action.type == ActionType.USE_MEMORY:
        _use_memory(state, action)
    elif action.type == ActionType.UPGRADE_AI:
        _upgrade_ai(state, action)
    elif action.type == ActionType.USE_COMMAND:
        _use_command(state, action)
    elif action.type == ActionType.ATTACK:
        if not _can_active_player_attack(state):
            raise ValueError("The active player cannot attack now.")
        _attack(state, action)
    elif action.type == ActionType.CHARGE:
        _charge(state, action)
    else:
        raise ValueError(f"Unsupported action: {action.type}")

    _spend_actions(state, action_cost, attack=action.type == ActionType.ATTACK)
    _check_winner(state)
    _check_resource_exhaustion(state)


def finish_if_turn_limit_reached(state: GameState) -> None:
    if state.winner is None and not state.draw and state.turn >= state.config.max_turns:
        _finish_by_life_judgement(state, "max_turns_reached")


def result_summary(state: GameState) -> dict[str, Any]:
    return {
        "seed": state.seed,
        "config": {
            "life": state.config.life,
            "initial_hand": state.config.initial_hand,
            "first_player_initial_hand": state.config.first_player_initial_hand,
            "second_player_initial_hand": state.config.second_player_initial_hand,
            "actions_per_turn": state.config.actions_per_turn,
            "field_ai_limit": state.config.field_ai_limit,
            "max_turns": state.config.max_turns,
            "defense_advantage_bonus": state.config.defense_advantage_bonus,
            "defense_disadvantage_penalty": (
                state.config.defense_disadvantage_penalty
            ),
            "same_attribute_strict_defense": state.config.same_attribute_strict_defense,
            "first_player_first_turn_actions": state.config.first_player_first_turn_actions,
            "each_player_first_turn_actions": (
                state.config.each_player_first_turn_actions
            ),
            "first_player_first_turn_can_attack": (
                state.config.first_player_first_turn_can_attack
            ),
            "first_player_first_turn_draw": state.config.first_player_first_turn_draw,
            "second_player_first_turn_draw": state.config.second_player_first_turn_draw,
            "each_player_first_turn_can_attack": (
                state.config.each_player_first_turn_can_attack
            ),
            "hand_defense_limit_per_turn": state.config.hand_defense_limit_per_turn,
            "hand_defense_requires_empty_field": (
                state.config.hand_defense_requires_empty_field
            ),
            "exhaust_after_attack": state.config.exhaust_after_attack,
            "exhausted_ai_can_defend": state.config.exhausted_ai_can_defend,
            "exact_upgrade_step": state.config.exact_upgrade_step,
            "successful_defense_discards_both": (
                state.config.successful_defense_discards_both
            ),
            "power_1_draws_on_play": state.config.power_1_draws_on_play,
            "power_2_defense_bonus": state.config.power_2_defense_bonus,
            "large_ai_play_cost": state.config.large_ai_play_cost,
            "large_ai_upgrade_cost": state.config.large_ai_upgrade_cost,
            "power_3_play_cost": state.config.power_3_play_cost,
            "power_4_play_cost": state.config.power_4_play_cost,
            "power_3_enters_spent": state.config.power_3_enters_spent,
            "power_3_discards_on_play": state.config.power_3_discards_on_play,
            "power_3_cannot_hand_defend": state.config.power_3_cannot_hand_defend,
            "power_3_cannot_field_defend": state.config.power_3_cannot_field_defend,
            "power_3_defense_modifier": state.config.power_3_defense_modifier,
            "power_3_overheats_after_attack": (
                state.config.power_3_overheats_after_attack
            ),
            "power_3_attack_recovery_delay": (
                state.config.power_3_attack_recovery_delay
            ),
            "power_4_enters_spent": state.config.power_4_enters_spent,
            "power_4_overheats_after_attack": (
                state.config.power_4_overheats_after_attack
            ),
            "hand_limit": state.config.hand_limit,
            "ai_profiles": list(state.config.ai_profiles),
        },
        "winner": None if state.winner is None else state.players[state.winner].name,
        "draw": state.draw,
        "turn_count": state.turn,
        "player_1_final_life": state.players[0].life,
        "player_2_final_life": state.players[1].life,
        "player_1_cards_drawn": state.players[0].cards_drawn,
        "player_2_cards_drawn": state.players[1].cards_drawn,
        "player_1_ai_lost": state.players[0].ai_lost,
        "player_2_ai_lost": state.players[1].ai_lost,
        "successful_defenses": state.stats.successful_defenses,
        "failed_defenses": state.stats.failed_defenses,
        "undefended_attacks": state.stats.undefended_attacks,
        "actions_used": state.stats.actions_used,
        "charged_actions_remaining": state.charged_actions_remaining,
        "attacks": state.stats.attacks,
        "attack_by_attribute": state.stats.attack_by_attribute,
        "card_usage": state.stats.card_usage,
        "final_hand_sizes": [len(player.hand) for player in state.players],
        "final_memory": [player.memory.id if player.memory else None for player in state.players],
    }


def _play_ai(state: GameState, action: Action) -> None:
    player = state.active()
    if action.source_index is None:
        raise ValueError("PLAY_AI requires a hand index.")
    if len(player.field_ai) >= state.config.field_ai_limit:
        raise ValueError("Summon field is full.")
    card = player.hand.pop(action.source_index)
    if card.type != CardType.AI:
        raise ValueError("Only summon cards can be played with PLAY_AI.")
    action_cost = _play_cost(state, card)
    player.field_ai.append(card)
    player.played_ai_this_turn = True
    field_index = len(player.field_ai) - 1
    drawn = 0
    if state.config.power_3_enters_spent and card.power == 3:
        player.spent_field_ai.add(field_index)
    if state.config.power_4_enters_spent and card.power == 4:
        player.spent_field_ai.add(field_index)
    if enters_spent_on_play(card):
        player.spent_field_ai.add(field_index)
    power_3_discarded = _discard_power_3_play_fuel(state, player, card)
    if state.config.power_1_draws_on_play and draws_on_play(card):
        drawn = player.draw(1, state.rng)
    enter_effect = _apply_ai_enter_effect(state, player, card)
    pipeline = _apply_pipeline_memory(state, player, card)
    state.stats.record_card_usage(card.id, "played")
    state.log.append(
        _action_log_base(state, action)
        | {
            "card_id": card.id,
            "result": "played",
            "action_cost": action_cost,
            "draw_count": drawn,
            "power_3_discarded_card": (
                power_3_discarded.id if power_3_discarded else None
            ),
            "effect_draw_count": enter_effect["draw_count"],
            "effect_discarded_card": enter_effect["discarded_card"],
            "effect_spent_ai": enter_effect["spent_ai"],
            "effect_recovered_ai": enter_effect["recovered_ai"],
            "effect_self_damage": enter_effect["self_damage"],
            "effect_opponent_draw_count": enter_effect["opponent_draw_count"],
            "pipeline_draw_count": pipeline["draw_count"],
            "pipeline_discarded_card": pipeline["discarded_card"],
            "field": _field_state(state),
        }
    )


def _play_memory(state: GameState, action: Action) -> None:
    player = state.active()
    if action.source_index is None:
        raise ValueError("PLAY_MEMORY requires a hand index.")
    card = player.hand.pop(action.source_index)
    if card.type != CardType.MEMORY:
        player.hand.insert(action.source_index, card)
        raise ValueError("Only relic cards can be played with PLAY_MEMORY.")
    replaced = player.memory
    if replaced is not None:
        player.discard.append(replaced)
    player.memory = card
    state.stats.record_card_usage(card.id, "played")
    state.log.append(
        _action_log_base(state, action)
        | {
            "card_id": card.id,
            "result": "memory_played",
            "replaced_memory": replaced.id if replaced else None,
            "field": _field_state(state),
        }
    )


def _use_memory(state: GameState, action: Action) -> None:
    player = state.active()
    if action.target_index is None:
        raise ValueError("USE_MEMORY requires a field target index.")
    if player.memory is None or player.memory.effect != MemoryEffect.ACCELERATOR.value:
        raise ValueError("Only accelerator relic can be used with USE_MEMORY.")
    if player.pending_effects.get("accelerator_used"):
        raise ValueError("Accelerator relic is already used this turn.")
    if state.actions_remaining <= 0:
        raise ValueError("Accelerator relic requires an active action window.")
    if state.actions_remaining >= 3:
        raise ValueError("Accelerator relic cannot increase actions beyond 3.")
    if action.target_index < 0 or action.target_index >= len(player.field_ai):
        raise ValueError("Accelerator target is out of range.")
    sacrificed = _remove_field_ai(player, action.target_index)
    player.discard.append(sacrificed)
    player.ai_lost += 1
    player.pending_effects["accelerator_used"] = True
    state.actions_remaining = min(3, state.actions_remaining + 1)
    state.stats.record_card_usage(player.memory.id, "used")
    state.log.append(
        _action_log_base(state, action)
        | {
            "card_id": player.memory.id,
            "result": "memory_used",
            "sacrificed_ai": sacrificed.id,
            "actions_remaining": state.actions_remaining,
            "field": _field_state(state),
        }
    )


def _upgrade_ai(state: GameState, action: Action) -> None:
    player = state.active()
    if action.source_index is None or action.target_index is None:
        raise ValueError("UPGRADE_AI requires hand and field indexes.")
    if action.target_index < 0 or action.target_index >= len(player.field_ai):
        raise ValueError("Upgrade source is out of range.")
    card = player.hand.pop(action.source_index)
    source = player.field_ai[action.target_index]
    if card.type != CardType.AI:
        player.hand.insert(action.source_index, card)
        raise ValueError("Only summon cards can upgrade.")
    if not _can_upgrade_with_config(state, source, card):
        player.hand.insert(action.source_index, card)
        raise ValueError("Upgrade requires a lower-power summon with the same attribute.")

    player.discard.append(source)
    player.ai_lost += 1
    player.field_ai[action.target_index] = card
    player.spent_field_ai.discard(action.target_index)
    player.power_3_recovery_delayed_field_ai.discard(action.target_index)
    player.charge_guarded_field_ai.discard(action.target_index)
    drawn = 0
    if state.config.power_3_enters_spent and card.power == 3:
        player.spent_field_ai.add(action.target_index)
    if state.config.power_4_enters_spent and card.power == 4:
        player.spent_field_ai.add(action.target_index)
    if enters_spent_on_play(card):
        player.spent_field_ai.add(action.target_index)
    power_3_discarded = _discard_power_3_play_fuel(state, player, card)
    if state.config.power_1_draws_on_play and draws_on_play(card):
        drawn = player.draw(1, state.rng)
    enter_effect = _apply_ai_enter_effect(state, player, card, excluded_recover_card=source)
    pipeline = _apply_pipeline_memory(state, player, card)
    state.stats.record_card_usage(card.id, "upgraded")
    state.stats.record_card_usage(source.id, "upgrade_source")
    state.log.append(
        _action_log_base(state, action)
        | {
            "card_id": card.id,
            "upgrade_source": source.id,
            "result": "upgraded",
            "action_cost": _upgrade_cost(state, source, card),
            "draw_count": drawn,
            "power_3_discarded_card": (
                power_3_discarded.id if power_3_discarded else None
            ),
            "effect_draw_count": enter_effect["draw_count"],
            "effect_discarded_card": enter_effect["discarded_card"],
            "effect_spent_ai": enter_effect["spent_ai"],
            "effect_recovered_ai": enter_effect["recovered_ai"],
            "effect_self_damage": enter_effect["self_damage"],
            "effect_opponent_draw_count": enter_effect["opponent_draw_count"],
            "pipeline_draw_count": pipeline["draw_count"],
            "pipeline_discarded_card": pipeline["discarded_card"],
            "field": _field_state(state),
        }
    )


def _attack(state: GameState, action: Action) -> None:
    attacker = state.active()
    defender = state.opponent()
    if action.source_index is None:
        raise ValueError("ATTACK requires a field index.")
    if action.source_index in attacker.spent_field_ai:
        raise ValueError("This summon has already acted this turn.")
    attack_ai = attacker.field_ai[action.source_index]
    defense_index = _choose_field_defender(state, attack_ai, defender, state.non_active_player)
    hand_defense_index = _choose_hand_defender(state, attack_ai, defender)
    if defense_index is not None and hand_defense_index is not None:
        if pierces_hand_defense(attack_ai):
            hand_defense_index = None
        else:
            field_ai = defender.field_ai[defense_index]
            hand_ai = defender.hand[hand_defense_index]
            if (hand_ai.power or 0, hand_ai.id) < (field_ai.power or 0, field_ai.id):
                defense_index = None
            else:
                hand_defense_index = None
    defense_ai_id = None
    firewall_discarded_card = None
    block_pressure_discarded_card = None
    damage = 0
    draw_count = 0
    blocked_attack_draw_count = 0
    defense_draw_count = 0
    outcome = "blocked"
    defense_result = "undefended"
    attacker_overheated = False

    state.stats.attacks += 1
    state.stats.record_card_usage(attack_ai.id, "attacked")
    if state.config.exhaust_after_attack and not keeps_ready_after_attack(attack_ai):
        attacker.spent_field_ai.add(action.source_index)
        if state.config.power_3_attack_recovery_delay and attack_ai.power == 3:
            attacker.power_3_recovery_delayed_field_ai.add(action.source_index)

    if defense_index is None:
        if hand_defense_index is None:
            damage = 1
            _deal_damage(defender)
            state.stats.undefended_attacks += 1
            outcome = "damage"
        else:
            defense_ai = defender.hand.pop(hand_defense_index)
            defender.hand_defenses_used_this_turn += 1
            defense_ai_id = defense_ai.id
            state.stats.successful_defenses += 1
            state.stats.record_card_usage(defense_ai.id, "hand_defended_success")
            defense_result = "success_from_hand"
            defender.discard.append(defense_ai)
            defender.ai_lost += 1
            if pierces_hand_defense(attack_ai):
                damage = 1
                _deal_damage(defender)
                outcome = "damage"
                state.stats.record_card_usage(attack_ai.id, "pierced_hand_defense")
    else:
        defense_ai = defender.field_ai[defense_index]
        defense_ai_id = defense_ai.id
        if can_defend(
            attack_ai,
            defense_ai,
            advantage_bonus=state.config.defense_advantage_bonus,
            disadvantage_penalty=state.config.defense_disadvantage_penalty,
            same_attribute_strict=state.config.same_attribute_strict_defense,
            defense_power_bonus=_defense_power_bonus(
                state,
                defender,
                defense_ai,
                attack_ai,
                field_index=defense_index,
            ),
        ):
            state.stats.successful_defenses += 1
            state.stats.record_card_usage(defense_ai.id, "defended_success")
            defense_value = defense_combat_value(
                attack_ai,
                defense_ai,
                advantage_bonus=state.config.defense_advantage_bonus,
                disadvantage_penalty=state.config.defense_disadvantage_penalty,
                defense_power_bonus=_defense_power_bonus(
                    state,
                    defender,
                    defense_ai,
                    attack_ai,
                    field_index=defense_index,
                ),
            )
            attack_value = attack_combat_value(attack_ai)
            defense_result = "success_trade" if defense_value == attack_value else "success"
            firewall_discarded_card = _discard_firewall_fuel(
                state,
                defender,
                defense_ai,
                attack_ai,
            )
            if draws_on_successful_defense(defense_ai):
                defense_draw_count = defender.draw(1, state.rng)
                state.stats.record_card_usage(defense_ai.id, "defense_draw")
            attacker.discard.append(_remove_field_ai(attacker, action.source_index))
            attacker.ai_lost += 1
            if defense_value == attack_value:
                defender.discard.append(_remove_field_ai(defender, defense_index))
                defender.ai_lost += 1
            else:
                defender.spent_field_ai.add(defense_index)
        else:
            # The phase-1 automated player should not choose this, but the engine supports it.
            lost_ai = _remove_field_ai(defender, defense_index)
            defender.discard.append(lost_ai)
            defender.ai_lost += 1
            damage = 1
            _deal_damage(defender)
            state.stats.failed_defenses += 1
            state.stats.record_card_usage(defense_ai.id, "defended_failed")
            defense_result = "failed"
            outcome = "damage"

    if damage == 0 and defense_result.startswith("success"):
        if pressures_on_block(attack_ai):
            discarded = _discard_low_priority_cards(defender, 1)
            if discarded:
                block_pressure_discarded_card = discarded[0].id
                state.stats.record_card_usage(attack_ai.id, "block_pressure")
        if draws_on_blocked_attack(attack_ai):
            blocked_attack_draw_count = attacker.draw(1, state.rng)
            state.stats.record_card_usage(attack_ai.id, "blocked_attack_draw")

    overheat = _overheat_attacker_after_attack(
        state,
        attacker,
        action.source_index,
        attack_ai,
    )
    attacker_overheated = overheat["overheated"]
    attribute = attack_ai.attribute.value if attack_ai.attribute else "-"
    state.stats.record_attribute_attack(attribute, outcome)
    state.log.append(
        _action_log_base(state, action)
        | {
            "attack_ai": attack_ai.id,
            "defense_ai": defense_ai_id,
            "defense_result": defense_result,
            "damage": damage,
            "draw_count": draw_count,
            "blocked_attack_draw_count": blocked_attack_draw_count,
            "defense_draw_count": defense_draw_count,
            "attacker_overheated": attacker_overheated,
            "sandbox_command_used": overheat["sandbox_command_used"],
            "overheat_draw_count": overheat["overheat_draw_count"],
            "firewall_discarded_card": firewall_discarded_card.id if firewall_discarded_card else None,
            "block_pressure_discarded_card": block_pressure_discarded_card,
            "life": [player.life for player in state.players],
            "field": _field_state(state),
        }
    )


def _charge(state: GameState, action: Action) -> None:
    player = state.active()
    if action.source_index is None:
        raise ValueError("CHARGE requires a hand index.")
    if action.source_index < 0 or action.source_index >= len(player.hand):
        raise ValueError("Charge source is out of range.")
    if not _can_charge_card(player.hand[action.source_index]):
        raise ValueError("Power 3 or higher summons cannot be charged.")
    if player.pending_effects.get("charge_used"):
        raise ValueError("Charge is already used this turn.")
    if state.actions_remaining >= 3:
        raise ValueError("Charge cannot increase actions beyond 3.")
    card = player.hand.pop(action.source_index)
    player.discard.append(card)
    before = state.actions_remaining
    state.actions_remaining = min(3, state.actions_remaining + 1)
    if state.actions_remaining > before:
        state.charged_actions_remaining += 1
    player.pending_effects["charge_used"] = True
    charge_effect = _apply_charge_effect(state, player, card)
    state.stats.record_card_usage(card.id, "charged")
    state.log.append(
        _action_log_base(state, action)
        | {
            "discarded_card": card.id,
            "result": "charged",
            "actions_remaining": state.actions_remaining,
            "charged_actions_remaining": state.charged_actions_remaining,
            "charge_effect": charge_effect,
            "field": _field_state(state),
        }
    )


def _apply_charge_effect(state: GameState, player: PlayerState, charged_card) -> dict[str, Any]:
    opponent = state.opponent()
    result: dict[str, Any] = {
        "opponent_discarded_card": None,
        "draw_count": 0,
        "readied_ai": None,
        "charge_guarded_ai": None,
        "resonator_draw_count": 0,
    }
    if charged_card.effect == AiEffect.CHARGE_PRESSURE.value and len(opponent.hand) >= 3:
        discarded = _discard_low_priority_cards(opponent, 1)
        result["opponent_discarded_card"] = discarded[0].id if discarded else None
        state.stats.record_card_usage(charged_card.id, "charge_pressure")
    if charged_card.effect == AiEffect.CHARGE_DRAW.value:
        result["draw_count"] = player.draw(1, state.rng)
        state.stats.record_card_usage(charged_card.id, "charge_draw")
    if charged_card.effect == AiEffect.CHARGE_READY_ALLY.value:
        target_index = _highest_power_spent_ai(player)
        if target_index is not None:
            target = player.field_ai[target_index]
            player.spent_field_ai.remove(target_index)
            player.power_3_recovery_delayed_field_ai.discard(target_index)
            result["readied_ai"] = target.id
            state.stats.record_card_usage(charged_card.id, "charge_ready_ally")
    if charged_card.effect == AiEffect.CHARGE_GUARD.value:
        target_index = _highest_power_field_ai(player)
        if target_index is not None:
            player.charge_guarded_field_ai.add(target_index)
            result["charge_guarded_ai"] = player.field_ai[target_index].id
            state.stats.record_card_usage(charged_card.id, "charge_guard")
    if (
        player.memory is not None
        and player.memory.effect == MemoryEffect.RESONATOR.value
        and len(player.hand) <= 2
    ):
        result["resonator_draw_count"] = player.draw(1, state.rng)
        state.stats.record_card_usage(player.memory.id, "charge_draw")
    return result


def _use_command(state: GameState, action: Action) -> None:
    player = state.active()
    opponent = state.opponent()
    if action.source_index is None:
        raise ValueError("USE_COMMAND requires a hand index.")
    command = player.hand.pop(action.source_index)
    if command.type != CardType.EVENT:
        raise ValueError("Only command cards can be used with USE_COMMAND.")

    result: dict[str, Any] = {
        "card_id": command.id,
        "result": "command_used",
        "effect": command.effect,
        "field": _field_state(state),
    }

    if command.effect == CommandEffect.OPTIMIZE.value:
        if not player.hand:
            player.hand.insert(action.source_index, command)
            raise ValueError("Optimize requires another hand card to discard.")
        player.discard.append(command)
        discarded = _discard_low_priority_cards(player, 1)
        drawn = player.draw(2, state.rng)
        result |= {
            "discarded_cards": [card.id for card in discarded],
            "draw_count": drawn,
        }
    elif command.effect == CommandEffect.PATCH.value:
        ready_index = action.target_index
        if ready_index is None:
            ready_index = _highest_power_spent_ai(player)
        if ready_index is None:
            player.hand.insert(action.source_index, command)
            raise ValueError("Patch requires a spent summon.")
        if ready_index not in player.spent_field_ai:
            player.hand.insert(action.source_index, command)
            raise ValueError("Patch target must be a spent summon.")
        player.spent_field_ai.remove(ready_index)
        player.power_3_recovery_delayed_field_ai.discard(ready_index)
        player.discard.append(command)
        result |= {"readied_ai": player.field_ai[ready_index].id}
    elif command.effect == CommandEffect.DISRUPT.value:
        target_index = action.target_index
        if target_index is None:
            target_index = _highest_power_ready_ai(opponent)
        if target_index is None:
            player.hand.insert(action.source_index, command)
            raise ValueError("Disrupt requires a ready opposing summon.")
        if target_index < 0 or target_index >= len(opponent.field_ai):
            player.hand.insert(action.source_index, command)
            raise ValueError("Disrupt target is out of range.")
        if target_index in opponent.spent_field_ai:
            player.hand.insert(action.source_index, command)
            raise ValueError("Disrupt target must be ready.")
        opponent.spent_field_ai.add(target_index)
        player.discard.append(command)
        result |= {"disrupted_ai": opponent.field_ai[target_index].id}
    elif command.effect == CommandEffect.RELEARN.value:
        if not player.hand:
            player.hand.insert(action.source_index, command)
            raise ValueError("Relearn requires another hand card to discard.")
        target_index = action.target_index
        if target_index is None:
            target_index = _highest_power_ai_in_discard(player)
        if target_index is None:
            player.hand.insert(action.source_index, command)
            raise ValueError("Relearn requires a summon in discard.")
        if target_index < 0 or target_index >= len(player.discard):
            player.hand.insert(action.source_index, command)
            raise ValueError("Relearn target is out of range.")
        if player.discard[target_index].type != CardType.AI:
            player.hand.insert(action.source_index, command)
            raise ValueError("Relearn target must be a summon.")
        fuel = _discard_low_priority_cards(player, 1)
        recovered = player.discard.pop(target_index)
        player.hand.append(recovered)
        player.discard.append(command)
        result |= {
            "recovered_ai": recovered.id,
            "relearn_discarded_card": fuel[0].id if fuel else None,
        }
    elif command.effect == CommandEffect.SANDBOX.value:
        if state.actions_remaining < 2:
            player.hand.insert(action.source_index, command)
            raise ValueError("Sandbox requires enough actions to attack after using it.")
        if player.pending_effects.get("sandbox_shield"):
            player.hand.insert(action.source_index, command)
            raise ValueError("Sandbox is already active.")
        target_index = _ready_power_4_ai(player)
        if target_index is None:
            player.hand.insert(action.source_index, command)
            raise ValueError("Sandbox requires a ready power 4 summon.")
        player.pending_effects["sandbox_shield"] = 1
        player.discard.append(command)
        result |= {"sandbox_target": player.field_ai[target_index].id}
    elif command.effect == CommandEffect.TRINITY.value:
        if len(player.field_ai) < state.config.field_ai_limit:
            player.hand.insert(action.source_index, command)
            raise ValueError("Trinity requires a full summon field.")
        sacrificed = []
        while player.field_ai:
            sacrificed.append(_remove_field_ai(player, len(player.field_ai) - 1))
        sacrificed.reverse()
        player.discard.extend(sacrificed)
        player.ai_lost += len(sacrificed)
        _deal_damage(opponent)
        player.discard.append(command)
        result |= {
            "sacrificed_ai": [card.id for card in sacrificed],
            "damage": 1,
            "life": [player.life for player in state.players],
            "field": _field_state(state),
        }
    elif command.effect == CommandEffect.FIRE_RITE.value:
        if not _has_attribute_ai(player, Attribute.FIRE):
            player.hand.insert(action.source_index, command)
            raise ValueError("Fire rite requires a fire summon in field.")
        player.discard.append(command)
        discarded = _discard_low_priority_cards(opponent, 1)
        result |= {
            "fire_rite_discarded_card": discarded[0].id if discarded else None,
            "damage": 0,
        }
        if not discarded:
            _deal_damage(opponent)
            result |= {
                "damage": 1,
                "life": [player.life for player in state.players],
            }
    elif command.effect == CommandEffect.WATER_RITE.value:
        if not _has_attribute_ai(player, Attribute.WATER):
            player.hand.insert(action.source_index, command)
            raise ValueError("Water rite requires a water summon in field.")
        if not player.deck:
            player.hand.insert(action.source_index, command)
            raise ValueError("Water rite requires a deck card to draw.")
        player.discard.append(command)
        drawn = player.draw(1, state.rng)
        result |= {
            "draw_count": drawn,
        }
    elif command.effect == CommandEffect.WIND_RITE.value:
        if not _has_attribute_ai(player, Attribute.WIND):
            player.hand.insert(action.source_index, command)
            raise ValueError("Wind rite requires a wind summon in field.")
        disrupted_index = _highest_power_ready_ai(opponent)
        readied_index = _highest_power_spent_ai_by_attribute(player, Attribute.WIND)
        if disrupted_index is None and readied_index is None:
            player.hand.insert(action.source_index, command)
            raise ValueError("Wind rite requires a ready enemy or spent wind summon.")
        player.discard.append(command)
        disrupted_ai = None
        readied_ai = None
        if disrupted_index is not None:
            opponent.spent_field_ai.add(disrupted_index)
            disrupted_ai = opponent.field_ai[disrupted_index].id
        if readied_index is not None:
            player.spent_field_ai.remove(readied_index)
            player.power_3_recovery_delayed_field_ai.discard(readied_index)
            readied_ai = player.field_ai[readied_index].id
        result |= {
            "disrupted_ai": disrupted_ai,
            "readied_ai": readied_ai,
        }
    elif command.effect == CommandEffect.EARTH_RITE.value:
        if not _has_attribute_ai(player, Attribute.EARTH):
            player.hand.insert(action.source_index, command)
            raise ValueError("Earth rite requires an earth summon in field.")
        target_index = _highest_power_ai_in_discard(player)
        if target_index is None:
            player.hand.insert(action.source_index, command)
            raise ValueError("Earth rite requires a summon in discard.")
        recovered = player.discard.pop(target_index)
        player.hand.append(recovered)
        player.discard.append(command)
        result |= {
            "recovered_ai": recovered.id,
        }
    else:
        player.hand.insert(action.source_index, command)
        raise ValueError(f"Unsupported command effect: {command.effect}")

    state.stats.record_card_usage(command.id, "used")
    state.log.append(_action_log_base(state, action) | result)


def _deal_damage(player: PlayerState) -> None:
    player.life -= 1


def _choose_field_defender(
    state: GameState,
    attack_ai,
    defender: PlayerState,
    defender_index: int,
) -> int | None:
    if state.config.ai_profiles[defender_index] == "beginner":
        return None
    return choose_defender(
        attack_ai,
        defender,
        advantage_bonus=state.config.defense_advantage_bonus,
        disadvantage_penalty=state.config.defense_disadvantage_penalty,
        same_attribute_strict=state.config.same_attribute_strict_defense,
        exhausted_ai_can_defend=state.config.exhausted_ai_can_defend,
        power_2_defense_bonus=state.config.power_2_defense_bonus,
        power_3_cannot_field_defend=state.config.power_3_cannot_field_defend,
        power_3_defense_modifier=state.config.power_3_defense_modifier,
    )


def _choose_hand_defender(state: GameState, attack_ai, defender: PlayerState) -> int | None:
    if state.config.ai_profiles[state.non_active_player] == "beginner":
        return None
    if blocks_low_life_hand_defense(attack_ai) and defender.life <= 2:
        return None
    if state.config.hand_defense_requires_empty_field and defender.field_ai:
        return None
    if state.config.hand_defense_limit_per_turn is not None:
        if state.config.hand_defense_limit_per_turn <= 0:
            return None
        if defender.hand_defenses_used_this_turn >= state.config.hand_defense_limit_per_turn:
            return None
    return choose_hand_defender(
        attack_ai,
        defender,
        advantage_bonus=state.config.defense_advantage_bonus,
        disadvantage_penalty=state.config.defense_disadvantage_penalty,
        same_attribute_strict=state.config.same_attribute_strict_defense,
        power_2_defense_bonus=state.config.power_2_defense_bonus,
        power_3_cannot_hand_defend=state.config.power_3_cannot_hand_defend,
        power_3_defense_modifier=state.config.power_3_defense_modifier,
    )


def _check_winner(state: GameState) -> None:
    for index, player in enumerate(state.players):
        if player.life <= 0:
            state.winner = 1 - index
            state.phase = "finished"
            state.log.append(
                {
                    "turn": state.turn,
                    "event": "game_end",
                    "winner": state.players[state.winner].name,
                    "life": [p.life for p in state.players],
                    "field": _field_state(state),
                }
            )
            return


def _check_resource_exhaustion(state: GameState) -> None:
    if state.winner is not None or state.draw:
        return
    exhausted_players = [
        index
        for index, player in enumerate(state.players)
        if not _has_live_resources(player)
    ]
    if not exhausted_players:
        return
    state.phase = "finished"
    state.actions_remaining = 0
    state.charged_actions_remaining = 0
    if len(exhausted_players) == len(state.players):
        state.draw = True
        result = "mutual_forced_loss"
    else:
        loser = exhausted_players[0]
        state.winner = 1 - loser
        result = "forced_loss"
    state.log.append(
        {
            "turn": state.turn,
            "event": "resource_exhaustion",
            "result": result,
            "winner": None if state.winner is None else state.players[state.winner].name,
            "losers": [state.players[index].name for index in exhausted_players],
            "life": [player.life for player in state.players],
            "field": _field_state(state),
        }
    )


def _has_live_resources(player: PlayerState) -> bool:
    return bool(player.deck or player.hand or player.field_ai)


def _finish_by_life_judgement(state: GameState, event: str) -> None:
    life = [player.life for player in state.players]
    if life[0] == life[1]:
        state.draw = True
        result = "draw"
    else:
        state.winner = 0 if life[0] > life[1] else 1
        result = "life_judgement"
    state.phase = "finished"
    state.actions_remaining = 0
    state.charged_actions_remaining = 0
    state.log.append(
        {
            "turn": state.turn,
            "event": event,
            "result": result,
            "winner": None if state.winner is None else state.players[state.winner].name,
            "life": life,
            "field": _field_state(state),
        }
    )


def _remove_field_ai(player: PlayerState, index: int):
    lost_ai = player.field_ai.pop(index)
    player.spent_field_ai = {
        spent_index if spent_index < index else spent_index - 1
        for spent_index in player.spent_field_ai
        if spent_index != index
    }
    player.power_3_recovery_delayed_field_ai = {
        delayed_index if delayed_index < index else delayed_index - 1
        for delayed_index in player.power_3_recovery_delayed_field_ai
        if delayed_index != index
    }
    player.charge_guarded_field_ai = {
        guarded_index if guarded_index < index else guarded_index - 1
        for guarded_index in player.charge_guarded_field_ai
        if guarded_index != index
    }
    return lost_ai


def _overheat_attacker_after_attack(
    state: GameState,
    attacker: PlayerState,
    attack_index: int,
    attack_ai,
) -> dict[str, Any]:
    result = {
        "overheated": False,
        "sandbox_command_used": False,
        "overheat_draw_count": 0,
    }
    power_4_overheats = (
        attack_ai.power == 4 and state.config.power_4_overheats_after_attack
    )
    power_3_overheats = (
        attack_ai.power == 3 and state.config.power_3_overheats_after_attack
    )
    if not power_4_overheats and not power_3_overheats:
        return result
    if attack_index >= len(attacker.field_ai):
        return result
    if attacker.field_ai[attack_index] is not attack_ai:
        return result
    if power_4_overheats and attacker.pending_effects.get("sandbox_shield", 0) > 0:
        attacker.pending_effects["sandbox_shield"] -= 1
        if attacker.pending_effects["sandbox_shield"] <= 0:
            attacker.pending_effects.pop("sandbox_shield", None)
        attacker.spent_field_ai.add(attack_index)
        state.stats.record_card_usage("CMD-SANDBOX", "prevented_overheat")
        result["sandbox_command_used"] = True
        return result
    if returns_after_overheat(attack_ai):
        attacker.hand.append(_remove_field_ai(attacker, attack_index))
        state.stats.record_card_usage(attack_ai.id, "returned_after_overheat")
        result["overheated"] = True
        return result
    attacker.discard.append(_remove_field_ai(attacker, attack_index))
    attacker.ai_lost += 1
    if draws_after_overheat(attack_ai):
        result["overheat_draw_count"] = attacker.draw(1, state.rng)
        state.stats.record_card_usage(attack_ai.id, "overheat_draw")
    if draws_two_after_overheat(attack_ai):
        result["overheat_draw_count"] = attacker.draw(2, state.rng)
        state.stats.record_card_usage(attack_ai.id, "overheat_draw")
    state.stats.record_card_usage(attack_ai.id, "overheated")
    result["overheated"] = True
    return result


def _actions_for_turn(state: GameState) -> int:
    if (
        state.turn == 1
        and state.active_player == 0
        and state.config.first_player_first_turn_actions is not None
    ):
        return state.config.first_player_first_turn_actions
    if (
        state.active().turns_started == 0
        and state.config.each_player_first_turn_actions is not None
    ):
        return state.config.each_player_first_turn_actions
    return state.config.actions_per_turn


def _initial_hand_for_player(config: GameConfig, player_index: int) -> int:
    if player_index == 0 and config.first_player_initial_hand is not None:
        return config.first_player_initial_hand
    if player_index == 1 and config.second_player_initial_hand is not None:
        return config.second_player_initial_hand
    return config.initial_hand


def _action_cost(state: GameState, action: Action) -> int:
    if action.type == ActionType.PLAY_AI:
        if action.source_index is None:
            raise ValueError(f"{action.type.value} requires a hand index.")
        return _play_cost(state, state.active().hand[action.source_index])
    if action.type == ActionType.UPGRADE_AI:
        if action.source_index is None or action.target_index is None:
            raise ValueError(f"{action.type.value} requires hand and field indexes.")
        player = state.active()
        return _upgrade_cost(
            state,
            player.field_ai[action.target_index],
            player.hand[action.source_index],
        )
    if action.type == ActionType.USE_MEMORY:
        return 0
    if action.type == ActionType.CHARGE:
        return 0
    return 1


def _spend_actions(state: GameState, cost: int, *, attack: bool = False) -> None:
    if cost <= 0:
        return
    if not attack:
        state.charged_actions_remaining = max(
            0,
            state.charged_actions_remaining - min(cost, state.charged_actions_remaining),
        )
    state.actions_remaining -= cost
    state.active().actions_used += cost
    state.stats.actions_used += cost


def _play_cost(state: GameState, card) -> int:
    if card.type == CardType.AI:
        cost = int(card.power or 1)
        player = state.active()
        if (
            player.memory is not None
            and player.memory.effect == MemoryEffect.RECOVERY_CACHE.value
            and player.life < state.opponent().life
            and not player.played_ai_this_turn
        ):
            return max(1, cost - 1)
        return cost
    return 1


def _upgrade_cost(state: GameState, source, target) -> int:
    _ = state
    return max(1, int(target.power or 1) - int(source.power or 0))


def _defense_power_bonus(
    state: GameState,
    defender: PlayerState,
    card,
    attack_ai=None,
    field_index: int | None = None,
) -> int:
    bonus = 0
    if card.power == 3:
        bonus += state.config.power_3_defense_modifier
    if (
        attack_ai is not None
        and defender.memory is not None
        and defender.memory.effect == MemoryEffect.FIREWALL.value
        and bool(defender.hand)
        and card.type == CardType.AI
        and card.attribute != attack_ai.attribute
        and _firewall_should_pay(state, defender, card, attack_ai)
    ):
        bonus += 1
    if field_index is not None and field_index in defender.charge_guarded_field_ai:
        bonus += 1
    return bonus


def _firewall_should_pay(
    state: GameState,
    defender: PlayerState,
    defense_ai,
    attack_ai,
) -> bool:
    if (
        defender.memory is None
        or defender.memory.effect != MemoryEffect.FIREWALL.value
        or defense_ai.attribute == attack_ai.attribute
        or not defender.hand
    ):
        return False
    attack_value = attack_combat_value(attack_ai)
    base_value = defense_combat_value(
        attack_ai,
        defense_ai,
        advantage_bonus=state.config.defense_advantage_bonus,
        disadvantage_penalty=state.config.defense_disadvantage_penalty,
        defense_power_bonus=0,
    )
    paid_value = base_value + 1
    return base_value < attack_value or (base_value == attack_value and paid_value > attack_value)


def command_is_usable(state: GameState, source_index: int) -> bool:
    player = state.active()
    if source_index < 0 or source_index >= len(player.hand):
        return False
    command = player.hand[source_index]
    if command.type != CardType.EVENT:
        return False
    if command.effect == CommandEffect.OPTIMIZE.value:
        return len(player.hand) > 1
    if command.effect == CommandEffect.PATCH.value:
        return bool(player.spent_field_ai)
    if command.effect == CommandEffect.DISRUPT.value:
        return _highest_power_ready_ai(state.opponent()) is not None
    if command.effect == CommandEffect.RELEARN.value:
        return _highest_power_ai_in_discard(player) is not None
    if command.effect == CommandEffect.SANDBOX.value:
        return (
            state.actions_remaining >= 2
            and not player.pending_effects.get("sandbox_shield")
            and _ready_power_4_ai(player) is not None
        )
    if command.effect == CommandEffect.TRINITY.value:
        return len(player.field_ai) >= state.config.field_ai_limit
    if command.effect == CommandEffect.FIRE_RITE.value:
        return _has_attribute_ai(player, Attribute.FIRE)
    if command.effect == CommandEffect.WATER_RITE.value:
        return _has_attribute_ai(player, Attribute.WATER) and bool(player.deck)
    if command.effect == CommandEffect.WIND_RITE.value:
        return _has_attribute_ai(player, Attribute.WIND) and (
            _highest_power_ready_ai(state.opponent()) is not None
            or _highest_power_spent_ai_by_attribute(player, Attribute.WIND) is not None
        )
    if command.effect == CommandEffect.EARTH_RITE.value:
        return (
            _has_attribute_ai(player, Attribute.EARTH)
            and _highest_power_ai_in_discard(player) is not None
        )
    return False


def _lowest_priority_hand_card(player: PlayerState) -> int:
    return min(
        enumerate(player.hand),
        key=lambda item: (_card_priority(item[1]), item[1].id),
    )[0]


def _highest_power_spent_ai(player: PlayerState) -> int | None:
    candidates = [
        (index, player.field_ai[index])
        for index in player.spent_field_ai
        if 0 <= index < len(player.field_ai)
    ]
    if not candidates:
        return None
    return max(candidates, key=lambda item: (item[1].power or 0, item[1].id))[0]


def _highest_power_spent_ai_by_attribute(
    player: PlayerState,
    attribute: Attribute,
) -> int | None:
    candidates = [
        (index, player.field_ai[index])
        for index in player.spent_field_ai
        if 0 <= index < len(player.field_ai)
        and player.field_ai[index].attribute == attribute
    ]
    if not candidates:
        return None
    return max(candidates, key=lambda item: (item[1].power or 0, item[1].id))[0]


def _highest_power_ready_ai(player: PlayerState) -> int | None:
    candidates = [
        (index, card)
        for index, card in enumerate(player.field_ai)
        if index not in player.spent_field_ai
    ]
    if not candidates:
        return None
    return max(candidates, key=lambda item: (item[1].power or 0, item[1].id))[0]


def _highest_power_field_ai(player: PlayerState) -> int | None:
    candidates = list(enumerate(player.field_ai))
    if not candidates:
        return None
    return max(candidates, key=lambda item: (item[1].power or 0, item[1].id))[0]


def _has_attribute_ai(player: PlayerState, attribute: Attribute) -> bool:
    return any(card.attribute == attribute for card in player.field_ai)


def _ready_power_4_ai(player: PlayerState) -> int | None:
    candidates = [
        (index, card)
        for index, card in enumerate(player.field_ai)
        if card.power == 4 and index not in player.spent_field_ai
    ]
    if not candidates:
        return None
    return max(candidates, key=lambda item: item[1].id)[0]


def _highest_power_ai_in_discard(player: PlayerState, excluded_card=None) -> int | None:
    candidates = [
        (index, card)
        for index, card in enumerate(player.discard)
        if card.type == CardType.AI and card is not excluded_card
    ]
    if not candidates:
        return None
    return max(candidates, key=lambda item: (item[1].power or 0, item[1].id))[0]


def _card_priority(card) -> int:
    if card.type == CardType.AI:
        return card.power or 0
    return 1


def _can_charge_card(card) -> bool:
    return card.type != CardType.AI or (card.power or 0) <= 2


def _can_active_player_attack(state: GameState) -> bool:
    if state.actions_remaining <= state.charged_actions_remaining:
        return False
    if state.active().pending_effects.get("charge_used"):
        return False
    if (
        state.active().turns_started == 1
        and not state.config.each_player_first_turn_can_attack
    ):
        return False
    return not (
        state.turn == 1
        and state.active_player == 0
        and not state.config.first_player_first_turn_can_attack
    )


def _should_draw_for_turn(state: GameState) -> bool:
    if (
        state.turn == 2
        and state.active_player == 1
        and not state.config.second_player_first_turn_draw
    ):
        return False
    return not (
        state.turn == 1
        and state.active_player == 0
        and not state.config.first_player_first_turn_draw
    )


def _action_log_base(state: GameState, action: Action) -> dict[str, Any]:
    return {
        "turn": state.turn,
        "active_player": state.active().name,
        "action_type": action.type.value,
        "actions_remaining_before": state.actions_remaining,
    }


def _field_state(state: GameState) -> dict[str, list[str]]:
    return {player.name: player.field_summary() for player in state.players}


def _apply_turn_start_memory(
    state: GameState, hand_count_at_turn_start: int | None = None
) -> int:
    player = state.active()
    if not player.memory or player.memory.effect != MemoryEffect.CACHE.value:
        return 0
    if hand_count_at_turn_start is None:
        hand_count_at_turn_start = len(player.hand)
    if hand_count_at_turn_start > 2:
        return 0
    drawn = player.draw(1, state.rng)
    if drawn:
        state.stats.record_card_usage(player.memory.id, "turn_start_draw")
    return drawn


def _apply_ai_enter_effect(
    state: GameState,
    player: PlayerState,
    played_card,
    excluded_recover_card=None,
) -> dict[str, Any]:
    result = {
        "draw_count": 0,
        "discarded_card": None,
        "spent_ai": None,
        "recovered_ai": None,
        "self_damage": 0,
        "opponent_draw_count": 0,
    }
    if self_damages_on_play(played_card):
        _deal_damage(player)
        result["self_damage"] = 1
        state.stats.record_card_usage(played_card.id, "self_damage_on_play")
    if opponent_draws_on_play(played_card):
        result["opponent_draw_count"] = state.opponent().draw(1, state.rng)
        state.stats.record_card_usage(played_card.id, "opponent_draw_on_play")
    if filters_on_play(played_card):
        result["draw_count"] = player.draw(2, state.rng)
        if player.hand:
            discarded = _discard_low_priority_cards(player, 1)
            result["discarded_card"] = discarded[0].id if discarded else None
        state.stats.record_card_usage(played_card.id, "filtered")
    if spends_enemy_on_play(played_card):
        target_index = _highest_power_ready_ai(state.opponent())
        if target_index is not None:
            target = state.opponent().field_ai[target_index]
            state.opponent().spent_field_ai.add(target_index)
            result["spent_ai"] = target.id
            state.stats.record_card_usage(played_card.id, "spent_enemy")
    if recovers_ai_on_play(played_card) and len(player.hand) <= 1:
        target_index = _highest_power_ai_in_discard(player, excluded_card=excluded_recover_card)
        if target_index is not None:
            recovered = player.discard.pop(target_index)
            player.hand.append(recovered)
            result["recovered_ai"] = recovered.id
            state.stats.record_card_usage(played_card.id, "recovered_ai")
    if readies_ally_on_play(played_card):
        target_index = _highest_power_spent_ai(player)
        if target_index is not None:
            target = player.field_ai[target_index]
            player.spent_field_ai.remove(target_index)
            player.power_3_recovery_delayed_field_ai.discard(target_index)
            result["recovered_ai"] = target.id
            state.stats.record_card_usage(played_card.id, "readied_ally")
    return result


def _apply_pipeline_memory(
    state: GameState,
    player: PlayerState,
    played_card,
) -> dict[str, Any]:
    result = {"draw_count": 0, "discarded_card": None}
    if not player.memory or player.memory.effect != MemoryEffect.PIPELINE.value:
        return result
    if played_card.type != CardType.AI or played_card.power != 1:
        return result
    if player.pending_effects.get("pipeline_used"):
        return result
    player.pending_effects["pipeline_used"] = True
    result["draw_count"] = player.draw(1, state.rng)
    state.stats.record_card_usage(player.memory.id, "drew")
    return result


def _enforce_hand_limit(state: GameState, player: PlayerState) -> list:
    if state.config.hand_limit is None:
        return []
    discarded = []
    while len(player.hand) > state.config.hand_limit:
        discard_index = _lowest_priority_hand_card(player)
        discarded_card = player.hand.pop(discard_index)
        player.discard.append(discarded_card)
        discarded.append(discarded_card)
    return discarded


def _discard_firewall_fuel(
    state: GameState,
    defender: PlayerState,
    defense_ai,
    attack_ai,
):
    if (
        defender.memory is None
        or defender.memory.effect != MemoryEffect.FIREWALL.value
        or defense_ai.attribute == attack_ai.attribute
        or not defender.hand
        or not _firewall_should_pay(state, defender, defense_ai, attack_ai)
    ):
        return None
    discarded = _discard_low_priority_cards(defender, 1)[0]
    state.stats.record_card_usage(defender.memory.id, "defense_fuel")
    return discarded


def _discard_low_priority_cards(player: PlayerState, count: int) -> list:
    discarded = []
    for _ in range(count):
        if not player.hand:
            break
        discard_index = _lowest_priority_hand_card(player)
        discarded_card = player.hand.pop(discard_index)
        player.discard.append(discarded_card)
        discarded.append(discarded_card)
    return discarded


def _discard_power_3_play_fuel(state: GameState, player: PlayerState, card) -> Any:
    if (
        not state.config.power_3_discards_on_play
        or card.type != CardType.AI
        or card.power != 3
        or not player.hand
    ):
        return None
    discarded = _discard_low_priority_cards(player, 1)
    return discarded[0] if discarded else None


def _can_upgrade(source, target) -> bool:
    if source.type != CardType.AI or target.type != CardType.AI:
        return False
    if source.attribute != target.attribute:
        return False
    if source.power is None or target.power is None:
        return False
    if source.power >= target.power:
        return False
    return True


def _can_upgrade_with_config(state: GameState, source, target) -> bool:
    if not _can_upgrade(source, target):
        return False
    if state.config.exact_upgrade_step:
        return target.power == source.power + 1
    return True
