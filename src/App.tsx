import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  CONFIG,
  BATTLE_DECK_IDS,
  DECKS,
  type AiAction,
  type AiProfile,
  type AttackContext,
  type DefenseChoice,
  type Card,
  type DeckId,
  type DuelDeckSource,
  type GameState,
  type PlayerState,
  addLog,
  activePlayer,
  applyEchoUrnDraw,
  attackCombatValue,
  bestUpgradeSource,
  canActivePlayerAttack,
  canChargeCard,
  canHumanAct,
  canHumanEndTurn,
  canUseAcceleratorMemory,
  canUseCharge,
  canUseFirewall,
  canUpgrade,
  cloneGame,
  commandUsable,
  strikeTargets,
  createGame,
  chooseAiAction,
  chooseAiDefense,
  defenseCombatValue,
  finishTurn,
  highestPowerAiInDiscard,
  highestPowerReadyAi,
  highestPowerSpentAi,
  highestPowerSpentAiByAttribute,
  legalFieldDefenders,
  legalHandDefenders,
  makeRng,
  needsFirewallFuel,
  opponentPlayer,
  playCost,
  recoversAiOnPlay,
  stackUpgradeCard,
  trashMemory,
  upgradeCost,
  upgradeSourceIndexes,
  visibleDrawText,
} from "./game";
import {
  afterAction,
  applyPlayEffects,
  beginAttackInDraft,
  chargeHandCardInDraft,
  confirmChargeGuardTargetInDraft,
  confirmChargeReadyAllyTargetInDraft,
  confirmChargeRecoverTargetInDraft,
  confirmChargeSpendEnemyTargetInDraft,
  discardHandCards,
  performAiActionInDraft,
  resolveDefenseInDraft,
  useAcceleratorMemoryInDraft,
  useCommandAtInDraft,
  strikeInDraft,
} from "./game/actions";
import { selectedCardForDetail, selectedHandCardName } from "./game/selectors";
import {
  TUTORIAL_SEED,
  createTutorialGame,
  currentTutorialStep,
  tutorialForcedAiAction,
  writeTutorialCompleted,
  type TutorialFocus,
  type TutorialStep,
} from "./tutorial";
import {
  DefensePanel,
  LogList,
  SelectedCardDetail,
  actionHintText,
} from "./components/DuelPanel";
import { CardLibraryPage, DeckBuilderPage, loadSavedDecks, validateDeck, type SavedDeck } from "./components/DeckWorkshop";
import { PackOpeningPage } from "./components/PackOpening";
import { MATCH_LOSE_COINS, MATCH_WIN_COINS, PACK_COST, addCoins, loadCoins, spendCoins } from "./collection";
import { CardArtPreview, CardView } from "./components/CardView";
import { cardColor, cardTypeLabel } from "./components/cardPresentation";
import { DiscardModal, RulesModal } from "./components/Modals";
import { DuelActionReel, EventToast, GameBanner, type Banner, type Toast } from "./components/Overlays";
import { duelEventDurationMs, type DuelEvent, type DuelEventPayload } from "./duelEvents";
import { RIVAL_VOICE_LINES, type RivalVoiceLineId } from "./rivalVoiceLines";
import battleBgm from "./assets/audio/battle_music_01-loop.ogg";
import finalBattleBgm from "./assets/audio/battle_music_final_loop.mp3";
import menuBgm from "./assets/audio/menu_music_loop.ogg";
import sfxAttack from "./assets/audio/sfx-attack.ogg";
import sfxBlock from "./assets/audio/sfx-block.ogg";
import sfxCardHover from "./assets/audio/sfx-card-hover.ogg";
import sfxCardPlay from "./assets/audio/sfx-card-play.ogg";
import sfxCharge from "./assets/audio/sfx-charge.ogg";
import sfxCommand from "./assets/audio/sfx-command.ogg";
import sfxDamage from "./assets/audio/sfx-damage.ogg";
import sfxDraw from "./assets/audio/sfx-card-draw.ogg";
import sfxSelect from "./assets/audio/sfx-select.ogg";
import sfxTrash from "./assets/audio/sfx-trash.ogg";
import sfxTurnEnd from "./assets/audio/sfx-turn-end.ogg";
import cardBackImage from "./assets/card-back.webp";
import leaderHumanImage from "./assets/leader-human-placeholder.webp";
import leaderRivalDelightImage from "./assets/leader-rival-delight.webp";
import leaderRivalHurtImage from "./assets/leader-rival-hurt.webp";
import leaderRivalImage from "./assets/leader-rival-placeholder.webp";
import brandMark from "./assets/mark.svg";

let eventId = 1;
const INITIAL_SEED = randomSeed();
const BATTLE_BGM_VOLUME = 0.32;
const FINAL_BATTLE_BGM_VOLUME = 0.36;
const MENU_BGM_VOLUME = 0.26;
const BGM_FADE_OUT_MS = 360;
const BGM_TRACK_SWITCH_PAUSE_MS = 160;
const BGM_FADE_IN_MS = 900;
const BGM_FADE_STEP_MS = 40;

type AppPage = "duel" | "cards" | "builder" | "packs";

type DeckSelection =
  | { kind: "random" }
  | { kind: "preset"; deckId: DeckId }
  | { kind: "saved"; deckId: string };

type ResolvedDeckSelection =
  | { kind: "preset"; deckId: DeckId }
  | { kind: "saved"; deck: SavedDeck };

const PAGE_PATHS: Record<AppPage, string> = {
  duel: "/duel",
  cards: "/cards",
  builder: "/builder",
  packs: "/packs",
};

type CardFlight = {
  id: number;
  card: Card | null;
  back?: boolean;
  label: string;
  tone: "human" | "ai";
  from: FlightRect;
  to: FlightRect;
  durationMs: number;
};

type FlightRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type TrashSurge = {
  owners: number[];
  tone: "cyan" | "magenta" | "danger";
};

type TrashFlash = TrashSurge & {
  id: number;
};

type PlayerIndex = 0 | 1;

type LifeImpact = {
  id: number;
  targetIndex: PlayerIndex;
  sourceIndex: PlayerIndex | null;
  amount: number;
};

type BreakDrawPulse = {
  id: number;
  targetIndex: PlayerIndex;
  count: number;
};

const AUTO_DISMISS_STORAGE_KEY = "break-duel:auto-dismiss-duel-events";

function loadAutoDismissPreference(): boolean {
  if (typeof localStorage === "undefined") return true;
  try {
    const stored = localStorage.getItem(AUTO_DISMISS_STORAGE_KEY);
    if (stored === null) return true;
    return stored === "true";
  } catch {
    return true;
  }
}

function hasStoredAutoDismissPreference(): boolean {
  if (typeof localStorage === "undefined") return true;
  try {
    return localStorage.getItem(AUTO_DISMISS_STORAGE_KEY) !== null;
  } catch {
    return true;
  }
}

function saveAutoDismissPreference(value: boolean): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(AUTO_DISMISS_STORAGE_KEY, value ? "true" : "false");
  } catch {
    // storage unavailable
  }
}

type LeaderReaction = {
  id: number;
  mood: "hurt" | "delight";
};

type LeaderReactionState = {
  0: LeaderReaction | null;
  1: LeaderReaction | null;
};

type MatchResultTone = "win" | "lose" | "draw";

type MatchResultView = {
  tone: MatchResultTone;
  kicker: string;
  title: string;
  lead: string;
  detail: string;
  reason: string;
};

type RivalSpeech = {
  id: number;
  lineId: RivalVoiceLineId;
  text: string;
};

type PendingRivalVoiceLine = {
  lineId: RivalVoiceLineId;
  text: string;
  force: boolean;
  stateKey: string;
};

type BgmTrack = {
  src: string;
  volume: number;
};

const RIVAL_ACTION_VOICE_LINE_IDS = [
  "play_summon",
  "upgrade",
  "memory",
  "charge",
  "attack",
  "command",
] as const satisfies readonly RivalVoiceLineId[];
type RivalActionVoiceLineId = typeof RIVAL_ACTION_VOICE_LINE_IDS[number];
type RivalVoiceTurnGroup = "odd" | "even";

const TRASH_SPARKS = [
  { x: 12, y: 18, delay: 0 },
  { x: 28, y: 12, delay: 70 },
  { x: 48, y: 8, delay: 25 },
  { x: 72, y: 14, delay: 115 },
  { x: 88, y: 24, delay: 45 },
  { x: 94, y: 48, delay: 145 },
  { x: 82, y: 74, delay: 80 },
  { x: 64, y: 88, delay: 15 },
  { x: 38, y: 86, delay: 125 },
  { x: 16, y: 68, delay: 55 },
  { x: 6, y: 46, delay: 105 },
  { x: 22, y: 34, delay: 170 },
];

const SFX_ASSETS: Record<string, { src: string; volume: number }> = {
  play: { src: sfxCardPlay, volume: 1 },
  attack: { src: sfxAttack, volume: 0.62 },
  block: { src: sfxBlock, volume: 0.58 },
  damage: { src: sfxDamage, volume: 0.66 },
  "damage-heavy": { src: sfxDamage, volume: 0.96 },
  command: { src: sfxCommand, volume: 0.48 },
  trash: { src: sfxTrash, volume: 0.52 },
  end: { src: sfxTurnEnd, volume: 0.46 },
  select: { src: sfxSelect, volume: 1 },
  hover: { src: sfxCardHover, volume: 1 },
  draw: { src: sfxDraw, volume: 0.72 },
  charge: { src: sfxCharge, volume: 0.82 },
};

const TRASH_SFX_PRIMARY_GRACE_MS = 450;
const RIVAL_LINE_REPEAT_COOLDOWN_MS = 6000;
const RIVAL_ACTION_VOICE_GROUP_SIZE = RIVAL_ACTION_VOICE_LINE_IDS.length / 2;
const RIVAL_HIGH_FREQUENCY_ACTION_LINES: readonly [RivalActionVoiceLineId, RivalActionVoiceLineId] = ["play_summon", "attack"];
const PRIMARY_SFX_KINDS = new Set(["play", "block", "damage", "damage-heavy", "charge"]);
const SFX_PRIORITY: Record<string, number> = {
  hover: 0,
  select: 1,
  trash: 1,
  draw: 1,
  end: 2,
  attack: 3,
  command: 3,
  play: 4,
  charge: 4,
  block: 4,
  damage: 4,
  "damage-heavy": 5,
};
const LOW_PRIORITY_SFX_KINDS = new Set(["hover", "select", "trash", "draw"]);

type CombatPreview = {
  attackerIndex: number;
  attackValue: number;
  fieldDefenses: Map<number, {
    result: "fail" | "trade" | "hold";
    label: string;
  }>;
  handDefenseCount: number;
  direct: boolean;
};

type TutorialAction = "select-hand" | "select-field" | "play" | "upgrade" | "attack" | "charge" | "end" | "defend" | "command" | "memory";
type TutorialFixedSelection = { zone: "hand" | "field"; ownerIndex: number; index: number } | null;

function randomSeed(): number {
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    const values = new Uint32Array(1);
    crypto.getRandomValues(values);
    return values[0] || 1;
  }
  return Math.floor(Date.now() % 4294967295) || 1;
}

function readResultPreviewTone(): MatchResultTone | null {
  if (!import.meta.env.DEV || typeof window === "undefined") return null;
  const searchTone = new URLSearchParams(window.location.search).get("resultPreview");
  const hashTone = new URLSearchParams(window.location.hash.replace(/^#/, "")).get("resultPreview");
  const tone = searchTone ?? hashTone;
  return tone === "win" || tone === "lose" || tone === "draw" ? tone : null;
}

function previewMatchResult(tone: MatchResultTone): MatchResultView {
  if (tone === "draw") {
    return {
      tone,
      kicker: "DRAW",
      title: "引き分け",
      lead: "決着なし",
      detail: "あなた 2 - 2 ライバル",
      reason: "プレビュー表示です。実戦では最終ログに決着理由が入ります。",
    };
  }
  return {
    tone,
    kicker: tone === "win" ? "VICTORY" : "DEFEAT",
    title: tone === "win" ? "あなたの勝利" : "ライバルの勝利",
    lead: tone === "win" ? "勝利しました" : "敗北しました",
    detail: tone === "win" ? "あなた 3 - 0 ライバル" : "あなた 0 - 3 ライバル",
    reason: "プレビュー表示です。実戦では最終ログに決着理由が入ります。",
  };
}

function pageFromPath(pathname: string): AppPage {
  if (pathname === PAGE_PATHS.cards) return "cards";
  if (pathname === PAGE_PATHS.builder) return "builder";
  if (pathname === PAGE_PATHS.packs) return "packs";
  return "duel";
}

function routeForPage(page: AppPage): string {
  return PAGE_PATHS[page];
}

function actionTokenClass(index: number, actionsRemaining: number): string {
  const active = index < actionsRemaining;
  return `action-token ${active ? "" : "spent"}`;
}

function createRivalActionVoiceTurnGroups(seed: number): Record<RivalActionVoiceLineId, RivalVoiceTurnGroup> {
  const rng = makeRng((seed ^ 0x5f3759df) >>> 0);
  const odd: RivalActionVoiceLineId[] = [];
  const even: RivalActionVoiceLineId[] = [];
  const [firstFrequent, secondFrequent] = RIVAL_HIGH_FREQUENCY_ACTION_LINES;
  if (rng() < 0.5) {
    odd.push(firstFrequent);
    even.push(secondFrequent);
  } else {
    odd.push(secondFrequent);
    even.push(firstFrequent);
  }

  const remaining = RIVAL_ACTION_VOICE_LINE_IDS.filter(
    (lineId) => lineId !== firstFrequent && lineId !== secondFrequent,
  );
  for (let index = remaining.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1));
    [remaining[index], remaining[swapIndex]] = [remaining[swapIndex], remaining[index]];
  }
  remaining.forEach((lineId) => {
    if (odd.length < RIVAL_ACTION_VOICE_GROUP_SIZE) {
      odd.push(lineId);
    } else {
      even.push(lineId);
    }
  });

  const groups = {} as Record<RivalActionVoiceLineId, RivalVoiceTurnGroup>;
  odd.forEach((lineId) => {
    groups[lineId] = "odd";
  });
  even.forEach((lineId) => {
    groups[lineId] = "even";
  });
  return groups;
}

function isRivalActionVoiceLineId(lineId: RivalVoiceLineId): lineId is RivalActionVoiceLineId {
  return (RIVAL_ACTION_VOICE_LINE_IDS as readonly RivalVoiceLineId[]).includes(lineId);
}

function trashSurgeForEvent(event: DuelEventPayload | DuelEvent | null): TrashSurge | null {
  if (!event || event.kind !== "trash") return null;
  const goesToTrash = event.toLabel?.includes("トラッシュ") || event.cards.some(({ state }) => state === "trash");
  if (!goesToTrash) return null;
  if (event.tone === "magenta") return { owners: [0], tone: "magenta" };
  if (event.tone === "cyan") return { owners: [1], tone: "cyan" };
  return { owners: [0, 1], tone: "danger" };
}

function tutorialAllowsAction(
  step: TutorialStep,
  action: TutorialAction,
  game: GameState,
  options: { handIndex?: number; fieldOwnerIndex?: number; fieldIndex?: number; defenseChoice?: DefenseChoice } = {},
): boolean {
  const handCard = typeof options.handIndex === "number" ? game.players[0].hand[options.handIndex] : null;
  if (action === "select-hand") {
    if (step.id === "select-summon" || step.id === "play-summon") return handCard?.id === "AI-FIRE-1B";
    if (step.id === "select-second-summon" || step.id === "play-second-summon") return handCard?.id === "AI-FIRE-2";
    if (step.id === "command") return handCard?.id === "CMD-FIRE-RITE";
    if (step.id === "purge-command") return handCard?.id === "CMD-PURGE";
    if (step.id === "select-charge" || step.id === "charge") return handCard?.id === "AI-FIRE-1C";
    if (step.id === "select-post-charge-memory" || step.id === "play-post-charge-memory") return handCard?.id === "MEM-CACHE";
    if (step.id === "select-upgrade" || step.id === "upgrade") return handCard?.id === "AI-FIRE-3B";
    if (step.id === "select-power4-upgrade" || step.id === "upgrade-power4") return handCard?.id === "AI-FIRE-4";
    return false;
  }
  if (action === "select-field") {
    if (options.fieldOwnerIndex === 1 && typeof options.fieldIndex === "number") {
      if (step.id === "purge-command") return game.pendingTarget?.kind === "purge" && game.players[1].spentFieldIndexes.has(options.fieldIndex);
      if (step.id === "strike-monster") return game.pendingTarget?.kind === "strike";
      return false;
    }
    if (options.fieldOwnerIndex !== 0 || typeof options.fieldIndex !== "number" || game.players[0].spentFieldIndexes.has(options.fieldIndex)) return false;
    const fieldCard = game.players[0].field[options.fieldIndex];
    if (step.id === "saved-action-attack") return fieldCard?.id === "AI-FIRE-2";
    if (step.id === "strike-monster") return fieldCard?.id === "AI-FIRE-2";
    if (step.id === "power4-attack") return fieldCard?.id === "AI-FIRE-4";
    return step.id === "attack" && fieldCard?.id === "AI-FIRE-2";
  }
  if (action === "play") return step.id === "play-summon" || step.id === "play-second-summon" || step.id === "command" || step.id === "purge-command" || step.id === "upgrade" || step.id === "play-post-charge-memory";
  if (action === "command") return step.id === "command" || step.id === "purge-command";
  if (action === "upgrade") return step.id === "upgrade-power4";
  if (action === "attack") {
    const selected = game.selected?.zone === "field" && (game.selected.ownerIndex ?? 0) === 0
      ? game.players[0].field[game.selected.index]
      : null;
    if (step.id === "saved-action-attack") return selected?.id === "AI-FIRE-2";
    if (step.id === "strike-monster") return selected?.id === "AI-FIRE-2";
    if (step.id === "power4-attack") return selected?.id === "AI-FIRE-4";
    return step.id === "attack" && selected?.id === "AI-FIRE-2";
  }
  if (action === "charge") return step.id === "charge";
  if (action === "end") return step.id === "end-first-turn" || step.id === "end-after-memory" || step.id === "end-after-attack" || step.id === "end-after-power3-upgrade" || step.id === "end-after-upgrade";
  if (action === "defend") {
    if (step.id === "defend") return options.defenseChoice?.type === "hand";
    if (step.id === "field-defend") return options.defenseChoice?.type === "field";
    if (step.id === "take-break-draw") return options.defenseChoice?.type === "none";
  }
  return false;
}

function tutorialActionHint(step: TutorialStep): string {
  if (step.id === "select-summon") return "『火花一番ピリカ』を選んでください";
  if (step.id === "play-summon") return "場に出すボタンを押してください";
  if (step.id === "end-first-turn") return "ターン終了を押してください";
  if (step.id === "watch-rival") return "ライバルの行動を確認してください";
  if (step.id === "select-second-summon") return "『炉殻バサルトン』を選んでください";
  if (step.id === "play-second-summon") return "場に出すボタンを押してください";
  if (step.id === "defend") return "手札の防御候補を選んでください";
  if (step.id === "attack") return "『炉殻バサルトン』を選んで攻撃してください";
  if (step.id === "command") return "『紅蓮圧壊術』を選んで発動してください";
  if (step.id === "select-charge") return "チャージできるカードを選んでください";
  if (step.id === "charge") return "チャージボタンを押してください";
  if (step.id === "select-post-charge-memory") return "『灯火の旅嚢』を選んでください";
  if (step.id === "play-post-charge-memory") return "場に出すボタンを押してください";
  if (step.id === "end-after-memory") return "ターン終了で遺物の継続効果を確認します";
  if (step.id === "end-after-attack") return "ターン終了を押してください";
  if (step.id === "select-upgrade") return "『噴角イグナロス』を選んでください";
  if (step.id === "upgrade") return "場に出すボタンを押してください";
  if (step.id === "end-after-power3-upgrade") return "ターン終了で大型アップグレードへ進みます";
  if (step.id === "select-power4-upgrade") return "『終火の影ヴァルガ』を選んでください";
  if (step.id === "upgrade-power4") return "アップグレードボタンを押してください";
  if (step.id === "saved-action-attack") return "『炉殻バサルトン』で攻撃してください";
  if (step.id === "end-after-upgrade") return "ターン終了で手札防御へ進みます";
  if (step.id === "field-defend") return "場の防御候補を選んでください";
  if (step.id === "purge-command") return "『追撃粛清』を選んで、消耗中の相手召喚獣に発動してください";
  if (step.id === "strike-monster") return "『炉殻バサルトン』を選び、攻撃ボタンから相手の召喚獣を対象にしてください";
  if (step.id === "power4-attack") return "『終火の影ヴァルガ』で攻撃してください";
  if (step.id === "take-break-draw") return "「防御しない」を選んでブレイクドローを確認してください";
  return "チュートリアルは完了しています";
}

function tutorialFocusMatchesCard(focus: TutorialFocus | undefined, ownerIndex: number, zone: "hand" | "field" | "memory", card: Card | null, index: number): boolean {
  if (!focus || !card) return false;
  if (focus.kind === "hand-card") return zone === "hand" && focus.ownerIndex === ownerIndex && focus.cardId === card.id;
  if (focus.kind === "field-card") return zone === "field" && focus.ownerIndex === ownerIndex && focus.index === index;
  return false;
}

function tutorialFocusMatchesAction(focus: TutorialFocus | undefined, action: "play" | "upgrade" | "attack" | "command" | "charge" | "end"): boolean {
  if (!focus || focus.kind !== "action") return false;
  if (focus.action === "command" && action === "play") return true;
  return focus.action === action;
}

function tutorialFixedSelection(step: TutorialStep | null, game: GameState): TutorialFixedSelection {
  const focus = step?.focus;
  if (!focus) return null;
  if (focus.kind === "hand-card") {
    if (
      step?.id === "select-summon"
      || step?.id === "play-summon"
      || step?.id === "select-second-summon"
      || step?.id === "play-second-summon"
      || step?.id === "command"
      || step?.id === "select-charge"
      || step?.id === "charge"
      || step?.id === "select-post-charge-memory"
      || step?.id === "play-post-charge-memory"
      || step?.id === "select-upgrade"
      || step?.id === "upgrade"
      || step?.id === "select-power4-upgrade"
      || step?.id === "upgrade-power4"
      || step?.id === "purge-command"
    ) return null;
    const index = game.players[focus.ownerIndex].hand.findIndex((card) => card.id === focus.cardId);
    return index >= 0 ? { zone: "hand", ownerIndex: focus.ownerIndex, index } : null;
  }
  if (focus.kind === "field-card") {
    if (step?.id === "attack" || step?.id === "saved-action-attack" || step?.id === "strike-monster" || step?.id === "power4-attack") return null;
    return { zone: "field", ownerIndex: focus.ownerIndex, index: focus.index };
  }
  return null;
}

