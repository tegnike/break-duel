export type Attribute = "火" | "水" | "風" | "土";
export type CardType = "ai" | "event" | "memory";
export type CardStatus = "active" | "inactive";
export type AiProfile = "beginner" | "challenger";
export type AiEffect =
  | "attack_plus_1"
  | "reckless_attack_plus_1"
  | "draw_after_overheat"
  | "draw_after_overheat_opponent_draw"
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
  | "charge_guard"
  | "charge_pressure_plus"
  | "charge_surge_draw"
  | "charge_spend_enemy"
  | "charge_recover_discard";
export type CommandEffect =
  | "optimize"
  | "patch"
  | "disrupt"
  | "purge"
  | "relearn"
  | "sandbox"
  | "trinity"
  | "fire_rite"
  | "water_rite"
  | "wind_rite"
  | "earth_rite"
  | "comeback_rite";
export type MemoryEffect = "firewall" | "cache" | "pipeline" | "accelerator" | "resonator" | "recovery_cache" | "war_banner" | "grove_rest";
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
  fieldStacks: Card[][];
  memory: Card | null;
  discard: Card[];
  cardsDrawn: number;
  turnsStarted: number;
  handDefensesUsed: number;
  playedAiThisTurn: boolean;
  pipelineUsed: boolean;
  acceleratorUsed: boolean;
  warBannerUsed: boolean;
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
  strikeTargetIndex?: number;
} | null;

export type PendingTarget =
  | {
      kind: "disrupt";
      sourceIndex: number;
    }
  | {
      kind: "purge";
      sourceIndex: number;
    }
  | {
      kind: "strike";
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
      reason: "filter-discard" | "relearn-recover" | "earth-rite-recover" | "recover-on-play" | "upgrade-source" | "ready-ally" | "spend-enemy" | "block-pressure" | "accelerator-sacrifice" | "charge-guard" | "charge-ready-ally" | "charge-spend-enemy" | "charge-recover" | "wind-rite-disrupt" | "wind-rite-ready" | "comeback-rite-ready";
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
      targetIndex?: number;
      secondaryTargetIndex?: number;
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
  life: 8,
  initialHand: 5,
  firstPlayerInitialHand: 5,
  secondPlayerInitialHand: 5,
  actionsPerTurn: 3,
  fieldLimit: 3,
  maxTurns: 60,
  advantageBonus: 1,
  disadvantagePenalty: 1,
  firstPlayerFirstTurnActions: 1,
  firstPlayerFirstTurnCanAttack: false,
  eachPlayerFirstTurnActions: null as number | null,
  handDefenseLimit: 1 as number | null,
  handDefenseEmptyOnly: false,
  exhaustAfterAttack: true,
  exhaustedCanDefend: false,
  exactUpgradeStep: false,
  firstPlayerFirstTurnDraw: false,
  secondPlayerFirstTurnDraw: true,
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
  powerScaledDamage: true,
  drawOnAttackDamage: "point" as "none" | "event" | "point",
  monsterCombat: true,
  handDefenseVsStrike: "value" as "off" | "eager" | "value",
};

