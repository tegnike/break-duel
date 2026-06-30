export type Attribute = "火" | "水" | "風" | "土";
export type CardType = "ai" | "event" | "memory";
export type CardStatus = "active" | "inactive";
export type AiProfile = "beginner" | "challenger";
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
  | "draw_on_successful_defense_enters_spent"
  | "charge_pressure"
  | "charge_draw"
  | "charge_ready_ally"
  | "charge_guard";
export type CommandEffect =
  | "optimize"
  | "patch"
  | "disrupt"
  | "relearn"
  | "sandbox"
  | "trinity"
  | "fire_rite"
  | "water_rite"
  | "wind_rite"
  | "earth_rite";
export type MemoryEffect = "firewall" | "cache" | "pipeline" | "accelerator" | "resonator";
export type CardEffect = AiEffect | CommandEffect | MemoryEffect | "";
export type Zone = "hand" | "field" | "memory" | "discard";

export type Card = {
  id: string;
  name: string;
  type: CardType;
  attribute?: Attribute;
  power?: number;
  effect?: CardEffect;
  status: CardStatus;
};

type CardSeed = Omit<Card, "status"> & { status?: CardStatus };

export type PlayerState = {
  name: string;
  deckName: string;
  aiProfile: AiProfile;
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
  acceleratorUsed: boolean;
  chargeUsed: boolean;
  chargeGuardedFieldIndexes: Set<number>;
  sandboxShield: number;
  spentFieldIndexes: Set<number>;
  power3RecoveryDelayedFieldIndexes: Set<number>;
};

export type DuelDeckSource =
  | { kind: "preset"; deckId: DeckId }
  | { kind: "custom"; name: string; cardIds: string[] };

export type Selection = {
  zone: "hand" | "field" | "memory";
  index: number;
  ownerIndex?: number;
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
      reason: "optimize" | "relearn" | "firewall";
      playerIndex: number;
      title: string;
      prompt: string;
      min: number;
      max: number;
      excludeIndexes: number[];
      selectedIndexes: number[];
      sourceIndex?: number;
      fieldIndex?: number;
      targetIndex?: number;
      actionCost?: number;
      actionKind?: "normal" | "attack";
      cancelable?: boolean;
    }
  | {
      kind: "card-select";
      reason: "filter-discard" | "relearn-recover" | "recover-on-play" | "upgrade-source" | "ready-ally" | "spend-enemy" | "block-pressure" | "accelerator-sacrifice" | "charge-guard";
      zone: "hand" | "field" | "discard";
      playerIndex: number;
      title: string;
      prompt: string;
      confirmLabel: string;
      min: number;
      max: number;
      excludeIndexes: number[];
      selectedIndexes: number[];
      discardIndexes?: number[];
      sourceIndex?: number;
      actionCost?: number;
      actionKind?: "normal" | "attack";
      cancelable?: boolean;
    }
  | null;

export type GameState = {
  rng: () => number;
  seed: number;
  players: PlayerState[];
  active: number;
  turn: number;
  actionsRemaining: number;
  chargedActionsRemaining: number;
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
  | { type: "field"; index: number; firewallDiscardIndex?: number | null }
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
  secondPlayerInitialHand: 5,
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
  exactUpgradeStep: false,
  firstPlayerFirstTurnDraw: false,
  secondPlayerFirstTurnDraw: false,
  power1DrawsOnPlay: true,
  power2DefenseBonus: 1,
  largeAiPlayCost: 2,
  largeAiUpgradeCost: null as number | null,
  power3PlayCost: null as number | null,
  power4PlayCost: null as number | null,
  power3EntersSpent: false,
  power3DiscardsOnPlay: false,
  power3CannotHandDefend: false,
  power3CannotFieldDefend: false,
  power3DefenseModifier: 0,
  power3OverheatsAfterAttack: false,
  power3AttackRecoveryDelay: true,
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
  };
  const aiEffects = new Map<string, AiEffect>([
    ["AI-FIRE-1B", "block_pressure"],
    ["AI-FIRE-2", "attack_plus_1"],
    ["AI-FIRE-2B", "hand_defense_pierce"],
    ["AI-FIRE-3", "attack_plus_1"],
    ["AI-FIRE-3B", "reckless_attack_plus_1"],
    ["AI-FIRE-4", "draw_two_after_overheat"],
    ["AI-FIRE-4B", "low_life_no_hand_defense_self_damage"],
    ["AI-FIRE-1C", "charge_pressure"],
    ["AI-WATER-1", "draw_on_play"],
    ["AI-WATER-1B", "draw_on_play_cannot_hand_defend"],
    ["AI-WATER-2", "filter_on_play"],
    ["AI-WATER-2B", "draw_on_blocked_attack_cannot_hand_defend"],
    ["AI-WATER-3", "draw_on_play"],
    ["AI-WATER-3B", "filter_on_play"],
    ["AI-WATER-4B", "draw_two_after_overheat_opponent_draw"],
    ["AI-WATER-1C", "charge_draw"],
    ["AI-WIND-1", "no_spend_after_attack"],
    ["AI-WIND-1B", "no_spend_after_attack"],
    ["AI-WIND-2B", "spend_enemy_on_play"],
    ["AI-WIND-3", "spend_enemy_on_play"],
    ["AI-WIND-3B", "ready_ally_on_play_draw"],
    ["AI-WIND-4B", "return_after_overheat_cannot_hand_defend"],
    ["AI-WIND-2C", "charge_ready_ally"],
    ["AI-EARTH-1B", "draw_on_successful_defense"],
    ["AI-EARTH-2", "defense_plus_1"],
    ["AI-EARTH-3B", "recover_ai_on_play"],
    ["AI-EARTH-4", "recover_ai_on_play"],
    ["AI-EARTH-4B", "draw_on_successful_defense_enters_spent"],
    ["AI-EARTH-2C", "charge_guard"],
  ]);
  const aiCards: CardSeed[] = (Object.entries(ATTRIBUTES) as [Attribute, { code: string; color: string }][])
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
  const chargeCycleCards: CardSeed[] = [
    { id: "AI-FIRE-1C", name: monsterNames["AI-FIRE-1C"], type: "ai", attribute: "火", power: 1, effect: "charge_pressure" },
    { id: "AI-WATER-1C", name: monsterNames["AI-WATER-1C"], type: "ai", attribute: "水", power: 1, effect: "charge_draw" },
    { id: "AI-WIND-2C", name: monsterNames["AI-WIND-2C"], type: "ai", attribute: "風", power: 2, effect: "charge_ready_ally" },
    { id: "AI-EARTH-2C", name: monsterNames["AI-EARTH-2C"], type: "ai", attribute: "土", power: 2, effect: "charge_guard" },
  ];
  const cards: CardSeed[] = [
    ...aiCards,
    ...chargeCycleCards,
    { id: "CMD-OPTIMIZE", name: "陣形リライト", type: "event", effect: "optimize" },
    { id: "CMD-PATCH", name: "若葉の息吹", type: "event", effect: "patch", status: "inactive" },
    { id: "CMD-DISRUPT", name: "黒蔦の足止め", type: "event", effect: "disrupt" },
    { id: "CMD-RELEARN", name: "幻獣回帰の巻", type: "event", effect: "relearn" },
    { id: "CMD-SANDBOX", name: "蒼殻バリア", type: "event", effect: "sandbox" },
    { id: "CMD-TRINITY", name: "三相崩壊術", type: "event", effect: "trinity" },
    { id: "CMD-FIRE-RITE", name: "紅蓮圧壊術", type: "event", effect: "fire_rite" },
    { id: "CMD-WATER-RITE", name: "清流再編術", type: "event", effect: "water_rite" },
    { id: "CMD-WIND-RITE", name: "旋風転身術", type: "event", effect: "wind_rite" },
    { id: "CMD-EARTH-RITE", name: "岩壁継承術", type: "event", effect: "earth_rite" },
    { id: "MEM-FIREWALL", name: "竜盾の紋章", type: "memory", effect: "firewall" },
    { id: "MEM-CACHE", name: "灯火の旅嚢", type: "memory", effect: "cache" },
    { id: "MEM-PIPELINE", name: "星泉の導脈", type: "memory", effect: "pipeline" },
    { id: "MEM-ACCELERATOR", name: "刻火の加速炉", type: "memory", effect: "accelerator" },
    { id: "MEM-RESONATOR", name: "蓄光の祭壇", type: "memory", effect: "resonator" },
  ];
  return cards.map((card) => ({ ...card, status: card.status ?? "active" }));
}

