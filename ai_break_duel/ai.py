from __future__ import annotations

from .cards import (
    AiEffect,
    Attribute,
    CardType,
    CommandEffect,
    MemoryEffect,
    attack_combat_value,
    blocks_low_life_hand_defense,
    cannot_hand_defend,
    can_defend,
    defense_combat_value,
    draws_on_blocked_attack,
    draws_on_play,
    draws_on_successful_defense,
    filters_on_play,
    has_attribute,
    keeps_ready_after_attack,
    opponent_draws_on_play,
    pierces_hand_defense,
    pressures_on_block,
    recovers_ai_on_successful_defense,
    shares_attribute,
)
from .models import Action, ActionType, AiProfile, GameState, PlayerState


CHALLENGER_WEIGHTS = {
    "damage": 160,
    "lethal": 310,
    "attack_power": 13,
    "bad_attack": -73,
    "trade_attack": 42,
    "hand_trade_attack": 40,
    "blocked_value": 25,
    "play_ai": 51,
    "empty_field_play": 51,
    "upgrade": 78,
    "memory": 51,
    "command": 76,
    "charge": 38,
    "tempo_action": 16,
    "field_presence": 19,
    "hand_card": 12,
    "opponent_ready": 1,
    "low_life_pressure": 28,
    "classic_prior": 60,
    "strike_base": 26,
    "strike_target_power": 34,
    "strike_ready_target": 14,
    "strike_trade_penalty": 30,
    "strike_power4_penalty": 46,
    "purge_base": 40,
    "purge_target_power": 28,
}
CHALLENGER_SELF_DEFEAT_ATTACK_SCORE = -10000


def choose_action(state: GameState, profile: AiProfile | None = None) -> Action:
    selected_profile: AiProfile = profile or state.config.ai_profiles[state.active_player]
    if selected_profile == "beginner":
        return _choose_beginner_action(state)
    if selected_profile == "classic":
        return _choose_classic_action(state)
    if selected_profile == "challenger":
        return _choose_challenger_action(state)
    raise ValueError(f"Unsupported AI profile: {selected_profile}")


def _choose_classic_action(state: GameState) -> Action:
    player = state.active()
    opponent = state.opponent()

    charge_index = _best_charge_fuel(state)
    if charge_index is not None:
        return Action(ActionType.CHARGE, charge_index)
    if state.actions_remaining <= 0:
        return Action(ActionType.END_TURN)

    if not player.field_ai:
        index = _best_ai_in_hand(player, state)
        if index is not None:
            return Action(ActionType.PLAY_AI, index)

    if _can_active_player_attack(state):
        sandbox_index = _best_sandbox_command(state)
        if sandbox_index is not None:
            return Action(ActionType.USE_COMMAND, sandbox_index)

        damaging_attack = _best_damaging_attacker(
            player,
            opponent,
            advantage_bonus=state.config.defense_advantage_bonus,
            disadvantage_penalty=state.config.defense_disadvantage_penalty,
            same_attribute_strict=state.config.same_attribute_strict_defense,
            exhausted_ai_can_defend=state.config.exhausted_ai_can_defend,
            power_2_defense_bonus=state.config.power_2_defense_bonus,
            power_3_cannot_field_defend=state.config.power_3_cannot_field_defend,
            power_3_defense_modifier=state.config.power_3_defense_modifier,
        )
        if damaging_attack is not None:
            return Action(ActionType.ATTACK, damaging_attack)

        if state.config.monster_combat:
            strike = _best_classic_strike(state, player, opponent)
            if strike is not None:
                return Action(ActionType.STRIKE, strike[0], strike[1])

    if len(player.field_ai) < state.config.field_ai_limit:
        index = _best_ai_in_hand(player, state)
        if index is not None:
            return Action(ActionType.PLAY_AI, index)

    upgrade = _best_upgrade(player, state)
    if upgrade is not None:
        return Action(ActionType.UPGRADE_AI, upgrade[0], upgrade[1])

    if _can_use_accelerator_memory(state) and any(
        card.type == CardType.AI and _play_cost(card, state) == state.actions_remaining + 1
        for card in player.hand
    ):
        target = _accelerator_sacrifice_target(player)
        if target is not None:
            return Action(ActionType.USE_MEMORY, target_index=target)

    memory_index = _best_memory_in_hand(player)
    if memory_index is not None:
        return Action(ActionType.PLAY_MEMORY, memory_index)

    command_index = _best_command_in_hand(state)
    if command_index is not None:
        return Action(ActionType.USE_COMMAND, command_index)

    if _attackable_field_ai(player) and _can_active_player_attack(state):
        return Action(ActionType.ATTACK, _highest_power_field_ai(player))

    return Action(ActionType.END_TURN)


def _choose_beginner_action(state: GameState) -> Action:
    player = state.active()
    if state.actions_remaining <= 0:
        return Action(ActionType.END_TURN)

    if _can_active_player_attack(state):
        attack_index = _best_damaging_attacker(
            player,
            state.opponent(),
            advantage_bonus=state.config.defense_advantage_bonus,
            disadvantage_penalty=state.config.defense_disadvantage_penalty,
            same_attribute_strict=state.config.same_attribute_strict_defense,
            exhausted_ai_can_defend=state.config.exhausted_ai_can_defend,
            power_2_defense_bonus=state.config.power_2_defense_bonus,
            power_3_cannot_field_defend=state.config.power_3_cannot_field_defend,
            power_3_defense_modifier=state.config.power_3_defense_modifier,
        )
        if attack_index is not None:
            return Action(ActionType.ATTACK, attack_index)

    if len(player.field_ai) < state.config.field_ai_limit:
        index = _weakest_ai_in_hand(player, state)
        if index is not None:
            return Action(ActionType.PLAY_AI, index)

    memory_index = _lowest_memory_in_hand(player)
    if memory_index is not None and player.memory is None:
        return Action(ActionType.PLAY_MEMORY, memory_index)

    return Action(ActionType.END_TURN)


def _choose_challenger_action(state: GameState) -> Action:
    candidates = _legal_actions(state)
    if not candidates:
        return Action(ActionType.END_TURN)
    classic_action = _choose_classic_action(state)
    return max(
        candidates,
        key=lambda action: (
            _score_action(state, action, CHALLENGER_WEIGHTS)
            + (CHALLENGER_WEIGHTS["classic_prior"] if action == classic_action else 0),
            _action_tie_break(action),
        ),
    )


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