function tutorialForcedDefenseChoice(step: TutorialStep | null, game: GameState): DefenseChoice | null {
  if (!game.pendingAttack) return null;
  if (step?.id === "field-defend") {
    const defender = game.players[game.pendingAttack.defenderIndex];
    const fieldIndex = defender.field.findIndex((card, index) => card.id === "AI-FIRE-2" && !defender.spentFieldIndexes.has(index));
    return fieldIndex >= 0 ? { type: "field", index: fieldIndex } : null;
  }
  if (step?.id === "take-break-draw") return { type: "none" };
  if (step?.id !== "defend") return null;
  const defender = game.players[game.pendingAttack.defenderIndex];
  const handIndex = defender.hand.findIndex((card) => card.id === "AI-FIRE-2B");
  return handIndex >= 0 ? { type: "hand", index: handIndex } : null;
}

function tutorialUpgradeSourceIndexes(step: TutorialStep | null, player: PlayerState, target: Card, sourceIndexes: number[]): number[] {
  if (step?.id !== "upgrade-power4" || target.id !== "AI-FIRE-4") return sourceIndexes;
  return sourceIndexes.filter((index) => player.field[index]?.id === "AI-FIRE-3B");
}

function tutorialAiTurnKey(game: GameState, step: TutorialStep | null): string {
  return `${game.turn}:${game.active}:${step?.kicker ?? ""}:${step?.title ?? ""}`;
}

