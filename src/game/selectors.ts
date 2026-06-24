import { type Card, type GameState, activePlayer } from "../game";

export function selectedCardForDetail(game: GameState): Card | null {
  if (!game.selected) return null;
  const ownerIndex = game.selected.ownerIndex ?? 0;
  const player = game.players[ownerIndex];
  if (!player) return null;
  if (game.selected.zone === "hand") return player.hand[game.selected.index] ?? null;
  if (game.selected.zone === "field") return player.field[game.selected.index] ?? null;
  if (game.selected.zone === "memory") return player.memory ?? null;
  return null;
}

export function selectedHandCardName(game: GameState): string {
  const selected = game.selected?.zone === "hand" ? activePlayer(game).hand[game.selected.index] : null;
  return selected?.name ?? "";
}
