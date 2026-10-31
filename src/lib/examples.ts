// Example programs, written in mBlock's own project format so they run through
// exactly the same code path as an uploaded .mblock file.

type Json = { [key: string]: any; };

class ProgramBuilder {
  public readonly blocks: Json = {};
  public readonly variables: Json = {};
  private n = 0;

  private id() {
    return `ex${++this.n}`;
  }

  public variable(name: string) {
    const id = `var_${name}`;
    this.variables[id] = [name, 0];
    return { name, id };
  }

  public block(opcode: string, inputs: Json = {}, fields: Json = {}, extra: Json = {}): string {
    const id = this.id();
    this.blocks[id] = { opcode, next: null, parent: null, inputs, fields, shadow: false, topLevel: false, ...extra };
    for (const input of Object.values(inputs) as any[]) {
      if (typeof input[1] === "string" && this.blocks[input[1]]) this.blocks[input[1]].parent = id;
    }
    return id;
  }

  /** A dropdown shadow block, used as an input. */
  public menu(opcode: string, field: string, value: string) {
    const id = this.id();
    this.blocks[id] = { opcode, next: null, parent: null, inputs: {}, fields: { [field]: [value, null] }, shadow: true, topLevel: false };
    return [1, id];
  }

  /** Chains blocks so each runs after the previous; returns the first. */
  public stack(...ids: string[]) {
    for (let i = 0; i < ids.length - 1; i++) {
      this.blocks[ids[i]].next = ids[i + 1];
      this.blocks[ids[i + 1]].parent = ids[i];
    }
    return ids[0];
  }

  public script(hat: string, ...body: string[]) {
    this.blocks[hat].topLevel = true;
    this.blocks[hat].x = 0;
    this.blocks[hat].y = 0;
    return this.stack(hat, ...body);
  }

  public substack(...body: string[]) {
    return [2, this.stack(...body)];
  }

  public project(loadedExtIds: string[]) {
    return {
      targets: [
        { isStage: true, name: "Stage", variables: this.variables, lists: {}, broadcasts: {}, blocks: {} },
        { isStage: false, name: "cyberpi", deviceId: "cyberpi", loadedExtIds, variables: {}, lists: {}, broadcasts: {}, blocks: this.blocks },
      ],
    };
  }
}

const num = (v: number | string) => [1, [4, String(v)]];
const text = (v: string) => [1, [10, v]];
const reporter = (id: string) => [3, id, [4, ""]];
const varIn = (v: { name: string, id: string; }) => [3, [12, v.name, v.id], [4, ""]];

function buttonHat(p: ProgramBuilder, button: "a" | "b") {
  return p.block("cyberpi.cyberpi_when_button_press", {}, { fieldMenu_2: [button, null] });
}

function println(p: ProgramBuilder, message: string) {
  return p.block("cyberpi.cyberpi_display_println", { string_2: text(message) });
}

function lineFollower() {
  const p = new ProgramBuilder();
  const base = p.variable("base_power");
  const kp = p.variable("kp");
  const offset = p.variable("offset");

  p.script(
    p.block("cyberpi.cyberpi_when_launch"),
    p.block("cyberpi.cyberpi_display_clear"),
    println(p, "Line follower"),
    println(p, "A = go, B = stop"),
  );

  const offTrack = p.block("mbuild_quad_color_sensor.mbuild_quad_color_sensor_get_off_track", {
    index: p.menu("mbuild_quad_color_sensor.mbuild_quad_color_sensor_get_off_track_index_menu", "mbuild_quad_color_sensor.mbuild_quad_color_sensor_get_off_track_index_menu_option", "1"),
  });
  const correctionL = p.block("operator_multiply", { NUM1: varIn(kp), NUM2: varIn(offset) });
  const left = p.block("operator_subtract", { NUM1: varIn(base), NUM2: reporter(correctionL) });
  const correctionR = p.block("operator_multiply", { NUM1: varIn(kp), NUM2: varIn(offset) });
  const sum = p.block("operator_add", { NUM1: varIn(base), NUM2: reporter(correctionR) });
  const right = p.block("operator_multiply", { NUM1: num(-1), NUM2: reporter(sum) });

  const loop = p.block("control_forever", {
    SUBSTACK: p.substack(
      p.block("data_setvariableto", { VALUE: reporter(offTrack) }, { VARIABLE: [offset.name, offset.id] }),
      p.block("mbot2.mbot2_encoder_motor_drive_power", { LEFT_POWER: reporter(left), number_2: reporter(right) }),
    ),
  });
  p.script(
    buttonHat(p, "a"),
    p.block("control_stop", {}, { STOP_OPTION: ["other scripts in sprite", null] }, { mutation: { tagName: "mutation", children: [], hasnext: "true" } }),
    p.block("data_setvariableto", { VALUE: text("30") }, { VARIABLE: [base.name, base.id] }),
    p.block("data_setvariableto", { VALUE: text("0.8") }, { VARIABLE: [kp.name, kp.id] }),
    loop,
  );
  p.script(
    buttonHat(p, "b"),
    p.block("control_stop", {}, { STOP_OPTION: ["other scripts in sprite", null] }, { mutation: { tagName: "mutation", children: [], hasnext: "true" } }),
    p.block("mbot2.mbot2_encoder_motor_drive_power", { LEFT_POWER: num(0), number_2: num(0) }),
  );
  return p.project(["mbot2", "mbuild_quad_color_sensor"]);
}