export default function App() {
  const [page, setPage] = useState<AppPage>(() => pageFromPath(window.location.pathname));
  const [seed, setSeed] = useState(INITIAL_SEED);
  const [playerDeckSelection, setPlayerDeckSelection] = useState<DeckSelection>({ kind: "preset", deckId: "fire" });
  const [opponentDeckSelection, setOpponentDeckSelection] = useState<DeckSelection>({ kind: "random" });
  const [opponentAiProfile, setOpponentAiProfile] = useState<AiProfile>("challenger");
  const [savedDecks, setSavedDecks] = useState<SavedDeck[]>(() => loadSavedDecks());
  const [game, setGame] = useState<GameState>(() => createGame(INITIAL_SEED, "fire", undefined, "challenger"));
  const [lastHumanActionsRemaining, setLastHumanActionsRemaining] = useState(() => game.actionsRemaining);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [starterDeckSetupOpen, setStarterDeckSetupOpen] = useState(true);
  const [tutorialActive, setTutorialActive] = useState(false);
  const [tutorialAiAdvanceKey, setTutorialAiAdvanceKey] = useState<string | null>(null);
  const [tutorialAiAdvancePending, setTutorialAiAdvancePending] = useState(false);
  const [aiGateRetryTick, setAiGateRetryTick] = useState(0);
  const [toast, setToast] = useState<Toast>(null);
  const [coins, setCoins] = useState(() => loadCoins());
  const [duelEvent, setDuelEvent] = useState<DuelEvent | null>(null);
  const [cardFlights, setCardFlights] = useState<CardFlight[]>([]);
  const [trashFlash, setTrashFlash] = useState<TrashFlash | null>(null);
  const [lifeImpact, setLifeImpact] = useState<LifeImpact | null>(null);
  const [leaderReactions, setLeaderReactions] = useState<LeaderReactionState>({ 0: null, 1: null });
  const [rivalSpeech, setRivalSpeech] = useState<RivalSpeech | null>(null);
  const [aiAnimating, setAiAnimating] = useState(false);
  const [autoDismissDuelEvents, setAutoDismissDuelEvents] = useState(() => loadAutoDismissPreference());
  const [breakDrawPulse, setBreakDrawPulse] = useState<BreakDrawPulse | null>(null);
  const [banner, setBanner] = useState<Banner>(() => ({
    kind: "start",
    title: "BREAK DUEL",
    detail: `Seed ${INITIAL_SEED} / 先攻: あなた / ${CONFIG.maxTurns}手番制限`,
    id: eventId++,
  }));
  const [audioEnabled, setAudioEnabled] = useState(false);
  const audioEnabledRef = useRef(false);
  const audioContext = useRef<AudioContext | null>(null);
  const bgmAudio = useRef<HTMLAudioElement | null>(null);
  const bgmSrc = useRef<string | null>(null);
  const bgmFadeTimer = useRef<number | null>(null);
  const bgmSwitchTimer = useRef<number | null>(null);
  const sfxBuffers = useRef<Partial<Record<string, AudioBuffer>>>({});
  const pendingSfxBuffers = useRef<Partial<Record<string, Promise<void>>>>({});
  const lastSfxPlayedAt = useRef<Record<string, number>>({});
  const lastPrimarySfxPlayedAt = useRef(0);
  const activeSfxSources = useRef<{ kind: string; priority: number; source: AudioBufferSourceNode }[]>([]);
  const breakDrawPulseTimer = useRef<number | null>(null);
  const duelEventQueue = useRef<DuelEventPayload[]>([]);
  const duelEventPlaying = useRef(false);
  const duelEventScheduler = useRef<number | null>(null);
  const duelEventTimer = useRef<number | null>(null);
  const cardFlightTimers = useRef<number[]>([]);
  const aiCommitTimer = useRef<number | null>(null);
  const trashFlashTimer = useRef<number | null>(null);
  const lifeImpactTimer = useRef<number | null>(null);
  const lifeImpactScheduleTimers = useRef<number[]>([]);
  const leaderReactionTimers = useRef<Partial<Record<PlayerIndex, number>>>({});
  const rivalSpeechTimer = useRef<number | null>(null);
  const rivalVoiceAudio = useRef<HTMLAudioElement | null>(null);
  const lastRivalLine = useRef<{ text: string; at: number } | null>(null);
  const pendingRivalVoiceLine = useRef<PendingRivalVoiceLine | null>(null);
  const currentRivalVoiceStateKey = useRef("");
  const gameResolvedRef = useRef(false);
  const announcedResultKey = useRef<string | null>(null);
  const coinAwardedKey = useRef<string | null>(null);
  const rivalActionVoiceTurnGroups = useRef(createRivalActionVoiceTurnGroups(INITIAL_SEED));
  const announcedAutoDismissDefault = useRef(false);
  const recentLifeDamageImpact = useRef<DuelEventPayload["impact"] | null>(null);
  const suppressedTrashSfxOwners = useRef<Partial<Record<number, number>>>({});
  const previousDiscardCounts = useRef<[number, number]>([
    game.players[0].discard.length,
    game.players[1].discard.length,
  ]);
  const previousDrawCounts = useRef<[number, number, number, number, number, number]>([
    game.players[0].deck.length,
    game.players[0].hand.length,
    game.players[0].cardsDrawn,
    game.players[1].deck.length,
    game.players[1].hand.length,
    game.players[1].cardsDrawn,
  ]);
  const previousLifeCounts = useRef<[number, number]>([
    game.players[0].life,
    game.players[1].life,
  ]);

  const human = game.players[0];
  const ai = game.players[1];
  const active = activePlayer(game);
  const opponent = opponentPlayer(game);
  const selectedCard = selectedCardForDetail(game);
  const tutorialStep = tutorialActive ? currentTutorialStep(game) : null;
  currentRivalVoiceStateKey.current = `${game.turn}:${game.active}:${game.winner ?? "playing"}:${game.draw ? "draw" : "active"}`;
  gameResolvedRef.current = game.winner !== null || game.draw;

  function mutate(mutator: (draft: GameState) => void) {
    setGame((current) => {
      const draft = cloneGame(current);
      mutator(draft);
      return draft;
    });
  }

  function showToast(title: string, detail = "") {
    setToast({ title, detail, id: eventId++ });
  }

  function markTutorialCompleted() {
    writeTutorialCompleted(true);
  }

  function finishTutorial() {
    markTutorialCompleted();
    setTutorialActive(false);
    setTutorialAiAdvanceKey(null);
    setTutorialAiAdvancePending(false);
    setStarterDeckSetupOpen(true);
    resetDuelEvents();
    // チュートリアル中は手動確認へ固定しているため、保存済みの演出設定に戻す
    setAutoDismissDuelEvents(loadAutoDismissPreference());
    showToast("チュートリアル完了", "通常対戦を始められます");
  }

  function tutorialBlocks(action: TutorialAction, options: { handIndex?: number; fieldOwnerIndex?: number; fieldIndex?: number; defenseChoice?: DefenseChoice } = {}) {
    if (!tutorialStep) return false;
    if (tutorialStep.id === "complete") return false;
    const allowed = tutorialAllowsAction(tutorialStep, action, game, options);
    if (allowed) return false;
    showToast("チュートリアル進行中", tutorialActionHint(tutorialStep));
    return true;
  }

  function showBanner(next: Omit<NonNullable<Banner>, "id">) {
    setBanner({ ...next, id: eventId++ });
  }

  function showRivalVoiceLine(lineId: RivalVoiceLineId, options: { force?: boolean; skipTurnEligibility?: boolean } = {}) {
    const line = RIVAL_VOICE_LINES[lineId];
    if (!line) return;
    if (!rivalVoiceLineAllowedForCurrentOutcome(lineId)) return;
    if (!options.skipTurnEligibility && !rivalVoiceLineEligibleForCurrentTurn(lineId)) return;
    if (!options.force && recentlySpokeRivalLine(line.text)) return;
    if (options.force && rivalVoiceLineBusy()) {
      pendingRivalVoiceLine.current = null;
      if (rivalSpeechTimer.current !== null) window.clearTimeout(rivalSpeechTimer.current);
      rivalSpeechTimer.current = null;
      setRivalSpeech(null);
      stopRivalVoiceLine();
    }
    if (rivalVoiceLineBusy()) {
      const pending = { lineId, text: line.text, force: Boolean(options.force), stateKey: currentRivalVoiceStateKey.current };
      if (!pendingRivalVoiceLine.current || pending.force) pendingRivalVoiceLine.current = pending;
      return;
    }
    displayRivalVoiceLine(lineId, line.text);
  }

  function displayRivalVoiceLine(lineId: RivalVoiceLineId, text: string) {
    const line = RIVAL_VOICE_LINES[lineId];
    if (!line) return;
    lastRivalLine.current = { text, at: Date.now() };
    setRivalSpeech({ id: eventId++, lineId, text });
    rivalSpeechTimer.current = window.setTimeout(() => {
      setRivalSpeech(null);
      rivalSpeechTimer.current = null;
      flushPendingRivalVoiceLine();
    }, Math.max(2800, text.length * 95));
    playRivalVoiceLine(lineId);
  }

  function flushPendingRivalVoiceLine() {
    const pending = pendingRivalVoiceLine.current;
    pendingRivalVoiceLine.current = null;
    if (!pending) return;
    if (pending.stateKey !== currentRivalVoiceStateKey.current) return;
    if (!rivalVoiceLineAllowedForCurrentOutcome(pending.lineId)) return;
    if (!pending.force && recentlySpokeRivalLine(pending.text)) return;
    if (rivalVoiceLineBusy()) {
      pendingRivalVoiceLine.current = pending;
      return;
    }
    displayRivalVoiceLine(pending.lineId, pending.text);
  }

  function rivalVoiceLineBusy() {
    if (rivalSpeechTimer.current !== null) return true;
    const currentVoice = rivalVoiceAudio.current;
    return Boolean(currentVoice && !currentVoice.ended && !currentVoice.paused);
  }

  function recentlySpokeRivalLine(text: string) {
    const last = lastRivalLine.current;
    return Boolean(last && last.text === text && Date.now() - last.at < RIVAL_LINE_REPEAT_COOLDOWN_MS);
  }

  function rivalVoiceLineEligibleForCurrentTurn(lineId: RivalVoiceLineId) {
    if (lineId === "rival_turn_start") return game.active === 1 && rivalTurnNumber() === 1;
    if (!isRivalActionVoiceLineId(lineId)) return true;
    const rivalTurn = rivalTurnNumber();
    if (rivalTurn <= 0) return false;
    const currentGroup: RivalVoiceTurnGroup = rivalTurn % 2 === 1 ? "odd" : "even";
    return rivalActionVoiceTurnGroups.current[lineId] === currentGroup;
  }

  function rivalVoiceLineAllowedForCurrentOutcome(lineId: RivalVoiceLineId) {
    if (!gameResolvedRef.current) return true;
    return lineId === "victory" || lineId === "defeat";
  }

  function rivalTurnNumber() {
    return game.players[1]?.turnsStarted ?? 0;
  }

  function playRivalVoiceLine(lineId: RivalVoiceLineId) {
    if (!audioEnabledRef.current) return;
    const line = RIVAL_VOICE_LINES[lineId];
    if (!line) return;
    stopRivalVoiceLine();
    const audio = new Audio(line.src);
    audio.volume = 0.88;
    audio.addEventListener("ended", () => {
      if (rivalVoiceAudio.current !== audio) return;
      rivalVoiceAudio.current = null;
      flushPendingRivalVoiceLine();
    }, { once: true });
    rivalVoiceAudio.current = audio;
    void audio.play().catch((error) => {
      console.warn("Rival voice playback failed", lineId, error);
    });
  }

  function stopRivalVoiceLine() {
    const audio = rivalVoiceAudio.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
    rivalVoiceAudio.current = null;
  }

  function refreshSavedDecks() {
    setSavedDecks(loadSavedDecks());
  }

  function queueDuelEvent(event: DuelEventPayload) {
    const queuedEvent = rivalVoiceLineEligibleForEvent(event);
    const hasTrashSurge = trashSurgeForEvent(queuedEvent) !== null;
    if (queuedEvent.impact?.kind === "life-damage") {
      recentLifeDamageImpact.current = queuedEvent.impact;
      scheduleLifeDamageImpact(queuedEvent.impact, { suppressRivalDamageVoice: Boolean(queuedEvent.rivalVoiceLine) });
    }
    if (queuedEvent.breakDraw) scheduleBreakDrawPulse(queuedEvent.breakDraw);
    if (
      (queuedEvent.kind === "play" || queuedEvent.kind === "memory" || queuedEvent.kind === "upgrade" || queuedEvent.kind === "command")
      && !hasTrashSurge
      && !queuedEvent.impact
      && queuedEvent.emphasis !== "peak"
    ) {
      if (queuedEvent.rivalVoiceLine) showRivalVoiceLine(queuedEvent.rivalVoiceLine, { skipTurnEligibility: true });
      return;
    }
    duelEventQueue.current.push(queuedEvent);
    if (duelEventScheduler.current !== null) return;
    duelEventScheduler.current = window.setTimeout(() => {
      duelEventScheduler.current = null;
      playNextDuelEvent();
    }, 0);
  }

  function playNextDuelEvent() {
    if (duelEventPlaying.current) return;
    const next = duelEventQueue.current.shift();
    if (!next) return;
    duelEventPlaying.current = true;
    const event = { ...next, id: eventId++ };
    setDuelEvent(event);
    if (event.rivalVoiceLine) showRivalVoiceLine(event.rivalVoiceLine, { skipTurnEligibility: true });
    if (!autoDismissDuelEvents) return;
    duelEventTimer.current = window.setTimeout(() => {
      dismissDuelEvent();
    }, duelEventDurationMs(event));
  }

  function dismissDuelEvent() {
    if (duelEventTimer.current !== null) window.clearTimeout(duelEventTimer.current);
    duelEventTimer.current = null;
    setDuelEvent(null);
    duelEventPlaying.current = false;
    playNextDuelEvent();
  }

  function updateAutoDismissDuelEvents(next: boolean) {
    saveAutoDismissPreference(next);
    setAutoDismissDuelEvents(next);
  }

  function scheduleBreakDrawPulse(breakDraw: NonNullable<DuelEventPayload["breakDraw"]>) {
    const targetIndex = normalizePlayerIndex(breakDraw.targetPlayerIndex);
    if (targetIndex === null) return;
    if (breakDrawPulseTimer.current !== null) window.clearTimeout(breakDrawPulseTimer.current);
    setBreakDrawPulse({ id: eventId++, targetIndex, count: breakDraw.count });
    breakDrawPulseTimer.current = window.setTimeout(() => {
      setBreakDrawPulse(null);
      breakDrawPulseTimer.current = null;
    }, 1700);
  }

  function rivalVoiceLineEligibleForEvent(event: DuelEventPayload): DuelEventPayload {
    if (!event.rivalVoiceLine || rivalVoiceLineEligibleForCurrentTurn(event.rivalVoiceLine)) return event;
    return { ...event, rivalVoiceLine: undefined };
  }

  function clearLifeImpactScheduleTimers() {
    lifeImpactScheduleTimers.current.forEach((timer) => window.clearTimeout(timer));
    lifeImpactScheduleTimers.current = [];
  }

  function resetDuelEvents() {
    if (duelEventScheduler.current !== null) window.clearTimeout(duelEventScheduler.current);
    if (duelEventTimer.current !== null) window.clearTimeout(duelEventTimer.current);
    duelEventScheduler.current = null;
    duelEventTimer.current = null;
    duelEventQueue.current = [];
    duelEventPlaying.current = false;
    setDuelEvent(null);
    if (rivalSpeechTimer.current !== null) window.clearTimeout(rivalSpeechTimer.current);
    rivalSpeechTimer.current = null;
    setRivalSpeech(null);
    lastRivalLine.current = null;
    pendingRivalVoiceLine.current = null;
    stopRivalVoiceLine();
    cardFlightTimers.current.forEach((timer) => window.clearTimeout(timer));
    if (aiCommitTimer.current !== null) window.clearTimeout(aiCommitTimer.current);
    cardFlightTimers.current = [];
    aiCommitTimer.current = null;
    if (trashFlashTimer.current !== null) window.clearTimeout(trashFlashTimer.current);
    trashFlashTimer.current = null;
    clearLifeImpactScheduleTimers();
    if (lifeImpactTimer.current !== null) window.clearTimeout(lifeImpactTimer.current);
    lifeImpactTimer.current = null;
    if (breakDrawPulseTimer.current !== null) window.clearTimeout(breakDrawPulseTimer.current);
    breakDrawPulseTimer.current = null;
    Object.values(leaderReactionTimers.current).forEach((timer) => {
      if (typeof timer === "number") window.clearTimeout(timer);
    });
    leaderReactionTimers.current = {};
    recentLifeDamageImpact.current = null;
    setAiAnimating(false);
    setCardFlights([]);
    setTrashFlash(null);
    setLifeImpact(null);
    setBreakDrawPulse(null);
    setLeaderReactions({ 0: null, 1: null });
  }

  function resetDrawTracker(nextGame: GameState) {
    previousDrawCounts.current = [
      nextGame.players[0].deck.length,
      nextGame.players[0].hand.length,
      nextGame.players[0].cardsDrawn,
      nextGame.players[1].deck.length,
      nextGame.players[1].hand.length,
      nextGame.players[1].cardsDrawn,
    ];
    previousDiscardCounts.current = [
      nextGame.players[0].discard.length,
      nextGame.players[1].discard.length,
    ];
    previousLifeCounts.current = [
      nextGame.players[0].life,
      nextGame.players[1].life,
    ];
  }

  function normalizePlayerIndex(index: number | null | undefined): PlayerIndex | null {
    return index === 0 || index === 1 ? index : null;
  }

  function showLifeImpact(targetIndex: PlayerIndex, amount: number, sourceIndex: PlayerIndex | null) {
    if (lifeImpactTimer.current !== null) window.clearTimeout(lifeImpactTimer.current);
    setLifeImpact({
      id: eventId++,
      targetIndex,
      sourceIndex,
      amount,
    });
    lifeImpactTimer.current = window.setTimeout(() => {
      setLifeImpact(null);
      lifeImpactTimer.current = null;
    }, 1350);
  }

  function showLeaderReaction(ownerIndex: PlayerIndex, mood: LeaderReaction["mood"]) {
    const existingTimer = leaderReactionTimers.current[ownerIndex];
    if (typeof existingTimer === "number") window.clearTimeout(existingTimer);
    setLeaderReactions((current) => ({
      ...current,
      [ownerIndex]: { id: eventId++, mood },
    }));
    leaderReactionTimers.current[ownerIndex] = window.setTimeout(() => {
      setLeaderReactions((current) => ({
        ...current,
        [ownerIndex]: null,
      }));
      delete leaderReactionTimers.current[ownerIndex];
    }, mood === "delight" ? 1400 : 1500);
  }

  function scheduleLifeDamageImpact(
    impact: NonNullable<DuelEventPayload["impact"]>,
    options: { suppressRivalDamageVoice?: boolean } = {},
  ) {
    const timer = window.setTimeout(() => {
      lifeImpactScheduleTimers.current = lifeImpactScheduleTimers.current.filter((item) => item !== timer);
      const targetIndex = normalizePlayerIndex(impact.targetPlayerIndex);
      if (targetIndex === null) return;
      const sourceIndex = normalizePlayerIndex(impact.sourcePlayerIndex);
      showLifeImpact(targetIndex, impact.amount, sourceIndex);
      showLeaderReaction(targetIndex, "hurt");
      if (targetIndex === 1 && !impact.fatal && !options.suppressRivalDamageVoice) showRivalVoiceLine("damage_taken");
      if (targetIndex === 0 && sourceIndex === 1) {
        showLeaderReaction(1, "delight");
      }
    }, 0);
    lifeImpactScheduleTimers.current.push(timer);
  }

  function cardSelector(ownerIndex: number, zone: string, index: number) {
    return `[data-owner="${ownerIndex}"][data-zone="${zone}"][data-index="${index}"]`;
  }

  function launchCardFlight({
    card,
    back = false,
    from,
    to,
    label,
    tone = "human",
    durationMs = 760,
  }: {
    card: Card | null;
    back?: boolean;
    from: { ownerIndex: number; zone: string; index: number };
    to: { ownerIndex: number; zone: string; index: number };
    label: string;
    tone?: "human" | "ai";
    durationMs?: number;
  }) {
    const fromElement = document.querySelector(cardSelector(from.ownerIndex, from.zone, from.index));
    const toElement = document.querySelector(cardSelector(to.ownerIndex, to.zone, to.index));
    if (!fromElement || !toElement) return;
    if (banner?.kind === "turn") setBanner(null);
    const rawFrom = fromElement.getBoundingClientRect();
    const rawTo = toElement.getBoundingClientRect();
    const targetRect = normalizeFlightTarget(rawTo, to.zone);
    const fromRect = from.zone === "hand-source"
      ? {
          left: rawFrom.left + rawFrom.width / 2 - 44,
          top: rawFrom.bottom + 12,
          width: 88,
          height: 124,
        }
      : rectLike(rawFrom);
    const flight = {
      id: eventId++,
      card,
      back,
      label,
      tone,
      from: fromRect,
      to: targetRect,
      durationMs,
    };
    setCardFlights((current) => [...current.slice(-5), flight]);
    const timer = window.setTimeout(() => {
      setCardFlights((current) => current.filter((item) => item.id !== flight.id));
      cardFlightTimers.current = cardFlightTimers.current.filter((item) => item !== timer);
    }, durationMs);
    cardFlightTimers.current.push(timer);
  }

  function rectLike(rect: DOMRect): FlightRect {
    return {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    };
  }

  function normalizeFlightTarget(rect: DOMRect, zone: string): FlightRect {
    if (zone === "discard") {
      const width = Math.min(92, Math.max(42, rect.width - 10));
      const height = Math.min(132, Math.max(60, rect.height - 10));
      return {
        left: rect.left + (rect.width - width) / 2,
        top: rect.top + (rect.height - height) / 2,
        width,
        height,
      };
    }
    if (zone !== "field" && zone !== "memory") return rectLike(rect);
    const width = 110;
    const height = 155;
    return {
      left: rect.left + (rect.width - width) / 2,
      top: rect.top + (rect.height - height) / 2,
      width,
      height,
    };
  }

  function trashTargetIndex(player: PlayerState) {
    return Math.max(0, player.discard.length - 1);
  }

  function launchDrawFlight(ownerIndex: number, handIndex: number, delayMs: number) {
    const player = game.players[ownerIndex];
    if (!player) return;
    window.setTimeout(() => {
      launchCardFlight({
        card: null,
        back: true,
        from: { ownerIndex, zone: "deck", index: 0 },
        to: {
          ownerIndex,
          zone: player.isHuman ? "hand" : "hand-source",
          index: player.isHuman ? handIndex : 0,
        },
        label: "ドロー",
        tone: flightTone(player),
        durationMs: 680,
      });
    }, delayMs);
  }

  function flightTone(player: PlayerState): "human" | "ai" {
    return player.isHuman ? "human" : "ai";
  }

  function flightHandZone(player: PlayerState): "hand" | "hand-source" {
    return player.isHuman ? "hand" : "hand-source";
  }

  function launchRecoverFlight(card: Card | null | undefined, ownerIndex: number, discardIndex: number, label = "回収") {
    const player = game.players[ownerIndex];
    if (!card || !player) return;
    const exactDiscardSource = document.querySelector(cardSelector(ownerIndex, "discard", discardIndex));
    const sourceIndex = exactDiscardSource ? discardIndex : trashTargetIndex(player);
    launchCardFlight({
      card,
      from: { ownerIndex, zone: "discard", index: sourceIndex },
      to: { ownerIndex, zone: "hand-source", index: 0 },
      label,
      tone: flightTone(player),
      durationMs: 900,
    });
  }

  function commandRecoverPreview(player: PlayerState, command: Card, targetIndex: number | null): { card: Card; index: number } | null {
    if (command.effect !== "relearn" && command.effect !== "earth_rite") return null;
    const index = command.effect === "relearn"
      ? targetIndex ?? highestPowerAiInDiscard(player)
      : targetIndex ?? highestPowerAiInDiscard(player);
    if (index === null) return null;
    const card = player.discard[index];
    return card ? { card, index } : null;
  }

  function recoverOnPlayPreview(player: PlayerState, card: Card, excludedCard?: Card): { card: Card; index: number } | null {
    if (!recoversAiOnPlay(card) || player.hand.length - 1 > 1) return null;
    const index = highestPowerAiInDiscard(player, excludedCard);
    if (index === null) return null;
    const recovered = player.discard[index];
    return recovered ? { card: recovered, index } : null;
  }

  function launchTrashFlight(
    card: Card | null | undefined,
    from: { ownerIndex: number; zone: string; index: number },
    ownerIndex: number,
    label = "トラッシュへ",
    durationMs = 720,
  ) {
    const player = game.players[ownerIndex];
    if (!card || !player) return;
    launchCardFlight({
      card,
      from,
      to: { ownerIndex, zone: "discard", index: trashTargetIndex(player) },
      label,
      tone: flightTone(player),
      durationMs,
    });
  }

  function launchDefenseTrashFlights(attackerIndex: number, fieldIndex: number, choice: DefenseChoice) {
    const attacker = game.players[attackerIndex];
    const defenderIndex = 1 - attackerIndex;
    const defender = game.players[defenderIndex];
    const attackCard = attacker?.field[fieldIndex];
    if (!attacker || !defender || !attackCard) return;
    const attackContext: AttackContext = { attacker, attackerFieldIndex: fieldIndex };
    if (choice.type === "field") {
      const defenseCard = defender.field[choice.index];
      if (!defenseCard || !legalFieldDefenders(defender, attackCard, attackContext).some((option) => option.index === choice.index)) return;
      if (defender.isHuman && needsFirewallFuel(defender, defenseCard, attackCard, choice.index, attackContext) && choice.firewallDiscardIndex === undefined) return;
      const firewallPaid = typeof choice.firewallDiscardIndex === "number";
      const defenseValue = defenseCombatValue(attackCard, defenseCard, defender, { firewallPaid, fieldIndex: choice.index, attackContext });
      const attackValue = attackCombatValue(attackCard, attackContext);
      if (defenseValue >= attackValue) {
        launchTrashFlight(attackCard, { ownerIndex: attackerIndex, zone: "field", index: fieldIndex }, attackerIndex, "攻撃札退場", 760);
      }
      if (defenseValue <= attackValue) {
        launchTrashFlight(defenseCard, { ownerIndex: defenderIndex, zone: "field", index: choice.index }, defenderIndex, defenseValue === attackValue ? "相打ち" : "防御失敗", 760);
      }
      return;
    }
    if (choice.type === "hand") {
      const defenseCard = defender.hand[choice.index];
      if (!defenseCard) return;
      launchTrashFlight(
        defenseCard,
        { ownerIndex: defenderIndex, zone: flightHandZone(defender), index: defender.isHuman ? choice.index : 0 },
        defenderIndex,
        "手札防御",
        720,
      );
    }
  }

  function prepareAiActionAnimation(action: AiAction) {
    if (action.type === "play") {
      const card = ai.hand[action.index];
      if (!card) return 0;
      playSfx("play");
      launchCardFlight({
        card,
        from: { ownerIndex: 1, zone: "hand-source", index: 0 },
        to: { ownerIndex: 1, zone: "field", index: ai.field.length },
        label: "CPU 場へ",
        tone: "ai",
        durationMs: 1700,
      });
      const recovered = recoverOnPlayPreview(ai, card);
      if (recovered) launchRecoverFlight(recovered.card, 1, recovered.index);
      return 1400;
    }
    if (action.type === "memory") {
      const card = ai.hand[action.index];
      if (!card) return 0;
      playSfx("play");
      if (ai.memory) suppressNextTrashSfx(1);
      if (ai.memory) {
        launchTrashFlight(ai.memory, { ownerIndex: 1, zone: "memory", index: 0 }, 1, "旧遺物破棄", 1500);
      }
      launchCardFlight({
        card,
        from: { ownerIndex: 1, zone: "hand-source", index: 0 },
        to: { ownerIndex: 1, zone: "memory", index: 0 },
        label: "ライバル 遺物",
        tone: "ai",
        durationMs: 1700,
      });
      return 1400;
    }
    if (action.type === "upgrade") {
      const card = ai.hand[action.handIndex];
      const source = ai.field[action.fieldIndex];
      if (!card || !source) return 0;
      playSfx("play");
      launchCardFlight({
        card,
        from: { ownerIndex: 1, zone: "hand-source", index: 0 },
        to: { ownerIndex: 1, zone: "field", index: action.fieldIndex },
        label: "CPU 更新",
        tone: "ai",
        durationMs: 1700,
      });
      const recovered = recoverOnPlayPreview(ai, card, source);
      if (recovered) launchRecoverFlight(recovered.card, 1, recovered.index);
      return 1400;
    }
    if (action.type === "memory-effect") {
      const card = ai.field[action.fieldIndex];
      if (!card) return 0;
      launchTrashFlight(card, { ownerIndex: 1, zone: "field", index: action.fieldIndex }, 1, "遺物の代償", 980);
      return 760;
    }
    if (action.type === "command") {
      const card = ai.hand[action.index];
      if (!card) return 0;
      playSfx("play");
      suppressNextTrashSfx(1);
      launchTrashFlight(card, { ownerIndex: 1, zone: "hand-source", index: 0 }, 1, "術式発動", 980);
      const recovered = commandRecoverPreview(ai, card, null);
      if (recovered) launchRecoverFlight(recovered.card, 1, recovered.index);
      return 760;
    }
    if (action.type === "charge") {
      const card = ai.hand[action.index];
      if (!card) return 0;
      playSfx("charge");
      suppressNextTrashSfx(1);
      launchTrashFlight(card, { ownerIndex: 1, zone: "hand-source", index: 0 }, 1, "チャージ", 980);
      return 760;
    }
    return action.type === "attack" ? 360 : 180;
  }

  function playableDeckOptions(): ResolvedDeckSelection[] {
    const fixedDecks: ResolvedDeckSelection[] = BATTLE_DECK_IDS.map((deckId) => ({ kind: "preset", deckId }));
    const customDecks: ResolvedDeckSelection[] = savedDecks
      .filter((deck) => validateDeck(deck.cardIds).valid)
      .map((deck) => ({ kind: "saved", deck }));
    return [...fixedDecks, ...customDecks];
  }

  function resolveDeckSelection(selection: DeckSelection, rng: () => number): ResolvedDeckSelection {
    if (selection.kind === "random") {
      const options = playableDeckOptions();
      const index = Math.floor(rng() * options.length);
      return options[index];
    }
    if (selection.kind === "preset") return { kind: "preset", deckId: selection.deckId };
    const deck = savedDecks.find((item) => item.id === selection.deckId);
    if (!deck) throw new Error("保存済みデッキが見つかりません");
    const validation = validateDeck(deck.cardIds);
    if (!validation.valid) throw new Error(validation.messages[0] ?? "デッキ条件を満たしていません");
    return { kind: "saved", deck };
  }

  function toDuelDeckSource(selection: ResolvedDeckSelection): DuelDeckSource {
    if (selection.kind === "preset") return { kind: "preset", deckId: selection.deckId };
    return { kind: "custom", name: selection.deck.name, cardIds: selection.deck.cardIds };
  }

  function startSelectedDeckGame() {
    try {
      const nextSeed = randomSeed();
      const selectionRng = makeRng(nextSeed);
      const playerSelection = resolveDeckSelection(playerDeckSelection, selectionRng);
      const opponentSelection = resolveDeckSelection(opponentDeckSelection, selectionRng);
      const nextGame = createGame(nextSeed, toDuelDeckSource(playerSelection), toDuelDeckSource(opponentSelection), opponentAiProfile);
      rivalActionVoiceTurnGroups.current = createRivalActionVoiceTurnGroups(nextSeed);
      announcedResultKey.current = null;
      setSeed(nextSeed);
      resetDrawTracker(nextGame);
      setGame(nextGame);
      setLastHumanActionsRemaining(nextGame.actionsRemaining);
      resetDuelEvents();
      setRulesOpen(false);
      setStarterDeckSetupOpen(false);
      setTutorialActive(false);
      showToast("対戦開始", `${nextGame.players[0].deckName} / 相手: ${nextGame.players[1].deckName}`);
      showBanner({
        kind: "start",
        title: "BREAK DUEL",
        detail: `Seed ${nextSeed} / あなた: ${nextGame.players[0].deckName} / 相手: ${nextGame.players[1].deckName}`,
      });
      showRivalVoiceLine("match_start");
    } catch (error) {
      showToast("使用できません", error instanceof Error ? error.message : "デッキを読み込めませんでした");
    }
  }

  function startTutorialGame() {
    if (page !== "duel") {
      setPage("duel");
      const duelPath = routeForPage("duel");
      if (window.location.pathname !== duelPath) {
        window.history.pushState(null, "", duelPath);
      }
    }
    const nextGame = createTutorialGame();
    rivalActionVoiceTurnGroups.current = createRivalActionVoiceTurnGroups(TUTORIAL_SEED);
    announcedResultKey.current = null;
    setSeed(TUTORIAL_SEED);
    resetDrawTracker(nextGame);
    setGame(nextGame);
    setLastHumanActionsRemaining(nextGame.actionsRemaining);
    resetDuelEvents();
    setRulesOpen(false);
    setStarterDeckSetupOpen(false);
    setTutorialActive(true);
    setTutorialAiAdvanceKey(null);
    setTutorialAiAdvancePending(false);
    setAutoDismissDuelEvents(false);
    showToast("チュートリアル開始", "基本操作を順番に確認します");
    showBanner({
      kind: "start",
      title: "TUTORIAL DUEL",
      detail: "召喚、攻撃、防御、術式、チャージ、遺物、アップグレード、大型召喚獣を確認します",
    });
    showRivalVoiceLine("match_start");
  }

  function openStarterDeckSetup() {
    refreshSavedDecks();
    resetDuelEvents();
    setRulesOpen(false);
    setTutorialActive(false);
    setTutorialAiAdvanceKey(null);
    setTutorialAiAdvancePending(false);
    changePage("duel");
    setStarterDeckSetupOpen(true);
  }

  function spendForPack(): boolean {
    if (!spendCoins(PACK_COST)) return false;
    setCoins(loadCoins());
    return true;
  }

  function changePage(nextPage: AppPage) {
    if (nextPage !== "duel") resetDuelEvents();
    if (nextPage !== "duel") setTutorialActive(false);
    if (nextPage !== "duel") setTutorialAiAdvanceKey(null);
    if (nextPage !== "duel") setTutorialAiAdvancePending(false);
    setRulesOpen(false);
    setPage(nextPage);
    const nextPath = routeForPage(nextPage);
    if (window.location.pathname !== nextPath) {
      window.history.pushState(null, "", nextPath);
    }
    if (nextPage === "duel") {
      refreshSavedDecks();
      setStarterDeckSetupOpen(true);
      setTutorialActive(false);
      setTutorialAiAdvanceKey(null);
      setTutorialAiAdvancePending(false);
    }
  }

  useEffect(() => {
    if (window.location.pathname === "/" || !Object.values(PAGE_PATHS).includes(window.location.pathname as AppPage)) {
      window.history.replaceState(null, "", routeForPage(page));
    }
    const onPopState = () => {
      const nextPage = pageFromPath(window.location.pathname);
      if (nextPage !== "duel") resetDuelEvents();
      if (nextPage === "duel") refreshSavedDecks();
      setRulesOpen(false);
      setStarterDeckSetupOpen(nextPage === "duel");
      setTutorialActive(false);
      setTutorialAiAdvanceKey(null);
      setTutorialAiAdvancePending(false);
      setPage(nextPage);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (game.active === 0) setLastHumanActionsRemaining(game.actionsRemaining);
  }, [game.active, game.actionsRemaining]);

  useEffect(() => {
    if (!tutorialActive || tutorialStep?.id !== "watch-rival") setTutorialAiAdvancePending(false);
  }, [tutorialActive, tutorialStep?.id]);

  useEffect(() => {
    if (!tutorialActive) return;
    const fixedSelection = tutorialFixedSelection(tutorialStep, game);
    if (!fixedSelection) return;
    if (
      game.selected?.zone === fixedSelection.zone
      && (game.selected.ownerIndex ?? 0) === fixedSelection.ownerIndex
      && game.selected.index === fixedSelection.index
    ) return;
    mutate((draft) => {
      draft.selected = fixedSelection;
    });
  }, [tutorialActive, tutorialStep?.id, tutorialStep?.focus, game.turn, game.active, game.players[0].hand.length, game.players[0].field.length]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(null), 1250);
    return () => window.clearTimeout(timer);
  }, [toast?.id]);

  useEffect(() => {
    if (!banner) return undefined;
    const timer = window.setTimeout(() => setBanner(null), banner.kind === "result" ? 2700 : 1150);
    return () => window.clearTimeout(timer);
  }, [banner?.id]);

  useEffect(() => {
    if (!duelEvent) return undefined;
    if (!autoDismissDuelEvents) {
      if (duelEventTimer.current !== null) window.clearTimeout(duelEventTimer.current);
      duelEventTimer.current = null;
      return undefined;
    }
    if (duelEventTimer.current !== null) return undefined;
    duelEventTimer.current = window.setTimeout(() => {
      dismissDuelEvent();
    }, duelEventDurationMs(duelEvent));
    return undefined;
  }, [autoDismissDuelEvents, duelEvent?.id]);

  useEffect(() => {
    const current: [number, number] = [game.players[0].discard.length, game.players[1].discard.length];
    const previous = previousDiscardCounts.current;
    previousDiscardCounts.current = current;
    if (page !== "duel") return;

    const owners: number[] = [];
    if (current[0] > previous[0]) owners.push(0);
    if (current[1] > previous[1]) owners.push(1);
    if (owners.length === 0) return;

    if (trashFlashTimer.current !== null) window.clearTimeout(trashFlashTimer.current);
    setTrashFlash({
      id: eventId++,
      owners,
      tone: owners.length > 1 ? "danger" : owners[0] === 0 ? "magenta" : "cyan",
    });
    const trashWouldBeAudible = owners
      .map((ownerIndex) => shouldPlayTrashSfx(ownerIndex))
      .some(Boolean);
    const primarySfxIsFresh = performance.now() - lastPrimarySfxPlayedAt.current < TRASH_SFX_PRIMARY_GRACE_MS;
    if (trashWouldBeAudible && !primarySfxIsFresh) {
      playSfx("trash");
    }
    trashFlashTimer.current = window.setTimeout(() => {
      setTrashFlash(null);
      trashFlashTimer.current = null;
    }, 1100);
  }, [page, game.players[0].discard.length, game.players[1].discard.length]);

  useEffect(() => {
    const current: [number, number] = [game.players[0].life, game.players[1].life];
    const previous = previousLifeCounts.current;
    previousLifeCounts.current = current;
    if (page !== "duel") {
      recentLifeDamageImpact.current = null;
      return;
    }

    const eventImpact = recentLifeDamageImpact.current;
    ([0, 1] as PlayerIndex[]).forEach((targetIndex) => {
      const amount = previous[targetIndex] - current[targetIndex];
      if (amount <= 0) return;
      if (eventImpact?.targetPlayerIndex === targetIndex) return;
      const sourceIndex = eventImpact?.targetPlayerIndex === targetIndex
        ? normalizePlayerIndex(eventImpact.sourcePlayerIndex)
        : null;
      showLifeImpact(targetIndex, amount, sourceIndex);
      showLeaderReaction(targetIndex, "hurt");
      if (targetIndex === 0 && sourceIndex === 1) {
        showLeaderReaction(1, "delight");
      }
    });
    recentLifeDamageImpact.current = null;
  }, [page, game.players[0].life, game.players[1].life]);

  useEffect(() => {
    const current: [number, number, number, number, number, number] = [
      game.players[0].deck.length,
      game.players[0].hand.length,
      game.players[0].cardsDrawn,
      game.players[1].deck.length,
      game.players[1].hand.length,
      game.players[1].cardsDrawn,
    ];
    const previous = previousDrawCounts.current;
    previousDrawCounts.current = current;
    if (page !== "duel") return;

    [0, 1].forEach((ownerIndex) => {
      const deckSlot = ownerIndex === 0 ? 0 : 3;
      const handSlot = ownerIndex === 0 ? 1 : 4;
      const drawnSlot = ownerIndex === 0 ? 2 : 5;
      const deckDelta = previous[deckSlot] - current[deckSlot];
      const drawnDelta = current[drawnSlot] - previous[drawnSlot];
      const drawnCount = Math.min(deckDelta, drawnDelta);
      if (drawnCount <= 0) return;
      const firstNewHandIndex = Math.max(0, current[handSlot] - drawnCount);
      for (let offset = 0; offset < drawnCount; offset += 1) {
        launchDrawFlight(ownerIndex, firstNewHandIndex + offset, offset * 90);
      }
      playSfx("draw");
    });
  }, [
    page,
    game.players[0].deck.length,
    game.players[0].hand.length,
    game.players[0].cardsDrawn,
    game.players[1].deck.length,
    game.players[1].hand.length,
    game.players[1].cardsDrawn,
  ]);

  useEffect(() => {
    if (page !== "duel" || starterDeckSetupOpen) return;
    if (announcedAutoDismissDefault.current) return;
    announcedAutoDismissDefault.current = true;
    if (!hasStoredAutoDismissPreference()) {
      showToast("演出は自動送りです", "じっくり確認したい場合は右下の「手動確認」へ切り替えられます");
      saveAutoDismissPreference(true);
    }
  }, [page, starterDeckSetupOpen]);

  useEffect(() => {
    if (page !== "duel") return;
    if (game.winner !== null || game.draw) return;
    showBanner({
      kind: "turn",
      title: `${active.name}のターン`,
      detail: `TURN ${game.turn} / 残りアクション ${game.actionsRemaining}`,
      tone: active.isHuman ? "human" : "ai",
    });
    if (!active.isHuman) showRivalVoiceLine("rival_turn_start");
  }, [page, game.turn, game.active]);

  useEffect(() => {
    if (page !== "duel") return;
    if (game.winner === null && !game.draw) return;
    const resultKey = `${seed}:${game.turn}:${game.winner ?? "draw"}:${game.draw ? "draw" : "win"}:${human.life}:${ai.life}`;
    if (announcedResultKey.current === resultKey) return;
    announcedResultKey.current = resultKey;
    const score = `あなた ${human.life} - ${ai.life} ライバル`;
    const winnerIndex = game.winner ?? 0;
    showBanner({
      kind: "result",
      title: game.draw ? "引き分け" : `${game.players[winnerIndex].name}の勝利`,
      detail: score,
      tone: game.draw ? "draw" : game.winner === 0 ? "win" : "lose",
    });
    playSfx("end");
    if (!game.draw) {
      showRivalVoiceLine(game.winner === 1 ? "victory" : "defeat", { force: true });
    }
  }, [page, seed, game.turn, game.winner, game.draw, human.life, ai.life]);

  // CPU戦を最後まで打った試合にコインを付与する（チュートリアルと途中放棄は対象外）
  useEffect(() => {
    if (page !== "duel") return;
    if (tutorialActive) return;
    if (game.winner === null && !game.draw) return;
    const awardKey = `${seed}:${game.turn}:${game.winner ?? "draw"}`;
    if (coinAwardedKey.current === awardKey) return;
    coinAwardedKey.current = awardKey;
    const amount = game.winner === 0 ? MATCH_WIN_COINS : MATCH_LOSE_COINS;
    const balance = addCoins(amount);
    setCoins(balance);
    showToast(`+${amount} コイン獲得`, `所持コイン ${balance}`);
  }, [page, seed, game.turn, game.winner, game.draw, tutorialActive]);

  useEffect(() => {
    if (!audioEnabled) return;
    startBgm();
  }, [audioEnabled, page, starterDeckSetupOpen, game.winner, game.draw, game.players[0].life, game.players[1].life]);

  useEffect(() => {
    if (page !== "duel") return undefined;
    if (starterDeckSetupOpen) return undefined;
    if (game.winner !== null || game.draw || game.pendingAttack || game.pendingTarget) return undefined;
    if (tutorialStep?.id === "complete") return undefined;
    if (tutorialActive && tutorialStep?.id === "watch-rival" && tutorialAiAdvanceKey !== tutorialAiTurnKey(game, tutorialStep)) return undefined;
    if (active.isHuman || (game.actionsRemaining <= 0 && !canUseCharge(game, active))) return undefined;
    if (aiAnimating) {
      // コミット遅延の最大値(約1700ms)を超えても aiAnimating が立ったままなら、
      // タイマーが失われた(HMR等)とみなして回収する。正常時はコミットが先に完了して
      // aiAnimating が false になり、このウォッチドッグはクリーンアップで消える。
      const watchdog = window.setTimeout(() => {
        if (aiCommitTimer.current !== null) window.clearTimeout(aiCommitTimer.current);
        aiCommitTimer.current = null;
        setAiAnimating(false);
      }, 2600);
      return () => window.clearTimeout(watchdog);
    }
    if (duelEvent || duelEventPlaying.current || duelEventQueue.current.length > 0 || duelEventScheduler.current !== null) {
      // duelEvent 系の ref は依存配列に入らないため、ref だけが赤信号の場合は
      // 依存が変わらず再評価されずに CPU ターンが止まり得る。短いリトライで再評価を促す。
      const retryTimer = window.setTimeout(() => setAiGateRetryTick((tick) => tick + 1), 200);
      return () => window.clearTimeout(retryTimer);
    }
    const tutorialManualAdvance = tutorialActive && tutorialStep?.id === "watch-rival";
    const timer = window.setTimeout(() => {
      const action = tutorialActive ? tutorialForcedAiAction(game) ?? chooseAiAction(game, active.aiProfile) : chooseAiAction(game, active.aiProfile);
      const commitDelay = prepareAiActionAnimation(action);
      setAiAnimating(true);
      aiCommitTimer.current = window.setTimeout(() => {
        mutate((draft) => performAiActionInDraft(draft, action, { playSfx, showDuelEvent: queueDuelEvent }));
        if (tutorialManualAdvance) setTutorialAiAdvancePending(false);
        setAiAnimating(false);
        aiCommitTimer.current = null;
      }, commitDelay);
    }, tutorialManualAdvance ? 80 : 720);
    return () => window.clearTimeout(timer);
  }, [page, game, duelEvent, aiAnimating, tutorialActive, tutorialStep?.id, tutorialStep?.kicker, tutorialStep?.title, tutorialAiAdvanceKey, starterDeckSetupOpen, aiGateRetryTick]);

  useEffect(() => {
    return () => {
      stopBgm();
      if (duelEventScheduler.current !== null) window.clearTimeout(duelEventScheduler.current);
      if (duelEventTimer.current !== null) window.clearTimeout(duelEventTimer.current);
      cardFlightTimers.current.forEach((timer) => window.clearTimeout(timer));
      cardFlightTimers.current = [];
      if (aiCommitTimer.current !== null) window.clearTimeout(aiCommitTimer.current);
      aiCommitTimer.current = null;
      if (trashFlashTimer.current !== null) window.clearTimeout(trashFlashTimer.current);
      clearLifeImpactScheduleTimers();
      if (lifeImpactTimer.current !== null) window.clearTimeout(lifeImpactTimer.current);
      if (breakDrawPulseTimer.current !== null) window.clearTimeout(breakDrawPulseTimer.current);
      if (rivalSpeechTimer.current !== null) window.clearTimeout(rivalSpeechTimer.current);
      stopRivalVoiceLine();
      Object.values(leaderReactionTimers.current).forEach((timer) => {
        if (typeof timer === "number") window.clearTimeout(timer);
      });
    };
  }, []);

  function ensureAudioContext() {
    if (!audioContext.current) {
      audioContext.current = new AudioContext();
    }
    if (audioContext.current.state === "suspended") void audioContext.current.resume();
    return audioContext.current;
  }

  function playSfx(kind: string) {
    if (!audioEnabledRef.current) return;
    const config = SFX_ASSETS[kind];
    if (!config) return;
    const priority = SFX_PRIORITY[kind] ?? 1;
    const now = performance.now();
    if (LOW_PRIORITY_SFX_KINDS.has(kind) && now - lastPrimarySfxPlayedAt.current < TRASH_SFX_PRIMARY_GRACE_MS) return;
    if (kind === "hover") {
      if (now - (lastSfxPlayedAt.current[kind] ?? 0) < 80) return;
    }
    if (kind !== "hover" && now - (lastSfxPlayedAt.current[kind] ?? 0) < 60) return;
    lastSfxPlayedAt.current[kind] = now;
    if (PRIMARY_SFX_KINDS.has(kind)) {
      lastPrimarySfxPlayedAt.current = now;
    }
    const buffer = sfxBuffers.current[kind];
    if (buffer) {
      playSfxBuffer(kind, config, buffer, priority);
      return;
    }
    void loadSfxBuffer(kind, config).then(() => {
      const loaded = sfxBuffers.current[kind];
      if (!audioEnabledRef.current || !loaded) return;
      playSfxBuffer(kind, config, loaded, priority);
    });
  }

  function preloadSfx() {
    Object.entries(SFX_ASSETS).forEach(([kind, config]) => {
      void loadSfxBuffer(kind, config);
    });
  }

  function loadSfxBuffer(kind: string, config: { src: string; volume: number }) {
    if (sfxBuffers.current[kind]) return Promise.resolve();
    if (pendingSfxBuffers.current[kind]) return pendingSfxBuffers.current[kind];
    const context = ensureAudioContext();
    const pending = fetch(config.src)
      .then((response) => {
        if (!response.ok) throw new Error(`Failed to load SFX ${kind}: ${response.status}`);
        return response.arrayBuffer();
      })
      .then((data) => context.decodeAudioData(data))
      .then((buffer) => {
        sfxBuffers.current[kind] = buffer;
      })
      .catch((error) => {
        console.warn("SFX preload failed", kind, error);
      })
      .finally(() => {
        delete pendingSfxBuffers.current[kind];
      });
    pendingSfxBuffers.current[kind] = pending;
    return pending;
  }

  function playSfxBuffer(kind: string, config: { src: string; volume: number }, buffer: AudioBuffer, priority: number) {
    const context = ensureAudioContext();
    const start = () => {
      if (LOW_PRIORITY_SFX_KINDS.has(kind) && performance.now() - lastPrimarySfxPlayedAt.current < TRASH_SFX_PRIMARY_GRACE_MS) return;
      stopLowerPrioritySfx(priority);
      const source = context.createBufferSource();
      const gain = context.createGain();
      source.buffer = buffer;
      gain.gain.value = config.volume;
      source.connect(gain).connect(context.destination);
      activeSfxSources.current.push({ kind, priority, source });
      source.onended = () => {
        activeSfxSources.current = activeSfxSources.current.filter((item) => item.source !== source);
      };
      source.start();
    };
    if (context.state === "suspended") {
      void context.resume().then(start).catch((error) => {
        console.warn("SFX playback failed", kind, error);
      });
      return;
    }
    try {
      start();
    } catch (error) {
      console.warn("SFX playback failed", kind, error);
    }
  }

  function stopLowerPrioritySfx(priority: number) {
    const remaining: typeof activeSfxSources.current = [];
    activeSfxSources.current.forEach((item) => {
      if (item.priority < priority) {
        try {
          item.source.stop();
        } catch {
          // Already ended sources can be ignored.
        }
        return;
      }
      remaining.push(item);
    });
    activeSfxSources.current = remaining;
  }

  function suppressNextTrashSfx(ownerIndex: number) {
    suppressedTrashSfxOwners.current[ownerIndex] = (suppressedTrashSfxOwners.current[ownerIndex] ?? 0) + 1;
  }

  function shouldPlayTrashSfx(ownerIndex: number) {
    const suppressed = suppressedTrashSfxOwners.current[ownerIndex] ?? 0;
    if (suppressed <= 0) return true;
    if (suppressed === 1) {
      delete suppressedTrashSfxOwners.current[ownerIndex];
    } else {
      suppressedTrashSfxOwners.current[ownerIndex] = suppressed - 1;
    }
    return false;
  }

  function clearBgmTransitionTimers() {
    if (bgmFadeTimer.current !== null) window.clearInterval(bgmFadeTimer.current);
    if (bgmSwitchTimer.current !== null) window.clearTimeout(bgmSwitchTimer.current);
    bgmFadeTimer.current = null;
    bgmSwitchTimer.current = null;
  }

  function stopBgm() {
    clearBgmTransitionTimers();
    bgmAudio.current?.pause();
  }

  function activeDuelUsesBattleBgm(
    nextPage = page,
    nextGame = game,
    nextStarterDeckSetupOpen = starterDeckSetupOpen,
  ) {
    return nextPage === "duel"
      && !nextStarterDeckSetupOpen
      && nextGame.winner === null
      && !nextGame.draw;
  }

  function duelIsInFinalPhase(nextGame = game) {
    return nextGame.players.some((player) => player.life === 1);
  }

  function bgmTrackForCurrentView(): BgmTrack {
    if (!activeDuelUsesBattleBgm()) return { src: menuBgm, volume: MENU_BGM_VOLUME };
    return duelIsInFinalPhase()
      ? { src: finalBattleBgm, volume: FINAL_BATTLE_BGM_VOLUME }
      : { src: battleBgm, volume: BATTLE_BGM_VOLUME };
  }

  function createBgmAudio(track: BgmTrack, initialVolume: number) {
    const audio = new Audio(track.src);
    audio.loop = true;
    audio.preload = "auto";
    audio.volume = initialVolume;
    bgmAudio.current = audio;
    bgmSrc.current = track.src;
    return audio;
  }

  function fadeBgmVolume(audio: HTMLAudioElement, targetVolume: number, durationMs: number, onComplete?: () => void) {
    if (bgmFadeTimer.current !== null) window.clearInterval(bgmFadeTimer.current);
    const startVolume = audio.volume;
    const startedAt = performance.now();
    const finish = () => {
      if (bgmFadeTimer.current !== null) window.clearInterval(bgmFadeTimer.current);
      bgmFadeTimer.current = null;
      audio.volume = targetVolume;
      onComplete?.();
    };
    if (durationMs <= 0 || Math.abs(startVolume - targetVolume) < 0.001) {
      finish();
      return;
    }
    bgmFadeTimer.current = window.setInterval(() => {
      const progress = Math.min(1, (performance.now() - startedAt) / durationMs);
      audio.volume = startVolume + (targetVolume - startVolume) * progress;
      if (progress >= 1) finish();
    }, BGM_FADE_STEP_MS);
  }

  function playBgmAudio(audio: HTMLAudioElement) {
    void audio.play().catch(() => {
      audioEnabledRef.current = false;
      setAudioEnabled(false);
      showToast("BGM再生失敗", "ブラウザの音声許可を確認してください");
    });
  }

  function startBgm(options: { restart?: boolean } = {}) {
    const track = bgmTrackForCurrentView();
    const existing = bgmAudio.current;
    const changed = !existing || bgmSrc.current !== track.src;
    if (!changed) {
      const audio = existing;
      if (options.restart) {
        clearBgmTransitionTimers();
        audio.currentTime = 0;
        audio.volume = 0;
        playBgmAudio(audio);
        fadeBgmVolume(audio, track.volume, BGM_FADE_IN_MS);
        return;
      }
      if (bgmFadeTimer.current === null) audio.volume = track.volume;
      playBgmAudio(audio);
      return;
    }

    clearBgmTransitionTimers();
    const startNextTrack = () => {
      if (!audioEnabledRef.current) return;
      const nextAudio = createBgmAudio(track, 0);
      if (options.restart) nextAudio.currentTime = 0;
      playBgmAudio(nextAudio);
      fadeBgmVolume(nextAudio, track.volume, BGM_FADE_IN_MS);
    };

    if (existing && !existing.paused) {
      fadeBgmVolume(existing, 0, BGM_FADE_OUT_MS, () => {
        existing.pause();
        bgmSwitchTimer.current = window.setTimeout(() => {
          bgmSwitchTimer.current = null;
          startNextTrack();
        }, BGM_TRACK_SWITCH_PAUSE_MS);
      });
      return;
    }

    startNextTrack();
  }

  function toggleAudio() {
    const next = !audioEnabledRef.current;
    audioEnabledRef.current = next;
    setAudioEnabled(next);
    if (next) {
      void ensureAudioContext().resume();
      preloadSfx();
      startBgm({ restart: true });
    } else {
      stopBgm();
      if (rivalSpeechTimer.current !== null) window.clearTimeout(rivalSpeechTimer.current);
      rivalSpeechTimer.current = null;
      setRivalSpeech(null);
      lastRivalLine.current = null;
      pendingRivalVoiceLine.current = null;
      stopRivalVoiceLine();
    }
  }

  function selectHand(index: number) {
    const pending = game.pendingTarget;
    if (pending?.kind === "card-select" && pending.playerIndex === 0 && pending.zone === "hand") {
      togglePendingCardIndex(index);
      return;
    }
    if (tutorialBlocks("select-hand", { handIndex: index })) return;
    if (!isCurrentSelection("hand", 0, index)) playSfx("select");
    mutate((draft) => {
      draft.selected = { zone: "hand", ownerIndex: 0, index };
    });
  }

  function selectField(ownerIndex: number, index: number) {
    const pending = game.pendingTarget;
    if (pending?.kind === "card-select" && pending.playerIndex === ownerIndex && pending.zone === "field") {
      togglePendingCardIndex(index);
      return;
    }
    if (pending?.kind === "disrupt" && ownerIndex === 1 - game.active) {
      const targetPlayer = game.players[ownerIndex];
      if (!targetPlayer.field[index] || targetPlayer.spentFieldIndexes.has(index)) return;
      useCommandAt(pending.sourceIndex, index);
      return;
    }
    if (pending?.kind === "purge" && ownerIndex === 1 - game.active) {
      const targetPlayer = game.players[ownerIndex];
      if (!targetPlayer.field[index] || !targetPlayer.spentFieldIndexes.has(index)) return;
      useCommandAt(pending.sourceIndex, index);
      return;
    }
    if (pending?.kind === "strike") {
      if (ownerIndex === 0) {
        mutate((draft) => {
          draft.pendingTarget = null;
          draft.selected = { zone: "field", ownerIndex, index };
        });
        return;
      }
      const attacker = game.players[0].field[pending.sourceIndex];
      if (!attacker) return;
      if (!strikeTargets(attacker, game.players[1], { attacker: game.players[0], attackerFieldIndex: pending.sourceIndex }).some((target) => target.index === index)) return;
      performStrike(pending.sourceIndex, index);
      return;
    }
    if (tutorialBlocks("select-field", { fieldOwnerIndex: ownerIndex, fieldIndex: index })) return;
    if (!isCurrentSelection("field", ownerIndex, index)) playSfx("select");
    mutate((draft) => {
      draft.selected = { zone: "field", ownerIndex, index };
    });
  }

  function selectMemory(ownerIndex: number) {
    if (!game.players[ownerIndex]?.memory) return;
    if (!isCurrentSelection("memory", ownerIndex, 0)) playSfx("select");
    mutate((draft) => {
      if (!draft.players[ownerIndex]?.memory) return;
      draft.selected = { zone: "memory", ownerIndex, index: 0 };
    });
  }

  function isCurrentSelection(zone: "hand" | "field" | "memory", ownerIndex: number, index: number) {
    return game.selected?.zone === zone
      && (game.selected.ownerIndex ?? 0) === ownerIndex
      && game.selected.index === index;
  }

  function playSelected() {
    if (!canHumanAct(game)) return;
    if (tutorialBlocks("play")) return;
    if (game.selected?.zone === "memory" && (game.selected.ownerIndex ?? 0) === 0) {
      useSelectedMemoryEffect();
      return;
    }
    if (game.selected?.zone !== "hand") return;
    const card = activePlayer(game).hand[game.selected.index];
    if (!card) return;
    if (card.type === "event") {
      useSelectedCommand();
      return;
    }
    if (card.type === "memory") {
      playSelectedMemory();
      return;
    }
    playSelectedAi();
  }

  function useSelectedMemoryEffect() {
    if (!canHumanAct(game) || game.selected?.zone !== "memory" || (game.selected.ownerIndex ?? 0) !== 0) return;
    const player = activePlayer(game);
    if (!canUseAcceleratorMemory(game, player)) return;
    mutate((draft) => {
      const player = activePlayer(draft);
      if (!canUseAcceleratorMemory(draft, player)) return;
      draft.pendingTarget = {
        kind: "card-select",
        reason: "accelerator-sacrifice",
        zone: "field",
        playerIndex: draft.active,
        title: `${player.memory!.name}でトラッシュするカードを選択`,
        prompt: "場の召喚獣1体をトラッシュしてもよい。その場合、残りアクションを1増やします。",
        confirmLabel: "このカードをトラッシュ",
        min: 1,
        max: 1,
        excludeIndexes: [],
        selectedIndexes: [],
        actionCost: 0,
        cancelable: true,
      };
    });
  }

  function playSelectedAi() {
    if (game.selected?.zone !== "hand") return;
    const player = activePlayer(game);
    const card = player.hand[game.selected.index];
    if (!card || card.type !== "ai" || player.field.length >= CONFIG.fieldLimit || game.actionsRemaining < playCost(card, game)) return;
    const handIndex = game.selected.index;
    const fieldIndex = player.field.length;
    launchCardFlight({
      card,
      from: { ownerIndex: 0, zone: "hand", index: handIndex },
      to: { ownerIndex: 0, zone: "field", index: fieldIndex },
      label: "場へ",
    });
    mutate((draft) => {
      if (draft.selected?.zone !== "hand") return;
      const player = activePlayer(draft);
      const card = player.hand[draft.selected.index];
      const cost = playCost(card, draft);
      if (!card || card.type !== "ai" || player.field.length >= CONFIG.fieldLimit || draft.actionsRemaining < cost) return;
      player.hand.splice(draft.selected.index, 1);
      player.field.push(card);
      player.playedAiThisTurn = true;
      const fieldIndex = player.field.length - 1;
      let text = `${player.name}は${card.name}を場に出した。`;
      text += applyPlayEffects(draft, player, card, fieldIndex, cost);
      addLog(draft, text);
      draft.selected = null;
      if (!draft.pendingTarget) afterAction(draft, cost);
    });
    if (card.power === 4) {
      queueDuelEvent({
        kind: "play",
        title: "切札登場!!",
        detail: `${card.name}が戦線に降臨。攻撃後は退場する一撃必殺の切札です。`,
        fromLabel: "手札",
        toLabel: "場",
        tone: "magenta",
        emphasis: "peak",
        cards: [{ card, label: "切札", state: "winner" }],
      });
    }
    showToast("場に出す", selectedHandCardName(game));
    playSfx("play");
  }

  function playSelectedMemory() {
    if (game.selected?.zone !== "hand") return;
    const player = activePlayer(game);
    const memoryCard = player.hand[game.selected.index];
    if (!memoryCard || memoryCard.type !== "memory") return;
    if (player.memory) suppressNextTrashSfx(0);
    if (player.memory) {
      launchTrashFlight(player.memory, { ownerIndex: 0, zone: "memory", index: 0 }, 0, "旧遺物破棄");
    }
    launchCardFlight({
      card: memoryCard,
      from: { ownerIndex: 0, zone: "hand", index: game.selected.index },
      to: { ownerIndex: 0, zone: "memory", index: 0 },
      label: "遺物へ",
    });
    mutate((draft) => {
      if (draft.selected?.zone !== "hand") return;
      const player = activePlayer(draft);
      const memoryCard = player.hand[draft.selected.index];
      if (!memoryCard || memoryCard.type !== "memory") return;
      player.hand.splice(draft.selected.index, 1);
      const replaced = player.memory;
      if (replaced) player.discard.push(replaced);
      player.memory = memoryCard;
      addLog(draft, `${player.name}は${memoryCard.name}を遺物に配置。${replaced ? `${replaced.name}はトラッシュへ。` : ""}`);
      draft.selected = null;
      afterAction(draft);
    });
    showToast("遺物配置", selectedHandCardName(game));
    playSfx("play");
  }

  function upgradeSelectedAi() {
    if (!canHumanAct(game) || game.selected?.zone !== "hand") return;
    if (tutorialBlocks("upgrade")) return;
    const player = activePlayer(game);
    const target = player.hand[game.selected.index];
    const previewSourceIndex = target?.type === "ai" ? bestUpgradeSource(player, target) : null;
    const previewSource = previewSourceIndex === null ? null : player.field[previewSourceIndex];
    if (!target || target.type !== "ai" || !previewSource || upgradeCost(target, previewSource) > game.actionsRemaining) return;
    const sourceIndexes = tutorialUpgradeSourceIndexes(tutorialStep, player, target, upgradeSourceIndexes(player, target, game.actionsRemaining));
    if (sourceIndexes.length === 0) return;
    if (sourceIndexes.length > 1) {
      const handIndex = game.selected.index;
      mutate((draft) => {
        const player = activePlayer(draft);
        const target = player.hand[handIndex];
        if (!target || target.type !== "ai") return;
        const sourceIndexes = tutorialUpgradeSourceIndexes(tutorialStep, player, target, upgradeSourceIndexes(player, target, draft.actionsRemaining));
        if (sourceIndexes.length <= 1) return;
        draft.pendingTarget = {
          kind: "card-select",
          reason: "upgrade-source",
          zone: "field",
          playerIndex: draft.active,
          title: `${target.name}のアップグレード元を選択`,
          prompt: "下に重ねる元の召喚獣を選んでください。",
          confirmLabel: "このカードを元にする",
          min: 1,
          max: 1,
          excludeIndexes: player.field.map((_, index) => sourceIndexes.includes(index) ? -1 : index).filter((index) => index >= 0),
          selectedIndexes: [],
          sourceIndex: handIndex,
          actionCost: upgradeCost(target, player.field[sourceIndexes[0]]),
          cancelable: true,
        };
      });
      return;
    }
    performUpgradeSelectedAi(game.selected.index, sourceIndexes[0]);
  }

  function performUpgradeSelectedAi(handIndex: number, sourceIndex: number) {
    const player = activePlayer(game);
    const target = player.hand[handIndex];
    const source = player.field[sourceIndex];
    const cost = target && source ? upgradeCost(target, source) : 99;
    if (!target || target.type !== "ai" || !source || !canUpgrade(source, target) || cost > game.actionsRemaining) return;
    launchCardFlight({
      card: target,
      from: { ownerIndex: 0, zone: "hand", index: handIndex },
      to: { ownerIndex: 0, zone: "field", index: sourceIndex },
      label: "アップグレード",
    });
    mutate((draft) => {
      const player = activePlayer(draft);
      const target = player.hand[handIndex];
      if (!target || target.type !== "ai") return;
      const source = player.field[sourceIndex];
      const cost = source ? upgradeCost(target, source) : 99;
      if (!source || !canUpgrade(source, target) || draft.actionsRemaining < cost) return;
      const card = player.hand.splice(handIndex, 1)[0];
      stackUpgradeCard(player, sourceIndex, source);
      player.field[sourceIndex] = card;
      player.spentFieldIndexes.delete(sourceIndex);
      player.power3RecoveryDelayedFieldIndexes.delete(sourceIndex);
      player.chargeGuardedFieldIndexes.delete(sourceIndex);
      player.turnFieldAttackBonuses.delete(sourceIndex);
      draft.pendingTarget = null;
      let text = `${player.name}は${source.name}を元に${card.name}へアップグレード。`;
      text += applyPlayEffects(draft, player, card, sourceIndex, cost, source);
      addLog(draft, text);
      draft.selected = null;
      if (!draft.pendingTarget) afterAction(draft, cost);
    });
    if (target.power === 4) {
      queueDuelEvent({
        kind: "upgrade",
        title: "切札へアップグレード!!",
        detail: `${source.name}を元に${target.name}へ。一撃必殺の切札が戦線に立ちます。`,
        fromLabel: "手札 + 場",
        toLabel: "場",
        tone: "magenta",
        emphasis: "peak",
        cards: [
          { card: source, label: "元", state: "neutral" },
          { card: target, label: "切札", state: "winner" },
        ],
      });
    }
    showToast("アップグレード", target.name);
    playSfx("play");
  }

  function useSelectedCommand() {
    if (!canHumanAct(game) || game.selected?.zone !== "hand") return;
    const player = activePlayer(game);
    const opponentPlayerState = opponentPlayer(game);
    const sourceIndex = game.selected.index;
    const command = player.hand[sourceIndex];
    if (!commandUsable(game, command, player, opponentPlayerState)) return;
    if (command.effect === "disrupt") {
      mutate((draft) => {
        draft.pendingTarget = { kind: "disrupt", sourceIndex };
      });
      return;
    }
    if (command.effect === "purge") {
      mutate((draft) => {
        draft.pendingTarget = { kind: "purge", sourceIndex };
      });
      return;
    }
    if (command.effect === "patch" && highestPowerSpentAi(player) !== null) {
      mutate((draft) => {
        const player = activePlayer(draft);
        const command = player.hand[sourceIndex];
        if (!command || command.effect !== "patch") return;
        draft.pendingTarget = {
          kind: "card-select",
          reason: "ready-ally",
          zone: "field",
          playerIndex: draft.active,
          title: `${command.name}で回復する召喚獣を選択`,
          prompt: "消耗から回復する自分の召喚獣を1体選んでください。",
          confirmLabel: "この召喚獣を回復する",
          min: 1,
          max: 1,
          excludeIndexes: player.field.map((_, index) => player.spentFieldIndexes.has(index) ? -1 : index).filter((index) => index >= 0),
          selectedIndexes: [],
          sourceIndex,
          actionCost: 1,
          cancelable: true,
        };
      });
      return;
    }
    if (command.effect === "optimize" && player.hand.length > 1) {
      mutate((draft) => {
        draft.pendingTarget = {
          kind: "hand-discard",
          reason: "optimize",
          playerIndex: draft.active,
          title: `${command.name}でトラッシュへ送るカードを選択`,
          prompt: "1枚選んでから山札からカードを2枚引きます。",
          min: 1,
          max: 1,
          excludeIndexes: [sourceIndex],
          selectedIndexes: [],
          sourceIndex,
        };
      });
      return;
    }
    if (command.effect === "relearn" && player.hand.length > 1) {
      mutate((draft) => {
        const player = activePlayer(draft);
        const command = player.hand[sourceIndex];
        if (!command || command.effect !== "relearn") return;
        draft.pendingTarget = {
          kind: "hand-discard",
          reason: "relearn",
          playerIndex: draft.active,
          title: `${command.name}の代償を選択`,
          prompt: "トラッシュから召喚獣を回収するため、先に手札を1枚選んで捨てます。",
          min: 1,
          max: 1,
          excludeIndexes: [sourceIndex],
          selectedIndexes: [],
          sourceIndex,
          actionCost: 1,
          cancelable: true,
        };
      });
      return;
    }
    if (command.effect === "wind_rite") {
      const enemyTarget = highestPowerReadyAi(opponentPlayerState);
      const readyTarget = highestPowerSpentAiByAttribute(player, "風");
      if (enemyTarget !== null) {
        mutate((draft) => {
          const player = activePlayer(draft);
          const opponent = opponentPlayer(draft);
          const command = player.hand[sourceIndex];
          if (!command || command.effect !== "wind_rite") return;
          draft.pendingTarget = {
            kind: "card-select",
            reason: "wind-rite-disrupt",
            zone: "field",
            playerIndex: 1 - draft.active,
            title: `${command.name}で消耗させる相手を選択`,
            prompt: "消耗させる相手の未消耗召喚獣を1体選んでください。",
            confirmLabel: "この召喚獣を消耗",
            min: 1,
            max: 1,
            excludeIndexes: opponent.field.map((_, index) => opponent.spentFieldIndexes.has(index) ? index : -1).filter((index) => index >= 0),
            selectedIndexes: [],
            sourceIndex,
            actionCost: 1,
            cancelable: true,
          };
        });
        return;
      }
      if (readyTarget !== null) {
        mutate((draft) => {
          const player = activePlayer(draft);
          const command = player.hand[sourceIndex];
          if (!command || command.effect !== "wind_rite") return;
          draft.pendingTarget = {
            kind: "card-select",
            reason: "wind-rite-ready",
            zone: "field",
            playerIndex: draft.active,
            title: `${command.name}で回復する風召喚獣を選択`,
            prompt: "消耗から回復する自分の風召喚獣を1体選んでください。",
            confirmLabel: "この召喚獣を回復する",
            min: 1,
            max: 1,
            excludeIndexes: player.field.map((card, index) => card.attribute === "風" && player.spentFieldIndexes.has(index) ? -1 : index).filter((index) => index >= 0),
            selectedIndexes: [],
            sourceIndex,
            actionCost: 1,
            cancelable: true,
          };
        });
        return;
      }
    }
    if (command.effect === "earth_rite") {
      mutate((draft) => {
        const player = activePlayer(draft);
        const command = player.hand[sourceIndex];
        if (!command || command.effect !== "earth_rite") return;
        draft.pendingTarget = {
          kind: "card-select",
          reason: "earth-rite-recover",
          zone: "discard",
          playerIndex: draft.active,
          title: `${command.name}で回収するカードを選択`,
          prompt: "トラッシュから手札に戻す召喚獣を1枚選んでください。",
          confirmLabel: "このカードを回収",
          min: 1,
          max: 1,
          excludeIndexes: player.discard.map((card, index) => card.type === "ai" ? -1 : index).filter((index) => index >= 0),
          selectedIndexes: [],
          sourceIndex,
          actionCost: 1,
          cancelable: true,
        };
      });
      return;
    }
    if (command.effect === "tide_edge") {
      mutate((draft) => {
        const player = activePlayer(draft);
        const command = player.hand[sourceIndex];
        if (!command || command.effect !== "tide_edge") return;
        draft.pendingTarget = {
          kind: "card-select",
          reason: "tide-edge-buff",
          zone: "field",
          playerIndex: draft.active,
          title: `${command.name}で強化する召喚獣を選択`,
          prompt: "このターン、戦闘時の攻撃値を+2する自分の召喚獣を1体選んでください。",
          confirmLabel: "この召喚獣を強化",
          min: 1,
          max: 1,
          excludeIndexes: [],
          selectedIndexes: [],
          sourceIndex,
          actionCost: 1,
          cancelable: true,
        };
      });
      return;
    }
    if (command.effect === "grave_call") {
      mutate((draft) => {
        const player = activePlayer(draft);
        const command = player.hand[sourceIndex];
        if (!command || command.effect !== "grave_call") return;
        draft.pendingTarget = {
          kind: "card-select",
          reason: "grave-call-revive",
          zone: "discard",
          playerIndex: draft.active,
          title: `${command.name}で場に出すカードを選択`,
          prompt: "消耗状態で場に出す power 2 以下の召喚獣を1枚選んでください。",
          confirmLabel: "このカードを場に出す",
          min: 1,
          max: 1,
          excludeIndexes: player.discard
            .map((card, index) => (card.type === "ai" && (card.power ?? 0) <= 3 ? -1 : index))
            .filter((index) => index >= 0),
          selectedIndexes: [],
          sourceIndex,
          actionCost: 1,
          cancelable: true,
        };
      });
      return;
    }
    if (command.effect === "salvage") {
      mutate((draft) => {
        const player = activePlayer(draft);
        const command = player.hand[sourceIndex];
        if (!command || command.effect !== "salvage") return;
        draft.pendingTarget = {
          kind: "card-select",
          reason: "salvage-recover",
          zone: "discard",
          playerIndex: draft.active,
          title: `${command.name}で回収するカードを選択`,
          prompt: "トラッシュから手札に戻す術式を1枚選んでください。遺灰回収は戻せません。",
          confirmLabel: "このカードを回収",
          min: 1,
          max: 1,
          excludeIndexes: player.discard
            .map((card, index) => (card.type === "event" && card.effect !== "salvage" ? -1 : index))
            .filter((index) => index >= 0),
          selectedIndexes: [],
          sourceIndex,
          actionCost: 1,
          cancelable: true,
        };
      });
      return;
    }
    if (command.effect === "comeback_rite" && highestPowerSpentAi(player) !== null) {
      mutate((draft) => {
        const player = activePlayer(draft);
        const command = player.hand[sourceIndex];
        if (!command || command.effect !== "comeback_rite") return;
        draft.pendingTarget = {
          kind: "card-select",
          reason: "comeback-rite-ready",
          zone: "field",
          playerIndex: draft.active,
          title: `${command.name}で回復する召喚獣を選択`,
          prompt: "消耗から回復する自分の召喚獣を1体選んでください。",
          confirmLabel: "この召喚獣を回復する",
          min: 1,
          max: 1,
          excludeIndexes: player.field.map((_, index) => player.spentFieldIndexes.has(index) ? -1 : index).filter((index) => index >= 0),
          selectedIndexes: [],
          sourceIndex,
          actionCost: 1,
          cancelable: true,
        };
      });
      return;
    }
    useCommandAt(sourceIndex, null);
  }

  function useCommandAt(sourceIndex: number, targetIndex: number | null, discardIndexes: number[] = [], secondaryTargetIndex: number | null = null) {
    const player = activePlayer(game);
    const command = player.hand[sourceIndex];
    if (command?.type === "event") {
      const recovered = commandUsable(game, command, player, opponentPlayer(game))
        ? commandRecoverPreview(player, command, targetIndex)
        : null;
      suppressNextTrashSfx(game.active);
      launchTrashFlight(
        command,
        { ownerIndex: game.active, zone: flightHandZone(player), index: player.isHuman ? sourceIndex : 0 },
        game.active,
        "術式発動",
      );
      if (recovered) launchRecoverFlight(recovered.card, game.active, recovered.index);
      if (command.effect === "trinity") {
        player.field.forEach((card, index) => {
          launchTrashFlight(card, { ownerIndex: game.active, zone: "field", index }, game.active, "場を一掃", 780);
        });
      }
    }
    mutate((draft) => useCommandAtInDraft(draft, sourceIndex, targetIndex, discardIndexes, { playSfx, showDuelEvent: queueDuelEvent }, secondaryTargetIndex));
    showToast("術式", "カードを発動しました");
    playSfx("play");
  }

  function attackWithSelectedAi() {
    if (!canHumanAct(game) || game.selected?.zone !== "field") return;
    if (tutorialBlocks("attack")) return;
    const fieldIndex = game.selected.index;
    const attackCard = game.players[0].field[fieldIndex];
    if ((!tutorialStep || tutorialStep.id === "strike-monster") && CONFIG.monsterCombat && attackCard && strikeTargets(attackCard, game.players[1], { attacker: game.players[0], attackerFieldIndex: fieldIndex }).length > 0) {
      mutate((draft) => {
        draft.pendingTarget = { kind: "strike", sourceIndex: fieldIndex };
      });
      showToast("攻撃対象を選択", "相手プレイヤーか、光っている相手の召喚獣を選んでください");
      return;
    }
    beginAttack(0, fieldIndex);
  }

  function performStrike(fieldIndex: number, targetIndex: number) {
    // チュートリアル中はライバルの防御を固定進行に合わせて「防御しない」に固定する
    const tutorialRivalDefense: DefenseChoice | undefined = tutorialActive ? { type: "none" } : undefined;
    mutate((draft) => {
      draft.pendingTarget = null;
      strikeInDraft(draft, 0, fieldIndex, targetIndex, { playSfx, showDuelEvent: queueDuelEvent }, tutorialRivalDefense);
    });
    showToast("攻撃", "相手の召喚獣を攻撃しました");
  }

  function confirmFaceAttack() {
    const pending = game.pendingTarget;
    if (pending?.kind !== "strike") return;
    if (tutorialStep?.id === "strike-monster") {
      showToast("チュートリアル進行中", "相手の召喚獣を選んで討伐してください");
      return;
    }
    mutate((draft) => {
      draft.pendingTarget = null;
    });
    beginAttack(0, pending.sourceIndex);
  }

  function beginAttack(attackerIndex: number, fieldIndex: number) {
    const attacker = game.players[attackerIndex];
    const defender = game.players[1 - attackerIndex];
    const attackCard = attacker.field[fieldIndex];
    const resolvesImmediately = Boolean(attackCard && defender && !defender.isHuman);
    // チュートリアル中はライバルの防御を固定進行に合わせて「防御しない」に固定する
    const tutorialRivalDefense: DefenseChoice | undefined = tutorialActive && defender && !defender.isHuman ? { type: "none" } : undefined;
    if (attackCard && defender && !defender.isHuman) {
      launchDefenseTrashFlights(attackerIndex, fieldIndex, tutorialRivalDefense ?? chooseAiDefense(defender, attackCard, defender.aiProfile));
    }
    mutate((draft) => beginAttackInDraft(draft, attackerIndex, fieldIndex, { playSfx, showDuelEvent: queueDuelEvent }, tutorialRivalDefense));
    showToast("攻撃", "攻撃を宣言しました");
    if (!resolvesImmediately) playSfx("attack");
  }

  function resolveDefense(choice: DefenseChoice) {
    if (tutorialBlocks("defend", { defenseChoice: choice })) return;
    if (game.pendingAttack) {
      launchDefenseTrashFlights(game.pendingAttack.attackerIndex, game.pendingAttack.fieldIndex, choice);
    }
    mutate((draft) => resolveDefenseInDraft(draft, choice, { playSfx, showDuelEvent: queueDuelEvent }));
    if (game.pendingAttack && duelEvent) dismissDuelEvent();
  }

  function chargeSelectedCard() {
    if (game.selected?.zone !== "hand" || game.selected.ownerIndex !== 0 || !canUseCharge(game, human)) return;
    if (tutorialBlocks("charge")) return;
    const player = activePlayer(game);
    const card = player.hand[game.selected.index];
    if (!card) return;
    if (card.effect === "charge_ready_ally" && highestPowerSpentAi(player) !== null) {
      const handIndex = game.selected.index;
      mutate((draft) => {
        const player = activePlayer(draft);
        const current = player.hand[handIndex];
        if (!current || current.effect !== "charge_ready_ally") return;
        draft.pendingTarget = {
          kind: "card-select",
          reason: "charge-ready-ally",
          zone: "field",
          playerIndex: draft.active,
          title: `${current.name}で回復する召喚獣を選択`,
          prompt: "消耗から回復する自分の召喚獣を1体選んでください。",
          confirmLabel: "この召喚獣を回復する",
          min: 1,
          max: 1,
          excludeIndexes: player.field.map((_, index) => player.spentFieldIndexes.has(index) ? -1 : index).filter((index) => index >= 0),
          selectedIndexes: [],
          sourceIndex: handIndex,
          cancelable: true,
        };
      });
      return;
    }
    if (card.effect === "charge_guard" && player.field.length > 0) {
      const handIndex = game.selected.index;
      mutate((draft) => {
        const current = draft.players[0].hand[handIndex];
        if (!current || current.effect !== "charge_guard") return;
        draft.pendingTarget = {
          kind: "card-select",
          reason: "charge-guard",
          zone: "field",
          playerIndex: 0,
          title: `${current.name}の防御強化対象を選択`,
          prompt: "次の自分ターンまで場防御値 +1 する召喚獣を1体選んでください。",
          confirmLabel: "この召喚獣を強化",
          min: 1,
          max: 1,
          excludeIndexes: [],
          selectedIndexes: [],
          sourceIndex: handIndex,
          cancelable: true,
        };
      });
      return;
    }
    if (card.effect === "charge_spend_enemy" && highestPowerReadyAi(game.players[1]) !== null) {
      const handIndex = game.selected.index;
      mutate((draft) => {
        const current = draft.players[0].hand[handIndex];
        if (!current || current.effect !== "charge_spend_enemy") return;
        const opponent = draft.players[1];
        draft.pendingTarget = {
          kind: "card-select",
          reason: "charge-spend-enemy",
          zone: "field",
          playerIndex: 1,
          title: `${current.name}で消耗させる相手召喚獣を選択`,
          prompt: "消耗させる相手の未消耗召喚獣を1体選んでください。",
          confirmLabel: "この召喚獣を消耗",
          min: 1,
          max: 1,
          excludeIndexes: opponent.field.map((_, index) => opponent.spentFieldIndexes.has(index) ? index : -1).filter((index) => index >= 0),
          selectedIndexes: [],
          sourceIndex: handIndex,
          cancelable: true,
        };
      });
      return;
    }
    if (card.effect === "charge_spend_enemy_ready_ally" && highestPowerReadyAi(game.players[1]) !== null) {
      // 消耗させる相手は選択、自分の回復対象は自動（最高power消耗中）で解決する
      const handIndex = game.selected.index;
      mutate((draft) => {
        const current = draft.players[0].hand[handIndex];
        if (!current || current.effect !== "charge_spend_enemy_ready_ally") return;
        const opponent = draft.players[1];
        draft.pendingTarget = {
          kind: "card-select",
          reason: "charge-spend-enemy",
          zone: "field",
          playerIndex: 1,
          title: `${current.name}で消耗させる相手召喚獣を選択`,
          prompt: "消耗させる相手の未消耗召喚獣を1体選んでください。自分の消耗中召喚獣の回復は自動で行われます。",
          confirmLabel: "この召喚獣を消耗",
          min: 1,
          max: 1,
          excludeIndexes: opponent.field.map((_, index) => opponent.spentFieldIndexes.has(index) ? index : -1).filter((index) => index >= 0),
          selectedIndexes: [],
          sourceIndex: handIndex,
          cancelable: true,
        };
      });
      return;
    }
    if (card.effect === "charge_spend_enemy_ready_ally" && highestPowerSpentAi(player) !== null) {
      // 相手に未消耗召喚獣がいない場合は回復対象だけを選択する
      const handIndex = game.selected.index;
      mutate((draft) => {
        const owner = draft.players[0];
        const current = owner.hand[handIndex];
        if (!current || current.effect !== "charge_spend_enemy_ready_ally") return;
        draft.pendingTarget = {
          kind: "card-select",
          reason: "charge-ready-ally",
          zone: "field",
          playerIndex: 0,
          title: `${current.name}で回復する召喚獣を選択`,
          prompt: "消耗から回復する自分の召喚獣を1体選んでください。",
          confirmLabel: "この召喚獣を回復する",
          min: 1,
          max: 1,
          excludeIndexes: owner.field.map((_, index) => owner.spentFieldIndexes.has(index) ? -1 : index).filter((index) => index >= 0),
          selectedIndexes: [],
          sourceIndex: handIndex,
          cancelable: true,
        };
      });
      return;
    }
    if (
      (card.effect === "charge_recover_discard" ? player.hand.length <= 3 : card.effect === "charge_recover_discard_any")
      && highestPowerAiInDiscard(player) !== null
    ) {
      const handIndex = game.selected.index;
      mutate((draft) => {
        const current = draft.players[0].hand[handIndex];
        if (!current || (current.effect !== "charge_recover_discard" && current.effect !== "charge_recover_discard_any")) return;
        const owner = draft.players[0];
        draft.pendingTarget = {
          kind: "card-select",
          reason: "charge-recover",
          zone: "discard",
          playerIndex: 0,
          title: `${current.name}で回収するカードを選択`,
          prompt: "トラッシュから手札に戻す召喚獣を1枚選んでください。",
          confirmLabel: "このカードを回収",
          min: 1,
          max: 1,
          excludeIndexes: owner.discard.map((item, index) => item.type === "ai" ? -1 : index).filter((index) => index >= 0),
          selectedIndexes: [],
          sourceIndex: handIndex,
          cancelable: true,
        };
      });
      return;
    }
    playSfx("charge");
    suppressNextTrashSfx(0);
    launchTrashFlight(card, { ownerIndex: 0, zone: "hand", index: game.selected.index }, 0, "チャージ");
    mutate((draft) => {
      if (draft.selected?.zone !== "hand" || draft.selected.ownerIndex !== 0) return;
      chargeHandCardInDraft(draft, 0, draft.selected.index);
    });
    queueDuelEvent({
      kind: "command",
      title: `${player.name}がチャージ`,
      detail: `${card.name}をトラッシュへ送り、このターンのアクションを1増やしました。`,
      fromLabel: "手札",
      toLabel: "トラッシュ",
      tone: "magenta",
      cards: [{ card, label: "チャージ", state: "trash" }],
    });
    showToast("チャージ", "手札をアクションに変換しました");
  }

  function endTurn() {
    if (!canHumanEndTurn(game)) return;
    if (tutorialBlocks("end")) return;
    mutate((draft) => {
      finishTurn(draft, true);
    });
  }

  function confirmPendingTarget() {
    const pending = game.pendingTarget;
    if (!pending || pending.kind !== "hand-discard" || pending.selectedIndexes.length < pending.min) return;
    if (pending.reason === "firewall") {
      const player = game.players[pending.playerIndex];
      const fuelIndex = pending.selectedIndexes[0];
      const fuel = typeof fuelIndex === "number" ? player.hand[fuelIndex] : null;
      if (fuel) {
        launchTrashFlight(
          fuel,
          { ownerIndex: pending.playerIndex, zone: flightHandZone(player), index: player.isHuman ? fuelIndex : 0 },
          pending.playerIndex,
          "結界代償",
        );
      }
      resolveDefense({ type: "field", index: pending.fieldIndex!, firewallDiscardIndex: pending.selectedIndexes[0] ?? null });
      return;
    }
    if (pending.reason === "relearn") {
      mutate((draft) => {
        const player = draft.players[pending.playerIndex];
        const command = player.hand[pending.sourceIndex!];
        if (!command || command.effect !== "relearn") return;
        draft.pendingTarget = {
          kind: "card-select",
          reason: "relearn-recover",
          zone: "discard",
          playerIndex: pending.playerIndex,
          title: `${command.name}で回収するカードを選択`,
          prompt: "トラッシュから手札に戻す召喚獣を1枚選んでください。",
          confirmLabel: "このカードを回収",
          min: 1,
          max: 1,
          excludeIndexes: player.discard.map((card, index) => card.type === "ai" ? -1 : index).filter((index) => index >= 0),
          selectedIndexes: [],
          discardIndexes: pending.selectedIndexes,
          sourceIndex: pending.sourceIndex,
          actionCost: 1,
          cancelable: true,
        };
      });
      return;
    }
    useCommandAt(pending.sourceIndex!, pending.targetIndex ?? null, pending.selectedIndexes);
  }

  function confirmCardSelectionTarget() {
    const pending = game.pendingTarget;
    if (!pending || pending.kind !== "card-select" || pending.selectedIndexes.length < pending.min) return;
    const selectedIndex = pending.selectedIndexes[0];
    const pendingPlayer = game.players[pending.playerIndex];
    if (pending.reason === "upgrade-source") {
      performUpgradeSelectedAi(pending.sourceIndex!, selectedIndex);
      return;
    }
    if (pending.reason === "wind-rite-disrupt") {
      const player = game.players[game.active];
      const readyTarget = highestPowerSpentAiByAttribute(player, "風");
      if (readyTarget !== null) {
        mutate((draft) => {
          const player = activePlayer(draft);
          const command = player.hand[pending.sourceIndex!];
          if (!command || command.effect !== "wind_rite") return;
          draft.pendingTarget = {
            kind: "card-select",
            reason: "wind-rite-ready",
            zone: "field",
            playerIndex: draft.active,
            title: `${command.name}で回復する風召喚獣を選択`,
            prompt: "消耗から回復する自分の風召喚獣を1体選んでください。",
            confirmLabel: "この召喚獣を回復する",
            min: 1,
            max: 1,
            excludeIndexes: player.field.map((card, index) => card.attribute === "風" && player.spentFieldIndexes.has(index) ? -1 : index).filter((index) => index >= 0),
            selectedIndexes: [],
            sourceIndex: pending.sourceIndex,
            targetIndex: selectedIndex,
            actionCost: 1,
            cancelable: true,
          };
        });
        return;
      }
      useCommandAt(pending.sourceIndex!, selectedIndex);
      return;
    }
    if (pending.reason === "wind-rite-ready") {
      useCommandAt(pending.sourceIndex!, pending.targetIndex ?? null, [], selectedIndex);
      return;
    }
    if (pending.reason === "comeback-rite-ready") {
      useCommandAt(pending.sourceIndex!, selectedIndex);
      return;
    }
    if (
      pending.reason === "relearn-recover"
      || pending.reason === "earth-rite-recover"
      || pending.reason === "tide-edge-buff"
      || pending.reason === "grave-call-revive"
      || pending.reason === "salvage-recover"
    ) {
      useCommandAt(pending.sourceIndex!, selectedIndex, pending.discardIndexes ?? []);
      return;
    }
    if (pending.reason === "recover-on-play") {
      launchRecoverFlight(pendingPlayer.discard[selectedIndex], pending.playerIndex, selectedIndex);
    }
    if (pending.reason === "charge-guard" || pending.reason === "charge-ready-ally") {
      const charged = pendingPlayer.hand[pending.sourceIndex!];
      if (charged) {
        playSfx("charge");
        suppressNextTrashSfx(pending.playerIndex);
        launchTrashFlight(charged, { ownerIndex: pending.playerIndex, zone: flightHandZone(pendingPlayer), index: pendingPlayer.isHuman ? pending.sourceIndex! : 0 }, pending.playerIndex, "チャージ");
      }
    }
    if (pending.reason === "charge-spend-enemy" || pending.reason === "charge-recover") {
      const chargeOwner = game.players[0];
      const charged = chargeOwner.hand[pending.sourceIndex!];
      if (charged) {
        playSfx("charge");
        suppressNextTrashSfx(0);
        launchTrashFlight(charged, { ownerIndex: 0, zone: flightHandZone(chargeOwner), index: pending.sourceIndex! }, 0, "チャージ");
      }
    }
    if (pending.reason === "filter-discard" || pending.reason === "block-pressure" || pending.reason === "deep-current-discard") {
      const discarded = pendingPlayer.hand[selectedIndex];
      launchTrashFlight(
        discarded,
        { ownerIndex: pending.playerIndex, zone: flightHandZone(pendingPlayer), index: pendingPlayer.isHuman ? selectedIndex : 0 },
        pending.playerIndex,
        "トラッシュへ送る",
      );
    } else if (pending.reason === "accelerator-sacrifice") {
      const sacrificed = pendingPlayer.field[selectedIndex];
      launchTrashFlight(sacrificed, { ownerIndex: pending.playerIndex, zone: "field", index: selectedIndex }, pending.playerIndex, "遺物の代償");
    }
    const readyAllyCommandSelected = pending.reason === "ready-ally" && typeof pending.sourceIndex === "number";
    if (readyAllyCommandSelected) {
      suppressNextTrashSfx(pending.playerIndex);
      playSfx("play");
    }
    mutate((draft) => {
      const current = draft.pendingTarget;
      if (!current || current.kind !== "card-select") return;
      const player = draft.players[current.playerIndex];
      if (current.reason === "filter-discard" || current.reason === "block-pressure" || current.reason === "deep-current-discard") {
        const discarded = discardHandCards(draft, current.playerIndex, current.selectedIndexes);
        if (discarded.length > 0) {
          const sourceName = current.reason === "block-pressure" ? "攻撃の圧" : current.reason === "deep-current-discard" ? "深流呼び" : "登場時効果";
          addLog(draft, `${player.name}は${sourceName}で${discarded.map((card) => card.name).join("、")}をトラッシュへ送った。`);
          queueDuelEvent({
            kind: "trash",
            title: `${sourceName}でトラッシュへ送るカード`,
            detail: `${discarded.map((card) => card.name).join("、")}を手札からトラッシュへ送りました。`,
            fromLabel: "手札",
            toLabel: "トラッシュ",
            tone: player.isHuman ? "magenta" : "cyan",
            cards: discarded.map((card) => ({ card, label: "トラッシュへ送る", state: "trash" })),
          });
        }
      } else if (current.reason === "recover-on-play") {
        const recovered = player.discard.splice(selectedIndex, 1)[0];
        if (recovered) {
          player.hand.push(recovered);
          const urnDrawnCards = applyEchoUrnDraw(player);
          if (urnDrawnCards.length > 0) {
            addLog(draft, `${player.memory!.name}で${player.name}は${visibleDrawText(player, urnDrawnCards)}。`);
          }
          addLog(draft, `${player.name}は${recovered.name}をトラッシュから回収。`);
          queueDuelEvent({
            kind: "trash",
            title: "トラッシュから回収",
            detail: `${recovered.name}を手札に戻しました。`,
            fromLabel: "トラッシュ",
            toLabel: "手札",
            tone: player.isHuman ? "magenta" : "cyan",
            cards: [{ card: recovered, label: "回収", state: "winner" }],
          });
        }
      } else if (current.reason === "ready-ally") {
        if (typeof current.sourceIndex === "number") {
          useCommandAtInDraft(draft, current.sourceIndex, selectedIndex, [], { playSfx, showDuelEvent: queueDuelEvent });
          return;
        }
        const card = player.field[selectedIndex];
        if (card) {
          player.spentFieldIndexes.delete(selectedIndex);
          player.power3RecoveryDelayedFieldIndexes.delete(selectedIndex);
          addLog(draft, `${player.name}は${card.name}を回復した。`);
        }
      } else if (current.reason === "spend-enemy") {
        const card = player.field[selectedIndex];
        if (card) {
          player.spentFieldIndexes.add(selectedIndex);
          addLog(draft, `${player.name}の${card.name}を消耗。`);
        }
      } else if (current.reason === "accelerator-sacrifice") {
        const sacrificed = player.field[selectedIndex];
        const memory = player.memory;
        const resolved = useAcceleratorMemoryInDraft(draft, current.playerIndex, selectedIndex);
        if (resolved && sacrificed && memory) {
          queueDuelEvent({
            kind: "trash",
            title: `${memory.name}を使用`,
            detail: `${sacrificed.name}を場からトラッシュし、残りアクションを1増やしました。`,
            fromLabel: "場",
            toLabel: "トラッシュ",
            resultLabel: "アクション +1",
            tone: player.isHuman ? "magenta" : "cyan",
            cards: [{ card: sacrificed, label: "代償", state: "trash" }],
          });
        }
        return;
      } else if (current.reason === "charge-ready-ally") {
        const targetIndex = current.selectedIndexes[0];
        const charged = confirmChargeReadyAllyTargetInDraft(draft, current.playerIndex, current.sourceIndex!, targetIndex);
        if (charged) {
          queueDuelEvent({
            kind: "command",
            title: `${player.name}がチャージ`,
            detail: `${charged.name}をトラッシュへ送り、このターンのアクションを1増やしました。${player.field[targetIndex]?.name ?? "選んだ召喚獣"}を回復します。`,
            fromLabel: "手札",
            toLabel: "トラッシュ",
            tone: player.isHuman ? "magenta" : "cyan",
            cards: [{ card: charged, label: "チャージ", state: "trash" }],
          });
        }
        return;
      } else if (current.reason === "charge-guard") {
        const targetIndex = current.selectedIndexes[0];
        const charged = confirmChargeGuardTargetInDraft(draft, current.playerIndex, current.sourceIndex!, targetIndex);
        if (charged) {
          queueDuelEvent({
            kind: "command",
            title: `${player.name}がチャージ`,
            detail: `${charged.name}をトラッシュへ送り、このターンのアクションを1増やしました。${player.field[targetIndex]?.name ?? "選んだ召喚獣"}の場防御値を次の自分ターンまで+1します。`,
            fromLabel: "手札",
            toLabel: "トラッシュ",
            tone: player.isHuman ? "magenta" : "cyan",
            cards: [{ card: charged, label: "チャージ", state: "trash" }],
          });
        }
        return;
      } else if (current.reason === "charge-spend-enemy") {
        const targetIndex = current.selectedIndexes[0];
        const opponent = draft.players[1];
        const targetName = opponent.field[targetIndex]?.name ?? "選んだ召喚獣";
        const charged = confirmChargeSpendEnemyTargetInDraft(draft, 0, current.sourceIndex!, targetIndex);
        if (charged) {
          const chargeOwner = draft.players[0];
          queueDuelEvent({
            kind: "command",
            title: `${chargeOwner.name}がチャージ`,
            detail: `${charged.name}をトラッシュへ送り、このターンのアクションを1増やしました。${opponent.name}の${targetName}を消耗させます。`,
            fromLabel: "手札",
            toLabel: "トラッシュ",
            tone: chargeOwner.isHuman ? "magenta" : "cyan",
            cards: [{ card: charged, label: "チャージ", state: "trash" }],
          });
        }
        return;
      } else if (current.reason === "charge-recover") {
        const targetIndex = current.selectedIndexes[0];
        const recoveredName = player.discard[targetIndex]?.name ?? "選んだカード";
        const charged = confirmChargeRecoverTargetInDraft(draft, current.playerIndex, current.sourceIndex!, targetIndex);
        if (charged) {
          queueDuelEvent({
            kind: "command",
            title: `${player.name}がチャージ`,
            detail: `${charged.name}をトラッシュへ送り、このターンのアクションを1増やしました。${recoveredName}をトラッシュから手札に戻します。`,
            fromLabel: "手札",
            toLabel: "トラッシュ",
            tone: player.isHuman ? "magenta" : "cyan",
            cards: [{ card: charged, label: "チャージ", state: "trash" }],
          });
        }
        return;
      }
      const actionCost = current.actionCost ?? 1;
      draft.pendingTarget = null;
      afterAction(draft, actionCost, current.actionKind ?? "normal");
    });
  }

  function confirmRelicThiefTrash() {
    const pending = game.pendingTarget;
    if (!pending || pending.kind !== "confirm" || pending.reason !== "relic-thief-trash") return;
    const player = game.players[pending.playerIndex];
    const opponent = game.players[1 - pending.playerIndex];
    const relic = opponent.memory;
    if (relic) {
      launchTrashFlight(relic, { ownerIndex: 1 - pending.playerIndex, zone: "memory", index: 0 }, 1 - pending.playerIndex, "炉暴きレミ");
    }
    mutate((draft) => {
      const current = draft.pendingTarget;
      if (!current || current.kind !== "confirm" || current.reason !== "relic-thief-trash") return;
      const player = draft.players[current.playerIndex];
      const opponent = draft.players[1 - current.playerIndex];
      const card = player.field[current.fieldIndex];
      const trashed = trashMemory(opponent);
      if (trashed) {
        player.spentFieldIndexes.add(current.fieldIndex);
        addLog(draft, `${player.name}は${card?.name ?? "炉暴きレミ"}で${opponent.name}の${trashed.name}をトラッシュへ送った。代償として消耗した。`);
        queueDuelEvent({
          kind: "trash",
          title: `${card?.name ?? "炉暴きレミ"}を使用`,
          detail: `${opponent.name}の${trashed.name}をトラッシュへ送りました。`,
          fromLabel: "遺物",
          toLabel: "トラッシュ",
          resultLabel: "消耗",
          tone: player.isHuman ? "magenta" : "cyan",
          cards: [{ card: trashed, label: "トラッシュ", state: "trash" }],
        });
      }
      const actionCost = current.actionCost ?? 1;
      draft.pendingTarget = null;
      afterAction(draft, actionCost);
    });
  }

  function cancelRelicThiefTrash() {
    mutate((draft) => {
      const current = draft.pendingTarget;
      if (!current || current.kind !== "confirm" || current.reason !== "relic-thief-trash") return;
      const player = draft.players[current.playerIndex];
      const card = player.field[current.fieldIndex];
      addLog(draft, `${player.name}は${card?.name ?? "炉暴きレミ"}の効果を発動しなかった。`);
      const actionCost = current.actionCost ?? 1;
      draft.pendingTarget = null;
      afterAction(draft, actionCost);
    });
  }

  function togglePendingHandIndex(index: number) {
    mutate((draft) => {
      const pending = draft.pendingTarget;
      if (!pending || pending.kind !== "hand-discard") return;
      if (pending.excludeIndexes.includes(index)) return;
      const set = new Set(pending.selectedIndexes);
      if (set.has(index)) {
        set.delete(index);
      } else if (set.size < pending.max) {
        set.add(index);
      }
      pending.selectedIndexes = [...set].sort((a, b) => a - b);
    });
  }

  function togglePendingCardIndex(index: number) {
    mutate((draft) => {
      const pending = draft.pendingTarget;
      if (!pending || pending.kind !== "card-select") return;
      if (pending.excludeIndexes.includes(index)) return;
      const set = new Set(pending.selectedIndexes);
      if (set.has(index)) {
        set.delete(index);
      } else if (set.size < pending.max) {
        if (pending.max === 1) set.clear();
        set.add(index);
      }
      pending.selectedIndexes = [...set].sort((a, b) => a - b);
    });
  }

  function openDiscardViewer(ownerIndex: number) {
    mutate((draft) => {
      draft.discardViewerOwner = ownerIndex;
      const player = draft.players[ownerIndex];
      draft.discardViewerIndex = player.discard.length > 0 ? player.discard.length - 1 : null;
    });
  }

  function closeDiscardViewer() {
    mutate((draft) => {
      draft.discardViewerOwner = null;
      draft.discardViewerIndex = null;
    });
  }

  function selectDiscardCard(index: number) {
    const pending = game.pendingTarget;
    if (pending?.kind === "card-select" && pending.playerIndex === game.discardViewerOwner && pending.zone === "discard") {
      togglePendingCardIndex(index);
      return;
    }
    mutate((draft) => {
      draft.discardViewerIndex = index;
    });
  }

  const selectedOwnerIndex = game.selected?.ownerIndex ?? 0;
  const selectedHand = game.selected?.zone === "hand" && selectedOwnerIndex === 0;
  const selectedMemory = game.selected?.zone === "memory" && selectedOwnerIndex === 0;
  const selectedField = game.selected?.zone === "field" && selectedOwnerIndex === 0;
  const selectedHandCard = selectedHand ? human.hand[game.selected!.index] : null;
  const selectedMemoryCard = selectedMemory ? human.memory : null;
  const playButtonLabel = selectedMemory
    ? "遺物使用"
    : selectedCard?.type === "event"
      ? "使用"
      : selectedCard?.type === "memory"
        ? "遺物配置"
        : "場に出す";
  const playDisabled = !canHumanAct(game) || (
    selectedMemory
      ? !selectedMemoryCard || !canUseAcceleratorMemory(game, human)
      : !selectedHand || !selectedHandCard || (
        selectedHandCard.type === "event"
          ? !commandUsable(game, selectedHandCard, active, opponent)
          : selectedHandCard.type === "memory"
            ? playCost(selectedHandCard) > game.actionsRemaining
            : active.field.length >= CONFIG.fieldLimit || playCost(selectedHandCard, game) > game.actionsRemaining
      )
  );
  const selectedUpgradeSourceIndex = selectedHandCard?.type === "ai" ? bestUpgradeSource(active, selectedHandCard) : null;
  const selectedUpgradeSource = selectedUpgradeSourceIndex === null ? null : active.field[selectedUpgradeSourceIndex];
  const upgradeDisabled = !canHumanAct(game)
    || !selectedHand
    || selectedHandCard?.type !== "ai"
    || !selectedUpgradeSource
    || upgradeCost(selectedHandCard, selectedUpgradeSource) > game.actionsRemaining;
  const attackDisabled = !canHumanAct(game)
    || !selectedField
    || !canActivePlayerAttack(game)
    || active.spentFieldIndexes.has(game.selected?.index ?? -1);
  const chargeDisabled = game.selected?.zone !== "hand"
    || game.selected.ownerIndex !== 0
    || !canChargeCard(selectedHandCard)
    || !canUseCharge(game, human);
  const opponentActionsRemaining = game.active === 1 ? game.actionsRemaining : 0;
  const opponentAttackLockedByCharge = game.active === 1 && ai.chargeUsed;
  const humanAttackLockedByCharge = game.active === 0 && human.chargeUsed;
  const humanActionsRemaining = game.active === 0 ? game.actionsRemaining : lastHumanActionsRemaining;
  const actionMeterLabel = "自分の残りアクション";
  const combatPreview = combatPreviewForSelection(game);
  const endTurnEnabled = canHumanEndTurn(game);
  const playTutorialBlocked = tutorialStep ? !tutorialAllowsAction(tutorialStep, "play", game) : false;
  const upgradeTutorialBlocked = tutorialStep ? !tutorialAllowsAction(tutorialStep, "upgrade", game) : false;
  const attackTutorialBlocked = tutorialStep ? !tutorialAllowsAction(tutorialStep, "attack", game) : false;
  const chargeTutorialBlocked = tutorialStep ? !tutorialAllowsAction(tutorialStep, "charge", game) : false;
  const endTurnTutorialBlocked = tutorialStep ? !tutorialAllowsAction(tutorialStep, "end", game) : false;
  const showNoActionsEndTurnPrompt = endTurnEnabled
    && game.actionsRemaining <= 0
    && !canUseCharge(game, human)
    && !rulesOpen
    && !starterDeckSetupOpen
    && game.discardViewerOwner === null
    && !duelEvent
    && cardFlights.length === 0;
  const finalLog = game.log[game.log.length - 1] ?? "";
  const resultPreviewTone = readResultPreviewTone();
  const matchResult: MatchResultView | null = resultPreviewTone
    ? previewMatchResult(resultPreviewTone)
    : game.draw
    ? {
        tone: "draw" as const,
        kicker: "DRAW",
        title: "引き分け",
        lead: "決着なし",
        detail: `あなた ${human.life} - ${ai.life} ライバル`,
        reason: finalLog,
      }
    : game.winner !== null
      ? {
          tone: game.winner === 0 ? "win" as const : "lose" as const,
          kicker: game.winner === 0 ? "VICTORY" : "DEFEAT",
          title: game.winner === 0 ? "あなたの勝利" : "ライバルの勝利",
          lead: game.winner === 0 ? "勝利しました" : "敗北しました",
          detail: `あなた ${human.life} - ${ai.life} ライバル`,
          reason: finalLog,
        }
      : null;
  const defensePanel = (
    <DefensePanel
      game={game}
      onResolve={resolveDefense}
      onUseCommand={useCommandAt}
      onCancelTarget={() => {
        if (game.pendingTarget?.kind === "confirm" && game.pendingTarget.reason === "relic-thief-trash") {
          cancelRelicThiefTrash();
          return;
        }
        mutate((draft) => { draft.pendingTarget = null; });
      }}
      onTogglePendingHand={togglePendingHandIndex}
      onTogglePendingCard={togglePendingCardIndex}
      onConfirmPending={confirmPendingTarget}
      onConfirmCardSelection={confirmCardSelectionTarget}
      onConfirmRelicThiefTrash={confirmRelicThiefTrash}
      onConfirmFaceAttack={confirmFaceAttack}
      onStrikeTarget={performStrike}
      forcedDefenseChoice={tutorialForcedDefenseChoice(tutorialStep, game)}
    />
  );
  const showDefenseInDuelEvent = Boolean(
    duelEvent
      && game.pendingAttack
      && game.players[game.pendingAttack.defenderIndex]?.isHuman,
  );
  const allowBoardTargetSelection = game.pendingTarget?.kind === "card-select" && game.pendingTarget.zone === "field";
  const trashSurge = trashSurgeForEvent(duelEvent) ?? trashFlash;
  const ownerHasTrashSurge = (ownerIndex: number) => trashSurge?.owners.includes(ownerIndex) ?? false;
  const shellClassName = [
    "stitch-shell",
    allowBoardTargetSelection ? "field-targeting" : "",
    lifeImpact ? `life-impact life-impact-target-${lifeImpact.targetIndex} life-impact-amount-${Math.min(lifeImpact.amount, 3)}` : "",
  ].filter(Boolean).join(" ");

  if (page !== "duel") {
    return (
      <main className="workspace-shell">
        <WorkspaceHeader
          page={page}
          onChangePage={changePage}
          coins={coins}
          seed={seed}
          onStartNewGame={openStarterDeckSetup}
          onStartTutorial={startTutorialGame}
          onOpenRules={() => setRulesOpen(true)}
          audioEnabled={audioEnabled}
          onToggleAudio={toggleAudio}
        />
        {page === "cards" ? <CardLibraryPage /> : page === "packs" ? <PackOpeningPage coins={coins} onSpendPack={spendForPack} /> : <DeckBuilderPage />}
        <EventToast toast={toast} />
        {rulesOpen && <RulesModal onClose={() => setRulesOpen(false)} />}
      </main>
    );
  }

  if (starterDeckSetupOpen) {
    return (
      <main className="workspace-shell duel-setup-shell">
        <WorkspaceHeader
          page={page}
          onChangePage={changePage}
          coins={coins}
          seed={seed}
          onStartNewGame={openStarterDeckSetup}
          onStartTutorial={startTutorialGame}
          onOpenRules={() => setRulesOpen(true)}
          audioEnabled={audioEnabled}
          onToggleAudio={toggleAudio}
        />
        <StarterDeckSetupPanel
          playerSelection={playerDeckSelection}
          opponentSelection={opponentDeckSelection}
          opponentAiProfile={opponentAiProfile}
          savedDecks={savedDecks}
          onClose={() => setStarterDeckSetupOpen(false)}
          onStartTutorial={startTutorialGame}
          onChangePlayerSelection={setPlayerDeckSelection}
          onChangeOpponentSelection={setOpponentDeckSelection}
          onChangeOpponentAiProfile={setOpponentAiProfile}
          onStart={startSelectedDeckGame}
        />
        <EventToast toast={toast} />
        {rulesOpen && <RulesModal onClose={() => setRulesOpen(false)} />}
      </main>
    );
  }

  return (
    <main className={shellClassName}>
      <header className="stitch-opponent-bar">
        <div className="stitch-status-left">
          <div>
            <h2>{ai.name}</h2>
            <LifePips life={ai.life} tone="cyan" impact={lifeImpact?.targetIndex === 1 ? lifeImpact : null} />
          </div>
        </div>
        <div className="brand-mini">
          <img src={brandMark} alt="" />
          <span>BREAK DUEL</span>
        </div>
        <div className="duel-top-controls">
          <PageTabs page={page} onChange={changePage} />
          <CoinChip coins={coins} />
          <label className="duel-seed">
            <span>Seed</span>
            <input type="number" value={seed} readOnly aria-label="現在のSeed" />
          </label>
          <button type="button" onClick={openStarterDeckSetup}>再戦</button>
          <button type="button" onClick={startTutorialGame}>チュートリアル</button>
          <button type="button" onClick={() => setRulesOpen(true)}>ルール</button>
          <button type="button" className={audioEnabled ? "audio-on" : ""} onClick={toggleAudio}>{audioEnabled ? "音ON" : "音OFF"}</button>
        </div>
        <div className="stitch-counts">
          <div className="action-meter compact-action-meter" aria-label={`相手アクション ${opponentActionsRemaining}${opponentAttackLockedByCharge ? "、チャージ済みで攻撃不可" : ""}`}>
            <span className="meter-label">相手AP</span>
            <span className="meter-value">{opponentActionsRemaining}</span>
            <span className="action-tokens" aria-hidden="true">
              {Array.from({ length: CONFIG.actionsPerTurn + 1 }).map((_, index) => (
                <span key={index} className={actionTokenClass(index, opponentActionsRemaining)} />
              ))}
            </span>
            {opponentAttackLockedByCharge && <span className="charge-lock-badge">チャージ済み・攻撃不可</span>}
          </div>
          <span className="ai-hand-source" data-owner={1} data-zone="hand-source" data-index={0}>手札 {ai.hand.length}</span>
          <DeckPileCard player={ai} ownerIndex={1} compact />
          <TrashPileButton player={ai} ownerIndex={1} trashSurge={ownerHasTrashSurge(1)} onOpen={openDiscardViewer} compact />
        </div>
      </header>

      <section className="stitch-battlefield" aria-label="対戦盤面">
        <LeaderPortrait
          player={ai}
          tone="rival"
          image={leaderRivalImage}
          reactionImages={{ hurt: leaderRivalHurtImage, delight: leaderRivalDelightImage }}
          reaction={leaderReactions[1]}
          speech={rivalSpeech}
        />
        <FieldGrid player={ai} ownerIndex={1} game={game} isOpponent trashSurge={ownerHasTrashSurge(1)} combatPreview={combatPreview} tutorialStep={tutorialStep} tutorialFocus={tutorialStep?.focus} tutorialLocked={tutorialActive} onSelectField={selectField} onSelectMemory={selectMemory} />
        <div className={`clash-line ${combatPreview ? "armed" : ""} ${combatPreview?.direct ? "direct" : ""}`} aria-hidden="true">
          {combatPreview && (
            <span>
              ATK {combatPreview.attackValue}
              {combatPreview.direct
                ? combatPreview.handDefenseCount > 0 ? ` / 手札防御 ${combatPreview.handDefenseCount}` : " / DIRECT"
                : ` / 防御候補 ${combatPreview.fieldDefenses.size}`}
            </span>
          )}
        </div>
        <LeaderPortrait player={human} tone="human" image={leaderHumanImage} label="YOU" reaction={leaderReactions[0]} />
        <FieldGrid player={human} ownerIndex={0} game={game} trashSurge={ownerHasTrashSurge(0)} tutorialStep={tutorialStep} tutorialFocus={tutorialStep?.focus} tutorialLocked={tutorialActive} onSelectField={selectField} onSelectMemory={selectMemory} />
      </section>

      {matchResult && <MatchResultSpotlight result={matchResult} onRestart={openStarterDeckSetup} />}

      <section className="stitch-player-status">
        <div className="stitch-status-left">
          <h2>{human.name}</h2>
          <LifePips life={human.life} tone="magenta" impact={lifeImpact?.targetIndex === 0 ? lifeImpact : null} />
        </div>
      </section>

      <section className="stitch-hand-zone" aria-label="手札と山札">
        <div className="stitch-hand" aria-label="手札" data-owner={0} data-zone="hand-source" data-index={0}>
          {human.hand.map((card, index) => {
            const pendingCardTarget = pendingTargetCardState(game, 0, "hand", index);
            const tutorialCanSelectHand = Boolean(
              tutorialActive
                && tutorialStep
                && tutorialAllowsAction(tutorialStep, "select-hand", game, { handIndex: index }),
            );
            const handSelectable = !tutorialActive || tutorialCanSelectHand;
            const baseActionState = pendingCardTarget === "target" || pendingCardTarget === "selected" ? "usable" : handActionState(game, human, ai, card);
            const sourceIndex = baseActionState === "upgradeable" ? bestUpgradeSource(human, card) : null;
            return (
              <CardView
                key={`${card.id}-${index}`}
                card={card}
                ownerIndex={0}
                zone="hand"
                index={index}
                selected={pendingCardTarget === "selected" || (game.selected?.zone === "hand" && game.selected.index === index)}
                selectable={handSelectable}
                actionState={tutorialActive && !handSelectable ? "idle" : baseActionState}
                upgradeSource={sourceIndex === null ? null : human.field[sourceIndex]}
                game={game}
                visualEffect={tutorialFocusMatchesCard(tutorialStep?.focus, 0, "hand", card, index) ? "tutorial-focus" : ""}
                showCost={false}
                showSetBadge={false}
                onClick={handSelectable ? () => selectHand(index) : undefined}
                onMouseEnter={() => playSfx("hover")}
              />
            );
          })}
        </div>
        <DeckPileCard player={human} ownerIndex={0} />
        <TrashPileButton player={human} ownerIndex={0} trashSurge={ownerHasTrashSurge(0)} onOpen={openDiscardViewer} />
      </section>

      <aside className="dock-detail-rail" aria-live="polite">
        <div className="dock-preview">
          <CardArtPreview card={selectedCard} />
        </div>
        <SelectedCardDetail card={selectedCard} zone={game.selected?.zone ?? null} game={game} />
      </aside>

      <section className="stitch-command-dock" aria-live="polite">
        <div className="dock-actions">
          {matchResult && (
            <div className={`match-result-panel ${matchResult.tone}`} aria-live="polite">
              <div>
                <span>{matchResult.kicker}</span>
                <strong>{matchResult.title}</strong>
                <em>{matchResult.detail}</em>
              </div>
              <button type="button" onClick={openStarterDeckSetup}>再戦</button>
            </div>
          )}
          <div className="dock-status-row">
            <div className="action-meter" aria-label={`${actionMeterLabel} ${humanActionsRemaining}${humanAttackLockedByCharge ? "、チャージ済みで攻撃不可" : ""}`}>
              <span className="meter-label">{actionMeterLabel}</span>
              <span className="meter-value">{humanActionsRemaining}</span>
              <span className="action-tokens" aria-hidden="true">
                {Array.from({ length: CONFIG.actionsPerTurn + 1 }).map((_, index) => (
                  <span key={index} className={actionTokenClass(index, humanActionsRemaining)} />
                ))}
              </span>
              {humanAttackLockedByCharge && <span className="charge-lock-badge">チャージ済み・攻撃不可</span>}
            </div>
            <div className="action-hint">{actionHintText(game, selectedCard, game.selected?.zone ?? null)}</div>
            <div className="event-mode-toggle" role="group" aria-label="演出モーダルの閉じ方">
              <span>演出</span>
              <button
                type="button"
                className={!autoDismissDuelEvents ? "active" : ""}
                aria-pressed={!autoDismissDuelEvents}
                onClick={() => updateAutoDismissDuelEvents(false)}
              >
                手動確認
              </button>
              <button
                type="button"
                className={autoDismissDuelEvents ? "active" : ""}
                aria-pressed={autoDismissDuelEvents}
                onClick={() => updateAutoDismissDuelEvents(true)}
              >
                自動送り
              </button>
            </div>
          </div>
          <div className="action-strip">
            <button type="button" className={`${!playDisabled && !playTutorialBlocked ? "action-ready" : ""} ${tutorialFocusMatchesAction(tutorialStep?.focus, "play") ? "tutorial-focus" : ""}`} disabled={playDisabled || playTutorialBlocked} onClick={playSelected}><span>⇧</span>{playButtonLabel}</button>
            <button type="button" className={`${!upgradeDisabled && !upgradeTutorialBlocked ? "action-ready" : ""} ${tutorialFocusMatchesAction(tutorialStep?.focus, "upgrade") ? "tutorial-focus" : ""}`} disabled={upgradeDisabled || upgradeTutorialBlocked} onClick={upgradeSelectedAi}><span>↑</span>アップグレード</button>
            <button type="button" className={`${!attackDisabled && !attackTutorialBlocked ? "action-ready" : ""} ${tutorialFocusMatchesAction(tutorialStep?.focus, "attack") ? "tutorial-focus" : ""}`} disabled={attackDisabled || attackTutorialBlocked} onClick={attackWithSelectedAi}><span>⚔</span>攻撃</button>
            <button type="button" className={`${!chargeDisabled && !chargeTutorialBlocked ? "action-ready charge-action" : "charge-action"} ${tutorialFocusMatchesAction(tutorialStep?.focus, "charge") ? "tutorial-focus" : ""}`} disabled={chargeDisabled || chargeTutorialBlocked} onClick={chargeSelectedCard}><span>◆</span>チャージ</button>
            <button type="button" className={`${endTurnEnabled && !endTurnTutorialBlocked ? "action-ready end-turn" : "end-turn"} ${tutorialFocusMatchesAction(tutorialStep?.focus, "end") ? "tutorial-focus" : ""}`} disabled={!endTurnEnabled || endTurnTutorialBlocked} onClick={endTurn}><span>●</span>ターン終了</button>
          </div>
        </div>

      </section>

      <aside className={`stitch-log-sidebar ${tutorialStep ? "tutorial-mode" : ""}`} aria-label={tutorialStep ? "チュートリアル" : "対戦ログ"}>
        <div className="stitch-log-title">{tutorialStep ? "チュートリアル" : "対戦ログ"}</div>
        {tutorialStep && (
          <TutorialGuidePanel
            step={tutorialStep}
            onExit={() => {
              setTutorialActive(false);
              setTutorialAiAdvanceKey(null);
              setTutorialAiAdvancePending(false);
              setAutoDismissDuelEvents(loadAutoDismissPreference());
              showToast("チュートリアル中断", "通常の対戦として続行できます");
            }}
            onComplete={finishTutorial}
            rivalAdvancing={tutorialAiAdvancePending}
            onAdvanceRival={() => {
              setTutorialAiAdvancePending(true);
              setTutorialAiAdvanceKey(tutorialAiTurnKey(game, tutorialStep));
            }}
          />
        )}
        <LogList entries={game.log} />
      </aside>

      {!showDefenseInDuelEvent && defensePanel}
      <EventToast toast={toast} />
      {cardFlights.map((flight) => <CardFlightLayer key={flight.id} flight={flight} />)}
      {lifeImpact && <DamageImpactLayer impact={lifeImpact} />}
      {breakDrawPulse && <BreakDrawLayer pulse={breakDrawPulse} />}
      {trashSurge && <TrashSurgeLayer surge={trashSurge} eventId={duelEvent?.id ?? trashFlash?.id ?? 0} />}
      <DuelActionReel event={duelEvent} autoDismiss={autoDismissDuelEvents} onClose={dismissDuelEvent}>
        {showDefenseInDuelEvent ? defensePanel : null}
      </DuelActionReel>
      <GameBanner banner={matchResult || cardFlights.length > 0 ? null : banner} turn={game.turn} />
      {showNoActionsEndTurnPrompt && <NoActionsEndTurnPrompt onConfirm={endTurn} />}
      {rulesOpen && <RulesModal onClose={() => setRulesOpen(false)} />}
      {game.discardViewerOwner !== null && (
        <DiscardModal game={game} onClose={closeDiscardViewer} onSelect={selectDiscardCard} />
      )}
    </main>
  );
}