def choose_defender(
    attack_ai,
    defender: PlayerState,
    *,
    advantage_bonus: int = 1,
    disadvantage_penalty: int = 1,
    same_attribute_strict: bool = False,
    exhausted_ai_can_defend: bool = False,
    power_2_defense_bonus: int = 0,
    power_3_cannot_field_defend: bool = False,
    power_3_defense_modifier: int = 0,
    attack_power_bonus: int = 0,
) -> int | None:
    attack_value = attack_combat_value(attack_ai, attack_power_bonus=attack_power_bonus)
    candidates = [
        (
            index,
            card,
            defense_combat_value(
                attack_ai,
                card,
                advantage_bonus=advantage_bonus,
                disadvantage_penalty=disadvantage_penalty,
                defense_power_bonus=_defense_power_bonus(
                    card,
                    power_2_defense_bonus,
                    defender,
                    attack_ai,
                    field_index=index,
                    power_3_defense_modifier=power_3_defense_modifier,
                    attack_power_bonus=attack_power_bonus,
                ),
            ),
        )
        for index, card in enumerate(defender.field_ai)
        if (exhausted_ai_can_defend or index not in defender.spent_field_ai)
        and not (power_3_cannot_field_defend and card.power == 3)
    ]
    successful = [
        item
        for item in candidates
        if can_defend(
            attack_ai,
            item[1],
            advantage_bonus=advantage_bonus,
            disadvantage_penalty=disadvantage_penalty,
            same_attribute_strict=same_attribute_strict,
            defense_power_bonus=_defense_power_bonus(
                item[1],
                power_2_defense_bonus,
                defender,
                attack_ai,
                field_index=item[0],
                power_3_defense_modifier=power_3_defense_modifier,
                attack_power_bonus=attack_power_bonus,
            ),
            attack_power_bonus=attack_power_bonus,
        )
    ]
    if not successful:
        failed_with_trigger = [
            item
            for item in candidates
            if (
                draws_on_successful_defense(item[1])
                or recovers_ai_on_successful_defense(item[1])
                or (
                    defender.memory is not None
                    and defender.memory.effect == MemoryEffect.TIDAL_MIRROR.value
                )
            )
        ]
        if not failed_with_trigger:
            return None
        return min(failed_with_trigger, key=lambda item: (item[1].power or 0, item[1].id))[0]
    return min(
        successful,
        key=lambda item: (
            0 if item[2] > attack_value else 1,
            item[1].power or 0,
            item[1].id,
        ),
    )[0]


def choose_hand_defender(
    attack_ai,
    defender: PlayerState,
    *,
    advantage_bonus: int = 1,
    disadvantage_penalty: int = 1,
    same_attribute_strict: bool = False,
    power_2_defense_bonus: int = 0,
    power_3_cannot_hand_defend: bool = False,
    power_3_defense_modifier: int = 0,
    attack_power_bonus: int = 0,
) -> int | None:
    if blocks_low_life_hand_defense(attack_ai) and defender.life <= 2:
        return None
    successful = [
        (index, card)
        for index, card in enumerate(defender.hand)
        if card.type == CardType.AI
        and not cannot_hand_defend(card)
        and not (power_3_cannot_hand_defend and card.power == 3)
        and can_defend(
            attack_ai,
            card,
            advantage_bonus=advantage_bonus,
            disadvantage_penalty=disadvantage_penalty,
            same_attribute_strict=same_attribute_strict,
            defense_power_bonus=_defense_power_bonus(
                card,
                power_2_defense_bonus,
                power_3_defense_modifier=power_3_defense_modifier,
            ),
            include_defense_effect_bonus=False,
            attack_power_bonus=attack_power_bonus,
        )
    ]
    if not successful:
        return None
    return min(successful, key=lambda item: (item[1].power or 0, item[1].id))[0]


def _best_ai_in_hand(player: PlayerState, state: GameState | None = None) -> int | None:
    candidates = [
        (index, card)
        for index, card in enumerate(player.hand)
        if card.type == CardType.AI
        and (state is None or _play_cost(card, state) <= state.actions_remaining)
    ]
    if not candidates:
        return None
    return max(candidates, key=lambda item: (item[1].power or 0, item[1].id))[0]


def _best_memory_in_hand(player: PlayerState) -> int | None:
    if player.memory is not None:
        return None
    candidates = [
        (index, card)
        for index, card in enumerate(player.hand)
        if card.type == CardType.MEMORY
    ]
    if not candidates:
        return None
    priority = {
        MemoryEffect.CACHE.value: 4,
        MemoryEffect.RECOVERY_CACHE.value: 4,
        MemoryEffect.ECHO_URN.value: 4,
        MemoryEffect.TIDAL_MIRROR.value: 4,
        MemoryEffect.PIPELINE.value: 3,
        MemoryEffect.ACCELERATOR.value: 3,
        MemoryEffect.RESONATOR.value: 3,
        MemoryEffect.WAR_BANNER.value: 3,
        MemoryEffect.GROVE_REST.value: 3,
        MemoryEffect.STORM_CORE.value: 3,
        MemoryEffect.DUAL_BANNER.value: 3,
        MemoryEffect.FIREWALL.value: 2,
    }
    return max(candidates, key=lambda item: (priority.get(item[1].effect, 0), item[1].id))[0]


def _best_upgrade(player: PlayerState, state: GameState) -> tuple[int, int] | None:
    candidates = []
    for hand_index, target in enumerate(player.hand):
        if target.type != CardType.AI:
            continue
        for field_index, source in enumerate(player.field_ai):
            if (
                _can_upgrade_with_config(state, source, target)
                and _upgrade_cost(source, target, state) <= state.actions_remaining
            ):
                candidates.append((hand_index, field_index, target, source))
    if not candidates:
        return None
    hand_index, field_index, _, _ = max(
        candidates,
        key=lambda item: (
            item[2].power or 0,
            item[3].power or 0,
            item[2].id,
            item[3].id,
        ),
    )
    return hand_index, field_index


