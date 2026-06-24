export type Attribute = "火" | "水" | "風" | "土";
export type CardType = "ai" | "event" | "memory";
export type AiEffect =
  | "attack_plus_1"
  | "reckless_attack_plus_1"
  | "draw_after_overheat"
  | "draw_two_after_overheat"
  | "draw_two_after_overheat_opponent_draw"
  | "draw_on_play"
  | "draw_on_play_cannot_hand_defend"
  | "filter_on_play"
  | "no_spend_after_attack"
  | "spend_enemy_on_play"
  | "spend_enemy_on_play_enters_spent"
  | "defense_plus_1"
  | "defense_plus_1_enters_spent"
  | "recover_ai_on_play"
  | "block_pressure"
  | "hand_defense_pierce"
  | "low_life_no_hand_defense"
  | "low_life_no_hand_defense_self_damage"
  | "draw_on_blocked_attack"
  | "draw_on_blocked_attack_cannot_hand_defend"
  | "ready_ally_on_play"
  | "ready_ally_on_play_draw"
  | "return_after_overheat"
  | "return_after_overheat_cannot_hand_defend"
  | "draw_on_successful_defense"
  | "draw_on_successful_defense_enters_spent";
export type CommandEffect = "optimize" | "patch" | "disrupt" | "relearn" | "sandbox";
export type MemoryEffect = "firewall" | "cache" | "pipeline";
export type CardEffect = AiEffect | CommandEffect | MemoryEffect | "";
export type Zone = "hand" | "field" | "memory" | "discard";

export type Card = {
  id: string;
  name: string;
  type: CardType;
  attribute?: Attribute;
  power?: number;
  effect?: CardEffect;
};

export type PlayerState = {
  name: string;
  deckName: string;
  isHuman: boolean;
  life: number;
  deck: Card[];
  hand: Card[];
  field: Card[];
  memory: Card | null;
  discard: Card[];
  cardsDrawn: number;
  turnsStarted: number;
  handDefensesUsed: number;
  pipelineUsed: boolean;
  sandboxShield: number;
  spentFieldIndexes: Set<number>;
};

export type Selection = {
  zone: "hand" | "field";
  index: number;
} | null;

export type PendingAttack = {
  attackerIndex: number;
  defenderIndex: number;
  fieldIndex: number;
} | null;

export type PendingTarget =
  | {
      kind: "disrupt";
      sourceIndex: number;
    }
  | {
      kind: "hand-discard";
      reason: "optimize" | "relearn" | "pipeline" | "firewall";
      playerIndex: number;
      title: string;
      prompt: string;
      min: number;
      max: number;
      excludeIndexes: number[];
      selectedIndexes: number[];
      sourceIndex?: number;
      fieldIndex?: number;
    }
  | null;

export type GameState = {
  rng: () => number;
  seed: number;
  players: PlayerState[];
  active: number;
  turn: number;
  actionsRemaining: number;
  winner: number | null;
  draw: boolean;
  selected: Selection;
  pendingAttack: PendingAttack;
  pendingTarget: PendingTarget;
  log: string[];
  aiRunning: boolean;
  discardViewerOwner: number | null;
  discardViewerIndex: number | null;
};

export type DefenseChoice =
  | { type: "field"; index: number; firewallDiscardIndex?: number }
  | { type: "hand"; index: number }
  | { type: "none" };

export const ATTRIBUTES: Record<Attribute, { code: string; color: string }> = {
  火: { code: "FIRE", color: "#d1493f" },
  水: { code: "WATER", color: "#2870c7" },
  風: { code: "WIND", color: "#219a76" },
  土: { code: "EARTH", color: "#a36a24" },
};

export const COMMAND_COLOR = "#8b5cf6";
export const MEMORY_COLOR = "#f59e0b";

export const CONFIG = {
  life: 5,
  initialHand: 5,
  firstPlayerInitialHand: 5,
  secondPlayerInitialHand: 4,
  actionsPerTurn: 2,
  fieldLimit: 3,
  maxTurns: 60,
  advantageBonus: 1,
  disadvantagePenalty: 1,
  firstPlayerFirstTurnActions: 1,
  firstPlayerFirstTurnCanAttack: false,
  eachPlayerFirstTurnActions: 2,
  handDefenseLimit: 1 as number | null,
  handDefenseEmptyOnly: false,
  exhaustAfterAttack: true,
  exhaustedCanDefend: false,
  firstPlayerFirstTurnDraw: false,
  power1DrawsOnPlay: true,
  power2DefenseBonus: 1,
  largeAiPlayCost: 2,
  power4EntersSpent: false,
  power4OverheatsAfterAttack: true,
  handLimit: null as number | null,
};

