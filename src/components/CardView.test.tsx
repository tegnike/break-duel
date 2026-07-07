import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { addTurnFieldAttackBonus, CARD_BY_ID, cloneCard, createGame, type Card } from "../game";
import { CardView } from "./CardView";

function card(id: string): Card {
  const found = CARD_BY_ID.get(id);
  if (!found) throw new Error(`Unknown test card: ${id}`);
  return cloneCard(found);
}

describe("CardView", () => {
  it("shows a sword attack bonus badge for cards with attack plus one", () => {
    const attacker = card("AI-FIRE-2");
    const html = renderToStaticMarkup(
      <CardView card={attacker} ownerIndex={0} zone="field" index={0} showCost={false} />,
    );

    expect(html).toContain("aria-label=\"戦闘時、攻撃値 +1\"");
    expect(html).toContain("<b>+1</b>");
  });

  it("shows a temporary attack bonus badge on tide-edge buffed field cards", () => {
    const attacker = card("AI-WATER-2");
    const game = createGame(
      1,
      { kind: "custom", name: "Test Player", cardIds: ["AI-WATER-2"] },
      { kind: "custom", name: "Test Rival", cardIds: ["AI-FIRE-1"] },
    );
    game.players[0].field = [attacker];
    addTurnFieldAttackBonus(game.players[0], 0, 2);

    const html = renderToStaticMarkup(
      <CardView card={attacker} ownerIndex={0} zone="field" index={0} game={game} showCost={false} />,
    );

    expect(html).toContain("aria-label=\"戦闘時、攻撃値 +2\"");
    expect(html).toContain("<b>+2</b>");
  });

  it("does not show attack or defense bonus badges while the card is in hand", () => {
    const attacker = card("AI-FIRE-2");
    const defender = card("AI-EARTH-2");
    const attackerHtml = renderToStaticMarkup(
      <CardView card={attacker} ownerIndex={0} zone="hand" index={0} showCost={false} />,
    );
    const defenderHtml = renderToStaticMarkup(
      <CardView card={defender} ownerIndex={0} zone="hand" index={1} showCost={false} />,
    );

    expect(attackerHtml).not.toContain("aria-label=\"攻撃値 +1\"");
    expect(defenderHtml).not.toContain("aria-label=\"場防御値 +1\"");
  });

  it("shows the temporary field defense bonus badge on charge-guarded field cards", () => {
    const guardedCard = card("AI-WIND-3B");
    const game = createGame(
      1,
      { kind: "custom", name: "Test Player", cardIds: ["AI-FIRE-1"] },
      { kind: "custom", name: "Test Rival", cardIds: ["AI-WIND-3B"] },
    );
    game.players[1].field = [guardedCard];
    game.players[1].chargeGuardedFieldIndexes.add(0);

    const html = renderToStaticMarkup(
      <CardView card={guardedCard} ownerIndex={1} zone="field" index={0} game={game} showCost={false} />,
    );

    expect(html).toContain("aria-label=\"場防御値 +1\"");
    expect(html).toContain("<b>+1</b>");
  });

  it("shows a shield defense bonus badge for cards with field defense plus one", () => {
    const defender = card("AI-EARTH-2");
    const html = renderToStaticMarkup(
      <CardView card={defender} ownerIndex={0} zone="field" index={0} showCost={false} />,
    );

    expect(html).toContain("aria-label=\"場防御値 +1\"");
    expect(html).toContain("<b>+1</b>");
  });

  it("shows Dolmo's conditional field defense badge while its owner has a memory", () => {
    const defender = card("AI-EARTH-2D");
    const game = createGame(
      1,
      { kind: "custom", name: "Test Player", cardIds: ["AI-EARTH-2D"] },
      { kind: "custom", name: "Test Rival", cardIds: ["AI-FIRE-1"] },
    );
    game.players[0].field = [defender];
    game.players[0].memory = card("MEM-CACHE");

    const html = renderToStaticMarkup(
      <CardView card={defender} ownerIndex={0} zone="field" index={0} game={game} showCost={false} />,
    );

    expect(html).toContain("aria-label=\"場防御値 +2\"");
    expect(html).toContain("<b>+2</b>");
  });

  it("stacks charge guard with the card's own field defense bonus", () => {
    const defender = card("AI-EARTH-2");
    const game = createGame(
      1,
      { kind: "custom", name: "Test Player", cardIds: ["AI-EARTH-2"] },
      { kind: "custom", name: "Test Rival", cardIds: ["AI-FIRE-1"] },
    );
    game.players[0].field = [defender];
    game.players[0].chargeGuardedFieldIndexes.add(0);

    const html = renderToStaticMarkup(
      <CardView card={defender} ownerIndex={0} zone="field" index={0} game={game} showCost={false} />,
    );

    expect(html).toContain("aria-label=\"場防御値 +2\"");
    expect(html).toContain("<b>+2</b>");
  });

  it("hides the action cost when cost display is disabled", () => {
    const target = card("AI-FIRE-1");
    const html = renderToStaticMarkup(
      <CardView card={target} ownerIndex={0} zone="hand" index={0} showCost={false} />,
    );

    expect(html).not.toContain(">1A</span>");
  });

  it("can hide the card set badge for in-duel card faces", () => {
    const target = card("AI-FIRE-1");
    const html = renderToStaticMarkup(
      <CardView card={target} ownerIndex={0} zone="field" index={0} showCost={false} showSetBadge={false} />,
    );

    expect(html).not.toContain("card-set-badge");
    expect(html).not.toContain("1弾");
  });

  it("does not show rarity for starter set cards", () => {
    const target = card("AI-FIRE-4");
    const html = renderToStaticMarkup(
      <CardView card={target} ownerIndex={0} zone="field" index={0} showCost={false} />,
    );

    expect(html).not.toContain("card-face-rarity");
    expect(html).not.toContain("card-rarity-ur");
  });

  it("shows the base rarity on the card face", () => {
    const target = card("AI-FIRE-4D");
    const html = renderToStaticMarkup(
      <CardView card={target} ownerIndex={0} zone="field" index={0} showCost={false} />,
    );

    expect(html).toContain("card-face-rarity rarity-ur");
    expect(html).toContain("card-rarity-ur");
    expect(html).toContain(">UR</span>");
  });

  it("shows the SR effect class on SR cards", () => {
    const target = card("AI-FIRE-3D");
    const html = renderToStaticMarkup(
      <CardView card={target} ownerIndex={0} zone="field" index={0} showCost={false} />,
    );

    expect(html).toContain("card-face-rarity rarity-sr");
    expect(html).toContain("card-rarity-sr");
  });

  it("can hide the base rarity on the card face", () => {
    const target = card("AI-FIRE-4D");
    const html = renderToStaticMarkup(
      <CardView card={target} ownerIndex={0} zone="field" index={0} showCost={false} showRarityBadge={false} />,
    );

    expect(html).not.toContain("card-face-rarity");
  });

  it("does not render action-state or spent text badges on the card face", () => {
    const target = card("AI-FIRE-2");
    const html = renderToStaticMarkup(
      <CardView card={target} ownerIndex={0} zone="field" index={0} actionState="usable" spent showCost={false} />,
    );

    expect(html).not.toContain("実行可");
    expect(html).not.toContain("チャージ可");
    expect(html).not.toContain("進化可");
    expect(html).not.toContain(">元</span>");
    expect(html).not.toContain("消耗");
  });
});
