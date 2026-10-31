import { Std, StdOps, StdHats } from "./std";
import { type Ops, noop, type Block, type Input } from "../block";
import type { Context } from "../context";
import type { LANRouter } from "../global";
import type { TargetId } from "../target";
import { clamp, compare, hexToRgb, toBoolean, toNumber, toText } from "../values";
import { RobotBody } from "../../sim/robot";
import { Display } from "../../sim/display";
import { speaker } from "../../sim/audio";
import { LED_MENU_COLORS, type RGB } from "../../sim/colors";
import { GYRO_Z_SIGN } from "../../sim/constants";
import { parsePixels, type Align } from "../../sim/screen-sprites";

export type ButtonName = "a" | "b";
export type JoystickDirection = "up" | "down" | "left" | "right" | "middle";

export const num = async (c: Context, input: Input | undefined) => toNumber(await c.decodeInput(input));
export const str = async (c: Context, input: Input | undefined) => toText(await c.decodeInput(input));

/** The first input of a block whose name isn't in `skip` (for blocks with unknown input names). */
export function firstInput(b: Block, skip: string[] = ["index"]) {
  const key = Object.keys(b.inputs).find((k) => !skip.includes(k));
  return key ? b.inputs[key] : undefined;
}

/**
 * A dropdown argument. Depending on the mBlock version the same argument is
 * stored as a field or as an input with a menu block, so check both.
 */
export async function arg(c: Context, b: Block, name: string): Promise<any> {
  if (b.fields[name]) return c.decodeField(b.fields[name]);
  return c.decodeInput(b.inputs[name]);
}

/** Which of CyberPi's 5 LEDs a menu value refers to ("all" or 1–5). */
function ledIndices(value: any): number[] {
  const text = toText(value).toLowerCase();
  if (text === "all" || text === "") return [0, 1, 2, 3, 4];
  const n = Math.round(toNumber(value));
  return n >= 1 && n <= 5 ? [n - 1] : [];
}

const ANIMATIONS: Record<string, RGB[][]> = {
  rainbow: [0, 1, 2, 3, 4, 5].map((shift) => [1, 2, 3, 4, 5].map((i) => LED_MENU_COLORS[((i + shift) % 7) + 1])),
  spindrift: [0, 1, 2, 3, 4].map((p) => [0, 1, 2, 3, 4].map((i) => (i === p ? [0, 200, 255] : [0, 30, 60]) as RGB)),
  meteor_blue: [0, 1, 2, 3, 4, 5].map((p) => [0, 1, 2, 3, 4].map((i) => (i === p ? [0, 0, 255] : i === p - 1 ? [0, 0, 80] : [0, 0, 0]) as RGB)),
  meteor_green: [0, 1, 2, 3, 4, 5].map((p) => [0, 1, 2, 3, 4].map((i) => (i === p ? [0, 255, 0] : i === p - 1 ? [0, 80, 0] : [0, 0, 0]) as RGB)),
  flash_red: [0, 1, 0, 1].map((on) => Array(5).fill(on ? [255, 0, 0] : [0, 0, 0])),
  flash_orange: [0, 1, 0, 1].map((on) => Array(5).fill(on ? [255, 128, 0] : [0, 0, 0])),
  firefly: [0, 1, 2, 3].map((p) => [0, 1, 2, 3, 4].map((i) => ((i + p) % 3 === 0 ? [255, 220, 80] : [40, 30, 0]) as RGB)),
};

/** Speaks text with the browser's voice; waits until it's done (or the script stops). */
async function speak(text: string, language: string, c: Context) {
  const synth = typeof window !== "undefined" ? window.speechSynthesis : undefined;
  if (!synth || speaker.muted || !text) return;
  const utterance = new SpeechSynthesisUtterance(text);
  const languages: Record<string, string> = {
    chinese: "zh-CN", english: "en-US", french: "fr-FR", german: "de-DE", italian: "it-IT", japanese: "ja-JP",
    korean: "ko-KR", portuguese: "pt-PT", russian: "ru-RU", spanish: "es-ES", arabic: "ar-SA", hindi: "hi-IN",
  };
  const key = Object.keys(languages).find((name) => language.toLowerCase().includes(name));
  utterance.lang = key ? languages[key] : language.length <= 5 && language ? language : "en-US";
  utterance.volume = speaker.volume / 100;
  let done = false;
  utterance.onend = utterance.onerror = () => (done = true);
  synth.speak(utterance);
  await c.waitUntil(() => done, 50);
  if (!c.isActive) synth.cancel();
}

/** One part of the current date/time, for the internet time blocks. */
function timePart(what: string) {
  const now = new Date();
  const w = what.toLowerCase();
  if (w.includes("year")) return now.getFullYear();
  if (w.includes("month")) return now.getMonth() + 1;
  if (w.includes("week") || w.includes("weekday")) return now.getDay() === 0 ? 7 : now.getDay();
  if (w.includes("day") || w.includes("date")) return now.getDate();
  if (w.includes("hour")) return now.getHours();
  if (w.includes("minute") || w === "min") return now.getMinutes();
  if (w.includes("second") || w === "sec") return now.getSeconds();
  return now.toLocaleString();
}

