// ── Navigation, shell, and live game ─────────────────────────────────────────

import {
  createCardEl,
  createStockEl,
  createWasteFanEl,
  cssLengthVarPx,
  renderTableauCol,
  type CardData,
} from "./cards.js";
import {
  dealFairOpeningDeal,
  dealNewGame,
  drawFromStock,
  getDealSequence,
  isValidDescendingRun,
  isWon,
  partialTableauAfterDealSteps,
  peekMovingCards,
  peekNextAutoFoundationMove,
  tryApplyMove,
  tryDoubleClickFoundation,
  type AutoFoundationOptions,
  type GameState,
  type MoveSource,
  type MoveTarget,
} from "./gameLogic.js";
import { invoke, isTauri } from "@tauri-apps/api/core";

const WINS_KEY = "solitaire-wins";
const GAME_FULLSCREEN_KEY = "solitaire-game-borderless-fullscreen";
const HIDE_STATIONARY_DRAG_SOURCE_KEY = "solitaire-hide-stationary-drag-source";
const AUTO_FOUNDATION_MAX_RANK_SPREAD_KEY =
  "solitaire-auto-foundation-max-rank-spread";

type ScreenId = "home" | "settings" | "game";

let gameState: GameState = dealNewGame(Math.random);
/** How many waste cards were just added by the most recent stock draw (for animation). */
let lastDrawCount = 0;

const DEAL_STEPS = 28;

type DealAnimState = {
  full: GameState;
  seq: { col: number; card: CardData }[];
  k: number;
};

/** Initial deal in progress — render uses partial tableau + fake stock count. */
let dealAnim: DealAnimState | null = null;
/** Blocks input while deal / fly / waste draw runs. */
let animBusy = false;
/**
 * Bumped when a new deal/restart begins so in-flight animations stop mutating state
 * and do not clear `animBusy` after being superseded.
 */
let animEpoch = 0;

function setAnimBusy(busy: boolean): void {
  animBusy = busy;
  document.body.classList.toggle("anim-busy", busy);
}

const DRAG_START_PX = 6;
/** Radius at which gravity toward a valid target starts to influence the ghost. */
const GRAVITY_RADIUS_PX = 170;
/** Pointer movement needed before gravity reaches full strength. */
const GRAVITY_ARM_PX = 36;
/** Below this pull value, we don't consider the target "engaged" (no preview). Same threshold on release so a highlighted drop commits. */
const GRAVITY_PREVIEW_MIN = 0.12;

type ScreenPoint = { x: number; y: number };

type DragSession = {
  source: MoveSource;
  cards: CardData[];
  ghost: HTMLElement;
  grabEl: HTMLElement;
  /** Tableau run / single source — all dimmed while dragging */
  dimEls: HTMLElement[];
  /** Pointer position when the drag began (gravity stays off until cursor moves away). */
  dragOrigin: ScreenPoint;
  /** Offset from pointer to ghost top-left */
  offsetX: number;
  offsetY: number;
  /** Index within moving stack of the grabbed card (for multi-card tableau drag) */
  grabIndex: number;
  lastClient: ScreenPoint;
  previewTarget: MoveTarget | null;
};

let dragPending: {
  source: MoveSource;
  start: ScreenPoint;
  grabEl: HTMLElement;
  grabIndex: number;
} | null = null;

/** Tracks face-down count per column to detect card flips between renders. */
let prevFaceDownCounts: number[] = [0, 0, 0, 0, 0, 0, 0];

let drag: DragSession | null = null;

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

// ─── Screen navigation ───────────────────────────────────────────────────────────

function showScreen(id: ScreenId): void {
  document.querySelectorAll<HTMLElement>(".screen").forEach((el) => {
    el.classList.toggle("active", el.id === `screen-${id}`);
  });
}

function loadGameFullscreenPref(): boolean {
  const v = localStorage.getItem(GAME_FULLSCREEN_KEY);
  if (v === null) return true;
  return v === "true";
}

function saveGameFullscreenPref(on: boolean): void {
  localStorage.setItem(GAME_FULLSCREEN_KEY, on ? "true" : "false");
}

function loadHideStationaryDragSourcePref(): boolean {
  return localStorage.getItem(HIDE_STATIONARY_DRAG_SOURCE_KEY) === "true";
}

function saveHideStationaryDragSourcePref(on: boolean): void {
  localStorage.setItem(HIDE_STATIONARY_DRAG_SOURCE_KEY, on ? "true" : "false");
}

/** Max (highest foundation top) − (lowest foundation top) for automated / double-click moves to foundations; 0–12 (12 = no limit). */
function loadAutoFoundationMaxRankSpread(): number {
  const raw = localStorage.getItem(AUTO_FOUNDATION_MAX_RANK_SPREAD_KEY);
  const n = raw === null ? 2 : parseInt(raw, 10);
  if (!Number.isFinite(n)) return 2;
  return Math.min(12, Math.max(0, Math.round(n)));
}

function saveAutoFoundationMaxRankSpread(n: number): void {
  localStorage.setItem(AUTO_FOUNDATION_MAX_RANK_SPREAD_KEY, String(n));
}

function autoFoundationOpts(): AutoFoundationOptions {
  return { maxFoundationRankSpread: loadAutoFoundationMaxRankSpread() };
}

async function applyWindowGameFullscreen(enabled: boolean): Promise<void> {
  if (!isTauri()) return;
  await invoke("set_game_fullscreen", { enabled });
}

async function quitApplication(): Promise<void> {
  if (!isTauri()) return;
  await invoke("quit_app");
}

function syncSettingsCheckbox(): void {
  const fullscreen = document.getElementById(
    "setting-game-fullscreen",
  ) as HTMLInputElement | null;
  if (fullscreen) fullscreen.checked = loadGameFullscreenPref();
  const hideStationary = document.getElementById(
    "setting-hide-stationary-drag-source",
  ) as HTMLInputElement | null;
  if (hideStationary) hideStationary.checked = loadHideStationaryDragSourcePref();
  const maxSpread = document.getElementById(
    "setting-auto-foundation-max-rank-spread",
  ) as HTMLInputElement | null;
  if (maxSpread) maxSpread.value = String(loadAutoFoundationMaxRankSpread());
}

