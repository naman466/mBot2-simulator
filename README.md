# mBot2 Simulator

A browser simulator for the Makeblock **mBot2 / CyberPi**. Students build a program in mBlock, save it as an `.mblock` file, and drop it here to watch a virtual mBot2 run it on a practice track — no robot needed.

## For students

1. Build your program for **CyberPi / mBot2** in mBlock (upload mode blocks).
2. In mBlock choose **File → Save to your computer**. You get a `.mblock` file.
3. Open the simulator, click **📂 Open .mblock** (or drag the file onto the page).
4. Pick a **Track**, press **▶ Run** (that's like switching the robot on), then use the CyberPi buttons.

Controls:

- **A / B buttons and joystick**: click them on the CyberPi panel, or use the keys <kbd>A</kbd>, <kbd>B</kbd>, arrow keys and <kbd>Enter</kbd> (joystick press).
- **Move the robot**: drag it. **Turn it**: drag the blue dot in front of it (Shift for free angles).
- **Zoom**: mouse wheel or the ＋/－ buttons. **Pan**: drag the floor.
- **📦** adds a box you can drag around (right-click a box you added to remove it).
- **↺ Reset** stops everything and puts the robot back on START.

The side panel shows what the robot "feels" live: ultrasonic distance, line deviation, the four quad RGB probes (colour, gray value, line yes/no), line status bits, motor RPM and angle, the gyro and the timer, plus all variables.

The **🧩 Code** panel on the left shows the program's blocks the way mBlock does. Scripts that are running glow yellow and the block being executed lights up, so students can follow their code step by step. Clicking a hat block runs that script.

## Python (mBlock Python)

Click **🐍 Python** in the header for a Python editor next to the robot. Programs use the same libraries as mBlock's Python editor for CyberPi and mBot2 (upload mode), so code runs unchanged on the real robot:

```python
import cyberpi, mbot2, mbuild, event

@event.is_press('a')
def follow():
    while True:
        offset = mbuild.quad_rgb_sensor.get_offset_track(1)
        mbot2.drive_power(30 - 0.8 * offset, -(30 + 0.8 * offset))
```

- **Libraries:** `cyberpi` (console, display, charts, LEDs, audio, buttons/joystick, timer, motion sensors, broadcasts), `mbot2` (forward/backward/turn_left/turn_right with `run_time`, `straight`, `turn`, `drive_power`, `drive_speed`, encoder motor `EM_*`, servos and DC motors), `mbuild.quad_rgb_sensor` and `mbuild.ultrasonic2`, `event` decorators (`start`, `is_press`, `receive`, `greater_than`, `smaller_than`, tilt events) and `time`. The `cyberpi.mbot2` / `cyberpi.ultrasonic2` / `cyberpi.quad_rgb_sensor` style and `import cyberpi as cpi` work too.
- **Editor:** syntax colours, line numbers, autocomplete for the robot API (also after `import cyberpi as cpi`), Ctrl+Enter or F5 to run, examples, open/download `.py` files. `print()` output and errors (with the line highlighted) appear in the output panel; CyberPi's screen shows `console.println`.
- **Opening programs:** `.py` files open in the Python editor (button or drag and drop). An `.mblock` project saved in mBlock's Python mode opens there automatically.
- Event handlers run side by side like CyberPi's threads, `while True:` loops never freeze the page, and ■ Stop / `cyberpi.stop_other()` stop scripts immediately.

Python runs in the browser with [Skulpt](https://skulpt.org), so it covers the Python that classes use (functions, classes, lists, dicts, f-strings, `random`, `math`), not every CPython library.

## For teachers: tracks

Pick **Track → ➕ New empty track…**, or press **✏️** in the left toolbar to edit the current track (built-in tracks are edited as a copy). Tools:

| Tool | What it does |
| --- | --- |
| 📏 Tape / ✏️ Freehand | Black or coloured tape lines (click points or draw freehand). Coloured tape counts as line, like Makeblock's colour map |
| 🟥 Color zone | Painted areas for colour-detection tasks |
| 🧱 Wall | Walls and boxes the robot bumps into and the ultrasonic sensor sees (tick "students can drag it" for movable obstacles) |
| ⛰️ Ramp | A slope (3–35°) going up in any direction. Robots slow down uphill on power blocks, and CyberPi's tilt / attitude / rotation-angle blocks read the slope |
| 🏁 Finish | Reaching it shows the time since ▶ Run, listed under *Finish times* — good for challenges and races |
| 🔤 Label, 🚩 Start, 🧽 Eraser | Text on the mat, where the robot starts (drag to aim it), remove things |

Tracks snap to a 5 cm grid (hold Alt to place freely), support undo/redo (Ctrl+Z / Ctrl+Y), and can be resized. **💾 Save** keeps a track in this browser under *My tracks*; **⬇ Share file** downloads a `.track.json` file you can give to students, who open it with **Track → 📂 Open a track file…** (or drag it onto the page). A photo of a real mat (**📷 Use a picture of a track…**) becomes a track you can edit too.

Built-in practice tracks: oval, curvy road, colour line, figure eight, square corners, **hill climb** (up and down a 15° ramp to a finish), obstacle arena, maze, colour lab, sumo ring and free play.

## What is simulated

Every block of mBlock's CyberPi, mBot2, Quad RGB Sensor and Ultrasonic Sensor 2 extensions is handled, including the older versions of blocks found in files saved with earlier mBlock releases. The block list was checked against the block tables of the installed mBlock app.

| Part | Blocks |
| --- | --- |
| Chassis & encoder motors | move forward/backward/turn at RPM, for time, distance (cm/inch), turn by angle, left/right wheel power and speed, single motor speed/power/time/angle, stop, reset angle, lock, motor speed/power/angle reporters |
| Quad RGB sensor | line deviation, R/G/B/gray/light values, colour name, "probe detects colour / line / ground", line-following status (0–15 and L1/R1 0–3), "probe detects R G B with tolerance", custom colour, fill light. Black and coloured tape both count as line, like on Makeblock's colour map |
| Ultrasonic sensor 2 | distance (3–300 cm), out of range, ambient light brightness (single, all, one by one, face panel), emotions |
| CyberPi screen | print, labels, font size, colours, line/bar charts with titles, tables, screen rotation, **sprites** (text, icons, pixel art, doodles; move, rotate, size, colour, layers, flip, anchor, touching edge/other sprite), backdrop, **doodle pen**, auto refresh / refresh screen, "colour of pixel is …?" |
| CyberPi device | 5 LEDs (colours, animations, rolling, brightness), buzzer, notes, drums, sound clips, volume/speed, speaking text (browser voice), A/B buttons and joystick (pressed, counts, reset counts), timer, gyro z angle and rate, accelerometer, light and microphone (sliders under *Environment*), LAN broadcasts between several robots, date and time |
| mBot2 add-on ports | DC motors M1/M2, servos S1–S4, LED strips, digital/PWM pins: they keep their state and report it back (nothing is attached in the simulator, so they don't move the robot) |
| Scratch blocks | events, broadcasts, all control blocks, operators (Scratch-exact maths and comparisons), variables, lists, custom blocks |

Needs the internet on the real robot, so these do nothing here (the **Heads up** box says when a program uses them): speech recognition, translation, AI emotion, weather, air quality, sunrise/sunset. Cloud messages are passed between robots in the simulator like LAN broadcasts.

Physics: differential drive with 6.5 cm wheels, 11.6 cm track width, 200 RPM motors at 100 % power, a short motor spin-up, wall and box collisions. Sensors read the actual floor picture, so any track works — including a photo of your own mat (**Track → 📷 Use a picture of a track…**).

Blocks the simulator doesn't know are listed under **Heads up** instead of failing silently.

### Good to know

- The program starts when you press **▶ Run**, just like the robot runs "when CyberPi starts up" after switching on.
- Variables live on the robot, so every run starts from the values saved in the project.
- Built-in voice clips ("hi", "laugh", …) are played as short jingles, and screen icons are drawn with similar emoji.
- Tilt comes from ramps; shake and wave always read as "not moving".
- Two conventions can't be read from the project file and are set in [`src/sim/constants.ts`](src/sim/constants.ts): which turn direction the `cw` menu value means, and the sign of the gyro's z angle. If a real robot disagrees with the simulator, flip `TURN_CW_MEANS_LEFT` or `GYRO_Z_SIGN`.

## Run it on your computer

Needs [Node.js](https://nodejs.org) 18 or newer.

```bash
npm ci
npm run build
npm start
```

Then open <http://localhost:3000>. `PORT` and `HOST` can be set as environment variables. For development with live reload use `npm run dev`.

## Host it

Everything runs in the browser, so `npm run build` produces plain static files in `build/` that any static host can serve.

- **DigitalOcean App Platform (static site, free tier):** create an app from this repository, choose *Static Site*, build command `npm run build`, output directory `build`.
- **DigitalOcean Droplet / any server:** `npm ci && npm run build && npm start` (put it behind nginx or use `PORT=80`).
- GitHub Pages, Netlify, Cloudflare Pages work the same way (build command `npm run build`, output `build`).

## Supported devices

- CyberPi on mBot2 (CyberPi on its own runs too, as an mBot2).

## Credits

Based on [mblock-simulator](https://github.com/maxwellmatthis/mblock-simulator) by Maxwell Matthis. Block definitions cross-checked against [embe](https://github.com/Bananenpro/embe). Licensed under AGPL-3.0 (see [LICENSE](LICENSE)).