def _best_damaging_attacker(
    player: PlayerState,
    opponent: PlayerState,
    *,
    advantage_bonus: int,
    disadvantage_penalty: int,
    same_attribute_strict: bool,
    exhausted_ai_can_defend: bool,
    power_2_defense_bonus: int,
    power_3_cannot_field_defend: bool,
    power_3_defense_modifier: int,
) -> int | None:
    candidates = []
    for index, card in enumerate(player.field_ai):
        if index in player.spent_field_ai:
            continue
        defender_index = choose_defender(
            card,
            opponent,
            advantage_bonus=advantage_bonus,
            disadvantage_penalty=disadvantage_penalty,
            same_attribute_strict=same_attribute_strict,
            exhausted_ai_can_defend=exhausted_ai_can_defend,
            power_2_defense_bonus=power_2_defense_bonus,
            power_3_cannot_field_defend=power_3_cannot_field_defend,
            power_3_defense_modifier=power_3_defense_modifier,
        )
        if defender_index is None or not can_defend(
            card,
            opponent.field_ai[defender_index],
            advantage_bonus=advantage_bonus,
            disadvantage_penalty=disadvantage_penalty,
            same_attribute_strict=same_attribute_strict,
            defense_power_bonus=_defense_power_bonus(
                opponent.field_ai[defender_index],
                power_2_defense_bonus,
                opponent,
                card,
                field_index=defender_index,
                power_3_defense_modifier=power_3_defense_modifier,
            ),
        ):
            candidates.append((index, card))
    if not candidates:
        return None
    return max(candidates, key=lambda item: (item[1].power or 0, item[1].id))[0]


def _legal_actions(state: GameState) -> list[Action]:
    player = state.active()
    actions: list[Action] = []

    if can_use_charge(state):
        actions.extend(
            Action(ActionType.CHARGE, index)
            for index, card in enumerate(player.hand)
            if _can_charge_card(card)
        )

    if state.actions_remaining > 0:
        if len(player.field_ai) < state.config.field_ai_limit:
            actions.extend(
                Action(ActionType.PLAY_AI, index)
                for index, card in enumerate(player.hand)
                if card.type == CardType.AI and _play_cost(card, state) <= state.actions_remaining
            )

        actions.extend(
            Action(ActionType.PLAY_MEMORY, index)
            for index, card in enumerate(player.hand)
            if card.type == CardType.MEMORY
        )

        if _can_use_accelerator_memory(state):
            actions.extend(
                Action(ActionType.USE_MEMORY, target_index=index)
                for index, _ in enumerate(player.field_ai)
            )

        for hand_index, target in enumerate(player.hand):
            if target.type != CardType.AI:
                continue
            for field_index, source in enumerate(player.field_ai):
                if (
                    _can_upgrade_with_config(state, source, target)
                    and _upgrade_cost(source, target, state) <= state.actions_remaining
                ):
                    actions.append(Action(ActionType.UPGRADE_AI, hand_index, field_index))

        actions.extend(
            Action(ActionType.USE_COMMAND, index)
            for index, card in enumerate(player.hand)
            if card.type == CardType.EVENT and _command_is_usable(state, index)
        )

        if _can_active_player_attack(state):
            actions.extend(
                Action(ActionType.ATTACK, index)
                for index, _ in _attackable_field_ai(player)
            )
            if state.config.monster_combat:
                from .engine import strike_values

                strike_opponent = state.opponent()
                for index, attacker_card in _attackable_field_ai(player):
                    for t_index in range(len(strike_opponent.field_ai)):
                        attack_value, defense_value = strike_values(
                            state, attacker_card, strike_opponent, t_index
                        )
                        if attack_value >= defense_value:
                            actions.append(Action(ActionType.STRIKE, index, t_index))

    actions.append(Action(ActionType.END_TURN))
    return actions


def _score_action(state: GameState, action: Action, weights: dict[str, int]) -> float:
    player = state.active()
    opponent = state.opponent()
    score = _board_score(player, opponent, weights)

    if action.type == ActionType.END_TURN:
        return score - 40 + (15 if state.actions_remaining <= 0 else -55)

    score += weights["tempo_action"]

    if action.type == ActionType.PLAY_AI and action.source_index is not None:
        card = player.hand[action.source_index]
        score += weights["play_ai"] + _card_value(card)
        if not player.field_ai:
            score += weights["empty_field_play"]
        if len(player.field_ai) >= state.config.field_ai_limit - 1:
            score -= 12
        return score

    if action.type == ActionType.UPGRADE_AI and action.source_index is not None and action.target_index is not None:
        target = player.hand[action.source_index]
        source = player.field_ai[action.target_index]
        return score + weights["upgrade"] + _card_value(target) - (_card_value(source) * 0.45)

    if action.type == ActionType.PLAY_MEMORY and action.source_index is not None:
        card = player.hand[action.source_index]
        replacement_penalty = 24 if player.memory is not None else 0
        return score + weights["memory"] + _memory_value(card) - replacement_penalty

    if action.type == ActionType.USE_MEMORY and action.target_index is not None:
        sacrificed = player.field_ai[action.target_index]
        enables = any(
            card.type == CardType.AI and _play_cost(card, state) <= min(state.config.actions_per_turn + 1, state.actions_remaining + 1)
            for card in player.hand
        )
        if not enables:
            return score - 130
        return score + 58 + (42 if enables else 0) - _card_value(sacrificed) * 0.55

    if action.type == ActionType.USE_COMMAND and action.source_index is not None:
        command = player.hand[action.source_index]
        return score + weights["command"] + _command_value(state, command)

    if action.type == ActionType.CHARGE and action.source_index is not None:
        fuel = player.hand[action.source_index]
        before = state.actions_remaining
        after = min(state.config.actions_per_turn + 1, before + 1)
        remaining = [card for index, card in enumerate(player.hand) if index != action.source_index]
        field_has_room = len(player.field_ai) < state.config.field_ai_limit
        enables_play = any(
            card.type == CardType.AI and before < _play_cost(card, state) <= after
            for card in remaining
        ) and field_has_room
        enables_two_step = (
            field_has_room
            and before == 2
            and any(
                card.type == CardType.AI and _play_cost(card, state) == 2
                for card in remaining
            )
            and len(remaining) >= 2
        )
        has_immediate_value = _charge_fuel_has_immediate_value(state, player, fuel, remaining)
        effect_value = _charge_effect_value(state, fuel)
        if not enables_play and not enables_two_step and not has_immediate_value:
            return score - 130
        return (
            score
            + weights["charge"]
            + (55 if enables_play else 0)
            + (28 if enables_two_step else 0)
            + effect_value
            - _card_value(fuel) * 0.42
        )

    if action.type == ActionType.ATTACK and action.source_index is not None:
        attacker = player.field_ai[action.source_index]
        return score + _attack_value(state, attacker, weights)

    if (
        action.type == ActionType.STRIKE
        and action.source_index is not None
        and action.target_index is not None
    ):
        from .engine import choose_strike_hand_defender, strike_values

        attacker = player.field_ai[action.source_index]
        target = opponent.field_ai[action.target_index]
        attack_value, defense_value = strike_values(state, attacker, opponent, action.target_index)
        if state.config.hand_defense_vs_strike != "off":
            hand_defense = choose_strike_hand_defender(
                state, attacker, opponent, action.target_index
            )
            if hand_defense is not None:
                blocker = opponent.hand[hand_defense]
                return score + weights["hand_trade_attack"] + _card_value(blocker) * 0.35
        trade = attack_value == defense_value
        value = weights["strike_base"] + weights["strike_target_power"] * (target.power or 0)
        if action.target_index not in opponent.spent_field_ai:
            value += weights["strike_ready_target"]
        if trade:
            value -= weights["strike_trade_penalty"] * (attacker.power or 0)
        elif (attacker.power or 0) >= 4:
            value -= weights["strike_power4_penalty"]
        return score + value

    return score


