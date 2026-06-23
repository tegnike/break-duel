import { type Card, type GameState, activePlayer } from "../game";

export function selectedCardForDetail(game: GameState): Card | null {
  if (!game.selected) return null;
  if (game.selected.zone === "hand") return game.players[0].hand[game.selected.index] ?? null;
  if (game.selected.zone === "field") return game.players[0].field[game.selected.index] ?? null;
  return null;
}

export function selectedHandCardName(game: GameState): string {
  const selected = game.selected?.zone === "hand" ? activePlayer(game).hand[game.selected.index] : null;
  return selected?.name ?? "";
}
