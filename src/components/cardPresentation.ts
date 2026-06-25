import {
  ATTRIBUTES,
  COMMAND_COLOR,
  MEMORY_COLOR,
  aiEffectText,
  type Card,
  playCost,
  upgradeCost,
} from "../game";
import aiEarth1Art from "../assets/card-art/ai-earth-1.webp";
import aiEarth1bArt from "../assets/card-art/ai-earth-1b.webp";
import aiEarth2Art from "../assets/card-art/ai-earth-2.webp";
import aiEarth2bArt from "../assets/card-art/ai-earth-2b.webp";
import aiEarth2cArt from "../assets/card-art/ai-earth-2c.webp";
import aiEarth3Art from "../assets/card-art/ai-earth-3.webp";
import aiEarth3bArt from "../assets/card-art/ai-earth-3b.webp";
import aiEarth4Art from "../assets/card-art/ai-earth-4.webp";
import aiEarth4bArt from "../assets/card-art/ai-earth-4b.webp";
import aiFire1Art from "../assets/card-art/ai-fire-1.webp";
import aiFire1bArt from "../assets/card-art/ai-fire-1b.webp";
import aiFire1cArt from "../assets/card-art/ai-fire-1c.webp";
import aiFire2Art from "../assets/card-art/ai-fire-2.webp";
import aiFire2bArt from "../assets/card-art/ai-fire-2b.webp";
import aiFire3Art from "../assets/card-art/ai-fire-3.webp";
import aiFire3bArt from "../assets/card-art/ai-fire-3b.webp";
import aiFire4Art from "../assets/card-art/ai-fire-4.webp";
import aiFire4bArt from "../assets/card-art/ai-fire-4b.webp";
import aiWater1Art from "../assets/card-art/ai-water-1.webp";
import aiWater1bArt from "../assets/card-art/ai-water-1b.webp";
import aiWater1cArt from "../assets/card-art/ai-water-1c.webp";
import aiWater2Art from "../assets/card-art/ai-water-2.webp";
import aiWater2bArt from "../assets/card-art/ai-water-2b.webp";
import aiWater3Art from "../assets/card-art/ai-water-3.webp";
import aiWater3bArt from "../assets/card-art/ai-water-3b.webp";
import aiWater4Art from "../assets/card-art/ai-water-4.webp";
import aiWater4bArt from "../assets/card-art/ai-water-4b.webp";
import aiWind1Art from "../assets/card-art/ai-wind-1.webp";
import aiWind1bArt from "../assets/card-art/ai-wind-1b.webp";
import aiWind2Art from "../assets/card-art/ai-wind-2.webp";
import aiWind2bArt from "../assets/card-art/ai-wind-2b.webp";
import aiWind2cArt from "../assets/card-art/ai-wind-2c.webp";
import aiWind3Art from "../assets/card-art/ai-wind-3.webp";
import aiWind3bArt from "../assets/card-art/ai-wind-3b.webp";
import aiWind4Art from "../assets/card-art/ai-wind-4.webp";
import aiWind4bArt from "../assets/card-art/ai-wind-4b.webp";
import cmdDisruptArt from "../assets/card-art/cmd-disrupt.webp";
import cmdEarthRiteArt from "../assets/card-art/cmd-earth-rite.webp";
import cmdFireRiteArt from "../assets/card-art/cmd-fire-rite.webp";
import cmdOptimizeArt from "../assets/card-art/cmd-optimize.webp";
import cmdPatchArt from "../assets/card-art/cmd-patch.webp";
import cmdRelearnArt from "../assets/card-art/cmd-relearn.webp";
import cmdSandboxArt from "../assets/card-art/cmd-sandbox.webp";
import cmdTrinityArt from "../assets/card-art/cmd-trinity.webp";
import cmdWaterRiteArt from "../assets/card-art/cmd-water-rite.webp";
import cmdWindRiteArt from "../assets/card-art/cmd-wind-rite.webp";
import memAcceleratorArt from "../assets/card-art/mem-accelerator.webp";
import memCacheArt from "../assets/card-art/mem-cache.webp";
import memFirewallArt from "../assets/card-art/mem-firewall.webp";
import memPipelineArt from "../assets/card-art/mem-pipeline.webp";
import memResonatorArt from "../assets/card-art/mem-resonator.webp";
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
  "AI-FIRE-1B": aiFire1bArt,
  "AI-FIRE-1C": aiFire1cArt,
  "AI-FIRE-2": aiFire2Art,
  "AI-FIRE-2B": aiFire2bArt,
  "AI-FIRE-3": aiFire3Art,
  "AI-FIRE-3B": aiFire3bArt,
  "AI-FIRE-4": aiFire4Art,
  "AI-FIRE-4B": aiFire4bArt,
  "AI-WATER-1": aiWater1Art,
  "AI-WATER-1B": aiWater1bArt,
  "AI-WATER-1C": aiWater1cArt,
  "AI-WATER-2": aiWater2Art,
  "AI-WATER-2B": aiWater2bArt,
  "AI-WATER-3": aiWater3Art,
  "AI-WATER-3B": aiWater3bArt,
  "AI-WATER-4": aiWater4Art,
  "AI-WATER-4B": aiWater4bArt,
  "AI-WIND-1": aiWind1Art,
  "AI-WIND-1B": aiWind1bArt,
  "AI-WIND-2": aiWind2Art,
  "AI-WIND-2B": aiWind2bArt,
  "AI-WIND-2C": aiWind2cArt,
  "AI-WIND-3": aiWind3Art,
  "AI-WIND-3B": aiWind3bArt,
  "AI-WIND-4": aiWind4Art,
  "AI-WIND-4B": aiWind4bArt,
  "AI-EARTH-1": aiEarth1Art,
  "AI-EARTH-1B": aiEarth1bArt,
  "AI-EARTH-2": aiEarth2Art,
  "AI-EARTH-2B": aiEarth2bArt,
  "AI-EARTH-2C": aiEarth2cArt,
  "AI-EARTH-3": aiEarth3Art,
  "AI-EARTH-3B": aiEarth3bArt,
  "AI-EARTH-4": aiEarth4Art,
  "AI-EARTH-4B": aiEarth4bArt,
};