function NoActionsEndTurnPrompt({ onConfirm }: { onConfirm: () => void }) {
  return (
    <section
      className="duel-overlay turn-banner no-actions-end-turn-prompt human"
      role="dialog"
      aria-modal="true"
      aria-labelledby="no-actions-end-turn-title"
    >
      <div>
        <div className="turn-banner-kicker">ACTION 0</div>
        <div className="turn-banner-title" id="no-actions-end-turn-title">何も出来ないのでターン終了</div>
        <div className="turn-banner-detail">ターンを終了しますか？</div>
        <button type="button" autoFocus onClick={onConfirm}>はい</button>
      </div>
    </section>
  );
}

function TutorialGuidePanel({
  step,
  onExit,
  onComplete,
  rivalAdvancing,
  onAdvanceRival,
}: {
  step: TutorialStep;
  onExit: () => void;
  onComplete: () => void;
  rivalAdvancing: boolean;
  onAdvanceRival: () => void;
}) {
  const complete = step.id === "complete";
  const rivalTurn = step.id === "watch-rival";
  return (
    <section className={`tutorial-guide-panel step-${step.id}`} aria-live="polite" aria-label="チュートリアル">
      <div>
        <span>{step.kicker}</span>
        <strong>{step.title}</strong>
        <p>{step.detail}</p>
      </div>
      <div className="tutorial-guide-actions">
        {complete ? (
          <button type="button" className="primary-action" onClick={onComplete}>
            チュートリアルを完了
          </button>
        ) : (
          <>
            {rivalTurn && (
              <button type="button" className="primary-action tutorial-advance-action" disabled={rivalAdvancing} onClick={onAdvanceRival}>
                {rivalAdvancing ? "ライバル行動中..." : "ライバルの行動を進める"}
              </button>
            )}
            <button type="button" className="tutorial-exit-action" onClick={onExit}>
              チュートリアルを中断
            </button>
          </>
        )}
      </div>
    </section>
  );
}

