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
    card_attributes,
    conditional_attack_bonus,
    defense_combat_value,
    draws_after_overheat,
    draws_on_blocked_attack,
    draws_on_play,
    draws_on_successful_defense,
    draws_two_after_overheat,
    enters_spent_on_play,
    filters_on_play,
    has_attribute,
    keeps_ready_after_attack,
    opponent_draws_on_play,
    pierces_hand_defense,
    pressures_on_block,
    readies_ally_on_play,
    recovers_ai_on_play,
    recovers_ai_on_successful_defense,
    recovers_memory_on_play,
    returns_after_overheat,
    self_damages_on_play,
    shares_attribute,
    spends_enemy_on_play,
    trashes_enemy_memory_on_play,
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
        player.pending_effects["echo_urn_used"] = False
    _ready_active_field_ai_for_turn(state)
    state.active().pending_effects["pipeline_used"] = False
    state.active().pending_effects["accelerator_used"] = False
    state.active().pending_effects["war_banner_used"] = False
    state.active().pending_effects["charge_used"] = False
    state.active().charge_guarded_field_ai.clear()
    state.active().pending_effects.pop("sandbox_shield", None)
    reset_turn_attack_buffs(state.active())
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
    grove_readied_ai = _apply_end_turn_grove_rest(state)
    state.active().pending_effects.pop("sandbox_shield", None)
    reset_turn_attack_buffs(state.active())
    state.log.append(
        {
            "turn": state.turn,
            "active_player": state.active().name,
            "event": "turn_end",
            "hand_limit_discarded": [card.id for card in discarded_for_limit],
            "grove_readied_ai": grove_readied_ai,
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


def add_turn_field_attack_bonus(player: PlayerState, field_index: int, amount: int) -> None:
    """ターン限定攻撃バフ: 場の召喚獣1体の戦闘時攻撃値を +amount する（このターンのみ）。"""
    player.turn_field_attack_bonuses[field_index] = (
        player.turn_field_attack_bonuses.get(field_index, 0) + amount
    )


def add_turn_global_attack_bonus(player: PlayerState, amount: int) -> None:
    """ターン限定攻撃バフ: 自分の召喚獣すべての戦闘時攻撃値を +amount する（このターンのみ）。"""
    player.turn_global_attack_bonus += amount


def set_next_attack_unblockable(player: PlayerState, value: bool = True) -> None:
    """ターン限定バフ: このターンの自分の次の攻撃は手札防御されない。"""
    player.next_attack_unblockable = value


def reset_turn_attack_buffs(player: PlayerState) -> None:
    """ターン限定攻撃バフをすべてリセットする（ターン終了時処理）。"""
    player.turn_field_attack_bonuses.clear()
    player.turn_global_attack_bonus = 0
    player.next_attack_unblockable = False


def turn_attack_bonus(player: PlayerState | None, field_index: int | None = None) -> int:
    """攻撃側プレイヤーのターン限定攻撃ボーナス合計（全体バフ + 対象バフ）。"""
    if player is None:
        return 0
    bonus = player.turn_global_attack_bonus
    if field_index is not None:
        bonus += player.turn_field_attack_bonuses.get(field_index, 0)
    return bonus


def has_charged_this_turn(player: PlayerState) -> bool:
    """チャージ済み参照: このターン、そのプレイヤーがチャージしたか。

    charge_used は自分のターン開始時にリセットされるため、ターンプレイヤー自身の判定に使うこと。
    """
    return bool(player.pending_effects.get("charge_used"))


def revive_ai_from_discard(state: GameState, player: PlayerState, discard_index: int):
    """蘇生: 自分のトラッシュの召喚獣1枚を消耗状態で場に出す。

    場が上限（field_ai_limit）なら何もしない。登場時効果は発動しない（呼び出し側で必要なら処理する）。
    """
    if len(player.field_ai) >= state.config.field_ai_limit:
        return None
    if discard_index < 0 or discard_index >= len(player.discard):
        return None
    card = player.discard[discard_index]
    if card.type != CardType.AI:
        return None
    player.discard.pop(discard_index)
    player.field_ai.append(card)
    _ensure_field_stacks(player)
    player.spent_field_ai.add(len(player.field_ai) - 1)
    return card


def trash_memory(player: PlayerState):
    """遺物破壊: 対象プレイヤーの遺物をトラッシュへ送る。遺物がなければ何もしない。"""
    if player.memory is None:
        return None
    trashed = player.memory
    player.memory = None
    player.discard.append(trashed)
    return trashed


def recover_memory_from_discard(player: PlayerState, discard_index: int):
    """遺物回収: 自分のトラッシュの遺物1枚を手札に戻す。遺物カード以外は対象にできない。"""
    if discard_index < 0 or discard_index >= len(player.discard):
        return None
    card = player.discard[discard_index]
    if card.type != CardType.MEMORY:
        return None
    player.discard.pop(discard_index)
    player.hand.append(card)
    return card


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
    elif action.type == ActionType.STRIKE:
        if not state.config.monster_combat:
            raise ValueError("Monster combat is disabled.")
        if not _can_active_player_attack(state):
            raise ValueError("The active player cannot attack now.")
        _strike(state, action)
    elif action.type == ActionType.CHARGE:
        _charge(state, action)
    else:
        raise ValueError(f"Unsupported action: {action.type}")

    _spend_actions(state, action_cost, attack=action.type in (ActionType.ATTACK, ActionType.STRIKE))
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
            "hand_defense_vs_strike": state.config.hand_defense_vs_strike,
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
    _ensure_field_stacks(player)
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
    enter_effect = _apply_ai_enter_effect(state, player, card, field_index=field_index)
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
    if state.actions_remaining >= state.config.actions_per_turn + 1:
        raise ValueError("Accelerator relic cannot increase actions beyond 3.")
    if action.target_index < 0 or action.target_index >= len(player.field_ai):
        raise ValueError("Accelerator target is out of range.")
    sacrificed_cards = _remove_field_stack(player, action.target_index)
    sacrificed = sacrificed_cards[0]
    player.discard.extend(sacrificed_cards)
    player.ai_lost += len(sacrificed_cards)
    player.pending_effects["accelerator_used"] = True
    state.actions_remaining = min(state.config.actions_per_turn + 1, state.actions_remaining + 1)
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

    _ensure_field_stacks(player)[action.target_index].append(source)
    player.field_ai[action.target_index] = card
    player.spent_field_ai.discard(action.target_index)
    player.power_3_recovery_delayed_field_ai.discard(action.target_index)
    player.charge_guarded_field_ai.discard(action.target_index)
    player.turn_field_attack_bonuses.pop(action.target_index, None)
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
    enter_effect = _apply_ai_enter_effect(
        state, player, card, excluded_recover_card=source, field_index=action.target_index
    )
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


def strike_values(
    state: GameState,
    attack_ai,
    defender: PlayerState,
    target_index: int,
    *,
    attacker: PlayerState | None = None,
    attacker_field_index: int | None = None,
):
    target = defender.field_ai[target_index]
    attack_bonus = turn_attack_bonus(attacker, attacker_field_index) + conditional_attack_bonus(
        attack_ai, attacker.discard if attacker is not None else None
    )
    attack_value = attack_combat_value(attack_ai, attack_power_bonus=attack_bonus)
    defense_value = defense_combat_value(
        attack_ai,
        target,
        advantage_bonus=state.config.defense_advantage_bonus,
        disadvantage_penalty=state.config.defense_disadvantage_penalty,
        defense_power_bonus=_defense_power_bonus(
            state,
            defender,
            target,
            attack_ai,
            field_index=target_index,
            attack_power_bonus=attack_bonus,
        ),
    )
    return attack_value, defense_value


def choose_strike_hand_defender(
    state: GameState,
    attack_ai,
    defender: PlayerState,
    target_index: int,
    *,
    attacker: PlayerState | None = None,
    attacker_field_index: int | None = None,
) -> int | None:
    """検証用: モンスター攻撃への手札防御（hand_defense_vs_strike）の自動防御判断。

    通常の手札防御条件（1ターン上限・防御値>=攻撃値・防御不可効果）は両モード共通。
    相打ちは両モードとも防御しない（放置すれば攻撃側も落ちるため）。
    eager: 防御可能なら常に防御する（vs プレイヤー攻撃の既存方針と同じ）。
    value: 救う対象スタックの power 合計が防御に使う手札の power 以上の時だけ防御する。
    """
    mode = state.config.hand_defense_vs_strike
    if mode not in ("eager", "value"):
        return None
    if attacker is not None and attacker.next_attack_unblockable:
        return None
    index = _choose_hand_defender(
        state,
        attack_ai,
        defender,
        attack_power_bonus=turn_attack_bonus(attacker, attacker_field_index)
        + conditional_attack_bonus(attack_ai, attacker.discard if attacker is not None else None),
    )
    if index is None:
        return None
    attack_value, defense_value = strike_values(
        state,
        attack_ai,
        defender,
        target_index,
        attacker=attacker,
        attacker_field_index=attacker_field_index,
    )
    if attack_value == defense_value:
        return None
    if mode == "value":
        stacks = _ensure_field_stacks(defender)
        stack_cards = [defender.field_ai[target_index], *stacks[target_index]]
        saved_power = sum(int(card.power or 1) for card in stack_cards)
        if saved_power < int(defender.hand[index].power or 1):
            return None
    return index


def choose_strike_field_defender(
    state: GameState,
    attack_ai,
    defender: PlayerState,
    target_index: int,
    *,
    attacker: PlayerState | None = None,
    attacker_field_index: int | None = None,
) -> int | None:
    """検証用: モンスター攻撃を場の別召喚獣でかばう自動防御判断。"""
    mode = state.config.hand_defense_vs_strike
    if mode not in ("eager", "value"):
        return None
    attack_bonus = (
        turn_attack_bonus(attacker, attacker_field_index)
        + conditional_attack_bonus(attack_ai, attacker.discard if attacker is not None else None)
    )
    attack_value = attack_combat_value(attack_ai, attack_power_bonus=attack_bonus)
    candidates = []
    for index, card in enumerate(defender.field_ai):
        if index == target_index:
            continue
        if not state.config.exhausted_ai_can_defend and index in defender.spent_field_ai:
            continue
        if state.config.power_3_cannot_field_defend and card.power == 3:
            continue
        defense_value = defense_combat_value(
            attack_ai,
            card,
            advantage_bonus=state.config.defense_advantage_bonus,
            disadvantage_penalty=state.config.defense_disadvantage_penalty,
            defense_power_bonus=_defense_power_bonus(
                state,
                defender,
                card,
                attack_ai,
                field_index=index,
                attack_power_bonus=attack_bonus,
            ),
        )
        candidates.append((index, card, defense_value))
    if not candidates:
        return None
    best = min(
        candidates,
        key=lambda item: (
            0 if item[2] >= attack_value else 1,
            item[1].power or 0,
            item[1].id,
        ),
    )
    if mode == "value":
        stacks = _ensure_field_stacks(defender)
        target_cards = [defender.field_ai[target_index], *stacks[target_index]]
        saved_power = sum(int(card.power or 1) for card in target_cards)
        blocker_cards = [best[1], *stacks[best[0]]]
        blocker_power = sum(int(card.power or 1) for card in blocker_cards)
        if saved_power < blocker_power:
            return None
    return best[0]


def _strike(state: GameState, action: Action) -> None:
    attacker = state.active()
    defender = state.opponent()
    if action.source_index is None or action.target_index is None:
        raise ValueError("STRIKE requires attacker and target field indexes.")
    if action.source_index in attacker.spent_field_ai:
        raise ValueError("This summon has already acted this turn.")
    if action.target_index < 0 or action.target_index >= len(defender.field_ai):
        raise ValueError("Strike target is out of range.")
    attack_ai = attacker.field_ai[action.source_index]
    target = defender.field_ai[action.target_index]
    attack_value, defense_value = strike_values(
        state,
        attack_ai,
        defender,
        action.target_index,
        attacker=attacker,
        attacker_field_index=action.source_index,
    )
    if attack_value < defense_value:
        raise ValueError("Strike target is too sturdy.")

    field_defense_index = choose_strike_field_defender(
        state,
        attack_ai,
        defender,
        action.target_index,
        attacker=attacker,
        attacker_field_index=action.source_index,
    )
    hand_defense_index = None if field_defense_index is not None else choose_strike_hand_defender(
        state,
        attack_ai,
        defender,
        action.target_index,
        attacker=attacker,
        attacker_field_index=action.source_index,
    )
    attacker.next_attack_unblockable = False

    state.stats.attacks += 1
    state.stats.record_card_usage(attack_ai.id, "struck")
    if state.config.exhaust_after_attack and not keeps_ready_after_attack(attack_ai):
        attacker.spent_field_ai.add(action.source_index)
        if state.config.power_3_attack_recovery_delay and attack_ai.power == 3:
            attacker.power_3_recovery_delayed_field_ai.add(action.source_index)

    if field_defense_index is not None:
        defense_ai = defender.field_ai[field_defense_index]
        defense_bonus = _defense_power_bonus(
            state,
            defender,
            defense_ai,
            attack_ai,
            field_index=field_defense_index,
            attack_power_bonus=turn_attack_bonus(attacker, action.source_index)
            + conditional_attack_bonus(attack_ai, attacker.discard),
        )
        strike_attack_value = attack_combat_value(
            attack_ai,
            attack_power_bonus=turn_attack_bonus(attacker, action.source_index)
            + conditional_attack_bonus(attack_ai, attacker.discard),
        )
        strike_defense_value = defense_combat_value(
            attack_ai,
            defense_ai,
            advantage_bonus=state.config.defense_advantage_bonus,
            disadvantage_penalty=state.config.defense_disadvantage_penalty,
            defense_power_bonus=defense_bonus,
        )
        blocked = strike_defense_value >= strike_attack_value
        trade = strike_defense_value == strike_attack_value
        if blocked:
            state.stats.successful_defenses += 1
            state.stats.record_card_usage(defense_ai.id, "field_defended_strike")
            defense_result = "success_trade" if trade else "success"
        else:
            state.stats.failed_defenses += 1
            state.stats.record_card_usage(defense_ai.id, "field_defended_strike_failed")
            defense_result = "partial_failed"
        if draws_on_successful_defense(defense_ai):
            defender.draw(1, state.rng)
            state.stats.record_card_usage(defense_ai.id, "defense_draw")
        if recovers_ai_on_successful_defense(defense_ai):
            recover_index = _highest_power_ai_in_discard(defender)
            if recover_index is not None:
                recovered = defender.discard.pop(recover_index)
                defender.hand.append(recovered)
                state.stats.record_card_usage(defense_ai.id, "defense_recover")
                _apply_echo_urn_draw(state, defender)
        if (
            defender.memory is not None
            and defender.memory.effect == MemoryEffect.TIDAL_MIRROR.value
        ):
            if defender.draw(1, state.rng):
                state.stats.record_card_usage(defender.memory.id, "defense_draw")
        if blocked and pressures_on_block(attack_ai):
            discarded = _discard_low_priority_cards(defender, 1)
            if discarded:
                state.stats.record_card_usage(attack_ai.id, "block_pressure")
        if blocked and draws_on_blocked_attack(attack_ai):
            attacker.draw(1, state.rng)
            state.stats.record_card_usage(attack_ai.id, "blocked_attack_draw")
        if blocked:
            attacker_lost = _remove_field_stack(attacker, action.source_index)
            attacker.discard.extend(attacker_lost)
            attacker.ai_lost += len(attacker_lost)
            attacker_lost_ids = [card.id for card in attacker_lost]
            if trade:
                defender_lost = _remove_field_stack(defender, field_defense_index)
                defender.discard.extend(defender_lost)
                defender.ai_lost += len(defender_lost)
            else:
                defender.spent_field_ai.add(field_defense_index)
        else:
            defender_lost = _remove_field_stack(defender, field_defense_index)
            defender.discard.extend(defender_lost)
            defender.ai_lost += len(defender_lost)
            attacker_lost_ids = []
        overheat = (
            {"overheated": False, "sandbox_command_used": None, "overheat_draw_count": 0}
            if blocked
            else _overheat_attacker_after_attack(state, attacker, action.source_index, attack_ai)
        )
        state.log.append(
            _action_log_base(state, action)
            | {
                "result": "strike",
                "attack_ai": attack_ai.id,
                "strike_target": target.id,
                "trade": trade if blocked else False,
                "field_defense_ai": defense_ai.id,
                "defense_result": defense_result,
                "attacker_lost": attacker_lost_ids,
                "attacker_overheated": overheat["overheated"],
                "life": [player.life for player in state.players],
                "field": _field_state(state),
            }
        )
        return

    if hand_defense_index is not None:
        defense_ai = defender.hand.pop(hand_defense_index)
        defender.hand_defenses_used_this_turn += 1
        defender.discard.append(defense_ai)
        defender.ai_lost += 1
        state.stats.successful_defenses += 1
        state.stats.record_card_usage(defense_ai.id, "hand_defended_strike")
        state.stats.record_card_usage(attack_ai.id, "strike_hand_defended")
        damage = 0
        if pierces_hand_defense(attack_ai):
            damage = 1
            _deal_damage(defender, damage)
            _post_damage_draw(state, defender, damage)
            _apply_war_banner_draw(state, attacker)
            state.stats.record_card_usage(attack_ai.id, "pierced_hand_defense")
        elif pressures_on_block(attack_ai):
            discarded = _discard_low_priority_cards(defender, 1)
            if discarded:
                state.stats.record_card_usage(attack_ai.id, "block_pressure")
        # 防御された時ドローは手札防御貫通（1ダメージ）と両立する（両方持つカードが収録された場合）
        if draws_on_blocked_attack(attack_ai):
            attacker.draw(1, state.rng)
            state.stats.record_card_usage(attack_ai.id, "blocked_attack_draw")
        overheat = _overheat_attacker_after_attack(
            state, attacker, action.source_index, attack_ai
        )
        state.log.append(
            _action_log_base(state, action)
            | {
                "result": "strike",
                "attack_ai": attack_ai.id,
                "strike_target": target.id,
                "trade": False,
                "hand_defense_ai": defense_ai.id,
                "damage": damage,
                "attacker_lost": [],
                "attacker_overheated": overheat["overheated"],
                "life": [player.life for player in state.players],
                "field": _field_state(state),
            }
        )
        return

    trade = attack_value == defense_value
    lost = _remove_field_stack(defender, action.target_index)
    defender.discard.extend(lost)
    defender.ai_lost += len(lost)
    attacker_lost_ids = []
    if trade:
        lost_own = _remove_field_stack(attacker, action.source_index)
        attacker.discard.extend(lost_own)
        attacker.ai_lost += len(lost_own)
        attacker_lost_ids = [card.id for card in lost_own]
        overheat = {"overheated": False, "sandbox_command_used": None, "overheat_draw_count": 0}
    else:
        overheat = _overheat_attacker_after_attack(
            state, attacker, action.source_index, attack_ai
        )

    state.log.append(
        _action_log_base(state, action)
        | {
            "result": "strike",
            "attack_ai": attack_ai.id,
            "strike_target": target.id,
            "trade": trade,
            "attacker_lost": attacker_lost_ids,
            "attacker_overheated": overheat["overheated"],
            "life": [player.life for player in state.players],
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
    attack_bonus = turn_attack_bonus(attacker, action.source_index) + conditional_attack_bonus(
        attack_ai, attacker.discard
    )
    defense_index = _choose_field_defender(
        state, attack_ai, defender, state.non_active_player, attack_power_bonus=attack_bonus
    )
    hand_defense_index = (
        None
        if attacker.next_attack_unblockable
        else _choose_hand_defender(state, attack_ai, defender, attack_power_bonus=attack_bonus)
    )
    attacker.next_attack_unblockable = False
    if defense_index is not None and hand_defense_index is not None:
        if pierces_hand_defense(attack_ai):
            hand_defense_index = None
        else:
            defense_ai = defender.field_ai[defense_index]
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
                    attack_power_bonus=attack_bonus,
                ),
                attack_power_bonus=attack_bonus,
            ):
                hand_defense_index = None
            else:
                defense_index = None
    defense_ai_id = None
    firewall_discarded_card = None
    block_pressure_discarded_card = None
    damage = 0
    draw_count = 0
    blocked_attack_draw_count = 0
    defense_draw_count = 0
    defense_recovered_ai = None
    defense_echo_urn_draw_count = 0
    tidal_mirror_draw_count = 0
    outcome = "blocked"
    defense_result = "undefended"
    attacker_overheated = False
    war_banner_draw_count = 0

    state.stats.attacks += 1
    state.stats.record_card_usage(attack_ai.id, "attacked")
    if state.config.exhaust_after_attack and not keeps_ready_after_attack(attack_ai):
        attacker.spent_field_ai.add(action.source_index)
        if state.config.power_3_attack_recovery_delay and attack_ai.power == 3:
            attacker.power_3_recovery_delayed_field_ai.add(action.source_index)

    if defense_index is None:
        if hand_defense_index is None:
            damage = _attack_damage(state, attack_ai)
            _deal_damage(defender, damage)
            _post_damage_draw(state, defender, damage)
            war_banner_draw_count += _apply_war_banner_draw(state, attacker)
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
                _deal_damage(defender, damage)
                _post_damage_draw(state, defender, damage)
                war_banner_draw_count += _apply_war_banner_draw(state, attacker)
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
                attack_power_bonus=attack_bonus,
            ),
            attack_power_bonus=attack_bonus,
        ):
            defense_bonus = _defense_power_bonus(
                state,
                defender,
                defense_ai,
                attack_ai,
                field_index=defense_index,
                attack_power_bonus=attack_bonus,
            )
            defense_value = defense_combat_value(
                attack_ai,
                defense_ai,
                advantage_bonus=state.config.defense_advantage_bonus,
                disadvantage_penalty=state.config.defense_disadvantage_penalty,
                defense_power_bonus=defense_bonus,
            )
            attack_value = attack_combat_value(attack_ai, attack_power_bonus=attack_bonus)
            state.stats.successful_defenses += 1
            state.stats.record_card_usage(defense_ai.id, "defended_success")
            defense_result = "success_trade" if defense_value == attack_value else "success"
            firewall_discarded_card = _discard_firewall_fuel(
                state,
                defender,
                defense_ai,
                attack_ai,
                attack_power_bonus=attack_bonus,
            )
            if draws_on_successful_defense(defense_ai):
                defense_draw_count = defender.draw(1, state.rng)
                state.stats.record_card_usage(defense_ai.id, "defense_draw")
            if recovers_ai_on_successful_defense(defense_ai):
                recover_index = _highest_power_ai_in_discard(defender)
                if recover_index is not None:
                    recovered = defender.discard.pop(recover_index)
                    defender.hand.append(recovered)
                    defense_recovered_ai = recovered.id
                    defense_echo_urn_draw_count = _apply_echo_urn_draw(state, defender)
                    state.stats.record_card_usage(defense_ai.id, "defense_recover")
            if (
                defender.memory is not None
                and defender.memory.effect == MemoryEffect.TIDAL_MIRROR.value
            ):
                tidal_mirror_draw_count = defender.draw(1, state.rng)
                if tidal_mirror_draw_count:
                    state.stats.record_card_usage(defender.memory.id, "defense_draw")
            attacker_lost = _remove_field_stack(attacker, action.source_index)
            attacker.discard.extend(attacker_lost)
            attacker.ai_lost += len(attacker_lost)
            if defense_value == attack_value:
                defender_lost = _remove_field_stack(defender, defense_index)
                defender.discard.extend(defender_lost)
                defender.ai_lost += len(defender_lost)
            else:
                defender.spent_field_ai.add(defense_index)
        else:
            if draws_on_successful_defense(defense_ai):
                defense_draw_count = defender.draw(1, state.rng)
                state.stats.record_card_usage(defense_ai.id, "defense_draw")
            if recovers_ai_on_successful_defense(defense_ai):
                recover_index = _highest_power_ai_in_discard(defender)
                if recover_index is not None:
                    recovered = defender.discard.pop(recover_index)
                    defender.hand.append(recovered)
                    defense_recovered_ai = recovered.id
                    defense_echo_urn_draw_count = _apply_echo_urn_draw(state, defender)
                    state.stats.record_card_usage(defense_ai.id, "defense_recover")
            if (
                defender.memory is not None
                and defender.memory.effect == MemoryEffect.TIDAL_MIRROR.value
            ):
                tidal_mirror_draw_count = defender.draw(1, state.rng)
                if tidal_mirror_draw_count:
                    state.stats.record_card_usage(defender.memory.id, "defense_draw")
            lost_cards = _remove_field_stack(defender, defense_index)
            lost_ai = lost_cards[0]
            defender.discard.extend(lost_cards)
            defender.ai_lost += len(lost_cards)
            defense_bonus = _defense_power_bonus(
                state,
                defender,
                defense_ai,
                attack_ai,
                field_index=defense_index,
                attack_power_bonus=attack_bonus,
            )
            defense_value = defense_combat_value(
                attack_ai,
                defense_ai,
                advantage_bonus=state.config.defense_advantage_bonus,
                disadvantage_penalty=state.config.defense_disadvantage_penalty,
                defense_power_bonus=defense_bonus,
            )
            attack_value = attack_combat_value(attack_ai, attack_power_bonus=attack_bonus)
            damage = max(0, attack_value - defense_value)
            _deal_damage(defender, damage)
            _post_damage_draw(state, defender, damage)
            war_banner_draw_count += _apply_war_banner_draw(state, attacker)
            state.stats.failed_defenses += 1
            state.stats.record_card_usage(defense_ai.id, "defended_partial_failed")
            defense_result = "partial_failed"
            outcome = "damage"

    if damage == 0 and defense_result.startswith("success"):
        if pressures_on_block(attack_ai):
            discarded = _discard_low_priority_cards(defender, 1)
            if discarded:
                block_pressure_discarded_card = discarded[0].id
                state.stats.record_card_usage(attack_ai.id, "block_pressure")
    # 防御された時ドローは手札防御貫通（1ダメージ）と両立する（両方持つカードが収録された場合）
    if defense_result.startswith("success") and draws_on_blocked_attack(attack_ai):
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
            "defense_recovered_ai": defense_recovered_ai,
            "defense_echo_urn_draw_count": defense_echo_urn_draw_count,
            "tidal_mirror_draw_count": tidal_mirror_draw_count,
            "attacker_overheated": attacker_overheated,
            "war_banner_draw_count": war_banner_draw_count,
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
    if player.pending_effects.get("charge_used"):
        raise ValueError("Charge is already used this turn.")
    if state.actions_remaining >= state.config.actions_per_turn + 1:
        raise ValueError("Charge cannot increase actions beyond 3.")
    card = player.hand.pop(action.source_index)
    player.discard.append(card)
    before = state.actions_remaining
    state.actions_remaining = min(state.config.actions_per_turn + 1, state.actions_remaining + 1)
    if state.actions_remaining > before:
        state.charged_actions_remaining += 1
    player.pending_effects["charge_used"] = True
    charge_effect = _apply_charge_effect(state, player, card, action.target_index)
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