export const CARD_BY_ID = new Map(cardPool().map((card) => [card.id, card]));

export function isCardActive(card: Card): boolean {
  return card.status === "active";
}

export function activeCardPool(): Card[] {
  return cardPool().filter(isCardActive);
}

export const DECKS = {
  break: {
    name: "紅蓮突破デッキ",
    description: "火と水を混ぜた攻め寄りの基本デッキ。突破力と手札補充を両立します。",
    cards: [
      "AI-FIRE-1B",
      "AI-FIRE-1C",
      "AI-FIRE-2",
      "AI-FIRE-2B",
      "AI-FIRE-2B",
      "AI-FIRE-3B",
      "AI-FIRE-4",
      "AI-FIRE-4B",
      "AI-FIRE-1",
      "AI-WATER-1C",
      "AI-WATER-1",
      "AI-WATER-2",
      "AI-WATER-2B",
      "AI-WATER-4B",
      "CMD-DISRUPT",
      "CMD-OPTIMIZE",
      "CMD-FIRE-RITE",
      "CMD-FIRE-RITE",
      "MEM-CACHE",
      "MEM-ACCELERATOR",
    ],
  },
  control: {
    name: "大地守護デッキ",
    description: "土と風で守りながら盤面を整える基本デッキ。粘り強く反撃します。",
    cards: [
      "AI-EARTH-1",
      "AI-EARTH-1B",
      "AI-EARTH-2",
      "AI-EARTH-2C",
      "AI-EARTH-2B",
      "AI-WIND-1",
      "AI-WIND-1B",
      "AI-WIND-2",
      "AI-WIND-2C",
      "AI-WIND-2B",
      "AI-WIND-3",
      "AI-WIND-3B",
      "AI-EARTH-4",
      "AI-EARTH-4B",
      "CMD-DISRUPT",
      "CMD-RELEARN",
      "CMD-SANDBOX",
      "CMD-EARTH-RITE",
      "MEM-FIREWALL",
      "MEM-PIPELINE",
    ],
  },
  fire: {
    name: "火単色デッキ",
    description: "攻撃強化と防御妨害で早くライフを詰める速攻型。短期決戦が得意です。",
    cards: [
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
      "AI-FIRE-1",
      "AI-FIRE-1C",
      "CMD-DISRUPT",
      "CMD-TRINITY",
      "CMD-FIRE-RITE",
      "CMD-FIRE-RITE",
      "MEM-CACHE",
      "MEM-ACCELERATOR",
    ],
  },
  water: {
    name: "水単色デッキ",
    description: "ドローと手札調整で必要札を探し続ける安定型。息切れしにくい構成です。",
    cards: [
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
      "AI-WATER-1B",
      "AI-WATER-1C",
      "CMD-DISRUPT",
      "CMD-SANDBOX",
      "CMD-WATER-RITE",
      "CMD-TRINITY",
      "MEM-FIREWALL",
      "MEM-CACHE",
    ],
  },
  wind: {
    name: "風単色デッキ",
    description: "相手を消耗させ、自分の召喚獣を再行動させるテンポ型。盤面差で押します。",
    cards: [
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
      "AI-WIND-2",
      "AI-WIND-2C",
      "AI-WIND-2C",
      "CMD-DISRUPT",
      "CMD-SANDBOX",
      "CMD-WIND-RITE",
      "CMD-WIND-RITE",
      "MEM-FIREWALL",
      "MEM-CACHE",
    ],
  },
  earth: {
    name: "土単色デッキ",
    description: "高い防御値と回収効果で耐える持久型。攻撃を受け止めて勝ち筋を作ります。",
    cards: [
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
      "AI-EARTH-2C",
      "CMD-SANDBOX",
      "CMD-DISRUPT",
      "CMD-EARTH-RITE",
      "CMD-TRINITY",
      "MEM-CACHE",
      "MEM-PIPELINE",
    ],
  },
  apex: {
    name: "覇王結束デッキ",
    description: "挑戦者CPUリーグで選ばれた最強候補。火力、防御貫通、チャージ補助をまとめて押し付けます。",
    cards: [
      "AI-FIRE-2",
      "AI-WIND-3",
      "AI-WIND-3B",
      "AI-EARTH-2",
      "AI-WATER-2",
      "AI-FIRE-4",
      "AI-FIRE-3",
      "AI-EARTH-2C",
      "AI-WIND-2",
      "AI-FIRE-2B",
      "AI-WATER-1",
      "AI-WATER-2B",
      "AI-WATER-2B",
      "AI-FIRE-1C",
      "CMD-SANDBOX",
      "CMD-WATER-RITE",
      "CMD-WIND-RITE",
      "CMD-DISRUPT",
      "MEM-FIREWALL",
      "MEM-RESONATOR",
    ],
  },
} as const;

export type DeckId = keyof typeof DECKS;

export const BATTLE_DECK_IDS = ["break", "control", "fire", "water", "wind", "earth", "apex"] as const satisfies readonly DeckId[];

export function cloneCard(card: Card): Card {
  return { ...card };
}

