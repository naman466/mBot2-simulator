// Python example programs in mBlock's style (they run unchanged on a real mBot2).

export const PYTHON_EXAMPLES: { id: string; name: string; mapId: string; code: string }[] = [
	{
		id: 'hello',
		name: 'Hello CyberPi (buttons & LEDs)',
		mapId: 'free',
		code: `# Press A for a rainbow, B to beep, push the joystick to change LED colors.
import cyberpi, event, time

@event.start
def on_start():
    cyberpi.console.clear()
    cyberpi.console.println("Hello! I'm mBot2")
    cyberpi.console.println("A = rainbow, B = beep")
    cyberpi.led.show("red orange yellow green blue")

@event.is_press('a')
def on_a():
    cyberpi.led.play("rainbow")

@event.is_press('b')
def on_b():
    cyberpi.audio.play_tone(880, 0.2)
    cyberpi.audio.play_tone(660, 0.2)

@event.is_press('up')
def on_up():
    cyberpi.led.on(0, 255, 0)

@event.is_press('down')
def on_down():
    cyberpi.led.on('red')
`,
	},
	{
		id: 'square',
		name: 'Square dance',
		mapId: 'free',
		code: `# Drives a square: 40 cm sides and 90° turns.
import cyberpi, mbot2, event

@event.is_press('a')
def on_a():
    for side in range(4):
        cyberpi.led.on(0, 0, 255, id=side + 1)
        mbot2.straight(40, speed=50)
        mbot2.turn(90, speed=50)
    cyberpi.audio.play("score")
    cyberpi.console.println("Done!")

@event.start
def on_start():
    cyberpi.console.println("Press A to dance")
`,
	},
	{
		id: 'kp',
		name: 'Line follower (Kp)',
		mapId: 'oval',
		code: `# Proportional line following with the quad RGB sensor.
# Press A to start, B to stop.
import cyberpi, mbot2, mbuild, event

base_power = 30
kp = 0.8

@event.is_press('a')
def follow():
    while True:
        offset = mbuild.quad_rgb_sensor.get_offset_track(1)
        mbot2.drive_power(base_power - kp * offset, -(base_power + kp * offset))

@event.is_press('b')
def stop():
    cyberpi.stop_other()
    mbot2.EM_stop("all")

@event.start
def on_start():
    cyberpi.console.println("Kp line follower")
    cyberpi.console.println("A = go, B = stop")
`,
	},
	{
		id: 'linestatus',
		name: 'Line follower (line status)',
		mapId: 'oval',
		code: `# Follows the line using the line status (15 = no line, 9 = L1 and R1 on the line).
import cyberpi as cpi
import time

hi_p = 30
lo_p = 5

cpi.console.println('Press A')
while not cpi.controller.is_press('a'):
    cpi.led.on(255, 0, 0)
cpi.led.on(0, 255, 0)

cpi.mbot2.drive_power(20, -20)
while True:
    line = cpi.quad_rgb_sensor.get_line_sta(index=1)
    if line == 7 or line == 11 or line == 3:      # line on the left
        cpi.mbot2.drive_power(lo_p, -hi_p)
    elif line == 13 or line == 14 or line == 12:  # line on the right
        cpi.mbot2.drive_power(hi_p, -lo_p)
    elif line == 9:                                # centred
        cpi.mbot2.drive_power(hi_p, -hi_p)
`,
	},
	{
		id: 'avoid',
		name: 'Obstacle avoider',
		mapId: 'arena',
		code: `# Drives forward and turns away from obstacles closer than 20 cm.
import cyberpi, mbot2, mbuild, time

cyberpi.console.println("Press A to go")
while not cyberpi.controller.is_press('a'):
    time.sleep(0.05)

while True:
    distance = mbuild.ultrasonic2.get(1)
    if distance < 20:
        cyberpi.led.on('red')
        mbot2.EM_stop("all")
        mbot2.straight(-5)
        mbot2.turn(-90)
    else:
        cyberpi.led.on('green')
        mbot2.forward(60)
`,
	},
	{
		id: 'tilt',
		name: 'Hill climb (tilt sensor)',
		mapId: 'hill',
		code: `# Climbs the ramp and reports the tilt angle.
import cyberpi, mbot2, mbuild, event, time

@event.is_press('a')
def go():
    while True:
        offset = mbuild.quad_rgb_sensor.get_offset_track(1)
        mbot2.drive_power(35 - 0.8 * offset, -(35 + 0.8 * offset))
        cyberpi.display.label(f"pitch {cyberpi.get_pitch()}", 24, "center")
        if cyberpi.is_tiltback():
            cyberpi.led.on('yellow')
        else:
            cyberpi.led.off()

@event.start
def on_start():
    cyberpi.console.println("Press A to climb")
`,
	},
];

export const STARTER_CODE = `import cyberpi, mbot2, mbuild, event, time

@event.start
def on_start():
    cyberpi.console.println("Hello from Python!")

@event.is_press('a')
def on_a():
    mbot2.straight(30)
    mbot2.turn(90)
`;
