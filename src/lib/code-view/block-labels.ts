// How each block is shown in the code view: its text (with {INPUT} / {FIELD}
// placeholders), its category colour and its shape.

export type Shape = "hat" | "stack" | "c" | "cap" | "reporter" | "boolean";

export type Category = { name: string, color: string, border: string; };

export const CATEGORIES: Record<string, Category> = {
  events: { name: "Events", color: "#ffbf00", border: "#cc9900" },
  control: { name: "Control", color: "#ffab19", border: "#cf8b17" },
  operators: { name: "Operators", color: "#59c059", border: "#389438" },
  variables: { name: "Variables", color: "#ff8c1a", border: "#db6e00" },
  lists: { name: "Lists", color: "#ff661a", border: "#e64d00" },
  myblocks: { name: "My Blocks", color: "#ff6680", border: "#ff3355" },
  audio: { name: "Audio", color: "#d65cd6", border: "#bd42bd" },
  lighting: { name: "Lighting", color: "#e5487a", border: "#c22e5e" },
  display: { name: "Display", color: "#8a55d7", border: "#6b3fb6" },
  sensing: { name: "Sensing", color: "#3eb4e0", border: "#2a92ba" },
  network: { name: "Network", color: "#2bb3a0", border: "#1d8c7c" },
  chassis: { name: "Chassis", color: "#4c97ff", border: "#3373cc" },
  quad: { name: "Quad RGB Sensor", color: "#14a99a", border: "#0d8075" },
  ultrasonic: { name: "Ultrasonic Sensor 2", color: "#20b573", border: "#178a57" },
  extension: { name: "Extension", color: "#7a8fa6", border: "#5d7085" },
};

const L = (text: string) => text;

