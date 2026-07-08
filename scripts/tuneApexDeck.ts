// apex デッキ候補のランダム構築 + 変異チューニング。
// Python 版 scripts/tune_apex_deck.py の移植。
// 使い方:
//   npm run tune:apex -- --pool-size 220 --top 4 --screen-games 8 --league-games 80 --seed 810001 --out tmp/apex-tuning.json
// カスタムデッキ対戦は src/sim/runner.ts の DuelDeckSource 対応（createGame のカスタムデッキ機構）を使う。
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { CARD_BY_ID, DECKS, activeCardPool, aiCardValue } from "../src/game";
import type { Card, DeckId } from "../src/game";
import { SimRandom } from "../src/sim/random";
import { runMatch } from "../src/sim/runner";

const AI_SLOT_RANGE: [number, number] = [14, 18];
const MEMORY_SLOT_RANGE: [number, number] = [2, 3];
const EVENT_SLOT_MIN = 4;
const HIGH_POWER_LIMIT = 5;
const CARD_COUNT = 25;
const EXISTING_OPPONENTS: readonly DeckId[] = ["break", "control", "fire", "water", "wind", "earth"];

type Candidate = {
  name: string;
  cardIds: readonly string[];
  source: string;
};

type Args = {
  poolSize: number;
  top: number;
  screenGames: number;
  leagueGames: number;
  seed: number;
  out: string;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    poolSize: 220,
    top: 4,
    screenGames: 8,
    leagueGames: 80,
    seed: 810001,
    out: "tmp/apex-tuning.json",
  };
  let index = 0;
  const next = (name: string): string => {
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`--${name} には値が必要です。`);
    index += 2;
    return value;
  };
  const nextInt = (name: string): number => {
    const value = Number.parseInt(next(name), 10);
    if (!Number.isFinite(value)) throw new Error(`--${name} は整数で指定してください。`);
    return value;
  };
  while (index < argv.length) {
    const token = argv[index];
    switch (token) {
      case "--pool-size":
        args.poolSize = nextInt("pool-size");
        break;
      case "--top":
        args.top = nextInt("top");
        break;
      case "--screen-games":
        args.screenGames = nextInt("screen-games");
        break;
      case "--league-games":
        args.leagueGames = nextInt("league-games");
        break;
      case "--seed":
        args.seed = nextInt("seed");
        break;
      case "--out":
        args.out = next("out");
        break;
      default:
        throw new Error(`不明な引数: ${token}`);
    }
  }
  return args;
}

function cardById(cardId: string): Card {
  const card = CARD_BY_ID.get(cardId);
  if (!card) throw new Error(`Unknown card id: ${cardId}`);
  return card;
}

// Python 版 _sampling_value の移植: AI 評価値 + カード種別ごとの補正。
const EVENT_SAMPLING_BONUS: Record<string, number> = {
  trinity: 82,
  fire_rite: 64,
  water_rite: 68,
  wind_rite: 74,
  earth_rite: 54,
  disrupt: 76,
  sandbox: 80,
  optimize: 36,
  relearn: 40,
  purge: 72,
  comeback_rite: 48,
};

function samplingValue(card: Card): number {
  let value = aiCardValue(card);
  if (card.type === "event") value += EVENT_SAMPLING_BONUS[card.effect ?? ""] ?? 0;
  if (card.type === "memory") value += 35;
  if (card.type === "ai" && (card.power ?? 0) >= 3) value += 20;
  return value;
}

function countIds(cardIds: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const id of cardIds) counts.set(id, (counts.get(id) ?? 0) + 1);
  return counts;
}

// Python 版 deck_is_legal の移植。validate_same_name_limit（同名 2 枚まで）は
// 例外の代わりに false を返す判定として写した。
function deckIsLegal(cardIds: readonly string[]): boolean {
  if (cardIds.length !== CARD_COUNT) return false;
  for (const count of countIds(cardIds).values()) {
    if (count > 2) return false;
  }
  const cards = cardIds.map(cardById);
  const aiCount = cards.filter((card) => card.type === "ai").length;
  const memoryCount = cards.filter((card) => card.type === "memory").length;
  const eventCount = cards.filter((card) => card.type === "event").length;
  if (aiCount < AI_SLOT_RANGE[0] || aiCount > AI_SLOT_RANGE[1]) return false;
  if (memoryCount < MEMORY_SLOT_RANGE[0] || memoryCount > MEMORY_SLOT_RANGE[1]) return false;
  if (eventCount < EVENT_SLOT_MIN) return false;
  const highPower = cards.filter((card) => card.type === "ai" && (card.power ?? 0) >= 3);
  if (highPower.length > HIGH_POWER_LIMIT) return false;
  const nameCounts = new Map<string, number>();
  for (const card of cards) {
    const count = (nameCounts.get(card.name) ?? 0) + 1;
    if (count > 2) return false;
    nameCounts.set(card.name, count);
  }
  return true;
}