function shake(el: HTMLElement): void {
  el.classList.remove("shake");
  void el.offsetWidth;
  el.classList.add("shake");
  el.addEventListener(
    "animationend",
    () => {
      el.classList.remove("shake");
    },
    { once: true },
  );
}

function showWinOverlay(): void {
  const existing = document.querySelector(".win-overlay");
  existing?.remove();

  const overlay = document.createElement("div");
  overlay.className = "win-overlay";
  overlay.innerHTML = `
    <div class="win-card">
      <h2>You win</h2>
      <p>All suits built to King.</p>
      <button type="button" class="btn-primary" id="win-dismiss">Continue</button>
    </div>
  `;
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.remove();
  });
  overlay.querySelector("#win-dismiss")?.addEventListener("click", () => {
    overlay.remove();
    void dealAndRender();
  });
  document.body.appendChild(overlay);
}

function checkWin(): void {
  if (isWon(gameState)) {
    const w = loadWins() + 1;
    saveWins(w);
    refreshWinDisplay();
    showWinOverlay();
  }
}

// ─── Drag ghost ───────────────────────────────────────────────────────────────

function createDragGhost(cards: CardData[]): HTMLElement {
  const overlap = cssLengthVarPx("--col-overlap", "height");
  const cardH = cssLengthVarPx("--card-h", "height");
  const cardW = cssLengthVarPx("--card-w", "width");
  const inner = document.createElement("div");
  inner.className = "drag-ghost-stack";
  if (cards.length > 0) {
    const totalH = (cards.length - 1) * overlap + cardH;
    inner.style.width = `${cardW}px`;
    inner.style.minHeight = `${totalH}px`;
  }
  cards.forEach((card, i) => {
    const c = createCardEl(card);
    c.style.position = "absolute";
    c.style.left = "0";
    c.style.top = `${i * overlap}px`;
    c.style.zIndex = String(i + 1);
    c.style.pointerEvents = "none";
    inner.appendChild(c);
  });
  const outer = document.createElement("div");
  outer.className = "drag-ghost";
  outer.style.pointerEvents = "none";
  outer.appendChild(inner);
  document.body.appendChild(outer);
  return outer;
}

function clearDropPreview(): void {
  document.querySelectorAll(".drop-preview").forEach((el) => {
    el.classList.remove("drop-preview");
  });
}

function setDropPreview(target: MoveTarget | null): void {
  clearDropPreview();
  if (!target) return;
  if (target.kind === "foundation") {
    document.getElementById(`foundation-${target.pile}`)?.classList.add("drop-preview");
    return;
  }
  if (target.kind === "tableau") {
    document.getElementById(`tableau-${target.col}`)?.classList.add("drop-preview");
    return;
  }
  if (target.kind === "freeCell") {
    document.getElementById("stock")?.classList.add("drop-preview");
  }
}

function allMoveTargets(): MoveTarget[] {
  const t: MoveTarget[] = [];
  for (let i = 0; i < 4; i++) t.push({ kind: "foundation", pile: i });
  for (let c = 0; c < 7; c++) t.push({ kind: "tableau", col: c });
  t.push({ kind: "freeCell" });
  return t;
}

function snapPositionForTarget(target: MoveTarget): { left: number; top: number } | null {
  const overlap = cssLengthVarPx("--col-overlap", "height");

  if (target.kind === "foundation") {
    const el = document.getElementById(`foundation-${target.pile}`);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top };
  }

  if (target.kind === "freeCell") {
    const stock = document.getElementById("stock");
    if (!stock) return null;
    const r = stock.getBoundingClientRect();
    return { left: r.left, top: r.top };
  }

  if (target.kind === "tableau") {
    const col = document.getElementById(`tableau-${target.col}`);
    if (!col) return null;
    const r = col.getBoundingClientRect();
    const pile = gameState.tableau[target.col]!;
    const depth = pile.length;
    const topPx = depth * overlap;
    return { left: r.left, top: r.top + topPx };
  }

  return null;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function smoothstep01(v: number): number {
  const t = clamp01(v);
  return t * t * (3 - 2 * t);
}

/** Target under pointer, if it's a legal drop — used to force-commit on release. */
function targetUnderPointer(clientX: number, clientY: number, session: DragSession): MoveTarget | null {
  const hit = document.elementFromPoint(clientX, clientY);
  if (!hit) return null;
  const el = hit as HTMLElement;
  const fId = el.closest("[id^='foundation-']") as HTMLElement | null;
  if (fId?.id?.startsWith("foundation-")) {
    const pile = parseInt(fId.id.replace("foundation-", ""), 10);
    if (!Number.isNaN(pile)) {
      const t: MoveTarget = { kind: "foundation", pile };
      if (tryApplyMove(gameState, session.source, t)) return t;
    }
  }
  const tCol = el.closest("[id^='tableau-']") as HTMLElement | null;
  if (tCol?.id?.startsWith("tableau-")) {
    const col = parseInt(tCol.id.replace("tableau-", ""), 10);
    if (!Number.isNaN(col)) {
      const t: MoveTarget = { kind: "tableau", col };
      if (tryApplyMove(gameState, session.source, t)) return t;
    }
  }
  const stock = el.closest("#stock");
  if (stock && tryApplyMove(gameState, session.source, { kind: "freeCell" })) {
    return { kind: "freeCell" };
  }
  return null;
}

type GravityHit = {
  target: MoveTarget;
  /** 0..1. 1 = ghost fully at target; 0 = no influence. */
  pull: number;
  snapLeft: number;
  snapTop: number;
};