def _board_score(player: PlayerState, opponent: PlayerState, weights: dict[str, int]) -> float:
    ready = sum(1 for index, _ in enumerate(player.field_ai) if index not in player.spent_field_ai)
    opponent_ready = sum(1 for index, _ in enumerate(opponent.field_ai) if index not in opponent.spent_field_ai)
    return (
        (opponent.life - player.life) * -weights["low_life_pressure"]
        + sum(_card_value(card) for card in player.field_ai) * 0.35
        - sum(_card_value(card) for card in opponent.field_ai) * 0.22
        + len(player.field_ai) * weights["field_presence"]
        + len(player.hand) * weights["hand_card"]
        + ready * 18
        + opponent_ready * weights["opponent_ready"]
    )


def _attack_value(state: GameState, attacker, weights: dict[str, int]) -> float:
    opponent = state.opponent()
    if _has_crushing_field_defender(state, attacker, opponent):
        return CHALLENGER_SELF_DEFEAT_ATTACK_SCORE

    field_defense = choose_defender(
        attacker,
        opponent,
        advantage_bonus=state.config.defense_advantage_bonus,
        disadvantage_penalty=state.config.defense_disadvantage_penalty,
        same_attribute_strict=state.config.same_attribute_strict_defense,
        exhausted_ai_can_defend=state.config.exhausted_ai_can_defend,
        power_2_defense_bonus=state.config.power_2_defense_bonus,
        power_3_cannot_field_defend=state.config.power_3_cannot_field_defend,
        power_3_defense_modifier=state.config.power_3_defense_modifier,
    )
    hand_defense = _available_hand_defender(state, attacker, opponent)
    if pierces_hand_defense(attacker):
        hand_defense = None
    elif field_defense is not None:
        field_card = opponent.field_ai[field_defense]
        if can_defend(
            attacker,
            field_card,
            advantage_bonus=state.config.defense_advantage_bonus,
            disadvantage_penalty=state.config.defense_disadvantage_penalty,
            same_attribute_strict=state.config.same_attribute_strict_defense,
            defense_power_bonus=_defense_power_bonus(
                field_card,
                state.config.power_2_defense_bonus,
                opponent,
                attacker,
                field_index=field_defense,
                power_3_defense_modifier=state.config.power_3_defense_modifier,
            ),
        ):
            hand_defense = None
        elif hand_defense is not None:
            field_defense = None

    value = weights["attack_power"] * (attack_combat_value(attacker) or 0)
    if field_defense is None and hand_defense is None:
        value += weights["damage"]
        if opponent.life <= _expected_attack_damage(state, attacker):
            value += weights["lethal"]
        if blocks_low_life_hand_defense(attacker) and opponent.life <= 2:
            value += 70
        return value

    if hand_defense is not None:
        defender = opponent.hand[hand_defense]
        value += weights["hand_trade_attack"] + _card_value(defender) * 0.35
        if pierces_hand_defense(attacker):
            value += weights["damage"]
        return value

    defender = opponent.field_ai[field_defense]
    defense_value = defense_combat_value(
        attacker,
        defender,
        advantage_bonus=state.config.defense_advantage_bonus,
        disadvantage_penalty=state.config.defense_disadvantage_penalty,
        defense_power_bonus=_defense_power_bonus(
            defender,
            state.config.power_2_defense_bonus,
            opponent,
            attacker,
            field_index=field_defense,
            power_3_defense_modifier=state.config.power_3_defense_modifier,
        ),
    )
    attack_value = attack_combat_value(attacker)
    if defense_value < attack_value:
        value += weights["damage"] + _card_value(defender) * 0.2
        if opponent.life <= _expected_attack_damage(state, attacker):
            value += weights["lethal"]
        if draws_on_successful_defense(defender):
            value -= 20
        if recovers_ai_on_successful_defense(defender):
            value -= 28
        if opponent.memory is not None and opponent.memory.effect == MemoryEffect.TIDAL_MIRROR.value:
            value -= 20
        return value
    if defense_value == attack_value:
        value += weights["trade_attack"] + _card_value(defender) * 0.35
    else:
        value += weights["bad_attack"]
    if pressures_on_block(attacker):
        value += weights["blocked_value"]
    if draws_on_blocked_attack(attacker):
        value += 32
    if keeps_ready_after_attack(attacker):
        value += 36
    return value


def _has_crushing_field_defender(state: GameState, attacker, defender: PlayerState) -> bool:
    attack_value = attack_combat_value(attacker)
    for index, card in enumerate(defender.field_ai):
        if not state.config.exhausted_ai_can_defend and index in defender.spent_field_ai:
            continue
        if state.config.power_3_cannot_field_defend and card.power == 3:
            continue
        defense_value = defense_combat_value(
            attacker,
            card,
            advantage_bonus=state.config.defense_advantage_bonus,
            disadvantage_penalty=state.config.defense_disadvantage_penalty,
            defense_power_bonus=_defense_power_bonus(
                card,
                state.config.power_2_defense_bonus,
                defender,
                attacker,
                field_index=index,
                power_3_defense_modifier=state.config.power_3_defense_modifier,
            ),
        )
        if defense_value > attack_value:
            return True
    return False