export const DECK_RULES = {
  size: 25,
  sameNameLimit: 2,
  highPowerLimit: 5,
} as const;

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
    "AI-FIRE-2C": "烽火狐フレンネ",
    "AI-WATER-1": "透海リュミナ",
    "AI-WATER-1B": "泡踊りのミナモ",
    "AI-WATER-2": "氷晶亀セルキー",
    "AI-WATER-2B": "霧紡ぎセイレーン",
    "AI-WATER-3": "海嵐オルカーン",
    "AI-WATER-3B": "環流の賢ネレイド",
    "AI-WATER-4": "潮輪リヴァイア",
    "AI-WATER-4B": "星淵のアステル",
    "AI-WATER-1C": "雫読みミルティ",
    "AI-WATER-2C": "渦紡ぎシェルナ",
    "AI-WIND-1": "そよぎ狐フルーフ",
    "AI-WIND-1B": "風鈴の子リュフ",
    "AI-WIND-2": "翡翠鎌マンティス",
    "AI-WIND-2B": "真空の黒羽カイト",
    "AI-WIND-3": "花旋鹿シルフィード",
    "AI-WIND-3B": "稜線駆けアルエット",
    "AI-WIND-4": "雲海航路ミストラル",
    "AI-WIND-4B": "天蓋裂きヴァユ",
    "AI-WIND-2C": "追風リネット",
    "AI-WIND-1C": "辻風雀ツムジ",
    "AI-EARTH-1": "苔掘りモール",
    "AI-EARTH-1B": "芽吹きの杖ペルナ",
    "AI-EARTH-2": "碑甲ガメル",
    "AI-EARTH-2B": "磁鉄虫フェルム",
    "AI-EARTH-3": "石紋グランスパイダー",
    "AI-EARTH-3B": "琥珀角アンバーン",
    "AI-EARTH-4": "眠れる山ガイアス",
    "AI-EARTH-4B": "地核の環バサリア",
    "AI-EARTH-2C": "石灯りノーム",
    "AI-EARTH-1C": "種運びのクルミ",
  };
  const aiEffects = new Map<string, AiEffect>([
    ["AI-FIRE-1", "no_spend_after_attack"],
    ["AI-FIRE-1B", "block_pressure"],
    ["AI-FIRE-2", "attack_plus_1"],
    ["AI-FIRE-2B", "hand_defense_pierce"],
    ["AI-FIRE-3", "hand_defense_pierce"],
    ["AI-FIRE-3B", "reckless_attack_plus_1"],
    ["AI-FIRE-4", "draw_after_overheat"],
    ["AI-FIRE-4B", "low_life_no_hand_defense"],
    ["AI-FIRE-1C", "charge_pressure"],
    ["AI-WATER-1", "draw_on_blocked_attack"],
    ["AI-WATER-1B", "draw_on_play_cannot_hand_defend"],
    ["AI-WATER-2", "filter_on_play"],
    ["AI-WATER-2B", "draw_on_blocked_attack_cannot_hand_defend"],
    ["AI-WATER-3", "draw_on_play"],
    ["AI-WATER-3B", "filter_on_play"],
    ["AI-WATER-4", "return_after_overheat"],
    ["AI-WATER-4B", "draw_after_overheat_opponent_draw"],
    ["AI-WATER-1C", "charge_draw"],
    ["AI-WIND-1", "no_spend_after_attack"],
    ["AI-WIND-1B", "draw_on_blocked_attack_cannot_hand_defend"],
    ["AI-WIND-2B", "spend_enemy_on_play_enters_spent"],
    ["AI-WIND-3", "spend_enemy_on_play"],
    ["AI-WIND-3B", "ready_ally_on_play_draw"],
    ["AI-WIND-4", "return_after_overheat"],
    ["AI-WIND-4B", "spend_enemy_on_play"],
    ["AI-WIND-2C", "charge_ready_ally"],
    ["AI-EARTH-1", "block_pressure"],
    ["AI-EARTH-1B", "draw_on_successful_defense"],
    ["AI-EARTH-2", "defense_plus_1"],
    ["AI-EARTH-2B", "draw_on_successful_defense"],
    ["AI-EARTH-3", "defense_plus_1"],
    ["AI-EARTH-3B", "recover_ai_on_play"],
    ["AI-EARTH-4", "recover_ai_on_play"],
    ["AI-EARTH-4B", "draw_on_successful_defense"],
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
    { id: "AI-FIRE-2C", name: monsterNames["AI-FIRE-2C"], type: "ai", attribute: "火", power: 2, effect: "charge_pressure_plus" },
    { id: "AI-WATER-2C", name: monsterNames["AI-WATER-2C"], type: "ai", attribute: "水", power: 2, effect: "charge_surge_draw" },
    { id: "AI-WIND-1C", name: monsterNames["AI-WIND-1C"], type: "ai", attribute: "風", power: 1, effect: "charge_spend_enemy" },
    { id: "AI-EARTH-1C", name: monsterNames["AI-EARTH-1C"], type: "ai", attribute: "土", power: 1, effect: "charge_recover_discard" },
  ];
  const cards: CardSeed[] = [
    ...aiCards,
    ...chargeCycleCards,
    { id: "CMD-OPTIMIZE", name: "陣形リライト", type: "event", effect: "optimize" },
    { id: "CMD-PATCH", name: "若葉の息吹", type: "event", effect: "patch" },
    { id: "CMD-DISRUPT", name: "黒蔦の足止め", type: "event", effect: "disrupt" },
    { id: "CMD-PURGE", name: "追撃粛清", type: "event", effect: "purge" },
    { id: "CMD-RELEARN", name: "幻獣回帰の巻", type: "event", effect: "relearn" },
    { id: "CMD-SANDBOX", name: "蒼殻バリア", type: "event", effect: "sandbox" },
    { id: "CMD-TRINITY", name: "三相崩壊術", type: "event", effect: "trinity" },
    { id: "CMD-FIRE-RITE", name: "紅蓮圧壊術", type: "event", effect: "fire_rite" },
    { id: "CMD-WATER-RITE", name: "清流再編術", type: "event", effect: "water_rite" },
    { id: "CMD-WIND-RITE", name: "旋風転身術", type: "event", effect: "wind_rite" },
    { id: "CMD-EARTH-RITE", name: "岩壁継承術", type: "event", effect: "earth_rite" },
    { id: "CMD-COMEBACK-RITE", name: "逆転再起術", type: "event", effect: "comeback_rite" },
    { id: "MEM-FIREWALL", name: "竜盾の紋章", type: "memory", effect: "firewall" },
    { id: "MEM-CACHE", name: "灯火の旅嚢", type: "memory", effect: "cache" },
    { id: "MEM-PIPELINE", name: "星泉の導脈", type: "memory", effect: "pipeline" },
    { id: "MEM-ACCELERATOR", name: "刻火の加速炉", type: "memory", effect: "accelerator" },
    { id: "MEM-RESONATOR", name: "蓄光の祭壇", type: "memory", effect: "resonator" },
    { id: "MEM-RECOVERY-CACHE", name: "再起の灯箱", type: "memory", effect: "recovery_cache" },
    { id: "MEM-WAR-BANNER", name: "猛火の戦旗", type: "memory", effect: "war_banner" },
    { id: "MEM-GROVE", name: "大樹の寝床", type: "memory", effect: "grove_rest" },
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
      "AI-FIRE-1",
      "AI-FIRE-1C",
      "AI-FIRE-2",
      "AI-FIRE-2",
      "AI-FIRE-2B",
      "AI-FIRE-2B",
      "AI-FIRE-2C",
      "AI-WATER-2",
      "AI-WATER-2",
      "AI-WATER-2B",
      "AI-WATER-2B",
      "AI-FIRE-3B",
      "AI-FIRE-4",
      "AI-FIRE-4B",
      "AI-WATER-4B",
      "CMD-DISRUPT",
      "CMD-OPTIMIZE",
      "CMD-FIRE-RITE",
      "CMD-FIRE-RITE",
      "CMD-PURGE",
      "CMD-WATER-RITE",
      "CMD-SANDBOX",
      "MEM-WAR-BANNER",
      "MEM-RECOVERY-CACHE",
      "MEM-CACHE",
    ],
  },
  control: {
    name: "大地守護デッキ",
    description: "土と風で守りながら盤面を整える基本デッキ。粘り強く反撃します。",
    cards: [
      "AI-EARTH-2",
      "AI-EARTH-2",
      "AI-EARTH-1B",
      "AI-EARTH-2C",
      "AI-EARTH-2B",
      "AI-WIND-2",
      "AI-WIND-2",
      "AI-WIND-1B",
      "AI-WIND-2C",
      "AI-WIND-2B",
      "AI-WIND-3",
      "AI-WIND-3B",
      "AI-EARTH-3",
      "AI-EARTH-4",
      "CMD-DISRUPT",
      "CMD-RELEARN",
      "CMD-SANDBOX",
      "CMD-EARTH-RITE",
      "CMD-WIND-RITE",
      "CMD-PATCH",
      "CMD-PURGE",
      "MEM-PIPELINE",
      "MEM-RECOVERY-CACHE",
      "MEM-FIREWALL",
      "AI-EARTH-1",
    ],
  },
  fire: {
    name: "火単色デッキ",
    description: "攻撃強化と防御妨害で早くライフを詰める速攻型。短期決戦が得意です。",
    cards: [
      "AI-FIRE-1",
      "AI-FIRE-1",
      "AI-FIRE-1B",
      "AI-FIRE-1C",
      "AI-FIRE-1C",
      "AI-FIRE-2",
      "AI-FIRE-2",
      "AI-FIRE-2B",
      "AI-FIRE-2B",
      "AI-FIRE-2C",
      "AI-FIRE-2C",
      "AI-FIRE-3",
      "AI-FIRE-3B",
      "AI-FIRE-4",
      "AI-FIRE-4B",
      "CMD-FIRE-RITE",
      "CMD-FIRE-RITE",
      "CMD-COMEBACK-RITE",
      "CMD-OPTIMIZE",
      "CMD-DISRUPT",
      "MEM-CACHE",
      "MEM-WAR-BANNER",
      "MEM-RECOVERY-CACHE",
      "AI-FIRE-3",
      "CMD-PURGE",
    ],
  },
  water: {
    name: "水単色デッキ",
    description: "ドローと手札調整で必要札を探し続ける安定型。息切れしにくい構成です。",
    cards: [
      "AI-WATER-1",
      "AI-WATER-1",
      "AI-WATER-1C",
      "AI-WATER-1C",
      "AI-WATER-2",
      "AI-WATER-2",
      "AI-WATER-2B",
      "AI-WATER-2B",
      "AI-WATER-2C",
      "AI-WATER-2C",
      "AI-WATER-1B",
      "AI-WATER-3",
      "AI-WATER-3",
      "AI-WATER-3B",
      "AI-WATER-4",
      "CMD-PURGE",
      "CMD-DISRUPT",
      "CMD-OPTIMIZE",
      "CMD-WATER-RITE",
      "CMD-WATER-RITE",
      "CMD-COMEBACK-RITE",
      "MEM-PIPELINE",
      "MEM-CACHE",
      "MEM-RECOVERY-CACHE",
      "AI-WATER-3B",
    ],
  },
  wind: {
    name: "風単色デッキ",
    description: "相手を消耗させ、自分の召喚獣を再行動させるテンポ型。盤面差で押します。",
    cards: [
      "AI-WIND-1",
      "AI-WIND-1B",
      "AI-WIND-1B",
      "AI-WIND-1C",
      "AI-WIND-2",
      "AI-WIND-2",
      "AI-WIND-2B",
      "AI-WIND-2B",
      "AI-WIND-2C",
      "AI-WIND-2C",
      "AI-WIND-3",
      "AI-WIND-3B",
      "AI-WIND-3B",
      "AI-WIND-4",
      "AI-WIND-4B",
      "CMD-COMEBACK-RITE",
      "CMD-WIND-RITE",
      "CMD-WIND-RITE",
      "CMD-DISRUPT",
      "CMD-RELEARN",
      "CMD-PURGE",
      "CMD-PURGE",
      "MEM-CACHE",
      "MEM-RECOVERY-CACHE",
      "MEM-PIPELINE",
    ],
  },
  earth: {
    name: "土単色デッキ",
    description: "高い防御値と回収効果で耐える持久型。攻撃を受け止めて勝ち筋を作ります。",
    cards: [
      "AI-EARTH-1",
      "AI-EARTH-1B",
      "AI-EARTH-1C",
      "AI-EARTH-1C",
      "AI-EARTH-2",
      "AI-EARTH-2",
      "AI-EARTH-2B",
      "AI-EARTH-2B",
      "AI-EARTH-2C",
      "AI-EARTH-2C",
      "AI-EARTH-3",
      "AI-EARTH-3B",
      "AI-EARTH-3B",
      "AI-EARTH-4",
      "AI-EARTH-4B",
      "CMD-EARTH-RITE",
      "CMD-EARTH-RITE",
      "CMD-COMEBACK-RITE",
      "CMD-COMEBACK-RITE",
      "CMD-DISRUPT",
      "CMD-PATCH",
      "CMD-PURGE",
      "MEM-FIREWALL",
      "MEM-GROVE",
      "MEM-CACHE",
    ],
  },
  apex: {
    name: "覇王結束デッキ",
    description: "挑戦者CPUリーグで選ばれた最強候補。火力、防御貫通、チャージ補助をまとめて押し付けます。",
    cards: [
      "AI-FIRE-2",
      "AI-FIRE-2",
      "AI-FIRE-2B",
      "AI-FIRE-1C",
      "AI-WATER-1",
      "AI-WATER-2",
      "AI-WATER-2B",
      "AI-WATER-2B",
      "AI-EARTH-2",
      "AI-EARTH-2",
      "AI-EARTH-2C",
      "AI-WIND-2",
      "AI-WIND-2",
      "AI-WIND-3",
      "AI-WIND-3B",
      "AI-FIRE-3",
      "AI-FIRE-4",
      "AI-WATER-4",
      "CMD-SANDBOX",
      "CMD-WATER-RITE",
      "CMD-WIND-RITE",
      "CMD-DISRUPT",
      "CMD-PURGE",
      "MEM-FIREWALL",
      "MEM-RECOVERY-CACHE",
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
    fieldStacks: [],
    memory: null,
    discard: [],
    cardsDrawn: 0,
    turnsStarted: 0,
    handDefensesUsed: 0,
    playedAiThisTurn: false,
    pipelineUsed: false,
    acceleratorUsed: false,
    warBannerUsed: false,
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
    fieldStacks: [],
    memory: null,
    discard: [],
    cardsDrawn: 0,
    turnsStarted: 0,
    handDefensesUsed: 0,
    playedAiThisTurn: false,
    pipelineUsed: false,
    acceleratorUsed: false,
    warBannerUsed: false,
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
      fieldStacks: (player.fieldStacks ?? []).map((stack) => [...stack]),
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
    player.playedAiThisTurn = false;
  });
  const player = activePlayer(game);
  readyFieldForTurn(player);
  player.pipelineUsed = false;
  player.acceleratorUsed = false;
  player.warBannerUsed = false;
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

