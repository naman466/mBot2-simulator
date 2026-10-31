// CyberPi's screen sprites, backdrop and doodle pen ("airbrush"). Coordinates are
// screen pixels, (0, 0) top left; directions are Scratch-style degrees (90 = right).

const SIZE = 128;

export type Align = "top_left" | "top_mid" | "top_right" | "mid_left" | "center" | "mid_right" | "bottom_left" | "bottom_mid" | "bottom_right";

const ALIGN_OFFSET: Record<Align, [number, number]> = {
  top_left: [0, 0], top_mid: [0.5, 0], top_right: [1, 0],
  mid_left: [0, 0.5], center: [0.5, 0.5], mid_right: [1, 0.5],
  bottom_left: [0, 1], bottom_mid: [0.5, 1], bottom_right: [1, 1],
};

/** CyberPi's built-in sprite icons, drawn with similar-looking emoji. */
const ICONS: Record<string, string> = {
  music: "🎵", image: "🖼️", video: "🎬", clock: "⏰", play: "▶️", pause: "⏸️", next: "⏭️", prev: "⏮️",
  sound: "🔊", temperature: "🌡️", light: "💡", motion: "🏃", home: "🏠", gear: "⚙️", list: "📋",
  right: "✅", wrong: "❌", shut_down: "⏻", refresh: "🔄", trash_can: "🗑️", download: "⬇️", cloudy: "☁️",
  rain: "🌧️", snow: "❄️", train: "🚆", rocket: "🚀", truck: "🚚", car: "🚗", droplet: "💧", distance: "📏",
  fire: "🔥", magnetic: "🧲", gas: "⛽", vision: "👁️", color: "🎨", overcast: "🌥️", sandstorm: "🌪️", foggy: "🌫️",
};

type Content =
  | { kind: "text", text: string; }
  | { kind: "icon", icon: string; }
  | { kind: "matrix", bits: boolean[][]; }
  | { kind: "image", canvas: HTMLCanvasElement; };

export type Sprite = {
  name: string;
  content: Content;
  x: number;
  y: number;
  /** Scratch direction in degrees: 90 means unrotated. */
  direction: number;
  size: number;
  color: string | null;
  visible: boolean;
  align: Align;
  flipX: boolean;
  flipY: boolean;
};

/** Parses an mBlock face-panel value (16×16 or smaller pixel art) into rows of bits. */
export function parsePixels(value: string, width = 16, height = 16): boolean[][] {
  const text = String(value).trim();
  let bits: boolean[] = [];
  if (/^[01\s,]+$/.test(text)) bits = [...text.replace(/[^01]/g, "")].map((c) => c === "1");
  else {
    const hex = text.replace(/[^0-9a-f]/gi, "");
    for (const ch of hex) {
      const n = parseInt(ch, 16);
      for (let i = 3; i >= 0; i--) bits.push(((n >> i) & 1) === 1);
    }
  }
  const rows: boolean[][] = [];
  for (let y = 0; y < height; y++) rows.push(Array.from({ length: width }, (_, x) => bits[y * width + x] ?? false));
  return rows;
}

export class SpriteLayer {
  public sprites = new Map<string, Sprite>();
  public order: string[] = [];
  public background = "#000000";
  public pen = { x: 64, y: 64, direction: 90, color: "#ffffff", size: 1, drawing: false, speed: 0 };
  private sketchCanvas: HTMLCanvasElement | null = null;

  public reset() {
    this.sprites.clear();
    this.order = [];
    this.background = "#000000";
    this.pen = { x: 64, y: 64, direction: 90, color: "#ffffff", size: 1, drawing: false, speed: 0 };
    this.clearSketch();
  }

  private get sketch(): HTMLCanvasElement {
    if (!this.sketchCanvas) {
      this.sketchCanvas = document.createElement("canvas");
      this.sketchCanvas.width = SIZE;
      this.sketchCanvas.height = SIZE;
    }
    return this.sketchCanvas;
  }

  public clearSketch() {
    this.sketchCanvas?.getContext("2d")?.clearRect(0, 0, SIZE, SIZE);
  }

  // --- Sprites -------------------------------------------------------------------------

  public define(name: string, content: Content) {
    const existing = this.sprites.get(name);
    if (existing) {
      existing.content = content;
      return;
    }
    this.sprites.set(name, {
      name, content, x: 64, y: 64, direction: 90, size: 100, color: null, visible: true, align: "center", flipX: false, flipY: false,
    });
    this.order.push(name);
  }

  public get(name: string): Sprite | undefined {
    return this.sprites.get(name);
  }

  public delete(name: string) {
    this.sprites.delete(name);
    this.order = this.order.filter((n) => n !== name);
  }

  public layer(name: string, action: string, steps = 1) {
    const i = this.order.indexOf(name);
    if (i < 0) return;
    this.order.splice(i, 1);
    let j = i;
    if (action.includes("max") || action === "front") j = this.order.length;
    else if (action.includes("min") || action === "back") j = 0;
    else if (action.includes("up")) j = Math.min(this.order.length, i + steps);
    else if (action.includes("down")) j = Math.max(0, i - steps);
    this.order.splice(j, 0, name);
  }

