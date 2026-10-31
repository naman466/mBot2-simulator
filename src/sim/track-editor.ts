// The track editor: turns pointer input (in centimetres) into changes to a TrackDoc.

import { isRect, newId, type Point, type RectItem, type TrackDoc, type TrackItem, drawRamp, drawFinish } from "./track";

export type Tool = "select" | "tape" | "draw" | "zone" | "wall" | "ramp" | "finish" | "text" | "start" | "erase";

export type EditorOptions = {
  tapeColor: string;
  tapeWidth: number;
  zoneColor: string;
  wallColor: string;
  rampAngle: number;
  /** Direction the ramp rises towards: -90 up, 0 right, 90 down, 180 left. */
  rampUphill: number;
  text: string;
  textSize: number;
  snap: boolean;
};

type Draft =
  | { kind: "rect", start: Point, end: Point; }
  | { kind: "tape", points: Point[]; }
  | { kind: "draw", points: Point[]; }
  | { kind: "start", at: Point, toward: Point; }
  | { kind: "move", item: TrackItem, from: Point, dx: number, dy: number; }
  | { kind: "resize", item: RectItem, w: number, h: number; };

const GRID = 5;
const DEFAULT_SIZES: Record<string, [number, number]> = { zone: [30, 30], wall: [20, 20], ramp: [40, 60], finish: [30, 30] };

export class TrackEditor {
  public doc: TrackDoc;
  public tool: Tool = "tape";
  public options: EditorOptions = {
    tapeColor: "#111111", tapeWidth: 2.2, zoneColor: "#e53935", wallColor: "#8d6e63",
    rampAngle: 15, rampUphill: -90, text: "A", textSize: 8, snap: true,
  };
  public selectedId: string | null = null;
  private draft: Draft | null = null;
  private cursor: Point | null = null;
  private history: string[] = [];
  private future: string[] = [];
  /** Called after every change to the track (the map needs rebuilding). */
  public onChange: (doc: TrackDoc) => void = () => { };
  /** Called when the selection or tool state changes (the toolbar needs refreshing). */
  public onUiChange: () => void = () => { };

  constructor(doc: TrackDoc) {
    this.doc = doc;
  }

  public get selected(): TrackItem | undefined {
    return this.doc.items.find((i) => i.id === this.selectedId);
  }

  public get canUndo() {
    return this.history.length > 0;
  }

  public get canRedo() {
    return this.future.length > 0;
  }

  public setTool(tool: Tool) {
    this.finishDraft();
    this.tool = tool;
    if (tool !== "select") this.selectedId = null;
    this.onUiChange();
  }

  // --- Changes ---------------------------------------------------------------------

  /** Applies a change with undo support. */
  public change(mutate: (doc: TrackDoc) => void) {
    this.history.push(JSON.stringify(this.doc));
    if (this.history.length > 60) this.history.shift();
    this.future = [];
    mutate(this.doc);
    this.onChange(this.doc);
    this.onUiChange();
  }

  public undo() {
    const previous = this.history.pop();
    if (!previous) return;
    this.future.push(JSON.stringify(this.doc));
    this.doc = JSON.parse(previous);
    this.selectedId = null;
    this.onChange(this.doc);
    this.onUiChange();
  }

  public redo() {
    const next = this.future.pop();
    if (!next) return;
    this.history.push(JSON.stringify(this.doc));
    this.doc = JSON.parse(next);
    this.selectedId = null;
    this.onChange(this.doc);
    this.onUiChange();
  }

  public updateSelected(patch: Partial<TrackItem>) {
    const id = this.selectedId;
    if (!id) return;
    this.change((doc) => {
      const item = doc.items.find((i) => i.id === id);
      if (item) Object.assign(item, patch);
    });
  }

  public deleteSelected() {
    const id = this.selectedId;
    if (!id) return;
    this.selectedId = null;
    this.change((doc) => { doc.items = doc.items.filter((i) => i.id !== id); });
  }

  /** Moves the selected item to the top (drawn last) or bottom. */
  public reorderSelected(toTop: boolean) {
    const id = this.selectedId;
    if (!id) return;
    this.change((doc) => {
      const item = doc.items.find((i) => i.id === id);
      if (!item) return;
      doc.items = doc.items.filter((i) => i !== item);
      if (toTop) doc.items.push(item);
      else doc.items.unshift(item);
    });
  }

  // --- Geometry ----------------------------------------------------------------------

