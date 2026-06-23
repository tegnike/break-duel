from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Iterable


class CardType(str, Enum):
    AI = "ai"
    EVENT = "event"
    MEMORY = "memory"


class CommandEffect(str, Enum):
    OPTIMIZE = "optimize"
    PATCH = "patch"
    DISRUPT = "disrupt"
    RELEARN = "relearn"
    SANDBOX = "sandbox"


class MemoryEffect(str, Enum):
    FIREWALL = "firewall"
    CACHE = "cache"
    PIPELINE = "pipeline"


class AiEffect(str, Enum):
    ATTACK_PLUS_1 = "attack_plus_1"
    DRAW_AFTER_OVERHEAT = "draw_after_overheat"
    DRAW_ON_PLAY = "draw_on_play"
    FILTER_ON_PLAY = "filter_on_play"
    NO_SPEND_AFTER_ATTACK = "no_spend_after_attack"
    SPEND_ENEMY_ON_PLAY = "spend_enemy_on_play"
    DEFENSE_PLUS_1 = "defense_plus_1"
    RECOVER_AI_ON_PLAY = "recover_ai_on_play"


class DeckArchetype(str, Enum):
    BREAK = "break"
    CONTROL = "control"
    FIRE = "fire"
    WATER = "water"
    WIND = "wind"
    EARTH = "earth"


class Attribute(str, Enum):
    FIRE = "火"
    WATER = "水"
    WIND = "風"
    EARTH = "土"


@dataclass(frozen=True)
class Card:
    id: str
    name: str
    type: CardType
    attribute: Attribute | None = None
    power: int | None = None
    effect: str = ""


def can_defend(
    attack_ai: Card,
    defense_ai: Card,
    *,
    advantage_bonus: int = 1,
    disadvantage_penalty: int = 1,
    same_attribute_strict: bool = False,
    defense_power_bonus: int = 0,
) -> bool:
    _ = same_attribute_strict
    return (
        defense_combat_value(
            attack_ai,
            defense_ai,
            advantage_bonus=advantage_bonus,
            disadvantage_penalty=disadvantage_penalty,
            defense_power_bonus=defense_power_bonus,
        )
        >= attack_combat_value(attack_ai)
    )


def attack_combat_value(attack_ai: Card) -> int:
    if attack_ai.type != CardType.AI:
        raise ValueError("Attack checks require AI character cards.")
    if attack_ai.power is None:
        raise ValueError("AI character cards require power.")
    return attack_ai.power + (1 if attack_ai.effect == AiEffect.ATTACK_PLUS_1.value else 0)


def defense_combat_value(
    attack_ai: Card,
    defense_ai: Card,
    *,
    advantage_bonus: int = 1,
    disadvantage_penalty: int = 1,
    defense_power_bonus: int = 0,
) -> int:
    if attack_ai.type != CardType.AI or defense_ai.type != CardType.AI:
        raise ValueError("Defense checks require AI character cards.")
    if attack_ai.attribute is None or defense_ai.attribute is None:
        raise ValueError("AI character cards require attributes.")
    if attack_ai.power is None or defense_ai.power is None:
        raise ValueError("AI character cards require power.")

    return (
        defense_ai.power
        + defense_power_bonus
        + defense_effect_bonus(defense_ai)
        + defense_attribute_modifier(
            defense_ai.attribute,
            attack_ai.attribute,
            advantage_bonus=advantage_bonus,
            disadvantage_penalty=disadvantage_penalty,
        )
    )


def defense_effect_bonus(defense_ai: Card) -> int:
    if defense_ai.type != CardType.AI:
        raise ValueError("Defense checks require AI character cards.")
    return 1 if defense_ai.effect == AiEffect.DEFENSE_PLUS_1.value else 0


def draws_on_play(ai: Card) -> bool:
    return ai.type == CardType.AI and ai.effect == AiEffect.DRAW_ON_PLAY.value


def keeps_ready_after_attack(ai: Card) -> bool:
    return ai.type == CardType.AI and ai.effect == AiEffect.NO_SPEND_AFTER_ATTACK.value


def draws_after_overheat(ai: Card) -> bool:
    return ai.type == CardType.AI and ai.effect == AiEffect.DRAW_AFTER_OVERHEAT.value


def filters_on_play(ai: Card) -> bool:
    return ai.type == CardType.AI and ai.effect == AiEffect.FILTER_ON_PLAY.value


def spends_enemy_on_play(ai: Card) -> bool:
    return ai.type == CardType.AI and ai.effect == AiEffect.SPEND_ENEMY_ON_PLAY.value


def recovers_ai_on_play(ai: Card) -> bool:
    return ai.type == CardType.AI and ai.effect == AiEffect.RECOVER_AI_ON_PLAY.value