/** Pull the ghost toward the nearest legal snapped position without hard edges. */
function findGravity(clientX: number, clientY: number, session: DragSession): GravityHit | null {
  const freeLeft = clientX - session.offsetX;
  const freeTop = clientY - session.offsetY;
  const armDx = clientX - session.dragOrigin.x;
  const armDy = clientY - session.dragOrigin.y;
  const armDist = Math.hypot(armDx, armDy);
  const armPull = smoothstep01(armDist / GRAVITY_ARM_PX);

  let bestD = Infinity;
  let best: { target: MoveTarget; snap: { left: number; top: number } } | null = null;

  for (const t of allMoveTargets()) {
    if (!tryApplyMove(gameState, session.source, t)) continue;
    const snap = snapPositionForTarget(t);
    if (!snap) continue;
    const d = Math.hypot(snap.left - freeLeft, snap.top - freeTop);
    if (d < bestD) {
      bestD = d;
      best = { target: t, snap };
    }
  }

  if (!best || bestD >= GRAVITY_RADIUS_PX) return null;
  const pull = smoothstep01(1 - bestD / GRAVITY_RADIUS_PX) * armPull;
  if (pull <= 0) return null;

  return {
    target: best.target,
    pull,
    snapLeft: best.snap.left,
    snapTop: best.snap.top,
  };
}

function positionGhost(session: DragSession, clientX: number, clientY: number, hit: GravityHit | null): void {
  const freeLeft = clientX - session.offsetX;
  const freeTop = clientY - session.offsetY;
  if (!hit) {
    session.ghost.style.left = `${freeLeft}px`;
    session.ghost.style.top = `${freeTop}px`;
    return;
  }
  const left = freeLeft + (hit.snapLeft - freeLeft) * hit.pull;
  const top = freeTop + (hit.snapTop - freeTop) * hit.pull;
  session.ghost.style.left = `${left}px`;
  session.ghost.style.top = `${top}px`;
}

function endDrag(options?: { keepGhost?: boolean }): void {
  if (!drag) return;
  for (const el of drag.dimEls) {
    el.classList.remove("drag-source-dim", "drag-source-hidden");
  }
  if (!options?.keepGhost) drag.ghost.remove();
  document.body.classList.remove("is-dragging");
  clearDropPreview();
  drag = null;
}

/** DOM nodes to dim for the whole moving stack (tableau run or single card). */
function dragSourceDimElements(source: MoveSource, grabEl: HTMLElement): HTMLElement[] {
  if (source.kind === "tableau") {
    const col = document.getElementById(`tableau-${source.col}`);
    const nodes = col?.querySelectorAll<HTMLElement>(".card");
    if (!nodes?.length) return [grabEl];
    const out: HTMLElement[] = [];
    for (let i = source.start; i < nodes.length; i++) out.push(nodes[i]!);
    return out.length > 0 ? out : [grabEl];
  }
  return [grabEl];
}

function startDragFromPending(): DragSession | null {
  if (animBusy) return null;
  if (!dragPending) return null;
  window.removeEventListener("pointermove", onGlobalPointerMove);
  window.removeEventListener("pointerup", onGlobalPointerUpCancelHandler);
  window.removeEventListener("pointercancel", onGlobalPointerUpCancelHandler);

  const { source, grabEl, grabIndex, start } = dragPending;
  dragPending = null;

  const cards = peekMovingCards(gameState, source);
  if (!cards || cards.length === 0) return null;

  const rect = grabEl.getBoundingClientRect();
  const offsetX = start.x - rect.left;
  const offsetY = start.y - rect.top + grabIndex * cssLengthVarPx("--col-overlap", "height");

  const ghost = createDragGhost(cards);
  const dimEls = dragSourceDimElements(source, grabEl);
  const session: DragSession = {
    source,
    cards,
    ghost,
    grabEl,
    dimEls,
    dragOrigin: start,
    offsetX,
    offsetY,
    grabIndex,
    lastClient: start,
    previewTarget: null,
  };
  drag = session;
  document.body.classList.add("is-dragging");
  for (const el of dimEls) {
    if (loadHideStationaryDragSourcePref()) el.classList.add("drag-source-hidden");
    else el.classList.add("drag-source-dim");
  }
  positionGhost(session, start.x, start.y, null);

  const cleanupPointers = () => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onUp);
    window.removeEventListener("keydown", onKey);
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key !== "Escape" || !drag) return;
    e.preventDefault();
    cleanupPointers();
    endDrag();
    renderGame();
  };

  const onMove = (e: PointerEvent) => {
    if (!drag) return;
    drag.lastClient = { x: e.clientX, y: e.clientY };
    const hit = findGravity(e.clientX, e.clientY, drag);
    positionGhost(drag, e.clientX, e.clientY, hit);
    if (hit && hit.pull >= GRAVITY_PREVIEW_MIN) {
      drag.previewTarget = hit.target;
      setDropPreview(hit.target);
    } else {
      drag.previewTarget = null;
      clearDropPreview();
    }
  };

  const onUp = (e: PointerEvent) => {
    cleanupPointers();

    if (!drag) return;
    const current = drag;

    const hitRelease = findGravity(e.clientX, e.clientY, current);
    positionGhost(current, e.clientX, e.clientY, hitRelease);

    // Priority: explicit pointer-over target > gravity pull (same threshold as drop preview)
    const underPointer = targetUnderPointer(e.clientX, e.clientY, current);
    let target: MoveTarget | null = underPointer;
    if (!target && hitRelease && hitRelease.pull >= GRAVITY_PREVIEW_MIN) {
      target = hitRelease.target;
    }
    // Last frame may have shown preview while release position barely misses pull (no move event in between).
    if (!target && current.previewTarget) {
      if (tryApplyMove(gameState, current.source, current.previewTarget)) {
        target = current.previewTarget;
      }
    }

    let didMove: GameState | null = null;
    let committedTarget: MoveTarget | null = null;
    if (target) {
      const moved = tryApplyMove(gameState, current.source, target);
      if (moved) {
        gameState = moved;
        didMove = moved;
        committedTarget = target;
        checkWin();
      } else {
        const slot =
          target.kind === "foundation"
            ? document.getElementById(`foundation-${target.pile}`)
            : target.kind === "tableau"
              ? document.getElementById(`tableau-${target.col}`)
              : document.getElementById("stock");
        if (slot) shake(slot);
      }
    }

    const dropFromRects =
      didMove && committedTarget ? rectsFromDragGhost(current.ghost) : null;
    const reboundFromRects = !didMove ? rectsFromDragGhost(current.ghost) : null;
    const reboundGhost: HTMLElement | null = !didMove ? current.ghost : null;

    if (didMove) endDrag();
    else endDrag({ keepGhost: true });
    renderGame();

    if (didMove && committedTarget && dropFromRects) {
      // `endDrag` cleared drop-preview; restore until the flight transition starts so the slot outline
      // does not disappear for ~one pulse cycle before the ghost moves.
      setDropPreview(committedTarget);
      setAnimBusy(true);
      const dropEpoch = animEpoch;
      void (async () => {
        try {
          await flyPlayerMoveToDestination(current.cards, dropFromRects, committedTarget);
          if (dropEpoch !== animEpoch) return;
          await runAutoFoundationChainAnimation(dropEpoch);
          if (dropEpoch !== animEpoch) return;
          checkWin();
        } finally {
          if (dropEpoch === animEpoch) setAnimBusy(false);
        }
      })();
    } else if (reboundFromRects) {
      void flyPlayerMoveToSource(
        current.cards,
        reboundFromRects,
        current.source,
        reboundGhost,
      );
    }
  };

  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onUp);
  window.addEventListener("keydown", onKey);
  return session;
}

