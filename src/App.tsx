import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  CONFIG,
  BATTLE_DECK_IDS,
  DECKS,
  type AiAction,
  type AiProfile,
  type DefenseChoice,
  type Card,
  type DeckId,
  type DuelDeckSource,
  type GameState,
  type PlayerState,
  addLog,
  activePlayer,
  attackCombatValue,
  bestUpgradeSource,
  canActivePlayerAttack,
  canChargeCard,
  canDefendWithOptionalFirewall,
  canHumanAct,
  canHumanEndTurn,
  canUseAcceleratorMemory,
  canUseCharge,
  canUpgrade,
  cloneGame,
  commandUsable,
  createGame,
  chooseAiAction,
  chooseAiDefense,
  defenseCombatValue,
  finishTurn,
  legalFieldDefenders,
  legalHandDefenders,
  makeRng,
  needsFirewallFuel,
  opponentPlayer,
  playCost,
  upgradeCost,
} from "./game";
import {
  afterAction,
  applyPlayEffects,
  beginAttackInDraft,
  chargeHandCardInDraft,
  confirmChargeGuardTargetInDraft,
  discardHandCards,
  performAiActionInDraft,
  resolveDefenseInDraft,
  useAcceleratorMemoryInDraft,
  useCommandAtInDraft,
} from "./game/actions";
import { selectedCardForDetail, selectedHandCardName } from "./game/selectors";
import {
  DefensePanel,
  LogList,
  SelectedCardDetail,
  actionHintText,
} from "./components/DuelPanel";
import { CardLibraryPage, DeckBuilderPage, loadSavedDecks, validateDeck, type SavedDeck } from "./components/DeckWorkshop";
import { CardArtPreview, CardView } from "./components/CardView";
import { cardColor, cardTypeLabel } from "./components/cardPresentation";
import { DiscardModal, RulesModal } from "./components/Modals";
import { DuelActionReel, EventToast, GameBanner, type Banner, type Toast } from "./components/Overlays";
import type { DuelEvent, DuelEventPayload } from "./duelEvents";
import battleBgm from "./assets/audio/battle_music_01-loop.ogg";
import sfxAttack from "./assets/audio/sfx-attack.ogg";
import sfxBlock from "./assets/audio/sfx-block.ogg";
import sfxCardPlay from "./assets/audio/sfx-card-play.ogg";
import sfxCommand from "./assets/audio/sfx-command.ogg";
import sfxDamage from "./assets/audio/sfx-damage.ogg";
import sfxSelect from "./assets/audio/sfx-select.ogg";
import sfxTrash from "./assets/audio/sfx-trash.ogg";
import sfxTurnEnd from "./assets/audio/sfx-turn-end.ogg";
import cardBackImage from "./assets/card-back.webp";
import brandMark from "./assets/mark.svg";

let eventId = 1;
const INITIAL_SEED = randomSeed();

type AppPage = "duel" | "cards" | "builder";

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
  play: { src: sfxCardPlay, volume: 0.5 },
  attack: { src: sfxAttack, volume: 0.62 },
  block: { src: sfxBlock, volume: 0.58 },
  damage: { src: sfxDamage, volume: 0.66 },
  command: { src: sfxCommand, volume: 0.48 },
  trash: { src: sfxTrash, volume: 0.52 },
  end: { src: sfxTurnEnd, volume: 0.46 },
  select: { src: sfxSelect, volume: 0.34 },
};

type CombatPreview = {
  attackerIndex: number;
  attackValue: number;
  fieldDefenses: Map<number, {
    result: "trade" | "hold";
    label: string;
  }>;
  handDefenseCount: number;
  direct: boolean;
};

function randomSeed(): number {
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    const values = new Uint32Array(1);
    crypto.getRandomValues(values);
    return values[0] || 1;
  }
  return Math.floor(Date.now() % 4294967295) || 1;
}

function pageFromPath(pathname: string): AppPage {
  if (pathname === PAGE_PATHS.cards) return "cards";
  if (pathname === PAGE_PATHS.builder) return "builder";
  return "duel";
}

function routeForPage(page: AppPage): string {
  return PAGE_PATHS[page];
}

function actionTokenClass(index: number, actionsRemaining: number): string {
  const active = index < actionsRemaining;
  return `action-token ${active ? "" : "spent"}`;
}

function trashSurgeForEvent(event: DuelEventPayload | DuelEvent | null): TrashSurge | null {
  if (!event || event.kind !== "trash") return null;
  const goesToTrash = event.toLabel?.includes("トラッシュ") || event.cards.some(({ state }) => state === "trash");
  if (!goesToTrash) return null;
  if (event.tone === "magenta") return { owners: [0], tone: "magenta" };
  if (event.tone === "cyan") return { owners: [1], tone: "cyan" };
  return { owners: [0, 1], tone: "danger" };
}