export const CyberPIOps: Ops<CyberPI> = {
  // Events
  "cyberpi.cyberpi_when_launch": noop,
  "cyberpi.cyberpi_when_button_press": (_, c, b) => c.decodeField(b.fields["fieldMenu_2"]),
  "cyberpi.cyberpi_when_direction_key_press": (_, c, b) => c.decodeField(b.fields["fieldMenu_2"]),
  "cyberpi.cyberpi_when_detect_action": (_, c, b) => c.decodeField(b.fields["tilt"]),
  "cyberpi.cyberpi_when_detect_attitude": (_, c, b) => c.decodeField(b.fields["tilt"]),
  "cyberpi.cyberpi_when_sensor_value_bigger_or_smaller_than": noop,
  "cyberpi.cyberpi_wifi_broadcast_when_received_message": async (_, c, b) => toText(await c.decodeInput(b.inputs["message"])),

  // Net
  "cyberpi.cyberpi_set_wifi_broadcast": async (self, c, b) => self.lanRouter.broadcast(await str(c, b.inputs["message"])),
  "cyberpi.cyberpi_set_wifi_broadcast_with_value": async (self, c, b) => self.lanRouter.broadcast(await str(c, b.inputs["message"]), await c.decodeInput(b.inputs["value"])),
  "cyberpi.cyberpi_wifi_broadcast_get_value": async (self, c, b) => self.lanRouter.getValue(await str(c, b.inputs["message"])) ?? "",
  "cyberpi.cyberpi_set_wifi_channels": noop,
  "cyberpi.cyberpi_wifi_set": noop,
  "cyberpi.cyberpi_wifi_is_connect": () => false,
  "cyberpi.cyberpi_wifi_reconnect": noop,
  "cyberpi.cyberpi_wifi_disconnect": noop,

  // Time
  "cyberpi.cyberpi_timer_reset": (self) => { self.timerStart = performance.now(); },
  "cyberpi.cyberpi_timer_get": (self) => Math.round((performance.now() - self.timerStart) / 10) / 100,

  // Info
  "cyberpi.cyberpi_name": () => "mbot2",
  "cyberpi.cyberpi_battery_macaddress_blename_and_so_on": (_, c, b) => {
    const what = toText(c.decodeField(b.fields["fieldMenu_1"]));
    if (what.includes("battery")) return 100;
    if (what.includes("mac")) return "00:11:22:33:44:55";
    return "mbot2-sim";
  },
  "cyberpi.cyberpi_restart": (self) => { setTimeout(() => self.launch(), 0); },

  // Display
  "cyberpi.cyberpi_display_println": async (self, c, b) => { self.display.print(await str(c, b.inputs["string_2"]), true); },
  "cyberpi.cyberpi_display_print": async (self, c, b) => { self.display.print(await str(c, b.inputs["string_2"])); },
  "cyberpi.cyberpi_display_clear": (self) => { self.display.clear(); },
  "cyberpi.cyberpi_console_set_font": async (self, c, b) => { self.display.setFontSize(await num(c, b.inputs["inputMenu_1"])); },
  "cyberpi.cyberpi_display_set_brush_with_color": async (self, c, b) => { self.display.setBrush(await str(c, b.inputs["color_1"])); },
  "cyberpi.cyberpi_display_set_brush_with_r_g_b": async (self, c, b) => {
    const [r, g, bl] = [await num(c, b.inputs["number_1"]), await num(c, b.inputs["number_2"]), await num(c, b.inputs["number_3"])];
    self.display.setBrush(`rgb(${clamp(r, 0, 255)}, ${clamp(g, 0, 255)}, ${clamp(bl, 0, 255)})`);
  },
  "cyberpi.cyberpi_display_label_show_at_somewhere_with_size": async (self, c, b) => {
    self.display.showLabel(
      toText(c.decodeField(b.fields["fieldMenu_1"])),
      await str(c, b.inputs["string_2"]),
      toText(c.decodeField(b.fields["fieldMenu_2"])),
      await num(c, b.inputs["inputMenu_4"]),
    );
  },
  "cyberpi.cyberpi_display_label_show_label_xy_with_size": async (self, c, b) => {
    self.display.showLabel(
      toText(c.decodeField(b.fields["fieldMenu_1"])),
      await str(c, b.inputs["string_2"]),
      { x: await num(c, b.inputs["number_2"]), y: await num(c, b.inputs["number_3"]) },
      await num(c, b.inputs["inputMenu_4"]),
    );
  },
  "cyberpi.cyberpi_display_line_chart_add_data": async (self, c, b) => { self.display.addLineData(await num(c, b.inputs["number_1"])); },
  "cyberpi.cyberpi_display_line_chart_set_interval": async (self, c, b) => { self.display.setLineInterval(await num(c, b.inputs["number_3"])); },
  "cyberpi.cyberpi_display_bar_chart_add_data": async (self, c, b) => { self.display.addBarData(await num(c, b.inputs["number_1"])); },
  "cyberpi.cyberpi_display_bar_chart_set_interval": noop,
  "cyberpi.cyberpi_display_table_add_data_at_row_column_2": async (self, c, b) => {
    self.display.setTableCell(await num(c, b.inputs["fieldMenu_1"]), await num(c, b.inputs["fieldMenu_2"]), await str(c, b.inputs["string_3"]));
  },
  "cyberpi.cyberpi_display_rotate_to_2": async (self, c, b) => {
    self.display.setRotation(toNumber(await c.decodeInput(b.inputs["fieldMenu_1"])));
  },

  // LEDs
  "cyberpi.cyberpi_show_led": (self, c, b) => {
    const digits = toText(c.decodeField(b.fields["ledRing"])).padEnd(5, "0");
    for (let i = 0; i < 5; i++) self.setLed(i, LED_MENU_COLORS[Number(digits[i]) || 0]);
  },
  "cyberpi.cyberpi_led_show_single_with_color_2": async (self, c, b) => {
    const rgb = hexToRgb(await str(c, b.inputs["color_1"]));
    for (const i of ledIndices(await c.decodeInput(b.inputs["fieldMenu_1"]))) self.setLed(i, rgb);
  },
  "cyberpi.cyberpi_led_show_single_with_color_and_time_2": async (self, c, b) => {
    const rgb = hexToRgb(await str(c, b.inputs["color_1"]));
    const leds = ledIndices(await c.decodeInput(b.inputs["fieldMenu_1"]));
    for (const i of leds) self.setLed(i, rgb);
    await c.sleep(await num(c, b.inputs["number_3"]) * 1000);
    for (const i of leds) self.setLed(i, [0, 0, 0]);
  },
  "cyberpi.cyberpi_led_show_single_with_rgb_2": async (self, c, b) => {
    const rgb: RGB = [await num(c, b.inputs["r"]), await num(c, b.inputs["g"]), await num(c, b.inputs["b"])];
    for (const i of ledIndices(await c.decodeInput(b.inputs["fieldMenu_1"]))) self.setLed(i, rgb);
  },
  "cyberpi.cyberpi_led_show_single_with_rgb_and_time": async (self, c, b) => {
    const rgb: RGB = [await num(c, b.inputs["r"]), await num(c, b.inputs["g"]), await num(c, b.inputs["b"])];
    const leds = ledIndices(await c.decodeInput(b.inputs["fieldMenu_1"]));
    for (const i of leds) self.setLed(i, rgb);
    await c.sleep(await num(c, b.inputs["number_5"]) * 1000);
    for (const i of leds) self.setLed(i, [0, 0, 0]);
  },
  "cyberpi.cyberpi_led_off_2": async (self, c, b) => {
    for (const i of ledIndices(await c.decodeInput(b.inputs["fieldMenu_1"]))) self.setLed(i, [0, 0, 0]);
  },
  "cyberpi.cyberpi_move_led": async (self, c, b) => {
    const steps = Math.round(await num(c, b.inputs["led_number"]));
    const leds = self.body.leds.map((rgb) => [...rgb] as RGB);
    for (let i = 0; i < 5; i++) self.setLed((((i + steps) % 5) + 5) % 5, leds[i]);
  },
  "cyberpi.cyberpi_play_led_animation_until": async (self, c, b) => {
    const frames = ANIMATIONS[toText(c.decodeField(b.fields["LED_animation"]))] ?? ANIMATIONS.rainbow;
    for (let round = 0; round < 2 && c.isActive; round++) {
      for (const frame of frames) {
        frame.forEach((rgb, i) => self.setLed(i, rgb));
        await c.sleep(150);
        if (!c.isActive) break;
      }
    }
    for (let i = 0; i < 5; i++) self.setLed(i, [0, 0, 0]);
  },
  "cyberpi.cyberpi_set_led_brightness": async (self, c, b) => { self.body.ledBrightness = clamp(await num(c, firstInput(b)), 0, 100); },
  "cyberpi.cyberpi_add_led_brightness": async (self, c, b) => { self.body.ledBrightness = clamp(self.body.ledBrightness + await num(c, firstInput(b)), 0, 100); },
  "cyberpi.cyberpi_get_led_brightness": (self) => self.body.ledBrightness,

  // Audio
  "cyberpi.cyberpi_play_buzzer_tone": async (_, c, b) => { speaker.tone(await num(c, b.inputs["number_2"]), 0.5); },
  "cyberpi.cyberpi_play_buzzer_tone_with_time": async (_, c, b) => {
    await c.sleep(speaker.tone(await num(c, b.inputs["number_1"]), await num(c, b.inputs["number_2"])));
  },
  "cyberpi.cyberpi_play_music_with_tone_and_note_2": async (_, c, b) => {
    await c.sleep(speaker.note(await num(c, b.inputs["number_1"]), await num(c, b.inputs["number_2"])));
  },
  "cyberpi.cyberpi_play_music_with_note": async (_, c, b) => {
    await c.sleep(speaker.drum(await str(c, b.inputs["fieldMenu_1"]), await num(c, b.inputs["number_3"])));
  },
  "cyberpi.cyberpi_play_audio_3": async (_, c, b) => { speaker.clip(await str(c, b.inputs["file_name"])); },
  "cyberpi.cyberpi_play_audio_until_3": async (_, c, b) => { await c.sleep(speaker.clip(await str(c, b.inputs["file_name"]))); },
  "cyberpi.cyberpi_stop_audio": () => { speaker.stop(); },
  "cyberpi.cyberpi_set_volume": async (_, c, b) => { speaker.volume = clamp(await num(c, firstInput(b)), 0, 100); },
  "cyberpi.cyberpi_add_volume": async (_, c, b) => { speaker.volume = clamp(speaker.volume + await num(c, firstInput(b)), 0, 100); },
  "cyberpi.cyberpi_get_volume": () => speaker.volume,
  "cyberpi.cyberpi_set_audio_speed": async (_, c, b) => { speaker.speed = clamp(await num(c, firstInput(b)), 10, 400); },
  "cyberpi.cyberpi_add_audio_speed": async (_, c, b) => { speaker.speed = clamp(speaker.speed + await num(c, firstInput(b)), 10, 400); },
  "cyberpi.cyberpi_get_audio_speed": () => speaker.speed,
  "cyberpi.cyberpi_start_record": noop,
  "cyberpi.cyberpi_stop_record": noop,
  "cyberpi.cyberpi_play_record": noop,
  "cyberpi.cyberpi_play_record_until": noop,

  // Buttons & joystick
  "cyberpi.cyberpi_button_press": (self, c, b) => self.isPressed(toText(c.decodeField(b.fields["fieldMenu_1"]))),
  "cyberpi.cyberpi_button_count": (self, c, b) => self.pressCounts[toText(c.decodeField(b.fields["fieldMenu_1"]))] ?? 0,
  "cyberpi.cyberpi_direction_key_press": (self, c, b) => self.isPressed(toText(c.decodeField(b.fields["fieldMenu_1"]))),
  "cyberpi.cyberpi_direction_key_count": (self, c, b) => self.pressCounts[toText(c.decodeField(b.fields["fieldMenu_1"]))] ?? 0,

  // On-board sensors
  "cyberpi.cyberpi_loudness": (self) => self.loudness,
  "cyberpi.cyberpi_brightness": (self) => self.brightness,
  "cyberpi.cyberpi_axis_rotation_angle": (self, c, b) => {
    const axis = toText(c.decodeField(b.fields["axis"]));
    if (axis === "z") return self.yaw;
    if (axis === "x") return Math.round(self.body.pitchDeg * 10) / 10;
    return Math.round(self.body.rollDeg * 10) / 10;
  },
  "cyberpi.cyberpi_axis_angle_speed": (self, c, b) => (toText(c.decodeField(b.fields["axis"])) === "z" ? Math.round(GYRO_Z_SIGN * self.body.yawRateDeg * 10) / 10 : 0),
  "cyberpi.cyberpi_axis_acceleration": (self, c, b) => {
    const axis = toText(c.decodeField(b.fields["axis"]));
    const g = 9.8;
    const pitch = (self.body.pitchDeg * Math.PI) / 180, roll = (self.body.rollDeg * Math.PI) / 180;
    if (axis === "x") return Math.round((self.body.forwardAccel - g * Math.sin(pitch)) * 100) / 100;
    if (axis === "y") return Math.round((self.body.lateralAccel + g * Math.sin(roll)) * 100) / 100;
    return Math.round(g * Math.cos(pitch) * Math.cos(roll) * 100) / 100;
  },
  "cyberpi.cyberpi_reset_axis_rotation_angle": (self, c, b) => {
    const axis = toText(c.decodeField(b.fields["axis"]));
    if (axis === "z" || axis === "all") self.yawOffset = self.body.yawDeg;
  },
  "cyberpi.cyberpi_reset_yaw": (self) => { self.yawOffset = self.body.yawDeg; },
  "cyberpi.cyberpi_tilt_degree": (self, c, b) => self.tilt(toText(c.decodeField(b.fields["rotation"]))),
  "cyberpi.cyberpi_detect_attitude": (self, c, b) => self.attitude(toText(c.decodeField(b.fields["tilt"]))),
  "cyberpi.cyberpi_detect_action": () => false,
  "cyberpi.cyberpi_shaked_value": () => 0,
  "cyberpi.cyberpi_wave_angle": () => 0,
  "cyberpi.cyberpi_wave_speed": () => 0,

  "cyberpi.cyberpi_button_count_reset": async (self, c, b) => { self.pressCounts[toText(await arg(c, b, "fieldMenu_1"))] = 0; },
  "cyberpi.cyberpi_direction_key_count_reset": async (self, c, b) => {
    const key = toText(await arg(c, b, "fieldMenu_1"));
    if (key === "any" || key === "all") for (const d of ["up", "down", "left", "right", "middle"]) self.pressCounts[d] = 0;
    else self.pressCounts[key] = 0;
  },

  // Older versions of display/LED/audio blocks (files saved with older mBlock).
  "cyberpi.cyberpi_display_rotate_to": async (self, c, b) => { self.display.setRotation(toNumber(await arg(c, b, "fieldMenu_1"))); },
  "cyberpi.cyberpi_display_table_add_data_at_row_column": async (self, c, b) => {
    self.display.setTableCell(toNumber(await arg(c, b, "fieldMenu_1")), toNumber(await arg(c, b, "fieldMenu_2")), await str(c, b.inputs["string_3"]));
  },
  "cyberpi.cyberpi_display_show_at_somewhere_with_size": async (self, c, b) => {
    self.display.showLabel("text", await str(c, b.inputs["string_2"]), toText(await arg(c, b, "fieldMenu_2")), toNumber(await arg(c, b, "inputMenu_4")));
  },
  "cyberpi.cyberpi_display_show_label_xy_with_size": async (self, c, b) => {
    self.display.showLabel("text", await str(c, b.inputs["string_2"]), { x: await num(c, b.inputs["number_2"]), y: await num(c, b.inputs["number_3"]) }, toNumber(await arg(c, b, "inputMenu_4")));
  },
  "cyberpi.cyberpi_display_set_chart_name": async (self, c, b) => { self.display.setChartTitle(await str(c, b.inputs["string_1"])); },
  "cyberpi.cyberpi_display_clear_chart": (self) => { self.display.clearChart(); },

  // Screen sprites and backdrop.
  "cyberpi.cyberpi_sprite_draw_text": async (self, c, b) => {
    const name = await str(c, b.inputs["string_1"]);
    const text = await str(c, b.inputs["string_2"]);
    self.display.useSprites((s) => s.define(name, { kind: "text", text }));
  },
  "cyberpi.cyberpi_sprite_draw_pixel_with_icon": async (self, c, b) => {
    const name = await str(c, b.inputs["string_1"]);
    const icon = toText(await arg(c, b, "inputMenu_2"));
    self.display.useSprites((s) => s.define(name, { kind: "icon", icon }));
  },
  "cyberpi.cyberpi_sprite_draw_pixel_with_matrix16": async (self, c, b) => {
    const name = await str(c, b.inputs["string_1"]);
    const bits = parsePixels(toText(await arg(c, b, "facePanel_2")));
    self.display.useSprites((s) => s.define(name, { kind: "matrix", bits }));
  },
  "cyberpi.cyberpi_sprite_draw_qr": async (self, c, b) => {
    // QR codes are shown as their text.
    const name = await str(c, b.inputs["string_1"]);
    const text = `[QR] ${await str(c, b.inputs["string_2"])}`;
    self.display.useSprites((s) => s.define(name, { kind: "text", text }));
  },
  "cyberpi.cyberpi_sprite_draw_sketch": async (self, c, b) => {
    const name = await str(c, b.inputs["string_1"]);
    self.display.useSprites((s) => s.sketchAsSprite(name));
  },
  "cyberpi.cyberpi_sprite_delete": async (self, c, b) => {
    const name = await str(c, b.inputs["string_1"]);
    self.display.useSprites((s) => s.delete(name));
  },
  "cyberpi.cyberpi_sprite_show_and_hide": async (self, c, b) => {
    // The field holds show/hide; the sprite name is the "inputVariable_2" input.
    const action = toText(await arg(c, b, "string_1"));
    const name = toText(await c.decodeInput(b.inputs["inputVariable_2"] ?? b.inputs["string_1"]));
    self.display.useSprites((s) => { const sprite = s.get(name); if (sprite) sprite.visible = !action.includes("hide"); });
  },
  "cyberpi.cyberpi_sprite_move_to": async (self, c, b) => {
    const name = await str(c, b.inputs["string_1"]);
    const x = await num(c, b.inputs["number_2"]), y = await num(c, b.inputs["number_3"]);
    self.display.useSprites((s) => { const sprite = s.get(name); if (sprite) { sprite.x = x; sprite.y = y; } });
  },
  "cyberpi.cyberpi_sprite_move_x_and_y": async (self, c, b) => {
    const name = await str(c, b.inputs["string_1"]);
    const direction = toText(await arg(c, b, "fieldMenu_2"));
    const amount = await num(c, b.inputs["number_3"]);
    self.display.useSprites((s) => {
      const sprite = s.get(name);
      if (!sprite) return;
      if (direction === "left") sprite.x -= amount;
      else if (direction === "up") sprite.y -= amount;
      else if (direction === "y" || direction === "down") sprite.y += amount;
      else sprite.x += amount;
    });
  },
  "cyberpi.cyberpi_sprite_move_random": async (self, c, b) => {
    const name = await str(c, b.inputs["string_1"]);
    self.display.useSprites((s) => { const sprite = s.get(name); if (sprite) { sprite.x = Math.random() * 128; sprite.y = Math.random() * 128; } });
  },
  "cyberpi.cyberpi_sprite_rotate": async (self, c, b) => {
    const name = await str(c, b.inputs["string_1"]);
    const degrees = await num(c, b.inputs["number_2"]);
    self.display.useSprites((s) => { const sprite = s.get(name); if (sprite) sprite.direction += degrees; });
  },
  "cyberpi.cyberpi_sprite_rotate_to": async (self, c, b) => {
    const name = await str(c, b.inputs["string_1"]);
    const direction = await num(c, b.inputs["number_2"]);
    self.display.useSprites((s) => { const sprite = s.get(name); if (sprite) sprite.direction = direction; });
  },
  "cyberpi.cyberpi_sprite_set_size": async (self, c, b) => {
    const name = await str(c, b.inputs["string_1"]);
    const size = await num(c, b.inputs["number_2"]);
    self.display.useSprites((s) => { const sprite = s.get(name); if (sprite) sprite.size = Math.max(0, size); });
  },
  "cyberpi.cyberpi_sprite_add_size": async (self, c, b) => {
    const name = await str(c, b.inputs["string_1"]);
    const size = await num(c, b.inputs["number_2"]);
    self.display.useSprites((s) => { const sprite = s.get(name); if (sprite) sprite.size = Math.max(0, sprite.size + size); });
  },
  "cyberpi.cyberpi_sprite_set_color_with_color": async (self, c, b) => {
    const name = await str(c, b.inputs["string_1"]);
    const color = await str(c, b.inputs["number_2"] ?? b.inputs["color_2"]);
    self.display.useSprites((s) => { const sprite = s.get(name); if (sprite) sprite.color = color; });
  },
  "cyberpi.cyberpi_sprite_set_color_with_rgb": async (self, c, b) => {
    const name = await str(c, b.inputs["string_1"]);
    const rgb = [await num(c, b.inputs["number_2"]), await num(c, b.inputs["number_3"]), await num(c, b.inputs["number_4"])].map((v) => clamp(v, 0, 255));
    self.display.useSprites((s) => { const sprite = s.get(name); if (sprite) sprite.color = `rgb(${rgb.join(",")})`; });
  },
  "cyberpi.cyberpi_sprite_close_color": async (self, c, b) => {
    const name = await str(c, b.inputs["string_1"]);
    self.display.useSprites((s) => { const sprite = s.get(name); if (sprite) sprite.color = null; });
  },
  "cyberpi.cyberpi_sprite_set_align": async (self, c, b) => {
    const name = await str(c, b.inputs["string_1"]);
    const align = toText(await arg(c, b, "inputMenu_2")) as Align;
    self.display.useSprites((s) => { const sprite = s.get(name); if (sprite) sprite.align = align; });
  },
  "cyberpi.cyberpi_mirror_with_axis": async (self, c, b) => {
    const name = await str(c, b.inputs["string_1"]);
    const axis = toText(await arg(c, b, "fieldMenu_3"));
    self.display.useSprites((s) => {
      const sprite = s.get(name);
      if (!sprite) return;
      if (axis.includes("y") || axis.includes("vertical")) sprite.flipY = !sprite.flipY;
      else sprite.flipX = !sprite.flipX;
    });
  },
  "cyberpi.cyberpi_sprite_z_max_and_min": async (self, c, b) => {
    const name = await str(c, b.inputs["string_1"]);
    const where = toText(await arg(c, b, "fieldMenu_2"));
    self.display.useSprites((s) => s.layer(name, where));
  },
  "cyberpi.cyberpi_sprite_z_up_and_down": async (self, c, b) => {
    const name = await str(c, b.inputs["string_1"]);
    const where = toText(await arg(c, b, "fieldMenu_2"));
    const steps = await num(c, b.inputs["number_3"]);
    self.display.useSprites((s) => s.layer(name, where, Math.max(1, Math.round(steps))));
  },
  "cyberpi.cyberpi_sprite_get_x_y_rotation_size_align": async (self, c, b) => {
    const sprite = self.display.sprites.get(await str(c, b.inputs["string_1"]));
    const what = toText(await arg(c, b, "fieldMenu_2"));
    if (!sprite) return 0;
    if (what.includes("x")) return Math.round(sprite.x);
    if (what.includes("y")) return Math.round(sprite.y);
    if (what.includes("rotation") || what.includes("direction")) return sprite.direction;
    if (what.includes("size")) return sprite.size;
    return sprite.align;
  },
  "cyberpi.cyberpi_sprite_is_touch_edge": async (self, c, b) => self.display.sprites.touchesEdge(await str(c, b.inputs["string_1"])),
  "cyberpi.cyberpi_sprite_is_touch_other_sprite": async (self, c, b) => self.display.sprites.touches(await str(c, b.inputs["string_1"]), await str(c, b.inputs["string_2"])),
  "cyberpi.cyberpi_sprite_variable_list": async (_, c, b) => toText(await arg(c, b, "fieldVariable_1")),
  "cyberpi.cyberpi_sprite_background_fill_with_color": async (self, c, b) => {
    const color = await str(c, b.inputs["color_1"]);
    self.display.useSprites((s) => { s.background = color; });
  },
  "cyberpi.cyberpi_sprite_background_fill_with_rgb": async (self, c, b) => {
    const rgb = [await num(c, b.inputs["number_1"]), await num(c, b.inputs["number_2"]), await num(c, b.inputs["number_3"])].map((v) => clamp(v, 0, 255));
    self.display.useSprites((s) => { s.background = `rgb(${rgb.join(",")})`; });
  },
  "cyberpi.cyberpi_screen_render": (self) => { self.display.render(); },
  "cyberpi.cyberpi_screen_inable_and_disable_auto_render": async (self, c, b) => {
    const value = toText(await arg(c, b, "fieldMenu_1")).toLowerCase();
    self.display.setAutoRender(!(value.includes("off") || value.includes("disable") || value === "0" || value === "false"));
  },
  "cyberpi.cyberpi_screen_get_color_equal_with_color": async (self, c, b) => {
    const [r, g, bl] = self.display.pixel(await num(c, b.inputs["number_2"]), await num(c, b.inputs["number_3"]));
    const [tr, tg, tb] = hexToRgb(await str(c, b.inputs["color_4"]));
    return Math.abs(r - tr) + Math.abs(g - tg) + Math.abs(bl - tb) < 30;
  },
  "cyberpi.cyberpi_screen_get_color_equal_with_rgb": async (self, c, b) => {
    const [r, g, bl] = self.display.pixel(await num(c, b.inputs["number_2"]), await num(c, b.inputs["number_3"]));
    const target = [await num(c, b.inputs["number_4"]), await num(c, b.inputs["number_5"]), await num(c, b.inputs["number_6"])];
    return Math.abs(r - target[0]) + Math.abs(g - target[1]) + Math.abs(bl - target[2]) < 30;
  },

  // Doodle pen ("airbrush").
  "cyberpi.cyberpi_sketch_start": (self) => { self.display.useSprites((s) => { s.pen.drawing = true; }); },
  "cyberpi.cyberpi_sketch_if_start": (self) => { self.display.useSprites((s) => { s.pen.drawing = true; }); },
  "cyberpi.cyberpi_sketch_end": (self) => { self.display.useSprites((s) => { s.pen.drawing = false; }); },
  "cyberpi.cyberpi_sketch_clear": (self) => { self.display.useSprites((s) => s.clearSketch()); },
  "cyberpi.cyberpi_sketch_move": async (self, c, b) => {
    const distance = await num(c, b.inputs["number_1"]);
    self.display.useSprites((s) => s.penForward(distance));
    await self.penDelay(c, distance);
  },
  "cyberpi.cyberpi_sketch_move_x_and_y": async (self, c, b) => {
    const direction = toText(await arg(c, b, "fieldMenu_1"));
    const amount = await num(c, b.inputs["number_1"]);
    self.display.useSprites((s) => {
      const { x, y } = s.pen;
      if (direction === "left") s.penTo(x - amount, y);
      else if (direction === "up") s.penTo(x, y - amount);
      else if (direction === "y" || direction === "down") s.penTo(x, y + amount);
      else s.penTo(x + amount, y);
    });
    await self.penDelay(c, amount);
  },
  "cyberpi.cyberpi_sketch_move_to": async (self, c, b) => {
    const x = await num(c, b.inputs["number_1"]), y = await num(c, b.inputs["number_2"]);
    self.display.useSprites((s) => s.penTo(x, y));
  },
  "cyberpi.cyberpi_sketch_move_to_center": (self) => { self.display.useSprites((s) => s.penTo(64, 64)); },
  "cyberpi.cyberpi_sketch_cw": async (self, c, b) => {
    const degrees = await num(c, b.inputs["number_1"]);
    self.display.useSprites((s) => { s.pen.direction += degrees; });
  },
  "cyberpi.cyberpi_sketch_set_angle": async (self, c, b) => {
    const direction = await num(c, b.inputs["number_1"]);
    self.display.useSprites((s) => { s.pen.direction = direction; });
  },
  "cyberpi.cyberpi_sketch_set_angle_2": async (self, c, b) => {
    const direction = await num(c, b.inputs["angle_1"]);
    self.display.useSprites((s) => { s.pen.direction = direction; });
  },
  "cyberpi.cyberpi_sketch_circle": async (self, c, b) => {
    const radius = await num(c, b.inputs["number_1"]);
    const degrees = await num(c, b.inputs["number_2"]);
    self.display.useSprites((s) => s.penArc(radius, degrees));
    await self.penDelay(c, (2 * Math.PI * Math.abs(radius) * Math.abs(degrees)) / 360);
  },
  "cyberpi.cyberpi_sketch_set_color_with_color": async (self, c, b) => {
    const color = await str(c, b.inputs["color_1"]);
    self.display.useSprites((s) => { s.pen.color = color; });
  },
  "cyberpi.cyberpi_sketch_set_color_with_rgb": async (self, c, b) => {
    const rgb = [await num(c, b.inputs["number_1"]), await num(c, b.inputs["number_2"]), await num(c, b.inputs["number_3"])].map((v) => clamp(v, 0, 255));
    self.display.useSprites((s) => { s.pen.color = `rgb(${rgb.join(",")})`; });
  },
  "cyberpi.cyberpi_sketch_set_size": async (self, c, b) => {
    const size = await num(c, b.inputs["number_1"]);
    self.display.useSprites((s) => { s.pen.size = Math.max(1, size); });
  },
  "cyberpi.cyberpi_sketch_set_speed": async (self, c, b) => {
    const speed = await num(c, b.inputs["number_1"]);
    self.display.useSprites((s) => { s.pen.speed = Math.max(0, speed); });
  },
  "cyberpi.cyberpi_sketch_get_x_y_angle_and_size": async (self, c, b) => {
    const what = toText(await arg(c, b, "fieldMenu_1"));
    const pen = self.display.sprites.pen;
    if (what.includes("x")) return Math.round(pen.x);
    if (what.includes("y")) return Math.round(pen.y);
    if (what.includes("angle") || what.includes("direction")) return pen.direction;
    return pen.size;
  },

  // Speech uses the browser's voice; recognition and translation need the cloud.
  "cyberpi.cyberpi_speak_with_some_language": async (_, c, b) => { await speak(await str(c, b.inputs["string_2"]), toText(await arg(c, b, "fieldMenu_1")), c); },
  "cyberpi.cyberpi_speak_with_some_language_2": async (_, c, b) => { await speak(await str(c, b.inputs["string_2"]), toText(await arg(c, b, "fieldMenu_1")), c); },
  "cyberpi.cyberpi_speak_with_some_language_3": async (_, c, b) => { await speak(await str(c, b.inputs["string_2"]), toText(await arg(c, b, "fieldMenu_1")), c); },
  "cyberpi.cyberpi_translate_to_some_language": async (self, c, b) => { self.noteOffline("translate"); return str(c, b.inputs["string_1"]); },
  "cyberpi.cyberpi_translate_to_some_language_2": async (self, c, b) => { self.noteOffline("translate"); return str(c, b.inputs["string_1"]); },
  "cyberpi.cyberpi_speech_recognition_with_time": async (self, c, b) => { self.noteOffline("speech recognition"); await c.sleep(await num(c, b.inputs["number_3"]) * 1000); },
  "cyberpi.cyberpi_speech_recognition_with_time_2": async (self, c, b) => { self.noteOffline("speech recognition"); await c.sleep(await num(c, b.inputs["number_3"]) * 1000); },
  "cyberpi.cyberpi_speech_recognition_with_time_3": async (self, c, b) => { self.noteOffline("speech recognition"); await c.sleep(await num(c, b.inputs["number_2"]) * 1000); },
  "cyberpi.cyberpi_speech_recognition_with_record": (self) => { self.noteOffline("speech recognition"); },
  "cyberpi.cyberpi_speech_recognition_with_record_2": (self) => { self.noteOffline("speech recognition"); },
  "cyberpi.cyberpi_speech_recognition_result": () => "",
  "cyberpi.cyberpi_ai_emotion": (self) => { self.noteOffline("AI emotion"); return ""; },
  "cyberpi.BLOCK_1599643085220": async (self, c, b) => { self.noteOffline("speech recognition"); await c.sleep(await num(c, b.inputs["number_3"]) * 1000); },

  // Internet: the time comes from this computer, weather and cloud need the internet.
  "cyberpi.cyberpi_get_time_from_internet": async (_, c, b) => timePart(toText(await arg(c, b, "fieldMenu_3"))),
  "cyberpi.cyberpi_get_local_time_from_internet": async (_, c, b) => timePart(toText(await arg(c, b, "fieldMenu_3"))),
  "cyberpi.cyberpi_cloud_get_time_data": async (_, c, b) => timePart(toText(await arg(c, b, "fieldMenu_1"))),
  "cyberpi.cyberpi_cloud_read_data": async (_, c, b) => timePart(toText(await arg(c, b, "fieldMenu_1"))),
  "cyberpi.cyberpi_get_weather_from_internet": (self) => { self.noteOffline("weather"); return 0; },
  "cyberpi.cyberpi_get_air_quality_from_internet": (self) => { self.noteOffline("air quality"); return 0; },
  "cyberpi.cyberpi_get_sun_time_from_internet": (self) => { self.noteOffline("sunrise/sunset"); return 0; },
  "cyberpi.cyberpi_set_cloud_broadcast": async (self, c, b) => self.lanRouter.broadcast(await str(c, b.inputs["message"])),
  "cyberpi.cyberpi_set_cloud_broadcast_with_value": async (self, c, b) => self.lanRouter.broadcast(await str(c, b.inputs["message"]), await c.decodeInput(b.inputs["value"])),
  "cyberpi.cyberpi_cloud_broadcast_get_value": async (self, c, b) => self.lanRouter.getValue(await str(c, b.inputs["message"])) ?? "",
  "cyberpi.cyberpi_when_cloud_broadcast": async (_, c, b) => toText(await c.decodeInput(b.inputs["message"])),
  "cyberpi.cyberpi_get_wifi_channel": (self) => self.lanChannel,
  "cyberpi.cyberpi_set_wifi_channel": (self) => { self.lanChannel = 6; },
  "cyberpi.cyberpi_mesh_create": noop,
  "cyberpi.cyberpi_mesh_join": noop,

  // Live-mode, competition and Python-only blocks have no effect on the robot itself.
  "cyberpi.cyberpi_makex_mode": noop,
  "cyberpi.cyberpi_follow_mblock_sprite": noop,
  "cyberpi.cyberpi_python_insert": noop,
  "cyberpi.cyberpi_upload_message": noop,

  // Util
  "cyberpi.cyberpi_operator_casts": async (_, c, b) => {
    const value = await c.decodeInput(b.inputs["string_2"]);
    switch (c.decodeField(b.fields["fieldMenu_1"])) {
      case "str": return toText(value);
      case "float": return toNumber(value);
      case "int": return Math.trunc(toNumber(value));
      case "bool": return toBoolean(value);
      default: return value;
    }
  },
};

