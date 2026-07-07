import {
  ATTRIBUTES,
  COMMAND_COLOR,
  MEMORY_COLOR,
  aiEffectText,
  type Card,
  type GameState,
  playCost,
  upgradeCost,
} from "../game";
import aiEarth1Art from "../assets/card-art/ai-earth-1.webp";
import aiEarth1bArt from "../assets/card-art/ai-earth-1b.webp";
import aiEarth1cArt from "../assets/card-art/ai-earth-1c.webp";
import aiEarth1dArt from "../assets/card-art/ai-earth-1d.webp";
import aiEarth2Art from "../assets/card-art/ai-earth-2.webp";
import aiEarth2bArt from "../assets/card-art/ai-earth-2b.webp";
import aiEarth2cArt from "../assets/card-art/ai-earth-2c.webp";
import aiEarth2dArt from "../assets/card-art/ai-earth-2d.webp";
import aiEarth3Art from "../assets/card-art/ai-earth-3.webp";
import aiEarth3bArt from "../assets/card-art/ai-earth-3b.webp";
import aiEarth3cArt from "../assets/card-art/ai-earth-3c.webp";
import aiEarth4Art from "../assets/card-art/ai-earth-4.webp";
import aiEarth4bArt from "../assets/card-art/ai-earth-4b.webp";
import aiEarth4dArt from "../assets/card-art/ai-earth-4d.webp";
import aiFire1Art from "../assets/card-art/ai-fire-1.webp";
import aiFire1bArt from "../assets/card-art/ai-fire-1b.webp";
import aiFire1cArt from "../assets/card-art/ai-fire-1c.webp";
import aiFire1dArt from "../assets/card-art/ai-fire-1d.webp";
import aiFire2Art from "../assets/card-art/ai-fire-2.webp";
import aiFire2bArt from "../assets/card-art/ai-fire-2b.webp";
import aiFire2cArt from "../assets/card-art/ai-fire-2c.webp";
import aiFire2dArt from "../assets/card-art/ai-fire-2d.webp";
import aiFire3Art from "../assets/card-art/ai-fire-3.webp";
import aiFire3bArt from "../assets/card-art/ai-fire-3b.webp";
import aiFire3cArt from "../assets/card-art/ai-fire-3c.webp";
import aiFire3dArt from "../assets/card-art/ai-fire-3d.webp";
import aiFire4Art from "../assets/card-art/ai-fire-4.webp";
import aiFire4bArt from "../assets/card-art/ai-fire-4b.webp";
import aiFire4dArt from "../assets/card-art/ai-fire-4d.webp";
import aiWater1Art from "../assets/card-art/ai-water-1.webp";
import aiWater1bArt from "../assets/card-art/ai-water-1b.webp";
import aiWater1cArt from "../assets/card-art/ai-water-1c.webp";
import aiWater1dArt from "../assets/card-art/ai-water-1d.webp";
import aiWater2Art from "../assets/card-art/ai-water-2.webp";
import aiWater2bArt from "../assets/card-art/ai-water-2b.webp";
import aiWater2cArt from "../assets/card-art/ai-water-2c.webp";
import aiWater2dArt from "../assets/card-art/ai-water-2d.webp";
import aiWater3Art from "../assets/card-art/ai-water-3.webp";
import aiWater3bArt from "../assets/card-art/ai-water-3b.webp";
import aiWater3cArt from "../assets/card-art/ai-water-3c.webp";
import aiWater3dArt from "../assets/card-art/ai-water-3d.webp";
import aiWater4Art from "../assets/card-art/ai-water-4.webp";
import aiWater4bArt from "../assets/card-art/ai-water-4b.webp";
import aiWater4dArt from "../assets/card-art/ai-water-4d.webp";
import aiWind1Art from "../assets/card-art/ai-wind-1.webp";
import aiWind1bArt from "../assets/card-art/ai-wind-1b.webp";
import aiWind1cArt from "../assets/card-art/ai-wind-1c.webp";
import aiWind1dArt from "../assets/card-art/ai-wind-1d.webp";
import aiWind2Art from "../assets/card-art/ai-wind-2.webp";
import aiWind2bArt from "../assets/card-art/ai-wind-2b.webp";
import aiWind2cArt from "../assets/card-art/ai-wind-2c.webp";
import aiWind2dArt from "../assets/card-art/ai-wind-2d.webp";
import aiWind3Art from "../assets/card-art/ai-wind-3.webp";
import aiWind3bArt from "../assets/card-art/ai-wind-3b.webp";
import aiWind3cArt from "../assets/card-art/ai-wind-3c.webp";
import aiWind4Art from "../assets/card-art/ai-wind-4.webp";
import aiWind4bArt from "../assets/card-art/ai-wind-4b.webp";
import aiWind4dArt from "../assets/card-art/ai-wind-4d.webp";
import cmdDeepCurrentArt from "../assets/card-art/cmd-deep-current.webp";
import cmdDisruptArt from "../assets/card-art/cmd-disrupt.webp";
import cmdComebackRiteArt from "../assets/card-art/cmd-comeback-rite.webp";
import cmdEarthRiteArt from "../assets/card-art/cmd-earth-rite.webp";
import cmdFireRiteArt from "../assets/card-art/cmd-fire-rite.webp";
import cmdGraveCallArt from "../assets/card-art/cmd-grave-call.webp";
import cmdOptimizeArt from "../assets/card-art/cmd-optimize.webp";
import cmdOverdriveArt from "../assets/card-art/cmd-overdrive.webp";
import cmdPatchArt from "../assets/card-art/cmd-patch.webp";
import cmdPierceSightArt from "../assets/card-art/cmd-pierce-sight.webp";
import cmdPurgeArt from "../assets/card-art/cmd-purge.webp";
import cmdRelicCrushArt from "../assets/card-art/cmd-relic-crush.webp";
import cmdRelearnArt from "../assets/card-art/cmd-relearn.webp";
import cmdSalvageArt from "../assets/card-art/cmd-salvage.webp";
import cmdSandboxArt from "../assets/card-art/cmd-sandbox.webp";
import cmdTideEdgeArt from "../assets/card-art/cmd-tide-edge.webp";
import cmdTrinityArt from "../assets/card-art/cmd-trinity.webp";
import cmdWarCryArt from "../assets/card-art/cmd-war-cry.webp";
import cmdWaterRiteArt from "../assets/card-art/cmd-water-rite.webp";
import cmdWindRiteArt from "../assets/card-art/cmd-wind-rite.webp";
import memAcceleratorArt from "../assets/card-art/mem-accelerator.webp";
import memCacheArt from "../assets/card-art/mem-cache.webp";
import memDualBannerArt from "../assets/card-art/mem-dual-banner.webp";
import memEchoUrnArt from "../assets/card-art/mem-echo-urn.webp";
import memFirewallArt from "../assets/card-art/mem-firewall.webp";
import memGroveArt from "../assets/card-art/mem-grove.webp";
import memPipelineArt from "../assets/card-art/mem-pipeline.webp";
import memRecoveryCacheArt from "../assets/card-art/mem-recovery-cache.webp";
import memResonatorArt from "../assets/card-art/mem-resonator.webp";
import memStormCoreArt from "../assets/card-art/mem-storm-core.webp";
import memTidalMirrorArt from "../assets/card-art/mem-tidal-mirror.webp";
import memWarBannerArt from "../assets/card-art/mem-war-banner.webp";
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
  "AI-FIRE-1D": aiFire1dArt,
  "AI-FIRE-2": aiFire2Art,
  "AI-FIRE-2B": aiFire2bArt,
  "AI-FIRE-2C": aiFire2cArt,
  "AI-FIRE-2D": aiFire2dArt,
  "AI-FIRE-3": aiFire3Art,
  "AI-FIRE-3B": aiFire3bArt,
  "AI-FIRE-3C": aiFire3cArt,
  "AI-FIRE-3D": aiFire3dArt,
  "AI-FIRE-4": aiFire4Art,
  "AI-FIRE-4B": aiFire4bArt,
  "AI-FIRE-4D": aiFire4dArt,
  "AI-WATER-1": aiWater1Art,
  "AI-WATER-1B": aiWater1bArt,
  "AI-WATER-1C": aiWater1cArt,
  "AI-WATER-1D": aiWater1dArt,
  "AI-WATER-2": aiWater2Art,
  "AI-WATER-2B": aiWater2bArt,
  "AI-WATER-2C": aiWater2cArt,
  "AI-WATER-2D": aiWater2dArt,
  "AI-WATER-3": aiWater3Art,
  "AI-WATER-3B": aiWater3bArt,
  "AI-WATER-3C": aiWater3cArt,
  "AI-WATER-3D": aiWater3dArt,
  "AI-WATER-4": aiWater4Art,
  "AI-WATER-4B": aiWater4bArt,
  "AI-WATER-4D": aiWater4dArt,
  "AI-WIND-1": aiWind1Art,
  "AI-WIND-1B": aiWind1bArt,
  "AI-WIND-1C": aiWind1cArt,
  "AI-WIND-1D": aiWind1dArt,
  "AI-WIND-2": aiWind2Art,
  "AI-WIND-2B": aiWind2bArt,
  "AI-WIND-2C": aiWind2cArt,
  "AI-WIND-2D": aiWind2dArt,
  "AI-WIND-3": aiWind3Art,
  "AI-WIND-3B": aiWind3bArt,
  "AI-WIND-3C": aiWind3cArt,
  "AI-WIND-4": aiWind4Art,
  "AI-WIND-4B": aiWind4bArt,
  "AI-WIND-4D": aiWind4dArt,
  "AI-EARTH-1": aiEarth1Art,
  "AI-EARTH-1B": aiEarth1bArt,
  "AI-EARTH-1C": aiEarth1cArt,
  "AI-EARTH-1D": aiEarth1dArt,
  "AI-EARTH-2": aiEarth2Art,
  "AI-EARTH-2B": aiEarth2bArt,
  "AI-EARTH-2C": aiEarth2cArt,
  "AI-EARTH-2D": aiEarth2dArt,
  "AI-EARTH-3": aiEarth3Art,
  "AI-EARTH-3B": aiEarth3bArt,
  "AI-EARTH-3C": aiEarth3cArt,
  "AI-EARTH-4": aiEarth4Art,
  "AI-EARTH-4B": aiEarth4bArt,
  "AI-EARTH-4D": aiEarth4dArt,
};

