from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from random import Random
from typing import Any, Literal

from .cards import Card


AiProfile = Literal["classic", "beginner", "challenger"]


class ActionType(str, Enum):
    PLAY_AI = "play_ai"
    PLAY_MEMORY = "play_memory"
    USE_MEMORY = "use_memory"
    UPGRADE_AI = "upgrade_ai"
    USE_COMMAND = "use_command"
    ATTACK = "attack"
    STRIKE = "strike"
    CHARGE = "charge"
    END_TURN = "end_turn"


@dataclass(frozen=True)
class Action:
    type: ActionType
    source_index: int | None = None
    target_index: int | None = None
    secondary_target_index: int | None = None


@dataclass
class PlayerState:
    name: str
    life: int = 8
    deck: list[Card] = field(default_factory=list)
    hand: list[Card] = field(default_factory=list)
    field_ai: list[Card] = field(default_factory=list)
    field_stacks: list[list[Card]] = field(default_factory=list)
    memory: Card | None = None
    discard: list[Card] = field(default_factory=list)
    pending_effects: dict[str, Any] = field(default_factory=dict)
    cards_drawn: int = 0
    ai_lost: int = 0
    actions_used: int = 0
    turns_started: int = 0
    hand_defenses_used_this_turn: int = 0
    played_ai_this_turn: bool = False
    spent_field_ai: set[int] = field(default_factory=set)
    power_3_recovery_delayed_field_ai: set[int] = field(default_factory=set)
    charge_guarded_field_ai: set[int] = field(default_factory=set)

    def draw(self, count: int, rng: Random | None) -> int:
        drawn = 0
        for _ in range(count):
            if not self.deck:
                break
            self.hand.append(self.deck.pop())
            self.cards_drawn += 1
            drawn += 1
        return drawn

    def field_summary(self) -> list[str]:
        return [
            (
                f"{card.id}({card.attribute.value if card.attribute else '-'}:"
                f"{card.power}{',spent' if index in self.spent_field_ai else ''}"
                f"{',stack+' + str(len(self.field_stacks[index])) if index < len(self.field_stacks) and self.field_stacks[index] else ''})"
            )
            for index, card in enumerate(self.field_ai)
        ]


@dataclass
class GameConfig:
    life: int = 8
    initial_hand: int = 5
    first_player_initial_hand: int | None = 5
    second_player_initial_hand: int | None = 5
    actions_per_turn: int = 3
    field_ai_limit: int = 3
    max_turns: int = 60
    defense_advantage_bonus: int = 1
    defense_disadvantage_penalty: int = 1
    same_attribute_strict_defense: bool = True
    first_player_first_turn_actions: int | None = 1
    each_player_first_turn_actions: int | None = None
    first_player_first_turn_can_attack: bool = False
    first_player_first_turn_draw: bool = False
    second_player_first_turn_draw: bool = False
    each_player_first_turn_can_attack: bool = True
    hand_defense_limit_per_turn: int | None = 1
    hand_defense_requires_empty_field: bool = False
    exhaust_after_attack: bool = True
    exhausted_ai_can_defend: bool = False
    successful_defense_discards_both: bool = True
    exact_upgrade_step: bool = False
    power_1_draws_on_play: bool = True
    power_2_defense_bonus: int = 1
    large_ai_play_cost: int = 2
    large_ai_upgrade_cost: int | None = None
    power_3_play_cost: int | None = None
    power_4_play_cost: int | None = None
    power_3_enters_spent: bool = False
    power_3_discards_on_play: bool = False
    power_3_cannot_hand_defend: bool = False
    power_3_cannot_field_defend: bool = False
    power_3_defense_modifier: int = 0
    power_3_overheats_after_attack: bool = False
    power_3_attack_recovery_delay: bool = True
    power_4_enters_spent: bool = False
    power_4_overheats_after_attack: bool = True
    hand_limit: int | None = None
    power_scaled_damage: bool = True
    draw_on_attack_damage: str = "point"  # none / event / point
    monster_combat: bool = True
    ai_profiles: tuple[AiProfile, AiProfile] = ("classic", "classic")


@dataclass
class GameStats:
    successful_defenses: int = 0
    failed_defenses: int = 0
    undefended_attacks: int = 0
    attacks: int = 0
    actions_used: int = 0
    attack_by_attribute: dict[str, dict[str, int]] = field(default_factory=dict)
    card_usage: dict[str, dict[str, int]] = field(default_factory=dict)

    def record_card_usage(self, card_id: str, key: str) -> None:
        usage = self.card_usage.setdefault(card_id, {})
        usage[key] = usage.get(key, 0) + 1

    def record_attribute_attack(self, attribute: str, outcome: str) -> None:
        bucket = self.attack_by_attribute.setdefault(attribute, {})
        bucket[outcome] = bucket.get(outcome, 0) + 1


@dataclass
class GameState:
    seed: int
    rng: Random
    players: list[PlayerState]
    config: GameConfig = field(default_factory=GameConfig)
    turn: int = 0
    active_player: int = 0
    actions_remaining: int = 0
    charged_actions_remaining: int = 0
    phase: str = "setup"
    log: list[dict[str, Any]] = field(default_factory=list)
    winner: int | None = None
    draw: bool = False
    stats: GameStats = field(default_factory=GameStats)

    @property
    def non_active_player(self) -> int:
        return 1 - self.active_player

    def active(self) -> PlayerState:
        return self.players[self.active_player]

    def opponent(self) -> PlayerState:
        return self.players[self.non_active_player]