def _available_hand_defender(state: GameState, attacker, defender: PlayerState) -> int | None:
    if state.config.hand_defense_requires_empty_field and defender.field_ai:
        return None
    if state.config.hand_defense_limit_per_turn is not None:
        if state.config.hand_defense_limit_per_turn <= 0:
            return None
        if defender.hand_defenses_used_this_turn >= state.config.hand_defense_limit_per_turn:
            return None
    return choose_hand_defender(
        attacker,
        defender,
        advantage_bonus=state.config.defense_advantage_bonus,
        disadvantage_penalty=state.config.defense_disadvantage_penalty,
        same_attribute_strict=state.config.same_attribute_strict_defense,
        power_2_defense_bonus=state.config.power_2_defense_bonus,
        power_3_cannot_hand_defend=state.config.power_3_cannot_hand_defend,
        power_3_defense_modifier=state.config.power_3_defense_modifier,
    )


def _card_value(card) -> int:
    if card.type == CardType.AI:
        value = (card.power or 0) * 20
        effect_bonus = {
            "attack_plus_1": 18,
            "reckless_attack_plus_1": 8,
            "draw_after_overheat": 10,
            "draw_after_overheat_opponent_draw": 0,
            "draw_two_after_overheat": 18,
            "draw_two_after_overheat_opponent_draw": 8,
            "draw_on_play": 20,
            "draw_on_play_cannot_hand_defend": 15,
            "filter_on_play": 24,
            "no_spend_after_attack": 34,
            "spend_enemy_on_play": 32,
            "spend_enemy_on_play_enters_spent": 18,
            "defense_plus_1": 18,
            "defense_plus_1_enters_spent": 8,
            "recover_ai_on_play": 22,
            "block_pressure": 15,
            "hand_defense_pierce": 24,
            "low_life_no_hand_defense": 26,
            "low_life_no_hand_defense_self_damage": 16,
            "draw_on_blocked_attack": 18,
            "draw_on_blocked_attack_cannot_hand_defend": 10,
            "ready_ally_on_play": 24,
            "ready_ally_on_play_draw": 34,
            "return_after_overheat": 12,
            "return_after_overheat_cannot_hand_defend": 4,
            "draw_on_successful_defense": 14,
            "draw_on_successful_defense_enters_spent": 6,
            "charge_pressure": 16,
            "charge_draw": 18,
            "charge_ready_ally": 18,
            "charge_guard": 16,
            "charge_pressure_plus": 18,
            "charge_surge_draw": 20,
            "charge_spend_enemy": 20,
            "charge_recover_discard": 18,
            "trash_enemy_memory_on_play": 14,
            "draw_on_play_if_discard_4": 16,
            "charge_draw_if_discard_ai": 16,
            "recover_ai_on_successful_defense": 18,
            "discard_commands_attack_plus_1": 14,
            "draw_on_play_defense_draw": 26,
            "ready_ally_on_play_enters_spent": 14,
            "defense_plus_1_with_memory": 12,
            "blocked_attack_draw": 18,
            "charge_spend_enemy_ready_ally": 24,
            "charge_recover_discard_any": 20,
            "charge_filter_draw": 20,
            "charge_pressure_any": 20,
            "return_after_overheat_opponent_draw_on_play": 14,
            "discard_ai_attack_plus_1": 18,
            "charge_spend_all_enemies": 26,
            "recover_memory_on_play_defense_plus_1": 20,
        }
        value += effect_bonus.get(card.effect, 0)
        if draws_on_play(card):
            value += 8
        if filters_on_play(card):
            value += 10
        if opponent_draws_on_play(card):
            value -= 12
        if draws_on_successful_defense(card):
            value += 8
        return value
    if card.type == CardType.MEMORY:
        return _memory_value(card)
    return 12


def _memory_value(card) -> int:
    priority = {
        MemoryEffect.CACHE.value: 48,
        MemoryEffect.RESONATOR.value: 45,
        MemoryEffect.RECOVERY_CACHE.value: 42,
        MemoryEffect.ECHO_URN.value: 42,
        MemoryEffect.TIDAL_MIRROR.value: 40,
        MemoryEffect.WAR_BANNER.value: 40,
        MemoryEffect.PIPELINE.value: 38,
        MemoryEffect.STORM_CORE.value: 38,
        MemoryEffect.DUAL_BANNER.value: 36,
        MemoryEffect.ACCELERATOR.value: 36,
        MemoryEffect.GROVE_REST.value: 34,
        MemoryEffect.FIREWALL.value: 30,
    }
    return priority.get(card.effect, 12)


def _command_value(state: GameState, command) -> int:
    player = state.active()
    opponent = state.opponent()
    if command.effect == CommandEffect.TRINITY.value:
        return 165 if opponent.life <= 1 else 92
    if command.effect == CommandEffect.FIRE_RITE.value:
        return 110 if not opponent.hand else 58
    if command.effect == CommandEffect.WIND_RITE.value:
        return 74 + (22 if _highest_power_ready_ai(opponent) is not None else 0)
    if command.effect == CommandEffect.WATER_RITE.value:
        return 68 if player.deck else 0
    if command.effect == CommandEffect.EARTH_RITE.value:
        return 62
    if command.effect == CommandEffect.COMEBACK_RITE.value:
        ready_bonus = 40 if player.spent_field_ai else 0
        draw_bonus = 48 if player.deck else 0
        return 48 + ready_bonus + draw_bonus
    if command.effect == CommandEffect.PURGE.value:
        powers = [
            (opponent.field_ai[i].power or 0)
            for i in opponent.spent_field_ai
            if i < len(opponent.field_ai)
        ]
        return (
            CHALLENGER_WEIGHTS["purge_base"]
            + CHALLENGER_WEIGHTS["purge_target_power"] * max(powers)
            if powers
            else 0
        )
    if command.effect == CommandEffect.DISRUPT.value:
        return 70 + max((card.power or 0) * 9 for index, card in enumerate(opponent.field_ai) if index not in opponent.spent_field_ai)
    if command.effect == CommandEffect.SANDBOX.value:
        return 84
    if command.effect == CommandEffect.RELEARN.value:
        return 45
    if command.effect == CommandEffect.OPTIMIZE.value:
        return 36 + max(0, 4 - len(player.hand)) * 4
    if command.effect == CommandEffect.PATCH.value:
        return 52 + (8 if player.deck else 0)
    if command.effect == CommandEffect.WAR_CRY.value:
        return 40 if _can_active_player_attack(state) else 0
    if command.effect == CommandEffect.TIDE_EDGE.value:
        return 42 if _can_active_player_attack(state) else 0
    if command.effect == CommandEffect.PIERCE_SIGHT.value:
        return 38 if _can_active_player_attack(state) and opponent.hand else 0
    if command.effect == CommandEffect.GRAVE_CALL.value:
        return 58
    if command.effect == CommandEffect.SALVAGE.value:
        return 40
    if command.effect == CommandEffect.OVERDRIVE.value:
        return 64
    if command.effect == CommandEffect.RELIC_CRUSH.value:
        return 66 if opponent.memory is not None else 34
    if command.effect == CommandEffect.DEEP_CURRENT.value:
        return 70
    return 0