function obstacleAvoider() {
  const p = new ProgramBuilder();
  p.script(
    p.block("cyberpi.cyberpi_when_launch"),
    println(p, "Obstacle avoider"),
    println(p, "A = go, B = stop"),
  );
  const distance = () => p.block("cyberpi_mbuild_ultrasonic2.mbuild_ultrasonic2_get_distance", {
    index: p.menu("cyberpi_mbuild_ultrasonic2.mbuild_ultrasonic2_get_distance_index_menu", "MBUILD_ULTRASONIC2_GET_DISTANCE_INDEX", "1"),
  });
  const tooClose = p.block("operator_lt", { OPERAND1: reporter(distance()), OPERAND2: num(20) });
  const ledMenu = () => p.menu("cyberpi.cyberpi_led_show_single_with_color_2_fieldMenu_1_menu", "fieldMenu_1", "all");
  const ifElse = p.block("control_if_else", {
    CONDITION: [2, tooClose],
    SUBSTACK: p.substack(
      p.block("cyberpi.cyberpi_led_show_single_with_color_2", { fieldMenu_1: ledMenu(), color_1: [1, [9, "#ff0000"]] }),
      p.block("mbot2.mbot2_encoder_motor_stop", {}, { fieldMenu_1: ["ALL", null] }),
      p.block("cyberpi.cyberpi_play_buzzer_tone_with_time", { number_1: num(700), number_2: num(0.2) }),
      p.block("mbot2.mbot2_cw_and_ccw_with_angle", { ANGLE: num(90) }, { fieldMenu_1: ["cw", null] }),
    ),
    SUBSTACK2: p.substack(
      p.block("cyberpi.cyberpi_led_show_single_with_color_2", { fieldMenu_1: ledMenu(), color_1: [1, [9, "#00ff00"]] }),
      p.block("mbot2.mbot2_move_direction_with_rpm", { POWER: num(60) }, { DIRECTION: ["forward", null] }),
    ),
  });
  p.script(
    buttonHat(p, "a"),
    p.block("control_forever", { SUBSTACK: p.substack(ifElse) }),
  );
  p.script(
    buttonHat(p, "b"),
    p.block("control_stop", {}, { STOP_OPTION: ["other scripts in sprite", null] }, { mutation: { tagName: "mutation", children: [], hasnext: "true" } }),
    p.block("mbot2.mbot2_encoder_motor_stop", {}, { fieldMenu_1: ["ALL", null] }),
    p.block("cyberpi.cyberpi_led_off_2", { fieldMenu_1: p.menu("cyberpi.cyberpi_led_off_2_fieldMenu_1_menu", "fieldMenu_1", "all") }),
  );
  return p.project(["mbot2", "cyberpi_mbuild_ultrasonic2"]);
}

function squareDance() {
  const p = new ProgramBuilder();
  const side = () => p.stack(
    p.block("mbot2.mbot2_move_straight_with_cm_and_inch", { POWER: num(40) }, { DIRECTION: ["forward", null], fieldMenu_3: ["cm", null] }),
    p.block("cyberpi.cyberpi_play_music_with_tone_and_note_2", {
      number_1: p.menu("cyberpi.cyberpi_play_music_with_tone_and_note_2_number_1_menu", "NOTE", "72"),
      number_2: num(0.25),
    }),
    p.block("mbot2.mbot2_cw_and_ccw_with_angle", { ANGLE: num(90) }, { fieldMenu_1: ["cw", null] }),
  );
  p.script(
    p.block("cyberpi.cyberpi_when_launch"),
    println(p, "Square dance!"),
    println(p, "Press A"),
  );
  p.script(
    buttonHat(p, "a"),
    p.block("cyberpi.cyberpi_show_led", {}, { ledRing: ["13456", null] }),
    p.block("control_repeat", { TIMES: num(4), SUBSTACK: p.substack(side()) }),
    p.block("cyberpi.cyberpi_play_led_animation_until", {}, { LED_animation: ["rainbow", null] }),
    println(p, "Done!"),
  );
  return p.project(["mbot2"]);
}

export const EXAMPLES = [
  { id: "line", name: "Line follower (Kp)", mapId: "oval", build: lineFollower },
  { id: "avoid", name: "Obstacle avoider", mapId: "arena", build: obstacleAvoider },
  { id: "square", name: "Square dance", mapId: "free", build: squareDance },
];
