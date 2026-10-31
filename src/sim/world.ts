import type { RobotBody } from "./robot";
import { classifyColor, grayOf, lineBrightness, type ColorName, type RGB } from "./colors";
import {
  BODY,
  COLLISION_CENTER_FORWARD,
  COLLISION_RADIUS,
  DEVIATION_FULL_SCALE_CM,
  LINE_THRESHOLD,
  PROBE_ORDER,
  QUAD_PROBES,
  QUAD_SENSOR_FORWARD,
  ULTRASONIC_FORWARD,
  ULTRASONIC_HALF_ANGLE_DEG,
  ULTRASONIC_MAX_CM,
  ULTRASONIC_MIN_CM,
  type ProbeName,
} from "./constants";

/** Pixels per centimetre of the floor texture the sensors read from. */
export const PX_PER_CM = 4;
const WALL_THICKNESS = 4;

export type Wall = { x: number, y: number, w: number, h: number, movable?: boolean, userAdded?: boolean, color?: string; };

/** A slope: `angleDeg` steep, rising towards the world direction `uphillDeg` (0 = right, 90 = down). */
export type Ramp = { x: number, y: number, w: number, h: number, angleDeg: number, uphillDeg: number; };
export type Zone = { x: number, y: number, w: number, h: number; };

export type MapDef = {
  id: string;
  name: string;
  description: string;
  width: number;
  height: number;
  background: string;
  /** Draws the floor in centimetre coordinates. */
  draw: (ctx: CanvasRenderingContext2D) => void;
  walls?: Wall[];
  ramps?: Ramp[];
  /** Reaching one of these finishes a timed run. */
  finishZones?: Zone[];
  spawn: { x: number, y: number, headingDeg: number; };
};

export type ProbeReading = { name: ProbeName, rgb: RGB, gray: number, color: ColorName, isLine: boolean; };
export type QuadReading = {
  probes: Record<ProbeName, ProbeReading>;
  /** -100 (robot is left of the line) … 100 (robot is right of the line). */
  deviation: number;
  /** Bits L2 L1 R1 R2 (L2 is the most significant bit) of probes that see the line. */
  lineStatus: number;
};

export class World {
  public map!: MapDef;
  public readonly floor: HTMLCanvasElement;
  private floorData: Uint8ClampedArray = new Uint8ClampedArray();
  private floorW = 0;
  private floorH = 0;
  public walls: Wall[] = [];
  public ramps: Ramp[] = [];
  public finishZones: Zone[] = [];
  public readonly robots: RobotBody[] = [];
  private readonly inFinish = new WeakMap<RobotBody, boolean>();
  private finishListeners = new Set<(robot: RobotBody) => void>();
  private readonly lastDeviation = new WeakMap<RobotBody, number>();
  private timer: ReturnType<typeof setInterval> | undefined;
  private lastTick = 0;
  private tickListeners = new Set<(dt: number) => void>();
  public paused = false;
  /** Increments whenever the floor or walls change, so the renderer can cache. */
  public version = 0;

  constructor() {
    this.floor = document.createElement("canvas");
  }

  public get width() {
    return this.map.width;
  }

  public get height() {
    return this.map.height;
  }

  public loadMap(map: MapDef) {
    this.map = map;
    this.floorW = Math.round(map.width * PX_PER_CM);
    this.floorH = Math.round(map.height * PX_PER_CM);
    this.floor.width = this.floorW;
    this.floor.height = this.floorH;
    const ctx = this.floor.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = map.background;
    ctx.fillRect(0, 0, this.floorW, this.floorH);
    ctx.setTransform(PX_PER_CM, 0, 0, PX_PER_CM, 0, 0);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    map.draw(ctx);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.floorData = ctx.getImageData(0, 0, this.floorW, this.floorH).data;

    const t = WALL_THICKNESS;
    this.walls = [
      { x: -t, y: -t, w: map.width + 2 * t, h: t, color: "#8d6e63" },
      { x: -t, y: map.height, w: map.width + 2 * t, h: t, color: "#8d6e63" },
      { x: -t, y: 0, w: t, h: map.height, color: "#8d6e63" },
      { x: map.width, y: 0, w: t, h: map.height, color: "#8d6e63" },
      ...(map.walls ?? []).map((wall) => ({ ...wall })),
    ];
    this.ramps = (map.ramps ?? []).map((ramp) => ({ ...ramp }));
    this.finishZones = (map.finishZones ?? []).map((zone) => ({ ...zone }));
    this.version++;
    for (const [i, robot] of this.robots.entries()) this.placeAtSpawn(robot, i);
  }