export function applyWarBannerDraw(attacker: PlayerState): Card[] {
  if (attacker.memory?.effect !== "war_banner") return [];
  if (attacker.warBannerUsed) return [];
  attacker.warBannerUsed = true;
  return drawCards(attacker, 1);
}

export function applyEndTurnGroveRest(player: PlayerState, opponent: PlayerState): Card | null {
  if (player.memory?.effect !== "grove_rest") return null;
  if (player.life >= opponent.life) return null;
  if (player.spentFieldIndexes.size < 2) return null;
  const targetIndex = highestPowerSpentAi(player);
  if (targetIndex === null || !player.field[targetIndex]) return null;
  player.spentFieldIndexes.delete(targetIndex);
  player.power3RecoveryDelayedFieldIndexes.delete(targetIndex);
  return player.field[targetIndex];
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
  const groveRestedCard = applyEndTurnGroveRest(player, opponentPlayer(game));
  if (groveRestedCard) {
    addLog(game, `${player.name}は${player.memory!.name}で${groveRestedCard.name}を回復した。`);
  }
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

export function playCost(card: Card | null | undefined, game?: GameState): number {
  if (!card) return 99;
  if (card.type === "event" || card.type === "memory") return 1;
  const baseCost = card.power ?? 1;
  if (!game) return baseCost;
  const player = activePlayer(game);
  const opponent = opponentPlayer(game);
  if (
    player.memory?.effect === "recovery_cache"
    && player.life < opponent.life
    && !player.playedAiThisTurn
  ) {
    return Math.max(1, baseCost - 1);
  }
  return baseCost;
}

export function upgradeCost(target: Card, source?: Card | null): number {
  if (source?.type === "ai" && target.type === "ai") {
    return Math.max(1, (target.power ?? 1) - (source.power ?? 0));
  }
  return Math.max(1, (target.power ?? 1) - 1);
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
  const options = upgradeSourceIndexes(player, targetCard)
    .map((index) => ({ source: player.field[index], index }));
  if (options.length === 0) return null;
  options.sort((a, b) => (b.source.power ?? 0) - (a.source.power ?? 0) || a.source.id.localeCompare(b.source.id));
  return options[0].index;
}

export function upgradeSourceIndexes(player: PlayerState, targetCard: Card, maxCost = Number.POSITIVE_INFINITY): number[] {
  return player.field
    .map((source, index) => (
      canUpgrade(source, targetCard) && upgradeCost(targetCard, source) <= maxCost ? index : -1
    ))
    .filter((index) => index >= 0);
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
  if (card.effect === "attack_plus_1") return "戦闘時、攻撃値 +1";
  if (card.effect === "reckless_attack_plus_1") return "戦闘時、攻撃値 +1。手札防御に使えない";
  if (card.effect === "draw_after_overheat") return "攻撃後退場時、山札からカードを1枚引く";
  if (card.effect === "draw_after_overheat_opponent_draw") return "攻撃後退場時、山札からカードを1枚引く。登場時、相手は山札からカードを1枚引く";
  if (card.effect === "draw_two_after_overheat") return "攻撃後退場時、山札からカードを2枚引く";
  if (card.effect === "draw_two_after_overheat_opponent_draw") return "攻撃後退場時、山札からカードを2枚引く。登場時、相手は山札からカードを1枚引く";
  if (card.effect === "draw_on_play") return "登場時、山札からカードを1枚引く";
  if (card.effect === "draw_on_play_cannot_hand_defend") return "登場時、山札からカードを1枚引く。手札防御に使えない";
  if (card.effect === "filter_on_play") return "登場時、山札からカードを2枚引き、手札1枚をトラッシュへ送る";
  if (card.effect === "no_spend_after_attack") return "攻撃しても消耗しない";
  if (card.effect === "spend_enemy_on_play") return "登場時、相手の未消耗召喚獣1体を消耗";
  if (card.effect === "spend_enemy_on_play_enters_spent") return "登場時、相手の未消耗召喚獣1体を消耗。自身も消耗で出る";
  if (card.effect === "defense_plus_1") return "場防御時、防御値 +1";
  if (card.effect === "defense_plus_1_enters_spent") return "場防御時、防御値 +1。消耗で出る";
  if (card.effect === "recover_ai_on_play") return "登場時、手札1枚以下ならトラッシュの召喚獣1枚を回収";
  if (card.effect === "block_pressure") return "攻撃が防御された時、相手は手札1枚をトラッシュへ送る";
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
  if (card.effect === "charge_pressure") return "このカードをチャージした時、相手の手札が3枚以上なら1枚トラッシュへ送る";
  if (card.effect === "charge_draw") return "このカードをチャージした時、山札からカードを1枚引く";
  if (card.effect === "charge_ready_ally") return "このカードをチャージした時、自分の消耗召喚獣1体を選んで回復";
  if (card.effect === "charge_guard") return "このカードをチャージした時、場の召喚獣を1体選び、その召喚獣は次の自分ターンまで場防御値 +1";
  if (card.effect === "charge_pressure_plus") return "このカードをチャージした時、相手の手札が2枚以上なら1枚トラッシュへ送る";
  if (card.effect === "charge_surge_draw") return "このカードをチャージした時、手札が2枚以下なら山札からカードを2枚引く";
  if (card.effect === "charge_spend_enemy") return "このカードをチャージした時、相手の未消耗召喚獣1体を選んで消耗";
  if (card.effect === "charge_recover_discard") return "このカードをチャージした時、手札が2枚以下ならトラッシュの召喚獣1枚を手札に戻す。このカード自身は戻せない";
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
  return card.type === "ai" && (card.effect === "draw_after_overheat" || card.effect === "draw_after_overheat_opponent_draw");
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
    || card.effect === "charge_pressure_plus"
    || card.effect === "charge_surge_draw"
    || card.effect === "charge_spend_enemy"
    || card.effect === "charge_recover_discard"
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
  return card.type === "ai" && (card.effect === "draw_after_overheat_opponent_draw" || card.effect === "draw_two_after_overheat_opponent_draw");
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
  return removeFieldStack(player, index)[0];
}

export function removeFieldStack(player: PlayerState, index: number): Card[] {
  player.fieldStacks ??= [];
  while (player.fieldStacks.length < player.field.length) player.fieldStacks.push([]);
  const [card] = player.field.splice(index, 1);
  const [stack = []] = player.fieldStacks.splice(index, 1);
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
  return [card, ...[...stack].reverse()];
}

export function stackUpgradeCard(player: PlayerState, index: number, source: Card): void {
  player.fieldStacks ??= [];
  while (player.fieldStacks.length < player.field.length) player.fieldStacks.push([]);
  const stack = player.fieldStacks[index] ?? [];
  player.fieldStacks[index] = [...stack, source];
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

export function attackDamage(attackCard: Card): number {
  if (!CONFIG.powerScaledDamage) return 1;
  return attackCard.power ?? 1;
}

export function strikeValues(attackCard: Card, defender: PlayerState, targetIndex: number): { attackValue: number; defenseValue: number } {
  const target = defender.field[targetIndex];
  const attackValue = attackCombatValue(attackCard);
  const defenseValue = defenseCombatValue(attackCard, target, defender, { fieldIndex: targetIndex });
  return { attackValue, defenseValue };
}

export function strikeTargets(attackCard: Card, defender: PlayerState): { index: number; card: Card; attackValue: number; defenseValue: number; trade: boolean }[] {
  if (!CONFIG.monsterCombat) return [];
  return defender.field
    .map((card, index) => {
      const { attackValue, defenseValue } = strikeValues(attackCard, defender, index);
      return { index, card, attackValue, defenseValue, trade: attackValue === defenseValue };
    })
    .filter((option) => option.attackValue >= option.defenseValue);
}

export function chooseStrikeHandDefense(defender: PlayerState, attackCard: Card, targetIndex: number): number | null {
  const mode = CONFIG.handDefenseVsStrike;
  if (mode !== "eager" && mode !== "value") return null;
  const options = legalHandDefenders(defender, attackCard);
  if (options.length === 0) return null;
  const best = [...options].sort((a, b) => (
    (a.card.power ?? 0) - (b.card.power ?? 0)
    || a.card.id.localeCompare(b.card.id)
  ))[0];
  const { attackValue, defenseValue } = strikeValues(attackCard, defender, targetIndex);
  if (attackValue === defenseValue) return null;
  if (mode === "value") {
    const stack = defender.fieldStacks?.[targetIndex] ?? [];
    const savedPower = (defender.field[targetIndex]?.power || 1)
      + stack.reduce((sum, card) => sum + (card.power || 1), 0);
    if (savedPower < (best.card.power || 1)) return null;
  }
  return best.index;
}

export function bestClassicStrike(attacker: PlayerState, defender: PlayerState): { index: number; targetIndex: number } | null {
  let best: { key: [number, number, number, number]; index: number; targetIndex: number } | null = null;
  attackableField(attacker).forEach(({ card, index }) => {
    strikeTargets(card, defender).forEach((option) => {
      const attackerPower = card.power ?? 0;
      const targetPower = option.card.power ?? 0;
      let key: [number, number, number, number];
      if (option.trade) {
        if (targetPower <= attackerPower) return;
        key = [0, targetPower - attackerPower, targetPower, -attackerPower];
      } else {
        if (targetPower < attackerPower) return;
        key = [1, targetPower - attackerPower, targetPower, -attackerPower];
      }
      if (
        best === null
        || key[0] > best.key[0]
        || (key[0] === best.key[0] && (key[1] > best.key[1]
          || (key[1] === best.key[1] && (key[2] > best.key[2]
            || (key[2] === best.key[2] && key[3] > best.key[3])))))
      ) {
        best = { key, index, targetIndex: option.index };
      }
    });
  });
  return best === null ? null : { index: (best as { index: number }).index, targetIndex: (best as { targetIndex: number }).targetIndex };
}

export function commandUsable(game: GameState, command: Card | null | undefined, player: PlayerState, opponent: PlayerState): boolean {
  if (!command || command.type !== "event") return false;
  if (command.effect === "optimize") return player.hand.length > 1;
  if (command.effect === "patch") return highestPowerSpentAi(player) !== null;
  if (command.effect === "disrupt") return highestPowerReadyAi(opponent) !== null;
  if (command.effect === "purge") return highestPowerSpentAi(opponent) !== null;
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
  if (command.effect === "comeback_rite") {
    return player.life < opponent.life;
  }
  return false;
}

export function commandBlockedReason(game: GameState, command: Card | null | undefined, player: PlayerState, opponent: PlayerState): string {
  if (!command || command.type !== "event") return "術式カードではありません。";
  if (commandUsable(game, command, player, opponent)) return "";
  if (command.effect === "optimize") return "手札にトラッシュへ送るカードがもう1枚必要です。";
  if (command.effect === "patch") return "自分の消耗中召喚獣が必要です。";
  if (command.effect === "disrupt") return "相手の未消耗召喚獣が必要です。";
  if (command.effect === "purge") return "相手の消耗中召喚獣が必要です。";
  if (command.effect === "relearn") {
    if (player.hand.length <= 1) return "手札にトラッシュへ送るカードがもう1枚必要です。";
    return "自分のトラッシュに召喚獣が必要です。";
  }
  if (command.effect === "sandbox") return "残り2アクション以上、攻撃可能、未消耗power 4が必要です。";
  if (command.effect === "trinity") return "自分の場に召喚獣が3体必要です。";
  if (command.effect === "fire_rite") return "自分の場に火の召喚獣が必要です。";
  if (command.effect === "water_rite") {
    if (!hasAttributeAi(player, "水")) return "自分の場に水の召喚獣が必要です。";
    return "山札が必要です。";
  }
  if (command.effect === "wind_rite") {
    if (!hasAttributeAi(player, "風")) return "自分の場に風の召喚獣が必要です。";
    return "相手の未消耗召喚獣、または自分の消耗中風召喚獣が必要です。";
  }
  if (command.effect === "earth_rite") {
    if (!hasAttributeAi(player, "土")) return "自分の場に土の召喚獣が必要です。";
    return "自分のトラッシュに召喚獣が必要です。";
  }
  if (command.effect === "comeback_rite") {
    if (player.life >= opponent.life) return "相手よりライフが少ない時だけ発動できます。";
    return "";
  }
  return "条件を満たしていません。";
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
      && game.actionsRemaining < CONFIG.actionsPerTurn + 1,
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
      && game.actionsRemaining < CONFIG.actionsPerTurn + 1,
  );
}

export function canChargeCard(card: Card | null | undefined): boolean {
  return Boolean(card);
}

export function acceleratorSacrificeTarget(player: PlayerState): number | null {
  if (player.field.length === 0) return null;
  const options = player.field.map((card, index) => ({ card, index }));
  options.sort((a, b) => cardPriority(a.card) - cardPriority(b.card) || a.card.id.localeCompare(b.card.id));
  return options[0].index;
}

export function chooseAiDefense(defender: PlayerState, attackCard: Card, profile: AiProfile = defender.aiProfile): DefenseChoice {
  void profile;
  const fieldOptions = legalFieldDefenders(defender, attackCard);
  const handOptions = legalHandDefenders(defender, attackCard);
  if (fieldOptions.length > 0) {
    const attackValue = attackCombatValue(attackCard);
    const best = fieldOptions.sort((a, b) => (
      fieldDefenseOutcomeRank(defender, attackCard, a, attackValue) - fieldDefenseOutcomeRank(defender, attackCard, b, attackValue)
      || (a.card.power ?? 0) - (b.card.power ?? 0)
      || a.card.id.localeCompare(b.card.id)
    ))[0];
    return { type: "field", index: best.index };
  }
  if (handOptions.length > 0) {
    const best = handOptions.sort((a, b) => (
      (a.card.power ?? 0) - (b.card.power ?? 0)
      || a.card.id.localeCompare(b.card.id)
    ))[0];
    return { type: "hand", index: best.index };
  }
  return { type: "none" };
}

function fieldDefenseOutcomeRank(
  defender: PlayerState,
  attackCard: Card,
  option: { card: Card; index: number },
  attackValue: number,
): number {
  const baseValue = defenseCombatValue(attackCard, option.card, defender, { fieldIndex: option.index });
  const paidValue = canUseFirewall(defender, option.card, attackCard)
    ? defenseCombatValue(attackCard, option.card, defender, { firewallPaid: true, fieldIndex: option.index })
    : baseValue;
  return Math.max(baseValue, paidValue) > attackValue ? 0 : 1;
}

export function bestHandAi(game: GameState, player: PlayerState): number | null {
  const aiCards = player.hand
    .map((card, index) => ({ card, index }))
    .filter(({ card }) => card.type === "ai" && playCost(card, game) <= game.actionsRemaining);
  if (aiCards.length === 0) return null;
  aiCards.sort((a, b) => (b.card.power ?? 0) - (a.card.power ?? 0) || b.card.id.localeCompare(a.card.id));
  return aiCards[0].index;
}

export function bestUpgrade(game: GameState, player: PlayerState): { handIndex: number; fieldIndex: number; target: Card; source: Card } | null {
  const options: { handIndex: number; fieldIndex: number; target: Card; source: Card }[] = [];
  player.hand.forEach((target, handIndex) => {
    if (target.type !== "ai") return;
    player.field.forEach((source, fieldIndex) => {
      if (canUpgrade(source, target) && upgradeCost(target, source) <= game.actionsRemaining) {
        options.push({ handIndex, fieldIndex, target, source });
      }
    });
  });
  if (options.length === 0) return null;
  options.sort((a, b) => (
    (b.target.power ?? 0) - (a.target.power ?? 0)
    || (b.source.power ?? 0) - (a.source.power ?? 0)
    || b.target.id.localeCompare(a.target.id)
  ));
  return options[0];
}

export function bestMemory(player: PlayerState): number | null {
  if (player.memory) return null;
  const priority: Record<string, number> = { cache: 4, recovery_cache: 4, resonator: 4, war_banner: 3, grove_rest: 3, pipeline: 3, accelerator: 3, firewall: 2 };
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
    purge: 5,
    fire_rite: 4,
    water_rite: 4,
    wind_rite: 4,
    earth_rite: 4,
    comeback_rite: 4,
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
  | { type: "strike"; index: number; targetIndex: number }
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
    if (CONFIG.monsterCombat) {
      const strike = bestClassicStrike(ai, human);
      if (strike !== null) return { type: "strike", index: strike.index, targetIndex: strike.targetIndex };
    }
  }
  if (ai.field.length < CONFIG.fieldLimit) {
    const index = bestHandAi(game, ai);
    if (index !== null) return { type: "play", index };
  }
  const upgrade = bestUpgrade(game, ai);
  if (upgrade !== null) return { type: "upgrade", handIndex: upgrade.handIndex, fieldIndex: upgrade.fieldIndex };
  if (
    canUseAcceleratorMemory(game, ai)
    && ai.hand.some((card) => card.type === "ai" && playCost(card, game) === game.actionsRemaining + 1)
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

function beginnerDamagingAttack(attacker: PlayerState, defender: PlayerState): number | null {
  const options = attackableField(attacker)
    .filter(({ card }) => legalFieldDefenders(defender, card).length === 0);
  if (options.length === 0) return null;
  options.sort((a, b) => (b.card.power ?? 0) - (a.card.power ?? 0) || b.card.id.localeCompare(a.card.id));
  return options[0].index;
}

function chooseBeginnerAiAction(game: GameState): AiAction {
  const ai = activePlayer(game);
  if (game.actionsRemaining <= 0) return { type: "end" };
  if (canActivePlayerAttack(game)) {
    const attack = beginnerDamagingAttack(ai, opponentPlayer(game));
    if (attack !== null) return { type: "attack", index: attack };
  }
  if (ai.field.length < CONFIG.fieldLimit) {
    const options = ai.hand
      .map((card, index) => ({ card, index }))
      .filter(({ card }) => card.type === "ai" && playCost(card, game) <= game.actionsRemaining)
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
        if (card.type === "ai" && playCost(card, game) <= game.actionsRemaining) actions.push({ type: "play", index });
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
      if (target.type !== "ai") return;
      ai.field.forEach((source, fieldIndex) => {
        if (canUpgrade(source, target) && upgradeCost(target, source) <= game.actionsRemaining) {
          actions.push({ type: "upgrade", handIndex, fieldIndex });
        }
      });
    });
    if (canActivePlayerAttack(game)) {
      attackableField(ai).forEach(({ index }) => actions.push({ type: "attack", index }));
      if (CONFIG.monsterCombat) {
        attackableField(ai).forEach(({ card, index }) => {
          strikeTargets(card, human).forEach((target) => actions.push({ type: "strike", index, targetIndex: target.index }));
        });
      }
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
  strikeBase: 26,
  strikeTargetPower: 34,
  strikeReadyTarget: 14,
  strikeTradePenalty: 30,
  strikePower4Penalty: 46,
  purgeBase: 40,
  purgeTargetPower: 28,
};
const CHALLENGER_SELF_DEFEAT_ATTACK_SCORE = -10000;

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
    const enables = ai.hand.some((card) => card.type === "ai" && playCost(card, game) <= Math.min(CONFIG.actionsPerTurn + 1, game.actionsRemaining + 1));
    if (!enables) return score - 130;
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
    const after = Math.min(CONFIG.actionsPerTurn + 1, before + 1);
    const remaining = ai.hand.filter((_, index) => index !== action.index);
    const fieldHasRoom = ai.field.length < CONFIG.fieldLimit;
    const enablesPlay = fieldHasRoom && remaining.some((card) => card.type === "ai" && playCost(card, game) > before && playCost(card, game) <= after);
    const enablesTwoStep = fieldHasRoom && before === 2 && remaining.some((card) => card.type === "ai" && playCost(card, game) === 2) && remaining.length >= 2;
    const hasImmediateValue = chargeFuelHasImmediateValue(ai, opponent, fuel, remaining);
    const effectValue = chargeAiValue(game, fuel);
    if (!enablesPlay && !enablesTwoStep && !hasImmediateValue) return score - 130;
    return score + CHALLENGER_WEIGHTS.charge + (enablesPlay ? 55 : 0) + (enablesTwoStep ? 28 : 0) + effectValue - aiCardValue(fuel) * 0.42;
  }
  if (action.type === "attack") {
    const attacker = ai.field[action.index];
    if (!attacker) return -9999;
    return score + attackAiValue(game, attacker);
  }
  if (action.type === "strike") {
    const attacker = ai.field[action.index];
    const target = opponent.field[action.targetIndex];
    if (!attacker || !target) return -9999;
    const { attackValue, defenseValue } = strikeValues(attacker, opponent, action.targetIndex);
    if (attackValue < defenseValue) return -9999;
    if (CONFIG.handDefenseVsStrike !== "off") {
      const blockerIndex = chooseStrikeHandDefense(opponent, attacker, action.targetIndex);
      if (blockerIndex !== null) {
        const blocker = opponent.hand[blockerIndex];
        return score + CHALLENGER_WEIGHTS.handTradeAttack + (blocker ? aiCardValue(blocker) * 0.35 : 0);
      }
    }
    const trade = attackValue === defenseValue;
    let value = CHALLENGER_WEIGHTS.strikeBase + CHALLENGER_WEIGHTS.strikeTargetPower * (target.power ?? 0);
    if (!opponent.spentFieldIndexes.has(action.targetIndex)) value += CHALLENGER_WEIGHTS.strikeReadyTarget;
    if (trade) value -= CHALLENGER_WEIGHTS.strikeTradePenalty * (attacker.power ?? 0);
    else if ((attacker.power ?? 0) >= 4) value -= CHALLENGER_WEIGHTS.strikePower4Penalty;
    return score + value;
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
  if (hasCrushingFieldDefender(defender, attacker)) return CHALLENGER_SELF_DEFEAT_ATTACK_SCORE;

  const defense = chooseAiDefense(defender, attacker, "challenger");
  let value = CHALLENGER_WEIGHTS.attackPower * attackCombatValue(attacker);
  if (defense.type === "none") {
    value += CHALLENGER_WEIGHTS.damage;
    if (defender.life <= attackDamage(attacker)) value += CHALLENGER_WEIGHTS.lethal;
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

function hasCrushingFieldDefender(defender: PlayerState, attacker: Card): boolean {
  const attackValue = attackCombatValue(attacker);
  return legalFieldDefenders(defender, attacker).some(({ card, index }) => {
    const baseValue = defenseCombatValue(attacker, card, defender, { fieldIndex: index });
    const paidValue = canUseFirewall(defender, card, attacker)
      ? defenseCombatValue(attacker, card, defender, { firewallPaid: true, fieldIndex: index })
      : baseValue;
    return Math.max(baseValue, paidValue) > attackValue;
  });
}

function aiCardValue(card: Card): number {
  if (card.type === "memory") {
    const priority: Record<string, number> = { cache: 48, resonator: 45, recovery_cache: 42, war_banner: 40, pipeline: 38, accelerator: 36, grove_rest: 34, firewall: 30 };
    return priority[card.effect ?? ""] ?? 12;
  }
  if (card.type !== "ai") return 12;
  const effectBonus: Record<string, number> = {
    attack_plus_1: 18,
    reckless_attack_plus_1: 8,
    draw_after_overheat: 10,
    draw_after_overheat_opponent_draw: 0,
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
    charge_pressure_plus: 18,
    charge_surge_draw: 20,
    charge_spend_enemy: 20,
    charge_recover_discard: 18,
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
  if (command.effect === "comeback_rite") {
    return 48 + (highestPowerSpentAi(ai) !== null ? 40 : 0) + (ai.deck.length > 0 ? 48 : 0);
  }
  if (command.effect === "purge") {
    const spentPowers = opponent.field
      .filter((_, index) => opponent.spentFieldIndexes.has(index))
      .map((card) => card.power ?? 0);
    return spentPowers.length > 0
      ? CHALLENGER_WEIGHTS.purgeBase + CHALLENGER_WEIGHTS.purgeTargetPower * Math.max(...spentPowers)
      : 0;
  }
  if (command.effect === "disrupt") {
    const ready = opponent.field.filter((_, index) => !opponent.spentFieldIndexes.has(index));
    return 70 + Math.max(0, ...ready.map((card) => (card.power ?? 0) * 9));
  }
  if (command.effect === "sandbox") return 84;
  if (command.effect === "patch") return 52 + (ai.deck.length > 0 ? 8 : 0);
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
  if (fuel.effect === "charge_pressure_plus") return opponent.hand.length >= 2 ? 48 : 8;
  if (fuel.effect === "charge_surge_draw") return ai.hand.length <= 3 && ai.deck.length > 0 ? 56 : 6;
  if (fuel.effect === "charge_spend_enemy") return highestPowerReadyAi(opponent) !== null ? 58 : 8;
  if (fuel.effect === "charge_recover_discard") return ai.hand.length <= 3 && highestPowerAiInDiscard(ai) !== null ? 50 : 6;
  if (ai.memory?.effect === "resonator" && ai.hand.length <= 2) return 24;
  return 0;
}

function sameAiAction(left: AiAction, right: AiAction): boolean {
  if (left.type !== right.type) return false;
  if (left.type === "strike" && right.type === "strike") return left.index === right.index && left.targetIndex === right.targetIndex;
  if ("index" in left || "index" in right) return ("index" in left ? left.index : null) === ("index" in right ? right.index : null);
  if (left.type === "upgrade" && right.type === "upgrade") return left.handIndex === right.handIndex && left.fieldIndex === right.fieldIndex;
  if (left.type === "memory-effect" && right.type === "memory-effect") return left.fieldIndex === right.fieldIndex;
  return true;
}

function aiActionTieBreak(action: AiAction): number {
  const priority: Record<AiAction["type"], number> = {
    attack: 7,
    strike: 7,
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
  const fieldHasRoom = player.field.length < CONFIG.fieldLimit;
  const candidates = player.hand
    .map((card, index) => ({ card, index }))
    .filter(({ card }) => canChargeCard(card))
    .sort((a, b) => cardPriority(a.card) - cardPriority(b.card) || a.card.id.localeCompare(b.card.id));
  for (const fuel of candidates) {
    const remaining = player.hand.filter((_, index) => index !== fuel.index);
    const enablesLargePlay = fieldHasRoom && remaining.some((card) => card.type === "ai" && playCost(card, game) > before && playCost(card, game) <= after);
    const enablesTwoStepTurn = fieldHasRoom && before === 2 && remaining.some((card) => card.type === "ai" && playCost(card, game) === 2) && remaining.length >= 2;
    if (enablesLargePlay || enablesTwoStepTurn || chargeFuelHasImmediateValue(player, opponent, fuel.card, remaining)) return fuel.index;
  }
  return null;
}

function chargeFuelHasImmediateValue(player: PlayerState, opponent: PlayerState | null, card: Card, remainingHand: Card[]): boolean {
  if (card.effect === "charge_pressure") return Boolean(opponent && opponent.hand.length >= 3);
  if (card.effect === "charge_draw") return player.deck.length > 0;
  if (card.effect === "charge_ready_ally") return highestPowerSpentAi(player) !== null;
  if (card.effect === "charge_guard") return player.field.length > 0;
  if (card.effect === "charge_pressure_plus") return Boolean(opponent && opponent.hand.length >= 2);
  if (card.effect === "charge_surge_draw") return remainingHand.length <= 2 && player.deck.length > 0;
  if (card.effect === "charge_spend_enemy") return Boolean(opponent && highestPowerReadyAi(opponent) !== null);
  if (card.effect === "charge_recover_discard") return remainingHand.length <= 2 && highestPowerAiInDiscard(player) !== null;
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
