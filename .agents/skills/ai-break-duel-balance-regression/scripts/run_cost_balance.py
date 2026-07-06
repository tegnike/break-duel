#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from random import Random
from statistics import mean, median
from typing import Any, get_args

REPO_ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(REPO_ROOT))

from ai_break_duel import ai as ai_module
from ai_break_duel import engine as engine_module
from ai_break_duel.ai import choose_action
from ai_break_duel.cards import CARD_BY_ID, Card, CardType, DeckArchetype, build_deck
from ai_break_duel.engine import (
    apply_action,
    end_turn,
    finish_if_turn_limit_reached,
    result_summary,
    start_turn,
)
from ai_break_duel.models import (
    Action,
    ActionType,
    AiProfile,
    GameConfig,
    GameState,
    PlayerState,
)


AI_PROFILE_CHOICES = list(get_args(AiProfile))
COMEBACK_MEMORY_EFFECT = "recovery_cache"
COMEBACK_MEMORY_CARD = Card(
    id="MEM-RECOVERY-CACHE",
    name="Recovery Cache",
    type=CardType.MEMORY,
    effect=COMEBACK_MEMORY_EFFECT,
)


POWER_CARD_IDS: dict[int, tuple[str, ...]] = {
    1: (
        "AI-FIRE-1",
        "AI-FIRE-1B",
        "AI-FIRE-1C",
        "AI-WATER-1",
        "AI-WATER-1B",
        "AI-WATER-1C",
        "AI-WIND-1",
        "AI-WIND-1B",
        "AI-EARTH-1",
        "AI-EARTH-1B",
    ),
    2: (
        "AI-FIRE-2",
        "AI-FIRE-2B",
        "AI-WATER-2",
        "AI-WATER-2B",
        "AI-WIND-2",
        "AI-WIND-2B",
        "AI-WIND-2C",
        "AI-EARTH-2",
        "AI-EARTH-2B",
        "AI-EARTH-2C",
    ),
    3: (
        "AI-FIRE-3",
        "AI-FIRE-3B",
        "AI-WATER-3",
        "AI-WATER-3B",
        "AI-WIND-3",
        "AI-WIND-3B",
        "AI-EARTH-3",
        "AI-EARTH-3B",
    ),
    4: (
        "AI-FIRE-4",
        "AI-FIRE-4B",
        "AI-WATER-4",
        "AI-WATER-4B",
        "AI-WIND-4",
        "AI-WIND-4B",
        "AI-EARTH-4",
        "AI-EARTH-4B",
    ),
}

LOW_COST_CARD_IDS = (
    "AI-FIRE-1",
    "AI-FIRE-1B",
    "AI-FIRE-1C",
    "AI-FIRE-2",
    "AI-FIRE-2B",
    "AI-WATER-1",
    "AI-WATER-1B",
    "AI-WATER-1C",
    "AI-WATER-2",
    "AI-WATER-2B",
    "AI-WIND-1",
    "AI-WIND-1B",
    "AI-WIND-2",
    "AI-WIND-2B",
    "AI-WIND-2C",
    "AI-EARTH-1",
    "AI-EARTH-1B",
    "AI-EARTH-2",
    "AI-EARTH-2B",
    "AI-EARTH-2C",
    "AI-FIRE-1",
    "AI-WATER-1",
    "AI-WIND-1",
    "AI-EARTH-1",
)

MID_COST_CARD_IDS = (
    "AI-FIRE-3",
    "AI-FIRE-3B",
    "AI-WATER-3",
    "AI-WATER-3B",
    "AI-WIND-3",
    "AI-WIND-3B",
    "AI-EARTH-3",
    "AI-EARTH-3B",
    "AI-FIRE-2",
    "AI-FIRE-2B",
    "AI-WATER-2",
    "AI-WATER-2B",
    "AI-WIND-2",
    "AI-WIND-2B",
    "AI-WIND-2C",
    "AI-EARTH-2",
    "AI-EARTH-2B",
    "AI-EARTH-2C",
    "AI-FIRE-2",
    "AI-WATER-2",
)

HIGH_COST_CARD_IDS = (
    "AI-FIRE-3",
    "AI-FIRE-3B",
    "AI-FIRE-4",
    "AI-FIRE-4B",
    "AI-WATER-3",
    "AI-WATER-3B",
    "AI-WATER-4",
    "AI-WATER-4B",
    "AI-WIND-3",
    "AI-WIND-3B",
    "AI-WIND-4",
    "AI-WIND-4B",
    "AI-EARTH-3",
    "AI-EARTH-3B",
    "AI-EARTH-4",
    "AI-EARTH-4B",
    "AI-FIRE-3",
    "AI-WATER-3",
    "AI-WIND-3",
    "AI-EARTH-3",
)

SUPPORT_CARD_IDS = (
    "CMD-DISRUPT",
    "CMD-SANDBOX",
    "CMD-TRINITY",
    "CMD-OPTIMIZE",
    "MEM-CACHE",
    "MEM-FIREWALL",
)
FILLER_SUMMON_CARD_IDS = POWER_CARD_IDS[2] + POWER_CARD_IDS[1]

EXISTING_DECKS = (
    DeckArchetype.BREAK,
    DeckArchetype.CONTROL,
    DeckArchetype.FIRE,
    DeckArchetype.WATER,
    DeckArchetype.WIND,
    DeckArchetype.EARTH,
)

CANDIDATES: dict[str, tuple[str, tuple[str, ...]]] = {
    "p1": ("power 1 stress deck", POWER_CARD_IDS[1] * 3),
    "p2": ("power 2 stress deck", POWER_CARD_IDS[2] * 3),
    "p3": (
        "power 3 cap stress deck; low-power filler may be added",
        POWER_CARD_IDS[3] * 3,
    ),
    "p4": (
        "power 4 cap stress deck; low-power filler may be added",
        POWER_CARD_IDS[4] * 3,
    ),
    "p1_2": ("power 1-2 stress deck", LOW_COST_CARD_IDS),
    "p2_3": (
        "power 2-3 stress deck; high-power cap may add filler",
        MID_COST_CARD_IDS,
    ),
    "p3_4": (
        "power 3-4 cap stress deck; low-power filler may be added",
        HIGH_COST_CARD_IDS,
    ),
}


@dataclass(frozen=True)
class EvalConfig:
    games_per_order: int
    seed: int
    max_turns: int
    rule_set: str
    first_ai: AiProfile
    second_ai: AiProfile


