import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  CONFIG,
  type AiAction,
  type DefenseChoice,
  type Card,
  type GameState,
  type PlayerState,
  addLog,
  activePlayer,
  bestUpgradeSource,
  canActivePlayerAttack,
  canHumanAct,
  canUpgrade,
  cloneGame,
  commandUsable,
  createGame,
  chooseAiAction,
  draw,
  finishTurn,
  opponentPlayer,
  playCost,
  upgradeCost,
} from "./game";
import {
  afterAction,
  applyPlayEffects,
  beginAttackInDraft,
  discardHandCards,
  performAiActionInDraft,
  resolveDefenseInDraft,
  useCommandAtInDraft,
} from "./game/actions";
import { selectedCardForDetail, selectedHandCardName } from "./game/selectors";
import {
  AffinityGuide,
  DefensePanel,
  LogList,
  SelectedCardDetail,
  actionHintText,
} from "./components/DuelPanel";
import { CardLibraryPage, DeckBuilderPage } from "./components/DeckWorkshop";
import { CardArtPreview, CardView } from "./components/CardView";
import { DiscardModal, RulesModal } from "./components/Modals";
import { DuelActionReel, EventToast, GameBanner, type Banner, type Toast } from "./components/Overlays";
import type { DuelEvent, DuelEventPayload } from "./duelEvents";
import brandMark from "./assets/mark.svg";

let eventId = 1;

type AppPage = "duel" | "cards" | "builder";

