// ── Navigation & shell ────────────────────────────────────────────────────────
// Game logic (deck, moves, drag-drop) is wired in Part 2.
// This file handles routing between screens and renders a static card demo
// so all card designs are visible before logic is wired up.

import {
  createCardEl,
  createStockEl,
  createWasteFanEl,
  renderTableauCol,
  type CardData,
} from "./cards.js";

const WINS_KEY = "solitaire-wins";

type ScreenId = "home" | "game";

// ─── Win count ────────────────────────────────────────────────────────────────

function loadWins(): number {
  return parseInt(localStorage.getItem(WINS_KEY) ?? "0", 10);
}

function saveWins(n: number): void {
  localStorage.setItem(WINS_KEY, String(n));
}

function refreshWinDisplay(): void {
  const el = document.getElementById("win-count");
  if (el) el.textContent = String(loadWins());
}

// ─── Screen navigation ────────────────────────────────────────────────────────

function showScreen(id: ScreenId): void {
  document.querySelectorAll<HTMLElement>(".screen").forEach((el) => {
    el.classList.toggle("active", el.id === `screen-${id}`);
  });
}

// ─── Static card demo (replaced by real deal logic in Part 2) ─────────────────

function renderDemo(): void {
  // Foundations — show one card placed on each to preview the face-up design
  const foundationCards: CardData[] = [
    { rank: "A", suit: "♠" },
    { rank: "A", suit: "♥" },
    { rank: "A", suit: "♦" },
    { rank: "A", suit: "♣" },
  ];
  foundationCards.forEach((card, i) => {
    const slot = document.getElementById(`foundation-${i}`);
    if (!slot) return;
    slot.innerHTML = "";
    slot.style.position = "relative";
    const el = createCardEl(card);
    el.style.top = "0";
    el.style.left = "0";
    slot.appendChild(el);
  });

  // Stock pile
  const stockSlot = document.getElementById("stock");
  if (stockSlot) {
    stockSlot.innerHTML = "";
    stockSlot.appendChild(createStockEl(24));
  }

  // Waste — fan of 3 cards
  const wasteSlot = document.getElementById("waste");
  if (wasteSlot) {
    wasteSlot.innerHTML = "";
    const fan = createWasteFanEl([
      { rank: "9", suit: "♦" },
      { rank: "J", suit: "♣" },
      { rank: "7", suit: "♥" },
    ]);
    // Offset each card in the fan so they're slightly visible
    fan.querySelectorAll<HTMLElement>(".waste-card").forEach((el, i) => {
      el.style.position = "absolute";
      el.style.left = `${i * 18}px`;
      el.style.top = "0";
      el.style.zIndex = String(i);
    });
    // Expand the waste slot to show the fan width
    wasteSlot.style.width = `${74 + 2 * 18}px`;
    wasteSlot.style.position = "relative";
    wasteSlot.appendChild(fan);
  }

  // Tableau columns — representative sample of stacked cards
  const demoCols: CardData[][] = [
    [{ rank: "K", suit: "♠" }],
    [{ rank: "Q", suit: "♥" }, { rank: "J", suit: "♣" }],
    [{ rank: "10", suit: "♦" }, { rank: "9", suit: "♠" }, { rank: "8", suit: "♥" }],
    [{ rank: "7", suit: "♣" }, { rank: "6", suit: "♦" }, { rank: "5", suit: "♠" }, { rank: "4", suit: "♥" }],
    [
      { rank: "3", suit: "♣" },
      { rank: "2", suit: "♦" },
      { rank: "A", suit: "♠" },
      { rank: "K", suit: "♥" },
      { rank: "Q", suit: "♣" },
    ],
    [
      { rank: "J", suit: "♦" },
      { rank: "10", suit: "♠" },
      { rank: "9", suit: "♥" },
      { rank: "8", suit: "♣" },
      { rank: "7", suit: "♦" },
      { rank: "6", suit: "♠" },
    ],
    [
      { rank: "5", suit: "♥" },
      { rank: "4", suit: "♣" },
      { rank: "3", suit: "♦" },
      { rank: "2", suit: "♠" },
      { rank: "A", suit: "♥" },
      { rank: "K", suit: "♣" },
      { rank: "Q", suit: "♦" },
    ],
  ];

  demoCols.forEach((cards, i) => {
    const col = document.getElementById(`tableau-${i}`);
    if (col) renderTableauCol(col, cards);
  });
}

// ─── Game lifecycle ───────────────────────────────────────────────────────────

function startGame(): void {
  refreshWinDisplay();
  showScreen("game");
  renderDemo(); // TODO Part 2: replace with real deal()
}

function restartGame(): void {
  startGame(); // TODO Part 2: reset game state, re-shuffle, re-deal
}

function goHome(): void {
  showScreen("home");
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────

window.addEventListener("DOMContentLoaded", () => {
  if (localStorage.getItem(WINS_KEY) === null) saveWins(0);

  document.getElementById("btn-play")?.addEventListener("click", startGame);
  document.getElementById("btn-menu")?.addEventListener("click", goHome);
  document.getElementById("btn-restart")?.addEventListener("click", restartGame);

  showScreen("home");
});