@dataclass(frozen=True)
class DeckRuleSet:
    label: str
    life: int | None = None
    field_ai_limit: int | None = None
    hand_defense_limit_per_turn: int | None = None
    hand_defense_requires_empty_field: bool = False
    successful_defense_discards_both: bool = True
    exact_upgrade_step: bool = False
    max_power_3_summons: int | None = None
    max_high_power_summons: int | None = None
    large_ai_play_cost: int | None = None
    large_ai_upgrade_cost: int | None = None
    power_3_enters_spent: bool = False
    power_3_play_cost: int | None = None
    power_4_play_cost: int | None = None
    power_3_discards_on_play: bool = False
    power_3_cannot_hand_defend: bool = False
    power_3_cannot_field_defend: bool = False
    power_3_defense_modifier: int = 0
    power_3_overheats_after_attack: bool = False
    power_3_attack_recovery_delay: bool | None = None
    power_4_enters_spent: bool = False
    power_4_overheats_after_attack: bool = True
    summon_cost_equals_power: bool = False
    upgrade_cost_equals_power_delta: bool = False
    empty_field_first_play_discount: bool = False
    include_comeback_memory: bool = False
    comeback_memory_first_play_discount: bool = False


RULE_SETS: dict[str, DeckRuleSet] = {
    # 2026-07-03 改訂の現行構築ルール: 25枚デッキ / power 3+ は 5 枚まで
    "current": DeckRuleSet("current high-power cap 5", max_high_power_summons=5),
    "proposed_action_cost": DeckRuleSet(
        "summon cost equals power; upgrade cost equals target minus source power",
        max_high_power_summons=4,
        summon_cost_equals_power=True,
        upgrade_cost_equals_power_delta=True,
    ),
    "proposed_action_cost_empty_field_discount": DeckRuleSet(
        "summon cost equals power; upgrade cost equals target minus source power; first summon from empty field costs 1 less",
        max_high_power_summons=4,
        summon_cost_equals_power=True,
        upgrade_cost_equals_power_delta=True,
        empty_field_first_play_discount=True,
    ),
    "proposed_action_cost_comeback_memory": DeckRuleSet(
        "summon cost equals power; upgrade cost equals target minus source power; decks replace one relic with a life-behind first-summon discount relic",
        max_high_power_summons=4,
        summon_cost_equals_power=True,
        upgrade_cost_equals_power_delta=True,
        include_comeback_memory=True,
        comeback_memory_first_play_discount=True,
    ),
    "high_direct_3_upgrade_1": DeckRuleSet(
        "power 3/4 cost 3 directly and cost 1 by upgrade",
        large_ai_play_cost=3,
        large_ai_upgrade_cost=1,
    ),
    "large_cost_3": DeckRuleSet(
        "power 3/4 direct cost 3; upgrade uses normal cost minus 1",
        large_ai_play_cost=3,
    ),
    "large_enters_spent": DeckRuleSet(
        "power 3/4 summons enter spent",
        power_3_enters_spent=True,
        power_4_enters_spent=True,
    ),
    "large_cost_3_enters_spent": DeckRuleSet(
        "power 3/4 direct cost 3 and enter spent",
        large_ai_play_cost=3,
        power_3_enters_spent=True,
        power_4_enters_spent=True,
    ),
    "exact_upgrade_step": DeckRuleSet(
        "upgrades must advance exactly one power step",
        exact_upgrade_step=True,
    ),
    "large_cost_3_exact_upgrade": DeckRuleSet(
        "power 3/4 direct cost 3 and upgrades advance exactly one step",
        large_ai_play_cost=3,
        exact_upgrade_step=True,
    ),
    "large_cost_3_exact_upgrade_enters_spent": DeckRuleSet(
        "power 3/4 direct cost 3, exact-step upgrades, and enter spent",
        large_ai_play_cost=3,
        exact_upgrade_step=True,
        power_3_enters_spent=True,
        power_4_enters_spent=True,
    ),
    "field_limit_2": DeckRuleSet(
        "field summon limit 2",
        field_ai_limit=2,
    ),
    "life_6": DeckRuleSet(
        "starting life 6",
        life=6,
    ),
    "life_7": DeckRuleSet(
        "starting life 7",
        life=7,
    ),
    "hand_defense_empty_only": DeckRuleSet(
        "hand defense requires an empty field",
        hand_defense_requires_empty_field=True,
    ),
    "hand_defense_0": DeckRuleSet(
        "hand defense disabled",
        hand_defense_limit_per_turn=0,
    ),
    "field_limit_2_large_cost_3": DeckRuleSet(
        "field summon limit 2 and power 3/4 direct cost 3",
        field_ai_limit=2,
        large_ai_play_cost=3,
    ),
    "life_6_large_cost_3": DeckRuleSet(
        "starting life 6 and power 3/4 direct cost 3",
        life=6,
        large_ai_play_cost=3,
    ),
    "life_6_field_limit_2": DeckRuleSet(
        "starting life 6 and field summon limit 2",
        life=6,
        field_ai_limit=2,
    ),
    "life_6_field_limit_2_large_cost_3": DeckRuleSet(
        "starting life 6, field summon limit 2, and power 3/4 direct cost 3",
        life=6,
        field_ai_limit=2,
        large_ai_play_cost=3,
    ),
    "p3_cap_6": DeckRuleSet("power 3 summons max 6", max_power_3_summons=6),
    "p3_cap_4": DeckRuleSet("power 3 summons max 4", max_power_3_summons=4),
    "p3_cap_2": DeckRuleSet("power 3 summons max 2", max_power_3_summons=2),
    "p3_cap_1": DeckRuleSet("power 3 summons max 1", max_power_3_summons=1),
    "high_cap_6": DeckRuleSet("power 3+ summons max 6", max_high_power_summons=6),
    "high_cap_4": DeckRuleSet("power 3+ summons max 4", max_high_power_summons=4),
    "high_cap_3": DeckRuleSet("power 3+ summons max 3", max_high_power_summons=3),
    "high_cap_2": DeckRuleSet("power 3+ summons max 2", max_high_power_summons=2),
    "high_cap_1": DeckRuleSet("power 3+ summons max 1", max_high_power_summons=1),
    "high_cap_7": DeckRuleSet("power 3+ summons max 7", max_high_power_summons=7),
    "high_cap_8": DeckRuleSet("power 3+ summons max 8", max_high_power_summons=8),
    "high_cap_9": DeckRuleSet("power 3+ summons max 9", max_high_power_summons=9),
    "high_cap_10": DeckRuleSet("power 3+ summons max 10", max_high_power_summons=10),
    "high_cap_12": DeckRuleSet("power 3+ summons max 12", max_high_power_summons=12),
    "high_cap_14": DeckRuleSet("power 3+ summons max 14", max_high_power_summons=14),
    "high_cap_16": DeckRuleSet("power 3+ summons max 16", max_high_power_summons=16),
    "high_cap_19": DeckRuleSet("power 3+ summons max 19 (no cap in effect)", max_high_power_summons=19),
    "high_cap_2_p4_cost_1": DeckRuleSet(
        "power 3+ summons max 2 and power 4 costs 1",
        max_high_power_summons=2,
        power_4_play_cost=1,
    ),
    "high_cap_2_p4_no_overheat": DeckRuleSet(
        "power 3+ summons max 2 and power 4 does not overheat",
        max_high_power_summons=2,
        power_4_overheats_after_attack=False,
    ),
    "high_cap_2_p4_cost_1_no_overheat": DeckRuleSet(
        "power 3+ summons max 2, power 4 costs 1, and power 4 does not overheat",
        max_high_power_summons=2,
        power_4_play_cost=1,
        power_4_overheats_after_attack=False,
    ),
    "high_cap_3_p4_no_overheat": DeckRuleSet(
        "power 3+ summons max 3 and power 4 does not overheat",
        max_high_power_summons=3,
        power_4_overheats_after_attack=False,
    ),
    "high_cap_4_p4_cost_1": DeckRuleSet(
        "power 3+ summons max 4 and power 4 costs 1",
        max_high_power_summons=4,
        power_4_play_cost=1,
    ),
    "high_cap_4_p4_no_overheat": DeckRuleSet(
        "power 3+ summons max 4 and power 4 does not overheat",
        max_high_power_summons=4,
        power_4_overheats_after_attack=False,
    ),
    "high_cap_4_p4_cost_1_no_overheat": DeckRuleSet(
        "power 3+ summons max 4, power 4 costs 1, and power 4 does not overheat",
        max_high_power_summons=4,
        power_4_play_cost=1,
        power_4_overheats_after_attack=False,
    ),
    "high_cap_6_p4_no_overheat": DeckRuleSet(
        "power 3+ summons max 6 and power 4 does not overheat",
        max_high_power_summons=6,
        power_4_overheats_after_attack=False,
    ),
    "high_cap_4_hand_defense_empty_only": DeckRuleSet(
        "power 3+ summons max 4 and hand defense requires empty field",
        max_high_power_summons=4,
        hand_defense_requires_empty_field=True,
    ),
    "high_cap_4_large_enters_spent": DeckRuleSet(
        "power 3+ summons max 4 and power 3/4 enter spent",
        max_high_power_summons=4,
        power_3_enters_spent=True,
        power_4_enters_spent=True,
    ),
    "high_cap_4_large_cost_3": DeckRuleSet(
        "power 3+ summons max 4 and power 3/4 direct cost 3",
        max_high_power_summons=4,
        large_ai_play_cost=3,
    ),
    "high_cap_4_p3_slow_recovery": DeckRuleSet(
        "power 3+ summons max 4 and power 3 recovers slowly after attacking",
        max_high_power_summons=4,
        power_3_attack_recovery_delay=True,
    ),
    "high_cap_4_p3_slow_recovery_exact_upgrade": DeckRuleSet(
        "power 3+ summons max 4, power 3 recovers slowly, and upgrades advance exactly one step",
        max_high_power_summons=4,
        power_3_attack_recovery_delay=True,
        exact_upgrade_step=True,
    ),
    "large_cost_3_p3_slow_recovery": DeckRuleSet(
        "power 3/4 direct cost 3 and power 3 recovers slowly after attacking",
        large_ai_play_cost=3,
        power_3_attack_recovery_delay=True,
    ),
    "high_cap_4_field_limit_2": DeckRuleSet(
        "power 3+ summons max 4 and field summon limit 2",
        max_high_power_summons=4,
        field_ai_limit=2,
    ),
    "high_cap_4_life_6": DeckRuleSet(
        "power 3+ summons max 4 and starting life 6",
        max_high_power_summons=4,
        life=6,
    ),
    "high_cap_3_p4_cost_1": DeckRuleSet(
        "power 3+ summons max 3 and power 4 costs 1",
        max_high_power_summons=3,
        power_4_play_cost=1,
    ),
    "high_cap_3_hand_defense_empty_only": DeckRuleSet(
        "power 3+ summons max 3 and hand defense requires empty field",
        max_high_power_summons=3,
        hand_defense_requires_empty_field=True,
    ),
    "p3_cap_2_high_cap_4": DeckRuleSet(
        "power 3 summons max 2 and power 3+ summons max 4",
        max_power_3_summons=2,
        max_high_power_summons=4,
    ),
    "p3_cap_2_p4_cost_1": DeckRuleSet(
        "power 3 summons max 2 and power 4 summons cost 1 action",
        max_power_3_summons=2,
        power_4_play_cost=1,
    ),
    "p3_cap_2_defense_minus_1": DeckRuleSet(
        "power 3 summons max 2 and get -1 defense value",
        max_power_3_summons=2,
        power_3_defense_modifier=-1,
    ),
    "p3_cap_2_p4_cost_1_defense_minus_1": DeckRuleSet(
        "power 3 summons max 2 and get -1 defense value; power 4 costs 1",
        max_power_3_summons=2,
        power_3_defense_modifier=-1,
        power_4_play_cost=1,
    ),
    "p3_cap_2_high_cap_6": DeckRuleSet(
        "power 3 summons max 2 and power 3+ summons max 6",
        max_power_3_summons=2,
        max_high_power_summons=6,
    ),
    "p3_cap_2_high_cap_6_p4_cost_1": DeckRuleSet(
        "power 3 summons max 2, power 3+ max 6, and power 4 costs 1",
        max_power_3_summons=2,
        max_high_power_summons=6,
        power_4_play_cost=1,
    ),
    "p3_cap_1_high_cap_4": DeckRuleSet(
        "power 3 summons max 1 and power 3+ summons max 4",
        max_power_3_summons=1,
        max_high_power_summons=4,
    ),
    "p3_cap_1_high_cap_6": DeckRuleSet(
        "power 3 summons max 1 and power 3+ summons max 6",
        max_power_3_summons=1,
        max_high_power_summons=6,
    ),
    "p3_enters_spent": DeckRuleSet(
        "power 3 summons enter spent",
        power_3_enters_spent=True,
    ),
    "p3_slow_recovery": DeckRuleSet(
        "power 3 summons stay spent through their next ready step after attacking",
        power_3_attack_recovery_delay=True,
    ),
    "p3_slow_recovery_exact_upgrade": DeckRuleSet(
        "power 3 summons recover slowly after attacking and upgrades must advance exactly one step",
        power_3_attack_recovery_delay=True,
        exact_upgrade_step=True,
    ),
    "p3_cost_3": DeckRuleSet(
        "power 3 summons cost 3 actions",
        power_3_play_cost=3,
    ),
    "p4_cost_1": DeckRuleSet(
        "power 4 summons cost 1 action",
        power_4_play_cost=1,
    ),
    "p3_cost_3_p4_cost_1": DeckRuleSet(
        "power 3 summons cost 3 actions and power 4 summons cost 1 action",
        power_3_play_cost=3,
        power_4_play_cost=1,
    ),
    "p3_cost_3_overheats": DeckRuleSet(
        "power 3 summons cost 3 actions and overheat after attacking",
        power_3_play_cost=3,
        power_3_overheats_after_attack=True,
    ),
    "p3_cost_3_overheats_p4_cost_1": DeckRuleSet(
        "power 3 summons cost 3 actions and overheat; power 4 costs 1",
        power_3_play_cost=3,
        power_3_overheats_after_attack=True,
        power_4_play_cost=1,
    ),
    "p3_cost_3_overheats_p4_no_overheat": DeckRuleSet(
        "power 3 summons cost 3 actions and overheat; power 4 does not",
        power_3_play_cost=3,
        power_3_overheats_after_attack=True,
        power_4_overheats_after_attack=False,
    ),
    "p3_defense_minus_1": DeckRuleSet(
        "power 3 summons get -1 defense value",
        power_3_defense_modifier=-1,
    ),
    "p3_no_field_defend": DeckRuleSet(
        "power 3 summons cannot field defend",
        power_3_cannot_field_defend=True,
    ),
    "p3_no_defend": DeckRuleSet(
        "power 3 summons cannot field defend or hand defend",
        power_3_cannot_field_defend=True,
        power_3_cannot_hand_defend=True,
    ),
    "p3_cost_3_defense_minus_1": DeckRuleSet(
        "power 3 summons cost 3 actions and get -1 defense value",
        power_3_play_cost=3,
        power_3_defense_modifier=-1,
    ),
    "p3_cost_3_no_defend": DeckRuleSet(
        "power 3 summons cost 3 actions and cannot defend",
        power_3_play_cost=3,
        power_3_cannot_field_defend=True,
        power_3_cannot_hand_defend=True,
    ),
    "p3_cost_3_p4_cost_1_defense_minus_1": DeckRuleSet(
        "power 3 summons cost 3 actions and get -1 defense value; power 4 costs 1",
        power_3_play_cost=3,
        power_3_defense_modifier=-1,
        power_4_play_cost=1,
    ),
    "p3_cost_3_p4_cost_1_no_defend": DeckRuleSet(
        "power 3 summons cost 3 actions and cannot defend; power 4 costs 1",
        power_3_play_cost=3,
        power_3_cannot_field_defend=True,
        power_3_cannot_hand_defend=True,
        power_4_play_cost=1,
    ),
    "p3_overheats": DeckRuleSet(
        "power 3 summons overheat after attacking",
        power_3_overheats_after_attack=True,
    ),
    "p3_discards_on_play": DeckRuleSet(
        "power 3 summons discard 1 card on play",
        power_3_discards_on_play=True,
    ),
    "p3_cannot_hand_defend": DeckRuleSet(
        "power 3 summons cannot hand defend",
        power_3_cannot_hand_defend=True,
    ),
    "p4_no_overheat": DeckRuleSet(
        "power 4 summons do not overheat after attacking",
        power_4_overheats_after_attack=False,
    ),
    "p3_discards_on_play_p4_no_overheat": DeckRuleSet(
        "power 3 summons discard 1 card on play and power 4 summons do not overheat",
        power_3_discards_on_play=True,
        power_4_overheats_after_attack=False,
    ),
    "p3_overheats_p4_no_overheat": DeckRuleSet(
        "power 3 summons overheat after attacking and power 4 summons do not",
        power_3_overheats_after_attack=True,
        power_4_overheats_after_attack=False,
    ),
    "p3_cap_2_cost_3": DeckRuleSet(
        "power 3 summons max 2 and cost 3 actions",
        max_power_3_summons=2,
        power_3_play_cost=3,
    ),
    "p3_cap_2_high_cap_4_cost_3": DeckRuleSet(
        "power 3 summons max 2, power 3+ summons max 4, and power 3 costs 3 actions",
        max_power_3_summons=2,
        max_high_power_summons=4,
        power_3_play_cost=3,
    ),
}