export function shuffle(cards: Card[], rng: () => number): void {
  for (let i = cards.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
}

export function makeDeck(deckId: DeckId): Card[] {
  return DECKS[deckId].cards.map((cardId) => {
    const card = CARD_BY_ID.get(cardId);
    if (!card || !isCardActive(card)) throw new Error(`Inactive or unknown preset card id: ${cardId}`);
    return cloneCard(card);
  });
}

export function makeCustomDeck(cardIds: string[]): Card[] {
  return cardIds.map((cardId) => {
    const card = CARD_BY_ID.get(cardId);
    if (!card) throw new Error(`Unknown card id: ${cardId}`);
    if (!isCardActive(card)) throw new Error(`Inactive card id: ${cardId}`);
    return cloneCard(card);
  });
}

export function randomStarterDeckId(rng: () => number, excludeDeckId?: DeckId): DeckId {
  const candidates = BATTLE_DECK_IDS.filter((deckId) => deckId !== excludeDeckId);
  const pool = candidates.length > 0 ? candidates : BATTLE_DECK_IDS;
  const index = Math.floor(rng() * pool.length);
  return pool[index];
}

export function makePlayer(name: string, isHuman: boolean, deckId: DeckId, rng: () => number, aiProfile: AiProfile = "challenger"): PlayerState {
  const deck = makeDeck(deckId);
  shuffle(deck, rng);
  return {
    name,
    deckName: DECKS[deckId].name,
    aiProfile,
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
    acceleratorUsed: false,
    chargeUsed: false,
    chargeGuardedFieldIndexes: new Set(),
    sandboxShield: 0,
    spentFieldIndexes: new Set<number>(),
    power3RecoveryDelayedFieldIndexes: new Set<number>(),
  };
}

export function makeCustomDeckPlayer(name: string, isHuman: boolean, deckName: string, cardIds: string[], rng: () => number, aiProfile: AiProfile = "challenger"): PlayerState {
  const deck = makeCustomDeck(cardIds);
  shuffle(deck, rng);
  return {
    name,
    deckName,
    aiProfile,
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
    acceleratorUsed: false,
    chargeUsed: false,
    chargeGuardedFieldIndexes: new Set(),
    sandboxShield: 0,
    spentFieldIndexes: new Set<number>(),
    power3RecoveryDelayedFieldIndexes: new Set<number>(),
  };
}

function makePlayerFromDeckSource(name: string, isHuman: boolean, source: DuelDeckSource, rng: () => number, aiProfile: AiProfile = "challenger"): PlayerState {
  if (source.kind === "preset") return makePlayer(name, isHuman, source.deckId, rng, aiProfile);
  return makeCustomDeckPlayer(name, isHuman, source.name, source.cardIds, rng, aiProfile);
}

function deckSourceName(source: DuelDeckSource): string {
  if (source.kind === "preset") return DECKS[source.deckId].name;
  return source.name;
}

function normalizeDeckSource(source: DeckId | DuelDeckSource): DuelDeckSource {
  if (typeof source === "string") return { kind: "preset", deckId: source };
  return source;
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
      power3RecoveryDelayedFieldIndexes: new Set(player.power3RecoveryDelayedFieldIndexes),
      chargeGuardedFieldIndexes: new Set(player.chargeGuardedFieldIndexes),
    })),
    selected: game.selected ? { ...game.selected } : null,
    pendingAttack: game.pendingAttack ? { ...game.pendingAttack } : null,
    pendingTarget: game.pendingTarget
      ? { ...game.pendingTarget, selectedIndexes: "selectedIndexes" in game.pendingTarget ? [...game.pendingTarget.selectedIndexes] : undefined } as PendingTarget
      : null,
    log: [...game.log],
  };
}

