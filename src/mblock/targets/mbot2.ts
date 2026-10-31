import { CyberPI, CyberPIOps, arg, num, str } from "./cyberpi";
import { StdOps } from "./std";
import { noop, type Ops } from "../block";
import { clamp, compare, hexToRgb, toNumber, toText } from "../values";
import type { World, QuadReading } from "../../sim/world";
import type { MotorName } from "../../sim/robot";
import {
  DEFAULT_MOVE_RPM,
  MAX_RPM,
  PROBE_ORDER,
  TURN_CW_MEANS_LEFT,
  type ProbeName,
} from "../../sim/constants";
import { classifyColor, type ColorName, type RGB } from "../../sim/colors";
import { parsePixels } from "../../sim/screen-sprites";

const POWER_TO_RPM = MAX_RPM / 100;

function motorName(value: any): MotorName | "ALL" {
  const text = toText(value).toUpperCase();
  if (text.includes("1")) return "EM1";
  if (text.includes("2")) return "EM2";
  return "ALL";
}

/** "speed" (RPM) or "power" (%), converted to RPM. */
function toRpm(value: number, unit: string) {
  return unit.toLowerCase().includes("power") ? value * POWER_TO_RPM : value;
}

function unitMode(unit: string): "speed" | "power" {
  return unit.toLowerCase().includes("power") ? "power" : "speed";
}

/** A probe name from a sensor menu ("L1", "R2", "(2)R1", "any"...). */
function probeName(value: any): ProbeName | "any" {
  const text = toText(value).toUpperCase();
  const named = (PROBE_ORDER as string[]).find((p) => text.includes(p));
  if (named) return named as ProbeName;
  // Numbered channels count from the right: 1 = R2 … 4 = L2.
  const n = Math.round(toNumber(value));
  if (n >= 1 && n <= 4) return ["R2", "R1", "L1", "L2"][n - 1] as ProbeName;
  return "any";
}

const MENU_FILL_COLORS: Record<string, RGB> = { red: [255, 0, 0], green: [0, 255, 0], blue: [0, 0, 255] };