# 2026-07-03 改訂に合わせたストレスデッキの召喚獣枚数。
# 25枚デッキ = 召喚獣 19 枚 + サポート 6 枚（SUPPORT_CARD_IDS）。
STRESS_DECK_SUMMON_COUNT = 25 - len(SUPPORT_CARD_IDS)


def stress_deck_cards(card_ids: tuple[str, ...], rule_set: DeckRuleSet) -> tuple[str, ...]:
    summon_ids: list[str] = []
    high_power_counts: Counter[str] = Counter()
    low_power_counts: Counter[str] = Counter()
    power_3_count = 0
    high_power_count = 0
    for card_id in (*card_ids, *FILLER_SUMMON_CARD_IDS):
        card = CARD_BY_ID[card_id]
        if (card.power or 0) >= 3:
            # 現行構築ルールと同じく同名 2 枚まで許容しつつ、power 3+ の総数上限を守る
            if high_power_counts[card_id] >= 2:
                continue
            if (
                card.power == 3
                and rule_set.max_power_3_summons is not None
                and power_3_count >= rule_set.max_power_3_summons
            ):
                continue
            if (
                rule_set.max_high_power_summons is not None
                and high_power_count >= rule_set.max_high_power_summons
            ):
                continue
            high_power_counts[card_id] += 1
            high_power_count += 1
            if card.power == 3:
                power_3_count += 1
        else:
            if low_power_counts[card_id] >= 2:
                continue
            low_power_counts[card_id] += 1
        summon_ids.append(card_id)
        if len(summon_ids) == STRESS_DECK_SUMMON_COUNT:
            return tuple(summon_ids) + SUPPORT_CARD_IDS
    raise ValueError(
        f"Unable to build a {STRESS_DECK_SUMMON_COUNT} summon stress deck."
    )


