from __future__ import annotations

from .cards import (
    CardType,
    CommandEffect,
    MemoryEffect,
    blocks_low_life_hand_defense,
    cannot_hand_defend,
    can_defend,
)
from .models import Action, ActionType, GameState, PlayerState


def choose_action(state: GameState) -> Action:
    player = state.active()
    opponent = state.opponent()

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
        )
        if damaging_attack is not None:
            return Action(ActionType.ATTACK, damaging_attack)

    if len(player.field_ai) < state.config.field_ai_limit:
        index = _best_ai_in_hand(player, state)
        if index is not None:
            return Action(ActionType.PLAY_AI, index)

    upgrade = _best_upgrade(player, state)
    if upgrade is not None:
        return Action(ActionType.UPGRADE_AI, upgrade[0], upgrade[1])

    memory_index = _best_memory_in_hand(player)
    if memory_index is not None:
        return Action(ActionType.PLAY_MEMORY, memory_index)

    command_index = _best_command_in_hand(state)
    if command_index is not None:
        return Action(ActionType.USE_COMMAND, command_index)

    if _attackable_field_ai(player) and _can_active_player_attack(state):
        return Action(ActionType.ATTACK, _highest_power_field_ai(player))

    if player.hand:
        return Action(ActionType.CYCLE, _lowest_priority_hand_card(player))

    return Action(ActionType.END_TURN)


def _can_active_player_attack(state: GameState) -> bool:
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
) -> int | None:
    successful = [
        (index, card)
        for index, card in enumerate(defender.field_ai)
        if (exhausted_ai_can_defend or index not in defender.spent_field_ai)
        and can_defend(
            attack_ai,
            card,
            advantage_bonus=advantage_bonus,
            disadvantage_penalty=disadvantage_penalty,
            same_attribute_strict=same_attribute_strict,
            defense_power_bonus=_defense_power_bonus(
                card,
                power_2_defense_bonus,
                defender,
                attack_ai,
            ),
        )
    ]
    if not successful:
        return None
    return min(successful, key=lambda item: (item[1].power or 0, item[1].id))[0]


def choose_hand_defender(
    attack_ai,
    defender: PlayerState,
    *,
    advantage_bonus: int = 1,
    disadvantage_penalty: int = 1,
    same_attribute_strict: bool = False,
    power_2_defense_bonus: int = 0,
) -> int | None:
    if blocks_low_life_hand_defense(attack_ai) and defender.life <= 2:
        return None
    successful = [
        (index, card)
        for index, card in enumerate(defender.hand)
        if card.type == CardType.AI
        and not cannot_hand_defend(card)
        and can_defend(
            attack_ai,
            card,
            advantage_bonus=advantage_bonus,
            disadvantage_penalty=disadvantage_penalty,
            same_attribute_strict=same_attribute_strict,
            defense_power_bonus=_defense_power_bonus(card, power_2_defense_bonus),
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
        MemoryEffect.PIPELINE.value: 3,
        MemoryEffect.FIREWALL.value: 2,
    }
    return max(candidates, key=lambda item: (priority.get(item[1].effect, 0), item[1].id))[0]


def _best_upgrade(player: PlayerState, state: GameState) -> tuple[int, int] | None:
    candidates = []
    for hand_index, target in enumerate(player.hand):
        if target.type != CardType.AI or _upgrade_cost(target, state) > state.actions_remaining:
            continue
        for field_index, source in enumerate(player.field_ai):
            if _can_upgrade(source, target):
                candidates.append((hand_index, field_index, target, source))
    if not candidates:
        return None
    hand_index, field_index, _, _ = max(
        candidates,
        key=lambda item: (
            item[2].power or 0,
            -1 * (item[3].power or 0),
            item[2].id,
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
) -> int | None:
    candidates = []
    for index, card in enumerate(player.field_ai):
        if index in player.spent_field_ai:
            continue
        if (
            choose_defender(
                card,
                opponent,
                advantage_bonus=advantage_bonus,
                disadvantage_penalty=disadvantage_penalty,
                same_attribute_strict=same_attribute_strict,
                exhausted_ai_can_defend=exhausted_ai_can_defend,
                power_2_defense_bonus=power_2_defense_bonus,
            )
            is None
        ):
            candidates.append((index, card))
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
        CommandEffect.DISRUPT.value: 4,
        CommandEffect.PATCH.value: 3,
        CommandEffect.RELEARN.value: 2,
        CommandEffect.SANDBOX.value: 2,
        CommandEffect.OPTIMIZE.value: 1,
    }
    return max(candidates, key=lambda item: (priority.get(item[1].effect, 0), item[1].id))[0]


def _command_is_usable(state: GameState, source_index: int) -> bool:
    player = state.active()
    opponent = state.opponent()
    card = player.hand[source_index]
    if card.effect == CommandEffect.OPTIMIZE.value:
        return len(player.hand) > 1
    if card.effect == CommandEffect.PATCH.value:
        return bool(player.spent_field_ai)
    if card.effect == CommandEffect.DISRUPT.value:
        return any(index not in opponent.spent_field_ai for index, _ in enumerate(opponent.field_ai))
    if card.effect == CommandEffect.RELEARN.value:
        return any(item.type == CardType.AI for item in player.discard)
    if card.effect == CommandEffect.SANDBOX.value:
        return _sandbox_command_ready(state)
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


def _play_cost(card, state: GameState) -> int:
    if card.type == CardType.AI and (card.power or 0) >= 3:
        return state.config.large_ai_play_cost
    return 1


def _upgrade_cost(card, state: GameState) -> int:
    return max(1, _play_cost(card, state) - 1)


def _defense_power_bonus(
    card,
    power_2_defense_bonus: int,
    defender: PlayerState | None = None,
    attack_ai=None,
) -> int:
    bonus = 0
    if (
        defender is not None
        and attack_ai is not None
        and defender.memory is not None
        and defender.memory.effect == MemoryEffect.FIREWALL.value
        and bool(defender.hand)
        and card.type == CardType.AI
        and card.attribute == attack_ai.attribute
    ):
        bonus += 1
    return bonus


def _card_priority(card) -> int:
    if card.type == CardType.AI:
        return card.power or 0
    return 1


def _can_upgrade(source, target) -> bool:
    if source.type != CardType.AI or target.type != CardType.AI:
        return False
    if source.attribute != target.attribute:
        return False
    if source.power is None or target.power is None:
        return False
    return source.power < target.power