/** Block text templates. `{NAME}` shows the input or field with that name. */
export const LABELS: Record<string, string> = {
  // Events
  "cyberpi.cyberpi_when_launch": L("when CyberPi starts up"),
  "cyberpi.cyberpi_when_button_press": L("when button {fieldMenu_2} is pressed"),
  "cyberpi.cyberpi_when_direction_key_press": L("when joystick is pushed {fieldMenu_2}"),
  "cyberpi.cyberpi_when_detect_action": L("when CyberPi is {tilt}"),
  "cyberpi.cyberpi_when_detect_attitude": L("when CyberPi is {tilt}"),
  "cyberpi.cyberpi_when_sensor_value_bigger_or_smaller_than": L("when {fieldMenu_2} {fieldMenu_3} {number_3}"),
  "cyberpi.cyberpi_wifi_broadcast_when_received_message": L("when I receive LAN message {message}"),
  "cyberpi.cyberpi_when_cloud_broadcast": L("when I receive cloud message {message}"),
  event_whenbroadcastreceived: L("when I receive {BROADCAST_OPTION}"),
  event_broadcast: L("broadcast {BROADCAST_INPUT}"),
  event_broadcastandwait: L("broadcast {BROADCAST_INPUT} and wait"),

  // Control
  control_wait: L("wait {DURATION} seconds"),
  control_repeat: L("repeat {TIMES}"),
  control_forever: L("forever"),
  control_if: L("if {CONDITION} then"),
  control_if_else: L("if {CONDITION} then"),
  control_wait_until: L("wait until {CONDITION}"),
  control_repeat_until: L("repeat until {CONDITION}"),
  control_while: L("while {CONDITION}"),
  control_stop: L("stop {STOP_OPTION}"),
  "cyberpi.cyberpi_restart": L("restart CyberPi"),

  // Operators
  operator_add: L("{NUM1} + {NUM2}"),
  operator_subtract: L("{NUM1} - {NUM2}"),
  operator_multiply: L("{NUM1} * {NUM2}"),
  operator_divide: L("{NUM1} / {NUM2}"),
  operator_random: L("pick random {FROM} to {TO}"),
  operator_gt: L("{OPERAND1} > {OPERAND2}"),
  operator_lt: L("{OPERAND1} < {OPERAND2}"),
  operator_equals: L("{OPERAND1} = {OPERAND2}"),
  operator_and: L("{OPERAND1} and {OPERAND2}"),
  operator_or: L("{OPERAND1} or {OPERAND2}"),
  operator_not: L("not {OPERAND}"),
  operator_join: L("join {STRING1} {STRING2}"),
  operator_letter_of: L("letter {LETTER} of {STRING}"),
  operator_length: L("length of {STRING}"),
  operator_contains: L("{STRING1} contains {STRING2} ?"),
  operator_mod: L("{NUM1} mod {NUM2}"),
  operator_round: L("round {NUM}"),
  operator_mathop: L("{OPERATOR} of {NUM}"),
  "cyberpi.cyberpi_operator_casts": L("convert {string_2} to {fieldMenu_1}"),

  // Variables and lists
  data_variable: L("{VARIABLE}"),
  data_setvariableto: L("set {VARIABLE} to {VALUE}"),
  data_changevariableby: L("change {VARIABLE} by {VALUE}"),
  data_showvariable: L("show variable {VARIABLE}"),
  data_hidevariable: L("hide variable {VARIABLE}"),
  data_listcontents: L("{LIST}"),
  data_addtolist: L("add {ITEM} to {LIST}"),
  data_deleteoflist: L("delete {INDEX} of {LIST}"),
  data_deletealloflist: L("delete all of {LIST}"),
  data_insertatlist: L("insert {ITEM} at {INDEX} of {LIST}"),
  data_replaceitemoflist: L("replace item {INDEX} of {LIST} with {ITEM}"),
  data_itemoflist: L("item {INDEX} of {LIST}"),
  data_itemnumoflist: L("item # of {ITEM} in {LIST}"),
  data_lengthoflist: L("length of {LIST}"),
  data_listcontainsitem: L("{LIST} contains {ITEM} ?"),
  data_showlist: L("show list {LIST}"),
  data_hidelist: L("hide list {LIST}"),

  // Audio
  "cyberpi.cyberpi_play_audio_3": L("play {file_name}"),
  "cyberpi.cyberpi_play_audio_until_3": L("play {file_name} until done"),
  "cyberpi.cyberpi_play_music_with_note": L("play {fieldMenu_1} for {number_3} beats"),
  "cyberpi.cyberpi_play_music_with_tone_and_note_2": L("play note {number_1} for {number_2} beats"),
  "cyberpi.cyberpi_play_buzzer_tone": L("play sound at {number_2} Hz"),
  "cyberpi.cyberpi_play_buzzer_tone_with_time": L("play sound at {number_1} Hz for {number_2} secs"),
  "cyberpi.cyberpi_stop_audio": L("stop all sounds"),
  "cyberpi.cyberpi_set_volume": L("set volume to {number_1} %"),
  "cyberpi.cyberpi_add_volume": L("change volume by {number_1} %"),
  "cyberpi.cyberpi_get_volume": L("volume (%)"),
  "cyberpi.cyberpi_set_audio_speed": L("set speed to {number_1} %"),
  "cyberpi.cyberpi_add_audio_speed": L("change speed by {number_1} %"),
  "cyberpi.cyberpi_get_audio_speed": L("speed (%)"),
  "cyberpi.cyberpi_start_record": L("start recording"),
  "cyberpi.cyberpi_stop_record": L("stop recording"),
  "cyberpi.cyberpi_play_record": L("play recording"),
  "cyberpi.cyberpi_play_record_until": L("play recording until done"),
  "cyberpi.cyberpi_speak_with_some_language_3": L("speak {fieldMenu_1} {string_2}"),

  // Lighting
  "cyberpi.cyberpi_show_led": L("show LEDs {ledRing}"),
  "cyberpi.cyberpi_led_show_single_with_color_2": L("LED {fieldMenu_1} shows {color_1}"),
  "cyberpi.cyberpi_led_show_single_with_color_and_time_2": L("LED {fieldMenu_1} shows {color_1} for {number_3} secs"),
  "cyberpi.cyberpi_led_show_single_with_rgb_2": L("LED {fieldMenu_1} shows R {r} G {g} B {b}"),
  "cyberpi.cyberpi_led_show_single_with_rgb_and_time": L("LED {fieldMenu_1} shows R {r} G {g} B {b} for {number_5} secs"),
  "cyberpi.cyberpi_led_off_2": L("turn off LED {fieldMenu_1}"),
  "cyberpi.cyberpi_move_led": L("roll LEDs right by {led_number}"),
  "cyberpi.cyberpi_play_led_animation_until": L("play LED animation {LED_animation} until done"),
  "cyberpi.cyberpi_set_led_brightness": L("set LED brightness to {number_1} %"),
  "cyberpi.cyberpi_add_led_brightness": L("change LED brightness by {number_1} %"),
  "cyberpi.cyberpi_get_led_brightness": L("LED brightness (%)"),

  // Display
  "cyberpi.cyberpi_display_println": L("print {string_2} and move to a new line"),
  "cyberpi.cyberpi_display_print": L("print {string_2}"),
  "cyberpi.cyberpi_display_clear": L("clear screen"),
  "cyberpi.cyberpi_console_set_font": L("set print size to {inputMenu_1}"),
  "cyberpi.cyberpi_display_set_brush_with_color": L("set brush color {color_1}"),
  "cyberpi.cyberpi_display_set_brush_with_r_g_b": L("set brush color R {number_1} G {number_2} B {number_3}"),
  "cyberpi.cyberpi_display_label_show_at_somewhere_with_size": L("show label {fieldMenu_1} {string_2} at {fieldMenu_2} size {inputMenu_4}"),
  "cyberpi.cyberpi_display_label_show_label_xy_with_size": L("show label {fieldMenu_1} {string_2} at x {number_2} y {number_3} size {inputMenu_4}"),
  "cyberpi.cyberpi_display_line_chart_add_data": L("line chart: add {number_1}"),
  "cyberpi.cyberpi_display_line_chart_set_interval": L("line chart: spacing {number_3} px"),
  "cyberpi.cyberpi_display_bar_chart_add_data": L("bar chart: add {number_1}"),
  "cyberpi.cyberpi_display_table_add_data_at_row_column_2": L("table: put {string_3} at row {fieldMenu_1} column {fieldMenu_2}"),
  "cyberpi.cyberpi_display_rotate_to_2": L("rotate screen to {fieldMenu_1}"),
  "cyberpi.cyberpi_display_set_chart_name": L("chart title {string_1}"),
  "cyberpi.cyberpi_display_clear_chart": L("clear chart data"),
  "cyberpi.cyberpi_sprite_draw_text": L("make sprite {string_1} from text {string_2}"),
  "cyberpi.cyberpi_sprite_draw_pixel_with_icon": L("make sprite {string_1} from icon {inputMenu_2}"),
  "cyberpi.cyberpi_sprite_draw_pixel_with_matrix16": L("make sprite {string_1} from pixels {facePanel_2}"),
  "cyberpi.cyberpi_sprite_draw_sketch": L("make sprite {string_1} from doodle"),
  "cyberpi.cyberpi_sprite_delete": L("delete sprite {string_1}"),
  "cyberpi.cyberpi_sprite_show_and_hide": L("{string_1} sprite {inputVariable_2}"),
  "cyberpi.cyberpi_sprite_move_to": L("sprite {string_1} go to x {number_2} y {number_3}"),
  "cyberpi.cyberpi_sprite_move_x_and_y": L("sprite {string_1} move {fieldMenu_2} {number_3} px"),
  "cyberpi.cyberpi_sprite_move_random": L("sprite {string_1} go to random position"),
  "cyberpi.cyberpi_sprite_rotate": L("sprite {string_1} turn {number_2}°"),
  "cyberpi.cyberpi_sprite_rotate_to": L("sprite {string_1} point in direction {number_2}"),
  "cyberpi.cyberpi_sprite_set_size": L("set sprite {string_1} size to {number_2} %"),
  "cyberpi.cyberpi_sprite_add_size": L("change sprite {string_1} size by {number_2} %"),
  "cyberpi.cyberpi_sprite_set_color_with_color": L("set sprite {string_1} color {number_2}"),
  "cyberpi.cyberpi_sprite_set_color_with_rgb": L("set sprite {string_1} color R {number_2} G {number_3} B {number_4}"),
  "cyberpi.cyberpi_sprite_close_color": L("reset sprite {string_1} color"),
  "cyberpi.cyberpi_sprite_set_align": L("set sprite {string_1} anchor {inputMenu_2}"),
  "cyberpi.cyberpi_mirror_with_axis": L("flip sprite {string_1} {fieldMenu_3}"),
  "cyberpi.cyberpi_sprite_z_max_and_min": L("sprite {string_1} go to {fieldMenu_2} layer"),
  "cyberpi.cyberpi_sprite_z_up_and_down": L("sprite {string_1} go {fieldMenu_2} {number_3} layers"),
  "cyberpi.cyberpi_sprite_get_x_y_rotation_size_align": L("{fieldMenu_2} of sprite {string_1}"),
  "cyberpi.cyberpi_sprite_is_touch_edge": L("sprite {string_1} touching edge?"),
  "cyberpi.cyberpi_sprite_is_touch_other_sprite": L("sprite {string_1} touching sprite {string_2}?"),
  "cyberpi.cyberpi_sprite_background_fill_with_color": L("set backdrop color {color_1}"),
  "cyberpi.cyberpi_sprite_background_fill_with_rgb": L("set backdrop R {number_1} G {number_2} B {number_3}"),
  "cyberpi.cyberpi_screen_render": L("refresh screen"),
  "cyberpi.cyberpi_screen_inable_and_disable_auto_render": L("auto refresh {fieldMenu_1}"),
  "cyberpi.cyberpi_screen_get_color_equal_with_color": L("color at x {number_2} y {number_3} is {color_4}?"),
  "cyberpi.cyberpi_screen_get_color_equal_with_rgb": L("color at x {number_2} y {number_3} is R {number_4} G {number_5} B {number_6}?"),
  "cyberpi.cyberpi_sketch_start": L("start doodle"),
  "cyberpi.cyberpi_sketch_end": L("finish doodle"),
  "cyberpi.cyberpi_sketch_clear": L("clear doodle"),
  "cyberpi.cyberpi_sketch_move": L("airbrush move {number_1} px"),
  "cyberpi.cyberpi_sketch_move_x_and_y": L("airbrush move {fieldMenu_1} {number_1} px"),
  "cyberpi.cyberpi_sketch_move_to": L("airbrush go to x {number_1} y {number_2}"),
  "cyberpi.cyberpi_sketch_move_to_center": L("airbrush go to center"),
  "cyberpi.cyberpi_sketch_cw": L("airbrush turn {number_1}° clockwise"),
  "cyberpi.cyberpi_sketch_set_angle_2": L("airbrush point in direction {angle_1}"),
  "cyberpi.cyberpi_sketch_circle": L("airbrush arc {number_2}° radius {number_1}"),
  "cyberpi.cyberpi_sketch_set_color_with_color": L("set airbrush color {color_1}"),
  "cyberpi.cyberpi_sketch_set_size": L("set doodle thickness {number_1} px"),
  "cyberpi.cyberpi_sketch_set_speed": L("set doodle speed {number_1}"),

  // Sensing
  "cyberpi.cyberpi_button_press": L("button {fieldMenu_1} pressed?"),
  "cyberpi.cyberpi_button_count": L("button {fieldMenu_1} press count"),
  "cyberpi.cyberpi_button_count_reset": L("reset button {fieldMenu_1} count"),
  "cyberpi.cyberpi_direction_key_press": L("joystick pushed {fieldMenu_1}?"),
  "cyberpi.cyberpi_direction_key_count": L("joystick {fieldMenu_1} count"),
  "cyberpi.cyberpi_direction_key_count_reset": L("reset joystick {fieldMenu_1} count"),
  "cyberpi.cyberpi_timer_get": L("timer"),
  "cyberpi.cyberpi_timer_reset": L("reset timer"),
  "cyberpi.cyberpi_loudness": L("loudness"),
  "cyberpi.cyberpi_brightness": L("light intensity"),
  "cyberpi.cyberpi_tilt_degree": L("tilt {rotation} angle (°)"),
  "cyberpi.cyberpi_axis_rotation_angle": L("rotated angle around {axis} (°)"),
  "cyberpi.cyberpi_axis_angle_speed": L("angular speed around {axis} (°/s)"),
  "cyberpi.cyberpi_axis_acceleration": L("acceleration {axis} (m/s²)"),
  "cyberpi.cyberpi_reset_axis_rotation_angle": L("reset rotated angle around {axis}"),
  "cyberpi.cyberpi_reset_yaw": L("reset yaw"),
  "cyberpi.cyberpi_detect_attitude": L("{tilt}?"),
  "cyberpi.cyberpi_detect_action": L("{tilt} detected?"),
  "cyberpi.cyberpi_shaked_value": L("shaking strength"),
  "cyberpi.cyberpi_wave_angle": L("waving angle"),
  "cyberpi.cyberpi_wave_speed": L("waving speed"),
  "cyberpi.cyberpi_battery_macaddress_blename_and_so_on": L("{fieldMenu_1}"),
  "cyberpi.cyberpi_name": L("CyberPi name"),

  // Network
  "cyberpi.cyberpi_set_wifi_broadcast": L("broadcast {message} on LAN"),
  "cyberpi.cyberpi_set_wifi_broadcast_with_value": L("broadcast {message} with value {value} on LAN"),
  "cyberpi.cyberpi_wifi_broadcast_get_value": L("LAN message {message} value"),
  "cyberpi.cyberpi_set_wifi_channels": L("set LAN channel to {channel}"),
  "cyberpi.cyberpi_wifi_set": L("connect to Wi-Fi {ssid}"),
  "cyberpi.cyberpi_wifi_is_connect": L("Wi-Fi connected?"),

  // Chassis
  "mbot2.mbot2_move_direction_with_rpm": L("{DIRECTION} at {POWER} RPM"),
  "mbot2.mbot2_move_direction_with_time": L("{DIRECTION} at {POWER} RPM for {TIME} secs"),
  "mbot2.mbot2_move_straight_with_cm_and_inch": L("{DIRECTION} {POWER} {fieldMenu_3} until done"),
  "mbot2.mbot2_cw_and_ccw_with_angle": L("{fieldMenu_1} {ANGLE}° until done"),
  "mbot2.mbot2_encoder_motor_drive_power": L("EM1 power {LEFT_POWER} %, EM2 power {number_2} %"),
  "mbot2.mbot2_encoder_motor_drive_speed2": L("EM1 at {LEFT_POWER} RPM, EM2 at {RIGHT_POWER} RPM"),
  "mbot2.mbot2_encoder_motor_drive_speed": L("EM1 at {LEFT_POWER} RPM, EM2 at {number_2} RPM"),
  "mbot2.mbot2_encoder_motor_drive": L("left wheel {LEFT_POWER} RPM, right wheel {number_2} RPM"),
  "mbot2.mbot2_encoder_motor_set": L("encoder motor {inputMenu_1} turns at {LEFT_POWER} {fieldMenu_4}"),
  "mbot2.mbot2_encoder_motor_set_with_time": L("encoder motor {fieldMenu_1} turns at {LEFT_POWER} {fieldMenu_4} for {number_3} secs"),
  "mbot2.mbot2_encoder_motor_set_with_time_angle_and_circle": L("encoder motor {fieldMenu_1} turns {LEFT_POWER}°"),
  "mbot2.mbot2_encoder_motor_stop": L("stop encoder motor {fieldMenu_1}"),
  "mbot2.mbot2_encoder_motor_reset_angle": L("reset angle of encoder motor {inputMenu_1}"),
  "mbot2.mbot2_encoder_motor_lock_and_unlock": L("encoder motor {inputMenu_1} lock {fieldMenu_2}"),
  "mbot2.mbot2_encoder_motor_get_speed": L("encoder motor {inputMenu_2} {fieldMenu_3}"),
  "mbot2.mbot2_encoder_motor_get_angle": L("encoder motor {inputMenu_1} angle (°)"),
  "mbot2.mbot2_set_para": L("{PARA} chassis parameters"),

  // Quad RGB sensor
  "mbuild_quad_color_sensor.mbuild_quad_color_sensor_get_off_track": L("quad RGB {index} deviation (-100~100)"),
  "mbuild_quad_color_sensor.mbuild_quad_color_sensor_get_rgb_gray_light": L("quad RGB {index} probe {inputMenu_2} {inputMenu_3}"),
  "mbuild_quad_color_sensor.mbuild_quad_color_sensor_is_color": L("quad RGB {index} probe {inputMenu_2} sees {inputMenu_3}?"),
  "mbuild_quad_color_sensor.mbuild_quad_color_sensor_is_line_and_background": L("quad RGB {index} probe {inputMenu_2} sees {inputMenu_3}?"),
  "mbuild_quad_color_sensor.mbuild_quad_color_sensor_get_line_sta_with_number": L("quad RGB {index} line status (0~15)"),
  "mbuild_quad_color_sensor.mbuild_quad_color_sensor_get_line_sta_with_inputMenu": L("quad RGB {index} line status is {inputMenu_2}?"),
  "mbuild_quad_color_sensor.mbuild_quad_color_sensor_get_sta_with_inputMenu": L("quad RGB {index} L1 R1 {inputMenu_1} status is {inputMenu_2}?"),
  "mbuild_quad_color_sensor.BLOCK_1618397452023": L("quad RGB {index} L1 R1 {inputMenu_1} status is {inputMenu_2}?"),
  "mbuild_quad_color_sensor.BLOCK_1618364921511": L("quad RGB {index} {inputMenu_1} status is {inputMenu_2}?"),
  "mbuild_quad_color_sensor.BLOCK_1617079703409": L("quad RGB {index} L1 R1 line status is {inputMenu_2}?"),
  "mbuild_quad_color_sensor.BLOCK_1618397596925": L("quad RGB {index} L1 R1 {inputMenu_1} status (0~3)"),
  "mbuild_quad_color_sensor.BLOCK_1618397679204": L("quad RGB {index} {inputMenu_1} status (0~15)"),
  "mbuild_quad_color_sensor.BLOCK_1619088858273": L("quad RGB {index} probe {channel} sees R {r} G {g} B {b} ± {tolerance}?"),
  "mbuild_quad_color_sensor.BLOCK_1618382823173": L("quad RGB {index} fill light {fieldMenu_3}"),
  "mbuild_quad_color_sensor.mbuild_quad_color_sensor_set_led": L("quad RGB {index} fill light {fieldMenu_3}"),
  "mbuild_quad_color_sensor.BLOCK_1620904215289": L("quad RGB {index} fill light off"),
  "mbuild_quad_color_sensor.mbuild_quad_color_sensor_off_led": L("quad RGB {index} fill light off"),
  "mbuild_quad_color_sensor.BLOCK_1626250042594": L("quad RGB {index} custom color R {r} G {g} B {b} ± {tolerance}"),
  "mbuild_quad_color_sensor.BLOCK_1663048571053": L("quad RGB {index} calibrate"),
  "mbuild_quad_color_sensor.BLOCK_1663048571165": L("color detection mode {mode}"),

  // Ultrasonic sensor 2
  "cyberpi_mbuild_ultrasonic2.mbuild_ultrasonic2_get_distance": L("ultrasonic {index} distance (cm)"),
  "cyberpi_mbuild_ultrasonic2.mbuild_ultrasonic2_out_of_range": L("ultrasonic {index} out of range?"),
  "cyberpi_mbuild_ultrasonic2.mbuild_ultrasonic2_set_bri": L("ultrasonic {index} light {order} brightness {bv} %"),
  "cyberpi_mbuild_ultrasonic2.mbuild_ultrasonic2_add_bri": L("ultrasonic {index} light {order} brightness + {bv} %"),
  "cyberpi_mbuild_ultrasonic2.mbuild_ultrasonic2_get_bri": L("ultrasonic {index} light {order} brightness"),
  "cyberpi_mbuild_ultrasonic2.mbuild_ultrasonic2_off_led": L("ultrasonic {index} light {inputMenu_3} off"),
  "cyberpi_mbuild_ultrasonic2.mbuild_ultrasonic2_show_emotion": L("ultrasonic {index} shows {emotion}"),
  "cyberpi_mbuild_ultrasonic2.mbuild_ultrasonic2_show_one_by_one": L("ultrasonic {index} lights {bv1} {bv2} {bv3} {bv4} {bv5} {bv6} {bv7} {bv8}"),
};

