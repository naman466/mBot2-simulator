// Scratch-style value casting. mBlock stores most literals as strings
// (e.g. a "set variable to 30" block stores "30"), so every operation has to
// cast its inputs the same way Scratch does or `"30" + 1` becomes "301".

export function toNumber(value: any): number {
  if (typeof value === "number") return Number.isNaN(value) ? 0 : value;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value === null || value === undefined) return 0;
  const str = String(value).trim();
  if (str === "") return 0;
  const n = Number(str);
  return Number.isNaN(n) ? 0 : n;
}

export function toBoolean(value: any): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0 && !Number.isNaN(value);
  if (value === null || value === undefined) return false;
  const str = String(value).trim().toLowerCase();
  return !(str === "" || str === "0" || str === "false");
}

export function toText(value: any): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (Number.isInteger(value)) return String(value);
    // Avoid noise like 0.30000000000000004 on the robot's screen.
    return String(Math.round(value * 1e6) / 1e6);
  }
  if (Array.isArray(value)) return listToText(value);
  return String(value);
}

/** Scratch joins single-character lists without spaces, everything else with spaces. */
export function listToText(list: any[]): string {
  const allSingleChars = list.every((item) => String(item).length === 1);
  return list.map((item) => toText(item)).join(allSingleChars ? "" : " ");
}

function isWhitespace(value: any): boolean {
  return typeof value === "string" && value.trim().length === 0;
}

/** Compares like Scratch's `Cast.compare`: numerically when both look numeric, otherwise case-insensitively. */
export function compare(a: any, b: any): number {
  let n1 = Number(a);
  let n2 = Number(b);
  if (n1 === 0 && isWhitespace(a)) n1 = NaN;
  else if (n2 === 0 && isWhitespace(b)) n2 = NaN;
  if (Number.isNaN(n1) || Number.isNaN(n2)) {
    const s1 = toText(a).toLowerCase();
    const s2 = toText(b).toLowerCase();
    return s1 < s2 ? -1 : s1 > s2 ? 1 : 0;
  }
  return n1 - n2;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Parses "#rrggbb" (or "rrggbb") into an RGB triple. */
export function hexToRgb(hex: string): [number, number, number] {
  const match = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!match) return [255, 255, 255];
  const n = parseInt(match[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToCss([r, g, b]: [number, number, number]): string {
  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
}
