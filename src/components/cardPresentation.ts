import {
  ATTRIBUTES,
  COMMAND_COLOR,
  CONFIG,
  MEMORY_COLOR,
  type Card,
  playCost,
} from "../game";
import aiEarth1Art from "../assets/card-art/ai-earth-1.webp";
import aiEarth2Art from "../assets/card-art/ai-earth-2.webp";
import aiEarth3Art from "../assets/card-art/ai-earth-3.webp";
import aiEarth4Art from "../assets/card-art/ai-earth-4.webp";
import aiFire1Art from "../assets/card-art/ai-fire-1.webp";
import aiFire2Art from "../assets/card-art/ai-fire-2.webp";
import aiFire3Art from "../assets/card-art/ai-fire-3.webp";
import aiFire4Art from "../assets/card-art/ai-fire-4.webp";
import aiWater1Art from "../assets/card-art/ai-water-1.webp";
import aiWater2Art from "../assets/card-art/ai-water-2.webp";
import aiWater3Art from "../assets/card-art/ai-water-3.webp";
import aiWater4Art from "../assets/card-art/ai-water-4.webp";
import aiWind1Art from "../assets/card-art/ai-wind-1.webp";
import aiWind2Art from "../assets/card-art/ai-wind-2.webp";
import aiWind3Art from "../assets/card-art/ai-wind-3.webp";
import aiWind4Art from "../assets/card-art/ai-wind-4.webp";
import cardIcon from "../assets/kenney/card.png";
import cardTargetIcon from "../assets/kenney/card_target.png";
import cardsReturnIcon from "../assets/kenney/cards_return.png";
import cardsShuffleIcon from "../assets/kenney/cards_shuffle.png";
import cardsTakeIcon from "../assets/kenney/cards_take.png";
import characterIcon from "../assets/kenney/character.png";
import characterLiftIcon from "../assets/kenney/character_lift.png";
import characterPlaceIcon from "../assets/kenney/character_place.png";
import characterRemoveIcon from "../assets/kenney/character_remove.png";
import hexagonIcon from "../assets/kenney/hexagon.png";
import hexagonSwitchIcon from "../assets/kenney/hexagon_switch.png";
import shieldIcon from "../assets/kenney/shield.png";
import timerIcon from "../assets/kenney/timer_CW_75.png";

const AI_CARD_ART: Record<string, string> = {
  "AI-FIRE-1": aiFire1Art,
  "AI-FIRE-2": aiFire2Art,
  "AI-FIRE-3": aiFire3Art,
  "AI-FIRE-4": aiFire4Art,
  "AI-WATER-1": aiWater1Art,
  "AI-WATER-2": aiWater2Art,
  "AI-WATER-3": aiWater3Art,
  "AI-WATER-4": aiWater4Art,
  "AI-WIND-1": aiWind1Art,
  "AI-WIND-2": aiWind2Art,
  "AI-WIND-3": aiWind3Art,
  "AI-WIND-4": aiWind4Art,
  "AI-EARTH-1": aiEarth1Art,
  "AI-EARTH-2": aiEarth2Art,
  "AI-EARTH-3": aiEarth3Art,
  "AI-EARTH-4": aiEarth4Art,
};

export function cardColor(card: Card): string {
  if (card.type === "event") return COMMAND_COLOR;
  if (card.type === "memory") return MEMORY_COLOR;
  return ATTRIBUTES[card.attribute!].color;
}

export function cardCoreText(card: Card): string | number {
  if (card.type === "event") return "CMD";
  if (card.type === "memory") return "MEM";
  return card.power ?? "";
}

export function cardArtClass(card: Card): string {
  if (card.type === "event") return `art-command art-${card.effect}`;
  if (card.type === "memory") return `art-memory art-${card.effect}`;
  return `art-ai art-${ATTRIBUTES[card.attribute!].code.toLowerCase()} art-power-${card.power}`;
}

export function cardArtGlyph(card: Card): string {
  if (card.type === "event") {
    if (card.effect === "optimize") return "OPT";
    if (card.effect === "patch") return "FIX";
    if (card.effect === "disrupt") return "JAM";
    if (card.effect === "relearn") return "RCL";
    if (card.effect === "sandbox") return "SB";
    return "CMD";
  }
  if (card.type === "memory") {
    if (card.effect === "firewall") return "FW";
    if (card.effect === "cache") return "CA";
    if (card.effect === "pipeline") return "PL";
    return "MEM";
  }
  return ATTRIBUTES[card.attribute!].code.slice(0, 1);
}

export function cardArtAsset(card: Card): string {
  if (card.type === "event") {
    if (card.effect === "optimize") return cardsShuffleIcon;
    if (card.effect === "patch") return timerIcon;
    if (card.effect === "disrupt") return cardTargetIcon;
    if (card.effect === "relearn") return cardsReturnIcon;
    if (card.effect === "sandbox") return hexagonSwitchIcon;
    return cardIcon;
  }
  if (card.type === "memory") {
    if (card.effect === "firewall") return shieldIcon;
    if (card.effect === "cache") return cardIcon;
    if (card.effect === "pipeline") return cardsTakeIcon;
    return hexagonIcon;
  }
  const generatedArt = AI_CARD_ART[card.id];
  if (generatedArt) return generatedArt;
  if (card.power === 1) return characterIcon;
  if (card.power === 2) return characterLiftIcon;
  if (card.power === 3) return characterPlaceIcon;
  return characterRemoveIcon;
}

export function cardTypeLabel(card: Card): string {
  if (card.type === "event") return "指令";
  if (card.type === "memory") return "メモリー";
  return card.attribute ?? "";
}

export function roleLabel(card: Card): string {
  if (card.type === "event") return "指令";
  if (card.type === "memory") return "継続";
  if (card.power === 1) return "補給";
  if (card.power === 2) return "防御";
  if (card.power === 3) return "中型";
  if (card.power === 4) return "切札";
  return "AI";
}

export function roleText(card: Card): string {
  if (card.effect === "optimize") return "1アクション。手札1〜2枚を捨て2枚引く";
  if (card.effect === "patch") return "1アクション。自分の消耗AI1体を回復";
  if (card.effect === "disrupt") return "1アクション。相手の未消耗AI1体を消耗";
  if (card.effect === "relearn") return "1アクション。トラッシュのAI1枚を回収";
  if (card.effect === "sandbox") return "1アクション。このターン、次のpower 4攻撃後退場を1回防ぐ";
  if (card.effect === "firewall") return "同属性防御時、手札1枚を捨て power +1";
  if (card.effect === "cache") return "ターン開始時、手札2枚以下なら1枚引く";
  if (card.effect === "pipeline") return "1ターンに1回、power 1登場時に1枚引いて1枚捨てる";
  if (card.power === 1) return "1アクション。登場時1枚引く";
  if (card.power === 2) return `1アクション。防御時 power +${CONFIG.power2DefenseBonus}`;
  if (card.power === 3) return `${CONFIG.largeAiPlayCost}アクション。即防御可`;
  if (card.power === 4) return `${CONFIG.largeAiPlayCost}アクション。登場時消耗。攻撃後退場`;
  return "AI";
}

export function selectedText(card: Card): string {
  if (card.type === "event") return `${card.name} / 指令 / ${roleText(card)}`;
  if (card.type === "memory") return `${card.name} / メモリー / ${roleText(card)}`;
  return `${card.name} / ${card.attribute} / power ${card.power} / ${roleText(card)}`;
}

export function displayCost(card: Card, actionState: string): number {
  return actionState === "upgradeable" ? Math.max(1, playCost(card) - 1) : playCost(card);
}