const ops: Ops<MBot2> = {
  ...StdOps,
  ...CyberPIOps,

  // --- Chassis ------------------------------------------------------------------
  "mbot2.mbot2_move_direction_with_rpm": async (self, c, b) => {
    self.drive(toText(c.decodeField(b.fields["DIRECTION"])), await num(c, b.inputs["POWER"]));
  },
  "mbot2.mbot2_move_direction_with_time": async (self, c, b) => {
    self.drive(toText(c.decodeField(b.fields["DIRECTION"])), await num(c, b.inputs["POWER"]));
    await c.sleep(await num(c, b.inputs["TIME"]) * 1000);
    if (c.isActive) self.body.stopMotors();
  },
  "mbot2.mbot2_move_straight_with_cm_and_inch": async (self, c, b) => {
    let distance = await num(c, b.inputs["POWER"]);
    if (toText(c.decodeField(b.fields["fieldMenu_3"])).includes("inch")) distance *= 2.54;
    const backward = toText(c.decodeField(b.fields["DIRECTION"])) === "backward";
    const sign = (backward ? -1 : 1) * Math.sign(distance || 1);
    self.body.setWheels(sign * DEFAULT_MOVE_RPM, sign * DEFAULT_MOVE_RPM);
    await self.body.runGoal("distance", Math.abs(distance));
  },
  "mbot2.mbot2_cw_and_ccw_with_angle": async (self, c, b) => {
    const angle = await num(c, b.inputs["ANGLE"]);
    const menu = toText(c.decodeField(b.fields["fieldMenu_1"]));
    let left = menu === "cw" ? TURN_CW_MEANS_LEFT : !TURN_CW_MEANS_LEFT;
    if (angle < 0) left = !left;
    const rpm = DEFAULT_MOVE_RPM * (left ? 1 : -1);
    self.body.setWheels(-rpm, rpm);
    await self.body.runGoal("rotation", Math.abs(angle));
  },
  "mbot2.mbot2_encoder_motor_drive_speed2": async (self, c, b) => {
    // Values are per motor: EM2 turns backwards to drive forward, which is
    // why mBlock's default is "left 50, right -50" to go straight.
    self.body.em1.set(await num(c, b.inputs["LEFT_POWER"]), "speed");
    self.body.em2.set(await num(c, b.inputs["RIGHT_POWER"]), "speed");
    self.body.cancelGoals();
  },
  "mbot2.mbot2_encoder_motor_drive_power": async (self, c, b) => {
    self.body.cancelGoals();
    self.body.em1.set(await num(c, b.inputs["LEFT_POWER"]) * POWER_TO_RPM, "power");
    self.body.em2.set(await num(c, b.inputs["number_2"]) * POWER_TO_RPM, "power");
  },
  "mbot2.mbot2_encoder_motor_set": async (self, c, b) => {
    const unit = toText(c.decodeField(b.fields["fieldMenu_4"]));
    const motor = motorName(await c.decodeInput(b.inputs["inputMenu_1"]));
    self.body.setMotor(motor, toRpm(await num(c, b.inputs["LEFT_POWER"]), unit), unitMode(unit));
  },
  "mbot2.mbot2_encoder_motor_set_with_time": async (self, c, b) => {
    const unit = toText(c.decodeField(b.fields["fieldMenu_4"]));
    const motor = motorName(await c.decodeInput(b.inputs["fieldMenu_1"]));
    self.body.setMotor(motor, toRpm(await num(c, b.inputs["LEFT_POWER"]), unit), unitMode(unit));
    await c.sleep(await num(c, b.inputs["number_3"]) * 1000);
    if (c.isActive) self.body.stopMotors(motor);
  },
  "mbot2.mbot2_encoder_motor_set_with_time_angle_and_circle": async (self, c, b) => {
    const motor = motorName(await c.decodeInput(b.inputs["fieldMenu_1"]));
    let amount = await num(c, b.inputs["LEFT_POWER"]);
    const units = Object.values(b.fields).map((f) => toText(f[0]).toLowerCase());
    if (units.some((u) => u.includes("circle") || u.includes("turn") || u.includes("lap"))) amount *= 360;
    const speedInput = Object.keys(b.inputs).find((k) => !["fieldMenu_1", "LEFT_POWER"].includes(k));
    const speed = speedInput ? Math.abs(await num(c, b.inputs[speedInput])) || DEFAULT_MOVE_RPM : DEFAULT_MOVE_RPM;
    self.body.setMotor(motor, Math.sign(amount || 1) * speed);
    await self.body.runGoal("motor", Math.abs(amount), self.body.motors(motor));
  },
  "mbot2.mbot2_encoder_motor_stop": async (self, c, b) => {
    const field = b.fields["fieldMenu_1"] ? c.decodeField(b.fields["fieldMenu_1"]) : await c.decodeInput(b.inputs["fieldMenu_1"]);
    self.body.stopMotors(motorName(field));
  },
  "mbot2.mbot2_encoder_motor_reset_angle": async (self, c, b) => {
    for (const motor of self.body.motors(motorName(await c.decodeInput(b.inputs["inputMenu_1"])))) motor.angle = 0;
  },
  "mbot2.mbot2_encoder_motor_lock_and_unlock": async (self, c, b) => {
    const locked = toText(c.decodeField(b.fields["fieldMenu_2"])) === "1";
    for (const motor of self.body.motors(motorName(await c.decodeInput(b.inputs["inputMenu_1"])))) motor.locked = locked;
  },
  "mbot2.mbot2_encoder_motor_get_speed": async (self, c, b) => {
    const [motor] = self.body.motors(motorName(await c.decodeInput(b.inputs["inputMenu_2"])));
    const unit = toText(c.decodeField(b.fields["fieldMenu_3"]));
    const value = unit.includes("power") ? motor.rpm / POWER_TO_RPM : motor.rpm;
    return Math.round(value * 10) / 10;
  },
  "mbot2.mbot2_encoder_motor_get_angle": async (self, c, b) => {
    const [motor] = self.body.motors(motorName(await c.decodeInput(b.inputs["inputMenu_1"])));
    return Math.round(motor.angle);
  },
  "mbot2.mbot2_set_para": noop,
  // Old "set wheel diameter and track width (mm)" chassis block: the simulated chassis is fixed.
  "mbot2.BLOCK_1599105327388": noop,
  // Per-motor RPM for both encoder motors (older/alternative versions of the block).
  "mbot2.mbot2_encoder_motor_drive": async (self, c, b) => {
    self.body.cancelGoals();
    self.body.em1.set(await num(c, b.inputs["LEFT_POWER"]), "speed");
    self.body.em2.set(await num(c, b.inputs["number_2"] ?? b.inputs["RIGHT_POWER"]), "speed");
  },
  "mbot2.mbot2_encoder_motor_drive_speed": async (self, c, b) => {
    self.body.cancelGoals();
    self.body.em1.set(await num(c, b.inputs["LEFT_POWER"]), "speed");
    self.body.em2.set(await num(c, b.inputs["number_2"] ?? b.inputs["RIGHT_POWER"]), "speed");
  },
  "mbot2.BLOCK_1618991049674": async (self, c, b) => {
    self.body.cancelGoals();
    self.body.em1.set(await num(c, b.inputs["LEFT_POWER"]), "speed");
    self.body.em2.set(await num(c, b.inputs["RIGHT_POWER"] ?? b.inputs["number_2"]), "speed");
  },

  // Add-ons on the mBot2 shield ports. Nothing is attached in the simulator, so
  // these keep their state (and report it back) without moving the robot.
  "mbot2.mbot2_motor_set_power_cw": async (self, c, b) => { self.ports.setMotor(toText(await arg(c, b, "fieldMenu_1")), await num(c, b.inputs["number_2"])); },
  "mbot2.mbot2_motor_add_power_cw": async (self, c, b) => {
    const port = toText(await arg(c, b, "fieldMenu_1"));
    self.ports.setMotor(port, self.ports.motor(port) + await num(c, b.inputs["power"]));
  },
  "mbot2.mbot2_motor_driver_power_cw": async (self, c, b) => {
    self.ports.setMotor("M1", await num(c, b.inputs["number_1"]));
    self.ports.setMotor("M2", await num(c, b.inputs["number_2"]));
  },
  "mbot2.mbot2_motor_stop_power": async (self, c, b) => {
    const port = toText(await arg(c, b, "fieldMenu_1"));
    for (const p of port.toLowerCase() === "all" ? ["M1", "M2"] : [port]) self.ports.setMotor(p, 0);
  },
  "mbot2.mbot2_motor_get_power_cw": async (self, c, b) => self.ports.motor(toText(await arg(c, b, "fieldMenu_1"))),
  "mbot2.mbot2_servo_set_angle": async (self, c, b) => { self.ports.setServo(toText(await arg(c, b, "fieldMenu_1")), await num(c, b.inputs["angle"])); },
  "mbot2.mbot2_servo_add_angle": async (self, c, b) => {
    const port = toText(await arg(c, b, "fieldMenu_1"));
    self.ports.setServo(port, self.ports.servo(port) + await num(c, b.inputs["angle"]));
  },
  "mbot2.mbot2_servo_driver": async (self, c, b) => {
    for (const [i, port] of ["S1", "S2", "S3", "S4"].entries()) self.ports.setServo(port, await num(c, b.inputs[`number_${i + 1}`]));
  },
  "mbot2.mbot2_servo_reset_angle_to_zero": async (self, c, b) => { self.ports.setServo(toText(await arg(c, b, "fieldMenu_1")), 0); },
  "mbot2.mbot2_servo_release_angle": noop,
  "mbot2.mbot2_servo_get_angle": async (self, c, b) => self.ports.servo(toText(await arg(c, b, "fieldMenu_1"))),
  "mbot2.mbot2_led_show": async (self, c, b) => {
    const port = toText(await arg(c, b, "fieldMenu_1"));
    const bits = parsePixels(toText(await arg(c, b, "facePanel")), 12, 1)[0];
    self.ports.strip(port).leds = bits.map((on) => (on ? [255, 255, 255] : [0, 0, 0]) as RGB);
  },
  "mbot2.mbot2_led_on_with_color": async (self, c, b) => {
    const strip = self.ports.strip(toText(await arg(c, b, "fieldMenu_1")));
    strip.set(await arg(c, b, "fieldMenu_2"), hexToRgb(await str(c, b.inputs["color_1"])));
  },
  "mbot2.mbot2_led_on_with_rgb": async (self, c, b) => {
    const strip = self.ports.strip(toText(await arg(c, b, "fieldMenu_1")));
    strip.set(await arg(c, b, "fieldMenu_2"), [await num(c, b.inputs["r"]), await num(c, b.inputs["g"]), await num(c, b.inputs["b"])]);
  },
  "mbot2.mbot2_led_off": async (self, c, b) => {
    const strip = self.ports.strip(toText(await arg(c, b, "fieldMenu_1")));
    strip.set(await arg(c, b, "fieldMenu_2"), [0, 0, 0]);
  },
  "mbot2.mbot2_led_move_with_cycle": async (self, c, b) => {
    const strip = self.ports.strip(toText(await arg(c, b, "fieldMenu_1")));
    const n = Math.round(await num(c, b.inputs["number_2"]));
    const len = strip.leds.length;
    const before = strip.leds;
    strip.leds = before.map((_, i) => before[(((i - n) % len) + len) % len]);
  },
  "mbot2.mbot2_led_set_brightness": async (self, c, b) => {
    self.ports.strip(toText(await arg(c, b, "fieldMenu_1"))).brightness = clamp(await num(c, b.inputs["number_1"]), 0, 100);
  },
  "mbot2.mbot2_led_add_brightness": async (self, c, b) => {
    const strip = self.ports.strip(toText(await arg(c, b, "fieldMenu_1")));
    strip.brightness = clamp(strip.brightness + await num(c, b.inputs["number_1"]), 0, 100);
  },
  "mbot2.mbot2_led_get_brightness": async (self, c, b) => self.ports.strip(toText(await arg(c, b, "fieldMenu_1"))).brightness,
  "mbot2.mbot2_pin_write_digtial": async (self, c, b) => { self.ports.pins.set(toText(await arg(c, b, "fieldMenu_1")), toNumber(await arg(c, b, "Digtial_value"))); },
  "mbot2.mbot2_pin_set_pwm_with_duty_and_frquency": async (self, c, b) => { self.ports.pins.set(toText(await arg(c, b, "pin_number")), await num(c, b.inputs["PWM_value"])); },
  "mbot2.mbot2_pin_read_digtial": async (self, c, b) => ((self.ports.pins.get(toText(await arg(c, b, "pin_number"))) ?? 0) > 0 ? 1 : 0),
  "mbot2.mbot2_pin_is_high": async (self, c, b) => (self.ports.pins.get(toText(await arg(c, b, "pin_number"))) ?? 0) > 0,
  "mbot2.mbot2_pin_use_5V_read_digtial": () => 0,

  // --- Quad RGB sensor ------------------------------------------------------------
  "mbuild_quad_color_sensor.mbuild_quad_color_sensor_get_off_track": (self) => self.quad().deviation,
  "mbuild_quad_color_sensor.mbuild_quad_color_sensor_get_rgb_gray_light": async (self, c, b) => {
    const probe = probeName(await arg(c, b, "inputMenu_2"));
    const what = toText(await arg(c, b, "inputMenu_3")).toLowerCase();
    const reading = self.quad().probes[probe === "any" ? "L1" : probe];
    const [r, g, bl] = reading.rgb.map(Math.round);
    if (what === "red") return r;
    if (what === "green") return g;
    if (what === "blue") return bl;
    if (what.startsWith("color")) return self.colorOf(reading.rgb);
    // Gray and reflected light (0–100).
    return Math.round(reading.gray);
  },
  "mbuild_quad_color_sensor.mbuild_quad_color_sensor_is_line_and_background": async (self, c, b) => {
    const probe = probeName(await arg(c, b, "inputMenu_2"));
    const target = toText(await arg(c, b, "inputMenu_3")).toLowerCase();
    const q = self.quad();
    const probes = probe === "any" ? PROBE_ORDER : [probe];
    return probes.some((p) => self.probeMatches(q, p, target));
  },
  // Line status of the two middle probes (0–3) and of all four (0–15).
  "mbuild_quad_color_sensor.BLOCK_1618397596925": async (self, c, b) => self.status(toText(await arg(c, b, "inputMenu_1")), ["L1", "R1"]),
  "mbuild_quad_color_sensor.BLOCK_1618397679204": async (self, c, b) => self.status(toText(await arg(c, b, "inputMenu_1")), PROBE_ORDER),
  "mbuild_quad_color_sensor.mbuild_quad_color_sensor_get_sta_with_inputMenu": async (self, c, b) => {
    const status = self.status(toText(await arg(c, b, "inputMenu_1")), ["L1", "R1"]);
    return compare(status, await arg(c, b, "inputMenu_2")) === 0;
  },
  "mbuild_quad_color_sensor.BLOCK_1618397452023": async (self, c, b) => {
    const status = self.status(toText(await arg(c, b, "inputMenu_1")), ["L1", "R1"]);
    return compare(status, await arg(c, b, "inputMenu_2")) === 0;
  },
  "mbuild_quad_color_sensor.BLOCK_1618364921511": async (self, c, b) => {
    const status = self.status(toText(await arg(c, b, "inputMenu_1")), PROBE_ORDER);
    return compare(status, await arg(c, b, "inputMenu_2")) === 0;
  },
  // Line-following status of all four probes (0–15), and "status is …?".
  "mbuild_quad_color_sensor.mbuild_quad_color_sensor_get_line_sta_with_number": (self) => self.lineFollowStatus(PROBE_ORDER),
  "mbuild_quad_color_sensor.mbuild_quad_color_sensor_get_line_sta_with_inputMenu": async (self, c, b) => compare(self.lineFollowStatus(PROBE_ORDER), await arg(c, b, "inputMenu_2")) === 0,
  // L1/R1 line-following status is … (0–3).
  "mbuild_quad_color_sensor.BLOCK_1617079703409": async (self, c, b) => compare(self.lineFollowStatus(["L1", "R1"]), await arg(c, b, "inputMenu_2")) === 0,
  "mbuild_quad_color_sensor.mbuild_quad_color_sensor_is_color": async (self, c, b) => {
    const probe = probeName(await arg(c, b, "inputMenu_2"));
    const color = toText(await arg(c, b, "inputMenu_3")).toLowerCase();
    const q = self.quad();
    return (probe === "any" ? PROBE_ORDER : [probe]).some((p) => self.probeMatches(q, p, color));
  },
  "mbuild_quad_color_sensor.BLOCK_1619088858273": async (self, c, b) => {
    const probe = probeName(await arg(c, b, "channel"));
    const target: RGB = [await num(c, b.inputs["r"]), await num(c, b.inputs["g"]), await num(c, b.inputs["b"])];
    const tolerance = (await num(c, b.inputs["tolerance"])) || 50;
    const rgb = self.quad().probes[probe === "any" ? "L1" : probe].rgb;
    return Math.hypot(rgb[0] - target[0], rgb[1] - target[1], rgb[2] - target[2]) <= tolerance;
  },
  "mbuild_quad_color_sensor.BLOCK_1618382823173": async (self, c, b) => {
    self.body.fillLight = MENU_FILL_COLORS[toText(await arg(c, b, "fieldMenu_3")).toLowerCase()] ?? [255, 255, 255];
  },
  "mbuild_quad_color_sensor.mbuild_quad_color_sensor_set_led": async (self, c, b) => {
    self.body.fillLight = MENU_FILL_COLORS[toText(await arg(c, b, "fieldMenu_3")).toLowerCase()] ?? [255, 255, 255];
  },
  "mbuild_quad_color_sensor.mbuild_quad_color_sensor_off_led": (self) => { self.body.fillLight = null; },
  "mbuild_quad_color_sensor.BLOCK_1620904215289": (self) => { self.body.fillLight = null; },
  "mbuild_quad_color_sensor.BLOCK_1626250042594": async (self, c, b) => {
    self.customColor = [await num(c, b.inputs["r"]), await num(c, b.inputs["g"]), await num(c, b.inputs["b"])];
    self.customTolerance = await num(c, b.inputs["tolerance"]) || 50;
  },
  // Calibration and detection mode don't change anything in the simulator.
  "mbuild_quad_color_sensor.BLOCK_1663048571053": noop,
  "mbuild_quad_color_sensor.BLOCK_1663048571165": noop,

  // --- Ultrasonic sensor 2 ---------------------------------------------------------
  "cyberpi_mbuild_ultrasonic2.mbuild_ultrasonic2_get_distance": (self) => self.distance(),
  "cyberpi_mbuild_ultrasonic2.mbuild_ultrasonic2_out_of_range": (self) => self.distance() >= 300,
  "cyberpi_mbuild_ultrasonic2.mbuild_ultrasonic2_set_bri": async (self, c, b) => {
    const value = clamp(await num(c, b.inputs["bv"]), 0, 100);
    for (const i of ultrasonicLeds(await c.decodeInput(b.inputs["order"]))) self.body.ultrasonicLeds[i] = value;
  },
  "cyberpi_mbuild_ultrasonic2.mbuild_ultrasonic2_add_bri": async (self, c, b) => {
    const value = await num(c, b.inputs["bv"]);
    for (const i of ultrasonicLeds(await c.decodeInput(b.inputs["order"]))) {
      self.body.ultrasonicLeds[i] = clamp(self.body.ultrasonicLeds[i] + value, 0, 100);
    }
  },
  "cyberpi_mbuild_ultrasonic2.mbuild_ultrasonic2_get_bri": async (self, c, b) => {
    const [i] = ultrasonicLeds(await c.decodeInput(b.inputs["order"]));
    return self.body.ultrasonicLeds[i ?? 0];
  },
  "cyberpi_mbuild_ultrasonic2.mbuild_ultrasonic2_off_led": async (self, c, b) => {
    for (const i of ultrasonicLeds(await c.decodeInput(b.inputs["inputMenu_3"]))) self.body.ultrasonicLeds[i] = 0;
  },
  "cyberpi_mbuild_ultrasonic2.mbuild_ultrasonic2_show_one_by_one": async (self, c, b) => {
    for (let i = 0; i < 8; i++) self.body.ultrasonicLeds[i] = clamp(await num(c, b.inputs[`bv${i + 1}`]), 0, 100);
  },
  "cyberpi_mbuild_ultrasonic2.mbuild_ultrasonic2_show_with_facepanel": async (self, c, b) => {
    // Each eye panel lights its 4 LEDs from the pattern.
    const left = parsePixels(toText(await arg(c, b, "facePanel_1")), 4, 1)[0];
    const right = parsePixels(toText(await arg(c, b, "facePanel_2")), 4, 1)[0];
    [...left, ...right].forEach((on, i) => (self.body.ultrasonicLeds[i] = on ? 100 : 0));
  },
  // Very old ids of "distance" and "out of range".
  "cyberpi_mbuild_ultrasonic2.BLOCK_1552140890585": (self) => self.distance(),
  "cyberpi_mbuild_ultrasonic2.BLOCK_1552140919772": (self) => self.distance() >= 300,
  "cyberpi_mbuild_ultrasonic2.mbuild_ultrasonic2_show_emotion": async (self, c, b) => {
    const emotion = await str(c, b.inputs["emotion"]);
    self.body.emotion = emotion;
    // The eyes play the emotion briefly, then go dark.
    const pattern: Record<string, number[]> = {
      happy: [100, 100, 30, 30, 100, 100, 30, 30], sleepy: [10, 10, 10, 10, 10, 10, 10, 10],
      wink: [100, 100, 100, 100, 0, 0, 0, 0], dizzy: [100, 0, 100, 0, 100, 0, 100, 0], thinking: [50, 100, 50, 100, 50, 100, 50, 100],
    };
    (pattern[emotion] ?? pattern.happy).forEach((v, i) => (self.body.ultrasonicLeds[i] = v));
    await c.sleep(1500);
    self.body.ultrasonicLeds.fill(0);
    self.body.emotion = null;
  },
};

