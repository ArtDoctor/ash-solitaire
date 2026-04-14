// ── Card types & DOM factory ──────────────────────────────────────────────────
// Pure presentation layer — no game logic.

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

// ─── Pip layouts ──────────────────────────────────────────────────────────────
// Classic playing-card pip arrangements on a 3-column × 7-row grid.
// [col, row] — col 1-3, row 1-7. Row 4 is centre line; rows 5-7 are flipped 180°.

const PIP_LAYOUTS: Record<Exclude<Rank, "J" | "Q" | "K">, [number, number][]> = {
  A:  [[2, 4]],
  "2":  [[2, 1], [2, 7]],
  "3":  [[2, 1], [2, 4], [2, 7]],
  "4":  [[1, 1], [3, 1], [1, 7], [3, 7]],
  "5":  [[1, 1], [3, 1], [2, 4], [1, 7], [3, 7]],
  "6":  [[1, 1], [3, 1], [1, 4], [3, 4], [1, 7], [3, 7]],
  "7":  [[1, 1], [3, 1], [2, 2], [1, 4], [3, 4], [1, 7], [3, 7]],
  "8":  [[1, 1], [3, 1], [2, 2], [1, 4], [3, 4], [2, 6], [1, 7], [3, 7]],
  "9":  [[1, 1], [3, 1], [1, 3], [3, 3], [2, 4], [1, 5], [3, 5], [1, 7], [3, 7]],
  "10": [[1, 1], [3, 1], [2, 2], [1, 3], [3, 3], [1, 5], [3, 5], [2, 6], [1, 7], [3, 7]],
};

const FACE_EMBLEMS: Record<"J" | "Q" | "K", string> = {
  K: "♔",
  Q: "♕",
  J: "⚜",
};

function buildPips(card: CardData): string {
  if (card.rank === "K" || card.rank === "Q" || card.rank === "J") {
    const emblem = FACE_EMBLEMS[card.rank];
    return `<div class="card-face card-face--${card.rank}">
      <span class="face-suit-bg">${card.suit}</span>
      <span class="face-inner">
        <span class="face-emblem">${emblem}</span>
        <span class="face-rank">${card.rank}</span>
      </span>
    </div>`;
  }

  if (card.rank === "A") {
    return `<div class="card-pips card-pips--ace">
      <span class="pip">${card.suit}</span>
    </div>`;
  }

  const positions = PIP_LAYOUTS[card.rank];
  const pips = positions
    .map(([col, row]) => {
      const flip = row > 4 ? " pip--flip" : "";
      return `<span class="pip${flip}" style="grid-column:${col};grid-row:${row};">${card.suit}</span>`;
    })
    .join("");
  return `<div class="card-pips">${pips}</div>`;
}

// ─── Face-up card element ─────────────────────────────────────────────────────

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
    ${buildPips(card)}
    ${corner("card-corner--br")}
  `;

  return el;
}

// ─── Stock pile element ───────────────────────────────────────────────────────

/** Max face-down backs drawn under the top card (rest implied by count badge). */
const STOCK_VISUAL_UNDER_CAP = 14;

export function createStockEl(count: number): HTMLElement {
  const el = document.createElement("div");
  el.className = "card-stock-pile";
  el.dataset.count = String(count);

  const underCount = Math.max(0, Math.min(count - 1, STOCK_VISUAL_UNDER_CAP));
  const parts: string[] = [];

  for (let s = underCount; s >= 1; s--) {
    const z = underCount - s + 1;
    const alt = s % 2 === 0 ? " stock-layer-under--alt" : "";
    parts.push(
      `<div class="stock-layer stock-layer-under${alt}" style="top:calc(var(--card-h) * ${-(2 * s - 1)} / 110);left:calc(var(--card-w) * ${-s} / 78);z-index:${z}"></div>`,
    );
  }
  parts.push(
    `<div class="stock-layer stock-layer--0 face-down" style="z-index:${underCount + 1}"></div>`,
  );
  parts.push(`<span class="stock-count">${count}</span>`);

  el.innerHTML = parts.join("");
  return el;
}

// ─── Waste fan element ────────────────────────────────────────────────────────

export function createWasteFanEl(cards: CardData[]): HTMLElement {
  const el = document.createElement("div");
  el.className = "waste-fan";

  cards.forEach((card, i) => {
    const cardEl = createCardEl(card);
    cardEl.classList.add("waste-card");
    if (i < cards.length - 1) cardEl.classList.add("waste-card--under");
    el.appendChild(cardEl);
  });

  return el;
}

// ─── Tableau column renderer ──────────────────────────────────────────────────

/**
 * Resolved pixel length for a `--*` custom property. `getPropertyValue` often
 * returns unresolved `calc(...)` strings, so `parseFloat` is unreliable.
 */
export function cssLengthVarPx(
  varName: string,
  axis: "width" | "height",
): number {
  const probe = document.createElement("div");
  const primary = axis === "width" ? "width" : "height";
  const secondary = axis === "width" ? "height" : "width";
  probe.style.cssText = [
    "position:fixed",
    "left:0",
    "top:0",
    "margin:0",
    "padding:0",
    "border:0",
    "visibility:hidden",
    "pointer-events:none",
    `${primary}:var(${varName})`,
    `${secondary}:0`,
  ].join(";");
  document.body.appendChild(probe);
  const px = axis === "width" ? probe.offsetWidth : probe.offsetHeight;
  probe.remove();
  return Number.isFinite(px) ? px : 0;
}

export function renderTableauCol(
  colEl: HTMLElement,
  cards: CardData[],
): void {
  colEl.innerHTML = "";

  if (cards.length === 0) return;

  const overlap = cssLengthVarPx("--col-overlap", "height");
  const cardH = cssLengthVarPx("--card-h", "height");

  cards.forEach((card, i) => {
    const cardEl = createCardEl(card);
    cardEl.style.top = `${i * overlap}px`;
    cardEl.style.zIndex = String(i + 1);
    colEl.appendChild(cardEl);
  });

  const totalH = (cards.length - 1) * overlap + cardH;
  colEl.style.minHeight = `${totalH}px`;
}