// Older names of blocks that behave exactly like their newer versions.
const ALIASES: Record<string, string> = {
  "cyberpi.cyberpi_led_off": "cyberpi.cyberpi_led_off_2",
  "cyberpi.cyberpi_led_show_single_with_color": "cyberpi.cyberpi_led_show_single_with_color_2",
  "cyberpi.cyberpi_led_show_single_with_color_and_time": "cyberpi.cyberpi_led_show_single_with_color_and_time_2",
  "cyberpi.cyberpi_led_show_single_with_rgb": "cyberpi.cyberpi_led_show_single_with_rgb_2",
  "cyberpi.cyberpi_play_audio": "cyberpi.cyberpi_play_audio_3",
  "cyberpi.cyberpi_play_audio_2": "cyberpi.cyberpi_play_audio_3",
  "cyberpi.cyberpi_play_audio_until": "cyberpi.cyberpi_play_audio_until_3",
  "cyberpi.cyberpi_play_audio_until_2": "cyberpi.cyberpi_play_audio_until_3",
  "cyberpi.cyberpi_play_music_with_tone_and_note": "cyberpi.cyberpi_play_music_with_tone_and_note_2",
  "cyberpi.cyberpi_play_music_with_note_2": "cyberpi.cyberpi_play_music_with_note",
};
for (const [oldName, newName] of Object.entries(ALIASES)) CyberPIOps[oldName] = CyberPIOps[newName];