def _apply_charge_effect(
    state: GameState,
    player: PlayerState,
    charged_card,
    ready_target_index: int | None = None,
) -> dict[str, Any]:
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
        target_index = ready_target_index
        if target_index is None:
            target_index = _highest_power_spent_ai(player)
        if target_index is not None:
            if target_index < 0 or target_index >= len(player.field_ai):
                raise ValueError("Charge ready target is out of range.")
            if target_index not in player.spent_field_ai:
                raise ValueError("Charge ready target must be spent.")
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
    if charged_card.effect == AiEffect.CHARGE_PRESSURE_PLUS.value and len(opponent.hand) >= 2:
        discarded = _discard_low_priority_cards(opponent, 1)
        result["opponent_discarded_card"] = discarded[0].id if discarded else None
        state.stats.record_card_usage(charged_card.id, "charge_pressure")
    if charged_card.effect == AiEffect.CHARGE_SURGE_DRAW.value and len(player.hand) <= 2:
        result["draw_count"] = player.draw(2, state.rng)
        state.stats.record_card_usage(charged_card.id, "charge_draw")
    if charged_card.effect == AiEffect.CHARGE_SPEND_ENEMY.value:
        target_index = ready_target_index
        if target_index is None:
            target_index = _highest_power_ready_ai(opponent)
        if target_index is not None:
            if target_index < 0 or target_index >= len(opponent.field_ai):
                raise ValueError("Charge spend target is out of range.")
            if target_index in opponent.spent_field_ai:
                raise ValueError("Charge spend target must be ready.")
            opponent.spent_field_ai.add(target_index)
            result["spent_enemy_ai"] = opponent.field_ai[target_index].id
            state.stats.record_card_usage(charged_card.id, "charge_spend_enemy")
    if charged_card.effect == AiEffect.CHARGE_RECOVER_DISCARD.value and len(player.hand) <= 2:
        charged_index = len(player.discard) - 1
        recover_index = ready_target_index
        if recover_index is None:
            candidates = [
                (index, card)
                for index, card in enumerate(player.discard)
                if card.type == CardType.AI and index != charged_index
            ]
            recover_index = (
                max(candidates, key=lambda item: (item[1].power or 0, item[1].id))[0]
                if candidates
                else None
            )
        if recover_index is not None:
            if recover_index < 0 or recover_index >= len(player.discard):
                raise ValueError("Charge recover target is out of range.")
            if recover_index == charged_index:
                raise ValueError("Charge recover cannot return the charged card itself.")
            recovered = player.discard[recover_index]
            if recovered.type != CardType.AI:
                raise ValueError("Charge recover target must be a summon.")
            player.discard.pop(recover_index)
            player.hand.append(recovered)
            result["recovered_card"] = recovered.id
            result["echo_urn_draw_count"] = _apply_echo_urn_draw(state, player)
            state.stats.record_card_usage(charged_card.id, "charge_recover")
    if charged_card.effect == AiEffect.CHARGE_DRAW_IF_DISCARD_AI.value:
        charged_index = len(player.discard) - 1
        has_other_ai = any(
            card.type == CardType.AI and index != charged_index
            for index, card in enumerate(player.discard)
        )
        if has_other_ai:
            result["draw_count"] = player.draw(1, state.rng)
            state.stats.record_card_usage(charged_card.id, "charge_draw")
    if charged_card.effect == AiEffect.CHARGE_FILTER_DRAW.value:
        result["draw_count"] = player.draw(2, state.rng)
        if player.hand:
            discarded = _discard_low_priority_cards(player, 1)
            result["discarded_card"] = discarded[0].id if discarded else None
        state.stats.record_card_usage(charged_card.id, "charge_draw")
    if charged_card.effect == AiEffect.CHARGE_PRESSURE_ANY.value and len(opponent.hand) >= 1:
        discarded = _discard_low_priority_cards(opponent, 1)
        result["opponent_discarded_card"] = discarded[0].id if discarded else None
        state.stats.record_card_usage(charged_card.id, "charge_pressure")
    if charged_card.effect == AiEffect.CHARGE_SPEND_ENEMY_READY_ALLY.value:
        # 旋風転身術と同じ自動対象規則: 消耗は相手の最高power未消耗、回復は自分の最高power消耗中。
        # チャージしたカード自身は場に出ていないため、回復対象になることはない。
        spend_index = ready_target_index
        if spend_index is None:
            spend_index = _highest_power_ready_ai(opponent)
        if spend_index is not None:
            if spend_index < 0 or spend_index >= len(opponent.field_ai):
                raise ValueError("Charge spend target is out of range.")
            if spend_index in opponent.spent_field_ai:
                raise ValueError("Charge spend target must be ready.")
            opponent.spent_field_ai.add(spend_index)
            result["spent_enemy_ai"] = opponent.field_ai[spend_index].id
            state.stats.record_card_usage(charged_card.id, "charge_spend_enemy")
        ready_index = _highest_power_spent_ai(player)
        if ready_index is not None:
            target = player.field_ai[ready_index]
            player.spent_field_ai.remove(ready_index)
            player.power_3_recovery_delayed_field_ai.discard(ready_index)
            result["readied_ai"] = target.id
            state.stats.record_card_usage(charged_card.id, "charge_ready_ally")
    if charged_card.effect == AiEffect.CHARGE_RECOVER_DISCARD_ANY.value:
        # AI-EARTH-1C と同じ裁定: チャージした自分自身は回収対象にできない（手札枚数条件はなし）
        charged_index = len(player.discard) - 1
        recover_index = ready_target_index
        if recover_index is None:
            candidates = [
                (index, card)
                for index, card in enumerate(player.discard)
                if card.type == CardType.AI and index != charged_index
            ]
            recover_index = (
                max(candidates, key=lambda item: (item[1].power or 0, item[1].id))[0]
                if candidates
                else None
            )
        if recover_index is not None:
            if recover_index < 0 or recover_index >= len(player.discard):
                raise ValueError("Charge recover target is out of range.")
            if recover_index == charged_index:
                raise ValueError("Charge recover cannot return the charged card itself.")
            recovered = player.discard[recover_index]
            if recovered.type != CardType.AI:
                raise ValueError("Charge recover target must be a summon.")
            player.discard.pop(recover_index)
            player.hand.append(recovered)
            result["recovered_card"] = recovered.id
            result["echo_urn_draw_count"] = _apply_echo_urn_draw(state, player)
            state.stats.record_card_usage(charged_card.id, "charge_recover")
    if charged_card.effect == AiEffect.CHARGE_SPEND_ALL_ENEMIES.value:
        spent_ids = []
        for index, card in enumerate(opponent.field_ai):
            if index not in opponent.spent_field_ai:
                opponent.spent_field_ai.add(index)
                spent_ids.append(card.id)
        if spent_ids:
            result["spent_enemy_ais"] = spent_ids
            state.stats.record_card_usage(charged_card.id, "charge_spend_enemy")
    if (
        player.memory is not None
        and player.memory.effect == MemoryEffect.RESONATOR.value
        and len(player.hand) <= 2
    ):
        result["resonator_draw_count"] = player.draw(1, state.rng)
        state.stats.record_card_usage(player.memory.id, "charge_draw")
    if player.memory is not None and player.memory.effect == MemoryEffect.STORM_CORE.value:
        storm_target_index = _highest_power_ready_ai(opponent)
        if storm_target_index is not None:
            opponent.spent_field_ai.add(storm_target_index)
            result["storm_core_spent_ai"] = opponent.field_ai[storm_target_index].id
            state.stats.record_card_usage(player.memory.id, "charge_spend_enemy")
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
        if ready_index is not None and ready_index not in player.spent_field_ai:
            player.hand.insert(action.source_index, command)
            raise ValueError("Patch target must be a spent summon.")
        readied_ai_id = None
        if ready_index is not None:
            player.spent_field_ai.remove(ready_index)
            player.power_3_recovery_delayed_field_ai.discard(ready_index)
            readied_ai_id = player.field_ai[ready_index].id
        player.discard.append(command)
        drawn = player.draw(1, state.rng)
        result |= {
            "readied_ai": readied_ai_id,
            "draw_count": drawn,
        }
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
    elif command.effect == CommandEffect.PURGE.value:
        target_index = action.target_index
        if target_index is None:
            target_index = _highest_power_spent_ai(opponent)
        if target_index is None or target_index not in opponent.spent_field_ai:
            player.hand.insert(action.source_index, command)
            raise ValueError("Purge requires a spent opposing summon.")
        lost = _remove_field_stack(opponent, target_index)
        opponent.discard.extend(lost)
        opponent.ai_lost += len(lost)
        player.discard.append(command)
        result |= {"purged_ai": lost[0].id}
    elif command.effect == CommandEffect.RELEARN.value:
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
            "echo_urn_draw_count": _apply_echo_urn_draw(state, player),
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
        sacrificed_groups = []
        while player.field_ai:
            sacrificed_groups.append(_remove_field_stack(player, len(player.field_ai) - 1))
        sacrificed = [
            card
            for group in reversed(sacrificed_groups)
            for card in group
        ]
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
        disrupted_index = action.target_index
        if disrupted_index is None:
            disrupted_index = _highest_power_ready_ai(opponent)
        readied_index = action.secondary_target_index
        if readied_index is None:
            readied_index = _highest_power_spent_ai_by_attribute(player, Attribute.WIND)
        if disrupted_index is None and readied_index is None:
            player.hand.insert(action.source_index, command)
            raise ValueError("Wind rite requires a ready enemy or spent wind summon.")
        if disrupted_index is not None:
            if disrupted_index < 0 or disrupted_index >= len(opponent.field_ai):
                player.hand.insert(action.source_index, command)
                raise ValueError("Wind rite enemy target is out of range.")
            if disrupted_index in opponent.spent_field_ai:
                player.hand.insert(action.source_index, command)
                raise ValueError("Wind rite enemy target must be ready.")
        if readied_index is not None:
            if readied_index < 0 or readied_index >= len(player.field_ai):
                player.hand.insert(action.source_index, command)
                raise ValueError("Wind rite ready target is out of range.")
            if readied_index not in player.spent_field_ai:
                player.hand.insert(action.source_index, command)
                raise ValueError("Wind rite ready target must be spent.")
            if not has_attribute(player.field_ai[readied_index], Attribute.WIND):
                player.hand.insert(action.source_index, command)
                raise ValueError("Wind rite ready target must be wind.")
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
        target_index = action.target_index
        if target_index is None:
            target_index = _highest_power_ai_in_discard(player)
        if target_index is None:
            player.hand.insert(action.source_index, command)
            raise ValueError("Earth rite requires a summon in discard.")
        if target_index < 0 or target_index >= len(player.discard):
            player.hand.insert(action.source_index, command)
            raise ValueError("Earth rite target is out of range.")
        if player.discard[target_index].type != CardType.AI:
            player.hand.insert(action.source_index, command)
            raise ValueError("Earth rite target must be a summon.")
        recovered = player.discard.pop(target_index)
        player.hand.append(recovered)
        player.discard.append(command)
        result |= {
            "recovered_ai": recovered.id,
            "echo_urn_draw_count": _apply_echo_urn_draw(state, player),
        }
    elif command.effect == CommandEffect.COMEBACK_RITE.value:
        if player.life >= opponent.life:
            player.hand.insert(action.source_index, command)
            raise ValueError("Comeback rite requires lower life than opponent.")
        ready_index = action.target_index
        if ready_index is None:
            ready_index = _highest_power_spent_ai(player)
        readied_ai = None
        if ready_index is not None:
            if ready_index < 0 or ready_index >= len(player.field_ai):
                player.hand.insert(action.source_index, command)
                raise ValueError("Comeback rite ready target is out of range.")
            if ready_index not in player.spent_field_ai:
                player.hand.insert(action.source_index, command)
                raise ValueError("Comeback rite ready target must be spent.")
            player.spent_field_ai.remove(ready_index)
            player.power_3_recovery_delayed_field_ai.discard(ready_index)
            readied_ai = player.field_ai[ready_index].id
        drawn = player.draw(2, state.rng) if player.deck else 0
        player.discard.append(command)
        result |= {
            "readied_ai": readied_ai,
            "draw_count": drawn,
        }
    elif command.effect == CommandEffect.WAR_CRY.value:
        if _highest_power_ready_ai(player) is None:
            player.hand.insert(action.source_index, command)
            raise ValueError("War cry requires a ready summon.")
        add_turn_global_attack_bonus(player, 1)
        player.discard.append(command)
        result |= {"turn_global_attack_bonus": player.turn_global_attack_bonus}
    elif command.effect == CommandEffect.TIDE_EDGE.value:
        if not _has_attribute_ai(player, Attribute.WATER):
            player.hand.insert(action.source_index, command)
            raise ValueError("Tide edge requires a water summon in field.")
        buff_index = action.target_index
        if buff_index is None:
            buff_index = _highest_power_ready_ai(player)
        if buff_index is None:
            buff_index = _highest_power_field_ai(player)
        if buff_index is None or buff_index < 0 or buff_index >= len(player.field_ai):
            player.hand.insert(action.source_index, command)
            raise ValueError("Tide edge requires an own summon to buff.")
        add_turn_field_attack_bonus(player, buff_index, 2)
        player.discard.append(command)
        result |= {"buffed_ai": player.field_ai[buff_index].id}
    elif command.effect == CommandEffect.PIERCE_SIGHT.value:
        if _highest_power_ready_ai(player) is None:
            player.hand.insert(action.source_index, command)
            raise ValueError("Pierce sight requires a ready summon.")
        set_next_attack_unblockable(player)
        player.discard.append(command)
        result |= {"next_attack_unblockable": True}
    elif command.effect == CommandEffect.GRAVE_CALL.value:
        if len(player.field_ai) >= state.config.field_ai_limit:
            player.hand.insert(action.source_index, command)
            raise ValueError("Grave call requires an open field slot.")
        revive_index = action.target_index
        if revive_index is None:
            revive_index = _best_revive_target_in_discard(player)
        if (
            revive_index is None
            or revive_index < 0
            or revive_index >= len(player.discard)
            or player.discard[revive_index].type != CardType.AI
            or (player.discard[revive_index].power or 0) > 2
        ):
            player.hand.insert(action.source_index, command)
            raise ValueError("Grave call requires a power 2 or lower summon in discard.")
        player.discard.append(command)
        revived = revive_ai_from_discard(state, player, revive_index)
        result |= {"revived_ai": revived.id if revived else None}
    elif command.effect == CommandEffect.SALVAGE.value:
        recover_index = action.target_index
        if recover_index is None:
            recover_index = _best_event_in_discard(player)
        if (
            recover_index is None
            or recover_index < 0
            or recover_index >= len(player.discard)
            or player.discard[recover_index].type != CardType.EVENT
            or player.discard[recover_index].effect == CommandEffect.SALVAGE.value
        ):
            player.hand.insert(action.source_index, command)
            raise ValueError("Salvage requires a non-salvage command in discard.")
        recovered = player.discard.pop(recover_index)
        player.hand.append(recovered)
        player.discard.append(command)
        result |= {
            "recovered_command": recovered.id,
            "echo_urn_draw_count": _apply_echo_urn_draw(state, player),
        }
    elif command.effect == CommandEffect.OVERDRIVE.value:
        if not has_charged_this_turn(player):
            player.hand.insert(action.source_index, command)
            raise ValueError("Overdrive requires charging first this turn.")
        if not player.deck:
            player.hand.insert(action.source_index, command)
            raise ValueError("Overdrive requires a deck card to draw.")
        player.discard.append(command)
        drawn = player.draw(2, state.rng)
        result |= {"draw_count": drawn}
    elif command.effect == CommandEffect.RELIC_CRUSH.value:
        if opponent.memory is None:
            player.hand.insert(action.source_index, command)
            raise ValueError("Relic crush requires the opponent to have a relic.")
        player.discard.append(command)
        trashed = trash_memory(opponent)
        result |= {"trashed_enemy_memory": trashed.id if trashed else None}
    elif command.effect == CommandEffect.DEEP_CURRENT.value:
        water_count = sum(
            1 for card in player.field_ai if has_attribute(card, Attribute.WATER)
        )
        if water_count < 2:
            player.hand.insert(action.source_index, command)
            raise ValueError("Deep current requires two water summons in field.")
        if not player.deck:
            player.hand.insert(action.source_index, command)
            raise ValueError("Deep current requires a deck card to draw.")
        player.discard.append(command)
        drawn = player.draw(3, state.rng)
        discarded = _discard_low_priority_cards(player, 1) if player.hand else []
        result |= {
            "draw_count": drawn,
            "discarded_cards": [card.id for card in discarded],
        }
    else:
        player.hand.insert(action.source_index, command)
        raise ValueError(f"Unsupported command effect: {command.effect}")

    state.stats.record_card_usage(command.id, "used")
    state.log.append(_action_log_base(state, action) | result)