export function makeRng(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

export function addLog(game: GameState, message: string): void {
  game.log.push(message);
  game.log = game.log.slice(-80);
}

export function cardPool(): Card[] {
  const monsterNames: Record<string, string> = {
    "AI-FIRE-1": "火蜥蜴サラマンダー",
    "AI-FIRE-1B": "火花鼠ピリカ",
    "AI-FIRE-2": "溶岩甲獣バサルト",
    "AI-FIRE-2B": "双爪炎狼ブレイズ",
    "AI-FIRE-3": "紅蓮火翼ガルーダ",
    "AI-FIRE-3B": "爆角獣イグナロス",
    "AI-FIRE-4": "黒焔の古竜ヴァルガ",
    "AI-FIRE-4B": "劫火竜アグニール",
    "AI-WATER-1": "水精リュミナ",
    "AI-WATER-1B": "潮雫ピクシー",
    "AI-WATER-2": "水晶甲羅セルキー",
    "AI-WATER-2B": "霧泡セイレーン",
    "AI-WATER-3": "奔流海獣オルカーン",
    "AI-WATER-3B": "深流賢獣ネレイド",
    "AI-WATER-4": "蒼潮リヴァイアサン",
    "AI-WATER-4B": "星海クラーケン・アステル",
    "AI-WIND-1": "綿風小狐フルーフ",
    "AI-WIND-1B": "風鈴鳥リュフ",
    "AI-WIND-2": "翡翠風刃マンティス",
    "AI-WIND-2B": "真空鴉カイト",
    "AI-WIND-3": "天翔風鹿シルフィード",
    "AI-WIND-3B": "風紋グリフォン・アルエット",
    "AI-WIND-4": "雲海の翼鯨ミストラル",
    "AI-WIND-4B": "天蓋ロック・ヴァユ",
    "AI-EARTH-1": "苔帽子のモール",
    "AI-EARTH-1B": "芽吹きノーム・ペルナ",
    "AI-EARTH-2": "古代甲羅ガメル",
    "AI-EARTH-2B": "磁鉄甲虫フェルム",
    "AI-EARTH-3": "岩角多脚獣グラン",
    "AI-EARTH-3B": "琥珀角犀アンバーン",
    "AI-EARTH-4": "山脈の古巨獣ガイアス",
    "AI-EARTH-4B": "地核竜バサリア",
  };
  const aiEffects = new Map<string, AiEffect>([
    ["AI-FIRE-1B", "block_pressure"],
    ["AI-FIRE-2", "attack_plus_1"],
    ["AI-FIRE-2B", "hand_defense_pierce"],
    ["AI-FIRE-3B", "reckless_attack_plus_1"],
    ["AI-FIRE-4", "draw_after_overheat"],
    ["AI-FIRE-4B", "low_life_no_hand_defense_self_damage"],
    ["AI-WATER-1", "draw_on_play"],
    ["AI-WATER-1B", "draw_on_play_cannot_hand_defend"],
    ["AI-WATER-2", "filter_on_play"],
    ["AI-WATER-2B", "draw_on_blocked_attack_cannot_hand_defend"],
    ["AI-WATER-3", "draw_on_play"],
    ["AI-WATER-3B", "filter_on_play"],
    ["AI-WATER-4B", "draw_two_after_overheat_opponent_draw"],
    ["AI-WIND-1", "no_spend_after_attack"],
    ["AI-WIND-1B", "no_spend_after_attack"],
    ["AI-WIND-2B", "spend_enemy_on_play"],
    ["AI-WIND-3", "spend_enemy_on_play"],
    ["AI-WIND-3B", "ready_ally_on_play_draw"],
    ["AI-WIND-4B", "return_after_overheat_cannot_hand_defend"],
    ["AI-EARTH-1B", "draw_on_successful_defense"],
    ["AI-EARTH-2", "defense_plus_1"],
    ["AI-EARTH-2B", "defense_plus_1"],
    ["AI-EARTH-3B", "recover_ai_on_play"],
    ["AI-EARTH-4", "recover_ai_on_play"],
    ["AI-EARTH-4B", "draw_on_successful_defense_enters_spent"],
  ]);
  const aiCards: Card[] = (Object.entries(ATTRIBUTES) as [Attribute, { code: string; color: string }][])
    .flatMap(([attribute, meta]) =>
      [1, 2, 3, 4].flatMap((power) => ["", "B"].map((suffix) => {
        const id = `AI-${meta.code}-${power}${suffix}`;
        const effect: CardEffect = aiEffects.get(id) ?? "";
        return {
          id,
          name: monsterNames[id],
          type: "ai" as const,
          attribute,
          power,
          effect,
        };
      })),
    );
  return [
    ...aiCards,
    { id: "CMD-OPTIMIZE", name: "戦術整理", type: "event", effect: "optimize" },
    { id: "CMD-PATCH", name: "癒し薬草", type: "event", effect: "patch" },
    { id: "CMD-DISRUPT", name: "絡め蔦", type: "event", effect: "disrupt" },
    { id: "CMD-RELEARN", name: "追憶の巻物", type: "event", effect: "relearn" },
    { id: "CMD-SANDBOX", name: "守護結界", type: "event", effect: "sandbox" },
    { id: "MEM-FIREWALL", name: "守護の紋章", type: "memory", effect: "firewall" },
    { id: "MEM-CACHE", name: "旅人の鞄", type: "memory", effect: "cache" },
    { id: "MEM-PIPELINE", name: "精霊の水脈", type: "memory", effect: "pipeline" },
  ];
}

export const CARD_BY_ID = new Map(cardPool().map((card) => [card.id, card]));

export const DECKS = {
  break: {
    name: "紅蓮突破デッキ",
    cards: [
      "AI-FIRE-1",
      "AI-FIRE-1B",
      "AI-FIRE-2",
      "AI-FIRE-2B",
      "AI-FIRE-3",
      "AI-FIRE-3B",
      "AI-FIRE-4",
      "AI-FIRE-4B",
      "AI-WATER-1",
      "AI-WATER-1B",
      "AI-WATER-2",
      "AI-WATER-3",
      "AI-WATER-3B",
      "AI-WATER-4",
      "CMD-DISRUPT",
      "CMD-DISRUPT",
      "CMD-OPTIMIZE",
      "CMD-PATCH",
      "CMD-SANDBOX",
      "MEM-CACHE",
    ],
  },
  control: {
    name: "大地守護デッキ",
    cards: [
      "AI-EARTH-1",
      "AI-EARTH-1B",
      "AI-EARTH-2",
      "AI-EARTH-2B",
      "AI-EARTH-3",
      "AI-EARTH-3B",
      "AI-EARTH-4",
      "AI-EARTH-4B",
      "AI-WIND-1",
      "AI-WIND-1B",
      "AI-WIND-2",
      "AI-WIND-3",
      "AI-WIND-3B",
      "AI-WIND-4",
      "AI-WATER-1",
      "CMD-DISRUPT",
      "CMD-RELEARN",
      "CMD-PATCH",
      "CMD-OPTIMIZE",
      "MEM-FIREWALL",
    ],
  },
  fire: {
    name: "火単色デッキ",
    cards: [
      "AI-FIRE-1",
      "AI-FIRE-1B",
      "AI-FIRE-2",
      "AI-FIRE-2B",
      "AI-FIRE-3",
      "AI-FIRE-3B",
      "AI-FIRE-4",
      "AI-FIRE-4B",
      "CMD-DISRUPT",
      "CMD-DISRUPT",
      "CMD-SANDBOX",
      "CMD-SANDBOX",
      "CMD-PATCH",
      "CMD-PATCH",
      "CMD-OPTIMIZE",
      "CMD-OPTIMIZE",
      "MEM-PIPELINE",
      "MEM-PIPELINE",
      "MEM-CACHE",
      "MEM-CACHE",
    ],
  },
  water: {
    name: "水単色デッキ",
    cards: [
      "AI-WATER-1",
      "AI-WATER-1B",
      "AI-WATER-2",
      "AI-WATER-2B",
      "AI-WATER-3",
      "AI-WATER-3B",
      "AI-WATER-4",
      "AI-WATER-4B",
      "CMD-OPTIMIZE",
      "CMD-OPTIMIZE",
      "CMD-RELEARN",
      "CMD-RELEARN",
      "CMD-PATCH",
      "CMD-PATCH",
      "CMD-DISRUPT",
      "CMD-DISRUPT",
      "MEM-CACHE",
      "MEM-CACHE",
      "MEM-PIPELINE",
      "MEM-PIPELINE",
    ],
  },
  wind: {
    name: "風単色デッキ",
    cards: [
      "AI-WIND-1",
      "AI-WIND-1B",
      "AI-WIND-2",
      "AI-WIND-2B",
      "AI-WIND-3",
      "AI-WIND-3B",
      "AI-WIND-4",
      "AI-WIND-4B",
      "CMD-DISRUPT",
      "CMD-DISRUPT",
      "CMD-PATCH",
      "CMD-PATCH",
      "CMD-SANDBOX",
      "CMD-SANDBOX",
      "CMD-RELEARN",
      "CMD-RELEARN",
      "MEM-PIPELINE",
      "MEM-PIPELINE",
      "MEM-FIREWALL",
      "MEM-FIREWALL",
    ],
  },
  earth: {
    name: "土単色デッキ",
    cards: [
      "AI-EARTH-1",
      "AI-EARTH-1B",
      "AI-EARTH-2",
      "AI-EARTH-2B",
      "AI-EARTH-3",
      "AI-EARTH-3B",
      "AI-EARTH-4",
      "AI-EARTH-4B",
      "CMD-SANDBOX",
      "CMD-SANDBOX",
      "CMD-PATCH",
      "CMD-PATCH",
      "CMD-OPTIMIZE",
      "CMD-OPTIMIZE",
      "CMD-DISRUPT",
      "CMD-DISRUPT",
      "MEM-FIREWALL",
      "MEM-FIREWALL",
      "MEM-PIPELINE",
      "MEM-PIPELINE",
    ],
  },
} as const;

export function cloneCard(card: Card): Card {
  return { ...card };
}

export function shuffle(cards: Card[], rng: () => number): void {
  for (let i = cards.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
}

export function makeDeck(deckId: keyof typeof DECKS): Card[] {
  return DECKS[deckId].cards.map((cardId) => cloneCard(CARD_BY_ID.get(cardId)!));
}

export function makePlayer(name: string, isHuman: boolean, deckId: keyof typeof DECKS, rng: () => number): PlayerState {
  const deck = makeDeck(deckId);
  shuffle(deck, rng);
  return {
    name,
    deckName: DECKS[deckId].name,
    isHuman,
    life: CONFIG.life,
    deck,
    hand: [],
    field: [],
    memory: null,
    discard: [],
    cardsDrawn: 0,
    turnsStarted: 0,
    handDefensesUsed: 0,
    pipelineUsed: false,
    sandboxShield: 0,
    spentFieldIndexes: new Set<number>(),
  };
}

export function cloneGame(game: GameState): GameState {
  return {
    ...game,
    players: game.players.map((player) => ({
      ...player,
      deck: [...player.deck],
      hand: [...player.hand],
      field: [...player.field],
      discard: [...player.discard],
      spentFieldIndexes: new Set(player.spentFieldIndexes),
    })),
    selected: game.selected ? { ...game.selected } : null,
    pendingAttack: game.pendingAttack ? { ...game.pendingAttack } : null,
    pendingTarget: game.pendingTarget
      ? { ...game.pendingTarget, selectedIndexes: "selectedIndexes" in game.pendingTarget ? [...game.pendingTarget.selectedIndexes] : undefined } as PendingTarget
      : null,
    log: [...game.log],
  };
}

export function createGame(seed: number): GameState {
  const rng = makeRng(seed);
  const game: GameState = {
    rng,
    seed,
    players: [
      makePlayer("あなた", true, "break", rng),
      makePlayer("ライバル", false, "control", rng),
    ],
    active: 0,
    turn: 0,
    actionsRemaining: 0,
    winner: null,
    draw: false,
    selected: null,
    pendingAttack: null,
    pendingTarget: null,
    log: [],
    aiRunning: false,
    discardViewerOwner: null,
    discardViewerIndex: null,
  };
  draw(game.players[0], CONFIG.firstPlayerInitialHand);
  draw(game.players[1], CONFIG.secondPlayerInitialHand);
  addLog(game, `Seed ${seed} で対戦開始。`);
  startTurn(game);
  return game;
}

export function activePlayer(game: GameState): PlayerState {
  return game.players[game.active];
}

export function opponentPlayer(game: GameState): PlayerState {
  return game.players[1 - game.active];
}

export function ownerIndexOf(game: GameState, player: PlayerState): number {
  return game.players.indexOf(player);
}

export function draw(player: PlayerState, count: number): number {
  let drawn = 0;
  for (let i = 0; i < count; i += 1) {
    if (player.deck.length === 0) break;
    player.hand.push(player.deck.pop()!);
    player.cardsDrawn += 1;
    drawn += 1;
  }
  return drawn;
}

export function startTurn(game: GameState): void {
  game.turn += 1;
  game.actionsRemaining = actionsForTurn(game);
  game.players.forEach((player) => {
    player.handDefensesUsed = 0;
  });
  const player = activePlayer(game);
  player.spentFieldIndexes.clear();
  player.pipelineUsed = false;
  player.sandboxShield = 0;
  player.turnsStarted += 1;
  const drawn = shouldDrawForTurn(game) ? draw(player, 1) : 0;
  const memoryDrawn = applyTurnStartMemory(player);
  const drawText = drawn > 0 ? "1枚引いた。" : "ドローなし。";
  const memoryText = memoryDrawn > 0 ? ` ${player.memory!.name}で追加${memoryDrawn}枚。` : "";
  addLog(game, `${player.name}のターン。${drawText}${memoryText}`);
  checkResourceExhaustion(game);
  game.selected = null;
}

export function shouldDrawForTurn(game: GameState): boolean {
  return !(game.turn === 1 && game.active === 0 && !CONFIG.firstPlayerFirstTurnDraw);
}

export function canActivePlayerAttack(game: GameState): boolean {
  return !(game.turn === 1 && game.active === 0 && !CONFIG.firstPlayerFirstTurnCanAttack);
}

export function actionsForTurn(game: GameState): number {
  if (game.turn === 1 && game.active === 0 && CONFIG.firstPlayerFirstTurnActions !== null) {
    return CONFIG.firstPlayerFirstTurnActions;
  }
  if (activePlayer(game).turnsStarted === 0 && CONFIG.eachPlayerFirstTurnActions !== null) {
    return CONFIG.eachPlayerFirstTurnActions;
  }
  return CONFIG.actionsPerTurn;
}

export function applyTurnStartMemory(player: PlayerState): number {
  if (player.memory?.effect !== "cache") return 0;
  if (player.hand.length > 2) return 0;
  return draw(player, 1);
}

export function enforceHandLimit(player: PlayerState): Card[] {
  if (CONFIG.handLimit === null) return [];
  const discarded: Card[] = [];
  while (player.hand.length > CONFIG.handLimit) {
    const index = lowestPriorityHand(player);
    discarded.push(player.hand.splice(index, 1)[0]);
  }
  player.discard.push(...discarded);
  return discarded;
}

export function finishTurn(game: GameState, logEnd: boolean): void {
  const player = activePlayer(game);
  const discarded = enforceHandLimit(player);
  if (discarded.length > 0) {
    addLog(game, `${player.name}は手札上限で${discarded.map((card) => card.name).join("、")}をトラッシュ。`);
  }
  if (logEnd) addLog(game, `${player.name}はターン終了。`);
  player.sandboxShield = 0;
  game.actionsRemaining = 0;
  game.active = 1 - game.active;
  checkResourceExhaustion(game);
  checkTurnLimit(game);
  if (game.winner === null && !game.draw) startTurn(game);
}

export function useAction(game: GameState, cost = 1): void {
  game.actionsRemaining -= cost;
  if (game.actionsRemaining <= 0 && !game.pendingAttack && game.winner === null && !game.draw) {
    finishTurn(game, false);
  }
}

export function playCost(card: Card | null | undefined): number {
  if (!card) return 99;
  if (card.type === "event" || card.type === "memory") return 1;
  return (card.power ?? 0) >= 3 ? CONFIG.largeAiPlayCost : 1;
}

export function upgradeCost(card: Card): number {
  return Math.max(1, playCost(card) - 1);
}

export function canUpgrade(source: Card | undefined, target: Card | undefined): boolean {
  return Boolean(
    source?.type === "ai"
      && target?.type === "ai"
      && source.attribute === target.attribute
      && (source.power ?? 0) < (target.power ?? 0),
  );
}

export function bestUpgradeSource(player: PlayerState, targetCard: Card): number | null {
  const options = player.field
    .map((source, index) => ({ source, index }))
    .filter(({ source }) => canUpgrade(source, targetCard));
  if (options.length === 0) return null;
  options.sort((a, b) => (a.source.power ?? 0) - (b.source.power ?? 0) || a.source.id.localeCompare(b.source.id));
  return options[0].index;
}

export function matchupModifier(defenseAttribute: Attribute, attackAttribute: Attribute): number {
  void defenseAttribute;
  void attackAttribute;
  return 0;
}

export function matchupLabel(defenseAttribute: Attribute, attackAttribute: Attribute): string {
  if (defenseAttribute === attackAttribute) return "同属性";
  return "別属性";
}

export function attackCombatValue(card: Card): number {
  return (card.power ?? 0) + (attacksPlus1(card) ? 1 : 0);
}

export function aiEffectText(card: Card): string {
  if (card.effect === "attack_plus_1") return "攻撃値 +1";
  if (card.effect === "reckless_attack_plus_1") return "攻撃値 +1。ただし手札防御に使えない";
  if (card.effect === "draw_after_overheat") return "攻撃後退場時に1枚引く";
  if (card.effect === "draw_two_after_overheat") return "攻撃後退場時に2枚引く";
  if (card.effect === "draw_two_after_overheat_opponent_draw") return "攻撃後退場時に2枚引く。ただし登場時、相手は1枚引く";
  if (card.effect === "draw_on_play") return "登場時 1枚引く";
  if (card.effect === "draw_on_play_cannot_hand_defend") return "登場時 1枚引く。ただし手札防御に使えない";
  if (card.effect === "filter_on_play") return "登場時 2枚引いて1枚捨てる";
  if (card.effect === "no_spend_after_attack") return "攻撃しても消耗しない";
  if (card.effect === "spend_enemy_on_play") return "登場時、相手の未消耗召喚獣1体を消耗";
  if (card.effect === "spend_enemy_on_play_enters_spent") return "登場時、相手の未消耗召喚獣1体を消耗。ただし自身も消耗で出る";
  if (card.effect === "defense_plus_1") return "防御値 +1";
  if (card.effect === "defense_plus_1_enters_spent") return "防御値 +1。ただし消耗で出る";
  if (card.effect === "recover_ai_on_play") return "登場時、手札1枚以下ならトラッシュの召喚獣1枚を回収";
  if (card.effect === "block_pressure") return "攻撃が防御された時、相手は手札1枚を捨てる";
  if (card.effect === "hand_defense_pierce") return "手札防御されても1ダメージ";
  if (card.effect === "low_life_no_hand_defense") return "相手ライフ2以下なら手札防御不可";
  if (card.effect === "low_life_no_hand_defense_self_damage") return "相手ライフ2以下なら手札防御不可。ただし登場時、自分に1ダメージ";
  if (card.effect === "draw_on_blocked_attack") return "攻撃が防御された時、1枚引く";
  if (card.effect === "draw_on_blocked_attack_cannot_hand_defend") return "攻撃が防御された時、1枚引く。ただし手札防御に使えない";
  if (card.effect === "ready_ally_on_play") return "登場時、自分の消耗召喚獣1体を回復";
  if (card.effect === "ready_ally_on_play_draw") return "登場時 1枚引き、自分の消耗召喚獣1体を回復";
  if (card.effect === "return_after_overheat") return "攻撃後退場時、トラッシュではなく手札に戻る";
  if (card.effect === "return_after_overheat_cannot_hand_defend") return "攻撃後退場時、手札に戻る。ただし消耗で出て、手札防御に使えない";
  if (card.effect === "draw_on_successful_defense") return "場防御成功時、1枚引く";
  if (card.effect === "draw_on_successful_defense_enters_spent") return "場防御成功時、1枚引く。ただし消耗で出る";
  return "効果なし";
}

export function attacksPlus1(card: Card): boolean {
  return card.type === "ai" && (card.effect === "attack_plus_1" || card.effect === "reckless_attack_plus_1");
}

export function drawsOnPlay(card: Card): boolean {
  return card.type === "ai" && (
    card.effect === "draw_on_play"
    || card.effect === "draw_on_play_cannot_hand_defend"
    || card.effect === "ready_ally_on_play_draw"
  );
}

export function keepsReadyAfterAttack(card: Card): boolean {
  return card.type === "ai" && card.effect === "no_spend_after_attack";
}

export function drawsAfterOverheat(card: Card): boolean {
  return card.type === "ai" && card.effect === "draw_after_overheat";
}

export function drawsTwoAfterOverheat(card: Card): boolean {
  return card.type === "ai" && (card.effect === "draw_two_after_overheat" || card.effect === "draw_two_after_overheat_opponent_draw");
}

export function filtersOnPlay(card: Card): boolean {
  return card.type === "ai" && card.effect === "filter_on_play";
}

export function spendsEnemyOnPlay(card: Card): boolean {
  return card.type === "ai" && (card.effect === "spend_enemy_on_play" || card.effect === "spend_enemy_on_play_enters_spent");
}

export function recoversAiOnPlay(card: Card): boolean {
  return card.type === "ai" && card.effect === "recover_ai_on_play";
}

export function pressuresOnBlock(card: Card): boolean {
  return card.type === "ai" && card.effect === "block_pressure";
}

export function piercesHandDefense(card: Card): boolean {
  return card.type === "ai" && card.effect === "hand_defense_pierce";
}

export function blocksLowLifeHandDefense(card: Card, defender: PlayerState): boolean {
  return card.type === "ai"
    && (card.effect === "low_life_no_hand_defense" || card.effect === "low_life_no_hand_defense_self_damage")
    && defender.life <= 2;
}

export function drawsOnBlockedAttack(card: Card): boolean {
  return card.type === "ai" && (card.effect === "draw_on_blocked_attack" || card.effect === "draw_on_blocked_attack_cannot_hand_defend");
}

export function readiesAllyOnPlay(card: Card): boolean {
  return card.type === "ai" && (card.effect === "ready_ally_on_play" || card.effect === "ready_ally_on_play_draw");
}

export function returnsAfterOverheat(card: Card): boolean {
  return card.type === "ai" && (card.effect === "return_after_overheat" || card.effect === "return_after_overheat_cannot_hand_defend");
}

export function drawsOnSuccessfulDefense(card: Card): boolean {
  return card.type === "ai" && (card.effect === "draw_on_successful_defense" || card.effect === "draw_on_successful_defense_enters_spent");
}

export function entersSpentOnPlay(card: Card): boolean {
  return card.type === "ai" && (
    card.effect === "spend_enemy_on_play_enters_spent"
    || card.effect === "defense_plus_1_enters_spent"
    || card.effect === "return_after_overheat_cannot_hand_defend"
    || card.effect === "draw_on_successful_defense_enters_spent"
  );
}

export function selfDamagesOnPlay(card: Card): boolean {
  return card.type === "ai" && card.effect === "low_life_no_hand_defense_self_damage";
}

export function opponentDrawsOnPlay(card: Card): boolean {
  return card.type === "ai" && card.effect === "draw_two_after_overheat_opponent_draw";
}

export function cannotHandDefend(card: Card): boolean {
  return card.type === "ai" && (
    card.effect === "reckless_attack_plus_1"
    || card.effect === "draw_on_play_cannot_hand_defend"
    || card.effect === "draw_on_blocked_attack_cannot_hand_defend"
    || card.effect === "return_after_overheat_cannot_hand_defend"
  );
}

export function defensePowerBonus(card: Card, defender: PlayerState | null = null, attackCard: Card | null = null, options: { firewallPaid?: boolean } = {}): number {
  let bonus = (card.effect === "defense_plus_1" || card.effect === "defense_plus_1_enters_spent") ? CONFIG.power2DefenseBonus : 0;
  if (
    defender?.memory?.effect === "firewall"
    && (defender.hand.length > 0 || options.firewallPaid)
    && attackCard
    && card.attribute === attackCard.attribute
  ) {
    bonus += 1;
  }
  return bonus;
}

export function defenseCombatValue(attackCard: Card, defenseCard: Card, defender: PlayerState | null = null, options: { firewallPaid?: boolean } = {}): number {
  if (!attackCard.attribute || !defenseCard.attribute) return 0;
  return (defenseCard.power ?? 0)
    + defensePowerBonus(defenseCard, defender, attackCard, options)
    + matchupModifier(defenseCard.attribute, attackCard.attribute);
}

export function canDefend(attackCard: Card, defenseCard: Card, defender: PlayerState | null = null): boolean {
  return defenseCombatValue(attackCard, defenseCard, defender) >= attackCombatValue(attackCard);
}

export function legalFieldDefenders(defender: PlayerState, attackCard: Card): { card: Card; index: number }[] {
  return defender.field
    .map((card, index) => ({ card, index }))
    .filter(({ card, index }) => (CONFIG.exhaustedCanDefend || !defender.spentFieldIndexes.has(index)) && canDefend(attackCard, card, defender));
}

export function legalHandDefenders(defender: PlayerState, attackCard: Card): { card: Card; index: number }[] {
  if (blocksLowLifeHandDefense(attackCard, defender)) return [];
  if (CONFIG.handDefenseLimit !== null) {
    if (CONFIG.handDefenseLimit <= 0) return [];
    if (defender.handDefensesUsed >= CONFIG.handDefenseLimit) return [];
  }
  if (CONFIG.handDefenseEmptyOnly && defender.field.length > 0) return [];
  return defender.hand
    .map((card, index) => ({ card, index }))
    .filter(({ card }) => card.type === "ai" && !cannotHandDefend(card) && canDefend(attackCard, card));
}

export function defenseMathText(attackCard: Card, defenseCard: Card, defender: PlayerState | null = null): string {
  if (!attackCard.attribute || !defenseCard.attribute) return "";
  const label = matchupLabel(defenseCard.attribute, attackCard.attribute);
  const defenseValue = defenseCombatValue(attackCard, defenseCard, defender);
  const attackValue = attackCombatValue(attackCard);
  const result = defenseValue > attackValue
    ? "勝ち"
    : defenseValue === attackValue
      ? "相打ち"
      : "不足";
  return `${label} / 防御値${defenseValue} vs 攻撃値${attackValue} / ${result}`;
}

export function needsFirewallFuel(defender: PlayerState, defenseCard: Card, attackCard: Card): boolean {
  return Boolean(defender.memory?.effect === "firewall" && defenseCard.attribute === attackCard.attribute && defender.hand.length > 0);
}

export function discardLowPriorityCards(player: PlayerState, count: number): Card[] {
  const discarded: Card[] = [];
  for (let i = 0; i < count && player.hand.length > 0; i += 1) {
    const discardIndex = lowestPriorityHand(player);
    discarded.push(player.hand.splice(discardIndex, 1)[0]);
  }
  player.discard.push(...discarded);
  return discarded;
}

export function discardFirewallFuel(defender: PlayerState, defenseCard: Card, attackCard: Card): Card | null {
  if (!needsFirewallFuel(defender, defenseCard, attackCard)) return null;
  return discardLowPriorityCards(defender, 1)[0] ?? null;
}

export function removeFieldCard(player: PlayerState, index: number): Card {
  const [card] = player.field.splice(index, 1);
  const nextSpent = new Set<number>();
  player.spentFieldIndexes.forEach((spentIndex) => {
    if (spentIndex < index) nextSpent.add(spentIndex);
    if (spentIndex > index) nextSpent.add(spentIndex - 1);
  });
  player.spentFieldIndexes = nextSpent;
  return card;
}

export function highestPowerSpentAi(player: PlayerState): number | null {
  const options = [...player.spentFieldIndexes]
    .filter((index) => player.field[index])
    .map((index) => ({ card: player.field[index], index }));
  if (options.length === 0) return null;
  options.sort((a, b) => (b.card.power ?? 0) - (a.card.power ?? 0) || b.card.id.localeCompare(a.card.id));
  return options[0].index;
}

export function highestPowerReadyAi(player: PlayerState): number | null {
  const options = player.field
    .map((card, index) => ({ card, index }))
    .filter(({ index }) => !player.spentFieldIndexes.has(index));
  if (options.length === 0) return null;
  options.sort((a, b) => (b.card.power ?? 0) - (a.card.power ?? 0) || b.card.id.localeCompare(a.card.id));
  return options[0].index;
}

export function highestPowerAiInDiscard(player: PlayerState, excludedCard?: Card): number | null {
  const options = player.discard
    .map((card, index) => ({ card, index }))
    .filter(({ card }) => card.type === "ai" && card !== excludedCard);
  if (options.length === 0) return null;
  options.sort((a, b) => (b.card.power ?? 0) - (a.card.power ?? 0) || b.card.id.localeCompare(a.card.id));
  return options[0].index;
}

export function attackableField(player: PlayerState): { card: Card; index: number }[] {
  return player.field
    .map((card, index) => ({ card, index }))
    .filter(({ index }) => !player.spentFieldIndexes.has(index));
}

export function highestPowerField(player: PlayerState): number {
  return attackableField(player)
    .sort((a, b) => (b.card.power ?? 0) - (a.card.power ?? 0) || b.card.id.localeCompare(a.card.id))[0].index;
}

export function cardPriority(card: Card): number {
  return card.type === "ai" ? card.power ?? 0 : 1;
}

export function lowestPriorityHand(player: PlayerState): number {
  return player.hand
    .map((card, index) => ({ card, index }))
    .sort((a, b) => cardPriority(a.card) - cardPriority(b.card) || a.card.id.localeCompare(b.card.id))[0].index;
}

export function commandUsable(game: GameState, command: Card | null | undefined, player: PlayerState, opponent: PlayerState): boolean {
  if (!command || command.type !== "event") return false;
  if (command.effect === "optimize") return player.hand.length > 1;
  if (command.effect === "patch") return highestPowerSpentAi(player) !== null;
  if (command.effect === "disrupt") return highestPowerReadyAi(opponent) !== null;
  if (command.effect === "relearn") return highestPowerAiInDiscard(player) !== null;
  if (command.effect === "sandbox") return sandboxCommandReady(game, player);
  return false;
}

export function sandboxCommandReady(game: GameState, player: PlayerState): boolean {
  return (
    game.actionsRemaining >= 2
    && canActivePlayerAttack(game)
    && player.sandboxShield <= 0
    && player.field.some((card, index) => card.power === 4 && !player.spentFieldIndexes.has(index))
  );
}

export function chooseAiDefense(defender: PlayerState, attackCard: Card): DefenseChoice {
  const fieldOptions = legalFieldDefenders(defender, attackCard);
  const handOptions = legalHandDefenders(defender, attackCard);
  const options = [
    ...fieldOptions.map((option) => ({ ...option, type: "field" as const })),
    ...handOptions.map((option) => ({ ...option, type: "hand" as const })),
  ];
  if (options.length > 0) {
    const best = options.sort((a, b) => (
      (a.card.power ?? 0) - (b.card.power ?? 0)
      || (a.type === "field" ? 0 : 1) - (b.type === "field" ? 0 : 1)
      || a.card.id.localeCompare(b.card.id)
    ))[0];
    return { type: best.type, index: best.index };
  }
  return { type: "none" };
}

export function bestHandAi(game: GameState, player: PlayerState): number | null {
  const aiCards = player.hand
    .map((card, index) => ({ card, index }))
    .filter(({ card }) => card.type === "ai" && playCost(card) <= game.actionsRemaining);
  if (aiCards.length === 0) return null;
  aiCards.sort((a, b) => (b.card.power ?? 0) - (a.card.power ?? 0) || b.card.id.localeCompare(a.card.id));
  return aiCards[0].index;
}

export function bestUpgrade(game: GameState, player: PlayerState): { handIndex: number; fieldIndex: number; target: Card; source: Card } | null {
  const options: { handIndex: number; fieldIndex: number; target: Card; source: Card }[] = [];
  player.hand.forEach((target, handIndex) => {
    if (target.type !== "ai" || upgradeCost(target) > game.actionsRemaining) return;
    player.field.forEach((source, fieldIndex) => {
      if (canUpgrade(source, target)) options.push({ handIndex, fieldIndex, target, source });
    });
  });
  if (options.length === 0) return null;
  options.sort((a, b) => (
    (b.target.power ?? 0) - (a.target.power ?? 0)
    || (a.source.power ?? 0) - (b.source.power ?? 0)
    || b.target.id.localeCompare(a.target.id)
  ));
  return options[0];
}

export function bestMemory(player: PlayerState): number | null {
  if (player.memory) return null;
  const priority: Record<string, number> = { cache: 4, pipeline: 3, firewall: 2 };
  const options = player.hand
    .map((card, index) => ({ card, index }))
    .filter(({ card }) => card.type === "memory");
  if (options.length === 0) return null;
  options.sort((a, b) => (priority[b.card.effect ?? ""] || 0) - (priority[a.card.effect ?? ""] || 0) || b.card.id.localeCompare(a.card.id));
  return options[0].index;
}

export function bestCommand(game: GameState, player: PlayerState, opponent: PlayerState): number | null {
  const options = player.hand
    .map((card, index) => ({ card, index }))
    .filter(({ card }) => card.type === "event" && commandUsable(game, card, player, opponent));
  if (options.length === 0) return null;
  const priority: Record<string, number> = {
    disrupt: 4,
    patch: 3,
    relearn: 2,
    sandbox: 2,
    optimize: 1,
  };
  options.sort((a, b) => (priority[b.card.effect ?? ""] || 0) - (priority[a.card.effect ?? ""] || 0) || b.card.id.localeCompare(a.card.id));
  return options[0].index;
}

export function bestSandboxCommand(game: GameState, player: PlayerState): number | null {
  if (!sandboxCommandReady(game, player)) return null;
  const option = player.hand
    .map((card, index) => ({ card, index }))
    .find(({ card }) => card.type === "event" && card.effect === "sandbox");
  return option ? option.index : null;
}

export function bestDamagingAttacker(attacker: PlayerState, defender: PlayerState): number | null {
  const options = attackableField(attacker)
    .filter(({ card }) => chooseAiDefense(defender, card).type === "none");
  if (options.length === 0) return null;
  options.sort((a, b) => (b.card.power ?? 0) - (a.card.power ?? 0) || b.card.id.localeCompare(a.card.id));
  return options[0].index;
}

export type AiAction =
  | { type: "play"; index: number }
  | { type: "upgrade"; handIndex: number; fieldIndex: number }
  | { type: "memory"; index: number }
  | { type: "attack"; index: number }
  | { type: "command"; index: number }
  | { type: "cycle"; index: number }
  | { type: "end" };

export function chooseAiAction(game: GameState): AiAction {
  const ai = activePlayer(game);
  const human = opponentPlayer(game);
  if (ai.field.length === 0) {
    const index = bestHandAi(game, ai);
    if (index !== null) return { type: "play", index };
  }
  if (canActivePlayerAttack(game)) {
    const sandboxCommand = bestSandboxCommand(game, ai);
    if (sandboxCommand !== null) return { type: "command", index: sandboxCommand };
    const damaging = bestDamagingAttacker(ai, human);
    if (damaging !== null) return { type: "attack", index: damaging };
  }
  if (ai.field.length < CONFIG.fieldLimit) {
    const index = bestHandAi(game, ai);
    if (index !== null) return { type: "play", index };
  }
  const upgrade = bestUpgrade(game, ai);
  if (upgrade !== null) return { type: "upgrade", handIndex: upgrade.handIndex, fieldIndex: upgrade.fieldIndex };
  const memoryIndex = bestMemory(ai);
  if (memoryIndex !== null) return { type: "memory", index: memoryIndex };
  const commandIndex = bestCommand(game, ai, human);
  if (commandIndex !== null) return { type: "command", index: commandIndex };
  if (canActivePlayerAttack(game) && attackableField(ai).length > 0) return { type: "attack", index: highestPowerField(ai) };
  if (ai.hand.length > 0) return { type: "cycle", index: lowestPriorityHand(ai) };
  return { type: "end" };
}

export function checkWinner(game: GameState): void {
  const defeated = game.players.findIndex((player) => player.life <= 0);
  if (defeated >= 0) {
    game.winner = 1 - defeated;
    addLog(game, `${game.players[game.winner].name}の勝利。`);
  }
}

export function checkResourceExhaustion(game: GameState): void {
  if (game.winner !== null || game.draw) return;
  if (game.players.some((player) => player.deck.length > 0 || player.hand.length > 0 || player.field.length > 0)) return;
  finishByLifeJudgement(game, "両者の行動資源が尽きたため");
}

export function checkTurnLimit(game: GameState): void {
  if (game.winner !== null || game.draw || game.turn < CONFIG.maxTurns) return;
  finishByLifeJudgement(game, `${CONFIG.maxTurns}手番に到達したため`);
}

export function finishByLifeJudgement(game: GameState, reason: string): void {
  const [human, ai] = game.players;
  game.actionsRemaining = 0;
  if (human.life === ai.life) {
    game.draw = true;
    addLog(game, `${reason}引き分け。`);
    return;
  }
  game.winner = human.life > ai.life ? 0 : 1;
  addLog(game, `${reason}、ライフ判定で${game.players[game.winner].name}の勝利。`);
}

export function canHumanAct(game: GameState): boolean {
  return (
    game.winner === null
    && !game.draw
    && !game.pendingAttack
    && !game.pendingTarget
    && activePlayer(game).isHuman
    && game.actionsRemaining > 0
  );
}
