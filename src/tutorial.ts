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
  | "select-second-summon"
  | "play-second-summon"
  | "command"
  | "select-charge"
  | "charge"
  | "select-post-charge-memory"
  | "play-post-charge-memory"
  | "end-after-memory"
  | "field-defend"
  | "attack"
  | "end-after-attack"
  | "select-upgrade"
  | "upgrade"
  | "end-after-power3-upgrade"
  | "defend"
  | "select-power4-upgrade"
  | "upgrade-power4"
  | "purge-command"
  | "saved-action-attack"
  | "end-after-upgrade"
  | "take-break-draw"
  | "strike-monster"
  | "power4-attack"
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

// 先攻1ターン目は通常ルールどおり1アクション。最初の教材はコスト1の
// 『火花一番ピリカ』(power 1)にして、1アクションでちょうど出せるようにする。
const PLAYER_TUTORIAL_HAND = [
  "AI-FIRE-1B",
  "AI-FIRE-2",
  "MEM-CACHE",
  "AI-FIRE-2C",
  "CMD-FIRE-RITE",
];

// 末尾が最初のドロー。ドロー順:
//   d0 AI-FIRE-2B (T3 通常ドロー / T8 手札防御役)
//   d1 AI-WATER-2 (T5 通常ドロー)
//   d2 AI-FIRE-3B (T5 旅嚢ドロー / T7 直接召喚教材)
//   d3 CMD-PURGE  (T7 通常ドロー / T9 粛清教材)
//   d4 AI-FIRE-4  (T9 通常ドロー / T9 アップグレード教材)
//   d5 AI-WATER-1B (T9 旅嚢ドロー)、以降はブレイクドロー用フィラー
const PLAYER_TUTORIAL_DECK = [
  "AI-FIRE-1B",
  "AI-WATER-3B",
  "AI-FIRE-2",
  "CMD-OPTIMIZE",
  "AI-WATER-1C",
  "AI-WATER-3",
  "AI-FIRE-3",
  "AI-WATER-2B",
  "AI-FIRE-1B",
  "AI-WATER-1B",
  "AI-FIRE-4",
  "CMD-PURGE",
  "AI-FIRE-3B",
  "AI-WATER-2",
  "AI-FIRE-2B",
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

// 末尾が最初のドロー。r0(T2)〜r4(T10) は power 2 以下に固定し、
// 固定進行中のライバル手札に大型が混ざらないようにする。
//   r0 AI-EARTH-1B (T2 / 紅蓮圧壊術のトラッシュ対象)
//   r1 AI-EARTH-1  (T4 / T8 に出す壁・モンスター攻撃の教材)
//   r2 AI-WIND-1B  (T6)
//   r3 AI-EARTH-2B (T8)
//   r4 AI-WIND-2   (T10)
const RIVAL_TUTORIAL_DECK = [
  "AI-EARTH-4",
  "AI-WIND-3",
  "CMD-DISRUPT",
  "AI-WIND-2B",
  "AI-EARTH-3",
  "AI-WIND-2",
  "AI-EARTH-2B",
  "AI-WIND-1B",
  "AI-EARTH-1",
  "AI-EARTH-1B",
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
  addLog(game, "チュートリアル対戦を開始。ルールは通常対戦と同じで、先攻1ターン目のアクションは1つです。まずは召喚獣を場に出しましょう。");
  return game;
}

export function currentTutorialStep(game: GameState): TutorialStep {
  const player = game.players[0];
  const rival = game.players[1];
  if (game.winner !== null || game.draw) return completeStep();

  if (game.pendingAttack?.defenderIndex === 0) {
    if (game.turn <= 4) {
      return {
        id: "field-defend",
        kicker: "STEP 9",
        title: "場で防御",
        detail: "場に未消耗の召喚獣がいれば、防御に使えます。防御値が攻撃値以上なら防御成功、不足しても差分ダメージまで軽減できます。『炉殻バサルトン』(防御値2)でライバルの攻撃を受け止めましょう。",
        focus: { kind: "defense" },
      };
    }
    if (game.turn <= 8) {
      return {
        id: "defend",
        kicker: "STEP 15",
        title: "手札で防御",
        detail: "手札の power 3 以下の召喚獣でも防御できます。手札防御は、自分プレイヤーへの攻撃も自分の召喚獣への攻撃も防げますが、使えるのは1ターンに1回だけです。power 4 は手札防御に使えません。防御に使ったカードはトラッシュへ行きます。『ブレイズランナー』で受け止めましょう。",
        focus: { kind: "defense" },
      };
    }
    return {
      id: "take-break-draw",
      kicker: "STEP 20",
      title: "防御せず受ける",
      detail: "今回はあえて防御しません。「防御しない」を選ぶと攻撃が通り、受けたダメージ1点につき手札を1枚引けます（ブレイクドロー）。劣勢側の巻き返しの資源になります。",
      focus: { kind: "defense" },
    };
  }

  if (game.active === 1) {
    return rivalTurnStep(game);
  }

  if (game.turn === 1) {
    if (player.field.length === 0) {
      const selected = selectedHumanHandCard(game);
      if (selected?.id === "AI-FIRE-1B") {
        return {
          id: "play-summon",
          kicker: "STEP 1",
          title: "場に出す",
          detail: "選択した召喚獣を場に出します。召喚コストは power と同じで、『火花一番ピリカ』はコスト1。先攻1ターン目の1アクションでちょうど出せます。",
          focus: { kind: "action", action: "play" },
        };
      }
      return {
        id: "select-summon",
        kicker: "STEP 1",
        title: "召喚獣を選択",
        detail: "手札の召喚獣を選んでください。ここでは power 1 の『火花一番ピリカ』を選んで場に出す流れを確認します。",
        focus: { kind: "hand-card", ownerIndex: 0, cardId: "AI-FIRE-1B" },
      };
    }
    return {
      id: "end-first-turn",
      kicker: "STEP 2",
      title: "ターン終了",
      detail: "先攻の最初のターンに使えるアクションは1つだけで、攻撃もできません。2回目以降の自分のターンは毎回3アクション使えます（後攻は最初のターンから3アクション）。ターンを終了しましょう。",
      focus: { kind: "action", action: "end" },
    };
  }

  if (game.turn === 3) {
    if (!player.field.some((card) => card.id === "AI-FIRE-2")) {
      const selected = selectedHumanHandCard(game);
      if (selected?.id === "AI-FIRE-2") {
        return {
          id: "play-second-summon",
          kicker: "STEP 4",
          title: "コスト2を場に出す",
          detail: "『炉殻バサルトン』を場に出します。召喚コストは power と同じなので2アクション使い、残りは1アクションです。",
          focus: { kind: "action", action: "play" },
        };
      }
      return {
        id: "select-second-summon",
        kicker: "STEP 4",
        title: "3アクションで展開",
        detail: "このターンからは毎ターン3アクション使えます。今度はコスト2の『炉殻バサルトン』を選んで、より大きな召喚獣を出しましょう。",
        focus: { kind: "hand-card", ownerIndex: 0, cardId: "AI-FIRE-2" },
      };
    }

    if (player.hand.some((card) => card.id === "CMD-FIRE-RITE")) {
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

    if (!player.chargeUsed && canUseCharge(game, player) && player.hand.some((card) => card.id === "AI-FIRE-2C")) {
      const selected = selectedHumanHandCard(game);
      if (selected?.id === "AI-FIRE-2C" && canChargeCard(selected)) {
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
        detail: "チュートリアルでは『烽火狐フレンネ』をチャージに使います。固定カードでアクションを増やします。",
        focus: { kind: "hand-card", ownerIndex: 0, cardId: "AI-FIRE-2C" },
      };
    }

    if (!player.memory && player.hand.some((card) => card.id === "MEM-CACHE")) {
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

    return {
      id: "end-after-memory",
      kicker: "STEP 8",
      title: "継続効果を見る",
      detail: "『灯火の旅嚢』は自分のターン開始時に手札が少ないとカードを引けます。ターンを終了して、次の自分ターンで確認します。",
      focus: { kind: "action", action: "end" },
    };
  }

  if (game.turn === 5) {
    const attackerIndex = readyFieldIndexById(game, "AI-FIRE-2");
    if (canActivePlayerAttack(game) && attackerIndex >= 0 && rival.life >= CONFIG.life) {
      return {
        id: "attack",
        kicker: "STEP 10",
        title: "攻撃する",
        detail: "『灯火の旅嚢』の補充を確認したら攻撃です。『炉殻バサルトン』を選んで攻撃ボタンを押します。防御されなかった攻撃は power と同じダメージを与え、攻撃後はその召喚獣が消耗します。",
        focus: selectedHumanFieldCardByIdReady(game, "AI-FIRE-2") ? { kind: "action", action: "attack" } : { kind: "field-card", ownerIndex: 0, index: attackerIndex },
      };
    }
    return {
      id: "end-after-attack",
      kicker: "STEP 11",
      title: "アクションを温存",
      detail: "アクションが余っていても、有効な手がなければ無理に使い切る必要はありません。ターンを終了しましょう。",
      focus: { kind: "action", action: "end" },
    };
  }

  if (game.turn === 7) {
    if (!player.field.some((card) => card.id === "AI-FIRE-3B") && player.hand.some((card) => card.id === "AI-FIRE-3B")) {
      const selected = selectedHumanHandCard(game);
      if (selected?.id === "AI-FIRE-3B") {
        return {
          id: "upgrade",
          kicker: "STEP 13",
          title: "3Aで直接召喚",
          detail: "まずは『噴角イグナロス』を通常どおり3アクションで場に出します。次のターンに大型へアップグレードした時との差を確認します。",
          focus: { kind: "action", action: "play" },
        };
      }
      return {
        id: "select-upgrade",
        kicker: "STEP 13",
        title: "中型を直接出す",
        detail: "手札の『噴角イグナロス』を選び、3アクションで直接場に出します。中型以上は素出しすると重いことを体感しましょう。",
        focus: { kind: "hand-card", ownerIndex: 0, cardId: "AI-FIRE-3B" },
      };
    }
    return {
      id: "end-after-power3-upgrade",
      kicker: "STEP 14",
      title: "直接召喚を終える",
      detail: "『噴角イグナロス』を直接出すと3アクションを使い切ります。ターンを渡し、次の自分ターンで大型アップグレードの軽さを確認します。",
      focus: { kind: "action", action: "end" },
    };
  }

  if (game.turn === 9) {
    if (player.field.some((card) => card.id === "AI-FIRE-3B") && player.hand.some((card) => card.id === "AI-FIRE-4") && game.actionsRemaining > 0) {
      const selected = selectedHumanHandCard(game);
      if (selected?.id === "AI-FIRE-4") {
        return {
          id: "upgrade-power4",
          kicker: "STEP 16",
          title: "大型へアップグレード",
          detail: "前のターンに『噴角イグナロス』を場に出していたので、『終火の影ヴァルガ』へ1アクションでアップグレードできます。直接出す重さとの差を確認します。",
          focus: { kind: "action", action: "upgrade" },
        };
      }
      return {
        id: "select-power4-upgrade",
        kicker: "STEP 16",
        title: "大型カードのコスト",
        detail: "『終火の影ヴァルガ』を選んでください。大型召喚獣は直接出すと重いですが、場の中型を元にすれば1アクションで出せます。",
        focus: { kind: "hand-card", ownerIndex: 0, cardId: "AI-FIRE-4" },
      };
    }

    if (player.hand.some((card) => card.id === "CMD-PURGE") && rival.field.some((_, index) => rival.spentFieldIndexes.has(index))) {
      const selected = selectedHumanHandCard(game);
      if (selected?.id === "CMD-PURGE") {
        return {
          id: "purge-command",
          kicker: "STEP 17",
          title: "追撃粛清を放つ",
          detail: "『追撃粛清』は消耗中（横向き）の相手召喚獣1体を、重ねたカードごとトラッシュへ送る術式です。攻撃してきた『碑甲ガメル』を粛清しましょう。",
          focus: { kind: "action", action: "command" },
        };
      }
      return {
        id: "purge-command",
        kicker: "STEP 17",
        title: "追撃粛清を確認",
        detail: "前のターンに攻撃してきた相手の召喚獣は消耗しています。手札の『追撃粛清』を選んでください。消耗した召喚獣を追撃で討ち取れます。",
        focus: { kind: "hand-card", ownerIndex: 0, cardId: "CMD-PURGE" },
      };
    }

    const savedAttackerIndex = readyFieldIndexById(game, "AI-FIRE-2");
    if (canActivePlayerAttack(game) && savedAttackerIndex >= 0 && game.actionsRemaining > 0) {
      return {
        id: "saved-action-attack",
        kicker: "STEP 18",
        title: "浮いた行動を使う",
        detail: "『終火の影ヴァルガ』を1アクションで出せたので、残った1アクションで『炉殻バサルトン』も攻撃できます。これがアップグレードで行動が浮く強みです。",
        focus: selectedHumanFieldCardByIdReady(game, "AI-FIRE-2") ? { kind: "action", action: "attack" } : { kind: "field-card", ownerIndex: 0, index: savedAttackerIndex },
      };
    }

    return {
      id: "end-after-upgrade",
      kicker: "STEP 19",
      title: "被弾に備える",
      detail: "アップグレードと浮いた行動を確認しました。次のライバルの攻撃は、あえて防御せずに受けてみます。ターンを終了してください。",
      focus: { kind: "action", action: "end" },
    };
  }

  const strikerIndex = readyFieldIndexById(game, "AI-FIRE-2");
  if (canActivePlayerAttack(game) && strikerIndex >= 0 && rival.field.length > 0) {
    return {
      id: "strike-monster",
      kicker: "STEP 21",
      title: "モンスター攻撃",
      detail: "攻撃対象には相手プレイヤーだけでなく相手の召喚獣も選べます。攻撃値が相手の防御値を上回れば討伐、同値なら相打ちです。実戦では、相手が場の別召喚獣でかばったり、手札防御で止めたりすることがあります。『炉殻バサルトン』で相手の壁を討伐しましょう。",
      focus: selectedHumanFieldCardByIdReady(game, "AI-FIRE-2") ? { kind: "action", action: "attack" } : { kind: "field-card", ownerIndex: 0, index: strikerIndex },
    };
  }

  const power4Index = readyFieldIndexById(game, "AI-FIRE-4");
  if (canActivePlayerAttack(game) && power4Index >= 0) {
    return {
      id: "power4-attack",
      kicker: "STEP 22",
      title: "切札でとどめ",
      detail: "『終火の影ヴァルガ』は power 4 なので4点ダメージ。ライバルの残りライフはちょうど4——とどめの一撃です！受けた側はダメージ分だけドローできますが（ブレイクドロー）、ライフが0になれば敗北。power 4 は攻撃後に退場します。",
      focus: selectedHumanFieldCardReady(game) ? { kind: "action", action: "attack" } : { kind: "field-card", ownerIndex: 0, index: power4Index },
    };
  }

  return {
    id: "end-after-attack",
    kicker: "STEP -",
    title: "ターンを終了",
    detail: "このターンにできる教習は完了しました。ターンを終了して進行を続けましょう。",
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
  const readyAttackerIndex = (cardId: string) =>
    rival.field.findIndex((card, index) => card.id === cardId && !rival.spentFieldIndexes.has(index));

  if (game.turn === 2 && game.actionsRemaining > 0) {
    const firstSummonInHand = rival.hand.findIndex((card) => card.id === "AI-EARTH-1B");
    if (
      firstSummonInHand >= 0
      && !rival.field.some((card) => card.id === "AI-EARTH-1B")
      && !rival.discard.some((card) => card.id === "AI-EARTH-1B")
      && canAffordPlay(firstSummonInHand)
    ) {
      return { type: "play", index: firstSummonInHand };
    }
  }
  if (game.turn === 4 && game.actionsRemaining > 0) {
    const attackerIndex = readyAttackerIndex("AI-EARTH-1B");
    if (attackerIndex >= 0 && canActivePlayerAttack(game)) {
      return { type: "attack", index: attackerIndex };
    }
  }
  if (game.turn === 6 && game.actionsRemaining > 0 && !rival.field.some((card) => card.id === "AI-EARTH-2")) {
    const nextAttackerInHand = rival.hand.findIndex((card) => card.id === "AI-EARTH-2");
    if (nextAttackerInHand >= 0 && canAffordPlay(nextAttackerInHand)) return { type: "play", index: nextAttackerInHand };
  }
  if (game.turn === 8 && game.actionsRemaining > 0) {
    const wallInHand = rival.hand.findIndex((card) => card.id === "AI-EARTH-1");
    if (wallInHand >= 0 && !rival.field.some((card) => card.id === "AI-EARTH-1") && canAffordPlay(wallInHand)) {
      return { type: "play", index: wallInHand };
    }
    const attackerIndex = readyAttackerIndex("AI-EARTH-2");
    if (attackerIndex >= 0 && canActivePlayerAttack(game)) {
      return { type: "attack", index: attackerIndex };
    }
  }
  if (game.turn === 10 && game.actionsRemaining > 0) {
    const gnomeInHand = rival.hand.findIndex((card) => card.id === "AI-EARTH-2C");
    if (gnomeInHand >= 0 && !rival.field.some((card) => card.id === "AI-EARTH-2C") && canAffordPlay(gnomeInHand)) {
      return { type: "play", index: gnomeInHand };
    }
    const attackerIndex = readyAttackerIndex("AI-EARTH-2C");
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

function readyFieldIndexById(game: GameState, cardId: string): number {
  const player = game.players[0];
  return player.field.findIndex((card, index) => card.id === cardId && !player.spentFieldIndexes.has(index));
}

function cloneCards(cardIds: string[]): Card[] {
  return cardIds.map((cardId) => {
    const card = CARD_BY_ID.get(cardId);
    if (!card) throw new Error(`Unknown tutorial card id: ${cardId}`);
    return cloneCard(card);
  });
}

function completeStep(): TutorialStep {
  return {
    id: "complete",
    kicker: "COMPLETE",
    title: "チュートリアル完了",
    detail: "場防御、手札防御、追撃粛清、モンスター攻撃、ブレイクドローを確認し、最後は切札の4点パンチで勝利しました。モンスター攻撃は場の別召喚獣でかばえることも覚えておきましょう。内容を確認したら完了して、通常の対戦準備へ戻ります。",
  };
}

function rivalTurnStep(game: GameState): TutorialStep {
  const turn = game.turn;
  if (turn <= 2) {
    if (!game.players[1].field.some((card) => card.id === "AI-EARTH-1B")) {
      return {
        id: "watch-rival",
        kicker: "STEP 3",
        title: "ライバルの召喚を見る",
        detail: "ライバルのターンです。後攻は最初のターンから3アクション使えます。ライバルも召喚獣を場に出して備えます。",
      };
    }
    return {
      id: "watch-rival",
      kicker: "STEP 3",
      title: "ライバルの準備を見る",
      detail: "ライバルは『芽吹きの杖ペルナ』を場に出してターンを終えます。次はこちらの3アクションの使い方を確認します。",
    };
  }
  if (turn <= 4) {
    if (game.players[1].discard.some((card) => card.id === "AI-EARTH-1B")) {
      return {
        id: "watch-rival",
        kicker: "STEP 9",
        title: "防御後の処理を見る",
        detail: "場防御に成功しました。攻撃した召喚獣はトラッシュへ行き、防御した『炉殻バサルトン』は場に残って消耗します。",
      };
    }
    return {
      id: "watch-rival",
      kicker: "STEP 9",
      title: "ライバルの攻撃を見る",
      detail: "ライバルが場の召喚獣で攻撃してきます。最初の攻撃を受けて、防御の流れを確認しましょう。",
    };
  }
  if (turn <= 6) {
    return {
      id: "watch-rival",
      kicker: "STEP 12",
      title: "次の攻撃役を見る",
      detail: "ライバルが次の攻撃役『碑甲ガメル』を場に出します。次の自分ターンでは中型召喚獣を直接出してみます。",
    };
  }
  if (turn <= 8) {
    return {
      id: "watch-rival",
      kicker: "STEP 15",
      title: "手札防御を待つ",
      detail: "ライバルが壁を並べて攻撃してきます。今度は手札の召喚獣で受け止めます。",
    };
  }
  return {
    id: "watch-rival",
    kicker: "STEP 20",
    title: "最後の攻撃を受ける",
    detail: "ライバルが最後の攻撃を仕掛けてきます。今回は防御せずに受けて、被弾時のブレイクドローを確認します。",
  };
}