const SUPPORT_CARD_ART: Record<string, string> = {
  "CMD-OPTIMIZE": cmdOptimizeArt,
  "CMD-PATCH": cmdPatchArt,
  "CMD-DISRUPT": cmdDisruptArt,
  "CMD-PURGE": cmdPurgeArt,
  "CMD-RELEARN": cmdRelearnArt,
  "CMD-SANDBOX": cmdSandboxArt,
  "CMD-TRINITY": cmdTrinityArt,
  "CMD-FIRE-RITE": cmdFireRiteArt,
  "CMD-WATER-RITE": cmdWaterRiteArt,
  "CMD-WIND-RITE": cmdWindRiteArt,
  "CMD-EARTH-RITE": cmdEarthRiteArt,
  "CMD-COMEBACK-RITE": cmdComebackRiteArt,
  "CMD-WAR-CRY": cmdWarCryArt,
  "CMD-TIDE-EDGE": cmdTideEdgeArt,
  "CMD-PIERCE-SIGHT": cmdPierceSightArt,
  "CMD-GRAVE-CALL": cmdGraveCallArt,
  "CMD-SALVAGE": cmdSalvageArt,
  "CMD-OVERDRIVE": cmdOverdriveArt,
  "CMD-RELIC-CRUSH": cmdRelicCrushArt,
  "CMD-DEEP-CURRENT": cmdDeepCurrentArt,
  "MEM-ACCELERATOR": memAcceleratorArt,
  "MEM-FIREWALL": memFirewallArt,
  "MEM-CACHE": memCacheArt,
  "MEM-PIPELINE": memPipelineArt,
  "MEM-RECOVERY-CACHE": memRecoveryCacheArt,
  "MEM-RESONATOR": memResonatorArt,
  "MEM-WAR-BANNER": memWarBannerArt,
  "MEM-GROVE": memGroveArt,
  "MEM-ECHO-URN": memEchoUrnArt,
  "MEM-STORM-CORE": memStormCoreArt,
  "MEM-TIDAL-MIRROR": memTidalMirrorArt,
  "MEM-DUAL-BANNER": memDualBannerArt,
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
    if (card.effect === "purge") return "粛";
    if (card.effect === "relearn") return "巻";
    if (card.effect === "sandbox") return "結";
    if (card.effect === "trinity") return "崩";
    if (card.effect === "fire_rite") return "火";
    if (card.effect === "water_rite") return "水";
    if (card.effect === "wind_rite") return "風";
    if (card.effect === "earth_rite") return "土";
    if (card.effect === "comeback_rite") return "逆";
    if (card.effect === "war_cry") return "号";
    if (card.effect === "tide_edge") return "刃";
    if (card.effect === "pierce_sight") return "眼";
    if (card.effect === "grave_call") return "響";
    if (card.effect === "salvage") return "灰";
    if (card.effect === "overdrive") return "過";
    if (card.effect === "relic_crush") return "砕";
    if (card.effect === "deep_current") return "流";
    return "術";
  }
  if (card.type === "memory") {
    if (card.effect === "firewall") return "紋";
    if (card.effect === "cache") return "鞄";
    if (card.effect === "pipeline") return "水";
    if (card.effect === "accelerator") return "速";
    if (card.effect === "recovery_cache") return "再";
    if (card.effect === "war_banner") return "旗";
    if (card.effect === "grove_rest") return "眠";
    if (card.effect === "echo_urn") return "壺";
    if (card.effect === "storm_core") return "嵐";
    if (card.effect === "tidal_mirror") return "鏡";
    if (card.effect === "dual_banner") return "軍";
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
    if (card.effect === "comeback_rite") return cardsReturnIcon;
    return cardIcon;
  }
  if (card.type === "memory") {
    if (card.effect === "firewall") return shieldIcon;
    if (card.effect === "cache") return cardIcon;
    if (card.effect === "pipeline") return cardsTakeIcon;
    if (card.effect === "accelerator") return hexagonSwitchIcon;
    if (card.effect === "recovery_cache") return cardsTakeIcon;
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
  if (card.type === "event") return "術式";
  if (card.type === "memory") return "遺物";
  if (card.subAttribute) return `${card.attribute}/${card.subAttribute}`;
  return card.attribute ?? "";
}

