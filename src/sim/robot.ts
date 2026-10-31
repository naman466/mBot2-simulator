import {
  MAX_RPM,
  MOTOR_TIME_CONSTANT_S,
  TRACK_WIDTH_CM,
  WHEEL_CIRCUMFERENCE_CM,
} from "./constants";
import type { RGB } from "./colors";

export type MotorName = "EM1" | "EM2";

/**
 * An encoder motor. `target` and `rpm` are the motor's own direction:
 * on the mBot2 EM1 drives the left wheel and EM2 the right wheel, and EM2 is
 * mounted mirrored, so the robot drives forward when EM2 turns *backwards*.
 */
export class Motor {
  public target = 0;
  public rpm = 0;
  /** Accumulated rotation in degrees (encoder). */
  public angle = 0;
  /** Whether the last command was a power (%) command, for the "power" reporter. */
  public mode: "speed" | "power" = "speed";
  public locked = false;

  public set(rpm: number, mode: "speed" | "power" = "speed") {
    this.target = Math.max(-MAX_RPM, Math.min(MAX_RPM, rpm || 0));
    this.mode = mode;
  }

  public halt() {
    this.target = 0;
    this.rpm = 0;
  }

  public step(dt: number) {
    const k = 1 - Math.exp(-dt / MOTOR_TIME_CONSTANT_S);
    this.rpm += (this.target - this.rpm) * k;
    if (Math.abs(this.rpm) < 0.01 && this.target === 0) this.rpm = 0;
    this.angle += this.rpm * 6 * dt;
  }
}

type Goal = {
  kind: "distance" | "rotation" | "motor";
  target: number;
  progress: number;
  motors: Motor[];
  resolve: () => void;
};

export type Pose = { x: number, y: number, headingDeg: number; };

/**
 * The physical robot in the world. World coordinates are centimetres with
 * +x to the right and +y *down* (like the screen). `heading` is the angle of
 * the forward direction, so turning left (counter-clockwise on screen)
 * decreases it.
 */
export class RobotBody {
  public x = 0;
  public y = 0;
  public heading = 0;
  public readonly em1 = new Motor();
  public readonly em2 = new Motor();

  /** Gyro: accumulated rotation, counter-clockwise positive, in degrees. */
  public yawDeg = 0;
  public yawRateDeg = 0;
  /** Forward acceleration in m/s² (for the accelerometer). */
  public forwardAccel = 0;
  public lateralAccel = 0;
  private lastSpeed = 0;
  public speedCmS = 0;
  public bumping = false;
  /** Tilt from ramps: nose up and left side down are positive (degrees). */
  public pitchDeg = 0;
  public rollDeg = 0;
  /** How a slope changes the robot's speed (1 = flat floor). */
  public slopeFactor = 1;

  public trail: { x: number, y: number; }[] = [];
  public trailEnabled = true;

  // Visible outputs.
  public readonly leds: RGB[] = Array.from({ length: 5 }, () => [0, 0, 0] as RGB);
  public ledBrightness = 100;
  public readonly ultrasonicLeds: number[] = Array(8).fill(0);
  public fillLight: RGB | null = null;
  public emotion: string | null = null;
  public label: string;
  public color: string;

  private goals: Goal[] = [];
  public spawn: Pose = { x: 0, y: 0, headingDeg: 0 };

  constructor(label: string, color = "#1e88e5") {
    this.label = label;
    this.color = color;
  }

  public get forward() {
    return { x: Math.cos(this.heading), y: Math.sin(this.heading) };
  }

  /** Converts a point in the robot's frame (+forward, +left) to world coordinates. */
  public toWorld(forward: number, left: number) {
    const c = Math.cos(this.heading);
    const s = Math.sin(this.heading);
    return { x: this.x + forward * c + left * s, y: this.y + forward * s - left * c };
  }

  public setPose({ x, y, headingDeg }: Pose) {
    this.x = x;
    this.y = y;
    this.heading = (headingDeg * Math.PI) / 180;
    this.trail = [];
  }

  public resetToSpawn() {
    this.setPose(this.spawn);
    this.em1.halt();
    this.em2.halt();
    this.yawDeg = 0;
  }