function ultrasonicLeds(value: any): number[] {
  const text = toText(value).toLowerCase();
  if (text === "all" || text === "") return [0, 1, 2, 3, 4, 5, 6, 7];
  const n = Math.round(toNumber(value));
  return n >= 1 && n <= 8 ? [n - 1] : [];
}

class LedStrip {
  public leds: RGB[] = Array.from({ length: 12 }, () => [0, 0, 0] as RGB);
  public brightness = 100;

  public set(index: any, rgb: RGB) {
    const text = toText(index).toLowerCase();
    if (text === "all" || text === "") this.leds = this.leds.map(() => [...rgb] as RGB);
    else {
      const i = Math.round(toNumber(index)) - 1;
      if (i >= 0 && i < this.leds.length) this.leds[i] = rgb;
    }
  }
}

/** State of the extension ports (DC motors, servos, LED strips, pins). */
class Ports {
  private motors = new Map<string, number>();
  private servos = new Map<string, number>();
  private strips = new Map<string, LedStrip>();
  public readonly pins = new Map<string, number>();

  public setMotor(port: string, power: number) { this.motors.set(port.toUpperCase(), clamp(power, -100, 100)); }
  public motor(port: string) { return this.motors.get(port.toUpperCase()) ?? 0; }
  public setServo(port: string, angle: number) {
    for (const p of port.toLowerCase() === "all" ? ["S1", "S2", "S3", "S4"] : [port.toUpperCase()]) this.servos.set(p, clamp(angle, 0, 180));
  }
  public servo(port: string) { return this.servos.get(port.toUpperCase()) ?? 0; }
  public strip(port: string) {
    const key = port.toUpperCase();
    if (!this.strips.has(key)) this.strips.set(key, new LedStrip());
    return this.strips.get(key)!;
  }
  public reset() {
    this.motors.clear();
    this.servos.clear();
    this.strips.clear();
    this.pins.clear();
  }
}