  private snap(p: Point, e?: { altKey: boolean; }): Point {
    const clampX = (v: number) => Math.max(0, Math.min(this.doc.width, v));
    const clampY = (v: number) => Math.max(0, Math.min(this.doc.height, v));
    if (!this.options.snap || e?.altKey) return { x: clampX(p.x), y: clampY(p.y) };
    return { x: clampX(Math.round(p.x / GRID) * GRID), y: clampY(Math.round(p.y / GRID) * GRID) };
  }

  /** Keeps a segment horizontal, vertical or diagonal while Shift is held. */
  private constrain(from: Point, to: Point): Point {
    const dx = to.x - from.x, dy = to.y - from.y;
    const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
    const length = Math.hypot(dx, dy);
    return { x: from.x + Math.cos(angle) * length, y: from.y + Math.sin(angle) * length };
  }

  private hit(p: Point): TrackItem | undefined {
    for (let i = this.doc.items.length - 1; i >= 0; i--) {
      const item = this.doc.items[i];
      if (item.kind === "base") continue;
      if (isRect(item)) {
        if (p.x >= item.x && p.x <= item.x + item.w && p.y >= item.y && p.y <= item.y + item.h) return item;
      } else if (item.kind === "tape") {
        const reach = item.width / 2 + 1.5;
        const pts = item.closed ? [...item.points, item.points[0]] : item.points;
        if (pts.length === 1 && Math.hypot(p.x - pts[0].x, p.y - pts[0].y) < reach) return item;
        for (let j = 0; j < pts.length - 1; j++) if (distanceToSegment(p, pts[j], pts[j + 1]) < reach) return item;
      } else if (item.kind === "text") {
        const w = item.text.length * item.size * 0.35, h = item.size * 0.6;
        if (Math.abs(p.x - item.x) < w && Math.abs(p.y - item.y) < h) return item;
      }
    }
    return undefined;
  }

  private resizeHandle(item: TrackItem | undefined): Point | null {
    return item && isRect(item) ? { x: item.x + item.w, y: item.y + item.h } : null;
  }

  // --- Pointer input -----------------------------------------------------------------

  /** Returns false when the press wasn't used (so the view can pan instead). */
  public pointerDown(raw: Point, e: PointerEvent | MouseEvent, handleRadius: number): boolean {
    const p = this.snap(raw, e);
    switch (this.tool) {
      case "select": {
        const handle = this.resizeHandle(this.selected);
        if (handle && Math.hypot(raw.x - handle.x, raw.y - handle.y) < handleRadius) {
          const item = this.selected as RectItem;
          this.draft = { kind: "resize", item, w: item.w, h: item.h };
          return true;
        }
        const item = this.hit(raw);
        this.selectedId = item?.id ?? null;
        this.onUiChange();
        if (!item) return false;
        this.draft = { kind: "move", item, from: p, dx: 0, dy: 0 };
        return true;
      }
      case "erase": {
        const item = this.hit(raw);
        if (item) this.change((doc) => { doc.items = doc.items.filter((i) => i !== item); });
        return true;
      }
      case "tape": {
        if (this.draft?.kind === "tape") {
          const first = this.draft.points[0];
          // Clicking the first point closes the loop.
          if (this.draft.points.length > 2 && Math.hypot(raw.x - first.x, raw.y - first.y) < handleRadius) {
            this.finishDraft(true);
            return true;
          }
          const last = this.draft.points[this.draft.points.length - 1];
          const next = e.shiftKey ? this.snap(this.constrain(last, raw), e) : p;
          if (Math.hypot(next.x - last.x, next.y - last.y) > 0.5) this.draft.points.push(next);
        } else {
          this.draft = { kind: "tape", points: [p] };
        }
        return true;
      }
      case "draw":
        this.draft = { kind: "draw", points: [{ ...raw }] };
        return true;
      case "zone":
      case "wall":
      case "ramp":
      case "finish":
        this.draft = { kind: "rect", start: p, end: p };
        return true;
      case "text":
        this.change((doc) => doc.items.push({ id: newId(), kind: "text", x: p.x, y: p.y, text: this.options.text || "A", size: this.options.textSize, color: this.options.tapeColor }));
        return true;
      case "start":
        this.draft = { kind: "start", at: p, toward: p };
        return true;
    }
  }

