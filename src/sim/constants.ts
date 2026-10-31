// Physical model of the mBot2. All lengths are in centimetres, the origin of
// the robot's local frame is the middle of the drive axle, +forward is the
// direction the robot drives and +left is to the robot's left.

export const WHEEL_DIAMETER_CM = 6.5;
export const WHEEL_CIRCUMFERENCE_CM = WHEEL_DIAMETER_CM * Math.PI;
/** Distance between the two drive wheels. */
export const TRACK_WIDTH_CM = 11.6;
/** Encoder motor top speed at 100 % power. */
export const MAX_RPM = 200;
/** How quickly the motors reach a new speed (first order lag time constant). */
export const MOTOR_TIME_CONSTANT_S = 0.08;
/** Speed of the chassis blocks that don't take a speed ("move 10 cm", "turn 90°"). */
export const DEFAULT_MOVE_RPM = 50;

/** Body outline used for drawing and collisions (relative to the axle). */
export const BODY = { back: -6.5, front: 10.5, halfWidth: 6.2 };
export const COLLISION_CENTER_FORWARD = 2;
export const COLLISION_RADIUS = 9.2;

/** The quad RGB sensor sits under the front of the robot. */
export const QUAD_SENSOR_FORWARD = 8.8;
/** Lateral position (+left) of each probe. */
export const QUAD_PROBES = { L2: 2.4, L1: 0.8, R1: -0.8, R2: -2.4 } as const;
export type ProbeName = keyof typeof QUAD_PROBES;
export const PROBE_ORDER: ProbeName[] = ["L2", "L1", "R1", "R2"];
/** Lateral offset at which the line deviation reads ±100. */
export const DEVIATION_FULL_SCALE_CM = 3.2;
/** Probes whose weakest colour channel is below this (0–100) see "line": black and coloured tape count, the white mat does not. */
export const LINE_THRESHOLD = 45;

/** The ultrasonic sensor sits at the very front. */
export const ULTRASONIC_FORWARD = 10.5;
export const ULTRASONIC_MIN_CM = 3;
export const ULTRASONIC_MAX_CM = 300;
/** Half opening angle of the ultrasonic beam. */
export const ULTRASONIC_HALF_ANGLE_DEG = 8;

// Conventions that can't be read from the project file. If a real robot
// disagrees, flip them here.
/** In "turn left/right … degrees" the menu value "cw" is what mBlock emits for *left*. */
export const TURN_CW_MEANS_LEFT = true;
/** The gyro's z rotation angle grows when the robot turns left (counter-clockwise from above). */
export const GYRO_Z_SIGN = 1;
