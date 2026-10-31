import type { MapDef, Ramp, Wall, Zone } from "./world";
import { SWATCHES } from "./colors";
import { drawFinish, drawRamp } from "./floor-draw";

const LINE_WIDTH = 2.2;
const LINE_COLOR = "#111111";
const MAT = "#fbfbf8";

type Point = { x: number, y: number; };

function grid(ctx: CanvasRenderingContext2D, w: number, h: number, step = 10) {
  ctx.strokeStyle = "rgba(60, 90, 130, 0.12)";
  ctx.lineWidth = 0.25;
  ctx.beginPath();
  for (let x = step; x < w; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
  for (let y = step; y < h; y += step) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
  ctx.stroke();
}

function strokePath(ctx: CanvasRenderingContext2D, points: Point[], closed: boolean, width = LINE_WIDTH, color = LINE_COLOR) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  if (closed) ctx.closePath();
  ctx.stroke();
}

/** Samples a smooth closed Catmull-Rom curve through the control points. */
function smoothClosed(control: Point[], samplesPerSegment = 24): Point[] {
  const out: Point[] = [];
  const n = control.length;
  for (let i = 0; i < n; i++) {
    const p0 = control[(i - 1 + n) % n], p1 = control[i], p2 = control[(i + 1) % n], p3 = control[(i + 2) % n];
    for (let s = 0; s < samplesPerSegment; s++) {
      const t = s / samplesPerSegment, t2 = t * t, t3 = t2 * t;
      out.push({
        x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      });
    }
  }
  return out;
}

function headingAlong(points: Point[], index: number) {
  const a = points[index], b = points[(index + 2) % points.length];
  return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
}

function startMarker(ctx: CanvasRenderingContext2D, x: number, y: number, headingDeg: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((headingDeg * Math.PI) / 180);
  ctx.fillStyle = "rgba(30, 136, 229, 0.18)";
  ctx.fillRect(-9, -9, 20, 18);
  ctx.fillStyle = "rgba(30, 136, 229, 0.55)";
  ctx.font = "bold 3.5px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("START", 1, 8);
  ctx.restore();
}

