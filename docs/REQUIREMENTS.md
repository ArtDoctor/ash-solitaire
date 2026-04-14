# Solitaire — Product Requirements & Rules Specification

**Stack:** Tauri, HTML, CSS, TypeScript  
**Purpose:** Single source of truth for design, UX, rules, and technical constraints before implementation.  
**Status:** Requirements only (no implementation obligations in this document).

---

## 1. Vision & Experience Goals

### 1.1 Visual design

- **Default theme:** Dark mode (no light-mode requirement for v1; future theming may extend this).
- **Quality bar:** Polished, stylish, minimal clutter; generous negative space; consistent spacing, typography, and corner radii.
- **Reference:** Two screenshots provided by the product owner should remain in the repository as **design references** (layout: left vertical foundations, stock/waste top area, seven-column face-up tableau, reset/control placement). Implementation may refine pixels but should honor the overall structure and mood.

### 1.2 Interaction & feel

- Card movements should feel **smooth** (motion that reads as physical cards, not teleporting).
- Include **meaningful but restrained** animation: deal, move, snap to foundation, win state.
- **UX:** Clear affordances for selectable cards, valid targets, and illegal moves (subtle feedback, not punishing).
- **Restart** and **return to main menu** must be easy to find and use from the game screen.

### 1.3 Performance & packaging

- **Target:** Lightweight desktop app, fast cold start, responsive input.
- **Delivery:** Compilable to a native desktop application via **Tauri** (HTML/CSS/TS frontend).

---

## 2. Repository Assets

- **Keep reference images in the repo** (do not delete them when building the UI). Recommended layout:
  - `assets/reference/` — original screenshots used for layout and mood boards.
- Filenames may be normalized for clarity, but **content should be preserved** (or copied from the author’s supplied paths into this tree).

---

## 3. Application Structure

### 3.1 Home screen (launcher)

- A **separate home screen** is the first thing the user sees after launch.
- **For now:** Exactly **one** playable choice — this solitaire variant (e.g. a single card/button leading into the game).
- Structure should allow **additional games or modes later** without redesigning navigation from scratch.

### 3.2 Game screen

- Contains the full tableau, foundations, stock/waste (and post-deck free cell), controls, and win count.
- Must support **Restart** (new deal / same rules) and **Main menu** (back to home) without quitting the app.

---

## 4. Game Rules (Authoritative)

This variant combines **Klondike-style tableau sequencing** with **non-standard empty-column and stock-area rules** as specified below.

### 4.1 Deck & card order

- Standard **52-card** deck, shuffled for each new game.

### 4.2 Layout

- **Foundations (4):** Vertical column on the **left** (or equivalent fixed region). Build **up by suit** from **Ace → King**. One suit per pile.
- **Tableau (7 columns):** Deal **1, 2, 3, 4, 5, 6, 7** cards respectively, as in Klondike opening.
- **All tableau cards are face-up** from the start (no hidden stacks).

### 4.3 Tableau building rules

- Build **down** in the tableau. **Default assumption (to be implemented unless revised):** alternating **red/black** colors, matching **standard Klondike** (if this ever conflicts with a named “Sawayama” ruleset, product owner should confirm).
- **Moving groups:** Only the **top card** of a column, or a **contiguous valid sequence** at the top of a column, may move as a unit—same restriction as Klondike (even though all cards are visible).

### 4.4 Empty tableau columns (“open cells” on the tableau)

- When a tableau column has **no cards**, it is an **empty slot**.
- **Any rank** may be placed into an empty tableau column **(not King-only).**

### 4.5 Stock and waste (draw pile)

- **Draw rule:** One click on the stock **turns three cards** face-up onto the waste pile (standard “draw three” behavior).
- **Playable card:** Only the **top card of the waste** may be moved to tableau or foundation (not the two beneath it until they become top).
- **Single pass:** The stock can be cycled **only once**. After the last draw from stock, **the stock does not refill** and there is **no second pass** through the deck.

**Edge case:** If fewer than three cards remain in stock, a draw moves **all remaining** stock cards to waste in correct order; the top of waste remains the only playable card from that batch.

### 4.6 Stock area becomes a free cell

- After **all cards have been drawn from the stock** (stock pile empty), the **physical location that previously held the stock** becomes an **additional empty cell**—behaves like an empty tableau slot for placement rules: **any single card** may be moved there (subject to global move rules: only from top of waste, top of tableau, or as part of an allowed sequence from tableau—see §4.8).

