import type { World, Wall } from "./world";
import type { RobotBody } from "./robot";
import type { TrackEditor } from "./track-editor";
import {
  BODY,
  COLLISION_CENTER_FORWARD,
  COLLISION_RADIUS,
  PROBE_ORDER,
  QUAD_PROBES,
  QUAD_SENSOR_FORWARD,
  TRACK_WIDTH_CM,
  ULTRASONIC_FORWARD,
  ULTRASONIC_HALF_ANGLE_DEG,
  WHEEL_DIAMETER_CM,
} from "./constants";

const HANDLE_DISTANCE = 17;

type Drag =
  | { kind: "pan", lastX: number, lastY: number; }
  | { kind: "robot", robot: RobotBody, dx: number, dy: number; }
  | { kind: "rotate", robot: RobotBody; }
  | { kind: "wall", wall: Wall, dx: number, dy: number; }
  | { kind: "editor"; };

export class Renderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly world: World;
  private cx = 100;
  private cy = 70;
  private scale = 4;
  private dpr = 1;
  private frame = 0;
  private drag: Drag | null = null;
  /** Keep the whole map in view on resize until the user pans or zooms. */
  private autoFit = true;
  private resizeObserver: ResizeObserver;
  public selected: RobotBody | null = null;
  public showSensors = true;
  /** While set, pointer input edits the track instead of moving robots. */
  public editor: TrackEditor | null = null;
  public onSelect: (robot: RobotBody | null) => void = () => { };
  /** Called with a world position when the user asks for the context menu on a box. */
  public onWallContext: (wall: Wall) => void = () => { };

  constructor(canvas: HTMLCanvasElement, world: World) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
    this.world = world;
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();
    this.fit();

    canvas.addEventListener("pointerdown", this.pointerDown);
    canvas.addEventListener("pointermove", this.pointerMove);
    canvas.addEventListener("pointerup", this.pointerUp);
    canvas.addEventListener("pointercancel", this.pointerUp);
    canvas.addEventListener("wheel", this.wheel, { passive: false });
    canvas.addEventListener("contextmenu", this.contextMenu);
    canvas.addEventListener("dblclick", this.doubleClick);

    const loop = () => {
      this.draw();
      this.frame = requestAnimationFrame(loop);
    };
    this.frame = requestAnimationFrame(loop);
  }

  public destroy() {
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    this.canvas.removeEventListener("pointerdown", this.pointerDown);
    this.canvas.removeEventListener("pointermove", this.pointerMove);
    this.canvas.removeEventListener("pointerup", this.pointerUp);
    this.canvas.removeEventListener("pointercancel", this.pointerUp);
    this.canvas.removeEventListener("wheel", this.wheel);
    this.canvas.removeEventListener("contextmenu", this.contextMenu);
    this.canvas.removeEventListener("dblclick", this.doubleClick);
  }

  private resize() {
    this.dpr = window.devicePixelRatio || 1;
    const { clientWidth, clientHeight } = this.canvas;
    this.canvas.width = Math.max(1, Math.round(clientWidth * this.dpr));
    this.canvas.height = Math.max(1, Math.round(clientHeight * this.dpr));
    if (this.autoFit) this.fit();
  }

  /** Zooms so the whole map is visible. */
  public fit() {
    const { clientWidth, clientHeight } = this.canvas;
    if (!this.world.map || clientWidth === 0) return;
    const margin = 16;
    this.scale = Math.min((clientWidth - margin * 2) / (this.world.width + 8), (clientHeight - margin * 2) / (this.world.height + 8));
    this.cx = this.world.width / 2;
    this.cy = this.world.height / 2;
    this.autoFit = true;
  }

  public zoomBy(factor: number) {
    this.autoFit = false;
    this.scale = Math.min(40, Math.max(0.5, this.scale * factor));
  }

  // --- Coordinates -------------------------------------------------------------

  private toWorld(clientX: number, clientY: number) {
    const rect = this.canvas.getBoundingClientRect();
    const sx = clientX - rect.left, sy = clientY - rect.top;
    return {
      x: (sx - rect.width / 2) / this.scale + this.cx,
      y: (sy - rect.height / 2) / this.scale + this.cy,
    };
  }

  private handlePosition(robot: RobotBody) {
    return robot.toWorld(HANDLE_DISTANCE, 0);
  }

  // --- Input ---------------------------------------------------------------------

  private pointerDown = (e: PointerEvent) => {
    if (e.button === 2) return;
    const p = this.toWorld(e.clientX, e.clientY);
    const handleRadius = Math.max(3.5, 12 / this.scale);
    this.canvas.setPointerCapture(e.pointerId);

    if (this.editor) {
      if (this.editor.pointerDown(p, e, handleRadius)) this.drag = { kind: "editor" };
      else this.drag = { kind: "pan", lastX: e.clientX, lastY: e.clientY };
      return;
    }

    if (this.selected) {
      const h = this.handlePosition(this.selected);
      if (Math.hypot(p.x - h.x, p.y - h.y) < handleRadius) {
        this.drag = { kind: "rotate", robot: this.selected };
        return;
      }
    }
    for (const robot of [...this.world.robots].reverse()) {
      const c = robot.toWorld(COLLISION_CENTER_FORWARD, 0);
      if (Math.hypot(p.x - c.x, p.y - c.y) < COLLISION_RADIUS) {
        this.selected = robot;
        this.onSelect(robot);
        this.drag = { kind: "robot", robot, dx: robot.x - p.x, dy: robot.y - p.y };
        return;
      }
    }
    for (const wall of [...this.world.walls].reverse()) {
      if (wall.movable && p.x >= wall.x && p.x <= wall.x + wall.w && p.y >= wall.y && p.y <= wall.y + wall.h) {
        this.drag = { kind: "wall", wall, dx: wall.x - p.x, dy: wall.y - p.y };
        return;
      }
    }
    this.drag = { kind: "pan", lastX: e.clientX, lastY: e.clientY };
  };

  private pointerMove = (e: PointerEvent) => {
    const drag = this.drag;
    const p = this.toWorld(e.clientX, e.clientY);
    if (this.editor) {
      this.editor.pointerMove(p, e);
      if (drag?.kind === "editor") return;
      if (!drag) {
        this.canvas.style.cursor = this.editor.tool === "select" ? "default" : "crosshair";
        return;
      }
    }
    if (!drag) {
      this.canvas.style.cursor = this.hoverCursor(p);
      return;
    }
    if (drag.kind === "pan") {
      this.autoFit = false;
      this.cx -= (e.clientX - drag.lastX) / this.scale;
      this.cy -= (e.clientY - drag.lastY) / this.scale;
      drag.lastX = e.clientX;
      drag.lastY = e.clientY;
    } else if (drag.kind === "robot") {
      drag.robot.x = p.x + drag.dx;
      drag.robot.y = p.y + drag.dy;
      drag.robot.trail = [];
    } else if (drag.kind === "rotate") {
      const angle = Math.atan2(p.y - drag.robot.y, p.x - drag.robot.x);
      // Snap to 15° steps unless Shift is held.
      const step = (15 * Math.PI) / 180;
      drag.robot.heading = e.shiftKey ? angle : Math.round(angle / step) * step;
      drag.robot.trail = [];
    } else if (drag.kind === "wall") {
      drag.wall.x = p.x + drag.dx;
      drag.wall.y = p.y + drag.dy;
    }
  };

  private pointerUp = (e: PointerEvent) => {
    if (this.drag?.kind === "editor" && this.editor) this.editor.pointerUp();
    this.drag = null;
    try { this.canvas.releasePointerCapture(e.pointerId); } catch { /* not captured */ }
  };

  private hoverCursor(p: { x: number, y: number; }) {
    if (this.selected) {
      const h = this.handlePosition(this.selected);
      if (Math.hypot(p.x - h.x, p.y - h.y) < Math.max(3.5, 12 / this.scale)) return "grab";
    }
    for (const robot of this.world.robots) {
      const c = robot.toWorld(COLLISION_CENTER_FORWARD, 0);
      if (Math.hypot(p.x - c.x, p.y - c.y) < COLLISION_RADIUS) return "move";
    }
    for (const wall of this.world.walls) {
      if (wall.movable && p.x >= wall.x && p.x <= wall.x + wall.w && p.y >= wall.y && p.y <= wall.y + wall.h) return "move";
    }
    return "default";
  }

  private wheel = (e: WheelEvent) => {
    e.preventDefault();
    const before = this.toWorld(e.clientX, e.clientY);
    this.zoomBy(Math.exp(-e.deltaY * 0.0015));
    const after = this.toWorld(e.clientX, e.clientY);
    this.cx += before.x - after.x;
    this.cy += before.y - after.y;
  };

  private doubleClick = () => {
    this.editor?.doubleClick();
  };

  private contextMenu = (e: MouseEvent) => {
    e.preventDefault();
    const p = this.toWorld(e.clientX, e.clientY);
    for (const wall of [...this.world.walls].reverse()) {
      if (wall.movable && p.x >= wall.x && p.x <= wall.x + wall.w && p.y >= wall.y && p.y <= wall.y + wall.h) {
        this.onWallContext(wall);
        return;
      }
    }
  };

  /** World coordinate at the centre of the view (where to drop new boxes). */
  public get viewCenter() {
    return { x: this.cx, y: this.cy };
  }

  // --- Drawing -------------------------------------------------------------------

  private draw() {
    const ctx = this.ctx;
    const { width, height } = this.canvas;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#d9e2ea";
    ctx.fillRect(0, 0, width, height);
    if (!this.world.map) return;

    const s = this.scale * this.dpr;
    ctx.setTransform(s, 0, 0, s, width / 2 - this.cx * s, height / 2 - this.cy * s);

    // Mat with a soft shadow.
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.25)";
    ctx.shadowBlur = 12 * this.dpr;
    ctx.fillStyle = this.world.map.background;
    ctx.fillRect(0, 0, this.world.width, this.world.height);
    ctx.restore();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.world.floor, 0, 0, this.world.width, this.world.height);

    for (const robot of this.world.robots) this.drawTrail(robot);
    for (const wall of this.world.walls) this.drawWall(wall);
    for (const robot of this.world.robots) this.drawRobot(robot);
    this.editor?.drawOverlay(ctx, this.scale);
  }

  private drawTrail(robot: RobotBody) {
    if (!robot.trailEnabled || robot.trail.length < 2) return;
    const ctx = this.ctx;
    ctx.strokeStyle = "rgba(255, 64, 129, 0.55)";
    ctx.lineWidth = 0.6;
    ctx.lineJoin = "round";
    ctx.beginPath();
    robot.trail.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.lineTo(robot.x, robot.y);
    ctx.stroke();
  }

  private drawWall(wall: Wall) {
    const ctx = this.ctx;
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.3)";
    ctx.shadowBlur = 6 * this.dpr;
    ctx.shadowOffsetY = 2 * this.dpr;
    ctx.fillStyle = wall.color ?? "#8d6e63";
    ctx.fillRect(wall.x, wall.y, wall.w, wall.h);
    ctx.restore();
    ctx.strokeStyle = "rgba(0,0,0,0.25)";
    ctx.lineWidth = 0.4;
    ctx.strokeRect(wall.x, wall.y, wall.w, wall.h);
    if (wall.movable) {
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.fillRect(wall.x + 1, wall.y + 1, wall.w - 2, Math.min(3, wall.h / 4));
    }
  }

  private drawRobot(robot: RobotBody) {
    const ctx = this.ctx;
    const world = this.world;
    const selected = robot === this.selected;

    // Sensor visualisation in world space.
    if (this.showSensors) {
      const distance = world.readUltrasonic(robot);
      const origin = robot.toWorld(ULTRASONIC_FORWARD, 0);
      const half = (ULTRASONIC_HALF_ANGLE_DEG * Math.PI) / 180;
      const reach = Math.min(distance, 300);
      ctx.fillStyle = distance < 300 ? "rgba(0, 172, 193, 0.14)" : "rgba(0, 172, 193, 0.06)";
      ctx.beginPath();
      ctx.moveTo(origin.x, origin.y);
      ctx.arc(origin.x, origin.y, reach, robot.heading - half, robot.heading + half);
      ctx.closePath();
      ctx.fill();
      if (distance < 300) {
        ctx.strokeStyle = "rgba(0, 151, 167, 0.8)";
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.arc(origin.x, origin.y, reach, robot.heading - half, robot.heading + half);
        ctx.stroke();
      }
    }

    ctx.save();
    ctx.translate(robot.x, robot.y);
    ctx.rotate(robot.heading);
    // Local frame: +x forward, +y to the robot's right.

    // Fill light glow under the sensor.
    if (robot.fillLight) {
      const [r, g, b] = robot.fillLight;
      const glow = ctx.createRadialGradient(QUAD_SENSOR_FORWARD, 0, 0, QUAD_SENSOR_FORWARD, 0, 7);
      glow.addColorStop(0, `rgba(${r},${g},${b},0.55)`);
      glow.addColorStop(1, `rgba(${r},${g},${b},0)`);
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(QUAD_SENSOR_FORWARD, 0, 7, 0, Math.PI * 2);
      ctx.fill();
    }

    // Shadow.
    ctx.save();
    ctx.shadowColor = "rgba(15, 23, 42, 0.35)";
    ctx.shadowBlur = 3 * (this.scale * this.dpr);
    ctx.shadowOffsetX = 0.6 * (this.scale * this.dpr);
    ctx.shadowOffsetY = 0.9 * (this.scale * this.dpr);
    ctx.fillStyle = "rgba(0,0,0,0.12)";
    roundRect(ctx, BODY.back + 0.4, -BODY.halfWidth - 1.2, BODY.front - BODY.back - 0.6, BODY.halfWidth * 2 + 2.4, 3);
    ctx.fill();
    ctx.restore();

    // Wheels.
    const wheelLen = WHEEL_DIAMETER_CM;
    for (const side of [-1, 1]) {
      const y = side * (TRACK_WIDTH_CM / 2);
      const tyre = ctx.createLinearGradient(0, y - 1.35, 0, y + 1.35);
      tyre.addColorStop(0, "#1c2429");
      tyre.addColorStop(0.5, "#3d4a52");
      tyre.addColorStop(1, "#1c2429");
      ctx.fillStyle = tyre;
      roundRect(ctx, -wheelLen / 2, y - 1.35, wheelLen, 2.7, 0.8);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.15)";
      ctx.lineWidth = 0.25;
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(i * 1.2, y - 1.3);
        ctx.lineTo(i * 1.2, y + 1.3);
        ctx.stroke();
      }
    }

    // Chassis.
    ctx.fillStyle = robot.color;
    roundRect(ctx, BODY.back, -BODY.halfWidth + 1.4, BODY.front - BODY.back - 1, BODY.halfWidth * 2 - 2.8, 2.2);
    ctx.fill();
    // Soft sheen so the body reads as a 3D shell rather than a flat shape.
    const sheen = ctx.createLinearGradient(0, -BODY.halfWidth, 0, BODY.halfWidth);
    sheen.addColorStop(0, "rgba(255,255,255,0.28)");
    sheen.addColorStop(0.45, "rgba(255,255,255,0.04)");
    sheen.addColorStop(1, "rgba(0,0,0,0.18)");
    ctx.fillStyle = sheen;
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.lineWidth = 0.35;
    ctx.stroke();

    // Quad RGB sensor bar and probes.
    ctx.fillStyle = "#37474f";
    roundRect(ctx, QUAD_SENSOR_FORWARD - 1, -3.4, 2, 6.8, 0.6);
    ctx.fill();
    const quad = this.showSensors ? world.readQuad(robot) : null;
    for (const name of PROBE_ORDER) {
      const y = -QUAD_PROBES[name];
      const seen = quad?.probes[name];
      ctx.fillStyle = seen ? (seen.isLine ? "#ff1744" : "#69f0ae") : "#b0bec5";
      ctx.beginPath();
      ctx.arc(QUAD_SENSOR_FORWARD, y, 0.55, 0, Math.PI * 2);
      ctx.fill();
    }

    // Ultrasonic sensor with its two "eyes".
    ctx.fillStyle = "#eceff1";
    roundRect(ctx, ULTRASONIC_FORWARD - 2.2, -4.6, 2.2, 9.2, 0.8);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.3)";
    ctx.stroke();
    for (const [eye, leds] of [[-2.2, robot.ultrasonicLeds.slice(0, 4)], [2.2, robot.ultrasonicLeds.slice(4, 8)]] as const) {
      const level = Math.max(...leds) / 100;
      ctx.fillStyle = "#455a64";
      ctx.beginPath();
      ctx.arc(ULTRASONIC_FORWARD - 1.1, eye, 1.6, 0, Math.PI * 2);
      ctx.fill();
      if (level > 0) {
        ctx.fillStyle = `rgba(64, 196, 255, ${0.3 + 0.7 * level})`;
        ctx.beginPath();
        ctx.arc(ULTRASONIC_FORWARD - 1.1, eye, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // CyberPi on top.
    ctx.fillStyle = "#fafafa";
    roundRect(ctx, -4.8, -4.2, 8.6, 8.4, 1.2);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.3)";
    ctx.stroke();
    ctx.fillStyle = "#111";
    ctx.fillRect(-2.6, -2.4, 4.8, 4.8);
    // The 5 LEDs run along the side of CyberPi that faces backwards.
    for (let i = 0; i < 5; i++) {
      const [r, g, b] = robot.leds[i];
      const on = r + g + b > 0;
      const k = robot.ledBrightness / 100;
      const y = -3 + i * 1.5;
      if (on) {
        const glow = ctx.createRadialGradient(-4, y, 0, -4, y, 2.2);
        glow.addColorStop(0, `rgba(${r},${g},${b},${0.8 * k})`);
        glow.addColorStop(1, `rgba(${r},${g},${b},0)`);
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(-4, y, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = on ? `rgb(${r},${g},${b})` : "#cfd8dc";
      ctx.beginPath();
      ctx.arc(-4, y, 0.55, 0, Math.PI * 2);
      ctx.fill();
    }

    if (robot.bumping) {
      ctx.strokeStyle = "rgba(255, 82, 82, 0.9)";
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.arc(COLLISION_CENTER_FORWARD, 0, COLLISION_RADIUS, -0.9, 0.9);
      ctx.stroke();
    }

    if (selected) {
      ctx.strokeStyle = "rgba(41, 121, 255, 0.85)";
      ctx.setLineDash([1.2, 1]);
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.arc(COLLISION_CENTER_FORWARD, 0, COLLISION_RADIUS + 1.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(COLLISION_CENTER_FORWARD + COLLISION_RADIUS + 1.5, 0);
      ctx.lineTo(HANDLE_DISTANCE, 0);
      ctx.stroke();
      ctx.fillStyle = "#2979ff";
      ctx.beginPath();
      ctx.arc(HANDLE_DISTANCE, 0, Math.max(1.6, 6 / this.scale), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    if (world.robots.length > 1) {
      ctx.fillStyle = "rgba(0,0,0,0.65)";
      ctx.font = `bold ${Math.max(3, 11 / this.scale)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(robot.label, robot.x, robot.y - COLLISION_RADIUS - 3);
    }
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