function onGlobalPointerMove(e: PointerEvent): void {
  if (!dragPending || drag) return;
  const dx = e.clientX - dragPending.start.x;
  const dy = e.clientY - dragPending.start.y;
  if (dx * dx + dy * dy >= DRAG_START_PX * DRAG_START_PX) {
    const d = startDragFromPending();
    if (d) {
      d.lastClient = { x: e.clientX, y: e.clientY };
      const hit = findGravity(e.clientX, e.clientY, d);
      positionGhost(d, e.clientX, e.clientY, hit);
      if (hit && hit.pull >= GRAVITY_PREVIEW_MIN) {
        d.previewTarget = hit.target;
        setDropPreview(hit.target);
      }
    }
  }
}

function clearPendingDrag(): void {
  window.removeEventListener("pointermove", onGlobalPointerMove);
  window.removeEventListener("pointerup", onGlobalPointerUpCancelHandler);
  window.removeEventListener("pointercancel", onGlobalPointerUpCancelHandler);
  dragPending = null;
}

function onGlobalPointerUpCancelHandler(): void {
  clearPendingDrag();
}

// ─── Card flight animations (sequential) ─────────────────────────────────────

const FLY_MS_DEAL = 88;
const FLY_MS_FOUNDATION = 260;
/** Player drop: ghost → pile */
const FLY_MS_PLAYER_MOVE = 220;
const WASTE_DRAW_BASE_MS = 260;
const WASTE_DRAW_STAGGER_MS = 70;
const FLY_SETTLE_RATIO_PLAYER = 0.82;
const FLY_SETTLE_RATIO_FOUNDATION = 0.8;
/** Spawn placement ripple this many ms before the flight ends (at destination, not on the ghost). */
const DROP_RIPPLE_LEAD_MS = 200;

type Rect = { left: number; top: number; width: number; height: number };

function toRect(el: DOMRect): Rect {
  return { left: el.left, top: el.top, width: el.width, height: el.height };
}

function tableauSlotRect(col: number, depth: number): Rect | null {
  const colEl = document.getElementById(`tableau-${col}`);
  if (!colEl) return null;
  const r = colEl.getBoundingClientRect();
  const overlap = cssLengthVarPx("--col-overlap", "height");
  const cw = cssLengthVarPx("--card-w", "width");
  const ch = cssLengthVarPx("--card-h", "height");
  return {
    left: r.left,
    top: r.top + depth * overlap,
    width: cw,
    height: ch,
  };
}

function stockPileRect(): Rect | null {
  const stock = document.getElementById("stock");
  if (!stock) return null;
  const pile = stock.querySelector(".card-stock-pile");
  const r = (pile ?? stock).getBoundingClientRect();
  return toRect(r);
}

function rectForMoveSource(src: MoveSource): Rect | null {
  if (src.kind === "waste") {
    const waste = document.getElementById("waste");
    const top = waste?.querySelector<HTMLElement>(".waste-card:last-child");
    if (top) return toRect(top.getBoundingClientRect());
    return null;
  }
  if (src.kind === "freeCell") {
    const stock = document.getElementById("stock");
    const card = stock?.querySelector<HTMLElement>(".card");
    if (card) return toRect(card.getBoundingClientRect());
    return null;
  }
  const col = document.getElementById(`tableau-${src.col}`);
  const cards = col?.querySelectorAll<HTMLElement>(".card");
  if (!cards?.length) return null;
  const last = cards[cards.length - 1]!;
  return toRect(last.getBoundingClientRect());
}

function rectsFromDragGhost(ghost: HTMLElement): Rect[] {
  return [...ghost.querySelectorAll<HTMLElement>(".drag-ghost-stack .card")].map((el) =>
    toRect(el.getBoundingClientRect()),
  );
}

function rectsFromElements(elements: HTMLElement[]): Rect[] {
  return elements.map((el) => toRect(el.getBoundingClientRect()));
}

/** Cards that ended up on `target` after `renderGame` (same order as `peekMovingCards` had). */
function destinationCardElements(target: MoveTarget, stackLen: number): HTMLElement[] | null {
  if (stackLen <= 0) return null;
  if (target.kind === "foundation") {
    const slot = document.getElementById(`foundation-${target.pile}`);
    const c = slot?.querySelector<HTMLElement>(".card");
    return c ? [c] : null;
  }
  if (target.kind === "freeCell") {
    const stock = document.getElementById("stock");
    const c = stock?.querySelector<HTMLElement>(".card");
    return c ? [c] : null;
  }
  if (target.kind === "tableau") {
    const col = document.getElementById(`tableau-${target.col}`);
    const all = col?.querySelectorAll<HTMLElement>(".card");
    if (!all?.length) return null;
    const n = all.length;
    if (n < stackLen) return null;
    const out: HTMLElement[] = [];
    for (let i = n - stackLen; i < n; i++) out.push(all[i]!);
    return out.length === stackLen ? out : null;
  }
  return null;
}

