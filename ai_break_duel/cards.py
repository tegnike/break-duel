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
    TRINITY = "trinity"
    FIRE_RITE = "fire_rite"
    WATER_RITE = "water_rite"
    WIND_RITE = "wind_rite"
    EARTH_RITE = "earth_rite"


class MemoryEffect(str, Enum):
    FIREWALL = "firewall"
    CACHE = "cache"
    PIPELINE = "pipeline"
    ACCELERATOR = "accelerator"
    RESONATOR = "resonator"


class AiEffect(str, Enum):
    ATTACK_PLUS_1 = "attack_plus_1"
    RECKLESS_ATTACK_PLUS_1 = "reckless_attack_plus_1"
    DRAW_AFTER_OVERHEAT = "draw_after_overheat"
    DRAW_TWO_AFTER_OVERHEAT = "draw_two_after_overheat"
    DRAW_TWO_AFTER_OVERHEAT_OPPONENT_DRAW = "draw_two_after_overheat_opponent_draw"
    DRAW_ON_PLAY = "draw_on_play"
    DRAW_ON_PLAY_CANNOT_HAND_DEFEND = "draw_on_play_cannot_hand_defend"
    FILTER_ON_PLAY = "filter_on_play"
    NO_SPEND_AFTER_ATTACK = "no_spend_after_attack"
    SPEND_ENEMY_ON_PLAY = "spend_enemy_on_play"
    SPEND_ENEMY_ON_PLAY_ENTERS_SPENT = "spend_enemy_on_play_enters_spent"
    DEFENSE_PLUS_1 = "defense_plus_1"
    DEFENSE_PLUS_1_ENTERS_SPENT = "defense_plus_1_enters_spent"
    RECOVER_AI_ON_PLAY = "recover_ai_on_play"
    BLOCK_PRESSURE = "block_pressure"
    HAND_DEFENSE_PIERCE = "hand_defense_pierce"
    LOW_LIFE_NO_HAND_DEFENSE = "low_life_no_hand_defense"
    LOW_LIFE_NO_HAND_DEFENSE_SELF_DAMAGE = "low_life_no_hand_defense_self_damage"
    DRAW_ON_BLOCKED_ATTACK = "draw_on_blocked_attack"
    DRAW_ON_BLOCKED_ATTACK_CANNOT_HAND_DEFEND = "draw_on_blocked_attack_cannot_hand_defend"
    READY_ALLY_ON_PLAY = "ready_ally_on_play"
    READY_ALLY_ON_PLAY_DRAW = "ready_ally_on_play_draw"
    RETURN_AFTER_OVERHEAT = "return_after_overheat"
    RETURN_AFTER_OVERHEAT_CANNOT_HAND_DEFEND = "return_after_overheat_cannot_hand_defend"
    DRAW_ON_SUCCESSFUL_DEFENSE = "draw_on_successful_defense"
    DRAW_ON_SUCCESSFUL_DEFENSE_ENTERS_SPENT = "draw_on_successful_defense_enters_spent"
    CHARGE_PRESSURE = "charge_pressure"
    CHARGE_DRAW = "charge_draw"
    CHARGE_READY_ALLY = "charge_ready_ally"
    CHARGE_GUARD = "charge_guard"


class DeckArchetype(str, Enum):
    BREAK = "break"
    CONTROL = "control"
    FIRE = "fire"
    WATER = "water"
    WIND = "wind"
    EARTH = "earth"
    APEX = "apex"


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
    include_defense_effect_bonus: bool = True,
) -> bool:
    _ = same_attribute_strict
    return (
        defense_combat_value(
            attack_ai,
            defense_ai,
            advantage_bonus=advantage_bonus,
            disadvantage_penalty=disadvantage_penalty,
            defense_power_bonus=defense_power_bonus,
            include_defense_effect_bonus=include_defense_effect_bonus,
        )
        >= attack_combat_value(attack_ai)
    )


def attack_combat_value(attack_ai: Card) -> int:
    if attack_ai.type != CardType.AI:
        raise ValueError("Attack checks require summon cards.")
    if attack_ai.power is None:
        raise ValueError("Summon cards require power.")
    return attack_ai.power + (1 if attacks_plus_1(attack_ai) else 0)