export default function App() {
  const [page, setPage] = useState<AppPage>(() => pageFromPath(window.location.pathname));
  const [seed, setSeed] = useState(INITIAL_SEED);
  const [playerDeckSelection, setPlayerDeckSelection] = useState<DeckSelection>({ kind: "preset", deckId: "fire" });
  const [opponentDeckSelection, setOpponentDeckSelection] = useState<DeckSelection>({ kind: "random" });
  const [opponentAiProfile, setOpponentAiProfile] = useState<AiProfile>("challenger");
  const [savedDecks, setSavedDecks] = useState<SavedDeck[]>(() => loadSavedDecks());
  const [game, setGame] = useState<GameState>(() => createGame(INITIAL_SEED, "fire", undefined, "challenger"));
  const [rulesOpen, setRulesOpen] = useState(false);
  const [starterDeckModalOpen, setStarterDeckModalOpen] = useState(true);
  const [starterDeckChosen, setStarterDeckChosen] = useState(false);
  const [toast, setToast] = useState<Toast>(null);
  const [duelEvent, setDuelEvent] = useState<DuelEvent | null>(null);
  const [cardFlights, setCardFlights] = useState<CardFlight[]>([]);
  const [trashFlash, setTrashFlash] = useState<TrashFlash | null>(null);
  const [aiAnimating, setAiAnimating] = useState(false);
  const [autoDismissDuelEvents, setAutoDismissDuelEvents] = useState(false);
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
  const sfxAudio = useRef<Record<string, HTMLAudioElement[]>>({});
  const duelEventQueue = useRef<DuelEventPayload[]>([]);
  const duelEventPlaying = useRef(false);
  const duelEventScheduler = useRef<number | null>(null);
  const duelEventTimer = useRef<number | null>(null);
  const cardFlightTimers = useRef<number[]>([]);
  const aiCommitTimer = useRef<number | null>(null);
  const trashFlashTimer = useRef<number | null>(null);
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

  const human = game.players[0];
  const ai = game.players[1];
  const active = activePlayer(game);
  const opponent = opponentPlayer(game);
  const selectedCard = selectedCardForDetail(game);

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

  function showBanner(next: Omit<NonNullable<Banner>, "id">) {
    setBanner({ ...next, id: eventId++ });
  }

  function refreshSavedDecks() {
    setSavedDecks(loadSavedDecks());
  }

  function queueDuelEvent(event: DuelEventPayload) {
    const hasTrashSurge = trashSurgeForEvent(event) !== null;
    if ((event.kind === "play" || event.kind === "memory" || event.kind === "upgrade" || event.kind === "command") && !hasTrashSurge) return;
    duelEventQueue.current.push(event);
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
    if (!autoDismissDuelEvents) return;
    duelEventTimer.current = window.setTimeout(() => {
      dismissDuelEvent();
    }, event.durationMs ?? duelEventDuration(event));
  }

  function dismissDuelEvent() {
    if (duelEventTimer.current !== null) window.clearTimeout(duelEventTimer.current);
    duelEventTimer.current = null;
    setDuelEvent(null);
    duelEventPlaying.current = false;
    playNextDuelEvent();
  }

  function duelEventDuration(event: DuelEventPayload) {
    if (event.kind === "battle") return 3200;
    if (event.kind === "damage") return 2900;
    if (event.kind === "play" || event.kind === "upgrade") return 2600;
    return 2400;
  }

  function resetDuelEvents() {
    if (duelEventScheduler.current !== null) window.clearTimeout(duelEventScheduler.current);
    if (duelEventTimer.current !== null) window.clearTimeout(duelEventTimer.current);
    duelEventScheduler.current = null;
    duelEventTimer.current = null;
    duelEventQueue.current = [];
    duelEventPlaying.current = false;
    setDuelEvent(null);
    cardFlightTimers.current.forEach((timer) => window.clearTimeout(timer));
    if (aiCommitTimer.current !== null) window.clearTimeout(aiCommitTimer.current);
    cardFlightTimers.current = [];
    aiCommitTimer.current = null;
    if (trashFlashTimer.current !== null) window.clearTimeout(trashFlashTimer.current);
    trashFlashTimer.current = null;
    setAiAnimating(false);
    setCardFlights([]);
    setTrashFlash(null);
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
    if (choice.type === "field") {
      const defenseCard = defender.field[choice.index];
      if (!defenseCard || !canDefendWithOptionalFirewall(attackCard, defenseCard, defender, choice.index)) return;
      if (defender.isHuman && needsFirewallFuel(defender, defenseCard, attackCard, choice.index) && choice.firewallDiscardIndex === undefined) return;
      launchTrashFlight(attackCard, { ownerIndex: attackerIndex, zone: "field", index: fieldIndex }, attackerIndex, "攻撃札退場", 760);
      const firewallPaid = typeof choice.firewallDiscardIndex === "number";
      const isTrade = defenseCombatValue(attackCard, defenseCard, defender, { firewallPaid, fieldIndex: choice.index }) === attackCombatValue(attackCard);
      if (isTrade) {
        launchTrashFlight(defenseCard, { ownerIndex: defenderIndex, zone: "field", index: choice.index }, defenderIndex, "相打ち", 760);
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
      launchCardFlight({
        card,
        from: { ownerIndex: 1, zone: "hand-source", index: 0 },
        to: { ownerIndex: 1, zone: "field", index: ai.field.length },
        label: "CPU 場へ",
        tone: "ai",
        durationMs: 1700,
      });
      return 1400;
    }
    if (action.type === "memory") {
      const card = ai.hand[action.index];
      if (!card) return 0;
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
      launchTrashFlight(source, { ownerIndex: 1, zone: "field", index: action.fieldIndex }, 1, "元カード破棄", 1500);
      launchCardFlight({
        card,
        from: { ownerIndex: 1, zone: "hand-source", index: 0 },
        to: { ownerIndex: 1, zone: "field", index: action.fieldIndex },
        label: "CPU 更新",
        tone: "ai",
        durationMs: 1700,
      });
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
      launchTrashFlight(card, { ownerIndex: 1, zone: "hand-source", index: 0 }, 1, "指令使用", 980);
      return 760;
    }
    if (action.type === "charge") {
      const card = ai.hand[action.index];
      if (!card) return 0;
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
      setSeed(nextSeed);
      resetDrawTracker(nextGame);
      setGame(nextGame);
      resetDuelEvents();
      setRulesOpen(false);
      setStarterDeckModalOpen(false);
      setStarterDeckChosen(true);
      showToast("対戦開始", `${nextGame.players[0].deckName} / 相手: ${nextGame.players[1].deckName}`);
      showBanner({
        kind: "start",
        title: "BREAK DUEL",
        detail: `Seed ${nextSeed} / あなた: ${nextGame.players[0].deckName} / 相手: ${nextGame.players[1].deckName}`,
      });
    } catch (error) {
      showToast("使用できません", error instanceof Error ? error.message : "デッキを読み込めませんでした");
    }
  }

  function openStarterDeckModal() {
    refreshSavedDecks();
    resetDuelEvents();
    setRulesOpen(false);
    changePage("duel");
    setStarterDeckModalOpen(true);
  }

  function changePage(nextPage: AppPage) {
    if (nextPage !== "duel") resetDuelEvents();
    setRulesOpen(false);
    setPage(nextPage);
    const nextPath = routeForPage(nextPage);
    if (window.location.pathname !== nextPath) {
      window.history.pushState(null, "", nextPath);
    }
    if (nextPage === "duel") {
      refreshSavedDecks();
      setStarterDeckModalOpen(true);
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
      setStarterDeckModalOpen(nextPage === "duel");
      setPage(nextPage);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

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
    }, duelEvent.durationMs ?? duelEventDuration(duelEvent));
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
    playSfx("trash");
    trashFlashTimer.current = window.setTimeout(() => {
      setTrashFlash(null);
      trashFlashTimer.current = null;
    }, 1100);
  }, [page, game.players[0].discard.length, game.players[1].discard.length]);

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
      playSfx("select");
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
    if (page !== "duel") return;
    if (game.winner !== null || game.draw) return;
    showBanner({
      kind: "turn",
      title: `${active.name}のターン`,
      detail: `TURN ${game.turn} / 残りアクション ${game.actionsRemaining}`,
      tone: active.isHuman ? "human" : "ai",
    });
  }, [page, game.turn, game.active]);

  useEffect(() => {
    if (page !== "duel") return;
    if (game.winner === null && !game.draw) return;
    const score = `あなた ${human.life} - ${ai.life} ライバル`;
    const winnerIndex = game.winner ?? 0;
    showBanner({
      kind: "result",
      title: game.draw ? "引き分け" : `${game.players[winnerIndex].name}の勝利`,
      detail: score,
      tone: game.draw ? "draw" : game.winner === 0 ? "win" : "lose",
    });
    playSfx("end");
  }, [page, game.winner, game.draw]);

  useEffect(() => {
    if (page !== "duel") return undefined;
    if (game.winner !== null || game.draw || game.pendingAttack || game.pendingTarget) return undefined;
    if (active.isHuman || (game.actionsRemaining <= 0 && !canUseCharge(game, active))) return undefined;
    if (aiAnimating) return undefined;
    if (duelEvent || duelEventPlaying.current || duelEventQueue.current.length > 0 || duelEventScheduler.current !== null) return undefined;
    const timer = window.setTimeout(() => {
      const action = chooseAiAction(game, active.aiProfile);
      const commitDelay = prepareAiActionAnimation(action);
      setAiAnimating(true);
      aiCommitTimer.current = window.setTimeout(() => {
        mutate((draft) => performAiActionInDraft(draft, action, { playSfx, showDuelEvent: queueDuelEvent }));
        setAiAnimating(false);
        aiCommitTimer.current = null;
      }, commitDelay);
    }, 720);
    return () => window.clearTimeout(timer);
  }, [page, game, duelEvent, aiAnimating]);

  useEffect(() => {
    return () => {
      stopBgm();
      if (duelEventScheduler.current !== null) window.clearTimeout(duelEventScheduler.current);
      if (duelEventTimer.current !== null) window.clearTimeout(duelEventTimer.current);
      cardFlightTimers.current.forEach((timer) => window.clearTimeout(timer));
      cardFlightTimers.current = [];
      if (aiCommitTimer.current !== null) window.clearTimeout(aiCommitTimer.current);
      if (trashFlashTimer.current !== null) window.clearTimeout(trashFlashTimer.current);
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
    const pool = sfxAudio.current[kind] ?? [];
    let audio = pool.find((item) => item.paused || item.ended);
    if (!audio) {
      audio = new Audio(config.src);
      audio.preload = "auto";
      audio.volume = config.volume;
      if (pool.length < 4) {
        pool.push(audio);
        sfxAudio.current[kind] = pool;
      }
    }
    audio.volume = config.volume;
    audio.currentTime = 0;
    void audio.play().catch(() => {
      audioEnabledRef.current = false;
      setAudioEnabled(false);
      showToast("効果音再生失敗", "ブラウザの音声許可を確認してください");
    });
  }

  function preloadSfx() {
    Object.entries(SFX_ASSETS).forEach(([kind, config]) => {
      if (sfxAudio.current[kind]?.length) return;
      const audio = new Audio(config.src);
      audio.preload = "auto";
      audio.volume = config.volume;
      sfxAudio.current[kind] = [audio];
    });
  }

  function stopBgm() {
    bgmAudio.current?.pause();
  }

  function startBgm() {
    if (!bgmAudio.current) {
      const audio = new Audio(battleBgm);
      audio.loop = true;
      audio.preload = "auto";
      audio.volume = 0.32;
      bgmAudio.current = audio;
    }
    bgmAudio.current.currentTime = 0;
    void bgmAudio.current.play().catch(() => {
      audioEnabledRef.current = false;
      setAudioEnabled(false);
      showToast("BGM再生失敗", "ブラウザの音声許可を確認してください");
    });
  }

  function toggleAudio() {
    const next = !audioEnabledRef.current;
    audioEnabledRef.current = next;
    setAudioEnabled(next);
    if (next) {
      void ensureAudioContext().resume();
      preloadSfx();
      startBgm();
    } else {
      stopBgm();
    }
  }

  function selectHand(index: number) {
    const pending = game.pendingTarget;
    if (pending?.kind === "card-select" && pending.playerIndex === 0 && pending.zone === "hand") {
      togglePendingCardIndex(index);
      return;
    }
    playSfx("select");
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
    playSfx("select");
    mutate((draft) => {
      draft.selected = { zone: "field", ownerIndex, index };
    });
  }

  function selectMemory(ownerIndex: number) {
    playSfx("select");
    mutate((draft) => {
      if (!draft.players[ownerIndex]?.memory) return;
      draft.selected = { zone: "memory", ownerIndex, index: 0 };
    });
  }

  function playSelected() {
    if (!canHumanAct(game)) return;
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
    if (!card || card.type !== "ai" || player.field.length >= CONFIG.fieldLimit || game.actionsRemaining < playCost(card)) return;
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
      if (!card || card.type !== "ai" || player.field.length >= CONFIG.fieldLimit || draft.actionsRemaining < playCost(card)) return;
      const cost = playCost(card);
      player.hand.splice(draft.selected.index, 1);
      player.field.push(card);
      const fieldIndex = player.field.length - 1;
      let text = `${player.name}は${card.name}を場に出した。`;
      text += applyPlayEffects(draft, player, card, fieldIndex, cost);
      addLog(draft, text);
      draft.selected = null;
      if (!draft.pendingTarget) afterAction(draft, cost);
    });
    showToast("場に出す", selectedHandCardName(game));
    playSfx("play");
  }

  function playSelectedMemory() {
    if (game.selected?.zone !== "hand") return;
    const player = activePlayer(game);
    const memoryCard = player.hand[game.selected.index];
    if (!memoryCard || memoryCard.type !== "memory") return;
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
    playSfx("command");
  }

  function upgradeSelectedAi() {
    if (!canHumanAct(game) || game.selected?.zone !== "hand") return;
    const player = activePlayer(game);
    const target = player.hand[game.selected.index];
    if (!target || target.type !== "ai" || upgradeCost(target) > game.actionsRemaining) return;
    const sourceIndexes = upgradeSourceIndexes(player, target);
    if (sourceIndexes.length === 0) return;
    if (sourceIndexes.length > 1) {
      const handIndex = game.selected.index;
      mutate((draft) => {
        const player = activePlayer(draft);
        const target = player.hand[handIndex];
        if (!target || target.type !== "ai") return;
        const sourceIndexes = upgradeSourceIndexes(player, target);
        if (sourceIndexes.length <= 1) return;
        draft.pendingTarget = {
          kind: "card-select",
          reason: "upgrade-source",
          zone: "field",
          playerIndex: draft.active,
          title: `${target.name}のアップグレード元を選択`,
          prompt: "トラッシュへ送って入れ替える元の召喚獣を選んでください。",
          confirmLabel: "このカードを元にする",
          min: 1,
          max: 1,
          excludeIndexes: player.field.map((_, index) => sourceIndexes.includes(index) ? -1 : index).filter((index) => index >= 0),
          selectedIndexes: [],
          sourceIndex: handIndex,
          actionCost: upgradeCost(target),
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
    if (!target || target.type !== "ai" || !source || !canUpgrade(source, target) || upgradeCost(target) > game.actionsRemaining) return;
    launchTrashFlight(source, { ownerIndex: 0, zone: "field", index: sourceIndex }, 0, "元カード破棄");
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
      if (!source || !canUpgrade(source, target) || draft.actionsRemaining < upgradeCost(target)) return;
      const cost = upgradeCost(target);
      const card = player.hand.splice(handIndex, 1)[0];
      player.discard.push(source);
      player.field[sourceIndex] = card;
      player.spentFieldIndexes.delete(sourceIndex);
      player.power3RecoveryDelayedFieldIndexes.delete(sourceIndex);
      player.chargeGuardedFieldIndexes.delete(sourceIndex);
      draft.pendingTarget = null;
      let text = `${player.name}は${source.name}を元に${card.name}へアップグレード。`;
      text += applyPlayEffects(draft, player, card, sourceIndex, cost, source);
      addLog(draft, text);
      draft.selected = null;
      if (!draft.pendingTarget) afterAction(draft, cost);
    });
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
    if (command.effect === "patch") {
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
          prompt: "消耗から回復させる自分の召喚獣を1体選んでください。",
          confirmLabel: "この召喚獣を回復",
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
    if (command.effect === "optimize") {
      mutate((draft) => {
        draft.pendingTarget = {
          kind: "hand-discard",
          reason: "optimize",
          playerIndex: draft.active,
          title: `${command.name}で捨てるカードを選択`,
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
    if (command.effect === "relearn") {
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
    useCommandAt(sourceIndex, null);
  }

  function useCommandAt(sourceIndex: number, targetIndex: number | null, discardIndexes: number[] = []) {
    const player = activePlayer(game);
    const command = player.hand[sourceIndex];
    if (command?.type === "event") {
      launchTrashFlight(
        command,
        { ownerIndex: game.active, zone: flightHandZone(player), index: player.isHuman ? sourceIndex : 0 },
        game.active,
        "指令使用",
      );
      if (command.effect === "trinity") {
        player.field.forEach((card, index) => {
          launchTrashFlight(card, { ownerIndex: game.active, zone: "field", index }, game.active, "場を一掃", 780);
        });
      }
    }
    mutate((draft) => useCommandAtInDraft(draft, sourceIndex, targetIndex, discardIndexes, { playSfx, showDuelEvent: queueDuelEvent }));
    showToast("指令", "カードを使用しました");
    playSfx("command");
  }

  function attackWithSelectedAi() {
    if (!canHumanAct(game) || game.selected?.zone !== "field") return;
    beginAttack(0, game.selected.index);
  }

  function beginAttack(attackerIndex: number, fieldIndex: number) {
    const attacker = game.players[attackerIndex];
    const defender = game.players[1 - attackerIndex];
    const attackCard = attacker.field[fieldIndex];
    if (attackCard && defender && !defender.isHuman) {
      launchDefenseTrashFlights(attackerIndex, fieldIndex, chooseAiDefense(defender, attackCard, defender.aiProfile));
    }
    mutate((draft) => beginAttackInDraft(draft, attackerIndex, fieldIndex, { playSfx, showDuelEvent: queueDuelEvent }));
    showToast("攻撃", "攻撃を宣言しました");
    playSfx("attack");
  }

  function resolveDefense(choice: DefenseChoice) {
    if (game.pendingAttack) {
      launchDefenseTrashFlights(game.pendingAttack.attackerIndex, game.pendingAttack.fieldIndex, choice);
    }
    mutate((draft) => resolveDefenseInDraft(draft, choice, { playSfx, showDuelEvent: queueDuelEvent }));
    if (game.pendingAttack && duelEvent) dismissDuelEvent();
  }

  function chargeSelectedCard() {
    if (game.selected?.zone !== "hand" || game.selected.ownerIndex !== 0 || !canUseCharge(game, human)) return;
    const player = activePlayer(game);
    const card = player.hand[game.selected.index];
    if (!card) return;
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
    playSfx("command");
  }

  function endTurn() {
    if (!canHumanEndTurn(game)) return;
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
    if (pending.reason === "relearn-recover") {
      useCommandAt(pending.sourceIndex!, selectedIndex, pending.discardIndexes ?? []);
      return;
    }
    if (pending.reason === "charge-guard") {
      const charged = pendingPlayer.hand[pending.sourceIndex!];
      if (charged) {
        launchTrashFlight(charged, { ownerIndex: pending.playerIndex, zone: flightHandZone(pendingPlayer), index: pendingPlayer.isHuman ? pending.sourceIndex! : 0 }, pending.playerIndex, "チャージ");
      }
    }
    if (pending.reason === "filter-discard" || pending.reason === "block-pressure") {
      const discarded = pendingPlayer.hand[selectedIndex];
      launchTrashFlight(
        discarded,
        { ownerIndex: pending.playerIndex, zone: flightHandZone(pendingPlayer), index: pendingPlayer.isHuman ? selectedIndex : 0 },
        pending.playerIndex,
        "捨て札",
      );
    } else if (pending.reason === "accelerator-sacrifice") {
      const sacrificed = pendingPlayer.field[selectedIndex];
      launchTrashFlight(sacrificed, { ownerIndex: pending.playerIndex, zone: "field", index: selectedIndex }, pending.playerIndex, "遺物の代償");
    }
    mutate((draft) => {
      const current = draft.pendingTarget;
      if (!current || current.kind !== "card-select") return;
      const player = draft.players[current.playerIndex];
      if (current.reason === "filter-discard" || current.reason === "block-pressure") {
        const discarded = discardHandCards(draft, current.playerIndex, current.selectedIndexes);
        if (discarded.length > 0) {
          const sourceName = current.reason === "block-pressure" ? "攻撃の圧" : "登場時効果";
          addLog(draft, `${player.name}は${sourceName}で${discarded.map((card) => card.name).join("、")}を捨てた。`);
          queueDuelEvent({
            kind: "trash",
            title: `${sourceName}の捨て札`,
            detail: `${discarded.map((card) => card.name).join("、")}を手札からトラッシュへ送りました。`,
            fromLabel: "手札",
            toLabel: "トラッシュ",
            tone: player.isHuman ? "magenta" : "cyan",
            cards: discarded.map((card) => ({ card, label: "捨て札", state: "trash" })),
          });
        }
      } else if (current.reason === "recover-on-play") {
        const recovered = player.discard.splice(selectedIndex, 1)[0];
        if (recovered) {
          player.hand.push(recovered);
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
          addLog(draft, `${player.name}は${card.name}を回復。`);
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
      }
      const actionCost = current.actionCost ?? 1;
      draft.pendingTarget = null;
      afterAction(draft, actionCost, current.actionKind ?? "normal");
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
            : active.field.length >= CONFIG.fieldLimit || playCost(selectedHandCard) > game.actionsRemaining
      )
  );
  const upgradeDisabled = !canHumanAct(game)
    || !selectedHand
    || selectedHandCard?.type !== "ai"
    || bestUpgradeSource(active, selectedHandCard) === null
    || upgradeCost(selectedHandCard) > game.actionsRemaining;
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
  const combatPreview = combatPreviewForSelection(game);
  const endTurnEnabled = canHumanEndTurn(game);
  const showNoActionsEndTurnPrompt = endTurnEnabled
    && game.actionsRemaining <= 0
    && !canUseCharge(game, human)
    && !rulesOpen
    && !starterDeckModalOpen
    && game.discardViewerOwner === null
    && !duelEvent
    && cardFlights.length === 0;
  const matchResult = game.draw
    ? {
        tone: "draw" as const,
        kicker: "DRAW",
        title: "引き分け",
        detail: `あなた ${human.life} - ${ai.life} ライバル`,
      }
    : game.winner !== null
      ? {
          tone: game.winner === 0 ? "win" as const : "lose" as const,
          kicker: game.winner === 0 ? "VICTORY" : "DEFEAT",
          title: `${game.players[game.winner].name}の勝利`,
          detail: `あなた ${human.life} - ${ai.life} ライバル`,
        }
      : null;
  const defensePanel = (
    <DefensePanel
      game={game}
      onResolve={resolveDefense}
      onUseCommand={useCommandAt}
      onCancelTarget={() => mutate((draft) => { draft.pendingTarget = null; })}
      onTogglePendingHand={togglePendingHandIndex}
      onTogglePendingCard={togglePendingCardIndex}
      onConfirmPending={confirmPendingTarget}
      onConfirmCardSelection={confirmCardSelectionTarget}
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

  if (page !== "duel") {
    return (
      <main className="workspace-shell">
        <WorkspaceHeader
          page={page}
          onChangePage={changePage}
          seed={seed}
          onStartNewGame={openStarterDeckModal}
          onOpenRules={() => setRulesOpen(true)}
          audioEnabled={audioEnabled}
          onToggleAudio={toggleAudio}
        />
        {page === "cards" ? <CardLibraryPage /> : <DeckBuilderPage />}
        <EventToast toast={toast} />
        {rulesOpen && <RulesModal onClose={() => setRulesOpen(false)} />}
      </main>
    );
  }

  return (
    <main className={`stitch-shell ${allowBoardTargetSelection ? "field-targeting" : ""}`}>
      <header className="stitch-opponent-bar">
        <div className="stitch-status-left">
          <div className="deck-badge">{ai.deckName}</div>
          <div>
            <h2>{ai.name}</h2>
            <LifePips life={ai.life} tone="cyan" />
          </div>
        </div>
        <div className="brand-mini">
          <img src={brandMark} alt="" />
          <span>BREAK DUEL</span>
        </div>
        <div className="duel-top-controls">
          <PageTabs page={page} onChange={changePage} />
          <label className="duel-seed">
            <span>Seed</span>
            <input type="number" value={seed} readOnly aria-label="現在のSeed" />
          </label>
          <button type="button" onClick={openStarterDeckModal}>再戦</button>
          <button type="button" onClick={() => setRulesOpen(true)}>ルール</button>
          <button type="button" className={audioEnabled ? "audio-on" : ""} onClick={toggleAudio}>{audioEnabled ? "音ON" : "音OFF"}</button>
        </div>
        <div className="stitch-counts">
          <div className="action-meter compact-action-meter" aria-label={`相手アクション ${opponentActionsRemaining}${opponentAttackLockedByCharge ? "、チャージ済みで攻撃不可" : ""}`}>
            <span className="meter-label">相手AP</span>
            <span className="meter-value">{opponentActionsRemaining}</span>
            <span className="action-tokens" aria-hidden="true">
              {Array.from({ length: 3 }).map((_, index) => (
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
        <FieldGrid player={ai} ownerIndex={1} game={game} isOpponent trashSurge={ownerHasTrashSurge(1)} combatPreview={combatPreview} onSelectField={selectField} onSelectMemory={selectMemory} />
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
        <FieldGrid player={human} ownerIndex={0} game={game} trashSurge={ownerHasTrashSurge(0)} onSelectField={selectField} onSelectMemory={selectMemory} />
      </section>

      <section className="stitch-player-status">
        <div className="stitch-status-left">
          <h2>{human.name}</h2>
          <div className="deck-badge magenta">{human.deckName}</div>
          <LifePips life={human.life} tone="magenta" />
        </div>
        <div className="stitch-player-stats" aria-label="自分のカード枚数">
          <span>手札 {human.hand.length}</span>
          <span>山札 {human.deck.length}</span>
          <span>捨札 {human.discard.length}</span>
          <span>遺物 {human.memory ? "1" : "0"}</span>
        </div>
      </section>

      <section className="stitch-hand-zone" aria-label="手札と山札">
        <DeckPileCard player={human} ownerIndex={0} />
        <div className="stitch-hand" aria-label="手札">
          {human.hand.map((card, index) => {
            const pendingCardTarget = pendingTargetCardState(game, 0, "hand", index);
            return (
              <CardView
                key={`${card.id}-${index}`}
                card={card}
                ownerIndex={0}
                zone="hand"
                index={index}
                selected={pendingCardTarget === "selected" || (game.selected?.zone === "hand" && game.selected.index === index)}
                selectable
                actionState={pendingCardTarget === "target" || pendingCardTarget === "selected" ? "usable" : handActionState(game, human, ai, card)}
                showCost
                onClick={() => selectHand(index)}
              />
            );
          })}
        </div>
        <TrashPileButton player={human} ownerIndex={0} trashSurge={ownerHasTrashSurge(0)} onOpen={openDiscardViewer} />
      </section>

      <section className="stitch-command-dock" aria-live="polite">
        <div className="dock-detail">
          <div className="dock-preview">
            <CardArtPreview card={selectedCard} />
          </div>
          <SelectedCardDetail card={selectedCard} zone={game.selected?.zone ?? null} game={game} />
        </div>

        <div className="dock-actions">
          {matchResult && (
            <div className={`match-result-panel ${matchResult.tone}`} aria-live="polite">
              <div>
                <span>{matchResult.kicker}</span>
                <strong>{matchResult.title}</strong>
                <em>{matchResult.detail}</em>
              </div>
              <button type="button" onClick={openStarterDeckModal}>再戦</button>
            </div>
          )}
          <div className="action-meter" aria-label={`残りアクション ${game.actionsRemaining}${humanAttackLockedByCharge ? "、チャージ済みで攻撃不可" : ""}`}>
            <span className="meter-label">残りアクション</span>
            <span className="meter-value">{game.actionsRemaining}</span>
            <span className="action-tokens" aria-hidden="true">
              {Array.from({ length: 3 }).map((_, index) => (
                <span key={index} className={actionTokenClass(index, game.actionsRemaining)} />
              ))}
            </span>
            {humanAttackLockedByCharge && <span className="charge-lock-badge">チャージ済み・攻撃不可</span>}
          </div>
          <div className="action-strip">
            <button type="button" className={!playDisabled ? "action-ready" : ""} disabled={playDisabled} onClick={playSelected}><span>⇧</span>{playButtonLabel}</button>
            <button type="button" className={!upgradeDisabled ? "action-ready" : ""} disabled={upgradeDisabled} onClick={upgradeSelectedAi}><span>↑</span>アップグレード</button>
            <button type="button" className={!attackDisabled ? "action-ready" : ""} disabled={attackDisabled} onClick={attackWithSelectedAi}><span>⚔</span>攻撃</button>
            <button type="button" className={!chargeDisabled ? "action-ready charge-action" : "charge-action"} disabled={chargeDisabled} onClick={chargeSelectedCard}><span>◆</span>チャージ</button>
            <button type="button" className={endTurnEnabled ? "action-ready end-turn" : "end-turn"} disabled={!endTurnEnabled} onClick={endTurn}><span>●</span>ターン終了</button>
          </div>
          <div className="dock-action-footer">
            <div className="action-hint">{actionHintText(game, selectedCard, game.selected?.zone ?? null)}</div>
            <div className="event-mode-toggle" role="group" aria-label="演出モーダルの閉じ方">
              <span>演出</span>
              <button
                type="button"
                className={!autoDismissDuelEvents ? "active" : ""}
                aria-pressed={!autoDismissDuelEvents}
                onClick={() => setAutoDismissDuelEvents(false)}
              >
                手動確認
              </button>
              <button
                type="button"
                className={autoDismissDuelEvents ? "active" : ""}
                aria-pressed={autoDismissDuelEvents}
                onClick={() => setAutoDismissDuelEvents(true)}
              >
                自動送り
              </button>
            </div>
          </div>
        </div>

      </section>

      <aside className="stitch-log-sidebar" aria-label="対戦ログ">
        <div className="stitch-log-title">対戦ログ</div>
        <LogList entries={game.log} />
      </aside>

      {!showDefenseInDuelEvent && defensePanel}
      <EventToast toast={toast} />
      {cardFlights.map((flight) => <CardFlightLayer key={flight.id} flight={flight} />)}
      {trashSurge && <TrashSurgeLayer surge={trashSurge} eventId={duelEvent?.id ?? trashFlash?.id ?? 0} />}
      <DuelActionReel event={duelEvent} autoDismiss={autoDismissDuelEvents} onClose={dismissDuelEvent}>
        {showDefenseInDuelEvent ? defensePanel : null}
      </DuelActionReel>
      <GameBanner banner={cardFlights.length > 0 ? null : banner} turn={game.turn} />
      {showNoActionsEndTurnPrompt && <NoActionsEndTurnPrompt onConfirm={endTurn} />}
      {rulesOpen && <RulesModal onClose={() => setRulesOpen(false)} />}
      {starterDeckModalOpen && (
        <StarterDeckModal
          playerSelection={playerDeckSelection}
          opponentSelection={opponentDeckSelection}
          opponentAiProfile={opponentAiProfile}
          savedDecks={savedDecks}
          canClose={starterDeckChosen}
          onClose={() => setStarterDeckModalOpen(false)}
          onChangePlayerSelection={setPlayerDeckSelection}
          onChangeOpponentSelection={setOpponentDeckSelection}
          onChangeOpponentAiProfile={setOpponentAiProfile}
          onStart={startSelectedDeckGame}
        />
      )}
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

function StarterDeckModal({
  playerSelection,
  opponentSelection,
  opponentAiProfile,
  savedDecks,
  canClose,
  onClose,
  onChangePlayerSelection,
  onChangeOpponentSelection,
  onChangeOpponentAiProfile,
  onStart,
}: {
  playerSelection: DeckSelection;
  opponentSelection: DeckSelection;
  opponentAiProfile: AiProfile;
  savedDecks: SavedDeck[];
  canClose: boolean;
  onClose: () => void;
  onChangePlayerSelection: (selection: DeckSelection) => void;
  onChangeOpponentSelection: (selection: DeckSelection) => void;
  onChangeOpponentAiProfile: (profile: AiProfile) => void;
  onStart: () => void;
}) {
  return (
    <div className="modal-backdrop starter-deck-backdrop" role="dialog" aria-modal="true" aria-labelledby="starter-deck-title" onClick={(event) => {
      if (canClose && event.currentTarget === event.target) onClose();
    }}>
      <section className="starter-deck-modal">
        <div className="modal-head">
          <div>
            <h2 id="starter-deck-title">対戦デッキを選択</h2>
            <p>自分と相手のデッキを選べます。ランダムは固定デッキと使用可能な保存済みデッキから選びます。</p>
          </div>
          {canClose && <button type="button" onClick={onClose}>閉じる</button>}
        </div>
        <div className="starter-duel-selectors">
          <DeckSelectionPicker
            title="自分のデッキ"
            selection={playerSelection}
            savedDecks={savedDecks}
            onChange={onChangePlayerSelection}
          />
          <DeckSelectionPicker
            title="相手のデッキ"
            selection={opponentSelection}
            savedDecks={savedDecks}
            onChange={onChangeOpponentSelection}
          />
        </div>
        <section className="starter-ai-profile" aria-label="相手CPU">
          <h3>相手CPU</h3>
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
          <button type="button" className="primary-action" onClick={onStart}>対戦開始</button>
        </div>
      </section>
    </div>
  );
}

function DeckSelectionPicker({
  title,
  selection,
  savedDecks,
  onChange,
}: {
  title: string;
  selection: DeckSelection;
  savedDecks: SavedDeck[];
  onChange: (selection: DeckSelection) => void;
}) {
  return (
    <section className="starter-deck-picker" aria-label={title}>
      <h3>{title}</h3>
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

function isDeckSelectionEqual(left: DeckSelection, right: DeckSelection): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === "preset" && right.kind === "preset") return left.deckId === right.deckId;
  if (left.kind === "saved" && right.kind === "saved") return left.deckId === right.deckId;
  return left.kind === "random";
}

function WorkspaceHeader({
  page,
  onChangePage,
  seed,
  onStartNewGame,
  onOpenRules,
  audioEnabled,
  onToggleAudio,
}: {
  page: AppPage;
  onChangePage: (page: AppPage) => void;
  seed: number;
  onStartNewGame: () => void;
  onOpenRules: () => void;
  audioEnabled: boolean;
  onToggleAudio: () => void;
}) {
  return (
    <header className="workspace-header">
      <div className="workspace-brand">
        <img src={brandMark} alt="" />
        <div>
          <h1>BREAK DUEL</h1>
          <p>カード管理とデッキ制作</p>
        </div>
      </div>
      <PageTabs page={page} onChange={onChangePage} />
      <div className="workspace-tools">
        <label className="duel-seed">
          <span>Seed</span>
          <input type="number" value={seed} readOnly aria-label="現在のSeed" />
        </label>
        <button type="button" onClick={onStartNewGame}>再戦</button>
        <button type="button" onClick={onOpenRules}>ルール</button>
        <button type="button" className={audioEnabled ? "audio-on" : ""} onClick={onToggleAudio}>{audioEnabled ? "音ON" : "音OFF"}</button>
      </div>
    </header>
  );
}

function PageTabs({ page, onChange }: { page: AppPage; onChange: (page: AppPage) => void }) {
  return (
    <nav className="page-tabs" aria-label="ページ切替">
      <button type="button" className={page === "duel" ? "active" : ""} onClick={() => onChange("duel")}>対戦</button>
      <button type="button" className={page === "cards" ? "active" : ""} onClick={() => onChange("cards")}>カード一覧</button>
      <button type="button" className={page === "builder" ? "active" : ""} onClick={() => onChange("builder")}>デッキ制作</button>
    </nav>
  );
}

function LifePips({ life, tone }: { life: number; tone: "cyan" | "magenta" }) {
  return (
    <div className={`stitch-life ${tone}`}>
      {Array.from({ length: CONFIG.life }).map((_, index) => (
        <span key={index} className={index >= life ? "empty" : ""} />
      ))}
      <em>life {life}</em>
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

  const attackValue = attackCombatValue(attacker);
  const fieldDefenses = new Map<number, { result: "trade" | "hold"; label: string }>();
  legalFieldDefenders(defender, attacker).forEach(({ card, index }) => {
    const defenseValue = defenseCombatValue(attacker, card, defender, { fieldDefense: true, fieldIndex: index });
    fieldDefenses.set(index, {
      result: defenseValue > attackValue ? "hold" : "trade",
      label: defenseValue > attackValue ? `DEF ${defenseValue} / 残る` : `DEF ${defenseValue} / 相打ち`,
    });
  });

  return {
    attackerIndex: selected.index,
    attackValue,
    fieldDefenses,
    handDefenseCount: legalHandDefenders(defender, attacker).length,
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
  onSelectField,
  onSelectMemory,
}: {
  player: PlayerState;
  ownerIndex: number;
  game: GameState;
  isOpponent?: boolean;
  trashSurge?: boolean;
  combatPreview?: CombatPreview | null;
  onSelectField: (ownerIndex: number, index: number) => void;
  onSelectMemory: (ownerIndex: number) => void;
}) {
  return (
    <div className={`field-grid ${isOpponent ? "opponent" : "human"} ${trashSurge ? "trash-surge" : ""}`}>
      <MemorySlot player={player} ownerIndex={ownerIndex} isOpponent={isOpponent} game={game} trashSurge={trashSurge} onSelectMemory={onSelectMemory} />
      {Array.from({ length: CONFIG.fieldLimit }).map((_, index) => {
        const card = player.field[index];
        if (!card) return <div className={`field-slot empty ${trashSurge ? "trash-alert" : ""}`} key={`empty-${ownerIndex}-${index}`} data-owner={ownerIndex} data-zone="field" data-index={index}>+</div>;
        const isDisruptTarget = game.pendingTarget?.kind === "disrupt"
          && ownerIndex === 1 - game.active
          && !player.spentFieldIndexes.has(index);
        const pendingCardTarget = pendingTargetCardState(game, ownerIndex, "field", index);
        const isSelected = game.selected?.zone === "field"
          && (game.selected.ownerIndex ?? 0) === ownerIndex
          && game.selected.index === index;
        const defensePreview = ownerIndex === 1 ? combatPreview?.fieldDefenses.get(index) : null;
        const isAttackerPreview = ownerIndex === 0 && combatPreview?.attackerIndex === index;
        return (
          <CardView
            key={`${card.id}-${index}`}
            card={card}
            ownerIndex={ownerIndex}
            zone="field"
            index={index}
            selected={pendingCardTarget === "selected" || isSelected}
            selectable
            spent={player.spentFieldIndexes.has(index)}
            actionState={pendingCardTarget === "target" || pendingCardTarget === "selected" ? "usable" : isDisruptTarget ? "usable" : ownerIndex === 0 ? fieldActionState(game, player, index) : "idle"}
            visualEffect={`${trashSurge ? "trash-alert" : ""} ${defensePreview ? `combat-preview ${defensePreview.result}` : ""} ${isAttackerPreview ? "attack-preview-source" : ""}`}
            extraBadges={defensePreview ? [defensePreview.label] : isAttackerPreview ? [`ATK ${combatPreview.attackValue}`] : []}
            showCost={false}
            onClick={() => onSelectField(ownerIndex, index)}
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
  onSelectMemory,
}: {
  player: PlayerState;
  ownerIndex: number;
  isOpponent: boolean;
  game: GameState;
  trashSurge: boolean;
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
        selectable
        actionState={ownerIndex === 0 && canUseAcceleratorMemory(game, player) ? "usable" : "idle"}
        visualEffect={trashSurge ? "trash-alert" : ""}
        showCost={false}
        onClick={() => onSelectMemory(ownerIndex)}
      />
    );
  }
  return <div className={`field-slot memory-empty ${trashSurge ? "trash-alert" : ""}`} data-owner={ownerIndex} data-zone="memory" data-index={0}>遺物</div>;
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
        flight.card && <CardView card={flight.card} ownerIndex={flight.tone === "ai" ? 1 : 0} zone="hand" index={0} showCost={false} />
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
  if (card.type === "event") return commandUsable(game, card, player, opponent) ? "usable" : "blocked";
  if (card.type === "memory") return "usable";
  if (card.type === "ai") {
    const canPlay = player.field.length < CONFIG.fieldLimit && playCost(card) <= game.actionsRemaining;
    const canUpgradeCard = bestUpgradeSource(player, card) !== null && upgradeCost(card) <= game.actionsRemaining;
    if (canPlay || canUpgradeCard) return canUpgradeCard ? "upgradeable" : "usable";
  }
  return "blocked";
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

function upgradeSourceIndexes(player: PlayerState, target: Card): number[] {
  return player.field
    .map((source, index) => canUpgrade(source, target) ? index : -1)
    .filter((index) => index >= 0);
}