function StarterDeckSetupPanel({
  playerSelection,
  opponentSelection,
  opponentAiProfile,
  savedDecks,
  onClose,
  onStartTutorial,
  onChangePlayerSelection,
  onChangeOpponentSelection,
  onChangeOpponentAiProfile,
  onStart,
}: {
  playerSelection: DeckSelection;
  opponentSelection: DeckSelection;
  opponentAiProfile: AiProfile;
  savedDecks: SavedDeck[];
  onClose: () => void;
  onStartTutorial: () => void;
  onChangePlayerSelection: (selection: DeckSelection) => void;
  onChangeOpponentSelection: (selection: DeckSelection) => void;
  onChangeOpponentAiProfile: (profile: AiProfile) => void;
  onStart: () => void;
}) {
  const playerDeckLabel = deckSelectionLabel(playerSelection, savedDecks);
  const opponentDeckLabel = deckSelectionLabel(opponentSelection, savedDecks);
  const opponentAiLabel = opponentAiProfile === "beginner" ? "初心者" : "挑戦者";

  return (
    <section className="starter-deck-modal starter-setup-panel" aria-labelledby="starter-deck-title">
      <div className="modal-head">
        <div>
          <span className="modal-kicker">DUEL SETUP</span>
          <h2 id="starter-deck-title">対戦準備</h2>
          <p>自分のデッキ、相手のデッキ、相手CPUを決めてから対戦を開始します。カード一覧や音声設定は上部メニューからそのまま操作できます。</p>
        </div>
        <button type="button" onClick={onClose}>閉じる</button>
      </div>
      <div className="starter-setup-summary" aria-label="現在の対戦設定">
        <div>
          <span>あなた</span>
          <strong>{playerDeckLabel}</strong>
        </div>
        <div>
          <span>相手</span>
          <strong>{opponentDeckLabel}</strong>
        </div>
        <div>
          <span>CPU</span>
          <strong>{opponentAiLabel}</strong>
        </div>
      </div>
      <div className="starter-duel-selectors">
        <DeckSelectionPicker
          title="自分のデッキ"
          step="1"
          selection={playerSelection}
          savedDecks={savedDecks}
          onChange={onChangePlayerSelection}
        />
        <DeckSelectionPicker
          title="相手のデッキ"
          step="2"
          selection={opponentSelection}
          savedDecks={savedDecks}
          onChange={onChangeOpponentSelection}
        />
      </div>
      <section className="starter-ai-profile" aria-label="相手CPU">
        <div className="starter-picker-title">
          <span>3</span>
          <h3>相手CPU</h3>
        </div>
        <div className="segmented-control">
          <button
            type="button"
            className={opponentAiProfile === "beginner" ? "active" : ""}
            aria-pressed={opponentAiProfile === "beginner"}
            onClick={() => onChangeOpponentAiProfile("beginner")}
          >
            初心者
          </button>
          <button
            type="button"
            className={opponentAiProfile === "challenger" ? "active" : ""}
            aria-pressed={opponentAiProfile === "challenger"}
            onClick={() => onChangeOpponentAiProfile("challenger")}
          >
            挑戦者
          </button>
        </div>
      </section>
      <div className="starter-modal-actions">
        <button type="button" onClick={onStartTutorial}>まずはチュートリアル</button>
        <button type="button" className="primary-action" onClick={onStart}>この設定で対戦開始</button>
      </div>
    </section>
  );
}