def defense_combat_value(
    attack_ai: Card,
    defense_ai: Card,
    *,
    advantage_bonus: int = 1,
    disadvantage_penalty: int = 1,
    defense_power_bonus: int = 0,
    include_defense_effect_bonus: bool = True,
) -> int:
    if attack_ai.type != CardType.AI or defense_ai.type != CardType.AI:
        raise ValueError("Defense checks require summon cards.")
    if attack_ai.attribute is None or defense_ai.attribute is None:
        raise ValueError("Summon cards require attributes.")
    if attack_ai.power is None or defense_ai.power is None:
        raise ValueError("Summon cards require power.")

    return (
        defense_ai.power
        + defense_power_bonus
        + (defense_effect_bonus(defense_ai) if include_defense_effect_bonus else 0)
        + defense_attribute_modifier(
            defense_ai.attribute,
            attack_ai.attribute,
            advantage_bonus=advantage_bonus,
            disadvantage_penalty=disadvantage_penalty,
        )
    )


def defense_effect_bonus(defense_ai: Card) -> int:
    if defense_ai.type != CardType.AI:
        raise ValueError("Defense checks require summon cards.")
    return 1 if defense_plus_1(defense_ai) else 0


def attacks_plus_1(ai: Card) -> bool:
    return ai.type == CardType.AI and ai.effect in {
        AiEffect.ATTACK_PLUS_1.value,
        AiEffect.RECKLESS_ATTACK_PLUS_1.value,
    }


def draws_on_play(ai: Card) -> bool:
    return ai.type == CardType.AI and ai.effect in {
        AiEffect.DRAW_ON_PLAY.value,
        AiEffect.DRAW_ON_PLAY_CANNOT_HAND_DEFEND.value,
        AiEffect.READY_ALLY_ON_PLAY_DRAW.value,
    }


def keeps_ready_after_attack(ai: Card) -> bool:
    return ai.type == CardType.AI and ai.effect == AiEffect.NO_SPEND_AFTER_ATTACK.value


def draws_after_overheat(ai: Card) -> bool:
    return ai.type == CardType.AI and ai.effect == AiEffect.DRAW_AFTER_OVERHEAT.value


def draws_two_after_overheat(ai: Card) -> bool:
    return ai.type == CardType.AI and ai.effect in {
        AiEffect.DRAW_TWO_AFTER_OVERHEAT.value,
        AiEffect.DRAW_TWO_AFTER_OVERHEAT_OPPONENT_DRAW.value,
    }


def filters_on_play(ai: Card) -> bool:
    return ai.type == CardType.AI and ai.effect == AiEffect.FILTER_ON_PLAY.value


def spends_enemy_on_play(ai: Card) -> bool:
    return ai.type == CardType.AI and ai.effect in {
        AiEffect.SPEND_ENEMY_ON_PLAY.value,
        AiEffect.SPEND_ENEMY_ON_PLAY_ENTERS_SPENT.value,
    }


def defense_plus_1(ai: Card) -> bool:
    return ai.type == CardType.AI and ai.effect in {
        AiEffect.DEFENSE_PLUS_1.value,
        AiEffect.DEFENSE_PLUS_1_ENTERS_SPENT.value,
    }


def recovers_ai_on_play(ai: Card) -> bool:
    return ai.type == CardType.AI and ai.effect == AiEffect.RECOVER_AI_ON_PLAY.value


def pressures_on_block(ai: Card) -> bool:
    return ai.type == CardType.AI and ai.effect == AiEffect.BLOCK_PRESSURE.value


def pierces_hand_defense(ai: Card) -> bool:
    return ai.type == CardType.AI and ai.effect == AiEffect.HAND_DEFENSE_PIERCE.value


def blocks_low_life_hand_defense(ai: Card) -> bool:
    return ai.type == CardType.AI and ai.effect in {
        AiEffect.LOW_LIFE_NO_HAND_DEFENSE.value,
        AiEffect.LOW_LIFE_NO_HAND_DEFENSE_SELF_DAMAGE.value,
    }


def draws_on_blocked_attack(ai: Card) -> bool:
    return ai.type == CardType.AI and ai.effect in {
        AiEffect.DRAW_ON_BLOCKED_ATTACK.value,
        AiEffect.DRAW_ON_BLOCKED_ATTACK_CANNOT_HAND_DEFEND.value,
    }