def cards_from_ids(card_ids: tuple[str, ...]):
    return [CARD_BY_ID[card_id] for card_id in card_ids]


def add_comeback_memory(deck: list[Card], rule_set: DeckRuleSet) -> list[Card]:
    if not rule_set.include_comeback_memory:
        return deck
    result = list(deck)
    memory_indexes = [
        index for index, card in enumerate(result) if card.type == CardType.MEMORY
    ]
    if not memory_indexes:
        raise ValueError("Comeback memory experiment requires a relic slot.")
    result[memory_indexes[-1]] = COMEBACK_MEMORY_CARD
    return result


def deck_ids(deck: list[Card]) -> list[str]:
    return [card.id for card in deck]


def game_config_for_rule_set(
    rule_set: DeckRuleSet,
    eval_config: EvalConfig,
) -> GameConfig:
    return GameConfig(
        max_turns=eval_config.max_turns,
        ai_profiles=(eval_config.first_ai, eval_config.second_ai),
        life=rule_set.life if rule_set.life is not None else GameConfig().life,
        field_ai_limit=(
            rule_set.field_ai_limit
            if rule_set.field_ai_limit is not None
            else GameConfig().field_ai_limit
        ),
        hand_defense_limit_per_turn=(
            rule_set.hand_defense_limit_per_turn
            if rule_set.hand_defense_limit_per_turn is not None
            else GameConfig().hand_defense_limit_per_turn
        ),
        hand_defense_requires_empty_field=rule_set.hand_defense_requires_empty_field,
        successful_defense_discards_both=rule_set.successful_defense_discards_both,
        exact_upgrade_step=rule_set.exact_upgrade_step,
        large_ai_play_cost=(
            rule_set.large_ai_play_cost
            if rule_set.large_ai_play_cost is not None
            else GameConfig().large_ai_play_cost
        ),
        large_ai_upgrade_cost=rule_set.large_ai_upgrade_cost,
        power_3_enters_spent=rule_set.power_3_enters_spent,
        power_3_play_cost=rule_set.power_3_play_cost,
        power_4_play_cost=rule_set.power_4_play_cost,
        power_3_discards_on_play=rule_set.power_3_discards_on_play,
        power_3_cannot_hand_defend=rule_set.power_3_cannot_hand_defend,
        power_3_cannot_field_defend=rule_set.power_3_cannot_field_defend,
        power_3_defense_modifier=rule_set.power_3_defense_modifier,
        power_3_overheats_after_attack=rule_set.power_3_overheats_after_attack,
        power_3_attack_recovery_delay=(
            rule_set.power_3_attack_recovery_delay
            if rule_set.power_3_attack_recovery_delay is not None
            else GameConfig().power_3_attack_recovery_delay
        ),
        power_4_enters_spent=rule_set.power_4_enters_spent,
        power_4_overheats_after_attack=rule_set.power_4_overheats_after_attack,
    )


