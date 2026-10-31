// Tracks made in the track editor. A track is a list of items drawn in order
// (tape, zones, ramps, …) plus walls and a start position. Tracks are plain
// JSON so teachers can save them in the browser or share them as files.

import type { MapDef, Ramp, Wall, Zone } from "./world";
import { MAPS } from "./maps";
import { drawFinish, drawRamp } from "./floor-draw";

export { drawFinish, drawRamp };

export type Point = { x: number, y: number; };

export type TrackItem =
  | { id: string, kind: "base", mapId: string; }
  | { id: string, kind: "image", src: string, x: number, y: number, w: number, h: number; }
  | { id: string, kind: "tape", points: Point[], color: string, width: number, closed: boolean; }
  | { id: string, kind: "zone", x: number, y: number, w: number, h: number, color: string; }
  | { id: string, kind: "wall", x: number, y: number, w: number, h: number, color: string, movable: boolean; }
  | { id: string, kind: "ramp", x: number, y: number, w: number, h: number, angleDeg: number, uphillDeg: number; }
  | { id: string, kind: "finish", x: number, y: number, w: number, h: number; }
  | { id: string, kind: "text", x: number, y: number, text: string, size: number, color: string; };

export type RectItem = Extract<TrackItem, { w: number; }>;

export type TrackDoc = {
  format: "mbot2-sim-track";
  version: 1;
  id: string;
  name: string;
  width: number;
  height: number;
  background: string;
  items: TrackItem[];
  spawn: { x: number, y: number, headingDeg: number; };
};

export const TRACK_FORMAT = "mbot2-sim-track";

export function newId() {
  return Math.random().toString(36).slice(2, 10);
}

export function isRect(item: TrackItem): item is RectItem {
  return item.kind === "zone" || item.kind === "wall" || item.kind === "ramp" || item.kind === "finish" || item.kind === "image";
}

export function emptyTrack(name = "My track", width = 200, height = 150): TrackDoc {
  return {
    format: TRACK_FORMAT, version: 1, id: newId(), name, width, height, background: "#fbfbf8",
    items: [], spawn: { x: width / 2, y: height - 25, headingDeg: -90 },
  };
}

/** A track that starts as a copy of a built-in map, so it can be extended. */
export function trackFromMap(map: MapDef): TrackDoc {
  return {
    format: TRACK_FORMAT, version: 1, id: newId(), name: `${map.name} (copy)`, width: map.width, height: map.height,
    background: map.background,
    items: [
      { id: newId(), kind: "base", mapId: map.id },
      ...(map.walls ?? []).map((w): TrackItem => ({ id: newId(), kind: "wall", x: w.x, y: w.y, w: w.w, h: w.h, color: w.color ?? "#8d6e63", movable: Boolean(w.movable) })),
      ...(map.ramps ?? []).map((r): TrackItem => ({ id: newId(), kind: "ramp", ...r })),
      ...(map.finishZones ?? []).map((z): TrackItem => ({ id: newId(), kind: "finish", ...z })),
    ],
    spawn: { ...map.spawn },
  };
}

/** A track from a photo or drawing of a mat. */
export function trackFromImage(src: string, imageWidth: number, imageHeight: number, widthCm: number, name: string): TrackDoc {
  const heightCm = Math.round((imageHeight / imageWidth) * widthCm);
  const doc = emptyTrack(name, widthCm, heightCm);
  doc.background = "#ffffff";
  doc.items.push({ id: newId(), kind: "image", src, x: 0, y: 0, w: widthCm, h: heightCm });
  doc.spawn = { x: widthCm / 2, y: heightCm / 2, headingDeg: -90 };
  return doc;
}

// --- Drawing ---------------------------------------------------------------------------

const imageCache = new Map<string, HTMLImageElement>();

/** Loads the pictures a track uses (drawing needs them ready). */
export async function preloadImages(doc: TrackDoc) {
  await Promise.all(doc.items.filter((i) => i.kind === "image").map((item) => new Promise<void>((resolve) => {
    const src = (item as Extract<TrackItem, { kind: "image"; }>).src;
    if (imageCache.get(src)?.complete) return resolve();
    const image = new Image();
    image.onload = () => resolve();
    image.onerror = () => resolve();
    image.src = src;
    imageCache.set(src, image);
  })));
}