type CardFlight = {
  id: number;
  card: Card;
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

export default function App() {
  const [page, setPage] = useState<AppPage>("duel");
  const [seed, setSeed] = useState(1);
  const [game, setGame] = useState<GameState>(() => createGame(1));
  const [rulesOpen, setRulesOpen] = useState(false);
  const [toast, setToast] = useState<Toast>(null);
  const [duelEvent, setDuelEvent] = useState<DuelEvent | null>(null);
  const [cardFlight, setCardFlight] = useState<CardFlight | null>(null);
  const [aiAnimating, setAiAnimating] = useState(false);
  const [autoDismissDuelEvents, setAutoDismissDuelEvents] = useState(false);
  const [banner, setBanner] = useState<Banner>(() => ({
    kind: "start",
    title: "BREAK DUEL",
    detail: "Seed 1 / 先攻: あなた / 60手番制限",
    id: eventId++,
  }));
  const [audioEnabled, setAudioEnabled] = useState(false);
  const audioContext = useRef<AudioContext | null>(null);
  const bgmTimer = useRef<number | null>(null);
  const duelEventQueue = useRef<DuelEventPayload[]>([]);
  const duelEventPlaying = useRef(false);
  const duelEventScheduler = useRef<number | null>(null);
  const duelEventTimer = useRef<number | null>(null);
  const cardFlightTimer = useRef<number | null>(null);
  const aiCommitTimer = useRef<number | null>(null);

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

  function queueDuelEvent(event: DuelEventPayload) {
    if (event.kind === "play" || event.kind === "memory" || event.kind === "upgrade") return;
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
    if (cardFlightTimer.current !== null) window.clearTimeout(cardFlightTimer.current);
    if (aiCommitTimer.current !== null) window.clearTimeout(aiCommitTimer.current);
    cardFlightTimer.current = null;
    aiCommitTimer.current = null;
    setAiAnimating(false);
    setCardFlight(null);
  }

  function cardSelector(ownerIndex: number, zone: string, index: number) {
    return `[data-owner="${ownerIndex}"][data-zone="${zone}"][data-index="${index}"]`;
  }

  function launchCardFlight({
    card,
    from,
    to,
    label,
    tone = "human",
    durationMs = 760,
  }: {
    card: Card;
    from: { ownerIndex: number; zone: string; index: number };
    to: { ownerIndex: number; zone: string; index: number };
    label: string;
    tone?: "human" | "ai";
    durationMs?: number;
  }) {
    const fromElement = document.querySelector(cardSelector(from.ownerIndex, from.zone, from.index));
    const toElement = document.querySelector(cardSelector(to.ownerIndex, to.zone, to.index));
    if (!fromElement || !toElement) return;
    if (cardFlightTimer.current !== null) window.clearTimeout(cardFlightTimer.current);
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
    setCardFlight({
      id: eventId++,
      card,
      label,
      tone,
      from: fromRect,
      to: targetRect,
      durationMs,
    });
    cardFlightTimer.current = window.setTimeout(() => {
      setCardFlight(null);
      cardFlightTimer.current = null;
    }, durationMs);
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
      if (!card) return 0;
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
    return action.type === "attack" ? 360 : 180;
  }

  function startNewGame() {
    const nextSeed = seed || 1;
    setGame(createGame(nextSeed));
    resetDuelEvents();
    setRulesOpen(false);
    showToast("対戦開始", `Seed ${nextSeed}`);
    showBanner({
      kind: "start",
      title: "BREAK DUEL",
      detail: `Seed ${nextSeed} / 先攻: あなた / ${CONFIG.maxTurns}手番制限`,
    });
  }

  function changePage(nextPage: AppPage) {
    if (nextPage !== "duel") resetDuelEvents();
    setRulesOpen(false);
    setPage(nextPage);
  }

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
    if (active.isHuman || game.actionsRemaining <= 0) return undefined;
    if (aiAnimating) return undefined;
    if (duelEvent || duelEventPlaying.current || duelEventQueue.current.length > 0 || duelEventScheduler.current !== null) return undefined;
    const timer = window.setTimeout(() => {
      const action = chooseAiAction(game);
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
      if (bgmTimer.current !== null) window.clearInterval(bgmTimer.current);
      if (duelEventScheduler.current !== null) window.clearTimeout(duelEventScheduler.current);
      if (duelEventTimer.current !== null) window.clearTimeout(duelEventTimer.current);
      if (cardFlightTimer.current !== null) window.clearTimeout(cardFlightTimer.current);
      if (aiCommitTimer.current !== null) window.clearTimeout(aiCommitTimer.current);
    };
  }, []);

  function ensureAudioContext() {
    if (!audioContext.current) {
      audioContext.current = new AudioContext();
    }
    if (audioContext.current.state === "suspended") void audioContext.current.resume();
    return audioContext.current;
  }

  function playTone(frequency: number, duration: number, volume: number, type: OscillatorType = "sine") {
    if (!audioEnabled) return;
    const ctx = ensureAudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = frequency;
    gain.gain.value = volume;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  }

  function playSfx(kind: string) {
    if (!audioEnabled) return;
    if (kind === "play") playTone(523.25, 0.1, 0.05, "square");
    if (kind === "attack") playTone(164.81, 0.12, 0.08, "sawtooth");
    if (kind === "block") playTone(196, 0.13, 0.06, "square");
    if (kind === "damage") playTone(110, 0.16, 0.08, "sawtooth");
    if (kind === "command") playTone(740, 0.08, 0.045, "square");
    if (kind === "end") playTone(392, 0.16, 0.055, "triangle");
  }

  function toggleAudio() {
    setAudioEnabled((enabled) => {
      const next = !enabled;
      if (!next && bgmTimer.current !== null) {
        window.clearInterval(bgmTimer.current);
        bgmTimer.current = null;
      }
      if (next && bgmTimer.current === null) {
        let step = 0;
        bgmTimer.current = window.setInterval(() => {
          const notes = [220, 261.63, 329.63, 392, 329.63, 293.66, 246.94, 196];
          playTone(notes[step % notes.length], 0.12, 0.045, "triangle");
          step += 1;
        }, 420);
      }
      return next;
    });
  }

  function selectHand(index: number) {
    if (!canHumanAct(game)) return;
    mutate((draft) => {
      draft.selected = { zone: "hand", index };
    });
  }

  function selectField(index: number) {
    if (!canHumanAct(game)) return;
    mutate((draft) => {
      draft.selected = { zone: "field", index };
    });
  }

  function playSelected() {
    if (!canHumanAct(game) || game.selected?.zone !== "hand") return;
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
    const sourceIndex = target?.type === "ai" ? bestUpgradeSource(player, target) : null;
    const source = sourceIndex === null ? null : player.field[sourceIndex];
    if (!target || target.type !== "ai" || sourceIndex === null || !source || upgradeCost(target) > game.actionsRemaining) return;
    launchCardFlight({
      card: target,
      from: { ownerIndex: 0, zone: "hand", index: game.selected.index },
      to: { ownerIndex: 0, zone: "field", index: sourceIndex },
      label: "アップグレード",
    });
    mutate((draft) => {
      if (draft.selected?.zone !== "hand") return;
      const player = activePlayer(draft);
      const target = player.hand[draft.selected.index];
      if (!target || target.type !== "ai") return;
      const sourceIndex = bestUpgradeSource(player, target);
      if (sourceIndex === null || draft.actionsRemaining < upgradeCost(target)) return;
      const cost = upgradeCost(target);
      const card = player.hand.splice(draft.selected.index, 1)[0];
      const source = player.field[sourceIndex];
      player.discard.push(source);
      player.field[sourceIndex] = card;
      player.spentFieldIndexes.delete(sourceIndex);
      let text = `${player.name}は${source.name}を元に${card.name}へアップグレード。`;
      text += applyPlayEffects(draft, player, card, sourceIndex, cost, source);
      addLog(draft, text);
      draft.selected = null;
      if (!draft.pendingTarget) afterAction(draft, cost);
    });
    showToast("アップグレード", selectedHandCardName(game));
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
    if (command.effect === "optimize") {
      mutate((draft) => {
        draft.pendingTarget = {
          kind: "hand-discard",
          reason: "optimize",
          playerIndex: draft.active,
          title: `${command.name}で捨てるカードを選択`,
          prompt: "1〜2枚選んでから2枚引きます。",
          min: 1,
          max: Math.min(2, player.hand.length - 1),
          excludeIndexes: [sourceIndex],
          selectedIndexes: [],
          sourceIndex,
        };
      });
      return;
    }
    if (command.effect === "relearn" && player.hand.length > 1) {
      mutate((draft) => {
        draft.pendingTarget = {
          kind: "hand-discard",
          reason: "relearn",
          playerIndex: draft.active,
          title: `${command.name}の代償を選択`,
          prompt: "トラッシュから召喚獣を回収するため、手札を1枚選んで捨てます。",
          min: 1,
          max: 1,
          excludeIndexes: [sourceIndex],
          selectedIndexes: [],
          sourceIndex,
        };
      });
      return;
    }
    useCommandAt(sourceIndex, null);
  }

  function useCommandAt(sourceIndex: number, targetIndex: number | null, discardIndexes: number[] = []) {
    mutate((draft) => useCommandAtInDraft(draft, sourceIndex, targetIndex, discardIndexes, { playSfx, showDuelEvent: queueDuelEvent }));
    showToast("指令", "カードを使用しました");
    playSfx("command");
  }

  function attackWithSelectedAi() {
    if (!canHumanAct(game) || game.selected?.zone !== "field") return;
    beginAttack(0, game.selected.index);
  }

  function beginAttack(attackerIndex: number, fieldIndex: number) {
    mutate((draft) => beginAttackInDraft(draft, attackerIndex, fieldIndex, { playSfx, showDuelEvent: queueDuelEvent }));
    showToast("攻撃", "攻撃を宣言しました");
    playSfx("attack");
  }

  function resolveDefense(choice: DefenseChoice) {
    mutate((draft) => resolveDefenseInDraft(draft, choice, { playSfx, showDuelEvent: queueDuelEvent }));
    if (game.pendingAttack && duelEvent) dismissDuelEvent();
  }

  function cycleSelectedCard() {
    if (!canHumanAct(game) || game.selected?.zone !== "hand") return;
    const player = activePlayer(game);
    const card = player.hand[game.selected.index];
    if (!card) return;
    mutate((draft) => {
      if (draft.selected?.zone !== "hand") return;
      const player = activePlayer(draft);
      const card = player.hand.splice(draft.selected.index, 1)[0];
      player.discard.push(card);
      const drawn = draw(player, 1);
      addLog(draft, `${player.name}は${card.name}を交換し、${drawn}枚引いた。`);
      draft.selected = null;
      afterAction(draft);
    });
    queueDuelEvent({
      kind: "cycle",
      title: `${player.name}が交換`,
      detail: `${card.name}をトラッシュへ送り、1枚引きました。`,
      fromLabel: "手札",
      toLabel: "トラッシュ",
      tone: "magenta",
      cards: [{ card, label: "交換", state: "trash" }],
    });
    showToast("交換", "手札を1枚交換しました");
    playSfx("command");
  }

  function endTurn() {
    if (!canHumanAct(game)) return;
    mutate((draft) => {
      finishTurn(draft, true);
    });
  }

  function confirmPendingTarget() {
    const pending = game.pendingTarget;
    if (!pending || pending.kind !== "hand-discard" || pending.selectedIndexes.length < pending.min) return;
    if (pending.reason === "firewall") {
      resolveDefense({ type: "field", index: pending.fieldIndex!, firewallDiscardIndex: pending.selectedIndexes[0] });
      mutate((draft) => {
        draft.pendingTarget = null;
      });
      return;
    }
    if (pending.reason === "pipeline") {
      mutate((draft) => {
        const player = draft.players[pending.playerIndex];
        const discarded = discardHandCards(draft, pending.playerIndex, pending.selectedIndexes);
        if (discarded.length > 0) addLog(draft, `${player.name}は${player.memory?.name ?? "効果"}で${discarded[0].name}を捨てた。`);
        if (discarded.length > 0) {
          queueDuelEvent({
            kind: "trash",
            title: `${player.memory?.name ?? "効果"}の捨て札`,
            detail: `${discarded[0].name}を手札からトラッシュへ送りました。`,
            fromLabel: "手札",
            toLabel: "トラッシュ",
            tone: player.isHuman ? "magenta" : "cyan",
            cards: [{ card: discarded[0], label: "捨て札", state: "trash" }],
          });
        }
        draft.pendingTarget = null;
        afterAction(draft, pending.sourceIndex ?? 1);
      });
      return;
    }
    useCommandAt(pending.sourceIndex!, null, pending.selectedIndexes);
  }

  function togglePendingHandIndex(index: number) {
    mutate((draft) => {
      const pending = draft.pendingTarget;
      if (!pending || pending.kind !== "hand-discard") return;
      const set = new Set(pending.selectedIndexes);
      if (set.has(index)) {
        set.delete(index);
      } else if (set.size < pending.max) {
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

  const playButtonLabel = selectedCard?.type === "event"
    ? "使用"
    : selectedCard?.type === "memory"
      ? "遺物配置"
      : "場に出す";
  const selectedHand = game.selected?.zone === "hand";
  const selectedField = game.selected?.zone === "field";
  const selectedHandCard = selectedHand ? active.hand[game.selected!.index] : null;
  const playDisabled = !canHumanAct(game) || !selectedHand || !selectedHandCard || (
    selectedHandCard.type === "event"
      ? !commandUsable(game, selectedHandCard, active, opponent)
      : selectedHandCard.type === "memory"
        ? playCost(selectedHandCard) > game.actionsRemaining
        : active.field.length >= CONFIG.fieldLimit || playCost(selectedHandCard) > game.actionsRemaining
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
  const defensePanel = (
    <DefensePanel
      game={game}
      onResolve={resolveDefense}
      onUseCommand={useCommandAt}
      onCancelTarget={() => mutate((draft) => { draft.pendingTarget = null; })}
      onTogglePendingHand={togglePendingHandIndex}
      onConfirmPending={confirmPendingTarget}
    />
  );
  const showDefenseInDuelEvent = Boolean(
    duelEvent
      && game.pendingAttack
      && game.players[game.pendingAttack.defenderIndex]?.isHuman,
  );

  if (page !== "duel") {
    return (
      <main className="workspace-shell">
        <WorkspaceHeader
          page={page}
          onChangePage={changePage}
          seed={seed}
          onSeedChange={setSeed}
          onStartNewGame={startNewGame}
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
    <main className="stitch-shell">
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
            <input type="number" value={seed} onChange={(event) => setSeed(Number(event.target.value) || 1)} />
          </label>
          <button type="button" onClick={startNewGame}>再戦</button>
          <button type="button" onClick={() => setRulesOpen(true)}>ルール</button>
          <button type="button" className={audioEnabled ? "audio-on" : ""} onClick={toggleAudio}>{audioEnabled ? "音ON" : "音OFF"}</button>
        </div>
        <div className="stitch-counts">
          <span className="ai-hand-source" data-owner={1} data-zone="hand-source" data-index={0}>手札 {ai.hand.length}</span>
          <span>山札 {ai.deck.length}</span>
          <button type="button" className="text-link" onClick={() => openDiscardViewer(1)}>トラッシュ {ai.discard.length}</button>
        </div>
      </header>

      <section className="stitch-battlefield" aria-label="対戦盤面">
        <FieldGrid player={ai} ownerIndex={1} game={game} isOpponent onSelectField={selectField} />
        <div className="clash-line" aria-hidden="true" />
        <FieldGrid player={human} ownerIndex={0} game={game} onSelectField={selectField} />
      </section>

      <section className="stitch-player-status">
        <div className="stitch-status-left">
          <h2>{human.name}</h2>
          <div className="deck-badge magenta">{human.deckName}</div>
          <LifePips life={human.life} tone="magenta" />
        </div>
        <div className="stitch-counts">
          <span>山札 {human.deck.length}</span>
          <button type="button" className="text-link" onClick={() => openDiscardViewer(0)}>トラッシュ {human.discard.length}</button>
        </div>
      </section>

      <section className="stitch-hand" aria-label="手札">
        {human.hand.map((card, index) => (
          <CardView
            key={`${card.id}-${index}`}
            card={card}
            ownerIndex={0}
            zone="hand"
            index={index}
            selected={game.selected?.zone === "hand" && game.selected.index === index}
            selectable={canHumanAct(game)}
            actionState={handActionState(game, human, ai, card)}
            showCost
            onClick={() => selectHand(index)}
          />
        ))}
      </section>

      <section className="stitch-command-dock" aria-live="polite">
        <div className="dock-detail">
          <div className="dock-preview">
            <CardArtPreview card={selectedCard} />
          </div>
          <SelectedCardDetail card={selectedCard} zone={game.selected?.zone ?? null} game={game} />
        </div>

        <div className="dock-actions">
          <div className="action-meter" aria-label={`残りアクション ${game.actionsRemaining}`}>
            <span className="meter-label">残りアクション</span>
            <span className="meter-value">{game.actionsRemaining}</span>
            <span className="action-tokens" aria-hidden="true">
              {Array.from({ length: CONFIG.actionsPerTurn }).map((_, index) => (
                <span key={index} className={`action-token ${index >= game.actionsRemaining ? "spent" : ""}`} />
              ))}
            </span>
          </div>
          <div className="action-strip">
            <button type="button" className={!playDisabled ? "action-ready" : ""} disabled={playDisabled} onClick={playSelected}><span>⇧</span>{playButtonLabel}</button>
            <button type="button" className={!upgradeDisabled ? "action-ready" : ""} disabled={upgradeDisabled} onClick={upgradeSelectedAi}><span>↑</span>アップグレード</button>
            <button type="button" className={!attackDisabled ? "action-ready" : ""} disabled={attackDisabled} onClick={attackWithSelectedAi}><span>⚔</span>攻撃</button>
            <button type="button" className={canHumanAct(game) && selectedHand ? "action-ready" : ""} disabled={!canHumanAct(game) || !selectedHand} onClick={cycleSelectedCard}><span>↔</span>交換</button>
            <button type="button" className={canHumanAct(game) ? "action-ready end-turn" : "end-turn"} disabled={!canHumanAct(game)} onClick={endTurn}><span>●</span>ターン終了</button>
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

        <div className="dock-side">
          <AffinityGuide game={game} selected={selectedCard} />
          <LogList entries={game.log} />
        </div>
        {!showDefenseInDuelEvent && defensePanel}
      </section>

      <EventToast toast={toast} />
      <CardFlightLayer flight={cardFlight} />
      <DuelActionReel event={duelEvent} autoDismiss={autoDismissDuelEvents} onClose={dismissDuelEvent}>
        {showDefenseInDuelEvent ? defensePanel : null}
      </DuelActionReel>
      <GameBanner banner={cardFlight ? null : banner} turn={game.turn} />
      {rulesOpen && <RulesModal onClose={() => setRulesOpen(false)} />}
      {game.discardViewerOwner !== null && (
        <DiscardModal game={game} onClose={closeDiscardViewer} onSelect={selectDiscardCard} />
      )}
    </main>
  );
}

function WorkspaceHeader({
  page,
  onChangePage,
  seed,
  onSeedChange,
  onStartNewGame,
  onOpenRules,
  audioEnabled,
  onToggleAudio,
}: {
  page: AppPage;
  onChangePage: (page: AppPage) => void;
  seed: number;
  onSeedChange: (seed: number) => void;
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
          <input type="number" value={seed} onChange={(event) => onSeedChange(Number(event.target.value) || 1)} />
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

function FieldGrid({
  player,
  ownerIndex,
  game,
  isOpponent = false,
  onSelectField,
}: {
  player: PlayerState;
  ownerIndex: number;
  game: GameState;
  isOpponent?: boolean;
  onSelectField: (index: number) => void;
}) {
  return (
    <div className={`field-grid ${isOpponent ? "opponent" : "human"}`}>
      <MemorySlot player={player} ownerIndex={ownerIndex} isOpponent={isOpponent} />
      {Array.from({ length: CONFIG.fieldLimit }).map((_, index) => {
        const card = player.field[index];
        if (!card) return <div className="field-slot empty" key={`empty-${ownerIndex}-${index}`} data-owner={ownerIndex} data-zone="field" data-index={index}>+</div>;
        return (
          <CardView
            key={`${card.id}-${index}`}
            card={card}
            ownerIndex={ownerIndex}
            zone="field"
            index={index}
            selected={ownerIndex === 0 && game.selected?.zone === "field" && game.selected.index === index}
            selectable={ownerIndex === 0 && canHumanAct(game)}
            spent={player.spentFieldIndexes.has(index)}
            actionState={ownerIndex === 0 ? fieldActionState(game, player, index) : "idle"}
            showCost={false}
            onClick={() => onSelectField(index)}
          />
        );
      })}
    </div>
  );
}

function MemorySlot({ player, ownerIndex, isOpponent }: { player: PlayerState; ownerIndex: number; isOpponent: boolean }) {
  if (player.memory) {
    return <CardView card={player.memory} ownerIndex={ownerIndex} zone="memory" index={0} showCost={false} />;
  }
  return <div className="field-slot memory-empty" data-owner={ownerIndex} data-zone="memory" data-index={0}>遺物</div>;
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
      <CardView card={flight.card} ownerIndex={flight.tone === "ai" ? 1 : 0} zone="hand" index={0} showCost={false} />
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