def readies_ally_on_play(ai: Card) -> bool:
    return ai.type == CardType.AI and ai.effect in {
        AiEffect.READY_ALLY_ON_PLAY.value,
        AiEffect.READY_ALLY_ON_PLAY_DRAW.value,
    }


def returns_after_overheat(ai: Card) -> bool:
    return ai.type == CardType.AI and ai.effect in {
        AiEffect.RETURN_AFTER_OVERHEAT.value,
        AiEffect.RETURN_AFTER_OVERHEAT_CANNOT_HAND_DEFEND.value,
    }


def draws_on_successful_defense(ai: Card) -> bool:
    return ai.type == CardType.AI and ai.effect in {
        AiEffect.DRAW_ON_SUCCESSFUL_DEFENSE.value,
        AiEffect.DRAW_ON_SUCCESSFUL_DEFENSE_ENTERS_SPENT.value,
    }


def has_charge_effect(ai: Card) -> bool:
    return ai.type == CardType.AI and ai.effect in {
        AiEffect.CHARGE_PRESSURE.value,
        AiEffect.CHARGE_DRAW.value,
        AiEffect.CHARGE_READY_ALLY.value,
        AiEffect.CHARGE_GUARD.value,
    }


def enters_spent_on_play(ai: Card) -> bool:
    return ai.type == CardType.AI and ai.effect in {
        AiEffect.SPEND_ENEMY_ON_PLAY_ENTERS_SPENT.value,
        AiEffect.DEFENSE_PLUS_1_ENTERS_SPENT.value,
        AiEffect.RETURN_AFTER_OVERHEAT_CANNOT_HAND_DEFEND.value,
        AiEffect.DRAW_ON_SUCCESSFUL_DEFENSE_ENTERS_SPENT.value,
    }


def self_damages_on_play(ai: Card) -> bool:
    return ai.type == CardType.AI and ai.effect == AiEffect.LOW_LIFE_NO_HAND_DEFENSE_SELF_DAMAGE.value


def opponent_draws_on_play(ai: Card) -> bool:
    return ai.type == CardType.AI and ai.effect == AiEffect.DRAW_TWO_AFTER_OVERHEAT_OPPONENT_DRAW.value