// Older block names (files saved by earlier mBlock versions) look like their newer versions.
const OLD_NAMES: Record<string, string> = {
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
  "cyberpi.cyberpi_display_rotate_to": "cyberpi.cyberpi_display_rotate_to_2",
  "cyberpi.cyberpi_display_table_add_data_at_row_column": "cyberpi.cyberpi_display_table_add_data_at_row_column_2",
  "cyberpi.cyberpi_speak_with_some_language": "cyberpi.cyberpi_speak_with_some_language_3",
  "cyberpi.cyberpi_speak_with_some_language_2": "cyberpi.cyberpi_speak_with_some_language_3",
  "cyberpi.cyberpi_sketch_set_angle": "cyberpi.cyberpi_sketch_set_angle_2",
  "mbot2.BLOCK_1618991049674": "mbot2.mbot2_encoder_motor_drive_speed2",
  "cyberpi_mbuild_ultrasonic2.BLOCK_1552140890585": "cyberpi_mbuild_ultrasonic2.mbuild_ultrasonic2_get_distance",
  "cyberpi_mbuild_ultrasonic2.BLOCK_1552140919772": "cyberpi_mbuild_ultrasonic2.mbuild_ultrasonic2_out_of_range",
};
for (const [oldName, newName] of Object.entries(OLD_NAMES)) LABELS[oldName] = LABELS[newName];
LABELS["cyberpi.cyberpi_sketch_set_angle"] = "airbrush point in direction {number_1}";