// Python 版 mutate_deck の移植: 1〜4 枚を重み付きランダムで差し替える。
function mutateDeck(base: readonly string[], pool: readonly Card[], rng: SimRandom): string[] | null {
  const cardIds = [...base];
  const swaps = rng.randint(1, 4);
  for (let i = 0; i < swaps; i += 1) {
    const removeIndex = rng.randint(0, cardIds.length - 1);
    const removed = cardIds.splice(removeIndex, 1)[0];
    const counts = countIds(cardIds);
    const replacements = pool.filter((card) => card.id !== removed && (counts.get(card.id) ?? 0) < 2);
    if (replacements.length === 0) return null;
    const weights = replacements.map((card) => Math.max(1, samplingValue(card)));
    cardIds.push(rng.choiceWeighted(replacements, weights).id);
  }
  return cardIds;
}

// Python 版 weighted_slots の移植: 種別プールから重み付きで slots 枚選ぶ。
function weightedSlots(cards: readonly Card[], slots: number, rng: SimRandom): string[] {
  const selected: string[] = [];
  const counts = new Map<string, number>();
  let highPowerTotal = 0;
  while (selected.length < slots) {
    const available = cards.filter(
      (card) =>
        (counts.get(card.id) ?? 0) < 2
        && (card.type !== "ai" || (card.power ?? 0) < 3 || highPowerTotal < HIGH_POWER_LIMIT),
    );
    if (available.length === 0) throw new Error("weightedSlots: 選択可能なカードがありません");
    const weights = available.map((card) => Math.max(1, samplingValue(card)));
    const card = rng.choiceWeighted(available, weights);
    selected.push(card.id);
    counts.set(card.id, (counts.get(card.id) ?? 0) + 1);
    if (card.type === "ai" && (card.power ?? 0) >= 3) highPowerTotal += 1;
  }
  return selected;
}

// Python 版 generate_candidates の移植: 半分は現行 apex の変異、残りは重み付きランダム構築。
function generateCandidates(poolSize: number, rng: SimRandom, currentApex: readonly string[]): Candidate[] {
  const cards = activeCardPool();
  const byType = {
    ai: cards.filter((card) => card.type === "ai"),
    event: cards.filter((card) => card.type === "event"),
    memory: cards.filter((card) => card.type === "memory"),
  };
  const candidates: Candidate[] = [];
  const seen = new Set<string>([[...currentApex].sort().join("|")]);

  const mutationTarget = Math.floor(poolSize / 2);
  let attempts = 0;
  while (candidates.length < mutationTarget && attempts < poolSize * 300) {
    attempts += 1;
    const cardIds = mutateDeck(currentApex, cards, rng);
    if (cardIds === null || !deckIsLegal(cardIds)) continue;
    const canonical = [...cardIds].sort().join("|");
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    candidates.push({
      name: `apex_mutation_${String(candidates.length + 1).padStart(3, "0")}`,
      cardIds,
      source: "mutation",
    });
  }

  attempts = 0;
  while (candidates.length < poolSize && attempts < poolSize * 300) {
    attempts += 1;
    const aiSlots = rng.randint(AI_SLOT_RANGE[0], AI_SLOT_RANGE[1]);
    const memorySlots = rng.randint(MEMORY_SLOT_RANGE[0], MEMORY_SLOT_RANGE[1]);
    const eventSlots = CARD_COUNT - aiSlots - memorySlots;
    if (eventSlots < EVENT_SLOT_MIN) continue;
    const cardIds = [
      ...weightedSlots(byType.ai, aiSlots, rng),
      ...weightedSlots(byType.event, eventSlots, rng),
      ...weightedSlots(byType.memory, memorySlots, rng),
    ];
    if (!deckIsLegal(cardIds)) continue;
    const canonical = [...cardIds].sort().join("|");
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    candidates.push({
      name: `apex_candidate_${String(candidates.length + 1).padStart(3, "0")}`,
      cardIds,
      source: "weighted_random",
    });
  }
  if (candidates.length < poolSize) {
    throw new Error(`only generated ${candidates.length} legal candidates`);
  }
  return candidates;
}

function customSource(candidate: Candidate): { kind: "custom"; name: string; cardIds: string[] } {
  return { kind: "custom", name: candidate.name, cardIds: [...candidate.cardIds] };
}

type ScreenRow = {
  candidate: Candidate;
  win_rate: number;
  wins: number;
  games: number;
};

// Python 版 screen_candidates の移植: 既存 6 デッキ × 両手番 × games でスクリーニング。
function screenCandidates(candidates: Candidate[], games: number, seed: number): ScreenRow[] {
  const rows: ScreenRow[] = [];
  let currentSeed = seed;
  for (const candidate of candidates) {
    let challengerWins = 0;
    let total = 0;
    for (const opponent of EXISTING_OPPONENTS) {
      for (const candidateFirst of [true, false]) {
        for (let i = 0; i < games; i += 1) {
          const record = runMatch(currentSeed, {
            firstDeck: candidateFirst ? customSource(candidate) : opponent,
            secondDeck: candidateFirst ? opponent : customSource(candidate),
            aiProfiles: ["challenger", "challenger"],
          });
          currentSeed += 1;
          if (record.game.winner === (candidateFirst ? 0 : 1)) challengerWins += 1;
          total += 1;
        }
      }
    }
    rows.push({ candidate, win_rate: challengerWins / total, wins: challengerWins, games: total });
  }
  return rows.sort((a, b) => b.win_rate - a.win_rate || b.wins - a.wins);
}

