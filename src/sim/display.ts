// Model of CyberPi's 128×128 colour screen and a renderer for it.

import { SpriteLayer } from "./screen-sprites";

export const SCREEN_SIZE = 128;

type Line = { text: string, color: string, size: number; };
type Label = { text: string, x: number, y: number, size: number, color: string, anchor: Anchor; };
type Anchor = { h: "left" | "center" | "right", v: "top" | "middle" | "bottom"; };

const LOCATIONS: Record<string, { x: number, y: number, anchor: Anchor; }> = {
  top_left: { x: 0, y: 0, anchor: { h: "left", v: "top" } },
  top_mid: { x: 64, y: 0, anchor: { h: "center", v: "top" } },
  top_right: { x: 128, y: 0, anchor: { h: "right", v: "top" } },
  mid_left: { x: 0, y: 64, anchor: { h: "left", v: "middle" } },
  center: { x: 64, y: 64, anchor: { h: "center", v: "middle" } },
  mid_right: { x: 128, y: 64, anchor: { h: "right", v: "middle" } },
  bottom_left: { x: 0, y: 128, anchor: { h: "left", v: "bottom" } },
  bottom_mid: { x: 64, y: 128, anchor: { h: "center", v: "bottom" } },
  bottom_right: { x: 128, y: 128, anchor: { h: "right", v: "bottom" } },
};

export class Display {
  public mode: "console" | "labels" | "line" | "bar" | "table" | "sprites" = "console";
  public lines: Line[] = [];
  public current: Line | null = null;
  public fontSize = 16;
  public brush = "#ffffff";
  public labels = new Map<string, Label>();
  public lineData: number[] = [];
  public lineInterval = 1;
  public barData: number[] = [];
  public table: string[][] = [];
  public rotation = 0;
  public chartTitle = "";
  public readonly sprites = new SpriteLayer();
  /** With auto refresh off, the screen only changes when the program renders it. */
  public autoRender = true;
  private frozen: HTMLCanvasElement | null = null;
  public version = 0;
  private listeners = new Set<() => void>();

  public onChange(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private changed() {
    this.version++;
    for (const listener of this.listeners) listener();
  }

  public reset() {
    this.mode = "console";
    this.lines = [];
    this.current = null;
    this.fontSize = 16;
    this.brush = "#ffffff";
    this.labels.clear();
    this.lineData = [];
    this.barData = [];
    this.table = [];
    this.rotation = 0;
    this.chartTitle = "";
    this.sprites.reset();
    this.autoRender = true;
    this.frozen = null;
    this.changed();
  }

  private switchMode(mode: Display["mode"]) {
    if (this.mode === mode) return;
    // Like on the robot, switching between console, charts and labels starts fresh.
    this.mode = mode;
    this.lines = [];
    this.current = null;
    this.labels.clear();
    this.lineData = [];
    this.barData = [];
    this.table = [];
    this.chartTitle = "";
  }

  /** Enters sprite mode (sprites, backdrop and doodles) and notifies the screen. */
  public useSprites<T>(change: (layer: SpriteLayer) => T): T {
    this.switchMode("sprites");
    const result = change(this.sprites);
    this.changed();
    return result;
  }

  public setChartTitle(title: string) {
    this.chartTitle = title;
    this.changed();
  }

  public clearChart() {
    this.lineData = [];
    this.barData = [];
    this.changed();
  }

  public setAutoRender(on: boolean) {
    if (!on && this.autoRender) this.frozen = this.snapshot();
    this.autoRender = on;
    if (on) this.frozen = null;
    this.changed();
  }

  /** "Refresh the screen": shows everything drawn since the last refresh. */
  public render() {
    if (!this.autoRender) this.frozen = this.snapshot();
    this.changed();
  }

  /** The screen exactly as currently shown. */
  public get shown(): HTMLCanvasElement | null {
    return this.autoRender ? null : this.frozen;
  }

  private snapshot(): HTMLCanvasElement {
    const canvas = document.createElement("canvas");
    canvas.width = SCREEN_SIZE;
    canvas.height = SCREEN_SIZE;
    const wasAuto = this.autoRender;
    this.autoRender = true;
    drawDisplay(canvas.getContext("2d") as CanvasRenderingContext2D, this);
    this.autoRender = wasAuto;
    return canvas;
  }

  /** Colour of a screen pixel as shown, for "colour of x, y is …?" blocks. */
  public pixel(x: number, y: number): [number, number, number] {
    const canvas = this.shown ?? this.snapshot();
    const data = canvas.getContext("2d")!.getImageData(Math.max(0, Math.min(127, Math.round(x))), Math.max(0, Math.min(127, Math.round(y))), 1, 1).data;
    return [data[0], data[1], data[2]];
  }

  public print(text: string, newLine = false) {
    this.switchMode("console");
    if (!this.current) this.current = { text: "", color: this.brush, size: this.fontSize };
    this.current.text += text;
    if (newLine) {
      this.lines.push(this.current);
      this.current = null;
      if (this.lines.length > 60) this.lines.splice(0, this.lines.length - 60);
    }
    this.changed();
  }

  public clear() {
    this.lines = [];
    this.current = null;
    this.labels.clear();
    this.lineData = [];
    this.barData = [];
    this.table = [];
    this.changed();
  }

  public setFontSize(size: number) {
    if (size > 0) this.fontSize = size;
  }

  public setBrush(color: string) {
    this.brush = color;
  }

  public showLabel(index: string, text: string, location: string | { x: number, y: number; }, size: number) {
    this.switchMode("labels");
    const pos = typeof location === "string"
      ? LOCATIONS[location] ?? LOCATIONS.center
      : { x: location.x, y: location.y, anchor: { h: "left", v: "top" } as Anchor };
    this.labels.set(index, { text, x: pos.x, y: pos.y, size: size || 16, color: this.brush, anchor: pos.anchor });
    this.changed();
  }

  public addLineData(value: number) {
    this.switchMode("line");
    this.lineData.push(value);
    if (this.lineData.length > 200) this.lineData.shift();
    this.changed();
  }

  public setLineInterval(step: number) {
    this.lineInterval = Math.max(1, step);
    this.changed();
  }

  public addBarData(value: number) {
    this.switchMode("bar");
    this.barData.push(value);
    if (this.barData.length > 12) this.barData.shift();
    this.changed();
  }

  public setTableCell(row: number, col: number, text: string) {
    this.switchMode("table");
    while (this.table.length < row) this.table.push([]);
    const r = this.table[row - 1];
    while (r.length < col) r.push("");
    r[col - 1] = text;
    this.changed();
  }

  public setRotation(degrees: number) {
    this.rotation = degrees;
    this.changed();
  }
}

function font(size: number) {
  return `${size}px "Roboto-Regular", sans-serif`;
}

function wrap(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const ch of text) {
    if (ch === "\n") { out.push(line); line = ""; continue; }
    if (ctx.measureText(line + ch).width > width && line) {
      out.push(line);
      line = ch;
    } else line += ch;
  }
  out.push(line);
  return out;
}