const CyberPIHats = [
  "cyberpi.cyberpi_when_cloud_broadcast",
  "cyberpi.cyberpi_when_launch",
  "cyberpi.cyberpi_when_button_press",
  "cyberpi.cyberpi_when_direction_key_press",
  "cyberpi.cyberpi_when_detect_action",
  "cyberpi.cyberpi_when_detect_attitude",
  "cyberpi.cyberpi_when_sensor_value_bigger_or_smaller_than",
  "cyberpi.cyberpi_wifi_broadcast_when_received_message"
];

const cyberPiOps = { ...StdOps, ...CyberPIOps };
const hats = [...StdHats, ...CyberPIHats];
export class CyberPI extends Std {
  public timerStart = performance.now();
  public readonly display = new Display();
  public readonly body: RobotBody;
  public yawOffset = 0;
  public loudness = 0;
  public brightness = 60;
  public readonly pressed = new Set<string>();
  public pressCounts: Record<string, number> = {};
  private sensorHatState = new Map<string, boolean>();
  public lanChannel = 6;
  /** Features that need the internet or the cloud, shown as a hint in the UI. */
  public readonly offlineFeatures = new Set<string>();

  public noteOffline(feature: string) {
    this.offlineFeatures.add(feature);
  }

  /** Airbrush speed: 0 draws instantly, otherwise roughly `speed` pixels per frame. */
  public async penDelay(c: Context, distance: number) {
    const speed = this.display.sprites.pen.speed;
    if (speed > 0) await c.sleep((Math.abs(distance) / speed) * 16);
  }