def defense_attribute_modifier(
    defender: Attribute,
    attacker: Attribute,
    *,
    advantage_bonus: int = 1,
    disadvantage_penalty: int = 1,
) -> int:
    _ = defender
    _ = attacker
    _ = advantage_bonus
    _ = disadvantage_penalty
    return 0


def build_ai_card_pool() -> list[Card]:
    rows = [
        (Attribute.FIRE, "FIRE", "火"),
        (Attribute.WATER, "WATER", "水"),
        (Attribute.WIND, "WIND", "風"),
        (Attribute.EARTH, "EARTH", "土"),
    ]
    names_by_power = {
        1: "チャットボット",
        2: "プロンプター",
        3: "エージェント",
        4: "コアAI",
    }
    effects = {
        (Attribute.FIRE, 2): AiEffect.ATTACK_PLUS_1.value,
        (Attribute.FIRE, 4): AiEffect.DRAW_AFTER_OVERHEAT.value,
        (Attribute.WATER, 1): AiEffect.DRAW_ON_PLAY.value,
        (Attribute.WATER, 2): AiEffect.FILTER_ON_PLAY.value,
        (Attribute.WATER, 3): AiEffect.DRAW_ON_PLAY.value,
        (Attribute.WIND, 1): AiEffect.NO_SPEND_AFTER_ATTACK.value,
        (Attribute.WIND, 3): AiEffect.SPEND_ENEMY_ON_PLAY.value,
        (Attribute.EARTH, 2): AiEffect.DEFENSE_PLUS_1.value,
        (Attribute.EARTH, 4): AiEffect.RECOVER_AI_ON_PLAY.value,
    }
    cards: list[Card] = []
    for attribute, code, label in rows:
        for power in (1, 2, 3, 4):
            cards.append(
                Card(
                    id=f"AI-{code}-{power}",
                    name=f"{label}の{names_by_power[power]}",
                    type=CardType.AI,
                    attribute=attribute,
                    power=power,
                    effect=effects.get((attribute, power), ""),
                )
            )
    return cards


def build_command_card_pool() -> list[Card]:
    return [
        Card(
            id="CMD-OPTIMIZE",
            name="最適化",
            type=CardType.EVENT,
            effect=CommandEffect.OPTIMIZE.value,
        ),
        Card(
            id="CMD-PATCH",
            name="緊急パッチ",
            type=CardType.EVENT,
            effect=CommandEffect.PATCH.value,
        ),
        Card(
            id="CMD-DISRUPT",
            name="妨害コード",
            type=CardType.EVENT,
            effect=CommandEffect.DISRUPT.value,
        ),
        Card(
            id="CMD-RELEARN",
            name="再学習",
            type=CardType.EVENT,
            effect=CommandEffect.RELEARN.value,
        ),
        Card(
            id="CMD-SANDBOX",
            name="サンドボックス",
            type=CardType.EVENT,
            effect=CommandEffect.SANDBOX.value,
        ),
    ]


def build_memory_card_pool() -> list[Card]:
    return [
        Card(
            id="MEM-FIREWALL",
            name="ファイアウォール",
            type=CardType.MEMORY,
            effect=MemoryEffect.FIREWALL.value,
        ),
        Card(
            id="MEM-CACHE",
            name="キャッシュ領域",
            type=CardType.MEMORY,
            effect=MemoryEffect.CACHE.value,
        ),
        Card(
            id="MEM-PIPELINE",
            name="パイプライン",
            type=CardType.MEMORY,
            effect=MemoryEffect.PIPELINE.value,
        ),
    ]


AI_CARD_POOL: tuple[Card, ...] = tuple(build_ai_card_pool())
COMMAND_CARD_POOL: tuple[Card, ...] = tuple(build_command_card_pool())
MEMORY_CARD_POOL: tuple[Card, ...] = tuple(build_memory_card_pool())
CARD_BY_ID: dict[str, Card] = {
    card.id: card for card in [*AI_CARD_POOL, *COMMAND_CARD_POOL, *MEMORY_CARD_POOL]
}


def build_phase1_deck() -> list[Card]:
    return [*AI_CARD_POOL, *COMMAND_CARD_POOL]


def build_player_deck(player_index: int) -> list[Card]:
    return build_deck(
        DeckArchetype.BREAK if player_index == 0 else DeckArchetype.CONTROL
    )