def _charge_effect_value(state: GameState, fuel) -> int:
    player = state.active()
    opponent = state.opponent()
    if fuel.effect == "charge_pressure":
        return 50 if len(opponent.hand) >= 3 else 8
    if fuel.effect == "charge_draw":
        return 42 if player.deck else 0
    if fuel.effect == "charge_ready_ally":
        return 62 if _highest_power_spent_ai(player) is not None else 8
    if fuel.effect == "charge_guard":
        return 38 if player.field_ai else 6
    if fuel.effect == "charge_pressure_plus":
        return 48 if len(opponent.hand) >= 2 else 8
    if fuel.effect == "charge_surge_draw":
        return 56 if len(player.hand) <= 3 and player.deck else 6
    if fuel.effect == "charge_spend_enemy":
        return 58 if _highest_power_ready_ai(opponent) is not None else 8
    if fuel.effect == "charge_recover_discard":
        return (
            50
            if len(player.hand) <= 3 and any(item.type == CardType.AI for item in player.discard)
            else 6
        )
    if fuel.effect == "charge_draw_if_discard_ai":
        return (
            44
            if any(item.type == CardType.AI for item in player.discard) and player.deck
            else 6
        )
    if fuel.effect == "charge_filter_draw":
        return 48 if player.deck else 6
    if fuel.effect == "charge_pressure_any":
        return 46 if len(opponent.hand) >= 1 else 8
    if fuel.effect == "charge_spend_all_enemies":
        ready_count = sum(
            1
            for index, _ in enumerate(opponent.field_ai)
            if index not in opponent.spent_field_ai
        )
        return 70 if ready_count >= 2 else 40 if ready_count == 1 else 8
    if fuel.effect == "charge_spend_enemy_ready_ally":
        can_spend = _highest_power_ready_ai(opponent) is not None
        can_ready = _highest_power_spent_ai(player) is not None
        if can_spend and can_ready:
            return 72
        if can_spend:
            return 58
        if can_ready:
            return 62
        return 8
    if fuel.effect == "charge_recover_discard_any":
        return 52 if any(item.type == CardType.AI for item in player.discard) else 6
    if player.memory is not None and player.memory.effect == "resonator" and len(player.hand) <= 2:
        return 24
    return 0


def _action_tie_break(action: Action) -> tuple[int, int, int, int]:
    priority = {
        ActionType.ATTACK: 7,
        ActionType.USE_COMMAND: 6,
        ActionType.UPGRADE_AI: 5,
        ActionType.PLAY_AI: 4,
        ActionType.CHARGE: 3,
        ActionType.USE_MEMORY: 2,
        ActionType.PLAY_MEMORY: 1,
        ActionType.END_TURN: 0,
    }
    return (
        priority.get(action.type, 0),
        -1 if action.source_index is None else -action.source_index,
        -1 if action.target_index is None else -action.target_index,
        -1 if action.secondary_target_index is None else -action.secondary_target_index,
    )


def _weakest_ai_in_hand(player: PlayerState, state: GameState) -> int | None:
    candidates = [
        (index, card)
        for index, card in enumerate(player.hand)
        if card.type == CardType.AI and _play_cost(card, state) <= state.actions_remaining
    ]
    if not candidates:
        return None
    return min(candidates, key=lambda item: (item[1].power or 0, item[1].id))[0]


def _lowest_memory_in_hand(player: PlayerState) -> int | None:
    candidates = [
        (index, card)
        for index, card in enumerate(player.hand)
        if card.type == CardType.MEMORY
    ]
    if not candidates:
        return None
    return min(candidates, key=lambda item: (_memory_value(item[1]), item[1].id))[0]


def _lowest_power_field_ai(player: PlayerState) -> int | None:
    candidates = _attackable_field_ai(player)
    if not candidates:
        return None
    return min(candidates, key=lambda item: (item[1].power or 0, item[1].id))[0]


def _highest_power_spent_ai(player: PlayerState) -> int | None:
    candidates = [
        (index, player.field_ai[index])
        for index in player.spent_field_ai
        if 0 <= index < len(player.field_ai)
    ]
    if not candidates:
        return None
    return max(candidates, key=lambda item: (item[1].power or 0, item[1].id))[0]


def _highest_power_ready_ai(player: PlayerState) -> int | None:
    candidates = _attackable_field_ai(player)
    if not candidates:
        return None
    return max(candidates, key=lambda item: (item[1].power or 0, item[1].id))[0]


def _highest_power_field_ai(player: PlayerState) -> int:
    return max(
        _attackable_field_ai(player),
        key=lambda item: (item[1].power or 0, item[1].id),
    )[0]


def _attackable_field_ai(player: PlayerState) -> list[tuple[int, object]]:
    return [
        (index, card)
        for index, card in enumerate(player.field_ai)
        if index not in player.spent_field_ai
    ]


def _lowest_priority_hand_card(player: PlayerState) -> int:
    return min(
        enumerate(player.hand),
        key=lambda item: (_card_priority(item[1]), item[1].id),
    )[0]