function DeckSelectionPicker({
  title,
  step,
  selection,
  savedDecks,
  onChange,
}: {
  title: string;
  step: string;
  selection: DeckSelection;
  savedDecks: SavedDeck[];
  onChange: (selection: DeckSelection) => void;
}) {
  return (
    <section className="starter-deck-picker" aria-label={title}>
      <div className="starter-picker-title">
        <span>{step}</span>
        <h3>{title}</h3>
      </div>
      <div className="starter-deck-grid compact">
        <button
          type="button"
          className={isDeckSelectionEqual(selection, { kind: "random" }) ? "selected" : ""}
          onClick={() => onChange({ kind: "random" })}
        >
          <span>ランダム</span>
          <em>固定デッキと保存済みデッキから選択</em>
        </button>
      </div>
      {savedDecks.length > 0 && (
        <div className="starter-deck-group">
          <h4>保存済み</h4>
          <div className="starter-deck-grid compact">
            {savedDecks.map((deck) => {
              const validation = validateDeck(deck.cardIds);
              const savedSelection: DeckSelection = { kind: "saved", deckId: deck.id };
              return (
                <button
                  type="button"
                  key={deck.id}
                  className={isDeckSelectionEqual(selection, savedSelection) ? "selected" : ""}
                  disabled={!validation.valid}
                  title={validation.valid ? deck.name : validation.messages.join(" / ")}
                  onClick={() => onChange(savedSelection)}
                >
                  <span>{deck.name}</span>
                  <em>{deck.cardIds.length}枚{validation.valid ? "" : ` / ${validation.messages[0] ?? "使用不可"}`}</em>
                </button>
              );
            })}
          </div>
        </div>
      )}
      <div className="starter-deck-group">
        <h4>固定デッキ</h4>
        <div className="starter-deck-grid compact">
          {BATTLE_DECK_IDS.map((deckId) => {
            const deck = DECKS[deckId];
            const presetSelection: DeckSelection = { kind: "preset", deckId };
            return (
              <button
                type="button"
                key={deckId}
                className={isDeckSelectionEqual(selection, presetSelection) ? "selected" : ""}
                onClick={() => onChange(presetSelection)}
              >
                <span>{deck.name}</span>
                <em>{deck.description}</em>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function deckSelectionLabel(selection: DeckSelection, savedDecks: SavedDeck[]): string {
  if (selection.kind === "random") return "ランダム";
  if (selection.kind === "preset") return DECKS[selection.deckId].name;
  return savedDecks.find((deck) => deck.id === selection.deckId)?.name ?? "保存済みデッキ";
}

function isDeckSelectionEqual(left: DeckSelection, right: DeckSelection): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === "preset" && right.kind === "preset") return left.deckId === right.deckId;
  if (left.kind === "saved" && right.kind === "saved") return left.deckId === right.deckId;
  return left.kind === "random";
}

function WorkspaceHeader({
  page,
  onChangePage,
  coins,
  seed,
  onStartNewGame,
  onStartTutorial,
  onOpenRules,
  audioEnabled,
  onToggleAudio,
}: {
  page: AppPage;
  onChangePage: (page: AppPage) => void;
  coins: number;
  seed: number;
  onStartNewGame: () => void;
  onStartTutorial: () => void;
  onOpenRules: () => void;
  audioEnabled: boolean;
  onToggleAudio: () => void;
}) {
  return (
    <header className="workspace-header">
      <button type="button" className="workspace-brand" onClick={() => onChangePage("duel")} aria-label="対戦画面へ戻る">
        <img src={brandMark} alt="" />
        <div>
          <h1>BREAK DUEL</h1>
          <p>{page === "duel" ? "対戦準備とカード管理" : "カード管理とデッキ制作"}</p>
        </div>
      </button>
      <PageTabs page={page} onChange={onChangePage} />
      <div className="workspace-tools">
        <CoinChip coins={coins} />
        <label className="duel-seed">
          <span>Seed</span>
          <input type="number" value={seed} readOnly aria-label="現在のSeed" />
        </label>
        <button type="button" onClick={onStartNewGame}>{page === "duel" ? "対戦準備" : "再戦"}</button>
        <button type="button" onClick={onStartTutorial}>チュートリアル</button>
        <button type="button" onClick={onOpenRules}>ルール</button>
        <button type="button" className={audioEnabled ? "audio-on" : ""} onClick={onToggleAudio}>{audioEnabled ? "音ON" : "音OFF"}</button>
      </div>
    </header>
  );
}

function MatchResultSpotlight({
  result,
  onRestart,
}: {
  result: MatchResultView;
  onRestart: () => void;
}) {
  return (
    <section className={`match-result-spotlight ${result.tone}`} aria-live="assertive">
      <div className="match-result-aura" aria-hidden="true">
        {Array.from({ length: 10 }).map((_, index) => <span key={index} />)}
      </div>
      <div className="match-result-plate">
        <span className="match-result-kicker">{result.kicker}</span>
        <strong>{result.title}</strong>
        <em>{result.lead}</em>
        <p>{result.detail}</p>
        {result.reason && <small>{result.reason}</small>}
        <button type="button" onClick={onRestart}>再戦</button>
      </div>
    </section>
  );
}

function CoinChip({ coins }: { coins: number }) {
  return (
    <span className="coin-chip" title="所持コイン" aria-label={`所持コイン ${coins}`}>
      <i aria-hidden="true" />
      {coins}
    </span>
  );
}

function PageTabs({ page, onChange }: { page: AppPage; onChange: (page: AppPage) => void }) {
  return (
    <nav className="page-tabs" aria-label="ページ切替">
      <button type="button" className={page === "duel" ? "active" : ""} onClick={() => onChange("duel")}>対戦</button>
      <button type="button" className={page === "cards" ? "active" : ""} onClick={() => onChange("cards")}>カード一覧</button>
      <button type="button" className={page === "builder" ? "active" : ""} onClick={() => onChange("builder")}>デッキ制作</button>
      <button type="button" className={page === "packs" ? "active" : ""} onClick={() => onChange("packs")}>パック開封</button>
    </nav>
  );
}

function LifePips({ life, tone, impact }: { life: number; tone: "cyan" | "magenta"; impact?: LifeImpact | null }) {
  return (
    <div className={`stitch-life ${tone} ${impact ? `life-hit impact-${impact.id}` : ""}`}>
      {Array.from({ length: CONFIG.life }).map((_, index) => (
        <span key={index} className={index >= life ? "empty" : ""} />
      ))}
      <em>ライフ {life}</em>
    </div>
  );
}

function DeckPileCard({
  player,
  ownerIndex,
  compact = false,
}: {
  player: PlayerState;
  ownerIndex: number;
  compact?: boolean;
}) {
  return (
    <div
      className={`deck-pile-card ${player.deck.length === 0 ? "empty" : ""} ${compact ? "compact" : ""}`}
      data-owner={ownerIndex}
      data-zone="deck"
      data-index={0}
      aria-label={`${player.name}の山札 ${player.deck.length}枚`}
      title={`${player.name}の山札 ${player.deck.length}枚`}
    >
      <span className="deck-pile-shadow" aria-hidden="true" />
      <span className="deck-pile-face" aria-hidden="true">
        <img src={cardBackImage} alt="" draggable={false} />
      </span>
      <span className="zone-card-label">山札</span>
      <span className="zone-card-count">{player.deck.length}</span>
    </div>
  );
}

function TrashPileButton({
  player,
  ownerIndex,
  trashSurge,
  onOpen,
  compact = false,
}: {
  player: PlayerState;
  ownerIndex: number;
  trashSurge: boolean;
  onOpen: (ownerIndex: number) => void;
  compact?: boolean;
}) {
  const topCard = player.discard[player.discard.length - 1] ?? null;
  const style = topCard ? { "--card-color": cardColor(topCard) } as CSSProperties : undefined;
  return (
    <button
      type="button"
      className={`trash-pile-button ${topCard ? "has-card" : "empty"} ${trashSurge ? "trash-surge" : ""} ${compact ? "compact" : ""}`}
      style={style}
      data-owner={ownerIndex}
      data-zone="discard"
      data-index={Math.max(0, player.discard.length - 1)}
      aria-label={`${player.name}のトラッシュ ${player.discard.length}枚${topCard ? `、最後は${topCard.name}` : ""}`}
      title={topCard ? `${topCard.name} / ${cardTypeLabel(topCard)}` : `${player.name}のトラッシュは空です`}
      onClick={() => onOpen(ownerIndex)}
    >
      <span className="trash-pile-stack" aria-hidden="true">
        <span />
        <span />
      </span>
      <span className="trash-pile-face">
        {topCard ? (
          <span className="trash-pile-front-card" aria-hidden="true">
            <CardView
              card={topCard}
              ownerIndex={ownerIndex}
              zone="discard"
              index={Math.max(0, player.discard.length - 1)}
              showCost={false}
              showSetBadge={false}
            />
          </span>
        ) : (
          <>
            <span className="trash-pile-kicker">TRASH</span>
            <strong>EMPTY</strong>
          </>
        )}
      </span>
      <span className="trash-pile-count">{player.discard.length}</span>
    </button>
  );
}

function combatPreviewForSelection(game: GameState): CombatPreview | null {
  const selected = game.selected;
  if (!selected || selected.zone !== "field" || (selected.ownerIndex ?? 0) !== 0) return null;
  const attacker = game.players[0].field[selected.index];
  const human = game.players[0];
  const defender = game.players[1];
  if (!attacker || attacker.type !== "ai") return null;
  if (!canHumanAct(game) || !canActivePlayerAttack(game) || human.spentFieldIndexes.has(selected.index)) return null;

  const attackContext: AttackContext = { attacker: human, attackerFieldIndex: selected.index };
  const attackValue = attackCombatValue(attacker, attackContext);
  const fieldDefenses = new Map<number, { result: "fail" | "trade" | "hold"; label: string }>();
  legalFieldDefenders(defender, attacker, attackContext).forEach(({ card, index }) => {
    const defenseOptions = { fieldDefense: true, fieldIndex: index, attackContext };
    const baseDefenseValue = defenseCombatValue(attacker, card, defender, defenseOptions);
    const paidDefenseValue = canUseFirewall(defender, card, attacker)
      ? defenseCombatValue(attacker, card, defender, { ...defenseOptions, firewallPaid: true })
      : baseDefenseValue;
    const usesFirewall = baseDefenseValue < attackValue && paidDefenseValue >= attackValue;
    const defenseValue = usesFirewall ? paidDefenseValue : baseDefenseValue;
    const defenseLabel = usesFirewall ? `竜盾 ${defenseValue}` : `DEF ${defenseValue}`;
    fieldDefenses.set(index, defenseValue < attackValue ? {
      result: "fail",
      label: `${defenseLabel} / 失敗`,
    } : {
      result: defenseValue > attackValue ? "hold" : "trade",
      label: defenseValue > attackValue ? `${defenseLabel} / 残る` : `${defenseLabel} / 相打ち`,
    });
  });

  return {
    attackerIndex: selected.index,
    attackValue,
    fieldDefenses,
    handDefenseCount: legalHandDefenders(defender, attacker, attackContext).length,
    direct: fieldDefenses.size === 0,
  };
}

function FieldGrid({
  player,
  ownerIndex,
  game,
  isOpponent = false,
  trashSurge = false,
  combatPreview = null,
  tutorialStep,
  tutorialFocus,
  tutorialLocked = false,
  onSelectField,
  onSelectMemory,
}: {
  player: PlayerState;
  ownerIndex: number;
  game: GameState;
  isOpponent?: boolean;
  trashSurge?: boolean;
  combatPreview?: CombatPreview | null;
  tutorialStep?: TutorialStep | null;
  tutorialFocus?: TutorialFocus;
  tutorialLocked?: boolean;
  onSelectField: (ownerIndex: number, index: number) => void;
  onSelectMemory: (ownerIndex: number) => void;
}) {
  return (
    <div className={`field-grid ${isOpponent ? "opponent" : "human"} ${trashSurge ? "trash-surge" : ""}`}>
      <MemorySlot player={player} ownerIndex={ownerIndex} isOpponent={isOpponent} game={game} trashSurge={trashSurge} tutorialLocked={tutorialLocked} onSelectMemory={onSelectMemory} />
      {Array.from({ length: CONFIG.fieldLimit }).map((_, index) => {
        const card = player.field[index];
        if (!card) return <div className={`field-slot empty ${trashSurge ? "trash-alert" : ""}`} key={`empty-${ownerIndex}-${index}`} data-owner={ownerIndex} data-zone="field" data-index={index}>+</div>;
        const isDisruptTarget = game.pendingTarget?.kind === "disrupt"
          && ownerIndex === 1 - game.active
          && !player.spentFieldIndexes.has(index);
        const isPurgeTarget = game.pendingTarget?.kind === "purge"
          && ownerIndex === 1 - game.active
          && player.spentFieldIndexes.has(index);
        const strikePending = game.pendingTarget?.kind === "strike" ? game.pendingTarget : null;
        const strikePlayer = strikePending ? game.players[game.active] : null;
        const strikeAttacker = strikePending && strikePlayer ? strikePlayer.field[strikePending.sourceIndex] : null;
        const isStrikeTarget = Boolean(
          strikePending
            && ownerIndex === 1 - game.active
            && strikeAttacker
            && strikeTargets(strikeAttacker, player, { attacker: strikePlayer, attackerFieldIndex: strikePending.sourceIndex }).some((target) => target.index === index),
        );
        const pendingCardTarget = pendingTargetCardState(game, ownerIndex, "field", index);
        const isSelected = game.selected?.zone === "field"
          && (game.selected.ownerIndex ?? 0) === ownerIndex
          && game.selected.index === index;
        const defensePreview = ownerIndex === 1 ? combatPreview?.fieldDefenses.get(index) : null;
        const isAttackerPreview = ownerIndex === 0 && combatPreview?.attackerIndex === index;
        const tutorialCanSelectField = Boolean(
          tutorialLocked
            && tutorialStep
            && tutorialAllowsAction(tutorialStep, "select-field", game, { fieldOwnerIndex: ownerIndex, fieldIndex: index }),
        );
        const fieldSelectable = !tutorialLocked || tutorialCanSelectField;
        const baseActionState = pendingCardTarget === "target" || pendingCardTarget === "selected" ? "usable" : isDisruptTarget || isPurgeTarget || isStrikeTarget ? "usable" : ownerIndex === 0 ? fieldActionState(game, player, index) : "idle";
        return (
          <CardView
            key={`${card.id}-${index}`}
            card={card}
            ownerIndex={ownerIndex}
            zone="field"
            index={index}
            selected={pendingCardTarget === "selected" || isSelected}
            selectable={fieldSelectable}
            spent={player.spentFieldIndexes.has(index)}
            actionState={tutorialLocked && !fieldSelectable ? "idle" : baseActionState}
            visualEffect={`${trashSurge ? "trash-alert" : ""} ${defensePreview ? `combat-preview ${defensePreview.result}` : ""} ${isAttackerPreview ? "attack-preview-source" : ""} ${tutorialFocusMatchesCard(tutorialFocus, ownerIndex, "field", card, index) ? "tutorial-focus" : ""}`}
            extraBadges={defensePreview ? [defensePreview.label] : isAttackerPreview ? [`ATK ${combatPreview.attackValue}`] : []}
            game={game}
            showCost={false}
            showSetBadge={false}
            onClick={fieldSelectable ? () => onSelectField(ownerIndex, index) : undefined}
          />
        );
      })}
    </div>
  );
}

function MemorySlot({
  player,
  ownerIndex,
  isOpponent,
  game,
  trashSurge,
  tutorialLocked,
  onSelectMemory,
}: {
  player: PlayerState;
  ownerIndex: number;
  isOpponent: boolean;
  game: GameState;
  trashSurge: boolean;
  tutorialLocked: boolean;
  onSelectMemory: (ownerIndex: number) => void;
}) {
  if (player.memory) {
    const isSelected = game.selected?.zone === "memory" && (game.selected.ownerIndex ?? 0) === ownerIndex;
    return (
      <CardView
        card={player.memory}
        ownerIndex={ownerIndex}
        zone="memory"
        index={0}
        selected={isSelected}
        selectable={!tutorialLocked}
        actionState={ownerIndex === 0 && canUseAcceleratorMemory(game, player) ? "usable" : "idle"}
        visualEffect={trashSurge ? "trash-alert" : ""}
        showCost={false}
        showSetBadge={false}
        onClick={tutorialLocked ? undefined : () => onSelectMemory(ownerIndex)}
      />
    );
  }
  return <div className={`field-slot memory-empty ${trashSurge ? "trash-alert" : ""}`} data-owner={ownerIndex} data-zone="memory" data-index={0}>遺物</div>;
}

function LeaderPortrait({
  player,
  tone,
  image,
  reactionImages,
  label,
  reaction = null,
  speech = null,
}: {
  player: PlayerState;
  tone: "human" | "rival";
  image: string;
  reactionImages?: Partial<Record<LeaderReaction["mood"], string>>;
  label?: string;
  reaction?: LeaderReaction | null;
  speech?: RivalSpeech | null;
}) {
  const currentImage = reaction ? reactionImages?.[reaction.mood] ?? image : image;
  return (
    <figure className={`leader-portrait ${tone} ${reaction ? `reaction-${reaction.mood} reaction-${reaction.id}` : ""}`} aria-label={`${player.name}のリーダー`}>
      {speech && (
        <div className="leader-speech" key={speech.id} role="status" aria-live="polite" aria-atomic="true">
          <span>ニケ</span>
          <p>{speech.text}</p>
        </div>
      )}
      <div className="leader-portrait-art">
        <img src={currentImage} alt="" draggable={false} />
      </div>
      <figcaption className={`leader-portrait-caption${label ? "" : " solo"}`}>
        {label && <span>{label}</span>}
        <strong>{player.name}</strong>
      </figcaption>
    </figure>
  );
}

function DamageImpactLayer({ impact }: { impact: LifeImpact }) {
  const sourceClass = impact.sourceIndex === null ? "source-unknown" : `source-${impact.sourceIndex}`;
  const amountClass = `amount-${Math.min(impact.amount, 3)}`;
  const sparkCount = impact.amount >= 3 ? 22 : impact.amount === 2 ? 18 : 14;
  return (
    <div className={`damage-impact-layer target-${impact.targetIndex} ${sourceClass} ${amountClass}`} key={impact.id} aria-hidden="true">
      <div className="damage-impact-core">
        <span>-{impact.amount}</span>
      </div>
      {Array.from({ length: sparkCount }).map((_, index) => (
        <i key={`${impact.id}-${index}`} style={{ "--spark-index": index } as CSSProperties} />
      ))}
    </div>
  );
}

function BreakDrawLayer({ pulse }: { pulse: BreakDrawPulse }) {
  return (
    <div className={`break-draw-layer target-${pulse.targetIndex}`} key={pulse.id} aria-hidden="true">
      <div className="break-draw-label">
        <strong>ブレイクドロー</strong>
        <span>+{pulse.count} ドロー</span>
      </div>
      {Array.from({ length: Math.min(pulse.count, 3) }).map((_, index) => (
        <i key={`${pulse.id}-${index}`} style={{ "--break-card-index": index } as CSSProperties} />
      ))}
    </div>
  );
}

function CardFlightLayer({ flight }: { flight: CardFlight | null }) {
  if (!flight) return null;
  const toX = flight.to.left + (flight.to.width - flight.from.width) / 2;
  const toY = flight.to.top + (flight.to.height - flight.from.height) / 2;
  const scale = Math.min(1.08, Math.max(0.76, flight.to.width / flight.from.width));
  const style = {
    "--from-x": `${flight.from.left}px`,
    "--from-y": `${flight.from.top}px`,
    "--to-x": `${toX}px`,
    "--to-y": `${toY}px`,
    "--flight-w": `${flight.from.width}px`,
    "--flight-h": `${flight.from.height}px`,
    "--flight-scale": scale,
    "--flight-duration": `${flight.durationMs}ms`,
  } as CSSProperties;
  return (
    <div className={`card-flight ${flight.tone}`} style={style} aria-hidden="true">
      <div className="card-flight-label">{flight.label}</div>
      {flight.back ? (
        <div className="card-flight-back">
          <img src={cardBackImage} alt="" draggable={false} />
        </div>
      ) : (
        flight.card && <CardView card={flight.card} ownerIndex={flight.tone === "ai" ? 1 : 0} zone="hand" index={0} showCost={false} showSetBadge={false} />
      )}
    </div>
  );
}

function TrashSurgeLayer({ surge, eventId }: { surge: TrashSurge; eventId: number }) {
  return (
    <div className={`trash-surge-layer ${surge.tone}`} key={eventId} aria-hidden="true">
      {TRASH_SPARKS.map((spark, index) => (
        <span
          key={`${eventId}-${index}`}
          style={{
            "--spark-x": `${spark.x}vw`,
            "--spark-y": `${spark.y}vh`,
            "--spark-delay": `${spark.delay}ms`,
          } as CSSProperties}
        />
      ))}
    </div>
  );
}

function handActionState(game: GameState, player: PlayerState, opponent: PlayerState, card: Card): string {
  if (!canHumanAct(game)) return "idle";
  const canCharge = canUseCharge(game, player) && canChargeCard(card);
  if (card.type === "event") return commandUsable(game, card, player, opponent) ? "usable" : canCharge ? "chargeable" : "blocked";
  if (card.type === "memory") return "usable";
  if (card.type === "ai") {
    const sourceIndex = bestUpgradeSource(player, card);
    const source = sourceIndex === null ? null : player.field[sourceIndex];
    const canPlay = player.field.length < CONFIG.fieldLimit && playCost(card, game) <= game.actionsRemaining;
    const canUpgradeCard = source !== null && upgradeCost(card, source) <= game.actionsRemaining;
    if (canPlay || canUpgradeCard) return canUpgradeCard ? "upgradeable" : "usable";
  }
  return canCharge ? "chargeable" : "blocked";
}

function fieldActionState(game: GameState, player: PlayerState, index: number): string {
  if (!canHumanAct(game)) return "idle";
  if (game.selected?.zone === "hand") {
    const target = player.hand[game.selected.index];
    if (canUpgrade(player.field[index], target)) return "upgrade-source";
  }
  if (!player.spentFieldIndexes.has(index) && canActivePlayerAttack(game)) return "usable";
  return "blocked";
}

function pendingTargetCardState(game: GameState, ownerIndex: number, zone: "hand" | "field" | "discard", index: number): "idle" | "target" | "selected" {
  const pending = game.pendingTarget;
  if (!pending || pending.kind !== "card-select") return "idle";
  if (pending.playerIndex !== ownerIndex || pending.zone !== zone || pending.excludeIndexes.includes(index)) return "idle";
  return pending.selectedIndexes.includes(index) ? "selected" : "target";
}