  /** The sprite's bounding box (rotation ignored, like a quick collision check). */
  public bounds(sprite: Sprite) {
    const [w, h] = this.contentSize(sprite.content);
    const s = sprite.size / 100;
    const [ax, ay] = ALIGN_OFFSET[sprite.align] ?? ALIGN_OFFSET.center;
    const left = sprite.x - ax * w * s;
    const top = sprite.y - ay * h * s;
    return { left, top, right: left + w * s, bottom: top + h * s };
  }

  public touchesEdge(name: string) {
    const sprite = this.sprites.get(name);
    if (!sprite) return false;
    const b = this.bounds(sprite);
    return b.left <= 0 || b.top <= 0 || b.right >= SIZE || b.bottom >= SIZE;
  }

  public touches(a: string, b: string) {
    const sa = this.sprites.get(a), sb = this.sprites.get(b);
    if (!sa || !sb || !sa.visible || !sb.visible) return false;
    const ba = this.bounds(sa), bb = this.bounds(sb);
    return ba.left < bb.right && ba.right > bb.left && ba.top < bb.bottom && ba.bottom > bb.top;
  }

  public sketchAsSprite(name: string) {
    const copy = document.createElement("canvas");
    copy.width = SIZE;
    copy.height = SIZE;
    copy.getContext("2d")!.drawImage(this.sketch, 0, 0);
    this.define(name, { kind: "image", canvas: copy });
  }

  // --- Doodle pen ----------------------------------------------------------------------

  public penTo(x: number, y: number) {
    const ctx = this.sketch.getContext("2d")!;
    if (this.pen.drawing) {
      ctx.strokeStyle = this.pen.color;
      ctx.lineWidth = Math.max(1, this.pen.size);
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(this.pen.x, this.pen.y);
      ctx.lineTo(x, y);
      ctx.stroke();
    }
    this.pen.x = x;
    this.pen.y = y;
  }

  public penForward(distance: number) {
    const rad = ((this.pen.direction - 90) * Math.PI) / 180;
    this.penTo(this.pen.x + Math.cos(rad) * distance, this.pen.y + Math.sin(rad) * distance);
  }

  /** Moves along an arc of `degrees` with the given radius, turning clockwise. */
  public penArc(radius: number, degrees: number) {
    const steps = Math.max(1, Math.ceil(Math.abs(degrees) / 5));
    const turn = degrees / steps;
    const length = (2 * Math.PI * Math.abs(radius) * Math.abs(turn)) / 360;
    for (let i = 0; i < steps; i++) {
      this.pen.direction += turn / 2;
      this.penForward(length);
      this.pen.direction += turn / 2;
    }
  }

  // --- Drawing -------------------------------------------------------------------------

  private contentSize(content: Content): [number, number] {
    switch (content.kind) {
      case "text": return [Math.max(8, content.text.length * 9), 16];
      case "icon": return [32, 32];
      case "matrix": return [content.bits[0]?.length ?? 16, content.bits.length];
      case "image": return [content.canvas.width, content.canvas.height];
    }
  }

  public draw(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = this.background;
    ctx.fillRect(0, 0, SIZE, SIZE);
    if (this.sketchCanvas) ctx.drawImage(this.sketchCanvas, 0, 0);
    for (const name of this.order) {
      const sprite = this.sprites.get(name);
      if (!sprite || !sprite.visible) continue;
      const [w, h] = this.contentSize(sprite.content);
      const [ax, ay] = ALIGN_OFFSET[sprite.align] ?? ALIGN_OFFSET.center;
      ctx.save();
      ctx.translate(sprite.x, sprite.y);
      ctx.rotate(((sprite.direction - 90) * Math.PI) / 180);
      const s = sprite.size / 100;
      ctx.scale(s * (sprite.flipX ? -1 : 1), s * (sprite.flipY ? -1 : 1));
      ctx.translate(-ax * w, -ay * h);
      const color = sprite.color ?? "#ffffff";
      const content = sprite.content;
      if (content.kind === "text") {
        ctx.fillStyle = color;
        ctx.font = `16px "Roboto-Regular", sans-serif`;
        ctx.textBaseline = "top";
        ctx.fillText(content.text, 0, 0);
      } else if (content.kind === "icon") {
        ctx.font = "28px sans-serif";
        ctx.textBaseline = "top";
        ctx.fillText(ICONS[content.icon.toLowerCase()] ?? "⭐", 2, 2);
      } else if (content.kind === "matrix") {
        ctx.fillStyle = color;
        content.bits.forEach((row, y) => row.forEach((on, x) => on && ctx.fillRect(x, y, 1, 1)));
      } else {
        ctx.drawImage(content.canvas, 0, 0);
      }
      ctx.restore();
    }
  }
}