  public placeAtSpawn(robot: RobotBody, index = this.robots.indexOf(robot)) {
    const { x, y, headingDeg } = this.map.spawn;
    // Line up extra robots next to the first one.
    const offset = Math.max(0, index) * 25;
    const h = (headingDeg * Math.PI) / 180;
    robot.spawn = { x: x + Math.sin(h) * offset, y: y - Math.cos(h) * offset, headingDeg };
    robot.resetToSpawn();
  }

  public addRobot(robot: RobotBody) {
    this.robots.push(robot);
    this.placeAtSpawn(robot, this.robots.length - 1);
  }

  public removeRobot(robot: RobotBody) {
    const index = this.robots.indexOf(robot);
    if (index >= 0) this.robots.splice(index, 1);
  }

  public addBox(x: number, y: number) {
    this.walls.push({ x: x - 10, y: y - 10, w: 20, h: 20, movable: true, userAdded: true, color: "#ff8f00" });
    this.version++;
  }

  public removeWall(wall: Wall) {
    this.walls = this.walls.filter((w) => w !== wall);
    this.version++;
  }

  // --- Simulation loop -------------------------------------------------------

  public onTick(listener: (dt: number) => void) {
    this.tickListeners.add(listener);
    return () => this.tickListeners.delete(listener);
  }

  public start() {
    if (this.timer) return;
    this.lastTick = performance.now();
    this.timer = setInterval(() => {
      const now = performance.now();
      // Clamp so a throttled background tab doesn't teleport the robot.
      let dt = Math.min((now - this.lastTick) / 1000, 0.1);
      this.lastTick = now;
      if (this.paused) return;
      // Fixed small substeps keep fast robots from tunnelling through lines.
      while (dt > 0) {
        const step = Math.min(dt, 0.005);
        this.step(step);
        dt -= step;
      }
      for (const listener of this.tickListeners) listener(now);
    }, 10);
  }

  public stop() {
    clearInterval(this.timer);
    this.timer = undefined;
  }

  private step(dt: number) {
    for (const robot of this.robots) {
      this.applySlope(robot);
      robot.step(dt);
      this.resolveCollisions(robot);
      this.checkFinish(robot);
    }
  }

  /** Called when a robot drives into a finish zone. */
  public onFinish(listener: (robot: RobotBody) => void) {
    this.finishListeners.add(listener);
    return () => this.finishListeners.delete(listener);
  }

  private checkFinish(robot: RobotBody) {
    if (this.finishZones.length === 0) return;
    // The run counts as soon as the robot's nose is in the zone.
    const nose = robot.toWorld(BODY.front, 0);
    const inside = this.finishZones.some((z) =>
      [nose, { x: robot.x, y: robot.y }].some((p) => p.x >= z.x && p.x <= z.x + z.w && p.y >= z.y && p.y <= z.y + z.h));
    if (inside && !this.inFinish.get(robot)) for (const listener of this.finishListeners) listener(robot);
    this.inFinish.set(robot, inside);
  }

  /** The ramp under a point, if any. */
  public rampAt(x: number, y: number): Ramp | undefined {
    for (let i = this.ramps.length - 1; i >= 0; i--) {
      const r = this.ramps[i];
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return r;
    }
    return undefined;
  }