def cannot_hand_defend(ai: Card) -> bool:
    return ai.type == CardType.AI and ai.effect in {
        AiEffect.RECKLESS_ATTACK_PLUS_1.value,
        AiEffect.DRAW_ON_PLAY_CANNOT_HAND_DEFEND.value,
        AiEffect.DRAW_ON_BLOCKED_ATTACK_CANNOT_HAND_DEFEND.value,
        AiEffect.RETURN_AFTER_OVERHEAT_CANNOT_HAND_DEFEND.value,
    }


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
    names_by_id = {
        "AI-FIRE-1": "熾き尾のサラ",
        "AI-FIRE-1B": "火花一番ピリカ",
        "AI-FIRE-2": "炉殻バサルトン",
        "AI-FIRE-2B": "ブレイズランナー",
        "AI-FIRE-3": "極彩ガルーダ",
        "AI-FIRE-3B": "噴角イグナロス",
        "AI-FIRE-4": "終火の影ヴァルガ",
        "AI-FIRE-4B": "劫火王アグニール",
        "AI-FIRE-1C": "炉芯鼠チロ",
        "AI-WATER-1": "透海リュミナ",
        "AI-WATER-1B": "泡踊りのミナモ",
        "AI-WATER-2": "氷晶亀セルキー",
        "AI-WATER-2B": "霧紡ぎセイレーン",
        "AI-WATER-3": "海嵐オルカーン",
        "AI-WATER-3B": "環流の賢ネレイド",
        "AI-WATER-4": "潮輪リヴァイア",
        "AI-WATER-4B": "星淵のアステル",
        "AI-WATER-1C": "雫読みミルティ",
        "AI-WIND-1": "そよぎ狐フルーフ",
        "AI-WIND-1B": "風鈴の子リュフ",
        "AI-WIND-2": "翡翠鎌マンティス",
        "AI-WIND-2B": "真空の黒羽カイト",
        "AI-WIND-3": "花旋鹿シルフィード",
        "AI-WIND-3B": "稜線駆けアルエット",
        "AI-WIND-4": "雲海航路ミストラル",
        "AI-WIND-4B": "天蓋裂きヴァユ",
        "AI-WIND-2C": "追風リネット",
        "AI-EARTH-1": "苔掘りモール",
        "AI-EARTH-1B": "芽吹きの杖ペルナ",
        "AI-EARTH-2": "碑甲ガメル",
        "AI-EARTH-2B": "磁鉄虫フェルム",
        "AI-EARTH-3": "石紋グランスパイダー",
        "AI-EARTH-3B": "琥珀角アンバーン",
        "AI-EARTH-4": "眠れる山ガイアス",
        "AI-EARTH-4B": "地核の環バサリア",
        "AI-EARTH-2C": "石灯りノーム",
    }
    effects = {
        "AI-FIRE-1B": AiEffect.BLOCK_PRESSURE.value,
        "AI-FIRE-2": AiEffect.ATTACK_PLUS_1.value,
        "AI-FIRE-2B": AiEffect.HAND_DEFENSE_PIERCE.value,
        "AI-FIRE-3B": AiEffect.RECKLESS_ATTACK_PLUS_1.value,
        "AI-FIRE-4": AiEffect.DRAW_AFTER_OVERHEAT.value,
        "AI-FIRE-4B": AiEffect.LOW_LIFE_NO_HAND_DEFENSE_SELF_DAMAGE.value,
        "AI-FIRE-1C": AiEffect.CHARGE_PRESSURE.value,
        "AI-WATER-1": AiEffect.DRAW_ON_PLAY.value,
        "AI-WATER-1B": AiEffect.DRAW_ON_PLAY_CANNOT_HAND_DEFEND.value,
        "AI-WATER-2": AiEffect.FILTER_ON_PLAY.value,
        "AI-WATER-2B": AiEffect.DRAW_ON_BLOCKED_ATTACK_CANNOT_HAND_DEFEND.value,
        "AI-WATER-3": AiEffect.DRAW_ON_PLAY.value,
        "AI-WATER-3B": AiEffect.FILTER_ON_PLAY.value,
        "AI-WATER-4B": AiEffect.DRAW_TWO_AFTER_OVERHEAT_OPPONENT_DRAW.value,
        "AI-WATER-1C": AiEffect.CHARGE_DRAW.value,
        "AI-WIND-1": AiEffect.NO_SPEND_AFTER_ATTACK.value,
        "AI-WIND-1B": AiEffect.NO_SPEND_AFTER_ATTACK.value,
        "AI-WIND-2B": AiEffect.SPEND_ENEMY_ON_PLAY.value,
        "AI-WIND-3": AiEffect.SPEND_ENEMY_ON_PLAY.value,
        "AI-WIND-3B": AiEffect.READY_ALLY_ON_PLAY.value,
        "AI-WIND-4B": AiEffect.RETURN_AFTER_OVERHEAT_CANNOT_HAND_DEFEND.value,
        "AI-WIND-2C": AiEffect.CHARGE_READY_ALLY.value,
        "AI-EARTH-1B": AiEffect.DRAW_ON_SUCCESSFUL_DEFENSE.value,
        "AI-EARTH-2": AiEffect.DEFENSE_PLUS_1.value,
        "AI-EARTH-3B": AiEffect.RECOVER_AI_ON_PLAY.value,
        "AI-EARTH-4": AiEffect.RECOVER_AI_ON_PLAY.value,
        "AI-EARTH-4B": AiEffect.DRAW_ON_SUCCESSFUL_DEFENSE_ENTERS_SPENT.value,
        "AI-EARTH-2C": AiEffect.CHARGE_GUARD.value,
    }
    cards: list[Card] = []
    for attribute, code, label in rows:
        for power in (1, 2, 3, 4):
            for suffix in ("", "B"):
                card_id = f"AI-{code}-{power}{suffix}"
                cards.append(
                    Card(
                        id=card_id,
                        name=names_by_id[card_id],
                        type=CardType.AI,
                        attribute=attribute,
                        power=power,
                        effect=effects.get(card_id, ""),
                    )
                )
    cards.extend(
        [
            Card(
                id="AI-FIRE-1C",
                name=names_by_id["AI-FIRE-1C"],
                type=CardType.AI,
                attribute=Attribute.FIRE,
                power=1,
                effect=effects["AI-FIRE-1C"],
            ),
            Card(
                id="AI-WATER-1C",
                name=names_by_id["AI-WATER-1C"],
                type=CardType.AI,
                attribute=Attribute.WATER,
                power=1,
                effect=effects["AI-WATER-1C"],
            ),
            Card(
                id="AI-WIND-2C",
                name=names_by_id["AI-WIND-2C"],
                type=CardType.AI,
                attribute=Attribute.WIND,
                power=2,
                effect=effects["AI-WIND-2C"],
            ),
            Card(
                id="AI-EARTH-2C",
                name=names_by_id["AI-EARTH-2C"],
                type=CardType.AI,
                attribute=Attribute.EARTH,
                power=2,
                effect=effects["AI-EARTH-2C"],
            ),
        ]
    )
    return cards