const SUPPORT_CARD_ART: Record<string, string> = {
  "CMD-OPTIMIZE": cmdOptimizeArt,
  "CMD-PATCH": cmdPatchArt,
  "CMD-DISRUPT": cmdDisruptArt,
  "CMD-RELEARN": cmdRelearnArt,
  "CMD-SANDBOX": cmdSandboxArt,
  "CMD-TRINITY": cmdTrinityArt,
  "CMD-FIRE-RITE": cmdFireRiteArt,
  "CMD-WATER-RITE": cmdWaterRiteArt,
  "CMD-WIND-RITE": cmdWindRiteArt,
  "CMD-EARTH-RITE": cmdEarthRiteArt,
  "MEM-ACCELERATOR": memAcceleratorArt,
  "MEM-FIREWALL": memFirewallArt,
  "MEM-CACHE": memCacheArt,
  "MEM-PIPELINE": memPipelineArt,
  "MEM-RESONATOR": memResonatorArt,
};

export function cardColor(card: Card): string {
  if (card.type === "event") return COMMAND_COLOR;
  if (card.type === "memory") return MEMORY_COLOR;
  return ATTRIBUTES[card.attribute!].color;
}

export function cardCoreText(card: Card): string | number {
  if (card.type === "event") return "術";
  if (card.type === "memory") return "遺";
  return card.power ?? "";
}

export function cardArtClass(card: Card): string {
  const generatedClass = SUPPORT_CARD_ART[card.id] ? " art-generated" : "";
  if (card.type === "event") return `art-command art-${card.effect}${generatedClass}`;
  if (card.type === "memory") return `art-memory art-${card.effect}${generatedClass}`;
  return `art-ai art-${ATTRIBUTES[card.attribute!].code.toLowerCase()} art-power-${card.power}`;
}

export function cardArtGlyph(card: Card): string {
  if (card.type === "event") {
    if (card.effect === "optimize") return "整";
    if (card.effect === "patch") return "癒";
    if (card.effect === "disrupt") return "縛";
    if (card.effect === "relearn") return "巻";
    if (card.effect === "sandbox") return "結";
    if (card.effect === "trinity") return "崩";
    if (card.effect === "fire_rite") return "火";
    if (card.effect === "water_rite") return "水";
    if (card.effect === "wind_rite") return "風";
    if (card.effect === "earth_rite") return "土";
    return "術";
  }
  if (card.type === "memory") {
    if (card.effect === "firewall") return "紋";
    if (card.effect === "cache") return "鞄";
    if (card.effect === "pipeline") return "水";
    if (card.effect === "accelerator") return "速";
    return "遺";
  }
  return ATTRIBUTES[card.attribute!].code.slice(0, 1);
}