  public constructor(targetId: TargetId, lanRouter: LANRouter, name: string) {
    super(targetId, lanRouter, name);
    this.body = new RobotBody(name);
  }

  protected get ops(): Ops<any> {
    return cyberPiOps;
  }

  protected opcodeSupported(opcode: string): boolean {
    return opcode in this.ops;
  }

  protected isHat(opcode: string): boolean {
    return hats.includes(opcode);
  }

  public get yaw() {
    return Math.round(GYRO_Z_SIGN * (this.body.yawDeg - this.yawOffset) * 10) / 10;
  }

  public setLed(index: number, rgb: RGB) {
    this.body.leds[index] = [clamp(rgb[0], 0, 255), clamp(rgb[1], 0, 255), clamp(rgb[2], 0, 255)];
  }

  public isPressed(name: string) {
    if (name === "any") return ["up", "down", "left", "right", "middle"].some((d) => this.pressed.has(d));
    return this.pressed.has(name);
  }

  private pressListeners = new Set<(name: ButtonName | JoystickDirection) => void>();

  /** Notifies about button presses (the Python runner uses it for @event.is_press). */
  public onPress(listener: (name: ButtonName | JoystickDirection) => void) {
    this.pressListeners.add(listener);
    return () => { this.pressListeners.delete(listener); };
  }