const BOOLEAN_OPCODES = new Set([
  "operator_gt", "operator_lt", "operator_equals", "operator_and", "operator_or", "operator_not", "operator_contains",
  "data_listcontainsitem",
]);

export function categoryOf(opcode: string): Category {
  const o = opcode;
  if (o.startsWith("event_") || o.includes("_when_")) return CATEGORIES.events;
  if (o.startsWith("control_") || o === "cyberpi.cyberpi_restart") return CATEGORIES.control;
  if (o.startsWith("operator_") || o.includes("operator_casts")) return CATEGORIES.operators;
  if (o.startsWith("data_") && o.includes("list")) return CATEGORIES.lists;
  if (o.startsWith("data_")) return CATEGORIES.variables;
  if (o.startsWith("procedures_") || o.startsWith("argument_")) return CATEGORIES.myblocks;
  if (o.startsWith("mbot2.")) return CATEGORIES.chassis;
  if (o.startsWith("mbuild_quad_color_sensor.")) return CATEGORIES.quad;
  if (o.startsWith("cyberpi_mbuild_ultrasonic2.")) return CATEGORIES.ultrasonic;
  if (/display|sprite|sketch|screen|mirror|console/.test(o)) return CATEGORIES.display;
  if (/led|light/.test(o)) return CATEGORIES.lighting;
  if (/audio|play|volume|record|speak|buzzer|music/.test(o)) return CATEGORIES.audio;
  if (/wifi|cloud|mesh|broadcast|internet|lan/.test(o)) return CATEGORIES.network;
  if (o.startsWith("cyberpi.")) return CATEGORIES.sensing;
  return CATEGORIES.extension;
}

export function isBooleanOpcode(opcode: string) {
  if (BOOLEAN_OPCODES.has(opcode) || opcode === "argument_reporter_boolean") return true;
  const label = LABELS[opcode];
  return Boolean(label && label.trim().endsWith("?"));
}

/** A readable fallback for blocks without a template. */
export function fallbackLabel(opcode: string, inputs: string[], fields: string[]) {
  const name = opcode.replace(/^[^.]+\./, "").replace(/^(cyberpi|mbot2|mbuild_quad_color_sensor|mbuild_ultrasonic2)_/, "").replace(/_/g, " ");
  return [name, ...fields.map((f) => `{${f}}`), ...inputs.map((i) => `{${i}}`)].join(" ");
}