function drawItem(ctx: CanvasRenderingContext2D, item: TrackItem) {
  switch (item.kind) {
    case "base": {
      MAPS.find((m) => m.id === item.mapId)?.draw(ctx);
      break;
    }
    case "image": {
      const image = imageCache.get(item.src);
      if (image?.complete) ctx.drawImage(image, item.x, item.y, item.w, item.h);
      break;
    }
    case "tape": {
      if (item.points.length === 0) break;
      ctx.strokeStyle = item.color;
      ctx.fillStyle = item.color;
      ctx.lineWidth = item.width;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      if (item.points.length === 1) {
        ctx.beginPath();
        ctx.arc(item.points[0].x, item.points[0].y, item.width / 2, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      ctx.beginPath();
      item.points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      if (item.closed) ctx.closePath();
      ctx.stroke();
      break;
    }
    case "zone":
      ctx.fillStyle = item.color;
      ctx.fillRect(item.x, item.y, item.w, item.h);
      break;
    case "ramp":
      drawRamp(ctx, item);
      break;
    case "finish":
      drawFinish(ctx, item);
      break;
    case "text":
      ctx.fillStyle = item.color;
      ctx.font = `bold ${item.size}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(item.text, item.x, item.y);
      break;
    case "wall":
      break; // walls are solid objects, drawn by the renderer
  }
}

/** Turns a track into a map the world can load. Call `preloadImages` first. */
export function trackToMap(doc: TrackDoc): MapDef {
  const walls: Wall[] = [];
  const ramps: Ramp[] = [];
  const finishZones: Zone[] = [];
  for (const item of doc.items) {
    if (item.kind === "wall") walls.push({ x: item.x, y: item.y, w: item.w, h: item.h, color: item.color, movable: item.movable });
    if (item.kind === "ramp") ramps.push({ x: item.x, y: item.y, w: item.w, h: item.h, angleDeg: item.angleDeg, uphillDeg: item.uphillDeg });
    if (item.kind === "finish") finishZones.push({ x: item.x, y: item.y, w: item.w, h: item.h });
  }
  return {
    id: `track:${doc.id}`,
    name: doc.name,
    description: "Your track.",
    width: doc.width,
    height: doc.height,
    background: doc.background,
    draw(ctx) {
      for (const item of doc.items) drawItem(ctx, item);
    },
    walls,
    ramps,
    finishZones,
    spawn: { ...doc.spawn },
  };
}

// --- Saving and sharing ----------------------------------------------------------------

const STORAGE_KEY = "mbot2-sim:tracks";

export function loadSavedTracks(): TrackDoc[] {
  try {
    const list = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(list) ? list.filter(isTrackDoc) : [];
  } catch {
    return [];
  }
}

/** Saves (or replaces) a track in the browser. Returns false if storage is full. */
export function saveTrack(doc: TrackDoc): boolean {
  const list = loadSavedTracks().filter((t) => t.id !== doc.id);
  list.push(doc);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

export function deleteSavedTrack(id: string) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(loadSavedTracks().filter((t) => t.id !== id)));
  } catch {
    /* ignore */
  }
}

export function isTrackDoc(value: unknown): value is TrackDoc {
  const v = value as TrackDoc;
  return Boolean(v && v.format === TRACK_FORMAT && Array.isArray(v.items) && v.width > 0 && v.height > 0 && v.spawn);
}

export function downloadTrack(doc: TrackDoc) {
  const blob = new Blob([JSON.stringify(doc, null, 1)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${doc.name.replace(/[^\w\- ]+/g, "").trim() || "track"}.track.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function readTrackFile(file: File): Promise<TrackDoc> {
  const doc = JSON.parse(await file.text());
  if (!isTrackDoc(doc)) throw new Error(`"${file.name}" isn't a track file.`);
  // A fresh id, so importing never overwrites a different saved track.
  return { ...doc, id: newId() };
}