def build_deck(archetype: DeckArchetype) -> list[Card]:
    if archetype == DeckArchetype.BREAK:
        return _deck_from_ids(
            [
                "AI-FIRE-1",
                "AI-FIRE-1",
                "AI-FIRE-2",
                "AI-FIRE-3",
                "AI-FIRE-3",
                "AI-FIRE-4",
                "AI-WATER-1",
                "AI-WATER-1",
                "AI-WATER-2",
                "AI-WATER-3",
                "AI-WATER-3",
                "AI-WATER-4",
                "AI-WIND-2",
                "AI-FIRE-4",
                "CMD-DISRUPT",
                "CMD-DISRUPT",
                "CMD-OPTIMIZE",
                "CMD-PATCH",
                "CMD-SANDBOX",
                "MEM-CACHE",
            ]
        )
    if archetype == DeckArchetype.CONTROL:
        return _deck_from_ids(
            [
                "AI-EARTH-1",
                "AI-EARTH-1",
                "AI-EARTH-2",
                "AI-EARTH-2",
                "AI-EARTH-3",
                "AI-EARTH-3",
                "AI-EARTH-4",
                "AI-WIND-1",
                "AI-WIND-1",
                "AI-WIND-2",
                "AI-WIND-3",
                "AI-WIND-3",
                "AI-WIND-4",
                "AI-WATER-1",
                "AI-WATER-1",
                "CMD-DISRUPT",
                "CMD-RELEARN",
                "CMD-PATCH",
                "CMD-OPTIMIZE",
                "MEM-FIREWALL",
            ]
        )
    if archetype == DeckArchetype.FIRE:
        return _deck_from_ids(
            [
                "AI-FIRE-1",
                "AI-FIRE-1",
                "AI-FIRE-2",
                "AI-FIRE-2",
                "AI-FIRE-3",
                "AI-FIRE-3",
                "AI-FIRE-4",
                "AI-FIRE-4",
                "CMD-DISRUPT",
                "CMD-DISRUPT",
                "CMD-SANDBOX",
                "CMD-SANDBOX",
                "CMD-PATCH",
                "CMD-PATCH",
                "CMD-OPTIMIZE",
                "CMD-OPTIMIZE",
                "MEM-PIPELINE",
                "MEM-PIPELINE",
                "MEM-CACHE",
                "MEM-CACHE",
            ]
        )
    if archetype == DeckArchetype.WATER:
        return _deck_from_ids(
            [
                "AI-WATER-1",
                "AI-WATER-1",
                "AI-WATER-2",
                "AI-WATER-2",
                "AI-WATER-3",
                "AI-WATER-3",
                "AI-WATER-4",
                "AI-WATER-4",
                "CMD-OPTIMIZE",
                "CMD-OPTIMIZE",
                "CMD-RELEARN",
                "CMD-RELEARN",
                "CMD-PATCH",
                "CMD-PATCH",
                "CMD-DISRUPT",
                "CMD-DISRUPT",
                "MEM-CACHE",
                "MEM-CACHE",
                "MEM-PIPELINE",
                "MEM-PIPELINE",
            ]
        )
    if archetype == DeckArchetype.WIND:
        return _deck_from_ids(
            [
                "AI-WIND-1",
                "AI-WIND-1",
                "AI-WIND-2",
                "AI-WIND-2",
                "AI-WIND-3",
                "AI-WIND-3",
                "AI-WIND-4",
                "AI-WIND-4",
                "CMD-DISRUPT",
                "CMD-DISRUPT",
                "CMD-PATCH",
                "CMD-PATCH",
                "CMD-SANDBOX",
                "CMD-SANDBOX",
                "CMD-RELEARN",
                "CMD-RELEARN",
                "MEM-PIPELINE",
                "MEM-PIPELINE",
                "MEM-FIREWALL",
                "MEM-FIREWALL",
            ]
        )
    if archetype == DeckArchetype.EARTH:
        return _deck_from_ids(
            [
                "AI-EARTH-1",
                "AI-EARTH-1",
                "AI-EARTH-2",
                "AI-EARTH-2",
                "AI-EARTH-3",
                "AI-EARTH-3",
                "AI-EARTH-4",
                "AI-EARTH-4",
                "CMD-SANDBOX",
                "CMD-SANDBOX",
                "CMD-PATCH",
                "CMD-PATCH",
                "CMD-OPTIMIZE",
                "CMD-OPTIMIZE",
                "CMD-DISRUPT",
                "CMD-DISRUPT",
                "MEM-FIREWALL",
                "MEM-FIREWALL",
                "MEM-PIPELINE",
                "MEM-PIPELINE",
            ]
        )
    raise ValueError(f"Unsupported deck archetype: {archetype}")


def _deck_from_ids(card_ids: list[str]) -> list[Card]:
    return [CARD_BY_ID[card_id] for card_id in card_ids]


def validate_same_name_limit(cards: Iterable[Card], limit: int = 2) -> None:
    counts: dict[str, int] = {}
    for card in cards:
        counts[card.id] = counts.get(card.id, 0) + 1
        if counts[card.id] > limit:
            raise ValueError(f"Card {card.id} exceeds same-name limit {limit}.")