  /** A button or joystick direction was pressed in the UI. */
  public press(name: ButtonName | JoystickDirection) {
    this.pressed.add(name);
    this.pressCounts[name] = (this.pressCounts[name] ?? 0) + 1;
    const hat = name === "a" || name === "b" ? "cyberpi.cyberpi_when_button_press" : "cyberpi.cyberpi_when_direction_key_press";
    this.runHatBlocks(hat, name);
    for (const listener of this.pressListeners) listener(name);
  }

  public release(name: ButtonName | JoystickDirection) {
    this.pressed.delete(name);
  }

  /** Resets the robot's state like a power cycle and runs "when CyberPi starts up". */
  public launch() {
    this.stopAll();
    this.resetDevice();
    this.activate();
  }

  public resetDevice() {
    this.resetData();
    this.display.reset();
    this.timerStart = performance.now();
    this.yawOffset = this.body.yawDeg;
    this.pressCounts = {};
    this.sensorHatState.clear();
    this.body.leds.forEach((_, i) => this.setLed(i, [0, 0, 0]));
    this.body.ledBrightness = 100;
    this.body.ultrasonicLeds.fill(0);
    this.body.fillLight = null;
    this.body.emotion = null;
  }

  public activate(): void {
    this.runHatBlocks("cyberpi.cyberpi_when_launch");
  }

