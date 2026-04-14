import { describe, expect, it } from "vitest";
import {
  applyAutoFoundationChain,
  canMoveToFoundationPile,
  createDeck,
  dealNewGame,
  drawFromStock,
  freshGame,
  isValidDescendingRun,
  isWon,
  mulberry32,
  shuffle,
  tryApplyMove,
  type GameState,
} from "./gameLogic.js";

describe("createDeck", () => {
  it("has 52 unique cards", () => {
    const d = createDeck();
    expect(d).toHaveLength(52);
    const key = (c: (typeof d)[0]) => `${c.rank}${c.suit}`;
    const set = new Set(d.map(key));
    expect(set.size).toBe(52);
  });
});

describe("dealNewGame", () => {
  it("deals 28 cards to tableau and 24 to stock", () => {
    const rng = mulberry32(42);
    const g = dealNewGame(rng);
    let t = 0;
    for (const col of g.tableau) t += col.length;
    expect(t).toBe(28);
    expect(g.stock).toHaveLength(24);
    expect(g.waste).toHaveLength(0);
    expect(g.freeCell).toBeNull();
  });

  it("tableau column k has k+1 cards", () => {
    const g = dealNewGame(mulberry32(7));
    for (let c = 0; c < 7; c++) {
      expect(g.tableau[c]).toHaveLength(c + 1);
    }
  });
});

describe("drawFromStock", () => {
  it("moves up to three from stock top to waste each click", () => {
    let g = dealNewGame(mulberry32(1));
    expect(g.stock).toHaveLength(24);

    g = drawFromStock(g)!;
    expect(g.stock).toHaveLength(21);
    expect(g.waste).toHaveLength(3);

    g = drawFromStock(g)!;
    expect(g.stock).toHaveLength(18);
    expect(g.waste).toHaveLength(6);
  });

  it("moves all remaining cards when fewer than three are left", () => {
    const g: GameState = {
      tableau: [[], [], [], [], [], [], []],
      foundations: [[], [], [], []],
      stock: [
        { rank: "A", suit: "♠" },
        { rank: "2", suit: "♥" },
        { rank: "3", suit: "♦" },
      ],
      waste: [{ rank: "4", suit: "♣" }],
      freeCell: null,
    };
    const out = drawFromStock(g)!;
    expect(out.stock).toHaveLength(0);
    expect(out.waste).toHaveLength(4);
    expect(out.waste[out.waste.length - 1]?.rank).toBe("3");
  });

  it("returns null when stock is empty", () => {
    let g = dealNewGame(mulberry32(2));
    while (g.stock.length > 0) {
      g = drawFromStock(g)!;
    }
    expect(drawFromStock(g)).toBeNull();
  });
});

describe("free cell", () => {
  it("accepts a single card from waste when stock empty", () => {
    let g = dealNewGame(mulberry32(99));
    while (g.stock.length > 0) g = drawFromStock(g)!;
    expect(g.stock).toHaveLength(0);
    const w = g.waste.length;
    const top = g.waste[w - 1]!;

    const moved = tryApplyMove(g, { kind: "waste" }, { kind: "freeCell" });
    expect(moved).not.toBeNull();
    expect(moved!.waste).toHaveLength(w - 1);
    expect(moved!.freeCell).toEqual(top);
  });

  it("does not allow free cell while stock has cards", () => {
    let g = dealNewGame(mulberry32(3));
    g = drawFromStock(g)!;
    expect(g.stock.length).toBeGreaterThan(0);
    const m = tryApplyMove(g, { kind: "waste" }, { kind: "freeCell" });
    expect(m).toBeNull();
  });
});

describe("foundation", () => {
  it("ace starts pile and two follows", () => {
    const ace = { rank: "A" as const, suit: "♠" as const };
    const two = { rank: "2" as const, suit: "♠" as const };
    expect(canMoveToFoundationPile([], ace)).toBe(true);
    expect(canMoveToFoundationPile([], two)).toBe(false);
    expect(canMoveToFoundationPile([ace], two)).toBe(true);
    expect(canMoveToFoundationPile([ace], { rank: "2", suit: "♥" })).toBe(false);
  });
});

describe("tableau sequence", () => {
  it("validates alternating descending run", () => {
    const col = [
      { rank: "K" as const, suit: "♠" as const },
      { rank: "Q" as const, suit: "♥" as const },
      { rank: "J" as const, suit: "♣" as const },
    ];
    expect(isValidDescendingRun(col, 0)).toBe(true);
    expect(isValidDescendingRun(col, 1)).toBe(true);
    expect(isValidDescendingRun(col, 2)).toBe(true);
  });

  it("rejects wrong color order", () => {
    const col = [
      { rank: "K" as const, suit: "♠" as const },
      { rank: "Q" as const, suit: "♣" as const },
    ];
    expect(isValidDescendingRun(col, 0)).toBe(false);
  });
});

describe("win detection", () => {
  it("detects full foundations", () => {
    const ranks = [
      "A", "2", "3", "4", "5", "6", "7",
      "8", "9", "10", "J", "Q", "K",
    ] as const;
    const suits = ["♠", "♥", "♦", "♣"] as const;
    const foundations = suits.map((suit) =>
      ranks.map((rank) => ({ rank, suit })),
    );
    const g: GameState = {
      tableau: [[], [], [], [], [], [], []],
      foundations,
      stock: [],
      waste: [],
      freeCell: null,
    };
    expect(isWon(g)).toBe(true);
  });
});

describe("shuffle determinism", () => {
  it("same seed produces same order", () => {
    const a = shuffle(createDeck(), mulberry32(12345));
    const b = shuffle(createDeck(), mulberry32(12345));
    expect(a.map((c) => `${c.rank}${c.suit}`).join()).toBe(
      b.map((c) => `${c.rank}${c.suit}`).join(),
    );
  });
});

describe("freshGame", () => {
  it("runs without throwing", () => {
    const g = freshGame(mulberry32(500));
    expect(g.tableau.some((c) => c.length > 0)).toBe(true);
  });
});

describe("auto foundation chain", () => {
  it("terminates", () => {
    const g = dealNewGame(mulberry32(1));
    const out = applyAutoFoundationChain(g);
    expect(out).toBeDefined();
  });
});