def has_played_ai_this_turn(state: GameState) -> bool:
    active_player_name = state.active().name
    return any(
        entry.get("turn") == state.turn
        and entry.get("active_player") == active_player_name
        and entry.get("action_type") == ActionType.PLAY_AI.value
        for entry in state.log
    )


def comeback_memory_is_active(state: GameState, rule_set: DeckRuleSet) -> bool:
    player = state.active()
    opponent = state.opponent()
    return (
        rule_set.comeback_memory_first_play_discount
        and player.memory is not None
        and player.memory.effect == COMEBACK_MEMORY_EFFECT
        and player.life < opponent.life
        and not has_played_ai_this_turn(state)
    )


def proposed_play_cost(
    card,
    state: GameState | None = None,
    rule_set: DeckRuleSet | None = None,
) -> int:
    if card.type == CardType.AI:
        base_cost = int(card.power or 1)
        if (
            state is not None
            and rule_set is not None
            and rule_set.empty_field_first_play_discount
            and not state.active().field_ai
            and not has_played_ai_this_turn(state)
        ):
            return max(1, base_cost - 1)
        if (
            state is not None
            and rule_set is not None
            and comeback_memory_is_active(state, rule_set)
        ):
            return max(1, base_cost - 1)
        return base_cost
    return 1


def proposed_upgrade_cost(source, target) -> int:
    return max(1, int(target.power or 1) - int(source.power or 0))


def proposed_action_cost(
    state: GameState,
    action,
    rule_set: DeckRuleSet | None = None,
) -> int:
    if action.type == ActionType.PLAY_AI:
        if action.source_index is None:
            raise ValueError(f"{action.type.value} requires a hand index.")
        return proposed_play_cost(
            state.active().hand[action.source_index],
            state,
            rule_set,
        )
    if action.type == ActionType.UPGRADE_AI:
        if action.source_index is None or action.target_index is None:
            raise ValueError(f"{action.type.value} requires hand and field indexes.")
        source = state.active().field_ai[action.target_index]
        target = state.active().hand[action.source_index]
        return proposed_upgrade_cost(source, target)
    if action.type in {ActionType.USE_MEMORY, ActionType.CHARGE}:
        return 0
    return 1


def proposed_legal_actions(state: GameState, rule_set: DeckRuleSet | None = None):
    player = state.active()
    actions = []

    if ai_module.can_use_charge(state):
        actions.extend(
            Action(ActionType.CHARGE, index)
            for index, card in enumerate(player.hand)
            if ai_module._can_charge_card(card)
        )

    if state.actions_remaining > 0:
        if len(player.field_ai) < state.config.field_ai_limit:
            actions.extend(
                Action(ActionType.PLAY_AI, index)
                for index, card in enumerate(player.hand)
                if card.type == CardType.AI
                and proposed_play_cost(card, state, rule_set) <= state.actions_remaining
            )

        actions.extend(
            Action(ActionType.PLAY_MEMORY, index)
            for index, card in enumerate(player.hand)
            if card.type == CardType.MEMORY
        )

        if ai_module._can_use_accelerator_memory(state):
            actions.extend(
                Action(ActionType.USE_MEMORY, target_index=index)
                for index, _ in enumerate(player.field_ai)
            )

        for hand_index, target in enumerate(player.hand):
            if target.type != CardType.AI:
                continue
            for field_index, source in enumerate(player.field_ai):
                if not ai_module._can_upgrade_with_config(state, source, target):
                    continue
                if proposed_upgrade_cost(source, target) <= state.actions_remaining:
                    actions.append(
                        Action(
                            ActionType.UPGRADE_AI,
                            hand_index,
                            field_index,
                        )
                    )

        actions.extend(
            Action(ActionType.USE_COMMAND, index)
            for index, card in enumerate(player.hand)
            if card.type == CardType.EVENT and ai_module._command_is_usable(state, index)
        )

        if ai_module._can_active_player_attack(state):
            actions.extend(
                Action(ActionType.ATTACK, index)
                for index, _ in ai_module._attackable_field_ai(player)
            )

    actions.append(Action(ActionType.END_TURN))
    return actions


def proposed_best_upgrade(player: PlayerState, state: GameState) -> tuple[int, int] | None:
    candidates = []
    for hand_index, target in enumerate(player.hand):
        if target.type != CardType.AI:
            continue
        for field_index, source in enumerate(player.field_ai):
            if not ai_module._can_upgrade_with_config(state, source, target):
                continue
            if proposed_upgrade_cost(source, target) <= state.actions_remaining:
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


def experimental_memory_value(card, original_memory_value) -> int:
    if card.effect == COMEBACK_MEMORY_EFFECT:
        return 42
    return original_memory_value(card)