def _deal_damage(player: PlayerState, amount: int = 1) -> None:
    player.life -= amount


def _apply_end_turn_grove_rest(state: GameState) -> str | None:
    player = state.active()
    opponent = state.opponent()
    if player.memory is None or player.memory.effect != MemoryEffect.GROVE_REST.value:
        return None
    if player.life >= opponent.life:
        return None
    if len(player.spent_field_ai) < 2:
        return None
    target_index = _highest_power_spent_ai(player)
    if target_index is None:
        return None
    player.spent_field_ai.remove(target_index)
    player.power_3_recovery_delayed_field_ai.discard(target_index)
    state.stats.record_card_usage(player.memory.id, "turn_end_ready")
    return player.field_ai[target_index].id


def _apply_war_banner_draw(state: GameState, attacker: PlayerState) -> int:
    if attacker.memory is None or attacker.memory.effect != MemoryEffect.WAR_BANNER.value:
        return 0
    if attacker.pending_effects.get("war_banner_used"):
        return 0
    attacker.pending_effects["war_banner_used"] = True
    drawn = attacker.draw(1, state.rng)
    if drawn:
        state.stats.record_card_usage(attacker.memory.id, "attack_damage_draw")
    return drawn


def _attack_damage(state: GameState, attack_ai) -> int:
    if not state.config.power_scaled_damage:
        return 1
    return int(attack_ai.power or 1)