/** Cards currently at `source` after `renderGame` (same order as `peekMovingCards`). */
function sourceCardElements(source: MoveSource, stackLen: number): HTMLElement[] | null {
  if (stackLen <= 0) return null;
  if (source.kind === "waste") {
    const waste = document.getElementById("waste");
    const top = waste?.querySelector<HTMLElement>(".waste-card:last-child");
    return top ? [top] : null;
  }
  if (source.kind === "freeCell") {
    const stock = document.getElementById("stock");
    const c = stock?.querySelector<HTMLElement>(".card");
    return c ? [c] : null;
  }
  if (source.kind === "tableau") {
    const col = document.getElementById(`tableau-${source.col}`);
    const all = col?.querySelectorAll<HTMLElement>(".card");
    if (!all?.length) return null;
    const end = source.start + stackLen;
    if (end > all.length) return null;
    const out: HTMLElement[] = [];
    for (let i = source.start; i < end; i++) out.push(all[i]!);
    return out.length === stackLen ? out : null;
  }
  return null;
}

async function flyPlayerMoveToDestination(
  cards: CardData[],
  fromRects: Rect[],
  target: MoveTarget,
): Promise<void> {
  if (cards.length !== fromRects.length) return;
  const dest = destinationCardElements(target, cards.length);
  if (!dest || dest.length !== cards.length) return;

  dest.forEach((el) => el.classList.add("card--auto-flight-source"));
  void dest[0]!.offsetHeight;
  const toRects = dest.map((el) => toRect(el.getBoundingClientRect()));

  const rippleColor =
    target.kind === "foundation"
      ? "rgba(110,168,255,0.9)"
      : "rgba(255,255,255,0.6)";

  let clearedDropPreview = false;
  const clearDropPreviewOnce = (): void => {
    if (clearedDropPreview) return;
    clearedDropPreview = true;
    clearDropPreview();
  };

  try {
    await Promise.all(
      cards.map((card, i) =>
        flyCard(
          card,
          fromRects[i]!,
          toRects[i]!,
          FLY_MS_PLAYER_MOVE,
          {
            rippleColor,
            settleRatio: FLY_SETTLE_RATIO_PLAYER,
            onSettle: i === 0 ? clearDropPreviewOnce : undefined,
          },
        ),
      ),
    );
  } finally {
    dest.forEach((el) => el.classList.remove("card--auto-flight-source"));
  }
}

/** Invalid drop: fly from release position back to original pile. */
async function flyPlayerMoveToSource(
  cards: CardData[],
  fromRects: Rect[],
  source: MoveSource,
  dragGhostToRemove?: HTMLElement | null,
): Promise<void> {
  if (dragGhostToRemove) dragGhostToRemove.remove();

  if (cards.length !== fromRects.length) return;
  const dest = sourceCardElements(source, cards.length);
  if (!dest || dest.length !== cards.length) return;

  dest.forEach((el) => el.classList.add("card--auto-flight-source"));
  void dest[0]!.offsetHeight;
  const toRects = dest.map((el) => toRect(el.getBoundingClientRect()));

  try {
    await Promise.all(
      cards.map((card, i) =>
        flyCard(card, fromRects[i]!, toRects[i]!, FLY_MS_PLAYER_MOVE, {
          settleRatio: FLY_SETTLE_RATIO_PLAYER,
        }),
      ),
    );
  } finally {
    dest.forEach((el) => el.classList.remove("card--auto-flight-source"));
  }
}

async function flyCommittedFoundationMove(
  card: CardData,
  from: Rect,
  target: MoveTarget,
  prevTop: CardData | null,
): Promise<void> {
  const dest = destinationCardElements(target, 1);
  if (!dest || dest.length !== 1) return;

  dest[0]!.classList.add("card--auto-flight-source");
  void dest[0]!.offsetHeight;
  const to = rectsFromElements(dest)[0];
  if (!to) {
    dest[0]!.classList.remove("card--auto-flight-source");
    return;
  }

  // Keep the previous top card visible beneath the (hidden) new top, so the
  // foundation slot does not flash empty while the ghost is still flying.
  let underEl: HTMLElement | null = null;
  if (prevTop && target.kind === "foundation") {
    const slot = document.getElementById(`foundation-${target.pile}`);
    if (slot) {
      underEl = createCardEl(prevTop);
      underEl.style.position = "absolute";
      underEl.style.top = "0";
      underEl.style.left = "0";
      underEl.classList.add("card--auto-flight-under");
      slot.insertBefore(underEl, dest[0]!);
    }
  }

  try {
    await flyCard(card, from, to, FLY_MS_FOUNDATION, {
      rippleColor: "rgba(110,168,255,0.9)",
      settleRatio: FLY_SETTLE_RATIO_FOUNDATION,
      onSettle: () => {
        // Reveal the real new top card the moment the ghost lands, then remove
        // the placeholder previous-top underneath.
        dest[0]!.classList.remove("card--auto-flight-source");
        if (underEl) {
          underEl.remove();
          underEl = null;
        }
      },
    });
  } finally {
    dest[0]!.classList.remove("card--auto-flight-source");
    if (underEl) underEl.remove();
  }
}

function spawnStockBurst(rect: Rect): void {
  const el = document.createElement("div");
  el.className = "stock-burst";
  el.style.left = `${rect.left}px`;
  el.style.top = `${rect.top}px`;
  el.style.width = `${rect.width}px`;
  el.style.height = `${rect.height}px`;
  document.body.appendChild(el);
  el.addEventListener("animationend", () => el.remove(), { once: true });
}