def experimental_best_memory_in_hand(player: PlayerState) -> int | None:
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
        "cache": 4,
        COMEBACK_MEMORY_EFFECT: 4,
        "pipeline": 3,
        "accelerator": 3,
        "firewall": 2,
        "resonator": 3,
    }
    return max(
        candidates,
        key=lambda item: (priority.get(item[1].effect, 0), item[1].id),
    )[0]


@contextmanager
def action_cost_rule_patch(rule_set: DeckRuleSet):
    if not (
        rule_set.summon_cost_equals_power
        and rule_set.upgrade_cost_equals_power_delta
    ):
        yield
        return

    original_engine_action_cost = engine_module._action_cost
    original_engine_play_cost = engine_module._play_cost
    original_ai_play_cost = ai_module._play_cost
    original_ai_legal_actions = ai_module._legal_actions
    original_ai_best_upgrade = ai_module._best_upgrade
    original_ai_memory_value = ai_module._memory_value
    original_ai_best_memory = ai_module._best_memory_in_hand
    engine_module._action_cost = lambda state, action: proposed_action_cost(
        state,
        action,
        rule_set,
    )
    engine_module._play_cost = lambda state, card: proposed_play_cost(
        card,
        state,
        rule_set,
    )
    ai_module._play_cost = lambda card, state: proposed_play_cost(
        card,
        state,
        rule_set,
    )
    ai_module._legal_actions = lambda state: proposed_legal_actions(state, rule_set)
    ai_module._best_upgrade = proposed_best_upgrade
    ai_module._memory_value = lambda card: experimental_memory_value(
        card,
        original_ai_memory_value,
    )
    ai_module._best_memory_in_hand = experimental_best_memory_in_hand
    try:
        yield
    finally:
        engine_module._action_cost = original_engine_action_cost
        engine_module._play_cost = original_engine_play_cost
        ai_module._play_cost = original_ai_play_cost
        ai_module._legal_actions = original_ai_legal_actions
        ai_module._best_upgrade = original_ai_best_upgrade
        ai_module._memory_value = original_ai_memory_value
        ai_module._best_memory_in_hand = original_ai_best_memory


def new_custom_game(seed: int, first_deck, second_deck, config: GameConfig) -> GameState:
    rng = Random(seed)
    players = [
        PlayerState(name="player_1", life=config.life),
        PlayerState(name="player_2", life=config.life),
    ]
    for index, (player, source_deck) in enumerate(zip(players, (first_deck, second_deck))):
        deck = list(source_deck)
        rng.shuffle(deck)
        player.deck = deck
        initial_hand = (
            config.first_player_initial_hand
            if index == 0
            else config.second_player_initial_hand
        )
        player.draw(initial_hand or config.initial_hand, rng)
    state = GameState(seed=seed, rng=rng, players=players, config=config)
    state.log.append({"event": "setup", "seed": seed})
    return state


def run_match(seed: int, first_deck, second_deck, config: GameConfig) -> dict[str, Any]:
    state = new_custom_game(seed, first_deck, second_deck, config)
    while state.winner is None and not state.draw:
        start_turn(state)
        while state.actions_remaining > 0 and state.winner is None and not state.draw:
            apply_action(state, choose_action(state))
        if state.winner is None and not state.draw:
            end_turn(state)
            finish_if_turn_limit_reached(state)
    return result_summary(state)


def evaluate_candidate(
    candidate_key: str,
    card_ids: tuple[str, ...],
    eval_config: EvalConfig,
) -> dict[str, Any]:
    rule_set = RULE_SETS[eval_config.rule_set]
    config = game_config_for_rule_set(rule_set, eval_config)
    candidate_ids = stress_deck_cards(card_ids, rule_set)
    candidate_deck = add_comeback_memory(cards_from_ids(candidate_ids), rule_set)
    current_seed = eval_config.seed
    wins = Counter()
    first_player_wins = 0
    decisive_games = 0
    one_sided_games = 0
    terminal_events = Counter()
    per_opponent = {}
    turns = []
    life_diffs = []

    with action_cost_rule_patch(rule_set):
        for archetype in EXISTING_DECKS:
            existing_deck = add_comeback_memory(build_deck(archetype), rule_set)
            pair = Counter()
            pair_first_player_wins = 0
            pair_decisive_games = 0
            pair_one_sided_games = 0
            pair_terminal_events = Counter()
            pair_turns = []
            for candidate_is_first in (True, False):
                for _ in range(eval_config.games_per_order):
                    if candidate_is_first:
                        summary, log = run_match_with_log(
                            current_seed,
                            candidate_deck,
                            existing_deck,
                            config,
                        )
                        candidate_won = summary["winner"] == "player_1"
                    else:
                        summary, log = run_match_with_log(
                            current_seed,
                            existing_deck,
                            candidate_deck,
                            config,
                        )
                        candidate_won = summary["winner"] == "player_2"

                    terminal_event = log[-1]["event"] if log else "unknown"
                    terminal_events[terminal_event] += 1
                    pair_terminal_events[terminal_event] += 1

                    if summary["winner"] is None:
                        pair["draws"] += 1
                        wins["draws"] += 1
                    else:
                        decisive_games += 1
                        pair_decisive_games += 1
                        if summary["winner"] == "player_1":
                            first_player_wins += 1
                            pair_first_player_wins += 1
                        if max(
                            summary["player_1_final_life"],
                            summary["player_2_final_life"],
                        ) >= 4:
                            one_sided_games += 1
                            pair_one_sided_games += 1
                        if candidate_won:
                            pair["candidate_wins"] += 1
                            wins["candidate_wins"] += 1
                        else:
                            pair["existing_wins"] += 1
                            wins["existing_wins"] += 1

                    turns.append(summary["turn_count"])
                    pair_turns.append(summary["turn_count"])
                    life_diffs.append(
                        abs(
                            summary["player_1_final_life"]
                            - summary["player_2_final_life"]
                        )
                    )
                    current_seed += 1

            pair_games = sum(pair.values())
            per_opponent[archetype.value] = {
                "candidate_win_rate": pair["candidate_wins"] / pair_games,
                "candidate_wins": pair["candidate_wins"],
                "existing_wins": pair["existing_wins"],
                "draws": pair["draws"],
                "games": pair_games,
                "first_player_win_rate": (
                    pair_first_player_wins / pair_decisive_games
                    if pair_decisive_games
                    else None
                ),
                "one_sided_game_rate": (
                    pair_one_sided_games / pair_decisive_games
                    if pair_decisive_games
                    else None
                ),
                "resource_exhaustion_rate": (
                    pair_terminal_events["resource_exhaustion"] / pair_games
                ),
                "average_turns": mean(pair_turns),
            }

    total_games = sum(wins.values())
    return {
        "candidate": candidate_key,
        "rule_set": eval_config.rule_set,
        "rule_label": rule_set.label,
        "deck_ids": deck_ids(candidate_deck),
        "games": total_games,
        "candidate_win_rate": wins["candidate_wins"] / total_games,
        "existing_win_rate": wins["existing_wins"] / total_games,
        "draw_rate": wins["draws"] / total_games,
        "candidate_wins": wins["candidate_wins"],
        "existing_wins": wins["existing_wins"],
        "draws": wins["draws"],
        "first_player_win_rate": (
            first_player_wins / decisive_games if decisive_games else None
        ),
        "one_sided_game_rate": (
            one_sided_games / decisive_games if decisive_games else None
        ),
        "resource_exhaustion_rate": terminal_events["resource_exhaustion"] / total_games,
        "average_turns": mean(turns),
        "median_turns": median(turns),
        "average_life_difference": mean(life_diffs),
        "per_opponent": per_opponent,
    }