def _post_damage_draw(state: GameState, defender: PlayerState, damage: int) -> None:
    if damage <= 0:
        return
    mode = state.config.draw_on_attack_damage
    if mode == "event":
        defender.draw(1, state.rng)
    elif mode == "point":
        defender.draw(damage, state.rng)


def _choose_field_defender(
    state: GameState,
    attack_ai,
    defender: PlayerState,
    defender_index: int,
    attack_power_bonus: int = 0,
) -> int | None:
    _ = defender_index
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
        attack_power_bonus=attack_power_bonus,
    )


def _choose_hand_defender(
    state: GameState,
    attack_ai,
    defender: PlayerState,
    attack_power_bonus: int = 0,
) -> int | None:
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
        attack_power_bonus=attack_power_bonus,
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


def _ensure_field_stacks(player: PlayerState) -> list[list]:
    while len(player.field_stacks) < len(player.field_ai):
        player.field_stacks.append([])
    if len(player.field_stacks) > len(player.field_ai):
        player.field_stacks = player.field_stacks[: len(player.field_ai)]
    return player.field_stacks


def _remove_field_stack(player: PlayerState, index: int):
    stacks = _ensure_field_stacks(player)
    lost_ai = player.field_ai.pop(index)
    stack = stacks.pop(index) if index < len(stacks) else []
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
    player.turn_field_attack_bonuses = {
        (bonus_index if bonus_index < index else bonus_index - 1): bonus
        for bonus_index, bonus in player.turn_field_attack_bonuses.items()
        if bonus_index != index
    }
    return [lost_ai, *reversed(stack)]