  protected stopCustom(): void {
    speaker.stop();
  }

  /** Tilt in a direction in degrees (positive when leaning that way), from ramps. */
  public tilt(direction: string) {
    const d = direction.toLowerCase();
    const { pitchDeg, rollDeg } = this.body;
    let value = 0;
    if (d.includes("forward")) value = -pitchDeg;
    else if (d.includes("backward")) value = pitchDeg;
    else if (d.includes("left")) value = rollDeg;
    else if (d.includes("right")) value = -rollDeg;
    return Math.round(value * 10) / 10;
  }

  /** "Is CyberPi tilted forward / face up …?" (tilted means more than 15°). */
  public attitude(name: string) {
    const n = name.toLowerCase().replace(/^is_/, "");
    if (n.includes("faceup") || n.includes("face_up")) return true;
    if (n.includes("facedown") || n.includes("face_down") || n.includes("stand")) return false;
    if (n.includes("forward") || n.includes("backward") || n.includes("left") || n.includes("right")) return this.tilt(n) >= 15;
    return false;
  }

  /** Called by the simulation loop; fires sensor-threshold hats. */
  public tick() {
    // "When CyberPi is tilted …": fire each time the tilt starts.
    for (const { id, option } of this.hatBlocksByEvent["cyberpi.cyberpi_when_detect_attitude"] ?? []) {
      const active = this.attitude(String(option));
      if (active && !this.sensorHatState.get(id)) this.startHat(id);
      this.sensorHatState.set(id, active);
    }
    const hatBlocks = this.hatBlocksByEvent["cyberpi.cyberpi_when_sensor_value_bigger_or_smaller_than"];
    if (!hatBlocks) return;
    for (const { id } of hatBlocks) {
      const block = this.getBlock(id);
      const sensor = toText(this.defaultContext.decodeField(block.fields["fieldMenu_2"])).toLowerCase();
      const operator = toText(this.defaultContext.decodeField(block.fields["fieldMenu_3"]));
      const threshold = block.inputs["number_3"]?.[1];
      const limit = toNumber(Array.isArray(threshold) ? threshold[1] : threshold);
      let value = 0;
      if (sensor.includes("timer")) value = (performance.now() - this.timerStart) / 1000;
      else if (sensor.includes("loud") || sensor.includes("micro") || sensor.includes("sound")) value = this.loudness;
      else value = this.brightness;
      const active = operator.includes("<") || operator.includes("less") ? compare(value, limit) < 0 : compare(value, limit) > 0;
      // Fire once each time the condition becomes true.
      if (active && !this.sensorHatState.get(id)) this.startHat(id);
      this.sensorHatState.set(id, active);
    }
  }
}