type Standing = { wins: number; losses: number; draws: number; games: number; win_rate?: number };

type LeagueResult = {
  total_games: number;
  standings: Record<string, Standing>;
  pairs: { first: string; second: string; wins: Record<string, number>; average_turns: number }[];
};

// Python 版 run_candidate_league の移植: 候補同士の順序付き総当たりリーグ。
function runCandidateLeague(candidates: Candidate[], games: number, seed: number): LeagueResult {
  const standings: Record<string, Standing> = {};
  for (const candidate of candidates) {
    standings[candidate.name] = { wins: 0, losses: 0, draws: 0, games: 0 };
  }
  const pairs: LeagueResult["pairs"] = [];
  let currentSeed = seed;
  for (const first of candidates) {
    for (const second of candidates) {
      if (first === second) continue;
      const wins: Record<string, number> = {};
      const turnCounts: number[] = [];
      for (let i = 0; i < games; i += 1) {
        const record = runMatch(currentSeed, {
          firstDeck: customSource(first),
          secondDeck: customSource(second),
          aiProfiles: ["challenger", "challenger"],
        });
        currentSeed += 1;
        turnCounts.push(record.game.turn);
        standings[first.name].games += 1;
        standings[second.name].games += 1;
        if (record.game.winner === 0) {
          standings[first.name].wins += 1;
          standings[second.name].losses += 1;
          wins[first.name] = (wins[first.name] ?? 0) + 1;
        } else if (record.game.winner === 1) {
          standings[second.name].wins += 1;
          standings[first.name].losses += 1;
          wins[second.name] = (wins[second.name] ?? 0) + 1;
        } else {
          standings[first.name].draws += 1;
          standings[second.name].draws += 1;
          wins["draw"] = (wins["draw"] ?? 0) + 1;
        }
      }
      pairs.push({
        first: first.name,
        second: second.name,
        wins,
        average_turns: turnCounts.reduce((sum, value) => sum + value, 0) / turnCounts.length,
      });
    }
  }
  for (const values of Object.values(standings)) {
    const decisive = values.wins + values.losses;
    values.win_rate = decisive > 0 ? values.wins / decisive : 0;
  }
  const sortedStandings = Object.fromEntries(
    Object.entries(standings).sort((a, b) => (b[1].win_rate ?? 0) - (a[1].win_rate ?? 0)),
  );
  return {
    total_games: games * candidates.length * (candidates.length - 1),
    standings: sortedStandings,
    pairs,
  };
}

function publicScreenRow(row: ScreenRow): Record<string, unknown> {
  return {
    name: row.candidate.name,
    win_rate: row.win_rate,
    wins: row.wins,
    games: row.games,
    card_ids: [...row.candidate.cardIds],
  };
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const rng = new SimRandom(args.seed);
  const current: Candidate = {
    name: "current_apex",
    cardIds: [...DECKS.apex.cards],
    source: "current",
  };
  const generated = generateCandidates(args.poolSize, rng, current.cardIds);
  const screened = screenCandidates(generated, args.screenGames, args.seed + 10000);
  const challengers = screened.slice(0, args.top).map((row) => row.candidate);
  const leagueDecks = [current, ...challengers];
  const league = runCandidateLeague(leagueDecks, args.leagueGames, args.seed + 900000);
  const bestName = Object.keys(league.standings).reduce((best, name) => {
    const a = league.standings[name];
    const b = league.standings[best];
    if ((a.win_rate ?? 0) !== (b.win_rate ?? 0)) return (a.win_rate ?? 0) > (b.win_rate ?? 0) ? name : best;
    return a.wins > b.wins ? name : best;
  });
  const report = {
    seed: args.seed,
    pool_size: args.poolSize,
    screen_games_per_ordered_matchup: args.screenGames,
    league_games_per_ordered_pair: args.leagueGames,
    screen_top: screened.slice(0, 10).map(publicScreenRow),
    league,
    best: {
      name: bestName,
      card_ids: [...leagueDecks.find((item) => item.name === bestName)!.cardIds],
      standing: league.standings[bestName],
    },
    candidate_decks: leagueDecks.map((item) => ({
      name: item.name,
      source: item.source,
      card_ids: [...item.cardIds],
    })),
  };
  mkdirSync(dirname(args.out), { recursive: true });
  writeFileSync(args.out, `${JSON.stringify(report, null, 2)}\n`, "utf-8");
  console.log(JSON.stringify(report, null, 2));
}

main();