def _remove_field_ai(player: PlayerState, index: int):
    return _remove_field_stack(player, index)[0]


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
        returned_ai, *stacked_cards = _remove_field_stack(attacker, attack_index)
        attacker.hand.append(returned_ai)
        attacker.discard.extend(stacked_cards)
        attacker.ai_lost += len(stacked_cards)
        state.stats.record_card_usage(attack_ai.id, "returned_after_overheat")
        result["overheated"] = True
        return result
    overheated_cards = _remove_field_stack(attacker, attack_index)
    attacker.discard.extend(overheated_cards)
    attacker.ai_lost += len(overheated_cards)
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
        if card.power == 4 and state.config.power_4_play_cost is not None:
            cost = state.config.power_4_play_cost
        elif card.power == 3 and state.config.power_3_play_cost is not None:
            cost = state.config.power_3_play_cost
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
    attack_power_bonus: int = 0,
) -> int:
    bonus = 0
    if card.power == 3:
        bonus += state.config.power_3_defense_modifier
    if (
        card.effect == AiEffect.DEFENSE_PLUS_1_WITH_MEMORY.value
        and defender.memory is not None
    ):
        bonus += 2
    if (
        attack_ai is not None
        and defender.memory is not None
        and defender.memory.effect == MemoryEffect.FIREWALL.value
        and bool(defender.hand)
        and card.type == CardType.AI
        and not shares_attribute(card, attack_ai)
        and _firewall_should_pay(
            state, defender, card, attack_ai, attack_power_bonus=attack_power_bonus
        )
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
    attack_power_bonus: int = 0,
) -> bool:
    if (
        defender.memory is None
        or defender.memory.effect != MemoryEffect.FIREWALL.value
        or shares_attribute(defense_ai, attack_ai)
        or not defender.hand
    ):
        return False
    attack_value = attack_combat_value(attack_ai, attack_power_bonus=attack_power_bonus)
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
        return True
    if command.effect == CommandEffect.PATCH.value:
        return True
    if command.effect == CommandEffect.DISRUPT.value:
        return _highest_power_ready_ai(state.opponent()) is not None
    if command.effect == CommandEffect.PURGE.value:
        return _highest_power_spent_ai(state.opponent()) is not None
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
    if command.effect == CommandEffect.COMEBACK_RITE.value:
        return player.life < state.opponent().life
    if command.effect == CommandEffect.WAR_CRY.value:
        return _highest_power_ready_ai(player) is not None
    if command.effect == CommandEffect.TIDE_EDGE.value:
        return _has_attribute_ai(player, Attribute.WATER) and bool(player.field_ai)
    if command.effect == CommandEffect.PIERCE_SIGHT.value:
        return _highest_power_ready_ai(player) is not None
    if command.effect == CommandEffect.GRAVE_CALL.value:
        return (
            len(player.field_ai) < state.config.field_ai_limit
            and _best_revive_target_in_discard(player) is not None
        )
    if command.effect == CommandEffect.SALVAGE.value:
        return _best_event_in_discard(player) is not None
    if command.effect == CommandEffect.OVERDRIVE.value:
        return has_charged_this_turn(player) and bool(player.deck)
    if command.effect == CommandEffect.RELIC_CRUSH.value:
        return state.opponent().memory is not None
    if command.effect == CommandEffect.DEEP_CURRENT.value:
        water_count = sum(
            1 for card in player.field_ai if has_attribute(card, Attribute.WATER)
        )
        return water_count >= 2 and bool(player.deck)
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
        and has_attribute(player.field_ai[index], attribute)
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
    return any(has_attribute(card, attribute) for card in player.field_ai)


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
    if not player.memory:
        return 0
    if hand_count_at_turn_start is None:
        hand_count_at_turn_start = len(player.hand)
    if player.memory.effect == MemoryEffect.CACHE.value:
        if hand_count_at_turn_start > 2:
            return 0
        drawn = player.draw(1, state.rng)
        if drawn:
            state.stats.record_card_usage(player.memory.id, "turn_start_draw")
        return drawn
    if player.memory.effect == MemoryEffect.DUAL_BANNER.value:
        if hand_count_at_turn_start > 2:
            return 0
        if _field_attribute_count(player) < 2:
            return 0
        drawn = player.draw(2, state.rng)
        if drawn:
            state.stats.record_card_usage(player.memory.id, "turn_start_draw")
        return drawn
    return 0


