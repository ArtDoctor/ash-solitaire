# Solitaire — Implementation To-Do List

Working checklist derived from `docs/REQUIREMENTS.md`. Check items off as you complete them.

---

## 0. Repository & tooling

- [x] Initialize **Tauri** app with **HTML / CSS / TypeScript** frontend (official template or minimal equivalent).
- [x] Configure `package.json` scripts: `dev`, `build`, `tauri build` (or project-standard names).
- [x] Add **EditorConfig** / basic formatting alignment (optional but recommended).
- [x] Verify desktop build runs on target OS (Windows).

---

## 1. App shell & navigation

- [ ] **Home screen:** first route/view after launch; single entry → solitaire game.
- [ ] **Game screen:** tableau, foundations, stock/waste, post-deck free cell region, win count, controls.
- [ ] **Restart** — new shuffle, same rules (confirm modal optional).
- [ ] **Main menu** — return to home without exiting the app.
- [ ] Dark-mode styling by default; layout aligned with reference shots (left foundations, top stock/waste).

---

## 2. Game rules (logic)

- [ ] Deck: 52 cards, shuffle per new game.
- [ ] Deal tableau **1…7** face-up; four foundations (Ace→King by suit).
- [ ] Tableau: build down, alternating colors; move only top card or valid top sequence.
- [ ] Empty tableau: **any** card (or allowed sequence) may start the column.
- [ ] Stock: draw **3** per click; **only waste top** playable; **single pass** (no restock).
- [ ] When stock empty: **stock slot becomes a free cell** (any single card per rules doc).
- [ ] Win detection: all cards on foundations.
- [ ] Foundation **auto-move** + sensible shortcuts (e.g. double-click to foundation, optional chain).

---

## 3. UX, animation, persistence

- [ ] Smooth card motion (CSS transforms / FLIP / small library — keep bundle light).
- [ ] Illegal-move feedback; legal targets readable.
- [ ] **Win count** — display + persist (Tauri store or local file / `localStorage` with fallback).
- [ ] Win celebration state (subtle animation enough for v1).

---

## 4. Testing

### 4.1 Unit / module tests (optional but valuable)

- [ ] Add **Vitest** (or **Node test** runner) for pure TS: deck shuffle, move legality, win detection.
- [ ] Cover edge cases: last stock draw with fewer than 3 cards, empty stock + waste behavior, free cell rules.

### 4.2 End-to-end (Playwright)

- [ ] Add **Playwright**; configure for the **web build** served locally (Tauri dev server or static `dist` — pick one stable flow for CI).
- [ ] Script `test:e2e` in `package.json`; document one-command local run in a short comment or script header.
- [ ] Smoke: open app → home visible → launch game → tableau has 7 columns.
- [ ] Interaction: draw from stock → waste shows draw-three behavior; only top waste card draggable/clickable per spec.
- [ ] Navigation: game → main menu → home; restart starts new layout (deterministic seed optional for CI).
- [ ] Optional: screenshot snapshot for critical screens (dark theme) if flakiness is manageable.

### 4.3 CI (optional)

- [ ] GitHub Actions (or other): install deps, `npm run build`, unit tests, Playwright e2e against built static site or dev server.

---

## 5. Release & polish

- [ ] `tauri build` produces installable artifact; smoke-test install.
- [ ] README: how to dev, test, build (minimal — only if you add a README later).

---

## Notes

- **Playwright** targets the **web frontend** in a browser context; wire it to whatever URL `vite`/`tauri dev` exposes. Full native-window-only testing is optional and heavier—start with web e2e.
- Re-read `docs/REQUIREMENTS.md` before closing out “rules correct” items.