function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size = 4, color = "rgba(0,0,0,0.35)") {
  ctx.fillStyle = color;
  ctx.font = `bold ${size}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x, y);
}

// --- Track geometry --------------------------------------------------------

const OVAL = (() => {
  const cx = 100, cy = 70, half = 45, r = 38;
  const pts: Point[] = [];
  for (let x = cx - half; x <= cx + half; x += 2) pts.push({ x, y: cy + r });
  for (let a = 90; a >= -90; a -= 4) pts.push({ x: cx + half + r * Math.cos((a * Math.PI) / 180), y: cy + r * Math.sin((a * Math.PI) / 180) });
  for (let x = cx + half; x >= cx - half; x -= 2) pts.push({ x, y: cy - r });
  for (let a = -90; a >= -270; a -= 4) pts.push({ x: cx - half + r * Math.cos((a * Math.PI) / 180), y: cy + r * Math.sin((a * Math.PI) / 180) });
  return pts;
})();

const CURVY = smoothClosed([
  { x: 45, y: 150 }, { x: 30, y: 95 }, { x: 55, y: 45 }, { x: 105, y: 40 }, { x: 135, y: 75 },
  { x: 170, y: 40 }, { x: 225, y: 45 }, { x: 235, y: 100 }, { x: 200, y: 125 }, { x: 215, y: 158 },
  { x: 160, y: 168 }, { x: 115, y: 135 }, { x: 85, y: 165 },
]);

const EIGHT = (() => {
  const pts: Point[] = [];
  for (let i = 0; i < 360; i++) {
    const t = (i * Math.PI) / 180;
    pts.push({ x: 120 + 92 * Math.sin(t), y: 75 + 48 * Math.sin(2 * t) });
  }
  return pts;
})();

const COLOR_LOOP = (() => {
  const cx = 130, cy = 85, half = 60, r = 55;
  const pts: Point[] = [];
  for (let x = cx - half; x <= cx + half; x += 1) pts.push({ x, y: cy + r });
  for (let a = 90; a >= -90; a -= 2) pts.push({ x: cx + half + r * Math.cos((a * Math.PI) / 180), y: cy + r * Math.sin((a * Math.PI) / 180) });
  for (let x = cx + half; x >= cx - half; x -= 1) pts.push({ x, y: cy - r });
  for (let a = -90; a >= -270; a -= 2) pts.push({ x: cx - half + r * Math.cos((a * Math.PI) / 180), y: cy + r * Math.sin((a * Math.PI) / 180) });
  return pts;
})();

/** Strokes a closed path in sections: `pattern` colours repeat every `sectionLength` cm. */
function strokeSections(ctx: CanvasRenderingContext2D, points: Point[], pattern: string[], sectionLength: number) {
  ctx.lineWidth = LINE_WIDTH;
  ctx.lineCap = "butt";
  let travelled = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    ctx.strokeStyle = pattern[Math.floor(travelled / sectionLength) % pattern.length];
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    travelled += length;
  }
  ctx.lineCap = "round";
}

const SQUARE: Point[] = [{ x: 30, y: 130 }, { x: 170, y: 130 }, { x: 170, y: 30 }, { x: 30, y: 30 }];

// --- Hill climb ----------------------------------------------------------------

const HILL_RAMPS: Ramp[] = [
  { x: 70, y: 150, w: 60, h: 50, angleDeg: 15, uphillDeg: -90 }, // up
  { x: 70, y: 70, w: 60, h: 50, angleDeg: 15, uphillDeg: 90 }, // and down again
];
const HILL_FINISH: Zone = { x: 70, y: 15, w: 60, h: 30 };

// --- Maze --------------------------------------------------------------------

const MAZE_CELL = 50;
const MAZE_WALL = 3;
/** Horizontal walls under each cell (row, col) and vertical walls right of each cell. */
const MAZE_WALLS: Wall[] = (() => {
  const walls: Wall[] = [];
  const h = (row: number, col: number, len = 1) => walls.push({ x: col * MAZE_CELL, y: (row + 1) * MAZE_CELL - MAZE_WALL / 2, w: len * MAZE_CELL, h: MAZE_WALL, color: "#5d4037" });
  const v = (row: number, col: number, len = 1) => walls.push({ x: (col + 1) * MAZE_CELL - MAZE_WALL / 2, y: row * MAZE_CELL, w: MAZE_WALL, h: len * MAZE_CELL, color: "#5d4037" });
  // Solution: (3,0) ↑ (2,0) → (2,1) ↑ (1,1) → (1,2) ↑ (0,2) → (0,3), plus two dead ends.
  h(0, 1); h(0, 3); h(1, 0); h(1, 2); h(2, 1, 2);
  v(1, 0); v(2, 1); v(3, 0);
  return walls;
})();

// --- Maps ----------------------------------------------------------------------

export const MAPS: MapDef[] = [
  {
    id: "oval",
    name: "Oval line",
    description: "A smooth loop. Great first line-following track.",
    width: 200, height: 140, background: MAT,
    draw(ctx) {
      grid(ctx, 200, 140);
      startMarker(ctx, 100, 108, 0);
      strokePath(ctx, OVAL, true);
    },
    spawn: { x: 100, y: 108, headingDeg: 0 },
  },
  {
    id: "curvy",
    name: "Curvy road",
    description: "Tight bends left and right. Tune your Kp!",
    width: 260, height: 190, background: MAT,
    draw(ctx) {
      grid(ctx, 260, 190);
      startMarker(ctx, CURVY[0].x, CURVY[0].y, headingAlong(CURVY, 0));
      strokePath(ctx, CURVY, true);
    },
    spawn: { x: CURVY[0].x, y: CURVY[0].y, headingDeg: headingAlong(CURVY, 0) },
  },
  {
    id: "color-line",
    name: "Color line",
    description: "A loop with red, yellow, green, cyan, blue and purple sections.",
    width: 260, height: 170, background: MAT,
    draw(ctx) {
      grid(ctx, 260, 170);
      const s = SWATCHES;
      startMarker(ctx, 100, 140, 0);
      strokeSections(ctx, COLOR_LOOP, [LINE_COLOR, s.red, LINE_COLOR, s.yellow, LINE_COLOR, s.green, LINE_COLOR, s.cyan, LINE_COLOR, s.blue, LINE_COLOR, s.purple], 25);
    },
    spawn: { x: 100, y: 140, headingDeg: 0 },
  },
  {
    id: "eight",
    name: "Figure eight",
    description: "A loop with a crossing in the middle.",
    width: 240, height: 150, background: MAT,
    draw(ctx) {
      grid(ctx, 240, 150);
      startMarker(ctx, EIGHT[90].x, EIGHT[90].y, headingAlong(EIGHT, 90));
      strokePath(ctx, EIGHT, true);
    },
    spawn: { x: EIGHT[90].x, y: EIGHT[90].y, headingDeg: headingAlong(EIGHT, 90) },
  },
  {
    id: "square",
    name: "Square corners",
    description: "Sharp 90° corners: use the line status to turn.",
    width: 200, height: 160, background: MAT,
    draw(ctx) {
      grid(ctx, 200, 160);
      startMarker(ctx, 100, 128, 0);
      ctx.lineJoin = "miter";
      strokePath(ctx, SQUARE, true);
      ctx.lineJoin = "round";
    },
    spawn: { x: 100, y: 128, headingDeg: 0 },
  },
  {
    id: "hill",
    name: "Hill climb",
    description: "Up a 15° ramp and down again to the finish. Watch the tilt sensor!",
    width: 200, height: 260, background: MAT,
    draw(ctx) {
      grid(ctx, 200, 260);
      for (const ramp of HILL_RAMPS) drawRamp(ctx, ramp);
      drawFinish(ctx, HILL_FINISH);
      startMarker(ctx, 100, 235, -90);
      strokePath(ctx, [{ x: 100, y: 250 }, { x: 100, y: 30 }], false);
    },
    ramps: HILL_RAMPS,
    finishZones: [HILL_FINISH],
    spawn: { x: 100, y: 235, headingDeg: -90 },
  },
  {
    id: "arena",
    name: "Obstacle arena",
    description: "Use the ultrasonic sensor to dodge boxes.",
    width: 200, height: 200, background: "#eef3f7",
    draw(ctx) {
      grid(ctx, 200, 200);
      startMarker(ctx, 30, 170, -90);
    },
    walls: [
      { x: 20, y: 60, w: 30, h: 20, movable: true, color: "#ff8f00" },
      { x: 90, y: 30, w: 20, h: 40, movable: true, color: "#43a047" },
      { x: 120, y: 110, w: 40, h: 20, movable: true, color: "#e53935" },
      { x: 70, y: 140, w: 20, h: 20, movable: true, color: "#1e88e5" },
      { x: 160, y: 40, w: 20, h: 20, movable: true, color: "#8e24aa" },
    ],
    spawn: { x: 30, y: 170, headingDeg: -90 },
  },
  {
    id: "maze",
    name: "Maze",
    description: "Find the green finish. Walls block the way!",
    width: 200, height: 200, background: "#eef3f7",
    draw(ctx) {
      grid(ctx, 200, 200);
      ctx.fillStyle = SWATCHES.green;
      ctx.fillRect(160, 10, 30, 30);
      label(ctx, "FINISH", 175, 46, 4, "rgba(0,0,0,0.4)");
      startMarker(ctx, 25, 180, -90);
    },
    walls: MAZE_WALLS,
    spawn: { x: 25, y: 180, headingDeg: -90 },
  },
  {
    id: "colors",
    name: "Color lab",
    description: "Drive over colors and read them with the color sensor.",
    width: 240, height: 150, background: MAT,
    draw(ctx) {
      grid(ctx, 240, 150);
      const colors = ["red", "yellow", "green", "cyan", "blue", "purple", "black"] as const;
      colors.forEach((name, i) => {
        const x = 45 + i * 27;
        ctx.fillStyle = SWATCHES[name];
        ctx.fillRect(x, 60, 22, 30);
        label(ctx, name, x + 11, 97, 3.4);
      });
      strokePath(ctx, [{ x: 20, y: 120 }, { x: 225, y: 120 }], false);
      label(ctx, "line", 232, 120, 3.4);
      startMarker(ctx, 20, 75, 0);
    },
    spawn: { x: 20, y: 75, headingDeg: 0 },
  },
  {
    id: "sumo",
    name: "Sumo ring",
    description: "Stay inside the black ring: the edge is white.",
    width: 200, height: 200, background: "#cfd8dc",
    draw(ctx) {
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(100, 100, 82, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#141414";
      ctx.beginPath();
      ctx.arc(100, 100, 76, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#6d4c41";
      ctx.fillRect(97, 80, 6, 2);
      ctx.fillRect(97, 118, 6, 2);
    },
    spawn: { x: 100, y: 130, headingDeg: -90 },
  },
  {
    id: "free",
    name: "Free play",
    description: "A big empty floor. Add boxes and try anything.",
    width: 300, height: 300, background: "#eef3f7",
    draw(ctx) {
      grid(ctx, 300, 300);
      startMarker(ctx, 150, 150, -90);
    },
    spawn: { x: 150, y: 150, headingDeg: -90 },
  },
];

/** Builds a map from a picture of a track (e.g. a photo of the real mat). */
export function imageMap(image: CanvasImageSource & { width: number, height: number; }, widthCm: number, name: string): MapDef {
  const heightCm = Math.round((image.height / image.width) * widthCm);
  return {
    id: "custom",
    name,
    description: "Your own track picture.",
    width: widthCm,
    height: heightCm,
    background: "#ffffff",
    draw(ctx) {
      ctx.drawImage(image, 0, 0, widthCm, heightCm);
    },
    spawn: { x: widthCm / 2, y: heightCm / 2, headingDeg: -90 },
  };
}
