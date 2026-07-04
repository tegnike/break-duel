import {
  CARD_BY_ID,
  CONFIG,
  type AiAction,
  type Card,
  type GameState,
  addLog,
  canActivePlayerAttack,
  canChargeCard,
  canUseCharge,
  cloneCard,
  createGame,
  playCost,
} from "./game";

export const TUTORIAL_COMPLETED_STORAGE_KEY = "break-duel:tutorial-completed";
export const TUTORIAL_SEED = 20260630;

export type TutorialStepId =
  | "select-summon"
  | "play-summon"
  | "end-first-turn"
  | "watch-rival"
  | "defend"
  | "attack"
  | "command"
  | "select-charge"
  | "charge"
  | "select-post-charge-memory"
  | "play-post-charge-memory"
  | "end-after-memory"
  | "select-upgrade"
  | "upgrade"
  | "end-after-power3-upgrade"
  | "select-power4-upgrade"
  | "upgrade-power4"
  | "saved-action-attack"
  | "end-after-upgrade"
  | "field-defend"
  | "purge-command"
  | "strike-monster"
  | "power4-attack"
  | "end-after-power4"
  | "take-break-draw"
  | "complete";

export type TutorialStep = {
  id: TutorialStepId;
  kicker: string;
  title: string;
  detail: string;
  focus?: TutorialFocus;
};

export type TutorialFocus =
  | { kind: "hand-card"; ownerIndex: number; cardId: string }
  | { kind: "field-card"; ownerIndex: number; index: number }
  | { kind: "action"; action: "play" | "upgrade" | "attack" | "command" | "charge" | "end" }
  | { kind: "defense" };

const PLAYER_TUTORIAL_HAND = [
  "AI-FIRE-2",
  "MEM-CACHE",
  "AI-FIRE-1C",
  "CMD-FIRE-RITE",
  "AI-FIRE-2B",
];

const PLAYER_TUTORIAL_DECK = [
  "AI-FIRE-1B",
  "AI-FIRE-2B",
  "CMD-OPTIMIZE",
  "AI-WATER-2",
  "AI-WATER-1C",
  "MEM-ACCELERATOR",
  "AI-WATER-2B",
  "AI-FIRE-3",
  "CMD-DISRUPT",
  "AI-WATER-1B",
  "AI-FIRE-2",
  "CMD-FIRE-RITE",
  "AI-WATER-3",
  "AI-FIRE-1B",
  "CMD-PURGE",
  "AI-FIRE-4",
  "AI-FIRE-3B",
];

// 先頭の攻撃役は block_pressure を持たないカードにする。
// （防御成功時に人間へ手札トラッシュ選択を強いると、MEM-CACHE 等の教材カードを
//   捨てられて固定進行が崩れるため。2026-07-04 WP6）
const RIVAL_TUTORIAL_HAND = [
  "AI-EARTH-1B",
  "AI-EARTH-2",
  "AI-WIND-1",
  "AI-EARTH-2C",
  "CMD-EARTH-RITE",
];

const RIVAL_TUTORIAL_DECK = [
  "AI-EARTH-1B",
  "AI-WIND-1B",
  "AI-EARTH-2",
  "AI-WIND-2",
  "MEM-PIPELINE",
  "AI-EARTH-2B",
  "AI-WIND-2C",
  "CMD-DISRUPT",
  "AI-EARTH-3",
  "AI-WIND-2B",
  "AI-EARTH-1",
  "AI-WIND-3",
  "CMD-SANDBOX",
  "AI-EARTH-4",
  "AI-WIND-3B",
];