function spawnDropRipple(rect: Rect, color: string): void {
  const el = document.createElement("div");
  el.className = "drop-ripple";
  el.style.left = `${rect.left}px`;
  el.style.top = `${rect.top}px`;
  el.style.width = `${rect.width}px`;
  el.style.height = `${rect.height}px`;
  el.style.borderColor = color;
  document.body.appendChild(el);
  el.addEventListener("animationend", () => el.remove(), { once: true });
}

function flyCard(
  card: CardData,
  from: Rect,
  to: Rect,
  durationMs: number,
  options?: {
    rippleColor?: string;
    settleRatio?: number;
    onBeforeFlightTransition?: () => void;
    onSettle?: () => void;
  },
): Promise<void> {
  const ghost = createCardEl(card);
  ghost.classList.add("card-flight-ghost");
  ghost.style.left = `${from.left}px`;
  ghost.style.top = `${from.top}px`;
  ghost.style.width = `${from.width}px`;
  ghost.style.height = `${from.height}px`;
  document.body.appendChild(ghost);
  void ghost.offsetWidth;
  const ease = "cubic-bezier(.22,.9,.32,1)";
  const tr = `left ${durationMs}ms ${ease}, top ${durationMs}ms ${ease}, width ${durationMs}ms ${ease}, height ${durationMs}ms ${ease}`;
  const settleRatio = clamp01(options?.settleRatio ?? 1);
  const settleMs = Math.max(0, Math.round(durationMs * settleRatio));
  requestAnimationFrame(() => {
    options?.onBeforeFlightTransition?.();
    ghost.style.transition = tr;
    ghost.style.left = `${to.left}px`;
    ghost.style.top = `${to.top}px`;
    ghost.style.width = `${to.width}px`;
    ghost.style.height = `${to.height}px`;
  });
  return new Promise((resolve) => {
    let settled = false;
    let rippleSpawned = false;
    let rippleTimer: ReturnType<typeof setTimeout> | null = null;
    const color = options?.rippleColor;
    const spawnRippleOnce = (): void => {
      if (!color || rippleSpawned) return;
      rippleSpawned = true;
      spawnDropRipple(to, color);
    };
    if (color) {
      const delay = Math.max(0, durationMs - DROP_RIPPLE_LEAD_MS);
      rippleTimer = window.setTimeout(() => {
        rippleTimer = null;
        if (!settled) spawnRippleOnce();
      }, delay);
    }
    const done = (): void => {
      if (settled) return;
      settled = true;
      if (rippleTimer !== null) {
        window.clearTimeout(rippleTimer);
        rippleTimer = null;
      }
      ghost.remove();
      options?.onSettle?.();
      spawnRippleOnce();
      resolve();
    };
    const onEnd = (e: TransitionEvent): void => {
      if (e.target !== ghost) return;
      done();
    };
    ghost.addEventListener("transitionend", onEnd);
    window.setTimeout(done, settleMs + 34);
    window.setTimeout(done, durationMs + 80);
  });
}

function waitWasteDrawAnimation(drawn: number): Promise<void> {
  if (drawn <= 0) return Promise.resolve();
  const ms = WASTE_DRAW_BASE_MS + Math.max(0, drawn - 1) * WASTE_DRAW_STAGGER_MS;
  return new Promise((r) => setTimeout(r, ms));
}

function getRenderSnapshot(): { view: GameState; stockCount: number } {
  if (dealAnim && dealAnim.k < DEAL_STEPS) {
    return {
      view: {
        ...dealAnim.full,
        tableau: partialTableauAfterDealSteps(dealAnim.seq, dealAnim.k),
        foundations: [[], [], [], []],
        stock: [],
        waste: [],
        freeCell: null,
      },
      stockCount: 52 - dealAnim.k,
    };
  }
  return { view: gameState, stockCount: gameState.stock.length };
}

async function runAutoFoundationChainAnimation(expectedEpoch: number): Promise<void> {
  for (;;) {
    if (expectedEpoch !== animEpoch) return;
    const next = peekNextAutoFoundationMove(gameState, autoFoundationOpts());
    if (!next || next.target.kind !== "foundation") break;
    const card = peekMovingCards(gameState, next.source)?.[0];
    if (!card) break;
    const from = rectForMoveSource(next.source);
    const prevTop =
      next.target.kind === "foundation"
        ? (gameState.foundations[next.target.pile] ?? []).slice(-1)[0] ?? null
        : null;
    const applied = tryApplyMove(gameState, next.source, next.target);
    if (!applied) break;
    gameState = applied;
    renderGame();
    if (!from) continue;
    await flyCommittedFoundationMove(card, from, next.target, prevTop);
    if (expectedEpoch !== animEpoch) return;
  }
}

async function runDealSequenceAnimation(
  full: GameState,
  myEpoch: number,
): Promise<void> {
  const seq = getDealSequence(full);
  dealAnim = { full, seq, k: 0 };
  setAnimBusy(true);
  try {
    if (myEpoch !== animEpoch) return;
    renderGame();
    for (let step = 0; step < DEAL_STEPS; step++) {
      if (myEpoch !== animEpoch) return;
      const { col, card } = seq[step]!;
      const depth = partialTableauAfterDealSteps(seq, step)[col]!.length;
      const from = stockPileRect();
      const to = tableauSlotRect(col, depth);
      if (!from || !to) break;
      await flyCard(card, from, to, FLY_MS_DEAL);
      if (myEpoch !== animEpoch) return;
      dealAnim.k = step + 1;
      renderGame();
    }
    if (myEpoch !== animEpoch) return;
    gameState = full;
    dealAnim = null;
    renderGame();
    await runAutoFoundationChainAnimation(myEpoch);
    if (myEpoch !== animEpoch) return;
    checkWin();
  } finally {
    if (myEpoch === animEpoch) setAnimBusy(false);
  }
}

// ─── Rendering ─────────────────────────────────────────────────────────────────

function renderFoundations(view: GameState): void {
  for (let i = 0; i < 4; i++) {
    const slot = document.getElementById(`foundation-${i}`);
    if (!slot) continue;
    slot.innerHTML = "";
    slot.style.position = "relative";
    const pile = view.foundations[i]!;
    if (pile.length === 0) continue;
    const card = pile[pile.length - 1]!;
    const el = createCardEl(card);
    el.style.top = "0";
    el.style.left = "0";
    el.dataset.foundationPile = String(i);
    slot.appendChild(el);
  }
}