export function cardArtAsset(card: Card): string {
  const generatedSupportArt = SUPPORT_CARD_ART[card.id];
  if (generatedSupportArt) return generatedSupportArt;

  if (card.type === "event") {
    if (card.effect === "optimize") return cardsShuffleIcon;
    if (card.effect === "patch") return timerIcon;
    if (card.effect === "disrupt") return cardTargetIcon;
    if (card.effect === "relearn") return cardsReturnIcon;
    if (card.effect === "sandbox") return hexagonSwitchIcon;
    if (card.effect === "trinity") return characterRemoveIcon;
    if (card.effect === "fire_rite") return cardTargetIcon;
    if (card.effect === "water_rite") return cardsTakeIcon;
    if (card.effect === "wind_rite") return timerIcon;
    if (card.effect === "earth_rite") return cardsReturnIcon;
    return cardIcon;
  }
  if (card.type === "memory") {
    if (card.effect === "firewall") return shieldIcon;
    if (card.effect === "cache") return cardIcon;
    if (card.effect === "pipeline") return cardsTakeIcon;
    if (card.effect === "accelerator") return hexagonSwitchIcon;
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
  if (card.type === "memory") return "遺物";
  return card.attribute ?? "";
}

export function roleLabel(card: Card): string {
  if (card.type === "event") return "指令";
  if (card.type === "memory") return "継続";
  if (card.power === 1) return "補給";
  if (card.power === 2) return "防御";
  if (card.power === 3) return "中型";
  if (card.power === 4) return "切札";
  return "召喚獣";
}

export function aiBaseRuleText(card: Card): string {
  if (card.type !== "ai") return "";
  if (card.power === 3) return "攻撃後、次の自分ターン開始では回復しない";
  if (card.power === 4) return "攻撃後退場";
  return "";
}

export function roleText(card: Card): string {
  if (card.effect === "optimize") return "1アクション。手札1枚を捨て、山札からカードを2枚引く";
  if (card.effect === "patch") return "1アクション。自分の消耗召喚獣1体を回復";
  if (card.effect === "disrupt") return "1アクション。相手の未消耗召喚獣1体を消耗";
  if (card.effect === "relearn") return "1アクション。手札1枚を捨て、トラッシュの召喚獣1枚を回収";
  if (card.effect === "sandbox") return "1アクション。このターン、次のpower 4攻撃後退場を1回防ぐ";
  if (card.effect === "trinity") return "1アクション。場が3枚なら全てトラッシュし、相手ライフ-1";
  if (card.effect === "fire_rite") return "1アクション。場に火の召喚獣がいる時、相手の手札1枚をトラッシュ。なければ相手ライフ-1";
  if (card.effect === "water_rite") return "1アクション。場に水の召喚獣がいる時、山札からカードを1枚引く";
  if (card.effect === "wind_rite") return "1アクション。場に風の召喚獣がいる時、相手1体を消耗し、自分の風1体を回復";
  if (card.effect === "earth_rite") return "1アクション。場に土の召喚獣がいる時、トラッシュの召喚獣1枚を回収";
  if (card.effect === "firewall") return "他属性防御時、手札を1枚捨てるなら power +1";
  if (card.effect === "cache") return "ターン開始時、手札2枚以下なら山札からカードを1枚引く";
  if (card.effect === "pipeline") return "1ターンに1回、power 1登場時、山札からカードを1枚引く";
  if (card.effect === "accelerator") return "1ターンに1回使える。場の召喚獣1体をトラッシュしてもよい。その場合、アクション+1する";
  if (card.effect === "resonator") return "自分がチャージした後、手札2枚以下なら山札からカードを1枚引く";
  const trait = card.effect ? ` / ${aiEffectText(card)}` : "";
  if (card.power === 1) return `1アクション${trait}`;
  if (card.power === 2) return `1アクション${trait}`;
  if (card.power === 3) return `${playCost(card)}アクション / アップグレード${upgradeCost(card)}アクション。${aiBaseRuleText(card)}${trait}`;
  if (card.power === 4) return `${playCost(card)}アクション / アップグレード${upgradeCost(card)}アクション。${aiBaseRuleText(card)}${trait}`;
  return "召喚獣";
}

export function selectedText(card: Card): string {
  if (card.type === "event") return `${card.name} / 指令 / ${roleText(card)}`;
  if (card.type === "memory") return `${card.name} / 遺物 / ${roleText(card)}`;
  return `${card.name} / ${card.attribute} / power ${card.power} / ${roleText(card)}`;
}

export function displayCost(card: Card, actionState: string): number {
  return actionState === "upgradeable" ? Math.max(1, playCost(card) - 1) : playCost(card);
}