def _best_command_in_hand(state: GameState) -> int | None:
    candidates = [
        (index, card)
        for index, card in enumerate(state.active().hand)
        if card.type == CardType.EVENT and _command_is_usable(state, index)
    ]
    if not candidates:
        return None
    priority = {
        CommandEffect.TRINITY.value: 5,
        CommandEffect.FIRE_RITE.value: 4,
        CommandEffect.WATER_RITE.value: 4,
        CommandEffect.WIND_RITE.value: 4,
        CommandEffect.EARTH_RITE.value: 4,
        CommandEffect.COMEBACK_RITE.value: 4,
        CommandEffect.DISRUPT.value: 4,
        CommandEffect.PURGE.value: 5,
        CommandEffect.PATCH.value: 3,
        CommandEffect.RELEARN.value: 2,
        CommandEffect.SANDBOX.value: 2,
        CommandEffect.OPTIMIZE.value: 1,
        CommandEffect.GRAVE_CALL.value: 4,
        CommandEffect.DEEP_CURRENT.value: 4,
        CommandEffect.OVERDRIVE.value: 3,
        CommandEffect.RELIC_CRUSH.value: 3,
        CommandEffect.WAR_CRY.value: 3,
        CommandEffect.TIDE_EDGE.value: 3,
        CommandEffect.PIERCE_SIGHT.value: 2,
        CommandEffect.SALVAGE.value: 2,
    }
    return max(candidates, key=lambda item: (priority.get(item[1].effect, 0), item[1].id))[0]


def _command_is_usable(state: GameState, source_index: int) -> bool:
    player = state.active()
    opponent = state.opponent()
    card = player.hand[source_index]
    if card.effect == CommandEffect.OPTIMIZE.value:
        return True
    if card.effect == CommandEffect.PATCH.value:
        return True
    if card.effect == CommandEffect.DISRUPT.value:
        return any(index not in opponent.spent_field_ai for index, _ in enumerate(opponent.field_ai))
    if card.effect == CommandEffect.PURGE.value:
        return any(index < len(opponent.field_ai) for index in opponent.spent_field_ai)
    if card.effect == CommandEffect.RELEARN.value:
        return any(item.type == CardType.AI for item in player.discard)
    if card.effect == CommandEffect.SANDBOX.value:
        return _sandbox_command_ready(state)
    if card.effect == CommandEffect.TRINITY.value:
        return len(player.field_ai) >= state.config.field_ai_limit
    if card.effect == CommandEffect.FIRE_RITE.value:
        return _has_attribute_ai(player, Attribute.FIRE)
    if card.effect == CommandEffect.WATER_RITE.value:
        return _has_attribute_ai(player, Attribute.WATER) and bool(player.deck)
    if card.effect == CommandEffect.WIND_RITE.value:
        return _has_attribute_ai(player, Attribute.WIND) and (
            any(index not in opponent.spent_field_ai for index, _ in enumerate(opponent.field_ai))
            or _has_spent_attribute_ai(player, Attribute.WIND)
        )
    if card.effect == CommandEffect.EARTH_RITE.value:
        return _has_attribute_ai(player, Attribute.EARTH) and any(
            item.type == CardType.AI for item in player.discard
        )
    if card.effect == CommandEffect.COMEBACK_RITE.value:
        return player.life < opponent.life
    if card.effect == CommandEffect.WAR_CRY.value:
        return _highest_power_ready_ai(player) is not None
    if card.effect == CommandEffect.TIDE_EDGE.value:
        return _has_attribute_ai(player, Attribute.WATER) and bool(player.field_ai)
    if card.effect == CommandEffect.PIERCE_SIGHT.value:
        return _highest_power_ready_ai(player) is not None
    if card.effect == CommandEffect.GRAVE_CALL.value:
        return len(player.field_ai) < state.config.field_ai_limit and any(
            item.type == CardType.AI and (item.power or 0) <= 2 for item in player.discard
        )
    if card.effect == CommandEffect.SALVAGE.value:
        return any(
            item.type == CardType.EVENT and item.effect != CommandEffect.SALVAGE.value
            for item in player.discard
        )
    if card.effect == CommandEffect.OVERDRIVE.value:
        return bool(player.pending_effects.get("charge_used")) and bool(player.deck)
    if card.effect == CommandEffect.RELIC_CRUSH.value:
        return opponent.memory is not None
    if card.effect == CommandEffect.DEEP_CURRENT.value:
        water_count = sum(
            1 for item in player.field_ai if has_attribute(item, Attribute.WATER)
        )
        return water_count >= 2 and bool(player.deck)
    return False


def _best_sandbox_command(state: GameState) -> int | None:
    if not _sandbox_command_ready(state):
        return None
    for index, card in enumerate(state.active().hand):
        if card.type == CardType.EVENT and card.effect == CommandEffect.SANDBOX.value:
            return index
    return None


def _sandbox_command_ready(state: GameState) -> bool:
    player = state.active()
    if state.actions_remaining < 2:
        return False
    if player.pending_effects.get("sandbox_shield"):
        return False
    return any(
        card.power == 4 and index not in player.spent_field_ai
        for index, card in enumerate(player.field_ai)
    )


def _has_attribute_ai(player: PlayerState, attribute: Attribute) -> bool:
    return any(has_attribute(card, attribute) for card in player.field_ai)


def _has_spent_attribute_ai(player: PlayerState, attribute: Attribute) -> bool:
    return any(
        0 <= index < len(player.field_ai)
        and has_attribute(player.field_ai[index], attribute)
        for index in player.spent_field_ai
    )


def _can_use_accelerator_memory(state: GameState) -> bool:
    player = state.active()
    return (
        player.memory is not None
        and player.memory.effect == MemoryEffect.ACCELERATOR.value
        and not player.pending_effects.get("accelerator_used")
        and bool(player.field_ai)
        and state.actions_remaining > 0
        and state.actions_remaining < state.config.actions_per_turn + 1
    )


def can_use_charge(state: GameState) -> bool:
    player = state.active()
    return (
        not player.pending_effects.get("charge_used")
        and any(_can_charge_card(card) for card in player.hand)
        and state.actions_remaining < state.config.actions_per_turn + 1
    )