function renderStockAndFreeCell(view: GameState, stockCount: number): void {
  const stockSlot = document.getElementById("stock");
  if (!stockSlot) return;
  stockSlot.innerHTML = "";
  stockSlot.style.position = "relative";

  if (stockCount > 0) {
    stockSlot.classList.remove("stock-slot--free-cell");
    stockSlot.appendChild(createStockEl(stockCount));
    stockSlot.querySelector(".card-stock-pile")?.addEventListener("click", (e) => {
      e.stopPropagation();
      void onStockClick();
    });
    return;
  }

  stockSlot.classList.add("stock-slot--free-cell");
  if (view.freeCell) {
    const el = createCardEl(view.freeCell);
    el.style.top = "0";
    el.style.left = "0";
    el.classList.add("draggable-card");
    el.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      beginPossibleDrag(e, { kind: "freeCell" }, el, 0);
    });
    el.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      void onFreeCellDoubleClick();
    });
    stockSlot.appendChild(el);
  } else {
    const placeholder = document.createElement("div");
    placeholder.className = "free-cell-empty";
    placeholder.setAttribute("aria-label", "Free cell");
    stockSlot.appendChild(placeholder);
  }
}

function renderWaste(view: GameState): void {
  const wasteSlot = document.getElementById("waste");
  if (!wasteSlot) return;
  wasteSlot.innerHTML = "";

  const w = view.waste;
  if (w.length === 0) {
    wasteSlot.style.width = "";
    return;
  }

  const fan = createWasteFanEl(w);
  const cardW = cssLengthVarPx("--card-w", "width") || 78;
  const fanStep = cardW * (18 / 74);
  const drawStart = w.length - lastDrawCount;
  fan.querySelectorAll<HTMLElement>(".waste-card").forEach((el, i) => {
    el.style.position = "absolute";
    el.style.left = `${i * fanStep}px`;
    el.style.top = "0";
    el.style.zIndex = String(i);
    if (lastDrawCount > 0 && i >= drawStart) {
      el.classList.add("waste-card--drawn");
      el.style.animationDelay = `${(i - drawStart) * 70}ms`;
    }
  });
  const n = w.length;
  wasteSlot.style.width = `${cardW + Math.max(0, n - 1) * fanStep}px`;
  wasteSlot.style.position = "relative";
  wasteSlot.appendChild(fan);

  const top = fan.querySelector<HTMLElement>(".waste-card:last-child");
  if (top) {
    top.classList.add("draggable-card");
    top.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      beginPossibleDrag(e, { kind: "waste" }, top, 0);
    });
    top.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      void onWasteDoubleClick();
    });
  }
}

function renderTableau(view: GameState): void {
  for (let c = 0; c < 7; c++) {
    const col = document.getElementById(`tableau-${c}`);
    if (!col) continue;
    const cards = view.tableau[c]!;

    if (cards.length === 0) {
      col.innerHTML = "";
      col.style.minHeight = "";
      const placeholder = document.createElement("div");
      placeholder.className = "tableau-empty-hit";
      placeholder.style.cssText =
        "position:absolute;inset:0;z-index:0;cursor:default;";
      col.appendChild(placeholder);
      continue;
    }

    renderTableauCol(col, cards);

    col.querySelectorAll<HTMLElement>(".card").forEach((el, idx) => {
      el.dataset.tcol = String(c);
      el.dataset.tidx = String(idx);
      el.classList.add("draggable-card");
      el.addEventListener("pointerdown", (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        const colIdx = parseInt(el.dataset.tcol ?? "-1", 10);
        const rowIdx = parseInt(el.dataset.tidx ?? "-1", 10);
        if (!isValidDescendingRun(view.tableau[colIdx]!, rowIdx)) {
          shake(el);
          return;
        }
        beginPossibleDrag(
          e,
          { kind: "tableau", col: colIdx, start: rowIdx },
          el,
          0,
        );
      });
      el.addEventListener("dblclick", (e) => {
        e.stopPropagation();
        const colIdx = parseInt(el.dataset.tcol ?? "-1", 10);
        const rowIdx = parseInt(el.dataset.tidx ?? "-1", 10);
        void onTableauDoubleClick(colIdx, rowIdx);
      });
    });
  }
}

function beginPossibleDrag(
  e: PointerEvent,
  source: MoveSource,
  grabEl: HTMLElement,
  grabIndex: number,
): void {
  if (animBusy) return;
  if (peekMovingCards(gameState, source) === null) return;
  dragPending = {
    source,
    start: { x: e.clientX, y: e.clientY },
    grabEl,
    grabIndex,
  };
  window.addEventListener("pointermove", onGlobalPointerMove);
  window.addEventListener("pointerup", onGlobalPointerUpCancelHandler);
  window.addEventListener("pointercancel", onGlobalPointerUpCancelHandler);
}

function renderGame(): void {
  const { view, stockCount } = getRenderSnapshot();
  const newFaceDownCounts = view.tableau.map((col) => col.filter((c) => c.faceDown).length);

  renderFoundations(view);
  renderStockAndFreeCell(view, stockCount);
  renderWaste(view);
  renderTableau(view);

  // Animate newly revealed cards — skip during the initial deal to avoid spamming
  if (!dealAnim) {
    for (let c = 0; c < 7; c++) {
      const prev = prevFaceDownCounts[c]!;
      const next = newFaceDownCounts[c]!;
      if (prev > next) {
        const colEl = document.getElementById(`tableau-${c}`);
        const allCards = colEl?.querySelectorAll<HTMLElement>(".card");
        // The card at index `next` is the one that just flipped face-up
        if (allCards && allCards.length > next && next >= 0) {
          const revealed = allCards[next]!;
          revealed.classList.remove("card-flip-reveal");
          void revealed.offsetWidth;
          revealed.classList.add("card-flip-reveal");
          revealed.addEventListener("animationend", () => revealed.classList.remove("card-flip-reveal"), { once: true });
        }
      }
    }
  }

  prevFaceDownCounts = newFaceDownCounts;
}

