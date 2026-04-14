// ── Card types & DOM factory ──────────────────────────────────────────────────
// Pure presentation layer — no game logic.  Part 2 will import these types
// and call createCardEl() to render actual game state.

export type Suit = "♠" | "♥" | "♦" | "♣";
export type Rank =
  | "A"
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "10"
  | "J"
  | "Q"
  | "K";

export const SUITS: Suit[] = ["♠", "♥", "♦", "♣"];
export const RANKS: Rank[] = [
  "A", "2", "3", "4", "5", "6", "7",
  "8", "9", "10", "J", "Q", "K",
];

export const RANK_VALUE: Record<Rank, number> = {
  A: 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7,
  "8": 8, "9": 9, "10": 10, J: 11, Q: 12, K: 13,
};

export type SuitColor = "red" | "black";

export function suitColor(suit: Suit): SuitColor {
  return suit === "♥" || suit === "♦" ? "red" : "black";
}

export interface CardData {
  rank: Rank;
  suit: Suit;
  faceDown?: boolean;
}

// ─── Face-up card element ──────────────────────────────────────────────────────
//
//  ┌──────────┐
//  │ A        │   ← .card-corner.tl  (rank + suit, stacked)
//  │ ♥        │
//  │    ♥     │   ← .card-pip        (large centre symbol)
//  │        A │
//  │        ♥ │   ← .card-corner.br  (same, rotated 180°)
//  └──────────┘

export function createCardEl(card: CardData): HTMLElement {
  const el = document.createElement("div");

  if (card.faceDown) {
    el.className = "card face-down";
    return el;
  }

  const color = suitColor(card.suit);
  el.className = `card ${color}`;
  el.dataset.rank = card.rank;
  el.dataset.suit = card.suit;

  const corner = (extraClass: string) => `
    <div class="card-corner ${extraClass}">
      <span class="card-corner-rank">${card.rank}</span>
      <span class="card-corner-suit">${card.suit}</span>
    </div>`;

  el.innerHTML = `
    ${corner("card-corner--tl")}
    <div class="card-pip">${card.suit}</div>
    ${corner("card-corner--br")}
  `;

  return el;
}

// ─── Stock pile element (face-down stack indicator) ───────────────────────────
// Shows a layered back-card look to imply a pile of cards.

export function createStockEl(count: number): HTMLElement {
  const el = document.createElement("div");
  el.className = "card-stock-pile";
  el.dataset.count = String(count);

  // Two shadow layers + top card back
  el.innerHTML = `
    <div class="stock-layer stock-layer--2"></div>
    <div class="stock-layer stock-layer--1"></div>
    <div class="stock-layer stock-layer--0 face-down"></div>
    <span class="stock-count">${count}</span>
  `;
  return el;
}

// ─── Waste fan element ────────────────────────────────────────────────────────
// Shows up to the top 3 waste cards slightly fanned so the player can see
// what has just been drawn. Only the top card is interactive.

export function createWasteFanEl(top3: CardData[]): HTMLElement {
  const el = document.createElement("div");
  el.className = "waste-fan";

  top3.forEach((card, i) => {
    const cardEl = createCardEl(card);
    cardEl.classList.add("waste-card");
    if (i < top3.length - 1) cardEl.classList.add("waste-card--under");
    el.appendChild(cardEl);
  });

  return el;
}

// ─── Tableau column renderer ──────────────────────────────────────────────────
// Positions cards in a column with a fixed vertical overlap.
// Returns the minimum height the column container needs.

export const COL_OVERLAP = 30; // px; keep in sync with CSS --col-overlap

export function renderTableauCol(
  colEl: HTMLElement,
  cards: CardData[],
): void {
  colEl.innerHTML = "";

  if (cards.length === 0) return;

  cards.forEach((card, i) => {
    const cardEl = createCardEl(card);
    cardEl.style.top = `${i * COL_OVERLAP}px`;
    colEl.appendChild(cardEl);
  });

  // Stretch the container so the last card fully shows
  const totalH =
    (cards.length - 1) * COL_OVERLAP +
    parseInt(
      getComputedStyle(document.documentElement)
        .getPropertyValue("--card-h")
        .trim(),
      10,
    );
  colEl.style.minHeight = `${totalH}px`;
}
