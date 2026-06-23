from __future__ import annotations

import argparse
import json
from pathlib import Path

from .models import GameConfig
from .simulation import run_match, run_simulation


def main() -> None:
    parser = argparse.ArgumentParser(prog="break-duel")
    subparsers = parser.add_subparsers(dest="command", required=True)

    simulate = subparsers.add_parser("simulate", help="Run many AI matches.")
    simulate.add_argument("--games", type=int, default=1000)
    simulate.add_argument("--seed", type=int, default=1)
    simulate.add_argument("--out", type=Path, default=Path("tmp"))
    simulate.add_argument("--max-turns", type=int, default=60)
    simulate.add_argument("--first-player-initial-hand", type=int, default=5)
    simulate.add_argument("--second-player-initial-hand", type=int, default=4)
    simulate.add_argument("--field-limit", type=int, default=3)
    simulate.add_argument("--advantage-bonus", type=int, default=1)
    simulate.add_argument("--disadvantage-penalty", type=int, default=1)
    simulate.add_argument("--first-turn-actions", type=int, default=1)
    simulate.add_argument("--each-player-first-turn-actions", type=int, default=2)
    simulate.add_argument(
        "--first-turn-can-attack",
        dest="first_turn_can_attack",
        action="store_true",
        default=False,
    )
    simulate.add_argument(
        "--first-turn-no-attack",
        dest="first_turn_can_attack",
        action="store_false",
    )
    simulate.add_argument(
        "--first-turn-draw",
        dest="first_turn_draw",
        action="store_true",
        default=False,
    )
    simulate.add_argument(
        "--first-turn-no-draw",
        dest="first_turn_draw",
        action="store_false",
    )
    simulate.add_argument("--second-turn-no-draw", action="store_true")
    simulate.add_argument("--each-player-first-turn-no-attack", action="store_true")
    simulate.add_argument("--hand-defense-limit", type=int, default=1)
    simulate.add_argument("--hand-limit", type=int, default=None)
    simulate.add_argument("--no-exhaust-after-attack", action="store_true")
    simulate.add_argument("--exhausted-ai-can-defend", action="store_true")
    simulate.add_argument("--no-successful-defense-discard", action="store_true")
    simulate.add_argument(
        "--hand-defense-empty-field-only",
        dest="hand_defense_empty_field_only",
        action="store_true",
        default=False,
    )
    simulate.add_argument(
        "--hand-defense-any-field",
        dest="hand_defense_empty_field_only",
        action="store_false",
    )
    simulate.add_argument(
        "--same-attribute-strict",
        dest="same_attribute_strict",
        action="store_true",
        default=True,
    )
    simulate.add_argument(
        "--same-attribute-lenient",
        dest="same_attribute_strict",
        action="store_false",
    )

    match = subparsers.add_parser("match", help="Run one AI match and print its log.")
    match.add_argument("--seed", type=int, default=1)
    match.add_argument("--max-turns", type=int, default=60)
    match.add_argument("--first-player-initial-hand", type=int, default=5)
    match.add_argument("--second-player-initial-hand", type=int, default=4)
    match.add_argument("--field-limit", type=int, default=3)
    match.add_argument("--advantage-bonus", type=int, default=1)
    match.add_argument("--disadvantage-penalty", type=int, default=1)
    match.add_argument("--first-turn-actions", type=int, default=1)
    match.add_argument("--each-player-first-turn-actions", type=int, default=2)
    match.add_argument(
        "--first-turn-can-attack",
        dest="first_turn_can_attack",
        action="store_true",
        default=False,
    )
    match.add_argument(
        "--first-turn-no-attack",
        dest="first_turn_can_attack",
        action="store_false",
    )
    match.add_argument(
        "--first-turn-draw",
        dest="first_turn_draw",
        action="store_true",
        default=False,
    )
    match.add_argument(
        "--first-turn-no-draw",
        dest="first_turn_draw",
        action="store_false",
    )
    match.add_argument("--second-turn-no-draw", action="store_true")
    match.add_argument("--each-player-first-turn-no-attack", action="store_true")
    match.add_argument("--hand-defense-limit", type=int, default=1)
    match.add_argument("--hand-limit", type=int, default=None)
    match.add_argument("--no-exhaust-after-attack", action="store_true")
    match.add_argument("--exhausted-ai-can-defend", action="store_true")
    match.add_argument("--no-successful-defense-discard", action="store_true")
    match.add_argument(
        "--hand-defense-empty-field-only",
        dest="hand_defense_empty_field_only",
        action="store_true",
        default=False,
    )
    match.add_argument(
        "--hand-defense-any-field",
        dest="hand_defense_empty_field_only",
        action="store_false",
    )
    match.add_argument(
        "--same-attribute-strict",
        dest="same_attribute_strict",
        action="store_true",
        default=True,
    )
    match.add_argument(
        "--same-attribute-lenient",
        dest="same_attribute_strict",
        action="store_false",
    )

    args = parser.parse_args()
    config = GameConfig(
        max_turns=args.max_turns,
        first_player_initial_hand=args.first_player_initial_hand,
        second_player_initial_hand=args.second_player_initial_hand,
        field_ai_limit=args.field_limit,
        defense_advantage_bonus=args.advantage_bonus,
        defense_disadvantage_penalty=args.disadvantage_penalty,
        same_attribute_strict_defense=args.same_attribute_strict,
        first_player_first_turn_actions=args.first_turn_actions,
        each_player_first_turn_actions=args.each_player_first_turn_actions,
        first_player_first_turn_can_attack=args.first_turn_can_attack,
        first_player_first_turn_draw=args.first_turn_draw,
        second_player_first_turn_draw=not args.second_turn_no_draw,
        each_player_first_turn_can_attack=not args.each_player_first_turn_no_attack,
        hand_defense_limit_per_turn=args.hand_defense_limit,
        hand_limit=args.hand_limit,
        hand_defense_requires_empty_field=args.hand_defense_empty_field_only,
        exhaust_after_attack=not args.no_exhaust_after_attack,
        exhausted_ai_can_defend=args.exhausted_ai_can_defend,
        successful_defense_discards_both=not args.no_successful_defense_discard,
    )

    if args.command == "simulate":
        summary = run_simulation(args.games, args.seed, args.out, config)
        print(json.dumps(summary, ensure_ascii=False, indent=2))
    elif args.command == "match":
        result = run_match(args.seed, config)
        print(json.dumps({"summary": result.summary, "log": result.log}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
