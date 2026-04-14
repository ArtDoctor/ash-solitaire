/**
 * Pure solitaire rules engine (Klondike tableau + draw-3 + single pass + ex-stock free cell).
 */

import {
  RANK_VALUE,
  type CardData,
  type Rank,
  type Suit,
  suitColor,
} from "./cards.js";

export type Card = CardData;

export interface GameState {
  tableau: Card[][];
  /** Four piles ♠ ♥ ♦ ♣ — bottom … top, ascending rank */
  foundations: Card[][];
  /** Bottom … top; draw from top (end of array) */
  stock: Card[];
  waste: Card[];
  /** Only when `stock` is empty — former stock slot holds at most one card */
  freeCell: Card | null;
}

const FOUNDATION_SUITS: Suit[] = ["♠", "♥", "♦", "♣"];

export function foundationIndexForSuit(suit: Suit): number {
  return FOUNDATION_SUITS.indexOf(suit);
}

export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of FOUNDATION_SUITS) {
    const ranks: Rank[] = [
      "A", "2", "3", "4", "5", "6", "7",
      "8", "9", "10", "J", "Q", "K",
    ];
    for (const rank of ranks) deck.push({ rank, suit });
  }
  return deck;
}

/** Mulberry32 — deterministic tests via seed */
export function mulberry32(seed: number): () => number {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export function dealNewGame(rng: () => number): GameState {
  const deck = shuffle(createDeck(), rng);
  const tableau: Card[][] = [[], [], [], [], [], [], []];
  let idx = 0;
  for (let row = 0; row < 7; row++) {
    for (let col = row; col < 7; col++) {
      tableau[col]!.push(deck[idx]!);
      idx++;
    }
  }
  const stock = deck.slice(idx);
  return {
    tableau,
    foundations: [[], [], [], []],
    stock,
    waste: [],
    freeCell: null,
  };
}

export function isValidDescendingRun(cards: Card[], from: number): boolean {
  if (from >= cards.length) return false;
  for (let i = from; i < cards.length - 1; i++) {
    const a = cards[i]!;
    const b = cards[i + 1]!;
    if (RANK_VALUE[a.rank] !== RANK_VALUE[b.rank] + 1) return false;
    if (suitColor(a.suit) === suitColor(b.suit)) return false;
  }
  return true;
}

function canPlaceOnTableau(destTop: Card, contact: Card): boolean {
  return (
    RANK_VALUE[destTop.rank] === RANK_VALUE[contact.rank] + 1 &&
    suitColor(destTop.suit) !== suitColor(contact.suit)
  );
}

export function canMoveToFoundationPile(
  pile: Card[],
  card: Card,
): boolean {
  if (pile.length === 0) return card.rank === "A";
  const top = pile[pile.length - 1]!;
  return (
    top.suit === card.suit &&
    RANK_VALUE[card.rank] === RANK_VALUE[top.rank] + 1
  );
}

export function canPlaceOnEmptyTableau(_contact: Card): boolean {
  return true;
}

export type MoveSource =
  | { kind: "waste" }
  | { kind: "freeCell" }
  | { kind: "tableau"; col: number; start: number };

export type MoveTarget =
  | { kind: "foundation"; pile: number }
  | { kind: "tableau"; col: number }
  | { kind: "freeCell" };

/** Cards that would move from `src` without mutating state (for drag preview). */
export function peekMovingCards(
  state: GameState,
  src: MoveSource,
): Card[] | null {
  if (src.kind === "waste") {
    if (state.waste.length === 0) return null;
    return [state.waste[state.waste.length - 1]!];
  }
  if (src.kind === "freeCell") {
    if (state.stock.length > 0 || state.freeCell === null) return null;
    return [state.freeCell];
  }
  const col = state.tableau[src.col];
  if (!col || src.start < 0 || src.start >= col.length) return null;
  if (!isValidDescendingRun(col, src.start)) return null;
  return col.slice(src.start);
}

function removeCardFromSource(
  state: GameState,
  src: MoveSource,
): { state: GameState; cards: Card[] } | null {
  if (src.kind === "waste") {
    if (state.waste.length === 0) return null;
    const card = state.waste[state.waste.length - 1]!;
    const waste = state.waste.slice(0, -1);
    return { state: { ...state, waste }, cards: [card] };
  }
  if (src.kind === "freeCell") {
    if (state.stock.length > 0 || state.freeCell === null) return null;
    const card = state.freeCell;
    return { state: { ...state, freeCell: null }, cards: [card] };
  }
  const col = state.tableau[src.col];
  if (!col || src.start < 0 || src.start >= col.length) return null;
  if (!isValidDescendingRun(col, src.start)) return null;
  const moving = col.slice(src.start);
  const newCol = col.slice(0, src.start);
  const tableau = state.tableau.slice();
  tableau[src.col] = newCol;
  return { state: { ...state, tableau }, cards: moving };
}

function appendToTarget(
  state: GameState,
  target: MoveTarget,
  cards: Card[],
): GameState | null {
  if (cards.length === 0) return null;

  if (target.kind === "foundation") {
    if (cards.length !== 1) return null;
    const card = cards[0]!;
    const pileIdx = foundationIndexForSuit(card.suit);
    if (pileIdx !== target.pile) return null;
    const piles = state.foundations.map((p) => p.slice());
    const pile = piles[pileIdx]!;
    if (!canMoveToFoundationPile(pile, card)) return null;
    pile.push(card);
    piles[pileIdx] = pile;
    return { ...state, foundations: piles };
  }

  if (target.kind === "freeCell") {
    if (cards.length !== 1) return null;
    if (state.stock.length > 0) return null;
    if (state.freeCell !== null) return null;
    return { ...state, freeCell: cards[0]! };
  }

  const col = state.tableau[target.col];
  if (!col) return null;
  const contact = cards[0]!;

  if (col.length === 0) {
    if (!canPlaceOnEmptyTableau(contact)) return null;
  } else {
    const destTop = col[col.length - 1]!;
    if (!canPlaceOnTableau(destTop, contact)) return null;
  }

  const tableau = state.tableau.slice();
  tableau[target.col] = col.concat(cards);
  return { ...state, tableau };
}

export function tryApplyMove(
  state: GameState,
  src: MoveSource,
  target: MoveTarget,
): GameState | null {
  if (
    src.kind === "tableau" &&
    target.kind === "tableau" &&
    src.col === target.col
  ) {
    return null;
  }
  const removed = removeCardFromSource(state, src);
  if (!removed) return null;
  const next = appendToTarget(removed.state, target, removed.cards);
  return next;
}

export function drawFromStock(state: GameState): GameState | null {
  if (state.stock.length === 0) return null;
  const n = Math.min(3, state.stock.length);
  const drawn = state.stock.slice(-n);
  const stock = state.stock.slice(0, -n);
  const waste = state.waste.concat(drawn);
  return { ...state, stock, waste };
}

/**
 * Klondike deal order: row 0 fills cols 0..6, row 1 fills cols 1..6, etc.
 * Matches `dealNewGame` — use with a post-deal state to animate the deal.
 */
export function getDealSequence(state: GameState): { col: number; card: Card }[] {
  const seq: { col: number; card: Card }[] = [];
  for (let row = 0; row < 7; row++) {
    for (let col = row; col < 7; col++) {
      seq.push({ col, card: state.tableau[col]![row]! });
    }
  }
  return seq;
}

/** Tableau after the first `stepsComplete` cards from `getDealSequence` have been dealt. */
export function partialTableauAfterDealSteps(
  seq: { col: number; card: Card }[],
  stepsComplete: number,
): Card[][] {
  const t: Card[][] = [[], [], [], [], [], [], []];
  for (let i = 0; i < stepsComplete && i < seq.length; i++) {
    t[seq[i]!.col]!.push(seq[i]!.card);
  }
  return t;
}

/** Next automatic foundation move (waste → free cell → tableau left→right), if any. */
export function peekNextAutoFoundationMove(state: GameState): {
  source: MoveSource;
  target: MoveTarget;
} | null {
  if (state.waste.length > 0) {
    const card = state.waste[state.waste.length - 1]!;
    const pileIdx = foundationIndexForSuit(card.suit);
    if (canMoveToFoundationPile(state.foundations[pileIdx]!, card)) {
      return {
        source: { kind: "waste" },
        target: { kind: "foundation", pile: pileIdx },
      };
    }
  }
  if (state.stock.length === 0 && state.freeCell) {
    const card = state.freeCell;
    const pileIdx = foundationIndexForSuit(card.suit);
    if (canMoveToFoundationPile(state.foundations[pileIdx]!, card)) {
      return {
        source: { kind: "freeCell" },
        target: { kind: "foundation", pile: pileIdx },
      };
    }
  }
  for (let c = 0; c < 7; c++) {
    const col = state.tableau[c];
    if (!col || col.length === 0) continue;
    const card = col[col.length - 1]!;
    const pileIdx = foundationIndexForSuit(card.suit);
    if (!canMoveToFoundationPile(state.foundations[pileIdx]!, card)) continue;
    return {
      source: { kind: "tableau", col: c, start: col.length - 1 },
      target: { kind: "foundation", pile: pileIdx },
    };
  }
  return null;
}

/** One legal foundation move: waste, then free cell, then tableau columns left→right */
export function tryOneAutoFoundationMove(state: GameState): GameState | null {
  const peek = peekNextAutoFoundationMove(state);
  if (!peek) return null;
  return tryApplyMove(state, peek.source, peek.target);
}

export function applyAutoFoundationChain(state: GameState): GameState {
  let s = state;
  for (let guard = 0; guard < 200; guard++) {
    const next = tryOneAutoFoundationMove(s);
    if (!next) break;
    s = next;
  }
  return s;
}

export function afterPlayerMove(state: GameState): GameState {
  return applyAutoFoundationChain(state);
}

export function isWon(state: GameState): boolean {
  return state.foundations.every((p) => p.length === 13);
}

export function tryDoubleClickFoundation(
  state: GameState,
  src: MoveSource,
): GameState | null {
  if (src.kind === "waste") {
    if (state.waste.length === 0) return null;
    const pileIdx = foundationIndexForSuit(
      state.waste[state.waste.length - 1]!.suit,
    );
    const m = tryApplyMove(state, src, { kind: "foundation", pile: pileIdx });
    return m;
  }
  if (src.kind === "freeCell") {
    if (state.stock.length > 0 || !state.freeCell) return null;
    const pileIdx = foundationIndexForSuit(state.freeCell.suit);
    const m = tryApplyMove(state, src, { kind: "foundation", pile: pileIdx });
    return m;
  }
  const col = state.tableau[src.col];
  if (!col || src.start !== col.length - 1) return null;
  const card = col[col.length - 1]!;
  const pileIdx = foundationIndexForSuit(card.suit);
  const m = tryApplyMove(state, src, { kind: "foundation", pile: pileIdx });
  return m;
}

/** New deal plus any immediately legal foundation moves (aces, etc.). */
export function freshGame(rng: () => number): GameState {
  return applyAutoFoundationChain(dealNewGame(rng));
}