  public pointerMove(raw: Point, e: PointerEvent | MouseEvent) {
    this.cursor = raw;
    const d = this.draft;
    if (!d) return;
    const p = this.snap(raw, e);
    if (d.kind === "rect") d.end = p;
    else if (d.kind === "draw") {
      const last = d.points[d.points.length - 1];
      if (Math.hypot(raw.x - last.x, raw.y - last.y) > 1) d.points.push({ ...raw });
    } else if (d.kind === "start") d.toward = raw;
    else if (d.kind === "move") {
      d.dx = p.x - d.from.x;
      d.dy = p.y - d.from.y;
    } else if (d.kind === "resize") {
      d.w = Math.max(5, p.x - d.item.x);
      d.h = Math.max(5, p.y - d.item.y);
    }
  }

  public pointerUp() {
    const d = this.draft;
    if (!d) return;
    if (d.kind === "tape") return; // polylines finish with a double click or Enter
    this.draft = null;
    if (d.kind === "draw") {
      if (d.points.length > 1) {
        const points = simplify(d.points, 0.6);
        this.change((doc) => doc.items.push({ id: newId(), kind: "tape", points, color: this.options.tapeColor, width: this.options.tapeWidth, closed: false }));
      }
    } else if (d.kind === "rect") {
      let x = Math.min(d.start.x, d.end.x), y = Math.min(d.start.y, d.end.y);
      let w = Math.abs(d.end.x - d.start.x), h = Math.abs(d.end.y - d.start.y);
      if (w < 3 || h < 3) {
        // A click instead of a drag places a default-sized shape.
        [w, h] = DEFAULT_SIZES[this.tool] ?? [30, 30];
        x = d.start.x - w / 2;
        y = d.start.y - h / 2;
      }
      const base = { id: newId(), x, y, w, h };
      const item: TrackItem =
        this.tool === "zone" ? { ...base, kind: "zone", color: this.options.zoneColor }
          : this.tool === "wall" ? { ...base, kind: "wall", color: this.options.wallColor, movable: false }
            : this.tool === "ramp" ? { ...base, kind: "ramp", angleDeg: this.options.rampAngle, uphillDeg: this.options.rampUphill }
              : { ...base, kind: "finish" };
      this.change((doc) => doc.items.push(item));
    } else if (d.kind === "start") {
      const dx = d.toward.x - d.at.x, dy = d.toward.y - d.at.y;
      const keep = Math.hypot(dx, dy) < 3;
      this.change((doc) => {
        doc.spawn = { x: d.at.x, y: d.at.y, headingDeg: keep ? doc.spawn.headingDeg : Math.round((Math.atan2(dy, dx) * 180) / Math.PI / 15) * 15 };
      });
    } else if (d.kind === "move") {
      if (d.dx === 0 && d.dy === 0) return;
      const id = d.item.id;
      this.change((doc) => {
        const item = doc.items.find((i) => i.id === id);
        if (!item) return;
        if (item.kind === "tape") item.points = item.points.map((pt) => ({ x: pt.x + d.dx, y: pt.y + d.dy }));
        else if ("x" in item) {
          item.x += d.dx;
          item.y += d.dy;
        }
      });
    } else if (d.kind === "resize") {
      const id = d.item.id;
      this.change((doc) => {
        const item = doc.items.find((i) => i.id === id);
        if (item && isRect(item)) {
          item.w = d.w;
          item.h = d.h;
        }
      });
    }
  }

  public doubleClick() {
    if (this.draft?.kind === "tape") this.finishDraft();
  }

  public keyDown(e: KeyboardEvent): boolean {
    if (e.key === "Enter") {
      this.finishDraft();
      return true;
    }
    if (e.key === "Escape") {
      if (this.draft) this.draft = null;
      else this.selectedId = null;
      this.onUiChange();
      return true;
    }
    if ((e.key === "Delete" || e.key === "Backspace") && this.selectedId) {
      this.deleteSelected();
      return true;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      if (e.shiftKey) this.redo();
      else this.undo();
      return true;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
      this.redo();
      return true;
    }
    return false;
  }

  /** Finishes a polyline in progress. */
  public finishDraft(close = false) {
    const d = this.draft;
    this.draft = null;
    if (d?.kind === "tape" && d.points.length >= 2) {
      const points = d.points;
      this.change((doc) => doc.items.push({ id: newId(), kind: "tape", points, color: this.options.tapeColor, width: this.options.tapeWidth, closed: close }));
    }
  }

