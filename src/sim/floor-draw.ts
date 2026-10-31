// Floor drawings shared by built-in maps and custom tracks.

import type { Zone } from "./world";

export function drawRamp(ctx: CanvasRenderingContext2D, r: { x: number, y: number, w: number, h: number, angleDeg: number, uphillDeg: number; }) {
  // A light gradient that gets darker uphill, with chevrons pointing up the slope.
  // All shades stay light so the quad sensor never mistakes the ramp for a line.
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
  const a = (r.uphillDeg * Math.PI) / 180;
  const reach = (Math.abs(Math.cos(a)) * r.w + Math.abs(Math.sin(a)) * r.h) / 2;
  const gradient = ctx.createLinearGradient(cx - Math.cos(a) * reach, cy - Math.sin(a) * reach, cx + Math.cos(a) * reach, cy + Math.sin(a) * reach);
  gradient.addColorStop(0, "#eef1f4");
  gradient.addColorStop(1, "#c3ccd5");
  ctx.fillStyle = gradient;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.strokeStyle = "#b0bcc8";
  ctx.lineWidth = 0.6;
  ctx.strokeRect(r.x, r.y, r.w, r.h);

  ctx.save();
  ctx.beginPath();
  ctx.rect(r.x, r.y, r.w, r.h);
  ctx.clip();
  ctx.translate(cx, cy);
  ctx.rotate(a);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
  ctx.lineWidth = 1.2;
  const span = Math.max(r.w, r.h);
  for (let d = -span; d <= span; d += 12) {
    ctx.beginPath();
    ctx.moveTo(d - 4, -6);
    ctx.lineTo(d + 2, 0);
    ctx.lineTo(d - 4, 6);
    ctx.stroke();
  }
  ctx.restore();

  ctx.fillStyle = "#6b7a8a";
  ctx.font = "bold 5px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`${Math.round(r.angleDeg)}°`, cx, cy);
}

export function drawFinish(ctx: CanvasRenderingContext2D, z: Zone) {
  // Light checkers (not black) so the zone doesn't read as a line.
  const size = 5;
  for (let y = z.y; y < z.y + z.h; y += size) {
    for (let x = z.x; x < z.x + z.w; x += size) {
      const odd = (Math.floor((x - z.x) / size) + Math.floor((y - z.y) / size)) % 2 === 1;
      ctx.fillStyle = odd ? "#a5d6a7" : "#e8f5e9";
      ctx.fillRect(x, y, Math.min(size, z.x + z.w - x), Math.min(size, z.y + z.h - y));
    }
  }
  ctx.fillStyle = "#2e7d32";
  ctx.font = "bold 5px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("FINISH", z.x + z.w / 2, z.y + z.h / 2);
}