def _field_attribute_count(player: PlayerState) -> int:
    """場の召喚獣が持つ属性の種類数（デュアル属性は両方数える）。"""
    attributes = set()
    for card in player.field_ai:
        attributes.update(card_attributes(card))
    return len(attributes)


def _apply_echo_urn_draw(state: GameState, player: PlayerState) -> int:
    """残響の骨壺: 1ターンに1回、トラッシュから手札にカードが戻った時に1枚引く。"""
    if player.memory is None or player.memory.effect != MemoryEffect.ECHO_URN.value:
        return 0
    if player.pending_effects.get("echo_urn_used"):
        return 0
    player.pending_effects["echo_urn_used"] = True
    drawn = player.draw(1, state.rng)
    if drawn:
        state.stats.record_card_usage(player.memory.id, "recover_draw")
    return drawn


def _best_revive_target_in_discard(player: PlayerState, max_power: int = 2) -> int | None:
    """残響召喚の自動対象: power 2 以下の召喚獣のうち最高 power、同 power なら ID 降順。"""
    candidates = [
        (index, card)
        for index, card in enumerate(player.discard)
        if card.type == CardType.AI and (card.power or 0) <= max_power
    ]
    if not candidates:
        return None
    return max(candidates, key=lambda item: (item[1].power or 0, item[1].id))[0]