  // --- Drawing -----------------------------------------------------------------------

  /** Draws previews and selection on top of the world (context is in centimetres). */
  public drawOverlay(ctx: CanvasRenderingContext2D, scale: number) {
    const px = (n: number) => n / scale;
    const d = this.draft;

    // Start position.
    const s = this.doc.spawn;
    const startAt = d?.kind === "start" ? d.at : s;
    const heading = d?.kind === "start" && Math.hypot(d.toward.x - d.at.x, d.toward.y - d.at.y) >= 3
      ? Math.atan2(d.toward.y - d.at.y, d.toward.x - d.at.x)
      : (s.headingDeg * Math.PI) / 180;
    ctx.save();
    ctx.translate(startAt.x, startAt.y);
    ctx.rotate(heading);
    ctx.fillStyle = "rgba(41, 121, 255, 0.25)";
    ctx.strokeStyle = "#2979ff";
    ctx.lineWidth = px(2);
    ctx.beginPath();
    ctx.arc(0, 0, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(14, 0);
    ctx.lineTo(4, -5);
    ctx.lineTo(4, 5);
    ctx.closePath();
    ctx.fillStyle = "#2979ff";
    ctx.fill();
    ctx.restore();

    // Draft shapes.
    if (d?.kind === "rect") {
      const x = Math.min(d.start.x, d.end.x), y = Math.min(d.start.y, d.end.y);
      const w = Math.abs(d.end.x - d.start.x), h = Math.abs(d.end.y - d.start.y);
      ctx.globalAlpha = 0.7;
      if (this.tool === "ramp") drawRamp(ctx, { x, y, w, h, angleDeg: this.options.rampAngle, uphillDeg: this.options.rampUphill });
      else if (this.tool === "finish") drawFinish(ctx, { x, y, w, h });
      else {
        ctx.fillStyle = this.tool === "wall" ? this.options.wallColor : this.options.zoneColor;
        ctx.fillRect(x, y, w, h);
      }
      ctx.globalAlpha = 1;
    } else if (d?.kind === "tape" || d?.kind === "draw") {
      const points = d.kind === "tape" && this.cursor ? [...d.points, this.cursor] : d.points;
      ctx.strokeStyle = this.options.tapeColor;
      ctx.globalAlpha = 0.75;
      ctx.lineWidth = this.options.tapeWidth;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.stroke();
      ctx.globalAlpha = 1;
      if (d.kind === "tape") {
        ctx.fillStyle = "#2979ff";
        for (const p of d.points) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, px(4), 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // Selection.
    const item = this.selected;
    if (item) {
      const dx = d?.kind === "move" ? d.dx : 0, dy = d?.kind === "move" ? d.dy : 0;
      ctx.save();
      ctx.translate(dx, dy);
      ctx.strokeStyle = "#2979ff";
      ctx.lineWidth = px(2);
      ctx.setLineDash([px(6), px(4)]);
      if (isRect(item)) {
        const w = d?.kind === "resize" ? d.w : item.w, h = d?.kind === "resize" ? d.h : item.h;
        ctx.strokeRect(item.x, item.y, w, h);
        ctx.setLineDash([]);
        ctx.fillStyle = "#2979ff";
        ctx.fillRect(item.x + w - px(5), item.y + h - px(5), px(10), px(10));
      } else if (item.kind === "tape") {
        ctx.lineWidth = item.width + px(4);
        ctx.globalAlpha = 0.35;
        ctx.setLineDash([]);
        ctx.beginPath();
        item.points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
        if (item.closed) ctx.closePath();
        ctx.stroke();
      } else if (item.kind === "text") {
        const w = item.text.length * item.size * 0.35, h = item.size * 0.6;
        ctx.strokeRect(item.x - w, item.y - h, w * 2, h * 2);
      }
      ctx.restore();
    }
  }
}

function distanceToSegment(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Removes points that barely change the path (Ramer–Douglas–Peucker). */
function simplify(points: Point[], tolerance: number): Point[] {
  if (points.length < 3) return points;
  let maxDistance = 0, index = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d = distanceToSegment(points[i], points[0], points[points.length - 1]);
    if (d > maxDistance) { maxDistance = d; index = i; }
  }
  if (maxDistance <= tolerance) return [points[0], points[points.length - 1]];
  return [...simplify(points.slice(0, index + 1), tolerance).slice(0, -1), ...simplify(points.slice(index), tolerance)];
}