def _best_charge_fuel(state: GameState) -> int | None:
    if not can_use_charge(state):
        return None
    if _can_active_player_attack(state) and _attackable_field_ai(state.active()):
        return None
    player = state.active()
    before = state.actions_remaining
    after = min(state.config.actions_per_turn + 1, before + 1)
    field_has_room = len(player.field_ai) < state.config.field_ai_limit
    candidates = sorted(
        (
            (index, card)
            for index, card in enumerate(player.hand)
            if _can_charge_card(card)
        ),
        key=lambda item: (_card_priority(item[1]), item[1].id),
    )
    for fuel_index, _ in candidates:
        remaining = [card for index, card in enumerate(player.hand) if index != fuel_index]
        enables_large_play = any(
            card.type == CardType.AI and before < _play_cost(card, state) <= after
            for card in remaining
        ) and field_has_room
        enables_two_step_turn = (
            field_has_room
            and
            before == 2
            and any(
                card.type == CardType.AI and _play_cost(card, state) == 2
                for card in remaining
            )
            and len(remaining) >= 2
        )
        if (
            enables_large_play
            or enables_two_step_turn
            or _charge_fuel_has_immediate_value(state, player, player.hand[fuel_index], remaining)
        ):
            return fuel_index
    return None


def _charge_fuel_has_immediate_value(
    state: GameState,
    player,
    card,
    remaining_hand,
) -> bool:
    opponent = state.opponent()
    if card.effect == "charge_pressure":
        return len(opponent.hand) >= 3
    if card.effect == "charge_draw":
        return bool(player.deck)
    if card.effect == "charge_ready_ally":
        return bool(player.spent_field_ai)
    if card.effect == "charge_guard":
        return bool(player.field_ai)
    if card.effect == "charge_pressure_plus":
        return len(opponent.hand) >= 2
    if card.effect == "charge_surge_draw":
        return len(remaining_hand) <= 2 and bool(player.deck)
    if card.effect == "charge_spend_enemy":
        return _highest_power_ready_ai(opponent) is not None
    if card.effect == "charge_recover_discard":
        return len(remaining_hand) <= 2 and any(item.type == CardType.AI for item in player.discard)
    if card.effect == "charge_draw_if_discard_ai":
        return any(item.type == CardType.AI for item in player.discard) and bool(player.deck)
    if card.effect == "charge_filter_draw":
        return bool(player.deck)
    if card.effect == "charge_pressure_any":
        return len(opponent.hand) >= 1
    if card.effect == "charge_spend_all_enemies":
        return _highest_power_ready_ai(opponent) is not None
    if card.effect == "charge_spend_enemy_ready_ally":
        return _highest_power_ready_ai(opponent) is not None or bool(player.spent_field_ai)
    if card.effect == "charge_recover_discard_any":
        return any(item.type == CardType.AI for item in player.discard)
    if player.memory is not None and player.memory.effect == "resonator":
        return len(remaining_hand) <= 2 and bool(player.deck)
    return False


def _can_charge_card(card) -> bool:
    return True


def _accelerator_sacrifice_target(player: PlayerState) -> int | None:
    if not player.field_ai:
        return None
    return min(
        enumerate(player.field_ai),
        key=lambda item: (_card_priority(item[1]), item[1].id),
    )[0]


def _play_cost(card, state: GameState) -> int:
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


def _upgrade_cost(source, target, state: GameState) -> int:
    _ = state
    return max(1, int(target.power or 1) - int(source.power or 0))


def _defense_power_bonus(
    card,
    power_2_defense_bonus: int,
    defender: PlayerState | None = None,
    attack_ai=None,
    field_index: int | None = None,
    power_3_defense_modifier: int = 0,
    attack_power_bonus: int = 0,
) -> int:
    bonus = 0
    if card.power == 3:
        bonus += power_3_defense_modifier
    if (
        defender is not None
        and card.effect == AiEffect.DEFENSE_PLUS_1_WITH_MEMORY.value
        and defender.memory is not None
    ):
        bonus += 2
    if (
        defender is not None
        and attack_ai is not None
        and defender.memory is not None
        and defender.memory.effect == MemoryEffect.FIREWALL.value
        and bool(defender.hand)
        and card.type == CardType.AI
        and not shares_attribute(card, attack_ai)
        and _firewall_should_pay(card, defender, attack_ai, attack_power_bonus=attack_power_bonus)
    ):
        bonus += 1
    if defender is not None and field_index is not None and field_index in defender.charge_guarded_field_ai:
        bonus += 1
    return bonus


def _firewall_should_pay(
    card,
    defender: PlayerState,
    attack_ai,
    attack_power_bonus: int = 0,
) -> bool:
    if (
        defender.memory is None
        or defender.memory.effect != MemoryEffect.FIREWALL.value
        or shares_attribute(card, attack_ai)
        or not defender.hand
    ):
        return False
    attack_value = attack_combat_value(attack_ai, attack_power_bonus=attack_power_bonus)
    base_value = defense_combat_value(attack_ai, card, defense_power_bonus=0)
    paid_value = base_value + 1
    return base_value < attack_value or (base_value == attack_value and paid_value > attack_value)


def _card_priority(card) -> int:
    if card.type == CardType.AI:
        return card.power or 0
    return 1


def _can_upgrade(source, target) -> bool:
    if source.type != CardType.AI or target.type != CardType.AI:
        return False
    if not shares_attribute(source, target):
        return False
    if source.power is None or target.power is None:
        return False
    return source.power < target.power


def _can_upgrade_with_config(state: GameState, source, target) -> bool:
    if not _can_upgrade(source, target):
        return False
    if state.config.exact_upgrade_step:
        return target.power == source.power + 1
    return True

def _expected_attack_damage(state: GameState, attacker) -> int:
    if not state.config.power_scaled_damage:
        return 1
    return int(attacker.power or 1)


def _best_classic_strike(state: GameState, player: PlayerState, opponent: PlayerState):
    from .engine import strike_values

    best = None
    for a_index, attacker in _attackable_field_ai(player):
        for t_index, target in enumerate(opponent.field_ai):
            attack_value, defense_value = strike_values(state, attacker, opponent, t_index)
            if attack_value < defense_value:
                continue
            trade = attack_value == defense_value
            a_power = attacker.power or 0
            t_power = target.power or 0
            if trade:
                if t_power <= a_power:
                    continue
                key = (0, t_power - a_power, t_power, -a_power)
            else:
                if t_power < a_power:
                    continue
                key = (1, t_power - a_power, t_power, -a_power)
            if best is None or key > best[0]:
                best = (key, a_index, t_index)
    if best is None:
        return None
    return best[1], best[2]