  /** Sets the robot's tilt (for the gyro) and how much the slope slows or speeds it up. */
  private applySlope(robot: RobotBody) {
    const ramp = this.rampAt(robot.x, robot.y);
    if (!ramp) {
      robot.pitchDeg = 0;
      robot.rollDeg = 0;
      robot.slopeFactor = 1;
      return;
    }
    const theta = (ramp.angleDeg * Math.PI) / 180;
    const uphill = (ramp.uphillDeg * Math.PI) / 180;
    const ux = Math.cos(uphill), uy = Math.sin(uphill);
    const f = robot.forward;
    const along = ux * f.x + uy * f.y; // 1 = facing uphill
    const leftX = Math.sin(robot.heading), leftY = -Math.cos(robot.heading);
    const towardsLeft = ux * leftX + uy * leftY; // 1 = uphill is on the robot's left
    robot.pitchDeg = ramp.angleDeg * along; // nose up is positive
    robot.rollDeg = -ramp.angleDeg * towardsLeft; // left side down is positive
    // Power-driven motors slow down uphill and speed up downhill; the encoder
    // speed control mostly holds RPM commands, so those change much less.
    robot.slopeFactor = Math.max(0.15, Math.min(1.8, 1 - 2.2 * Math.sin(theta) * along));
  }

  private collisionCenter(robot: RobotBody) {
    return robot.toWorld(COLLISION_CENTER_FORWARD, 0);
  }