export function createGame(
  seed: number,
  playerDeck: DeckId | DuelDeckSource = "fire",
  opponentDeck?: DeckId | DuelDeckSource,
  opponentAiProfile: AiProfile = "challenger",
): GameState {
  const rng = makeRng(seed);
  const playerSource = normalizeDeckSource(playerDeck);
  const opponentSource = opponentDeck
    ? normalizeDeckSource(opponentDeck)
    : { kind: "preset" as const, deckId: randomStarterDeckId(rng, playerSource.kind === "preset" ? playerSource.deckId : undefined) };
  const game: GameState = {
    rng,
    seed,
    players: [
      makePlayerFromDeckSource("あなた", true, playerSource, rng, "challenger"),
      makePlayerFromDeckSource("ライバル", false, opponentSource, rng, opponentAiProfile),
    ],
    active: 0,
    turn: 0,
    actionsRemaining: 0,
    chargedActionsRemaining: 0,
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
  addLog(game, `Seed ${seed} で対戦開始。あなた: ${deckSourceName(playerSource)} / ライバル: ${deckSourceName(opponentSource)}。`);
  startTurn(game);
  return game;
}

export function createGameWithCustomPlayerDeck(seed: number, playerDeck: { name: string; cardIds: string[] }, opponentDeckId?: DeckId, opponentAiProfile: AiProfile = "challenger"): GameState {
  return createGame(seed, { kind: "custom", name: playerDeck.name, cardIds: playerDeck.cardIds }, opponentDeckId, opponentAiProfile);
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
  return drawCards(player, count).length;
}

export function drawCards(player: PlayerState, count: number): Card[] {
  const drawnCards: Card[] = [];
  for (let i = 0; i < count; i += 1) {
    if (player.deck.length === 0) break;
    const card = player.deck.pop()!;
    player.hand.push(card);
    drawnCards.push(card);
    player.cardsDrawn += 1;
  }
  return drawnCards;
}

export function cardNameList(cards: Card[]): string {
  return cards.map((card) => card.name).join("、");
}

export function visibleDrawText(player: PlayerState, drawnCards: Card[]): string {
  const count = drawnCards.length;
  if (count <= 0) return "山札からカードを0枚引いた";
  if (!player.isHuman) return `山札からカードを${count}枚引いた`;
  return `山札からカードを${count}枚引いた（${cardNameList(drawnCards)}）`;
}

export function startTurn(game: GameState): void {
  game.turn += 1;
  game.actionsRemaining = actionsForTurn(game);
  game.chargedActionsRemaining = 0;
  game.players.forEach((player) => {
    player.handDefensesUsed = 0;
  });
  const player = activePlayer(game);
  readyFieldForTurn(player);
  player.pipelineUsed = false;
  player.acceleratorUsed = false;
  player.chargeUsed = false;
  player.chargeGuardedFieldIndexes.clear();
  player.sandboxShield = 0;
  player.turnsStarted += 1;
  const handCountAtTurnStart = player.hand.length;
  const drawnCards = shouldDrawForTurn(game) ? drawCards(player, 1) : [];
  const memoryDrawnCards = applyTurnStartMemory(player, handCountAtTurnStart);
  const drawText = drawnCards.length > 0 ? `${visibleDrawText(player, drawnCards)}。` : "ドローなし。";
  const memoryText = memoryDrawnCards.length > 0 ? ` ${player.memory!.name}で追加${visibleDrawText(player, memoryDrawnCards)}。` : "";
  addLog(game, `${player.name}のターン。${drawText}${memoryText}`);
  checkResourceExhaustion(game);
  game.selected = null;
}

export function shouldDrawForTurn(game: GameState): boolean {
  if (game.turn === 2 && game.active === 1 && !CONFIG.secondPlayerFirstTurnDraw) return false;
  return !(game.turn === 1 && game.active === 0 && !CONFIG.firstPlayerFirstTurnDraw);
}

export function readyFieldForTurn(player: PlayerState): void {
  const delayed = CONFIG.power3AttackRecoveryDelay
    ? new Set(player.power3RecoveryDelayedFieldIndexes)
    : new Set<number>();
  player.spentFieldIndexes.clear();
  delayed.forEach((index) => {
    if (player.field[index]) player.spentFieldIndexes.add(index);
  });
  player.power3RecoveryDelayedFieldIndexes.clear();
}

export function canActivePlayerAttack(game: GameState): boolean {
  const player = activePlayer(game);
  return (
    game.actionsRemaining > game.chargedActionsRemaining
    && !player.chargeUsed
    && !(game.turn === 1 && game.active === 0 && !CONFIG.firstPlayerFirstTurnCanAttack)
  );
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

export function applyTurnStartMemory(player: PlayerState, handCountAtTurnStart = player.hand.length): Card[] {
  if (player.memory?.effect !== "cache") return [];
  if (handCountAtTurnStart > 2) return [];
  return drawCards(player, 1);
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
  game.chargedActionsRemaining = 0;
  game.active = 1 - game.active;
  checkResourceExhaustion(game);
  checkTurnLimit(game);
  if (game.winner === null && !game.draw) startTurn(game);
}

export function useAction(game: GameState, cost = 1, kind: "normal" | "attack" = "normal"): void {
  if (kind !== "attack") {
    game.chargedActionsRemaining = Math.max(0, game.chargedActionsRemaining - Math.min(cost, game.chargedActionsRemaining));
  }
  game.actionsRemaining -= cost;
  const player = activePlayer(game);
  if (game.actionsRemaining <= 0 && !player.isHuman && !game.pendingAttack && game.winner === null && !game.draw && !canUseCharge(game, player)) {
    finishTurn(game, false);
  }
}

export function playCost(card: Card | null | undefined): number {
  if (!card) return 99;
  if (card.type === "event" || card.type === "memory") return 1;
  if (card.power === 3 && CONFIG.power3PlayCost !== null) return CONFIG.power3PlayCost;
  if (card.power === 4 && CONFIG.power4PlayCost !== null) return CONFIG.power4PlayCost;
  return (card.power ?? 0) >= 3 ? CONFIG.largeAiPlayCost : 1;
}

export function upgradeCost(card: Card): number {
  if (card.type === "ai" && (card.power ?? 0) >= 3 && CONFIG.largeAiUpgradeCost !== null) {
    return CONFIG.largeAiUpgradeCost;
  }
  return Math.max(1, playCost(card) - 1);
}

export function canUpgrade(source: Card | undefined, target: Card | undefined): boolean {
  if (!(
    source?.type === "ai"
      && target?.type === "ai"
      && source.attribute === target.attribute
      && (source.power ?? 0) < (target.power ?? 0)
  )) {
    return false;
  }
  if (CONFIG.exactUpgradeStep) return target.power === (source.power ?? 0) + 1;
  return true;
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
  if (card.effect === "reckless_attack_plus_1") return "攻撃値 +1。手札防御に使えない";
  if (card.effect === "draw_after_overheat") return "攻撃後退場時、山札からカードを1枚引く";
  if (card.effect === "draw_two_after_overheat") return "攻撃後退場時、山札からカードを2枚引く";
  if (card.effect === "draw_two_after_overheat_opponent_draw") return "攻撃後退場時、山札からカードを2枚引く。登場時、相手は山札からカードを1枚引く";
  if (card.effect === "draw_on_play") return "登場時、山札からカードを1枚引く";
  if (card.effect === "draw_on_play_cannot_hand_defend") return "登場時、山札からカードを1枚引く。手札防御に使えない";
  if (card.effect === "filter_on_play") return "登場時、山札からカードを2枚引いて1枚捨てる";
  if (card.effect === "no_spend_after_attack") return "攻撃しても消耗しない";
  if (card.effect === "spend_enemy_on_play") return "登場時、相手の未消耗召喚獣1体を消耗";
  if (card.effect === "spend_enemy_on_play_enters_spent") return "登場時、相手の未消耗召喚獣1体を消耗。自身も消耗で出る";
  if (card.effect === "defense_plus_1") return "場防御時、防御値 +1";
  if (card.effect === "defense_plus_1_enters_spent") return "場防御時、防御値 +1。消耗で出る";
  if (card.effect === "recover_ai_on_play") return "登場時、手札1枚以下ならトラッシュの召喚獣1枚を回収";
  if (card.effect === "block_pressure") return "攻撃が防御された時、相手は手札1枚を捨てる";
  if (card.effect === "hand_defense_pierce") return "手札防御されても1ダメージ";
  if (card.effect === "low_life_no_hand_defense") return "相手ライフ2以下なら手札防御不可";
  if (card.effect === "low_life_no_hand_defense_self_damage") return "相手ライフ2以下なら手札防御不可。登場時、自分に1ダメージ";
  if (card.effect === "draw_on_blocked_attack") return "攻撃が防御された時、山札からカードを1枚引く";
  if (card.effect === "draw_on_blocked_attack_cannot_hand_defend") return "攻撃が防御された時、山札からカードを1枚引く。手札防御に使えない";
  if (card.effect === "ready_ally_on_play") return "登場時、自分の消耗召喚獣1体を回復";
  if (card.effect === "ready_ally_on_play_draw") return "登場時、山札からカードを1枚引き、自分の消耗召喚獣1体を回復";
  if (card.effect === "return_after_overheat") return "攻撃後退場時、トラッシュではなく手札に戻る";
  if (card.effect === "return_after_overheat_cannot_hand_defend") return "攻撃後退場時、手札に戻る。消耗で出る。手札防御に使えない";
  if (card.effect === "draw_on_successful_defense") return "場防御成功時、山札からカードを1枚引く";
  if (card.effect === "draw_on_successful_defense_enters_spent") return "場防御成功時、山札からカードを1枚引く。消耗で出る";
  if (card.effect === "charge_pressure") return "このカードをチャージした時、相手の手札が3枚以上なら1枚トラッシュ";
  if (card.effect === "charge_draw") return "このカードをチャージした時、山札からカードを1枚引く";
  if (card.effect === "charge_ready_ally") return "このカードをチャージした時、自分の消耗召喚獣1体を回復";
  if (card.effect === "charge_guard") return "このカードをチャージした時、場の召喚獣を1体選び、その召喚獣は次の自分ターンまで場防御値 +1";
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

export function hasChargeEffect(card: Card): boolean {
  return card.type === "ai" && (
    card.effect === "charge_pressure"
    || card.effect === "charge_draw"
    || card.effect === "charge_ready_ally"
    || card.effect === "charge_guard"
  );
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

type DefenseOptions = { firewallPaid?: boolean; fieldDefense?: boolean; fieldIndex?: number };

export function defensePowerBonus(card: Card, defender: PlayerState | null = null, attackCard: Card | null = null, options: DefenseOptions = {}): number {
  const fieldDefense = options.fieldDefense ?? true;
  let bonus = fieldDefense && (
    card.effect === "defense_plus_1"
    || card.effect === "defense_plus_1_enters_spent"
  ) ? CONFIG.power2DefenseBonus : 0;
  if (card.power === 3) {
    bonus += CONFIG.power3DefenseModifier;
  }
  if (
    defender?.memory?.effect === "firewall"
    && options.firewallPaid
    && attackCard
    && card.attribute !== attackCard.attribute
  ) {
    bonus += 1;
  }
  if (
    fieldDefense
    && typeof options.fieldIndex === "number"
    && defender?.chargeGuardedFieldIndexes.has(options.fieldIndex)
  ) {
    bonus += 1;
  }
  return bonus;
}

export function defenseCombatValue(attackCard: Card, defenseCard: Card, defender: PlayerState | null = null, options: DefenseOptions = {}): number {
  if (!attackCard.attribute || !defenseCard.attribute) return 0;
  return (defenseCard.power ?? 0)
    + defensePowerBonus(defenseCard, defender, attackCard, options)
    + matchupModifier(defenseCard.attribute, attackCard.attribute);
}

export function canDefend(attackCard: Card, defenseCard: Card, defender: PlayerState | null = null, options: DefenseOptions = {}): boolean {
  return defenseCombatValue(attackCard, defenseCard, defender, options) >= attackCombatValue(attackCard);
}

export function canUseFirewall(defender: PlayerState, defenseCard: Card, attackCard: Card): boolean {
  return Boolean(
    defender.memory?.effect === "firewall"
      && defenseCard.attribute !== attackCard.attribute
      && defender.hand.length > 0,
  );
}

export function canDefendWithOptionalFirewall(attackCard: Card, defenseCard: Card, defender: PlayerState, fieldIndex?: number): boolean {
  return canDefend(attackCard, defenseCard, defender, { fieldIndex })
    || (
      canUseFirewall(defender, defenseCard, attackCard)
      && defenseCombatValue(attackCard, defenseCard, defender, { firewallPaid: true, fieldIndex }) >= attackCombatValue(attackCard)
    );
}

export function legalFieldDefenders(defender: PlayerState, attackCard: Card): { card: Card; index: number }[] {
  return defender.field
    .map((card, index) => ({ card, index }))
    .filter(({ card, index }) => !(
      CONFIG.power3CannotFieldDefend && card.power === 3
    ) && (CONFIG.exhaustedCanDefend || !defender.spentFieldIndexes.has(index)) && canDefendWithOptionalFirewall(attackCard, card, defender, index));
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
    .filter(({ card }) => card.type === "ai"
      && !cannotHandDefend(card)
      && !(CONFIG.power3CannotHandDefend && card.power === 3)
      && canDefend(attackCard, card, defender, { fieldDefense: false }));
}

export function defenseMathText(attackCard: Card, defenseCard: Card, defender: PlayerState | null = null, options: DefenseOptions = {}): string {
  if (!attackCard.attribute || !defenseCard.attribute) return "";
  const label = matchupLabel(defenseCard.attribute, attackCard.attribute);
  const defenseValue = defenseCombatValue(attackCard, defenseCard, defender, options);
  const attackValue = attackCombatValue(attackCard);
  const result = defenseValue > attackValue
    ? "勝ち"
    : defenseValue === attackValue
      ? "相打ち"
      : "不足";
  return `${label} / 防御値${defenseValue} vs 攻撃値${attackValue} / ${result}`;
}

export function needsFirewallFuel(defender: PlayerState, defenseCard: Card, attackCard: Card, fieldIndex?: number): boolean {
  if (!canUseFirewall(defender, defenseCard, attackCard)) return false;
  const baseValue = defenseCombatValue(attackCard, defenseCard, defender, { fieldIndex });
  const paidValue = defenseCombatValue(attackCard, defenseCard, defender, { firewallPaid: true, fieldIndex });
  const attackValue = attackCombatValue(attackCard);
  return baseValue < attackValue || (baseValue === attackValue && paidValue > attackValue);
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

export function discardFirewallFuel(defender: PlayerState, defenseCard: Card, attackCard: Card, fieldIndex?: number): Card | null {
  if (!needsFirewallFuel(defender, defenseCard, attackCard, fieldIndex)) return null;
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
  const nextPower3Delayed = new Set<number>();
  player.power3RecoveryDelayedFieldIndexes.forEach((delayedIndex) => {
    if (delayedIndex < index) nextPower3Delayed.add(delayedIndex);
    if (delayedIndex > index) nextPower3Delayed.add(delayedIndex - 1);
  });
  player.power3RecoveryDelayedFieldIndexes = nextPower3Delayed;
  const nextChargeGuarded = new Set<number>();
  player.chargeGuardedFieldIndexes.forEach((guardedIndex) => {
    if (guardedIndex < index) nextChargeGuarded.add(guardedIndex);
    if (guardedIndex > index) nextChargeGuarded.add(guardedIndex - 1);
  });
  player.chargeGuardedFieldIndexes = nextChargeGuarded;
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

export function highestPowerFieldAi(player: PlayerState): number | null {
  const options = player.field.map((card, index) => ({ card, index }));
  if (options.length === 0) return null;
  options.sort((a, b) => (b.card.power ?? 0) - (a.card.power ?? 0) || b.card.id.localeCompare(a.card.id));
  return options[0].index;
}

export function highestPowerSpentAiByAttribute(player: PlayerState, attribute: Attribute): number | null {
  const options = [...player.spentFieldIndexes]
    .filter((index) => player.field[index]?.attribute === attribute)
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

export function hasAttributeAi(player: PlayerState, attribute: Attribute): boolean {
  return player.field.some((card) => card.attribute === attribute);
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
  if (command.effect === "relearn") return player.hand.length > 1 && highestPowerAiInDiscard(player) !== null;
  if (command.effect === "sandbox") return sandboxCommandReady(game, player);
  if (command.effect === "trinity") return player.field.length >= CONFIG.fieldLimit;
  if (command.effect === "fire_rite") return hasAttributeAi(player, "火");
  if (command.effect === "water_rite") return hasAttributeAi(player, "水") && player.deck.length > 0;
  if (command.effect === "wind_rite") {
    return hasAttributeAi(player, "風") && (
      highestPowerReadyAi(opponent) !== null
      || highestPowerSpentAiByAttribute(player, "風") !== null
    );
  }
  if (command.effect === "earth_rite") {
    return hasAttributeAi(player, "土") && highestPowerAiInDiscard(player) !== null;
  }
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

export function canUseAcceleratorMemory(game: GameState, player: PlayerState): boolean {
  return Boolean(
    player.memory?.effect === "accelerator"
      && !player.acceleratorUsed
      && player.field.length > 0
      && game.actionsRemaining > 0
      && game.actionsRemaining < 3,
  );
}

export function canUseCharge(game: GameState, player: PlayerState): boolean {
  return Boolean(
    game.winner === null
      && !game.draw
      && !game.pendingAttack
      && !game.pendingTarget
      && activePlayer(game) === player
      && !player.chargeUsed
      && player.hand.some(canChargeCard)
      && game.actionsRemaining < 3,
  );
}

export function canChargeCard(card: Card | null | undefined): boolean {
  return Boolean(card && (card.type !== "ai" || (card.power ?? 0) <= 2));
}

export function acceleratorSacrificeTarget(player: PlayerState): number | null {
  if (player.field.length === 0) return null;
  const options = player.field.map((card, index) => ({ card, index }));
  options.sort((a, b) => cardPriority(a.card) - cardPriority(b.card) || a.card.id.localeCompare(b.card.id));
  return options[0].index;
}

export function chooseAiDefense(defender: PlayerState, attackCard: Card, profile: AiProfile = defender.aiProfile): DefenseChoice {
  if (profile === "beginner") return { type: "none" };
  const fieldOptions = legalFieldDefenders(defender, attackCard);
  const handOptions = legalHandDefenders(defender, attackCard);
  if (piercesHandDefense(attackCard) && fieldOptions.length > 0) {
    const best = fieldOptions.sort((a, b) => (
      (a.card.power ?? 0) - (b.card.power ?? 0)
      || a.card.id.localeCompare(b.card.id)
    ))[0];
    return { type: "field", index: best.index };
  }
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
  const priority: Record<string, number> = { cache: 4, resonator: 4, pipeline: 3, accelerator: 3, firewall: 2 };
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
    trinity: 5,
    fire_rite: 4,
    water_rite: 4,
    wind_rite: 4,
    earth_rite: 4,
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
  | { type: "memory-effect"; fieldIndex: number }
  | { type: "attack"; index: number }
  | { type: "command"; index: number }
  | { type: "charge"; index: number }
  | { type: "end" };

export function chooseAiAction(game: GameState, profile: AiProfile = activePlayer(game).aiProfile): AiAction {
  if (profile === "beginner") return chooseBeginnerAiAction(game);
  return chooseChallengerAiAction(game);
}

function chooseClassicAiAction(game: GameState): AiAction {
  const ai = activePlayer(game);
  const human = opponentPlayer(game);
  const chargeIndex = bestChargeFuel(game, ai);
  if (chargeIndex !== null) return { type: "charge", index: chargeIndex };
  if (game.actionsRemaining <= 0) return { type: "end" };
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
  if (
    canUseAcceleratorMemory(game, ai)
    && ai.hand.some((card) => card.type === "ai" && playCost(card) === game.actionsRemaining + 1)
  ) {
    const target = acceleratorSacrificeTarget(ai);
    if (target !== null) return { type: "memory-effect", fieldIndex: target };
  }
  const memoryIndex = bestMemory(ai);
  if (memoryIndex !== null) return { type: "memory", index: memoryIndex };
  const commandIndex = bestCommand(game, ai, human);
  if (commandIndex !== null) return { type: "command", index: commandIndex };
  if (canActivePlayerAttack(game) && attackableField(ai).length > 0) return { type: "attack", index: highestPowerField(ai) };
  return { type: "end" };
}

function chooseBeginnerAiAction(game: GameState): AiAction {
  const ai = activePlayer(game);
  if (game.actionsRemaining <= 0) return { type: "end" };
  if (ai.field.length === 0) {
    const options = ai.hand
      .map((card, index) => ({ card, index }))
      .filter(({ card }) => card.type === "ai" && playCost(card) <= game.actionsRemaining)
      .sort((a, b) => (a.card.power ?? 0) - (b.card.power ?? 0) || a.card.id.localeCompare(b.card.id));
    if (options[0]) return { type: "play", index: options[0].index };
  }
  if (!ai.memory) {
    const memory = ai.hand
      .map((card, index) => ({ card, index }))
      .filter(({ card }) => card.type === "memory")
      .sort((a, b) => aiCardValue(a.card) - aiCardValue(b.card) || a.card.id.localeCompare(b.card.id))[0];
    if (memory) return { type: "memory", index: memory.index };
  }
  return { type: "end" };
}

function chooseChallengerAiAction(game: GameState): AiAction {
  const classic = chooseClassicAiAction(game);
  const options = legalAiActions(game);
  if (options.length === 0) return { type: "end" };
  options.sort((a, b) => (
    scoreAiAction(game, b, classic) - scoreAiAction(game, a, classic)
    || aiActionTieBreak(b) - aiActionTieBreak(a)
  ));
  return options[0];
}

function legalAiActions(game: GameState): AiAction[] {
  const ai = activePlayer(game);
  const human = opponentPlayer(game);
  const actions: AiAction[] = [];
  if (canUseCharge(game, ai)) {
    ai.hand.forEach((card, index) => {
      if (canChargeCard(card)) actions.push({ type: "charge", index });
    });
  }
  if (game.actionsRemaining > 0) {
    if (ai.field.length < CONFIG.fieldLimit) {
      ai.hand.forEach((card, index) => {
        if (card.type === "ai" && playCost(card) <= game.actionsRemaining) actions.push({ type: "play", index });
      });
    }
    ai.hand.forEach((card, index) => {
      if (card.type === "memory") actions.push({ type: "memory", index });
      if (card.type === "event" && commandUsable(game, card, ai, human)) actions.push({ type: "command", index });
    });
    if (canUseAcceleratorMemory(game, ai)) {
      ai.field.forEach((_, fieldIndex) => actions.push({ type: "memory-effect", fieldIndex }));
    }
    ai.hand.forEach((target, handIndex) => {
      if (target.type !== "ai" || upgradeCost(target) > game.actionsRemaining) return;
      ai.field.forEach((source, fieldIndex) => {
        if (canUpgrade(source, target)) actions.push({ type: "upgrade", handIndex, fieldIndex });
      });
    });
    if (canActivePlayerAttack(game)) {
      attackableField(ai).forEach(({ index }) => actions.push({ type: "attack", index }));
    }
  }
  actions.push({ type: "end" });
  return actions;
}

const CHALLENGER_WEIGHTS = {
  damage: 160,
  lethal: 310,
  attackPower: 13,
  badAttack: -73,
  tradeAttack: 42,
  handTradeAttack: 40,
  blockedValue: 25,
  playAi: 51,
  emptyFieldPlay: 51,
  upgrade: 78,
  memory: 51,
  command: 76,
  charge: 38,
  tempoAction: 16,
  fieldPresence: 19,
  handCard: 12,
  opponentReady: 1,
  lowLifePressure: 28,
  classicPrior: 60,
};

function scoreAiAction(game: GameState, action: AiAction, classic: AiAction): number {
  const ai = activePlayer(game);
  const opponent = opponentPlayer(game);
  let score = boardAiScore(ai, opponent);
  if (sameAiAction(action, classic)) score += CHALLENGER_WEIGHTS.classicPrior;
  if (action.type === "end") return score - 40 + (game.actionsRemaining <= 0 ? 15 : -55);
  score += CHALLENGER_WEIGHTS.tempoAction;
  if (action.type === "play") {
    const card = ai.hand[action.index];
    if (!card) return -9999;
    return score + CHALLENGER_WEIGHTS.playAi + aiCardValue(card) + (ai.field.length === 0 ? CHALLENGER_WEIGHTS.emptyFieldPlay : 0);
  }
  if (action.type === "upgrade") {
    const target = ai.hand[action.handIndex];
    const source = ai.field[action.fieldIndex];
    if (!target || !source) return -9999;
    return score + CHALLENGER_WEIGHTS.upgrade + aiCardValue(target) - aiCardValue(source) * 0.45;
  }
  if (action.type === "memory") {
    const card = ai.hand[action.index];
    if (!card) return -9999;
    return score + CHALLENGER_WEIGHTS.memory + aiCardValue(card) - (ai.memory ? 24 : 0);
  }
  if (action.type === "memory-effect") {
    const sacrificed = ai.field[action.fieldIndex];
    if (!sacrificed) return -9999;
    const enables = ai.hand.some((card) => card.type === "ai" && playCost(card) <= Math.min(3, game.actionsRemaining + 1));
    return score + 58 + (enables ? 42 : 0) - aiCardValue(sacrificed) * 0.55;
  }
  if (action.type === "command") {
    const command = ai.hand[action.index];
    if (!command) return -9999;
    return score + CHALLENGER_WEIGHTS.command + commandAiValue(game, command);
  }
  if (action.type === "charge") {
    const fuel = ai.hand[action.index];
    if (!fuel) return -9999;
    const before = game.actionsRemaining;
    const after = Math.min(3, before + 1);
    const remaining = ai.hand.filter((_, index) => index !== action.index);
    const enablesPlay = remaining.some((card) => card.type === "ai" && playCost(card) > before && playCost(card) <= after);
    const enablesTwoStep = before === 2 && remaining.some((card) => card.type === "ai" && playCost(card) === 2);
    const effectValue = chargeAiValue(game, fuel);
    if (!enablesPlay && !enablesTwoStep && effectValue <= 0) return score - 130;
    return score + CHALLENGER_WEIGHTS.charge + (enablesPlay ? 55 : 0) + (enablesTwoStep ? 28 : 0) + effectValue - aiCardValue(fuel) * 0.42;
  }
  if (action.type === "attack") {
    const attacker = ai.field[action.index];
    if (!attacker) return -9999;
    return score + attackAiValue(game, attacker);
  }
  return score;
}

function boardAiScore(ai: PlayerState, opponent: PlayerState): number {
  const ready = ai.field.filter((_, index) => !ai.spentFieldIndexes.has(index)).length;
  const opponentReady = opponent.field.filter((_, index) => !opponent.spentFieldIndexes.has(index)).length;
  return (
    (opponent.life - ai.life) * -CHALLENGER_WEIGHTS.lowLifePressure
    + ai.field.reduce((sum, card) => sum + aiCardValue(card), 0) * 0.35
    - opponent.field.reduce((sum, card) => sum + aiCardValue(card), 0) * 0.22
    + ai.field.length * CHALLENGER_WEIGHTS.fieldPresence
    + ai.hand.length * CHALLENGER_WEIGHTS.handCard
    + ready * 18
    + opponentReady * CHALLENGER_WEIGHTS.opponentReady
  );
}

function attackAiValue(game: GameState, attacker: Card): number {
  const defender = opponentPlayer(game);
  const defense = chooseAiDefense(defender, attacker, "challenger");
  let value = CHALLENGER_WEIGHTS.attackPower * attackCombatValue(attacker);
  if (defense.type === "none") {
    value += CHALLENGER_WEIGHTS.damage;
    if (defender.life <= 1) value += CHALLENGER_WEIGHTS.lethal;
    if (blocksLowLifeHandDefense(attacker, defender) && defender.life <= 2) value += 70;
    return value;
  }
  if (defense.type === "hand") {
    const card = defender.hand[defense.index];
    value += CHALLENGER_WEIGHTS.handTradeAttack + (card ? aiCardValue(card) * 0.35 : 0);
    return value;
  }
  const card = defender.field[defense.index];
  if (!card) return value + CHALLENGER_WEIGHTS.badAttack;
  const defenseValue = defenseCombatValue(attacker, card, defender, { fieldIndex: defense.index });
  if (defenseValue === attackCombatValue(attacker)) value += CHALLENGER_WEIGHTS.tradeAttack + aiCardValue(card) * 0.35;
  else value += CHALLENGER_WEIGHTS.badAttack;
  if (pressuresOnBlock(attacker)) value += CHALLENGER_WEIGHTS.blockedValue;
  if (drawsOnBlockedAttack(attacker)) value += 32;
  if (keepsReadyAfterAttack(attacker)) value += 36;
  return value;
}

function aiCardValue(card: Card): number {
  if (card.type === "memory") {
    const priority: Record<string, number> = { cache: 48, resonator: 45, pipeline: 38, accelerator: 36, firewall: 30 };
    return priority[card.effect ?? ""] ?? 12;
  }
  if (card.type !== "ai") return 12;
  const effectBonus: Record<string, number> = {
    attack_plus_1: 18,
    reckless_attack_plus_1: 8,
    draw_after_overheat: 10,
    draw_two_after_overheat: 18,
    draw_two_after_overheat_opponent_draw: 8,
    draw_on_play: 20,
    draw_on_play_cannot_hand_defend: 15,
    filter_on_play: 24,
    no_spend_after_attack: 34,
    spend_enemy_on_play: 32,
    spend_enemy_on_play_enters_spent: 18,
    defense_plus_1: 18,
    defense_plus_1_enters_spent: 8,
    recover_ai_on_play: 22,
    block_pressure: 15,
    hand_defense_pierce: 24,
    low_life_no_hand_defense: 26,
    low_life_no_hand_defense_self_damage: 16,
    draw_on_blocked_attack: 18,
    draw_on_blocked_attack_cannot_hand_defend: 10,
    ready_ally_on_play: 24,
    ready_ally_on_play_draw: 34,
    return_after_overheat: 12,
    return_after_overheat_cannot_hand_defend: 4,
    draw_on_successful_defense: 14,
    draw_on_successful_defense_enters_spent: 6,
    charge_pressure: 16,
    charge_draw: 18,
    charge_ready_ally: 18,
    charge_guard: 16,
  };
  return (card.power ?? 0) * 20 + (effectBonus[card.effect ?? ""] ?? 0);
}

function commandAiValue(game: GameState, command: Card): number {
  const ai = activePlayer(game);
  const opponent = opponentPlayer(game);
  if (command.effect === "trinity") return opponent.life <= 1 ? 165 : 92;
  if (command.effect === "fire_rite") return opponent.hand.length === 0 ? 110 : 58;
  if (command.effect === "wind_rite") return 74 + (highestPowerReadyAi(opponent) !== null ? 22 : 0);
  if (command.effect === "water_rite") return ai.deck.length > 0 ? 68 : 0;
  if (command.effect === "earth_rite") return 62;
  if (command.effect === "disrupt") {
    const ready = opponent.field.filter((_, index) => !opponent.spentFieldIndexes.has(index));
    return 70 + Math.max(0, ...ready.map((card) => (card.power ?? 0) * 9));
  }
  if (command.effect === "sandbox") return 84;
  if (command.effect === "relearn") return 45;
  if (command.effect === "optimize") return 36 + Math.max(0, 4 - ai.hand.length) * 4;
  return 0;
}

function chargeAiValue(game: GameState, fuel: Card): number {
  const ai = activePlayer(game);
  const opponent = opponentPlayer(game);
  if (fuel.effect === "charge_pressure") return opponent.hand.length >= 3 ? 50 : 8;
  if (fuel.effect === "charge_draw") return ai.deck.length > 0 ? 42 : 0;
  if (fuel.effect === "charge_ready_ally") return highestPowerSpentAi(ai) !== null ? 62 : 8;
  if (fuel.effect === "charge_guard") return ai.field.length > 0 ? 38 : 6;
  if (ai.memory?.effect === "resonator" && ai.hand.length <= 2) return 24;
  return 0;
}

function sameAiAction(left: AiAction, right: AiAction): boolean {
  if (left.type !== right.type) return false;
  if ("index" in left || "index" in right) return ("index" in left ? left.index : null) === ("index" in right ? right.index : null);
  if (left.type === "upgrade" && right.type === "upgrade") return left.handIndex === right.handIndex && left.fieldIndex === right.fieldIndex;
  if (left.type === "memory-effect" && right.type === "memory-effect") return left.fieldIndex === right.fieldIndex;
  return true;
}

function aiActionTieBreak(action: AiAction): number {
  const priority: Record<AiAction["type"], number> = {
    attack: 7,
    command: 6,
    upgrade: 5,
    play: 4,
    charge: 3,
    "memory-effect": 2,
    memory: 1,
    end: 0,
  };
  return priority[action.type] * 1000 - ("index" in action ? action.index : "handIndex" in action ? action.handIndex : "fieldIndex" in action ? action.fieldIndex : 0);
}

export function bestChargeFuel(game: GameState, player: PlayerState): number | null {
  if (!canUseCharge(game, player)) return null;
  if (canActivePlayerAttack(game) && attackableField(player).length > 0) return null;
  const playerIndex = game.players.indexOf(player);
  const opponent = playerIndex >= 0 ? game.players[1 - playerIndex] : null;
  const before = game.actionsRemaining;
  const after = Math.min(3, before + 1);
  const candidates = player.hand
    .map((card, index) => ({ card, index }))
    .filter(({ card }) => canChargeCard(card))
    .sort((a, b) => cardPriority(a.card) - cardPriority(b.card) || a.card.id.localeCompare(b.card.id));
  for (const fuel of candidates) {
    const remaining = player.hand.filter((_, index) => index !== fuel.index);
    const enablesLargePlay = remaining.some((card) => card.type === "ai" && playCost(card) > before && playCost(card) <= after);
    const enablesTwoStepTurn = before === 2 && remaining.some((card) => card.type === "ai" && playCost(card) === 2) && remaining.length >= 2;
    if (enablesLargePlay || enablesTwoStepTurn || chargeFuelHasImmediateValue(player, opponent, fuel.card, remaining)) return fuel.index;
  }
  return null;
}

function chargeFuelHasImmediateValue(player: PlayerState, opponent: PlayerState | null, card: Card, remainingHand: Card[]): boolean {
  if (card.effect === "charge_pressure") return Boolean(opponent && opponent.hand.length >= 3);
  if (card.effect === "charge_draw") return player.deck.length > 0;
  if (card.effect === "charge_ready_ally") return highestPowerSpentAi(player) !== null;
  if (card.effect === "charge_guard") return player.field.length > 0;
  if (player.memory?.effect === "resonator") return remainingHand.length <= 2 && player.deck.length > 0;
  return false;
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
  const exhaustedPlayers = game.players
    .map((player, index) => ({ player, index }))
    .filter(({ player }) => !hasLiveResources(player));
  if (exhaustedPlayers.length === 0) return;

  game.actionsRemaining = 0;
  game.chargedActionsRemaining = 0;
  if (exhaustedPlayers.length === game.players.length) {
    game.draw = true;
    addLog(game, "両者の手札・山札・場がすべて尽きたため引き分け。");
    return;
  }

  const loserIndex = exhaustedPlayers[0].index;
  game.winner = 1 - loserIndex;
  addLog(game, `${game.players[loserIndex].name}の手札・山札・場がすべて尽きたため、${game.players[game.winner].name}の勝利。`);
}

function hasLiveResources(player: PlayerState): boolean {
  return player.deck.length > 0 || player.hand.length > 0 || player.field.length > 0;
}

export function checkTurnLimit(game: GameState): void {
  if (game.winner !== null || game.draw || game.turn < CONFIG.maxTurns) return;
  finishByLifeJudgement(game, `${CONFIG.maxTurns}手番に到達したため`);
}

export function finishByLifeJudgement(game: GameState, reason: string): void {
  const [human, ai] = game.players;
  game.actionsRemaining = 0;
  game.chargedActionsRemaining = 0;
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

export function canActivePlayerSpendAttackAction(game: GameState): boolean {
  return game.actionsRemaining > game.chargedActionsRemaining;
}

export function canHumanEndTurn(game: GameState): boolean {
  return (
    game.winner === null
    && !game.draw
    && !game.pendingAttack
    && !game.pendingTarget
    && activePlayer(game).isHuman
  );
}