const CHART_COLORS = ["#4fc3f7", "#81c784", "#ffb74d", "#e57373", "#ba68c8", "#fff176"];

/** Draws the display into a 128×128 context. */
export function drawDisplay(ctx: CanvasRenderingContext2D, d: Display) {
  const frozen = d.shown;
  if (frozen) {
    ctx.drawImage(frozen, 0, 0);
    return;
  }
  ctx.save();
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, SCREEN_SIZE, SCREEN_SIZE);
  if (d.rotation) {
    ctx.translate(64, 64);
    ctx.rotate((d.rotation * Math.PI) / 180);
    ctx.translate(-64, -64);
  }
  ctx.textBaseline = "top";

  if (d.mode === "sprites") {
    d.sprites.draw(ctx);
  } else if (d.mode === "console") {
    const all = d.current ? [...d.lines, d.current] : d.lines;
    // Lay out from the newest line upwards so the console scrolls.
    const rows: { text: string, color: string, size: number; }[] = [];
    for (const line of all) {
      ctx.font = font(line.size);
      for (const part of wrap(ctx, line.text, SCREEN_SIZE - 4)) rows.push({ text: part, color: line.color, size: line.size });
    }
    let height = 0;
    let first = rows.length;
    while (first > 0 && height + rows[first - 1].size + 2 <= SCREEN_SIZE) {
      height += rows[first - 1].size + 2;
      first--;
    }
    let y = 1;
    for (const row of rows.slice(first)) {
      ctx.font = font(row.size);
      ctx.fillStyle = row.color;
      ctx.fillText(row.text, 2, y);
      y += row.size + 2;
    }
  } else if (d.mode === "labels") {
    for (const label of d.labels.values()) {
      ctx.font = font(label.size);
      ctx.fillStyle = label.color;
      ctx.textAlign = label.anchor.h;
      ctx.textBaseline = label.anchor.v;
      ctx.fillText(label.text, label.x, label.y);
    }
  } else if (d.mode === "line") {
    const data = d.lineData;
    const min = Math.min(0, ...data), max = Math.max(1, ...data);
    ctx.strokeStyle = "#333";
    ctx.strokeRect(8, 8, 116, 112);
    ctx.strokeStyle = CHART_COLORS[0];
    ctx.lineWidth = 2;
    ctx.beginPath();
    const visible = data.slice(-Math.floor(116 / d.lineInterval));
    visible.forEach((v, i) => {
      const x = 8 + i * d.lineInterval;
      const y = 120 - ((v - min) / (max - min)) * 110;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.fillStyle = "#aaa";
    ctx.font = font(10);
    ctx.fillText(d.chartTitle || String(Math.round(max)), 10, 10);
  } else if (d.mode === "bar") {
    const data = d.barData;
    const max = Math.max(1, ...data.map(Math.abs));
    const w = 116 / Math.max(1, data.length);
    data.forEach((v, i) => {
      const h = (Math.abs(v) / max) * 110;
      ctx.fillStyle = CHART_COLORS[i % CHART_COLORS.length];
      ctx.fillRect(8 + i * w + 1, 120 - h, w - 2, h);
    });
    if (d.chartTitle) {
      ctx.fillStyle = "#aaa";
      ctx.font = font(10);
      ctx.fillText(d.chartTitle, 10, 10);
    }
  } else if (d.mode === "table") {
    const rows = Math.max(1, d.table.length);
    const cols = Math.max(1, ...d.table.map((r) => r.length));
    const cw = 128 / cols, rh = Math.min(24, 128 / rows);
    ctx.strokeStyle = "#555";
    ctx.font = font(Math.min(12, rh - 4));
    ctx.fillStyle = "#fff";
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        ctx.strokeRect(c * cw, r * rh, cw, rh);
        ctx.fillText(d.table[r]?.[c] ?? "", c * cw + 2, r * rh + 2, cw - 4);
      }
    }
  }
  ctx.restore();
}