def build_command_card_pool() -> list[Card]:
    return [
        Card(
            id="CMD-OPTIMIZE",
            name="陣形リライト",
            type=CardType.EVENT,
            effect=CommandEffect.OPTIMIZE.value,
        ),
        Card(
            id="CMD-PATCH",
            name="若葉の息吹",
            type=CardType.EVENT,
            effect=CommandEffect.PATCH.value,
        ),
        Card(
            id="CMD-DISRUPT",
            name="黒蔦の足止め",
            type=CardType.EVENT,
            effect=CommandEffect.DISRUPT.value,
        ),
        Card(
            id="CMD-RELEARN",
            name="幻獣回帰の巻",
            type=CardType.EVENT,
            effect=CommandEffect.RELEARN.value,
        ),
        Card(
            id="CMD-SANDBOX",
            name="蒼殻バリア",
            type=CardType.EVENT,
            effect=CommandEffect.SANDBOX.value,
        ),
        Card(
            id="CMD-TRINITY",
            name="三相崩壊術",
            type=CardType.EVENT,
            effect=CommandEffect.TRINITY.value,
        ),
        Card(
            id="CMD-FIRE-RITE",
            name="紅蓮圧壊術",
            type=CardType.EVENT,
            effect=CommandEffect.FIRE_RITE.value,
        ),
        Card(
            id="CMD-WATER-RITE",
            name="清流再編術",
            type=CardType.EVENT,
            effect=CommandEffect.WATER_RITE.value,
        ),
        Card(
            id="CMD-WIND-RITE",
            name="旋風転身術",
            type=CardType.EVENT,
            effect=CommandEffect.WIND_RITE.value,
        ),
        Card(
            id="CMD-EARTH-RITE",
            name="岩壁継承術",
            type=CardType.EVENT,
            effect=CommandEffect.EARTH_RITE.value,
        ),
    ]