export class MBot2 extends CyberPI {
  public readonly physicsEnabled = true;
  public readonly ports = new Ports();
  public world: World | null = null;
  public customColor: RGB = [255, 255, 255];
  public customTolerance = 50;

  protected get ops(): Ops<any> {
    return ops;
  }

  public resetDevice() {
    super.resetDevice();
    this.ports.reset();
  }

  public attachWorld(world: World) {
    this.world = world;
  }

  /** Chassis movement by direction at an RPM (both wheels). */
  public drive(direction: string, rpm: number) {
    switch (direction) {
      case "backward": this.body.setWheels(-rpm, -rpm); break;
      case "left": this.body.setWheels(-rpm, rpm); break;
      case "right": this.body.setWheels(rpm, -rpm); break;
      default: this.body.setWheels(rpm, rpm);
    }
  }

  public quad(): QuadReading {
    if (!this.world) throw new Error("The robot is not on a map.");
    return this.world.readQuad(this.body);
  }

  public distance(): number {
    if (!this.world) return 300;
    return this.world.readUltrasonic(this.body);
  }

  public colorOf(rgb: RGB): ColorName | "custom" {
    const [r, g, b] = this.customColor;
    const close = Math.hypot(rgb[0] - r, rgb[1] - g, rgb[2] - b) < this.customTolerance;
    return close && this.customColor.some((v) => v !== 255) ? "custom" : classifyColor(rgb);
  }

  /** Whether a probe sees the target ("line", "ground", "custom" or a colour name). */
  public probeMatches(q: QuadReading, probe: ProbeName, target: string) {
    const reading = q.probes[probe];
    if (target === "line") return reading.isLine;
    if (target === "ground" || target === "background") return !reading.isLine;
    return this.colorOf(reading.rgb) === target;
  }

  /**
   * Line-following status: one bit per probe, leftmost probe = highest bit,
   * 1 = sees the mat and 0 = on the line (15 = no line), like the real sensor.
   */
  public lineFollowStatus(probes: readonly ProbeName[]) {
    const q = this.quad();
    let value = 0;
    for (const p of probes) value = (value << 1) | (q.probes[p].isLine ? 0 : 1);
    return value;
  }

  /** Bit pattern of the probes that see the target, leftmost probe = highest bit. */
  public status(target: string, probes: readonly ProbeName[]) {
    const q = this.quad();
    let value = 0;
    for (const p of probes) value = (value << 1) | (this.probeMatches(q, p, target || "line") ? 1 : 0);
    return value;
  }
}