def run_match_with_log(seed: int, first_deck, second_deck, config: GameConfig):
    state = new_custom_game(seed, first_deck, second_deck, config)
    while state.winner is None and not state.draw:
        start_turn(state)
        while state.actions_remaining > 0 and state.winner is None and not state.draw:
            apply_action(state, choose_action(state))
        if state.winner is None and not state.draw:
            end_turn(state)
            finish_if_turn_limit_reached(state)
    return result_summary(state), state.log


def evaluate_existing_deck_league(eval_config: EvalConfig) -> dict[str, Any]:
    rule_set = RULE_SETS[eval_config.rule_set]
    config = game_config_for_rule_set(rule_set, eval_config)
    standings: dict[str, dict[str, int]] = {
        deck.value: {"wins": 0, "losses": 0, "draws": 0, "games": 0}
        for deck in EXISTING_DECKS
    }
    seat_rows = {
        deck.value: {
            "first_wins": 0,
            "first_losses": 0,
            "first_draws": 0,
            "second_wins": 0,
            "second_losses": 0,
            "second_draws": 0,
        }
        for deck in EXISTING_DECKS
    }
    pair_results = []
    terminal_events = Counter()
    current_seed = eval_config.seed
    summaries = []

    with action_cost_rule_patch(rule_set):
        for first in EXISTING_DECKS:
            for second in EXISTING_DECKS:
                if first == second:
                    continue
                pair_summaries = []
                pair_terminal_events = Counter()
                pair_seed = current_seed
                first_deck = add_comeback_memory(build_deck(first), rule_set)
                second_deck = add_comeback_memory(build_deck(second), rule_set)
                for _ in range(eval_config.games_per_order):
                    summary, log = run_match_with_log(
                        current_seed,
                        first_deck,
                        second_deck,
                        config,
                    )
                    current_seed += 1
                    summaries.append(summary)
                    pair_summaries.append(summary)
                    terminal_event = log[-1]["event"] if log else "unknown"
                    terminal_events[terminal_event] += 1
                    pair_terminal_events[terminal_event] += 1

                    first_row = standings[first.value]
                    second_row = standings[second.value]
                    first_row["games"] += 1
                    second_row["games"] += 1
                    if summary["winner"] == "player_1":
                        first_row["wins"] += 1
                        second_row["losses"] += 1
                        seat_rows[first.value]["first_wins"] += 1
                        seat_rows[second.value]["second_losses"] += 1
                    elif summary["winner"] == "player_2":
                        second_row["wins"] += 1
                        first_row["losses"] += 1
                        seat_rows[second.value]["second_wins"] += 1
                        seat_rows[first.value]["first_losses"] += 1
                    else:
                        first_row["draws"] += 1
                        second_row["draws"] += 1
                        seat_rows[first.value]["first_draws"] += 1
                        seat_rows[second.value]["second_draws"] += 1

                pair_results.append(
                    {
                        "first_deck": first.value,
                        "second_deck": second.value,
                        "seed": pair_seed,
                        **summarize_summaries(pair_summaries, pair_terminal_events),
                    }
                )

    return {
        "rule_set": eval_config.rule_set,
        "rule_label": rule_set.label,
        "seed": eval_config.seed,
        "games_per_ordered_pair": eval_config.games_per_order,
        "total_games": len(summaries),
        "decks": [deck.value for deck in EXISTING_DECKS],
        "overall": summarize_summaries(summaries, terminal_events),
        "standings": standings_with_rates(standings),
        "seat_split": seat_split_with_rates(seat_rows),
        "pairs": pair_results,
    }


def summarize_summaries(
    summaries: list[dict[str, Any]],
    terminal_events: Counter[str],
) -> dict[str, Any]:
    winners = Counter(summary["winner"] for summary in summaries)
    decisive = [summary for summary in summaries if not summary["draw"]]
    turns = [summary["turn_count"] for summary in summaries]
    return {
        "games": len(summaries),
        "wins": {
            player: count for player, count in winners.items() if player is not None
        },
        "draws": winners[None],
        "first_player_win_rate": winners["player_1"] / len(decisive)
        if decisive
        else None,
        "average_turns": mean(turns),
        "median_turns": median(turns),
        "average_life_difference": mean(
            abs(summary["player_1_final_life"] - summary["player_2_final_life"])
            for summary in summaries
        ),
        "average_ai_lost": mean(
            summary["player_1_ai_lost"] + summary["player_2_ai_lost"]
            for summary in summaries
        ),
        "average_cards_drawn": mean(
            summary["player_1_cards_drawn"] + summary["player_2_cards_drawn"]
            for summary in summaries
        ),
        "average_final_hand_size": mean(
            sum(summary["final_hand_sizes"]) / 2 for summary in summaries
        ),
        "one_sided_game_rate": (
            sum(
                1
                for summary in decisive
                if max(summary["player_1_final_life"], summary["player_2_final_life"])
                >= 4
            )
            / len(decisive)
            if decisive
            else None
        ),
        "resource_exhaustion_rate": (
            terminal_events["resource_exhaustion"] / len(summaries)
            if summaries
            else None
        ),
    }


def standings_with_rates(
    standings: dict[str, dict[str, int]],
) -> dict[str, dict[str, Any]]:
    rows = {}
    for deck, values in standings.items():
        decisive_games = values["wins"] + values["losses"]
        rows[deck] = {
            **values,
            "win_rate": values["wins"] / decisive_games if decisive_games else None,
        }
    return dict(
        sorted(
            rows.items(),
            key=lambda item: (-(item[1]["win_rate"] or 0), item[0]),
        )
    )


def seat_split_with_rates(rows: dict[str, dict[str, int]]) -> dict[str, dict[str, Any]]:
    result = {}
    for deck, values in rows.items():
        first_decisive = values["first_wins"] + values["first_losses"]
        second_decisive = values["second_wins"] + values["second_losses"]
        result[deck] = {
            **values,
            "as_first_win_rate": (
                values["first_wins"] / first_decisive if first_decisive else None
            ),
            "as_second_win_rate": (
                values["second_wins"] / second_decisive if second_decisive else None
            ),
        }
    return result