export function readTutorialCompleted(): boolean {
  if (typeof localStorage === "undefined") return false;
  try {
    return localStorage.getItem(TUTORIAL_COMPLETED_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function writeTutorialCompleted(completed: boolean): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(TUTORIAL_COMPLETED_STORAGE_KEY, completed ? "true" : "false");
  } catch {
    // Persisting tutorial completion is best-effort; blocked storage should not break play.
  }
}

export function createTutorialGame(): GameState {
  const game = createGame(
    TUTORIAL_SEED,
    {
      kind: "custom",
      name: "チュートリアル練習デッキ",
      cardIds: [...PLAYER_TUTORIAL_HAND, ...PLAYER_TUTORIAL_DECK],
    },
    {
      kind: "custom",
      name: "チュートリアルライバル",
      cardIds: [...RIVAL_TUTORIAL_HAND, ...RIVAL_TUTORIAL_DECK],
    },
    "beginner",
  );

  const player = game.players[0];
  const rival = game.players[1];
  player.deckName = "チュートリアル練習デッキ";
  rival.deckName = "チュートリアルライバル";
  player.hand = cloneCards(PLAYER_TUTORIAL_HAND);
  player.deck = cloneCards(PLAYER_TUTORIAL_DECK);
  player.cardsDrawn = player.hand.length;
  rival.hand = cloneCards(RIVAL_TUTORIAL_HAND);
  rival.deck = cloneCards(RIVAL_TUTORIAL_DECK);
  rival.field = [];
  rival.cardsDrawn = rival.hand.length;
  rival.spentFieldIndexes = new Set();
  game.selected = null;
  game.log = [];
  // 通常対戦の先攻1ターン目は1アクションだが、最初の教材『炉殻バサルトン』はコスト2。
  // チュートリアルに限り練習用に2アクションでスタートする。
  game.actionsRemaining = 2;
  // 固定進行の与ダメージ合計(2+1... バサルトン2 + バサルトン2 + ヴァルガ4 = 8)でライバルが
  // 最終教習(STEP 18 被弾ブレイクドロー)の前に倒れてしまうため、練習用にライフを1点だけ増やす。
  rival.life = CONFIG.life + 1;
  addLog(game, "チュートリアル対戦を開始。練習用に先攻1ターン目は2アクション、ライバルのライフは9です。まずは召喚獣を場に出しましょう。");
  return game;
}

export function currentTutorialStep(game: GameState): TutorialStep {
  const player = game.players[0];
  const rival = game.players[1];
  if (game.winner !== null || game.draw) return completeStep();
  if (tutorialPracticeComplete(game)) return completeStep();

  if (game.pendingAttack?.defenderIndex === 0) {
    if (game.turn >= 10) {
      return {
        id: "take-break-draw",
        kicker: "STEP 18",
        title: "防御せず受ける",
        detail: "今回はあえて防御しません。「防御しない」を選ぶと攻撃が通り、受けたダメージ1点につき手札を1枚引けます（ブレイクドロー）。劣勢側の巻き返しの資源になります。",
        focus: { kind: "defense" },
      };
    }
    if (game.turn <= 2) {
      return {
        id: "field-defend",
        kicker: "STEP 3",
        title: "場で防御",
        detail: "場に未消耗の召喚獣がいれば、防御に使えます。『炉殻バサルトン』でライバルの攻撃を受け止めます。",
        focus: { kind: "defense" },
      };
    }
    return {
      id: "defend",
      kicker: "STEP 14",
      title: "手札で防御",
      detail: "場の召喚獣で受けない場面では、手札の召喚獣でも防御できます。手札防御に使ったカードはトラッシュへ行きます。",
      focus: { kind: "defense" },
    };
  }

  if (game.active === 1) {
    return rivalTurnStep(game);
  }

  if (player.field.length === 0) {
    const selected = selectedHumanHandCard(game);
    if (selected?.type === "ai") {
      return {
        id: "play-summon",
        kicker: "STEP 1",
        title: "場に出す",
        detail: "選択した召喚獣を場に出します。召喚コストは power と同じで、『炉殻バサルトン』はコスト2です（このチュートリアルは練習用に2アクションで開始しています。通常の先攻1ターン目は1アクションです）。",
        focus: { kind: "action", action: "play" },
      };
    }
    return {
      id: "select-summon",
      kicker: "STEP 1",
      title: "召喚獣を選択",
      detail: "手札の召喚獣を選んでください。ここでは『炉殻バサルトン』を選んで場に出す流れを確認します。",
      focus: { kind: "hand-card", ownerIndex: 0, cardId: "AI-FIRE-2" },
    };
  }

  if (game.turn === 1) {
    return {
      id: "end-first-turn",
      kicker: "STEP 1",
      title: "ターン終了",
      detail: "先攻1ターン目は攻撃できません。召喚獣を出したらターンを終了します。",
      focus: { kind: "action", action: "end" },
    };
  }

  if (canActivePlayerAttack(game) && player.field.some((_, index) => !player.spentFieldIndexes.has(index)) && rival.life >= CONFIG.life) {
    return {
      id: "attack",
      kicker: "STEP 4",
      title: "攻撃する",
      detail: "場の召喚獣を選び、攻撃ボタンを押します。攻撃後はその召喚獣が消耗します。",
      focus: selectedHumanFieldCardReady(game) ? { kind: "action", action: "attack" } : { kind: "field-card", ownerIndex: 0, index: firstReadyFieldIndex(player.spentFieldIndexes, player.field.length) },
    };
  }

  if (!player.discard.some((card) => card.id === "CMD-FIRE-RITE") && player.hand.some((card) => card.id === "CMD-FIRE-RITE")) {
    const selected = selectedHumanHandCard(game);
    if (selected?.id === "CMD-FIRE-RITE") {
      return {
        id: "command",
        kicker: "STEP 5",
        title: "術式を発動する",
        detail: "術式は1回使い切りのカードです。場に火の召喚獣がいるので、『紅蓮圧壊術』を発動できます。",
        focus: { kind: "action", action: "command" },
      };
    }
    return {
      id: "command",
      kicker: "STEP 5",
      title: "術式を確認",
      detail: "チュートリアルでは発動する術式も固定します。『紅蓮圧壊術』を発動する準備をします。",
      focus: { kind: "hand-card", ownerIndex: 0, cardId: "CMD-FIRE-RITE" },
    };
  }

  if (!player.discard.some((card) => card.id === "AI-FIRE-1C") && !player.chargeUsed && canUseCharge(game, player)) {
    const selected = selectedHumanHandCard(game);
    if (selected?.id === "AI-FIRE-1C" && canChargeCard(selected)) {
      return {
        id: "charge",
        kicker: "STEP 6",
        title: "チャージする",
        detail: "チャージは手札1枚をトラッシュへ送り、このターンのアクションを1増やします。チャージしたターンは攻撃できないので、非攻撃行動に使います。",
        focus: { kind: "action", action: "charge" },
      };
    }
    return {
      id: "select-charge",
      kicker: "STEP 6",
      title: "チャージ札を確認",
      detail: "チュートリアルでは『炉芯鼠チロ』をチャージに使います。固定カードでアクションを増やします。",
      focus: { kind: "hand-card", ownerIndex: 0, cardId: "AI-FIRE-1C" },
    };
  }

  if (player.chargeUsed && game.actionsRemaining > 0 && !player.memory && player.hand.some((card) => card.id === "MEM-CACHE")) {
    const selected = selectedHumanHandCard(game);
    if (selected?.id === "MEM-CACHE") {
      return {
        id: "play-post-charge-memory",
        kicker: "STEP 7",
        title: "追加アクションを使う",
        detail: "チャージで増えた1アクションを使い、『灯火の旅嚢』を遺物に配置します。チャージは行動回数を補うために使えます。",
        focus: { kind: "action", action: "play" },
      };
    }
    return {
      id: "select-post-charge-memory",
      kicker: "STEP 7",
      title: "追加アクションを確認",
      detail: "チャージで増えたアクションが残っています。『灯火の旅嚢』を選び、増えた行動回数を使ってみましょう。",
      focus: { kind: "hand-card", ownerIndex: 0, cardId: "MEM-CACHE" },
    };
  }

  if (player.memory?.id === "MEM-CACHE" && game.turn >= 5 && player.hand.some((card) => card.id === "AI-FIRE-3B")) {
    const selected = selectedHumanHandCard(game);
    if (selected?.id === "AI-FIRE-3B") {
      return {
        id: "upgrade",
        kicker: "STEP 9",
        title: "2Aで直接召喚",
        detail: "まずは『噴角イグナロス』を通常どおり3アクションで場に出します。次のターンに大型へアップグレードした時との差を確認します。",
        focus: { kind: "action", action: "play" },
      };
    }
    return {
      id: "select-upgrade",
      kicker: "STEP 9",
      title: "中型を直接出す",
      detail: "ターン開始時に『灯火の旅嚢』が手札を補充しました。『噴角イグナロス』を選び、3アクションで直接場に出します。",
      focus: { kind: "hand-card", ownerIndex: 0, cardId: "AI-FIRE-3B" },
    };
  }

  if (player.field.some((card) => card.id === "AI-FIRE-3B") && game.active === 0 && game.turn === 5) {
    return {
      id: "end-after-power3-upgrade",
      kicker: "STEP 10",
      title: "直接召喚を終える",
      detail: "『噴角イグナロス』を直接出すと3アクションを使い切ります。ターンを渡し、次の自分ターンで大型アップグレードの軽さを確認します。",
      focus: { kind: "action", action: "end" },
    };
  }

  if (player.field.some((card) => card.id === "AI-FIRE-3B") && player.hand.some((card) => card.id === "AI-FIRE-4") && game.actionsRemaining > 0) {
    const selected = selectedHumanHandCard(game);
    if (selected?.id === "AI-FIRE-4") {
      return {
        id: "upgrade-power4",
        kicker: "STEP 12",
        title: "大型へアップグレード",
        detail: "前のターンに『噴角イグナロス』を場に出していたので、『終火の影ヴァルガ』へ1アクションでアップグレードできます。直接出す3アクションとの差を確認します。",
        focus: { kind: "action", action: "upgrade" },
      };
    }
    return {
      id: "select-power4-upgrade",
      kicker: "STEP 12",
      title: "大型カードのコスト",
      detail: "『終火の影ヴァルガ』を選んでください。大型召喚獣は直接出すと重いですが、場の中型を元にすれば1アクションで出せます。",
      focus: { kind: "hand-card", ownerIndex: 0, cardId: "AI-FIRE-4" },
    };
  }

  if (player.field.some((card) => card.id === "AI-FIRE-4") && canActivePlayerAttack(game) && game.active === 0 && game.turn === 7 && game.actionsRemaining > 0) {
    const spareAttackerIndex = player.field.findIndex((card, index) => card.id === "AI-FIRE-2" && !player.spentFieldIndexes.has(index));
    if (spareAttackerIndex >= 0) {
      return {
        id: "saved-action-attack",
        kicker: "STEP 13",
        title: "浮いた行動を使う",
        detail: "『終火の影ヴァルガ』を1アクションで出せたので、残った1アクションで『炉殻バサルトン』も攻撃できます。これがアップグレードで行動が浮く強みです。",
        focus: selectedHumanFieldCardByIdReady(game, "AI-FIRE-2") ? { kind: "action", action: "attack" } : { kind: "field-card", ownerIndex: 0, index: spareAttackerIndex },
      };
    }
  }

  if (player.field.some((card) => card.id === "AI-FIRE-4") && game.active === 0 && game.turn === 7) {
    return {
      id: "end-after-upgrade",
      kicker: "STEP 14",
      title: "手札防御を待つ",
      detail: "大型召喚獣を場に出し、浮いたアクションも使えました。ターンを渡し、次は手札の召喚獣で防御する流れを確認します。",
      focus: { kind: "action", action: "end" },
    };
  }

  if (
    game.turn >= 9
    && game.active === 0
    && player.hand.some((card) => card.id === "CMD-PURGE")
    && rival.field.some((_, index) => rival.spentFieldIndexes.has(index))
  ) {
    const selected = selectedHumanHandCard(game);
    if (selected?.id === "CMD-PURGE") {
      return {
        id: "purge-command",
        kicker: "STEP 15",
        title: "追撃粛清を放つ",
        detail: "『追撃粛清』は消耗中（横向き）の相手召喚獣1体を、重ねたカードごとトラッシュへ送る術式です。攻撃してきた『碑甲ガメル』を粛清しましょう。",
        focus: { kind: "action", action: "command" },
      };
    }
    return {
      id: "purge-command",
      kicker: "STEP 15",
      title: "追撃粛清を確認",
      detail: "前のターンに攻撃してきた相手の召喚獣は消耗しています。手札の『追撃粛清』を選んでください。消耗した召喚獣を追撃で討ち取れます。",
      focus: { kind: "hand-card", ownerIndex: 0, cardId: "CMD-PURGE" },
    };
  }

  if (
    game.turn >= 9
    && game.active === 0
    && canActivePlayerAttack(game)
    && rival.field.length > 0
    && player.field.some((card, index) => card.id === "AI-FIRE-2" && !player.spentFieldIndexes.has(index))
  ) {
    const strikerIndex = player.field.findIndex((card, index) => card.id === "AI-FIRE-2" && !player.spentFieldIndexes.has(index));
    return {
      id: "strike-monster",
      kicker: "STEP 16",
      title: "モンスター攻撃",
      detail: "攻撃対象には相手プレイヤーだけでなく相手の召喚獣も選べます。攻撃値が相手の防御値を上回れば討伐、同値なら相打ちです。『炉殻バサルトン』で相手の壁を討伐しましょう。",
      focus: selectedHumanFieldCardByIdReady(game, "AI-FIRE-2") ? { kind: "action", action: "attack" } : { kind: "field-card", ownerIndex: 0, index: strikerIndex },
    };
  }

  if (canActivePlayerAttack(game) && player.field.some((card) => card.id === "AI-FIRE-4")) {
    const power4Index = player.field.findIndex((card) => card.id === "AI-FIRE-4");
    return {
      id: "power4-attack",
      kicker: "STEP 17",
      title: "切札の4点パンチ",
      detail: "防がれなかった攻撃のダメージは、攻撃した召喚獣の power と同じです。『終火の影ヴァルガ』は power 4 なので4点ダメージ。受けた側はその点数だけドローし（ブレイクドロー）、power 4 は攻撃後に退場します。",
      focus: selectedHumanFieldCardReady(game) ? { kind: "action", action: "attack" } : { kind: "field-card", ownerIndex: 0, index: power4Index },
    };
  }

  if (game.turn >= 9 && game.active === 0 && player.discard.some((card) => card.id === "AI-FIRE-4")) {
    return {
      id: "end-after-power4",
      kicker: "STEP 17",
      title: "ターンを渡す",
      detail: "4点パンチとブレイクドローを確認しました。最後に、自分が防御せずに攻撃を受けたときのブレイクドローを体験します。ターンを終了してください。",
      focus: { kind: "action", action: "end" },
    };
  }

  return {
    id: "end-after-memory",
    kicker: "STEP 8",
    title: "継続効果を見る",
    detail: "『灯火の旅嚢』は自分のターン開始時に手札が少ないとカードを引けます。ターンを終了して、次の自分ターンで確認します。",
    focus: { kind: "action", action: "end" },
  };
}

export function tutorialForcedAiAction(game: GameState): AiAction | null {
  if (game.active !== 1 || game.pendingAttack || game.pendingTarget || game.winner !== null || game.draw) return null;
  const rival = game.players[1];
  const canAffordPlay = (handIndex: number) => {
    const card = rival.hand[handIndex];
    return Boolean(card) && playCost(card, game) <= game.actionsRemaining;
  };
  if (game.turn === 2 && game.actionsRemaining > 0) {
    const firstAttackerIndex = rival.field.findIndex((card) => card.id === "AI-EARTH-1B");
    if (firstAttackerIndex >= 0 && canActivePlayerAttack(game) && !rival.spentFieldIndexes.has(firstAttackerIndex)) {
      return { type: "attack", index: firstAttackerIndex };
    }
    const firstAttackerInHand = rival.hand.findIndex((card) => card.id === "AI-EARTH-1B");
    if (firstAttackerInHand >= 0 && !rival.discard.some((card) => card.id === "AI-EARTH-1B") && canAffordPlay(firstAttackerInHand)) {
      return { type: "play", index: firstAttackerInHand };
    }
    const nextAttackerInHand = rival.hand.findIndex((card) => card.id === "AI-EARTH-2");
    if (nextAttackerInHand >= 0 && !rival.field.some((card) => card.id === "AI-EARTH-2") && canAffordPlay(nextAttackerInHand)) {
      return { type: "play", index: nextAttackerInHand };
    }
  }
  if (game.turn === 4 && game.actionsRemaining > 0 && !rival.field.some((card) => card.id === "AI-EARTH-2")) {
    const nextAttackerInHand = rival.hand.findIndex((card) => card.id === "AI-EARTH-2");
    if (nextAttackerInHand >= 0 && canAffordPlay(nextAttackerInHand)) return { type: "play", index: nextAttackerInHand };
  }
  if (game.turn === 8 && game.actionsRemaining > 0) {
    const wallInHand = rival.hand.findIndex((card) => card.id === "AI-EARTH-1");
    if (wallInHand >= 0 && !rival.field.some((card) => card.id === "AI-EARTH-1") && canAffordPlay(wallInHand)) {
      return { type: "play", index: wallInHand };
    }
  }
  if (
    game.turn === 8
    && game.players[1].field[0]
    && canActivePlayerAttack(game)
    && game.actionsRemaining > 0
    && !game.players[1].spentFieldIndexes.has(0)
  ) {
    return { type: "attack", index: 0 };
  }
  if (game.turn === 10 && game.actionsRemaining > 0) {
    const gnomeInHand = rival.hand.findIndex((card) => card.id === "AI-EARTH-2C");
    if (gnomeInHand >= 0 && !rival.field.some((card) => card.id === "AI-EARTH-2C") && canAffordPlay(gnomeInHand)) {
      return { type: "play", index: gnomeInHand };
    }
    const attackerIndex = game.players[1].field.findIndex(
      (card, index) => card.id === "AI-EARTH-2C" && !game.players[1].spentFieldIndexes.has(index),
    );
    if (attackerIndex >= 0 && canActivePlayerAttack(game)) {
      return { type: "attack", index: attackerIndex };
    }
  }
  return { type: "end" };
}

function selectedHumanHandCard(game: GameState): Card | null {
  if (game.selected?.zone !== "hand" || game.selected.ownerIndex !== 0) return null;
  return game.players[0].hand[game.selected.index] ?? null;
}

function selectedHumanFieldCardReady(game: GameState): boolean {
  if (game.selected?.zone !== "field" || game.selected.ownerIndex !== 0) return false;
  return Boolean(game.players[0].field[game.selected.index]) && !game.players[0].spentFieldIndexes.has(game.selected.index);
}

function selectedHumanFieldCardByIdReady(game: GameState, cardId: string): boolean {
  if (!selectedHumanFieldCardReady(game) || game.selected?.zone !== "field") return false;
  return game.players[0].field[game.selected.index]?.id === cardId;
}

function tutorialPracticeComplete(game: GameState): boolean {
  const player = game.players[0];
  return player.discard.some((card) => card.id === "AI-FIRE-4") && player.life < CONFIG.life;
}

function cloneCards(cardIds: string[]): Card[] {
  return cardIds.map((cardId) => {
    const card = CARD_BY_ID.get(cardId);
    if (!card) throw new Error(`Unknown tutorial card id: ${cardId}`);
    return cloneCard(card);
  });
}

function firstReadyFieldIndex(spent: Set<number>, fieldLength: number): number {
  for (let index = 0; index < fieldLength; index += 1) {
    if (!spent.has(index)) return index;
  }
  return 0;
}

function completeStep(): TutorialStep {
  return {
    id: "complete",
    kicker: "COMPLETE",
    title: "チュートリアル完了",
    detail: "追撃粛清、モンスター攻撃、切札の4点パンチ、ブレイクドローまで確認しました。内容を確認したら完了して、通常の対戦準備へ戻ります。",
  };
}

function rivalTurnStep(game: GameState): TutorialStep {
  const turn = game.turn;
  if (turn <= 2) {
    if (!game.players[1].field.some((card) => card.id === "AI-EARTH-1B") && !game.players[1].discard.some((card) => card.id === "AI-EARTH-1B")) {
      return {
        id: "watch-rival",
        kicker: "STEP 2",
        title: "ライバルの召喚を見る",
        detail: "ライバルも最初は場が空です。まず召喚獣を場に出し、その後の攻撃を場で防御します。",
      };
    }
    if (game.players[1].discard.some((card) => card.id === "AI-EARTH-1B")) {
      if (!game.players[1].field.some((card) => card.id === "AI-EARTH-2")) {
        return {
          id: "watch-rival",
          kicker: "STEP 3",
          title: "防御後の処理を見る",
          detail: "場防御が終わりました。ライバルの残り行動で次の攻撃役を場に出し、ターン終了を待ちます。",
        };
      }
      return {
        id: "watch-rival",
        kicker: "STEP 3",
        title: "防御後の処理を見る",
        detail: "場防御が終わりました。攻撃した召喚獣はトラッシュへ行き、防御した『炉殻バサルトン』は場に残って消耗します。",
      };
    }
    return {
      id: "watch-rival",
      kicker: "STEP 2",
      title: "ライバルの攻撃を見る",
      detail: "ライバルが場に出した召喚獣で攻撃します。最初の攻撃を受けて、防御の流れを確認しましょう。",
    };
  }
  if (turn <= 4) {
    if (!game.players[1].field.some((card) => card.id === "AI-EARTH-2") && game.players[1].hand.some((card) => card.id === "AI-EARTH-2")) {
      return {
        id: "watch-rival",
        kicker: "STEP 8",
        title: "次の攻撃役を見る",
        detail: "ライバルが次の攻撃役を場に出します。ターン終了後に『灯火の旅嚢』の継続効果を確認します。",
      };
    }
    return {
      id: "watch-rival",
      kicker: "STEP 8",
      title: "遺物効果を待つ",
      detail: "ターンを渡すと次の自分ターンに進みます。『灯火の旅嚢』の継続効果で手札が補充される流れを確認します。",
    };
  }
  if (turn <= 6) {
    return {
      id: "watch-rival",
      kicker: "STEP 11",
      title: "中型後の相手ターン",
      detail: "『噴角イグナロス』を場に置けました。次の自分ターンで大型アップグレードの効率を確認します。",
    };
  }
  if (turn <= 8) {
    return {
      id: "watch-rival",
      kicker: "STEP 14",
      title: "手札防御を待つ",
      detail: "大型召喚獣を場に出し、浮いた行動も使いました。今度はライバルの攻撃を手札の召喚獣で受け止めます。",
    };
  }
  return {
    id: "watch-rival",
    kicker: "STEP 18",
    title: "最後の攻撃を受ける",
    detail: "ライバルが最後の攻撃を仕掛けてきます。今回は防御せずに受けて、被弾時のブレイクドローを確認します。",
  };
}