def _best_event_in_discard(player: PlayerState) -> int | None:
    """遺灰回収の自動対象: 術式（遺灰回収以外）のうち ID 降順。"""
    candidates = [
        (index, card)
        for index, card in enumerate(player.discard)
        if card.type == CardType.EVENT and card.effect != CommandEffect.SALVAGE.value
    ]
    if not candidates:
        return None
    return max(candidates, key=lambda item: item[1].id)[0]


def _best_memory_in_discard(player: PlayerState) -> int | None:
    """城塞獣ガリオンの自動対象: トラッシュの遺物のうち ID 降順。"""
    candidates = [
        (index, card)
        for index, card in enumerate(player.discard)
        if card.type == CardType.MEMORY
    ]
    if not candidates:
        return None
    return max(candidates, key=lambda item: item[1].id)[0]


def _apply_ai_enter_effect(
    state: GameState,
    player: PlayerState,
    played_card,
    excluded_recover_card=None,
    field_index: int | None = None,
) -> dict[str, Any]:
    result = {
        "draw_count": 0,
        "discarded_card": None,
        "spent_ai": None,
        "recovered_ai": None,
        "self_damage": 0,
        "opponent_draw_count": 0,
    }
    if trashes_enemy_memory_on_play(played_card) and state.opponent().memory is not None:
        trashed = trash_memory(state.opponent())
        if trashed is not None and field_index is not None:
            player.spent_field_ai.add(field_index)
        result["trashed_enemy_memory"] = trashed.id if trashed else None
        state.stats.record_card_usage(played_card.id, "trashed_enemy_memory")
    if (
        played_card.effect == AiEffect.DRAW_ON_PLAY_IF_DISCARD_4.value
        and len(player.discard) >= 4
    ):
        result["draw_count"] += player.draw(1, state.rng)
        state.stats.record_card_usage(played_card.id, "discard_draw")
    if recovers_memory_on_play(played_card):
        memory_index = _best_memory_in_discard(player)
        if memory_index is not None:
            recovered_memory = player.discard.pop(memory_index)
            player.hand.append(recovered_memory)
            result["recovered_memory"] = recovered_memory.id
            result["echo_urn_draw_count"] = _apply_echo_urn_draw(state, player)
            state.stats.record_card_usage(played_card.id, "recovered_memory")
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
            result["echo_urn_draw_count"] = _apply_echo_urn_draw(state, player)
            state.stats.record_card_usage(played_card.id, "recovered_ai")
    if readies_ally_on_play(played_card):
        # 自分自身（今出したカード。消耗で出る効果を含む）は回復対象から除外する
        candidates = [
            (index, player.field_ai[index])
            for index in player.spent_field_ai
            if 0 <= index < len(player.field_ai) and index != field_index
        ]
        target_index = (
            max(candidates, key=lambda item: (item[1].power or 0, item[1].id))[0]
            if candidates
            else None
        )
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
    attack_power_bonus: int = 0,
):
    if (
        defender.memory is None
        or defender.memory.effect != MemoryEffect.FIREWALL.value
        or shares_attribute(defense_ai, attack_ai)
        or not defender.hand
        or not _firewall_should_pay(
            state, defender, defense_ai, attack_ai, attack_power_bonus=attack_power_bonus
        )
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
    if not shares_attribute(source, target):
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