export function roleLabel(card: Card): string {
  if (card.type === "event") return "術式";
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
  if (card.effect === "optimize") return "手札を1枚トラッシュし、山札からカードを2枚引く";
  if (card.effect === "patch") return "自分の消耗中召喚獣1体を選んで回復する。山札からカードを1枚引く";
  if (card.effect === "disrupt") return "相手の未消耗召喚獣1体を消耗させる";
  if (card.effect === "purge") return "相手の消耗中召喚獣1体を選び、スタックごとトラッシュする";
  if (card.effect === "relearn") return "手札を1枚トラッシュし、トラッシュの召喚獣1枚を手札に戻す";
  if (card.effect === "sandbox") return "このターン、次のpower4攻撃後退場を1回防ぐ";
  if (card.effect === "trinity") return "自分の場に召喚獣が3枚いるときしか使用できない。自分の場の召喚獣3枚すべてをトラッシュし、相手のライフを1減らす";
  if (card.effect === "fire_rite") return "自分の場に火の召喚獣がいるときしか使用できない。相手の手札を1枚トラッシュする。相手の手札がなければ相手のライフを1減らす";
  if (card.effect === "water_rite") return "自分の場に水の召喚獣がいるときしか使用できない。山札からカードを1枚引く";
  if (card.effect === "wind_rite") return "自分の場に風の召喚獣がいるときしか使用できない。相手の未消耗召喚獣1体を選んで消耗させる。自分の消耗中風の召喚獣1体を選んで回復する";
  if (card.effect === "earth_rite") return "自分の場に土の召喚獣がいるときしか使用できない。トラッシュの召喚獣1枚を手札に戻す";
  if (card.effect === "comeback_rite") return "相手よりライフが少ないときしか使用できない。山札からカードを2枚引く。自分の消耗中召喚獣1体を選んで回復する";
  if (card.effect === "war_cry") return "このターン、自分の召喚獣すべては戦闘時、攻撃値+1";
  if (card.effect === "tide_edge") return "自分の場に水の召喚獣がいるときしか使用できない。自分の召喚獣1体を選ぶ。このターン、その召喚獣は戦闘時、攻撃値+2";
  if (card.effect === "pierce_sight") return "このターン、自分の次の攻撃は手札防御されない";
  if (card.effect === "grave_call") return "場に空きがあるときしか使用できない。トラッシュのpower2以下の召喚獣1枚を消耗状態で場に出す";
  if (card.effect === "salvage") return "トラッシュの術式1枚を手札に戻す。ただし、遺灰回収は選択できない。";
  if (card.effect === "overdrive") return "このターンに自分がチャージしていなければ使用できない。山札からカードを2枚引く";
  if (card.effect === "relic_crush") return "相手の遺物をトラッシュする";
  if (card.effect === "deep_current") return "自分の場に水の召喚獣が2体以上いるときしか使用できない。山札からカードを3枚引き、手札1枚をトラッシュする";
  if (card.effect === "firewall") return "他属性召喚獣の攻撃を場防御する時、手札を1枚トラッシュするなら power +1";
  if (card.effect === "cache") return "ターン開始時、手札2枚以下なら山札からカードを1枚引く";
  if (card.effect === "pipeline") return "1ターンに1回、power 1登場時、山札からカードを1枚引く";
  if (card.effect === "accelerator") return "1ターンに1回使える。場の召喚獣1体をトラッシュしてもよい。その場合、アクション+1する";
  if (card.effect === "resonator") return "自分がチャージした後、手札2枚以下なら山札からカードを1枚引く";
  if (card.effect === "recovery_cache") return "相手よりライフが少ない場合、自分のターン最初の召喚獣登場コストを1少なくする。1より少なくならない";
  if (card.effect === "war_banner") return "1ターンに1回、自分の攻撃で相手のライフが減った時、山札からカードを1枚引く";
  if (card.effect === "grove_rest") return "自分のターン終了時、自分のライフが相手より少なく、消耗中召喚獣が2体以上なら1体回復する";
  if (card.effect === "echo_urn") return "1ターンに1回、トラッシュから自分の手札にカードが戻った時、山札からカードを1枚引く";
  if (card.effect === "storm_core") return "自分がチャージした後、相手の未消耗召喚獣1体を消耗させる";
  if (card.effect === "tidal_mirror") return "自分の召喚獣が場防御した時、山札からカードを1枚引く";
  if (card.effect === "dual_banner") return "自分のターン開始時、自分の場に属性が2種類以上あり手札が2枚以下なら、山札からカードを2枚引く";
  const trait = card.effect ? ` / ${aiEffectText(card)}` : "";
  if (card.power === 1) return `1アクション${trait}`;
  if (card.power === 2) return `2アクション${trait}`;
  if (card.power === 3) return `${playCost(card)}アクション。${aiBaseRuleText(card)}${trait}`;
  if (card.power === 4) return `${playCost(card)}アクション。${aiBaseRuleText(card)}${trait}`;
  return "召喚獣";
}

export function selectedText(card: Card): string {
  if (card.type === "event") return `${card.name} / 術式 / ${roleText(card)}`;
  if (card.type === "memory") return `${card.name} / 遺物 / ${roleText(card)}`;
  return `${card.name} / ${card.attribute} / power ${card.power} / ${roleText(card)}`;
}

export function displayCost(
  card: Card,
  actionState: string,
  upgradeSource?: Card | null,
  game?: GameState,
): number {
  if (actionState === "chargeable") return 99;
  return actionState === "upgradeable" ? upgradeCost(card, upgradeSource) : playCost(card, game);
}