  private resolveCollisions(robot: RobotBody) {
    let bumped = false;
    for (let iteration = 0; iteration < 3; iteration++) {
      const c = this.collisionCenter(robot);
      let pushX = 0, pushY = 0;
      for (const wall of this.walls) {
        const nearestX = Math.max(wall.x, Math.min(c.x, wall.x + wall.w));
        const nearestY = Math.max(wall.y, Math.min(c.y, wall.y + wall.h));
        const dx = c.x - nearestX;
        const dy = c.y - nearestY;
        const dist = Math.hypot(dx, dy);
        if (dist < COLLISION_RADIUS) {
          if (dist > 1e-6) {
            pushX += (dx / dist) * (COLLISION_RADIUS - dist);
            pushY += (dy / dist) * (COLLISION_RADIUS - dist);
          } else {
            // Centre inside the wall: push out of the nearest face.
            const left = c.x - wall.x, right = wall.x + wall.w - c.x;
            const top = c.y - wall.y, bottom = wall.y + wall.h - c.y;
            const min = Math.min(left, right, top, bottom);
            if (min === left) pushX -= left + COLLISION_RADIUS;
            else if (min === right) pushX += right + COLLISION_RADIUS;
            else if (min === top) pushY -= top + COLLISION_RADIUS;
            else pushY += bottom + COLLISION_RADIUS;
          }
        }
      }
      for (const other of this.robots) {
        if (other === robot) continue;
        const o = this.collisionCenter(other);
        const dx = c.x - o.x, dy = c.y - o.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 2 * COLLISION_RADIUS && dist > 1e-6) {
          const overlap = (2 * COLLISION_RADIUS - dist) / 2;
          pushX += (dx / dist) * overlap;
          pushY += (dy / dist) * overlap;
        }
      }
      if (pushX === 0 && pushY === 0) break;
      bumped = true;
      robot.x += pushX;
      robot.y += pushY;
    }
    robot.bumping = bumped;
  }

  // --- Sensors -----------------------------------------------------------------

  /** Average floor colour around a point (a small sensor spot). */
  public sampleFloor(x: number, y: number, radiusCm = 0.4): RGB {
    const px = Math.round(x * PX_PER_CM);
    const py = Math.round(y * PX_PER_CM);
    const r = Math.max(1, Math.round(radiusCm * PX_PER_CM));
    let sr = 0, sg = 0, sb = 0, n = 0;
    for (let oy = -r; oy <= r; oy++) {
      for (let ox = -r; ox <= r; ox++) {
        if (ox * ox + oy * oy > r * r) continue;
        const sx = px + ox, sy = py + oy;
        if (sx < 0 || sy < 0 || sx >= this.floorW || sy >= this.floorH) {
          // Off the mat: the table.
          sr += 120; sg += 96; sb += 80;
        } else {
          const i = (sy * this.floorW + sx) * 4;
          sr += this.floorData[i]; sg += this.floorData[i + 1]; sb += this.floorData[i + 2];
        }
        n++;
      }
    }
    return [sr / n, sg / n, sb / n];
  }

  public readQuad(robot: RobotBody): QuadReading {
    const probes = {} as Record<ProbeName, ProbeReading>;
    let lineStatus = 0;
    for (const [i, name] of PROBE_ORDER.entries()) {
      const p = robot.toWorld(QUAD_SENSOR_FORWARD, QUAD_PROBES[name]);
      const rgb = this.sampleFloor(p.x, p.y);
      const gray = grayOf(rgb);
      const isLine = lineBrightness(rgb) < LINE_THRESHOLD;
      probes[name] = { name, rgb, gray, color: classifyColor(rgb), isLine };
      if (isLine) lineStatus |= 1 << (3 - i);
    }

    // The deviation is computed from a fine scan across the sensor bar, which
    // behaves like the real sensor's interpolation between its probes.
    let weight = 0, weighted = 0;
    const span = DEVIATION_FULL_SCALE_CM + 0.8;
    for (let left = -span; left <= span + 1e-9; left += 0.4) {
      const p = robot.toWorld(QUAD_SENSOR_FORWARD, left);
      const darkness = Math.max(0, LINE_THRESHOLD - lineBrightness(this.sampleFloor(p.x, p.y, 0.25)));
      weight += darkness;
      weighted += darkness * left;
    }
    let deviation: number;
    if (weight > 0) {
      const lineLeft = weighted / weight;
      // Line to the robot's left means the robot drifted right: positive.
      deviation = Math.max(-100, Math.min(100, (lineLeft / DEVIATION_FULL_SCALE_CM) * 100));
      this.lastDeviation.set(robot, deviation);
    } else {
      // Lost the line: keep reporting the side it was last seen on.
      const last = this.lastDeviation.get(robot) ?? 0;
      deviation = last === 0 ? 0 : Math.sign(last) * 100;
    }
    return { probes, deviation: Math.round(deviation), lineStatus };
  }

  /** Distance from the ultrasonic sensor to the nearest obstacle in its beam. */
  public readUltrasonic(robot: RobotBody): number {
    const origin = robot.toWorld(ULTRASONIC_FORWARD, 0);
    let best = Infinity;
    const rays = 9;
    for (let i = 0; i < rays; i++) {
      const offset = ((i / (rays - 1)) * 2 - 1) * ULTRASONIC_HALF_ANGLE_DEG * (Math.PI / 180);
      const angle = robot.heading + offset;
      const dx = Math.cos(angle), dy = Math.sin(angle);
      for (const wall of this.walls) {
        const d = rayRect(origin.x, origin.y, dx, dy, wall);
        if (d !== null && d < best) best = d;
      }
      for (const other of this.robots) {
        if (other === robot) continue;
        const c = this.collisionCenter(other);
        const d = rayCircle(origin.x, origin.y, dx, dy, c.x, c.y, COLLISION_RADIUS * 0.85);
        if (d !== null && d < best) best = d;
      }
    }
    if (best > ULTRASONIC_MAX_CM) return ULTRASONIC_MAX_CM;
    return Math.max(ULTRASONIC_MIN_CM, Math.round(best * 10) / 10);
  }
}

function rayRect(ox: number, oy: number, dx: number, dy: number, r: Wall): number | null {
  let tMin = 0, tMax = Infinity;
  for (const [o, d, min, max] of [[ox, dx, r.x, r.x + r.w], [oy, dy, r.y, r.y + r.h]]) {
    if (Math.abs(d) < 1e-9) {
      if (o < min || o > max) return null;
    } else {
      let t1 = (min - o) / d, t2 = (max - o) / d;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tMin = Math.max(tMin, t1);
      tMax = Math.min(tMax, t2);
      if (tMin > tMax) return null;
    }
  }
  return tMin;
}

function rayCircle(ox: number, oy: number, dx: number, dy: number, cx: number, cy: number, radius: number): number | null {
  const fx = ox - cx, fy = oy - cy;
  const b = fx * dx + fy * dy;
  const c = fx * fx + fy * fy - radius * radius;
  const disc = b * b - c;
  if (disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  return t >= 0 ? t : null;
}
