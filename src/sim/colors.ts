export type RGB = [number, number, number];

export const COLOR_NAMES = ["white", "red", "yellow", "green", "cyan", "blue", "purple", "black"] as const;
export type ColorName = typeof COLOR_NAMES[number];

/** Grayscale (reflected light) of a colour, 0–100. */
export function grayOf([r, g, b]: RGB): number {
  return ((0.299 * r + 0.587 * g + 0.114 * b) / 255) * 100;
}

/**
 * Brightness of a surface's weakest colour channel, 0–100. Only white-ish
 * surfaces are bright in every channel, so black and coloured lines are low.
 */
export function lineBrightness([r, g, b]: RGB): number {
  return (Math.min(r, g, b) / 255) * 100;
}

function rgbToHsv([r, g, b]: RGB): [number, number, number] {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, max === 0 ? 0 : d / max, max];
}

/** The colour name the quad RGB sensor would report for a surface colour. */
export function classifyColor(rgb: RGB): ColorName {
  const [h, s, v] = rgbToHsv(rgb);
  // Real colours of the mat are bright; anything this dark reads as black even
  // when the edge of a line picks up a tint.
  if (v < 0.45) return "black";
  if (s < 0.25) return v > 0.6 ? "white" : "black";
  if (h < 20 || h >= 330) return "red";
  if (h < 70) return "yellow";
  if (h < 160) return "green";
  if (h < 200) return "cyan";
  if (h < 260) return "blue";
  return "purple";
}

export const SWATCHES: Record<ColorName, string> = {
  white: "#ffffff",
  red: "#e53935",
  yellow: "#fdd835",
  green: "#43a047",
  cyan: "#00bcd4",
  blue: "#1e63d6",
  purple: "#8e24aa",
  black: "#151515",
};

/** CyberPi's LED colour menu as used by "show LEDs" (index → colour). */
export const LED_MENU_COLORS: RGB[] = [
  [0, 0, 0], // gray / off
  [255, 0, 0], // red
  [255, 128, 0], // orange
  [255, 255, 0], // yellow
  [0, 255, 0], // green
  [0, 255, 255], // cyan
  [0, 0, 255], // blue
  [255, 0, 255], // magenta
  [255, 255, 255], // white
];