def build_memory_card_pool() -> list[Card]:
    return [
        Card(
            id="MEM-FIREWALL",
            name="竜盾の紋章",
            type=CardType.MEMORY,
            effect=MemoryEffect.FIREWALL.value,
        ),
        Card(
            id="MEM-CACHE",
            name="灯火の旅嚢",
            type=CardType.MEMORY,
            effect=MemoryEffect.CACHE.value,
        ),
        Card(
            id="MEM-PIPELINE",
            name="星泉の導脈",
            type=CardType.MEMORY,
            effect=MemoryEffect.PIPELINE.value,
        ),
        Card(
            id="MEM-ACCELERATOR",
            name="刻火の加速炉",
            type=CardType.MEMORY,
            effect=MemoryEffect.ACCELERATOR.value,
        ),
        Card(
            id="MEM-RESONATOR",
            name="蓄光の祭壇",
            type=CardType.MEMORY,
            effect=MemoryEffect.RESONATOR.value,
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
                "AI-FIRE-1B",
                "AI-FIRE-1C",
                "AI-FIRE-2",
                "AI-FIRE-2B",
                "AI-FIRE-2B",
                "AI-FIRE-3B",
                "AI-FIRE-4",
                "AI-FIRE-4B",
                "AI-FIRE-3B",
                "AI-WATER-1C",
                "AI-WATER-2",
                "AI-WATER-2B",
                "AI-WATER-3B",
                "AI-WATER-4B",
                "CMD-DISRUPT",
                "CMD-TRINITY",
                "CMD-FIRE-RITE",
                "CMD-FIRE-RITE",
                "MEM-CACHE",
                "MEM-ACCELERATOR",
            ]
        )
    if archetype == DeckArchetype.CONTROL:
        return _deck_from_ids(
            [
                "AI-EARTH-1",
                "AI-EARTH-1B",
                "AI-EARTH-2",
                "AI-EARTH-2C",
                "AI-EARTH-3",
                "AI-WIND-1",
                "AI-WIND-1B",
                "AI-WIND-2C",
                "AI-WIND-2B",
                "AI-WIND-3",
                "AI-WIND-3B",
                "AI-EARTH-3B",
                "AI-EARTH-4",
                "AI-EARTH-4B",
                "CMD-DISRUPT",
                "CMD-RELEARN",
                "CMD-PATCH",
                "CMD-EARTH-RITE",
                "MEM-FIREWALL",
                "MEM-PIPELINE",
            ]
        )
    if archetype == DeckArchetype.FIRE:
        return _deck_from_ids(
            [
                "AI-FIRE-1",
                "AI-FIRE-1B",
                "AI-FIRE-2",
                "AI-FIRE-2B",
                "AI-FIRE-3",
                "AI-FIRE-3B",
                "AI-FIRE-4",
                "AI-FIRE-4B",
                "AI-FIRE-1B",
                "AI-FIRE-1C",
                "AI-FIRE-2",
                "AI-FIRE-2B",
                "AI-FIRE-3B",
                "AI-FIRE-4",
                "CMD-DISRUPT",
                "CMD-TRINITY",
                "CMD-FIRE-RITE",
                "CMD-FIRE-RITE",
                "MEM-CACHE",
                "MEM-ACCELERATOR",
            ]
        )
    if archetype == DeckArchetype.WATER:
        return _deck_from_ids(
            [
                "AI-WATER-1",
                "AI-WATER-1B",
                "AI-WATER-2",
                "AI-WATER-2B",
                "AI-WATER-3",
                "AI-WATER-3B",
                "AI-WATER-4",
                "AI-WATER-4B",
                "AI-WATER-1",
                "AI-WATER-1C",
                "AI-WATER-2",
                "AI-WATER-2B",
                "AI-WATER-3B",
                "AI-WATER-4",
                "CMD-DISRUPT",
                "CMD-SANDBOX",
                "CMD-WATER-RITE",
                "CMD-WATER-RITE",
                "MEM-RESONATOR",
                "MEM-CACHE",
            ]
        )
    if archetype == DeckArchetype.WIND:
        return _deck_from_ids(
            [
                "AI-WIND-1",
                "AI-WIND-1B",
                "AI-WIND-2",
                "AI-WIND-2B",
                "AI-WIND-3",
                "AI-WIND-3B",
                "AI-WIND-4",
                "AI-WIND-4B",
                "AI-WIND-1",
                "AI-WIND-1B",
                "AI-WIND-2B",
                "AI-WIND-3",
                "AI-WIND-3B",
                "AI-WIND-2C",
                "CMD-DISRUPT",
                "CMD-SANDBOX",
                "CMD-WIND-RITE",
                "CMD-WIND-RITE",
                "MEM-FIREWALL",
                "MEM-CACHE",
            ]
        )
    if archetype == DeckArchetype.EARTH:
        return _deck_from_ids(
            [
                "AI-EARTH-1",
                "AI-EARTH-1B",
                "AI-EARTH-2",
                "AI-EARTH-2B",
                "AI-EARTH-3",
                "AI-EARTH-3B",
                "AI-EARTH-4",
                "AI-EARTH-4B",
                "AI-EARTH-1",
                "AI-EARTH-1B",
                "AI-EARTH-2",
                "AI-EARTH-2B",
                "AI-EARTH-2C",
                "AI-EARTH-3",
                "CMD-SANDBOX",
                "CMD-PATCH",
                "CMD-EARTH-RITE",
                "CMD-OPTIMIZE",
                "MEM-CACHE",
                "MEM-PIPELINE",
            ]
        )
    if archetype == DeckArchetype.APEX:
        return _deck_from_ids(
            [
                "AI-FIRE-2B",
                "AI-FIRE-2B",
                "AI-FIRE-3B",
                "AI-FIRE-3B",
                "AI-FIRE-4",
                "AI-WATER-2",
                "AI-WATER-2B",
                "AI-WATER-2B",
                "AI-WATER-3B",
                "AI-WIND-2B",
                "AI-WIND-3",
                "AI-WIND-3B",
                "AI-EARTH-2",
                "AI-EARTH-4",
                "CMD-DISRUPT",
                "CMD-SANDBOX",
                "CMD-FIRE-RITE",
                "CMD-WATER-RITE",
                "MEM-CACHE",
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
