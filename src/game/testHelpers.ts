import {
  CARD_BY_ID,
  CONFIG,
  type Card,
  type GameState,
  cloneCard,
  createGame,
  makeRng,
} from "../game";

export function card(id: string): Card {
  const found = CARD_BY_ID.get(id);
  if (!found) throw new Error(`Unknown test card: ${id}`);
  return cloneCard(found);
}

export function duelGame(actions = 3): GameState {
  const game = createGame(
    1,
    { kind: "custom", name: "Test Player", cardIds: ["AI-FIRE-1"] },
    { kind: "custom", name: "Test Rival", cardIds: ["AI-WATER-1"] },
  );
  game.rng = makeRng(999);
  game.active = 0;
  game.turn = 2;
  game.actionsRemaining = actions;
  game.chargedActionsRemaining = 0;
  game.winner = null;
  game.draw = false;
  game.selected = null;
  game.pendingAttack = null;
  game.pendingTarget = null;
  game.log = [];
  game.players.forEach((player, index) => {
    player.isHuman = index === 0;
    player.life = CONFIG.life;
    player.deck = [card(index === 0 ? "AI-FIRE-1" : "AI-WATER-1")];
    player.hand = [];
    player.field = [];
    player.fieldStacks = [];
    player.memory = null;
    player.discard = [];
    player.handDefensesUsed = 0;
    player.chargeUsed = false;
    player.spentFieldIndexes.clear();
    player.power3RecoveryDelayedFieldIndexes.clear();
  });
  return game;
}