def fmt_rate(value: float | None) -> str:
    return f"{value:.4f}" if value is not None else "n/a"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run AI Break Duel biased-cost deck balance checks.",
    )
    parser.add_argument(
        "--candidate",
        choices=sorted(CANDIDATES),
        action="append",
        help="Candidate to run. Repeat for multiple. Defaults to all candidates.",
    )
    parser.add_argument("--games-per-order", type=int, default=1000)
    parser.add_argument("--seed", type=int, default=3_000_000)
    parser.add_argument("--max-turns", type=int, default=60)
    parser.add_argument("--threshold", type=float, default=0.5)
    parser.add_argument("--first-ai", choices=AI_PROFILE_CHOICES, default="challenger")
    parser.add_argument("--second-ai", choices=AI_PROFILE_CHOICES, default="challenger")
    parser.add_argument(
        "--include-preset-league",
        action="store_true",
        help="Also run the existing six-deck ordered league for each selected rule set.",
    )
    parser.add_argument(
        "--rule-set",
        choices=[*sorted(RULE_SETS), "all"],
        action="append",
        help="Deck construction rule set to apply. Repeat for multiple. Defaults to current.",
    )
    parser.add_argument(
        "--out",
        type=Path,
        help="Optional path to write the full JSON output.",
    )
    parser.add_argument("--json", action="store_true", help="Print JSON only.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    selected = args.candidate or sorted(CANDIDATES)
    selected_rule_sets = args.rule_set or ["current"]
    if "all" in selected_rule_sets:
        selected_rule_sets = sorted(RULE_SETS)
    results = []
    preset_leagues = []
    seed = args.seed
    for rule_set in selected_rule_sets:
        if args.include_preset_league:
            preset_leagues.append(
                evaluate_existing_deck_league(
                    EvalConfig(
                        games_per_order=args.games_per_order,
                        seed=seed,
                        max_turns=args.max_turns,
                        rule_set=rule_set,
                        first_ai=args.first_ai,
                        second_ai=args.second_ai,
                    ),
                )
            )
            seed += (
                args.games_per_order
                * len(EXISTING_DECKS)
                * (len(EXISTING_DECKS) - 1)
                + 10_000
            )
        for key in selected:
            _, card_ids = CANDIDATES[key]
            result = evaluate_candidate(
                key,
                card_ids,
                EvalConfig(
                    games_per_order=args.games_per_order,
                    seed=seed,
                    max_turns=args.max_turns,
                    rule_set=rule_set,
                    first_ai=args.first_ai,
                    second_ai=args.second_ai,
                ),
            )
            results.append(result)
            seed += args.games_per_order * len(EXISTING_DECKS) * 2 + 10_000

    output = {
        "seed": args.seed,
        "games_per_order": args.games_per_order,
        "max_turns": args.max_turns,
        "threshold": args.threshold,
        "ai_profiles": [args.first_ai, args.second_ai],
        "rule_sets": {
            key: {
                "label": value.label,
                "life": value.life,
                "field_ai_limit": value.field_ai_limit,
                "hand_defense_limit_per_turn": value.hand_defense_limit_per_turn,
                "hand_defense_requires_empty_field": value.hand_defense_requires_empty_field,
                "successful_defense_discards_both": value.successful_defense_discards_both,
                "exact_upgrade_step": value.exact_upgrade_step,
                "max_power_3_summons": value.max_power_3_summons,
                "max_high_power_summons": value.max_high_power_summons,
                "large_ai_play_cost": value.large_ai_play_cost,
                "large_ai_upgrade_cost": value.large_ai_upgrade_cost,
                "power_3_enters_spent": value.power_3_enters_spent,
                "power_3_play_cost": value.power_3_play_cost,
                "power_4_play_cost": value.power_4_play_cost,
                "power_3_discards_on_play": value.power_3_discards_on_play,
                "power_3_cannot_hand_defend": value.power_3_cannot_hand_defend,
                "power_3_cannot_field_defend": value.power_3_cannot_field_defend,
                "power_3_defense_modifier": value.power_3_defense_modifier,
                "power_3_overheats_after_attack": (
                    value.power_3_overheats_after_attack
                ),
                "power_3_attack_recovery_delay": (
                    value.power_3_attack_recovery_delay
                ),
                "power_4_enters_spent": value.power_4_enters_spent,
                "power_4_overheats_after_attack": (
                    value.power_4_overheats_after_attack
                ),
                "summon_cost_equals_power": value.summon_cost_equals_power,
                "upgrade_cost_equals_power_delta": (
                    value.upgrade_cost_equals_power_delta
                ),
                "empty_field_first_play_discount": (
                    value.empty_field_first_play_discount
                ),
                "include_comeback_memory": value.include_comeback_memory,
                "comeback_memory_first_play_discount": (
                    value.comeback_memory_first_play_discount
                ),
            }
            for key, value in RULE_SETS.items()
        },
        "preset_leagues": preset_leagues,
        "results": results,
    }
    if args.out is not None:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(
            json.dumps(output, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
    if args.json:
        print(json.dumps(output, ensure_ascii=False, indent=2))
    else:
        print(
            f"seed={args.seed} games_per_order={args.games_per_order} "
            f"threshold={args.threshold:.3f} "
            f"ai={args.first_ai}/{args.second_ai}"
        )
        for league in preset_leagues:
            overall = league["overall"]
            standings = ", ".join(
                f"{deck}:{values['win_rate']:.3f}"
                for deck, values in league["standings"].items()
            )
            print(
                f"{league['rule_set']:<10} preset_league "
                f"first={fmt_rate(overall['first_player_win_rate'])} "
                f"one_sided={fmt_rate(overall['one_sided_game_rate'])} "
                f"resource={fmt_rate(overall['resource_exhaustion_rate'])} "
                f"turns={overall['average_turns']:.2f}"
            )
            print(f"     standings {standings}")
        for result in results:
            label = CANDIDATES[result["candidate"]][0]
            status = "RISK" if result["candidate_win_rate"] > args.threshold else "OK"
            print(
                f"{result['rule_set']:<10} {result['candidate']:>4} {label:<24} "
                f"win_rate={result['candidate_win_rate']:.4f} "
                f"first={fmt_rate(result['first_player_win_rate'])} "
                f"one_sided={fmt_rate(result['one_sided_game_rate'])} "
                f"wins={result['candidate_wins']}/{result['games']} {status}"
            )
            rates = ", ".join(
                f"{deck}:{values['candidate_win_rate']:.3f}"
                for deck, values in result["per_opponent"].items()
            )
            print(f"     by_opponent {rates}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