// ─── Input ────────────────────────────────────────────────────────────────────

async function onStockClick(): Promise<void> {
  if (animBusy) return;
  const stockEpoch = animEpoch;
  const beforeWaste = gameState.waste.length;
  const drawn = drawFromStock(gameState);
  if (!drawn) return;

  const stockEl = document.getElementById("stock");
  if (stockEl) {
    const r = stockEl.getBoundingClientRect();
    spawnStockBurst({ left: r.left, top: r.top, width: r.width, height: r.height });
  }

  lastDrawCount = drawn.waste.length - beforeWaste;
  gameState = drawn;
  checkWin();
  renderGame();

  setAnimBusy(true);
  try {
    await waitWasteDrawAnimation(lastDrawCount);
    if (stockEpoch !== animEpoch) return;
    lastDrawCount = 0;
    renderGame();
    await runAutoFoundationChainAnimation(stockEpoch);
    if (stockEpoch !== animEpoch) return;
    checkWin();
  } finally {
    if (stockEpoch === animEpoch) setAnimBusy(false);
  }
}

async function onWasteDoubleClick(): Promise<void> {
  if (animBusy) return;
  const opEpoch = animEpoch;
  const next = tryDoubleClickFoundation(
    gameState,
    { kind: "waste" },
    autoFoundationOpts(),
  );
  if (!next) return;
  gameState = next;
  checkWin();
  renderGame();
  setAnimBusy(true);
  try {
    await runAutoFoundationChainAnimation(opEpoch);
    if (opEpoch !== animEpoch) return;
    checkWin();
  } finally {
    if (opEpoch === animEpoch) setAnimBusy(false);
  }
}

async function onFreeCellDoubleClick(): Promise<void> {
  if (animBusy) return;
  const opEpoch = animEpoch;
  const next = tryDoubleClickFoundation(
    gameState,
    { kind: "freeCell" },
    autoFoundationOpts(),
  );
  if (!next) return;
  gameState = next;
  checkWin();
  renderGame();
  setAnimBusy(true);
  try {
    await runAutoFoundationChainAnimation(opEpoch);
    if (opEpoch !== animEpoch) return;
    checkWin();
  } finally {
    if (opEpoch === animEpoch) setAnimBusy(false);
  }
}

async function onTableauDoubleClick(col: number, idx: number): Promise<void> {
  if (animBusy) return;
  const opEpoch = animEpoch;
  const next = tryDoubleClickFoundation(
    gameState,
    {
      kind: "tableau",
      col,
      start: idx,
    },
    autoFoundationOpts(),
  );
  if (!next) return;
  gameState = next;
  checkWin();
  renderGame();
  setAnimBusy(true);
  try {
    await runAutoFoundationChainAnimation(opEpoch);
    if (opEpoch !== animEpoch) return;
    checkWin();
  } finally {
    if (opEpoch === animEpoch) setAnimBusy(false);
  }
}

async function dealAndRender(): Promise<void> {
  endDrag();
  clearPendingDrag();
  animEpoch++;
  const myEpoch = animEpoch;
  const full = dealFairOpeningDeal(Math.random);
  await runDealSequenceAnimation(full, myEpoch);
}

// ─── Game lifecycle ───────────────────────────────────────────────────────────

async function startGame(): Promise<void> {
  refreshWinDisplay();
  showScreen("game");
  await dealAndRender();
  if (loadGameFullscreenPref()) {
    await applyWindowGameFullscreen(true);
  }
}

function restartGame(): void {
  void dealAndRender();
}

async function goHome(): Promise<void> {
  endDrag();
  clearPendingDrag();
  await applyWindowGameFullscreen(loadGameFullscreenPref());
  showScreen("home");
}

function openSettings(): void {
  syncSettingsCheckbox();
  showScreen("settings");
}

function closeSettings(): void {
  showScreen("home");
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────

window.addEventListener("DOMContentLoaded", () => {
  if (localStorage.getItem(WINS_KEY) === null) saveWins(0);
  if (localStorage.getItem(GAME_FULLSCREEN_KEY) === null) {
    saveGameFullscreenPref(true);
  }
  if (localStorage.getItem(AUTO_FOUNDATION_MAX_RANK_SPREAD_KEY) === null) {
    saveAutoFoundationMaxRankSpread(2);
  }

  document.getElementById("btn-play")?.addEventListener("click", () => {
    void startGame();
  });
  document.getElementById("btn-menu")?.addEventListener("click", () => {
    void goHome();
  });
  document.getElementById("btn-restart")?.addEventListener("click", restartGame);

  document.getElementById("btn-settings")?.addEventListener("click", openSettings);
  document.getElementById("btn-settings-back")?.addEventListener("click", closeSettings);
  document.getElementById("btn-close-app")?.addEventListener("click", () => {
    void quitApplication();
  });

  document
    .getElementById("setting-game-fullscreen")
    ?.addEventListener("change", (e) => {
      const el = e.target as HTMLInputElement;
      saveGameFullscreenPref(el.checked);
      void applyWindowGameFullscreen(el.checked);
    });

  document
    .getElementById("setting-hide-stationary-drag-source")
    ?.addEventListener("change", (e) => {
      const el = e.target as HTMLInputElement;
      saveHideStationaryDragSourcePref(el.checked);
    });

  document
    .getElementById("setting-auto-foundation-max-rank-spread")
    ?.addEventListener("change", (e) => {
      const el = e.target as HTMLInputElement;
      const v = parseInt(el.value, 10);
      const clamped = Number.isFinite(v)
        ? Math.min(12, Math.max(0, Math.round(v)))
        : 2;
      el.value = String(clamped);
      saveAutoFoundationMaxRankSpread(clamped);
    });

  showScreen("home");
  void applyWindowGameFullscreen(loadGameFullscreenPref());
});