  /** Sets wheel speeds in the robot's frame: positive is forward for both wheels. */
  public setWheels(leftRpm: number, rightRpm: number, mode: "speed" | "power" = "speed") {
    this.cancelGoals();
    this.em1.set(leftRpm, mode);
    this.em2.set(-rightRpm, mode);
  }

  /** Sets one motor in its own direction (like "encoder motor EM2 turns at 50 RPM"). */
  public setMotor(name: MotorName | "ALL", rpm: number, mode: "speed" | "power" = "speed") {
    this.cancelGoals();
    for (const motor of this.motors(name)) motor.set(rpm, mode);
  }

  public motors(name: MotorName | "ALL"): Motor[] {
    if (name === "EM1") return [this.em1];
    if (name === "EM2") return [this.em2];
    return [this.em1, this.em2];
  }

  public stopMotors(name: MotorName | "ALL" = "ALL") {
    this.cancelGoals();
    for (const motor of this.motors(name)) motor.halt();
  }

  /** Resolves all pending blocking moves (they were interrupted). */
  public cancelGoals() {
    const goals = this.goals;
    this.goals = [];
    for (const goal of goals) goal.resolve();
  }

  /**
   * Starts a blocking move that finishes after the robot covered a distance,
   * turned an angle or a motor turned an angle. Motors must be set first.
   */
  public runGoal(kind: Goal["kind"], target: number, motors: Motor[] = [this.em1, this.em2]): Promise<void> {
    if (target <= 0) {
      for (const motor of motors) motor.halt();
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.goals.push({ kind, target, progress: 0, motors, resolve });
    });
  }

  /** Wheel ground speeds in cm/s (positive is forward). */
  public get wheelSpeeds() {
    const left = (this.em1.rpm / 60) * WHEEL_CIRCUMFERENCE_CM;
    const right = (-this.em2.rpm / 60) * WHEEL_CIRCUMFERENCE_CM;
    return { left, right };
  }

  public step(dt: number) {
    this.em1.step(dt);
    this.em2.step(dt);

    const { left, right } = this.wheelSpeeds;
    const powered = this.em1.mode === "power" || this.em2.mode === "power";
    const slope = powered ? this.slopeFactor : 1 + (this.slopeFactor - 1) * 0.25;
    const v = ((left + right) / 2) * slope;
    const omegaCcw = (right - left) / TRACK_WIDTH_CM; // rad/s, counter-clockwise positive

    // Integrate with the midpoint heading for accurate arcs.
    const midHeading = this.heading - (omegaCcw * dt) / 2;
    this.x += v * Math.cos(midHeading) * dt;
    this.y += v * Math.sin(midHeading) * dt;
    this.heading -= omegaCcw * dt;

    const omegaDeg = (omegaCcw * 180) / Math.PI;
    this.yawRateDeg = omegaDeg;
    this.yawDeg += omegaDeg * dt;
    this.speedCmS = v;
    this.forwardAccel = dt > 0 ? ((v - this.lastSpeed) / dt) / 100 : 0;
    this.lateralAccel = (v * omegaCcw) / 100;
    this.lastSpeed = v;

    this.stepGoals(dt, Math.abs(v), Math.abs(omegaDeg));

    if (this.trailEnabled) {
      const last = this.trail[this.trail.length - 1];
      if (!last || Math.hypot(last.x - this.x, last.y - this.y) > 0.8) {
        this.trail.push({ x: this.x, y: this.y });
        if (this.trail.length > 6000) this.trail.splice(0, 1000);
      }
    }
  }

  private stepGoals(dt: number, speed: number, turnRateDeg: number) {
    if (this.goals.length === 0) return;
    const remaining: Goal[] = [];
    for (const goal of this.goals) {
      if (goal.kind === "distance") goal.progress += speed * dt;
      else if (goal.kind === "rotation") goal.progress += turnRateDeg * dt;
      else goal.progress += Math.max(...goal.motors.map((m) => Math.abs(m.rpm * 6 * dt)));
      if (goal.progress >= goal.target) {
        // Encoder motors brake precisely at the target.
        for (const motor of goal.motors) motor.halt();
        goal.resolve();
      } else {
        remaining.push(goal);
      }
    }
    this.goals = remaining;
  }
}
