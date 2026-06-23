from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
from typing import Iterable


class CardType(StrEnum):
    AI = "ai"
    EVENT = "event"
    MEMORY = "memory"


class CommandEffect(StrEnum):
    OPTIMIZE = "optimize"
    PATCH = "patch"
    DISRUPT = "disrupt"
    RELEARN = "relearn"
    SANDBOX = "sandbox"


class MemoryEffect(StrEnum):
    FIREWALL = "firewall"
    CACHE = "cache"
    PIPELINE = "pipeline"


class DeckArchetype(StrEnum):
    BREAK = "break"
    CONTROL = "control"


class Attribute(StrEnum):
    FIRE = "火"
    WATER = "水"
    WIND = "風"
    EARTH = "土"


@dataclass(frozen=True, slots=True)
class Card:
    id: str
    name: str
    type: CardType
    attribute: Attribute | None = None
    power: int | None = None
    effect: str = ""


ADVANTAGE: dict[Attribute, Attribute] = {
    Attribute.WATER: Attribute.FIRE,
    Attribute.FIRE: Attribute.WIND,
    Attribute.WIND: Attribute.EARTH,
    Attribute.EARTH: Attribute.WATER,
}


def has_attribute_advantage(defender: Attribute, attacker: Attribute) -> bool:
    return ADVANTAGE[defender] == attacker


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
        >= (attack_ai.power or 0)
    )


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
        + defense_attribute_modifier(
            defense_ai.attribute,
            attack_ai.attribute,
            advantage_bonus=advantage_bonus,
            disadvantage_penalty=disadvantage_penalty,
        )
    )


def defense_attribute_modifier(
    defender: Attribute,
    attacker: Attribute,
    *,
    advantage_bonus: int = 1,
    disadvantage_penalty: int = 1,
) -> int:
    if defender == attacker:
        return 0
    if has_attribute_advantage(defender, attacker):
        return advantage_bonus
    if has_attribute_advantage(attacker, defender):
        return -disadvantage_penalty
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
    raise ValueError(f"Unsupported deck archetype: {archetype}")


def _deck_from_ids(card_ids: list[str]) -> list[Card]:
    return [CARD_BY_ID[card_id] for card_id in card_ids]


def validate_same_name_limit(cards: Iterable[Card], limit: int = 2) -> None:
    counts: dict[str, int] = {}
    for card in cards:
        counts[card.id] = counts.get(card.id, 0) + 1
        if counts[card.id] > limit:
            raise ValueError(f"Card {card.id} exceeds same-name limit {limit}.")