**Clarification for implementation:** While waste still has cards, those cards are played from the waste pile normally. The new “free cell” occupies the **stock’s former slot** and does not replace waste behavior.

### 4.7 Foundations

- Only **Aces** start an empty foundation; then **same suit, ascending rank** to King.
- **Automated movement** to these four piles is required (see §5).

### 4.8 What can move where (summary)


| From            | To foundation | To tableau build | To empty tableau | To ex-stock free cell  |
| --------------- | ------------- | ---------------- | ---------------- | ---------------------- |
| Waste top       | If legal      | If legal         | If legal         | If legal (once exists) |
| Tableau top/seq | If legal      | If legal         | If legal         | If legal (once exists) |


Sequences move only when they form a **valid descending, alternating-color chain** (per §4.3).

---

## 5. Automation & “Smart” System

### 5.1 Automated play to foundations

- The game must **automatically move cards to the left four foundation piles** when those moves are **legal**.
- **Smart behavior (recommended baseline):**
  - **Click / double-click shortcut:** e.g. double-click (or a dedicated gesture) on a card attempts to move it to the **correct foundation** if allowed.
  - **Auto-chain:** When a card is placed on a foundation and exposes a new top card that can also go up, optionally **continue** in one fluid animation (bounded by legality—no bypassing rules).
  - **Optional future tuning:** aggressiveness (always auto-complete vs. only on user action), configurable in settings—not required for v1 unless trivial.

### 5.2 Non-goals for “smart”

- Solving the game algorithmically or suggesting optimal moves is **not required** for v1 unless added later.

---

## 6. Win, Loss, and Progress

### 6.1 Win condition

- All cards rest on the **four foundations**, each complete **Ace → King** by suit.

### 6.2 Win count

- Persist a **Win count** across sessions (local storage or Tauri-backed store).
- Display prominently on the game UI (exact placement: e.g. header bar—aligned with reference screenshots).

### 6.3 Loss / stuck states

- No requirement to detect “unwinnable” automatically for v1.
- **Restart** must always be available.

---

## 7. UX & UI Requirements

### 7.1 Controls (minimum)

- **Reset / New game / Restart** — starts a fresh shuffle; confirm optional (product decision: soft restart without modal is acceptable).
- **Main menu** — returns to the home screen; unsaved mid-game state may be discarded or optionally preserved later (v1: simple discard is acceptable if documented).

### 7.2 Feedback

- Illegal move: brief visual feedback (shake, snap-back, or equivalent).
- Legal move: smooth transition to target.
- Optional: subtle sound (off by default or user-toggle—product decision).

### 7.3 Accessibility (baseline)

- Keyboard focus and shortcuts may be phased; **mouse/touch-first** for v1.
- Sufficient contrast for dark mode text and controls.

---

## 8. Technical Constraints

### 8.1 Frontend

- **TypeScript** for game logic and UI state.
- **HTML/CSS** for structure and styling (no mandated framework; choose what stays lightweight).

### 8.2 Desktop shell

- **Tauri** for packaging, window management, and native integrations as needed.
- Avoid heavy runtimes; prefer small bundle and efficient rendering (CSS transforms for card motion, etc.).

### 8.3 Persistence

- Win count (and optionally last theme) persisted locally.
- No server or account system required.

---

## 9. Open Questions (Resolve Before or During Implementation)

1. **Alternating colors:** Confirm standard Klondike red/black alternation for tableau builds (assumed above).
2. **Scoring / time / moves:** Not requested—omit unless added later.
3. **Undo:** Not specified—optional enhancement.
4. **Confirmation** on main menu navigation if a game is in progress.
5. **Exact behavior** when both waste and tableau have playable cards—no automation beyond foundation rules unless specified.

---

## 10. Acceptance Criteria (High Level)

- Dark-mode UI by default; cohesive, stylish presentation.
- Reference images remain under version control in the repo.
- Home → single entry → game; game → main menu + restart.
- Rules implemented as in §4, including single-pass stock, draw-three waste, stock slot becoming a free cell, any card into empty tableau / ex-stock cell.
- Automated, legal moves to foundations with a sensible “smart” baseline (§5).
- Win count persists and displays.
- Smooth animations and polished interaction.
- Tauri build produces a lightweight desktop app.

---

*End of requirements document.*