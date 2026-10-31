// Runs a student's mBlock Python program on a simulated mBot2 with Skulpt
// (a Python interpreter written in JavaScript). Skulpt pauses the Python code
// regularly and whenever it waits (sleep, "move 20 cm"), so `while True:`
// loops never freeze the page and the physics keeps running.

import { PYTHON_LIBS } from './libs';
import type { MBot2 } from '../mblock/targets/mbot2';
import type { ButtonName, JoystickDirection } from '../mblock/targets/cyberpi';
import { speaker } from '../sim/audio';
import { LED_MENU_COLORS, classifyColor, type RGB } from '../sim/colors';
import { DEFAULT_MOVE_RPM, MAX_RPM, PROBE_ORDER, type ProbeName } from '../sim/constants';
import { clamp, hexToRgb, toNumber, toText } from '../mblock/values';
import skulptUrl from 'skulpt/dist/skulpt.min.js?url';
import skulptStdlibUrl from 'skulpt/dist/skulpt-stdlib.js?url';

declare const Sk: any;

/** mbot2.turn(angle): a positive angle turns the robot to the right (clockwise). */
export const PYTHON_TURN_POSITIVE_IS_RIGHT = true;

export type OutputKind = 'out' | 'err' | 'info';

let skulptLoading: Promise<void> | null = null;

function loadScript(src: string) {
	return new Promise<void>((resolve, reject) => {
		const script = document.createElement('script');
		script.src = src;
		script.onload = () => resolve();
		script.onerror = () => reject(new Error(`Couldn't load ${src}`));
		document.head.appendChild(script);
	});
}

/** Loads Skulpt the first time Python is used. */
export function loadSkulpt() {
	if (!skulptLoading) skulptLoading = loadScript(skulptUrl).then(() => loadScript(skulptStdlibUrl));
	return skulptLoading;
}

/**
 * The JS side of the `_sim` module: Python calls `_sim.invoke(name, *args)`.
 * (Not "call": Skulpt renames attributes that clash with JavaScript built-ins.)
 */
const BRIDGE_MODULE = `
var $builtinmodule = function () {
  var mod = {};
  mod.invoke = new Sk.builtin.func(function () {
    var args = Array.prototype.slice.call(arguments).map(function (a) { return Sk.ffi.remapToJs(a); });
    var name = args.shift();
    var result = Sk.__mbotRunner.call(name, args);
    if (result && typeof result.then === 'function') {
      return Sk.misceval.promiseToSuspension(result.then(function (v) { return Sk.ffi.remapToPy(v === undefined ? null : v); }));
    }
    return Sk.ffi.remapToPy(result === undefined ? null : result);
  });
  mod.register = new Sk.builtin.func(function (kind, arg, fn) {
    Sk.__mbotRunner.on(Sk.ffi.remapToJs(kind), Sk.ffi.remapToJs(arg), fn);
    return Sk.builtin.none.none$;
  });
  return mod;
};`;

/** Python's modules to forget before each run, so every run starts fresh. */
const OUR_MODULES = ['__main__', 'cyberpi', 'mbot2', 'mbuild', 'event', 'time', 'utime'];
const YIELD_MS = 16;

/**
 * Skulpt loses an import's name binding when it happens to pause during the
 * import statement. So pausing stays off until the program's top-level imports
 * are done, then `_sim` turns it on. The call is appended to the last import
 * line, so line numbers in error messages stay the same.
 */
export function preparePython(code: string): string {
	const ON = "import _sim as _sim_; _sim_.invoke('pause_on')";
	const lines = code.split('\n');
	let last = -1;
	lines.forEach((line, i) => {
		if (/^(import|from)\s/.test(line)) last = i;
	});
	if (last < 0) return `${ON}; ${code}`;
	// A parenthesised import can span lines: append after its closing bracket.
	if (lines[last].includes('(') && !lines[last].includes(')')) {
		while (last < lines.length - 1 && !lines[last].includes(')')) last++;
	}
	const line = lines[last];
	const hash = line.indexOf('#');
	const statement = (hash >= 0 ? line.slice(0, hash) : line).replace(/\s+$/, '');
	lines[last] = `${statement}; ${ON}${hash >= 0 ? `  ${line.slice(hash)}` : ''}`;
	return lines.join('\n');
}

class Stopped extends Error {
	constructor() {
		super('stopped');
	}
}

type Handler = { kind: string; arg: any; fn: any; running: boolean; active?: boolean };

const COLOR_NAMES: Record<string, RGB> = {
	red: [255, 0, 0], r: [255, 0, 0], orange: [255, 128, 0], o: [255, 128, 0], yellow: [255, 255, 0], y: [255, 255, 0],
	green: [0, 255, 0], g: [0, 255, 0], cyan: [0, 255, 255], c: [0, 255, 255], blue: [0, 0, 255], b: [0, 0, 255],
	purple: [255, 0, 255], p: [255, 0, 255], white: [255, 255, 255], w: [255, 255, 255], black: [0, 0, 0], k: [0, 0, 0],
};

function colorOf(value: any): RGB {
	const text = toText(value).trim().toLowerCase();
	if (COLOR_NAMES[text]) return COLOR_NAMES[text];
	if (text.startsWith('#')) return hexToRgb(text);
	return [0, 0, 0];
}

function ledIds(id: any): number[] {
	const text = toText(id).toLowerCase();
	if (id === null || id === undefined || text === 'all' || text === '' || text === '0') return [0, 1, 2, 3, 4];
	const n = Math.round(toNumber(id));
	return n >= 1 && n <= 5 ? [n - 1] : [];
}

function probe(ch: any): ProbeName | 'any' {
	const text = toText(ch).toUpperCase();
	const named = (PROBE_ORDER as string[]).find((p) => text.includes(p));
	if (named) return named as ProbeName;
	const n = Math.round(toNumber(ch));
	if (n >= 1 && n <= 4) return (['R2', 'R1', 'L1', 'L2'] as ProbeName[])[n - 1];
	return 'any';
}

function motorPorts(port: any): ('EM1' | 'EM2')[] {
	const text = toText(port).toUpperCase();
	if (text.includes('1')) return ['EM1'];
	if (text.includes('2')) return ['EM2'];
	return ['EM1', 'EM2'];
}

export class PythonRunner {
	private readonly robot: MBot2;
	private readonly output: (text: string, kind: OutputKind) => void;
	private handlers: Handler[] = [];
	private stopped = true;
	private tasks = 0;
	private taskSeq = 0;
	/** The task whose Python code is executing right now. */
	private current = 0;
	/** Tasks stopped by "stop other scripts" / "stop this script". */
	private killed = new Set<number>();
	private wakers = new Set<() => void>();
	private unsubscribe: (() => void) | null = null;
	private startedAt = performance.now();
	/** Line of the most recent error, for the editor to highlight. */
	public errorLine: number | null = null;
	public onStateChange: () => void = () => {};

	constructor(robot: MBot2, output: (text: string, kind: OutputKind) => void) {
		this.robot = robot;
		this.output = output;
	}

	public get running() {
		return !this.stopped && this.tasks > 0;
	}

	// --- Running ---------------------------------------------------------------------

	public async run(code: string) {
		this.stop();
		await loadSkulpt();
		this.stopped = false;
		this.killed.clear();
		this.handlers = [];
		this.errorLine = null;
		this.startedAt = performance.now();
		this.robot.stopAll();
		this.robot.resetDevice();
		this.robot.body.stopMotors();
		this.unsubscribe = this.robot.onPress((name) => this.fireButton(name));

		Sk.__mbotRunner = this;
		Sk.configure({
			output: (text: string) => this.output(text, 'out'),
			read: (file: string) => this.read(file),
			__future__: Sk.python3,
			// Not null: Skulpt only compiles pause points into loops when a limit is set.
			yieldLimit: Number.POSITIVE_INFINITY,
			execLimit: null,
			inputfun: (prompt: string) => window.prompt(prompt) ?? '',
			inputfunTakesPrompt: true,
		});

		for (const name of OUR_MODULES) {
			try {
				Sk.abstr.objectDelItem(Sk.sysmodules, new Sk.builtin.str(name));
			} catch {
				/* not loaded yet */
			}
		}
		Sk.yieldLimit = Number.POSITIVE_INFINITY;

		this.output('▶ Running…\n', 'info');
		// Not awaited: top-level code may loop forever (`while True:`).
		this.task(() => Sk.importMainWithBody('<stdin>', false, preparePython(code), true)).then(() => {
			// A program with nothing to pause for may never have turned pausing on.
			Sk.yieldLimit = YIELD_MS;
			// Event handlers (@event.start, button presses …) run like CyberPi's threads.
			for (const h of this.handlers.filter((h) => h.kind === 'start')) this.runHandler(h);
		});
	}

	public stop() {
		if (this.stopped) return;
		this.stopped = true;
		for (const wake of [...this.wakers]) wake();
		this.unsubscribe?.();
		this.unsubscribe = null;
		this.robot.stopAll();
		this.robot.body.stopMotors();
		speaker.stop();
		this.onStateChange();
	}

	private read(file: string) {
		const match = /^(?:\.\/)?src\/lib\/([a-z_0-9]+)(?:\/__init__)?\.(py|js)$/.exec(file);
		if (match) {
			const [, name, ext] = match;
			if (name === '_sim' && ext === 'js') return BRIDGE_MODULE;
			// Our Python modules replace Skulpt's own (e.g. its `time`).
			if (PYTHON_LIBS[name]) {
				if (ext === 'py' && file.endsWith(`${name}.py`)) return PYTHON_LIBS[name];
				throw new Sk.builtin.IOError(`File not found: '${file}'`);
			}
		}
		if (Sk.builtinFiles?.files[file] !== undefined) return Sk.builtinFiles.files[file];
		throw new Sk.builtin.IOError(`File not found: '${file}'`);
	}

	/**
	 * Runs Python code until it finishes, keeping the page responsive. Every
	 * script (main program, each event handler) is a task; `current` is the one
	 * executing right now, so "stop other scripts" knows which to keep.
	 */
	private async task(body: () => any) {
		const id = ++this.taskSeq;
		const alive = () => !this.stopped && !this.killed.has(id);
		const enter = () => {
			if (!alive()) throw new Stopped();
			this.current = id;
		};
		this.tasks++;
		this.onStateChange();
		try {
			await Sk.misceval.asyncToPromise(() => {
				enter();
				return body();
			}, {
				// Regular pauses in busy loops: leave the page a moment to run the physics and draw.
				// The promise must resolve to the resumed program (Skulpt continues from that).
				'Sk.yield': (suspension: any) => {
					if (!alive()) throw new Stopped();
					return new Promise((resolve, reject) => {
						setTimeout(() => {
							try {
								enter();
								resolve(suspension.resume());
							} catch (error) {
								reject(error);
							}
						}, 4);
					});
				},
				// Waiting for the simulator (sleep, "move 20 cm").
				'Sk.promise': (suspension: any) => {
					if (!alive()) throw new Stopped();
					return suspension.data.promise.then(
						(value: any) => {
							enter();
							suspension.data.result = value;
							return suspension.resume();
						},
						(error: any) => {
							enter();
							suspension.data.error = error;
							return suspension.resume();
						},
					);
				},
				'*': () => {
					if (!alive()) throw new Stopped();
				},
			});
		} catch (error) {
			if (!(error instanceof Stopped) && !this.stopped) this.reportError(error);
		} finally {
			this.killed.delete(id);
			this.tasks--;
			this.onStateChange();
		}
	}

	private runHandler(handler: Handler) {
		if (handler.running || this.stopped) return;
		handler.running = true;
		this.task(() => Sk.misceval.callsimOrSuspendArray(handler.fn, [])).finally(() => (handler.running = false));
	}

	private reportError(error: any) {
		let message = '';
		try {
			message = error?.toString ? error.toString() : String(error);
			const line = error?.traceback?.[0]?.lineno;
			if (line) {
				this.errorLine = Number(line);
				if (!/line \d+/.test(message)) message += ` on line ${line}`;
			}
		} catch {
			message = String(error);
		}
		this.output(`✖ ${message}\n`, 'err');
		this.onStateChange();
	}

	// --- Events ----------------------------------------------------------------------

	/** Called from `_sim.on(kind, arg, fn)` by the event decorators. */
	public on(kind: string, arg: any, fn: any) {
		this.handlers.push({ kind, arg, fn, running: false });
	}

	private fireButton(name: ButtonName | JoystickDirection) {
		for (const h of this.handlers) {
			if (h.kind !== 'is_press') continue;
			const want = toText(h.arg).toLowerCase();
			const isDirection = ['up', 'down', 'left', 'right', 'middle'].includes(name);
			if (want === name || want === 'any' || (want === 'any_direction' && isDirection) || (want === 'any_button' && !isDirection)) {
				this.runHandler(h);
			}
		}
	}

	private fireMessage(kind: string, message: string) {
		for (const h of this.handlers) if (h.kind === kind && toText(h.arg) === message) this.runHandler(h);
	}

	/** Called every simulation tick: fires sensor-threshold and tilt events on change. */
	public tick() {
		if (this.stopped) return;
		for (const h of this.handlers) {
			let active: boolean | null = null;
			if (h.kind === 'attitude') active = this.robot.attitude(toText(h.arg));
			else if (h.kind === 'greater_than' || h.kind === 'smaller_than') {
				const [threshold, type] = h.arg as [number, string];
				const value = this.sensorValue(toText(type));
				active = h.kind === 'greater_than' ? value > toNumber(threshold) : value < toNumber(threshold);
			}
			if (active === null) continue;
			if (active && !h.active) this.runHandler(h);
			h.active = active;
		}
	}

	private sensorValue(type: string) {
		const t = type.toLowerCase();
		if (t.includes('timer')) return (performance.now() - this.robot.timerStart) / 1000;
		if (t.includes('light') || t.includes('bri')) return this.robot.brightness;
		if (t.includes('shake')) return 0;
		return this.robot.loudness;
	}

	// --- Waiting -----------------------------------------------------------------------

	private sleep(ms: number): Promise<void> {
		return new Promise((resolve) => {
			const wake = () => {
				clearTimeout(timer);
				this.wakers.delete(wake);
				resolve();
			};
			const timer = setTimeout(wake, Math.max(0, ms));
			this.wakers.add(wake);
		});
	}

	/** Waits for a robot movement to finish (or for Stop). */
	private until(done: Promise<void>): Promise<void> {
		return new Promise((resolve) => {
			const wake = () => {
				this.wakers.delete(wake);
				resolve();
			};
			this.wakers.add(wake);
			done.then(wake);
		});
	}

	// --- The bridge --------------------------------------------------------------------

	/** Implements every simulator call the Python modules make. */
	public call(name: string, a: any[]): any {
		if (this.stopped) throw new Stopped();
		const r = this.robot;
		const body = r.body;
		const display = r.display;
		switch (name) {
			case 'pause_on':
				Sk.yieldLimit = YIELD_MS;
				Sk.lastYield = Date.now();
				return;

			// Time
			case 'sleep': return this.sleep(toNumber(a[0]) * 1000);
			case 'clock': return performance.now() - this.startedAt;

			// Console & display
			case 'console.print': display.print(toText(a[0])); return;
			case 'console.println': display.print(toText(a[0]), true); return;
			case 'console.clear': display.clear(); return;
			case 'console.set_font': display.setFontSize(toNumber(a[0])); return;
			case 'display.set_brush': {
				const [cr, cg, cb] = typeof a[0] === 'string' ? colorOf(a[0]) : [a[0], a[1], a[2]].map((v) => clamp(toNumber(v), 0, 255));
				display.setBrush(`rgb(${cr},${cg},${cb})`);
				return;
			}
			case 'display.rotate_to': display.setRotation(toNumber(a[0])); return;
			case 'display.clear': display.clear(); return;
			case 'display.label': {
				const [message, size, x, y] = a;
				const location = typeof x === 'string' ? x : { x: toNumber(x), y: toNumber(y) };
				display.showLabel(`py:${typeof x === 'string' ? x : `${x},${y}`}`, message, location, toNumber(size) || 16);
				return;
			}
			case 'chart.set_name': display.setChartTitle(toText(a[0])); return;
			case 'chart.clear': display.clearChart(); return;
			case 'linechart.add': display.addLineData(toNumber(a[0])); return;
			case 'linechart.set_step': display.setLineInterval(toNumber(a[0])); return;
			case 'barchart.add': display.addBarData(toNumber(a[0])); return;
			case 'table.add': display.setTableCell(toNumber(a[0]), toNumber(a[1]), toText(a[2])); return;

			// LEDs
			case 'led.on': {
				const [cr, cg, cb] = typeof a[0] === 'string' ? colorOf(a[0]) : [toNumber(a[0]), toNumber(a[1]), toNumber(a[2])];
				for (const i of ledIds(a[3])) r.setLed(i, [cr, cg, cb]);
				return;
			}
			case 'led.show': {
				const colors = toText(a[0]).trim().split(/\s+/);
				const offset = Math.round(toNumber(a[1]));
				for (let i = 0; i < 5; i++) r.setLed((i + offset) % 5, colorOf(colors[i] ?? 'black'));
				return;
			}
			case 'led.move': {
				const steps = Math.round(toNumber(a[0]));
				const leds = body.leds.map((c) => [...c] as RGB);
				for (let i = 0; i < 5; i++) r.setLed((((i + steps) % 5) + 5) % 5, leds[i]);
				return;
			}
			case 'led.off': for (const i of ledIds(a[0])) r.setLed(i, [0, 0, 0]); return;
			case 'led.play': return this.ledAnimation();
			case 'led.set_bri': body.ledBrightness = clamp(toNumber(a[0]), 0, 100); return;
			case 'led.add_bri': body.ledBrightness = clamp(body.ledBrightness + toNumber(a[0]), 0, 100); return;
			case 'led.get_bri': return body.ledBrightness;

			// Audio
			case 'audio.play': {
				const ms = speaker.clip(toText(a[0]));
				return a[1] ? this.sleep(ms) : undefined;
			}
			case 'audio.play_tone': {
				if (a[1] === null || a[1] === undefined) {
					speaker.tone(toNumber(a[0]), 0.5);
					return;
				}
				return this.sleep(speaker.tone(toNumber(a[0]), toNumber(a[1])));
			}
			case 'audio.play_drum': return this.sleep(speaker.drum(toText(a[0]), toNumber(a[1])));
			case 'audio.play_note': return this.sleep(speaker.note(toNumber(a[0]), toNumber(a[1])));
			case 'audio.set_tempo': speaker.speed = clamp(toNumber(a[0]), 25, 400); return;
			case 'audio.add_tempo': speaker.speed = clamp(speaker.speed + toNumber(a[0]), 25, 400); return;
			case 'audio.get_tempo': return speaker.speed;
			case 'audio.set_vol': speaker.volume = clamp(toNumber(a[0]), 0, 100); return;
			case 'audio.add_vol': speaker.volume = clamp(speaker.volume + toNumber(a[0]), 0, 100); return;
			case 'audio.get_vol': return speaker.volume;
			case 'audio.stop': speaker.stop(); return;
			case 'speak': {
				const utterance = new SpeechSynthesisUtterance(toText(a[0]));
				if (!speaker.muted) window.speechSynthesis?.speak(utterance);
				return;
			}

			// Buttons & joystick
			case 'controller.is_press': {
				const n = toText(a[0]).toLowerCase();
				if (n === 'any_button') return r.isPressed('a') || r.isPressed('b');
				if (n === 'any_direction') return r.isPressed('any');
				if (n === 'any') return r.isPressed('a') || r.isPressed('b') || r.isPressed('any');
				return r.isPressed(n);
			}
			case 'controller.get_count': return r.pressCounts[toText(a[0]).toLowerCase()] ?? 0;
			case 'controller.reset_count': r.pressCounts[toText(a[0]).toLowerCase()] = 0; return;
			case 'timer.get': return Math.round((performance.now() - r.timerStart) / 10) / 100;
			case 'timer.reset': r.timerStart = performance.now(); return;

			// On-board sensors
			case 'sensor.brightness': return r.brightness;
			case 'sensor.loudness': return r.loudness;
			case 'sensor.attitude': return r.attitude(toText(a[0]));
			case 'sensor.turning': return toText(a[0]) === 'clockwise' ? body.yawRateDeg < -5 : body.yawRateDeg > 5;
			case 'sensor.pitch': return Math.round(body.pitchDeg);
			case 'sensor.roll': return Math.round(body.rollDeg);
			case 'sensor.rotation': {
				const axis = toText(a[0]).toLowerCase();
				if (axis === 'z') return Math.round(r.yaw);
				return Math.round(axis === 'x' ? body.pitchDeg : body.rollDeg);
			}
			case 'sensor.reset_rotation': {
				const axis = toText(a[0]).toLowerCase();
				if (axis === 'z' || axis === 'all') r.yawOffset = body.yawDeg;
				return;
			}
			case 'sensor.gyro': return toText(a[0]).toLowerCase() === 'z' ? Math.round(body.yawRateDeg) : 0;
			case 'sensor.acc': {
				const axis = toText(a[0]).toLowerCase();
				const g = 9.8, pitch = (body.pitchDeg * Math.PI) / 180, roll = (body.rollDeg * Math.PI) / 180;
				if (axis === 'x') return Math.round((body.forwardAccel - g * Math.sin(pitch)) * 100) / 100;
				if (axis === 'y') return Math.round((body.lateralAccel + g * Math.sin(roll)) * 100) / 100;
				// Lying on the table the accelerometer reads −9.8 on z.
				return Math.round(-g * Math.cos(pitch) * Math.cos(roll) * 100) / 100;
			}
			case 'device.get_name': return r.name;
			case 'device.set_name': return;

			// Broadcasts
			case 'broadcast': this.fireMessage('receive', toText(a[0])); return;
			case 'broadcast.set': {
				const [kind, message, value] = a;
				r.lanRouter.broadcast(message, value);
				this.fireMessage(kind === 'wifi' ? 'wifi' : kind, message);
				return;
			}
			case 'broadcast.get': return r.lanRouter.getValue(toText(a[1])) ?? '';
			case 'cloud.time': {
				const now = new Date();
				const what = toText(a[0]).toLowerCase();
				if (what.includes('year')) return now.getFullYear();
				if (what.includes('month')) return now.getMonth() + 1;
				if (what.includes('day') || what.includes('date')) return now.getDate();
				if (what.includes('hour')) return now.getHours();
				if (what.includes('min')) return now.getMinutes();
				if (what.includes('sec')) return now.getSeconds();
				return now.toLocaleTimeString();
			}
			case 'offline': r.noteOffline(toText(a[0])); return 0;

			// Script control
			case 'script.stop_all': this.stop(); throw new Stopped();
			case 'script.stop_this':
				this.killed.add(this.current);
				throw new Stopped();
			case 'script.stop_other':
				// Every other running script stops at its next pause.
				for (let id = 1; id <= this.taskSeq; id++) if (id !== this.current) this.killed.add(id);
				return;
			case 'script.restart': this.stop(); throw new Stopped();

			// mBot2 chassis
			case 'mbot2.move': return this.move(toText(a[0]), toNumber(a[1]), a[2]);
			case 'mbot2.straight': {
				const distance = toNumber(a[0]);
				const rpm = Math.abs(toNumber(a[1])) || DEFAULT_MOVE_RPM;
				const sign = Math.sign(distance || 1);
				body.setWheels(sign * rpm, sign * rpm);
				return this.until(body.runGoal('distance', Math.abs(distance)));
			}
			case 'mbot2.turn': {
				const angle = toNumber(a[0]);
				const rpm = Math.abs(toNumber(a[1])) || DEFAULT_MOVE_RPM;
				const right = (angle > 0) === PYTHON_TURN_POSITIVE_IS_RIGHT;
				body.setWheels(right ? rpm : -rpm, right ? -rpm : rpm);
				return this.until(body.runGoal('rotation', Math.abs(angle)));
			}
			case 'mbot2.drive': {
				// Values are per motor: EM2 turns backwards to drive forward,
				// which is why drive_power(50, -50) goes straight.
				const scale = a[0] === 'power' ? MAX_RPM / 100 : 1;
				body.cancelGoals();
				body.em1.set(toNumber(a[1]) * scale, a[0]);
				body.em2.set(toNumber(a[2]) * scale, a[0]);
				return;
			}
			case 'mbot2.em_set': {
				const scale = a[0] === 'power' ? MAX_RPM / 100 : 1;
				body.cancelGoals();
				for (const port of motorPorts(a[2])) body.motors(port)[0].set(toNumber(a[1]) * scale, a[0]);
				return;
			}
			case 'mbot2.em_turn': {
				const angle = toNumber(a[0]);
				const ports = motorPorts(a[2]);
				const rpm = Math.abs(toNumber(a[1])) || DEFAULT_MOVE_RPM;
				for (const port of ports) body.setMotor(port, Math.sign(angle || 1) * rpm);
				return this.until(body.runGoal('motor', Math.abs(angle), ports.map((p) => body.motors(p)[0])));
			}
			case 'mbot2.em_get': {
				const [motor] = body.motors(motorPorts(a[1])[0]);
				if (a[0] === 'angle') return Math.round(motor.angle);
				if (a[0] === 'power') return Math.round(motor.rpm / (MAX_RPM / 100));
				return Math.round(motor.rpm);
			}
			case 'mbot2.em_reset_angle': for (const port of motorPorts(a[0])) body.motors(port)[0].angle = 0; return;
			case 'mbot2.em_stop': {
				const ports = motorPorts(a[0]);
				body.stopMotors(ports.length === 2 ? 'ALL' : ports[0]);
				return;
			}

			// Add-on ports (state only: nothing is attached in the simulator)
			case 'ports.motor_set': r.ports.setMotor(toText(a[0]), toNumber(a[1])); return;
			case 'ports.motor_add': r.ports.setMotor(toText(a[0]), r.ports.motor(toText(a[0])) + toNumber(a[1])); return;
			case 'ports.motor_get': return r.ports.motor(toText(a[0]));
			case 'ports.motor_stop': {
				const port = toText(a[0]);
				for (const p of port.toLowerCase() === 'all' ? ['M1', 'M2'] : [port]) r.ports.setMotor(p, 0);
				return;
			}
			case 'ports.servo_set': r.ports.setServo(toText(a[0]), toNumber(a[1])); return;
			case 'ports.servo_add': r.ports.setServo(toText(a[0]), r.ports.servo(toText(a[0])) + toNumber(a[1])); return;
			case 'ports.servo_get': return r.ports.servo(toText(a[0]));
			case 'ports.pin_set': r.ports.pins.set(toText(a[0]), toNumber(a[1])); return;
			case 'ports.pin_get': return r.ports.pins.get(toText(a[0])) ?? 0;

			// Quad RGB sensor
			case 'quad.line_sta': {
				const ch = probe(a[0]);
				if (ch === 'any') return r.lineFollowStatus(PROBE_ORDER);
				return r.quad().probes[ch].isLine ? 0 : 1;
			}
			case 'quad.offset': return r.quad().deviation;
			case 'quad.is': {
				const ch = probe(a[0]);
				const target = toText(a[1]).toLowerCase();
				const q = r.quad();
				const short: Record<string, string> = { r: 'red', y: 'yellow', g: 'green', c: 'cyan', b: 'blue', p: 'purple', w: 'white', k: 'black' };
				const want = target === 'background' ? 'ground' : short[target] ?? target;
				return (ch === 'any' ? PROBE_ORDER : [ch]).some((p) => r.probeMatches(q, p, want));
			}
			case 'quad.color': {
				const ch = probe(a[0]);
				return classifyColor(r.quad().probes[ch === 'any' ? 'L1' : ch].rgb);
			}
			case 'quad.value': {
				const ch = probe(a[0]);
				const reading = r.quad().probes[ch === 'any' ? 'L1' : ch];
				const what = toText(a[1]);
				if (what === 'red') return Math.round(reading.rgb[0]);
				if (what === 'green') return Math.round(reading.rgb[1]);
				if (what === 'blue') return Math.round(reading.rgb[2]);
				return Math.round(reading.gray);
			}
			case 'quad.led': {
				body.fillLight = a[0] === null || a[0] === undefined ? null : colorOf(a[0]);
				return;
			}

			// Ultrasonic sensor 2
			case 'ultrasonic.get': return r.distance();
			case 'ultrasonic.set_bri':
			case 'ultrasonic.add_bri': {
				const ids = toText(a[1]).toLowerCase() === 'all' ? [0, 1, 2, 3, 4, 5, 6, 7] : [Math.round(toNumber(a[1])) - 1].filter((i) => i >= 0 && i < 8);
				for (const i of ids) body.ultrasonicLeds[i] = clamp((name === 'ultrasonic.add_bri' ? body.ultrasonicLeds[i] : 0) + toNumber(a[0]), 0, 100);
				return;
			}
			case 'ultrasonic.get_bri': return body.ultrasonicLeds[Math.max(0, Math.round(toNumber(a[0])) - 1)] ?? 0;
			case 'ultrasonic.play': {
				body.ultrasonicLeds.fill(100);
				return this.sleep(1200).then(() => body.ultrasonicLeds.fill(0));
			}
		}
		throw new Error(`${name} isn't supported by the simulator`);
	}

	private move(direction: string, speed: number, runTime: any) {
		const rpm = speed;
		const body = this.robot.body;
		if (direction === 'forward') body.setWheels(rpm, rpm);
		else if (direction === 'backward') body.setWheels(-rpm, -rpm);
		else if (direction === 'left') body.setWheels(-rpm, rpm);
		else body.setWheels(rpm, -rpm);
		if (runTime === null || runTime === undefined) return;
		return this.sleep(toNumber(runTime) * 1000).then(() => {
			if (!this.stopped) body.stopMotors();
		});
	}

	private async ledAnimation() {
		const r = this.robot;
		for (let round = 0; round < 2 && !this.stopped; round++) {
			for (let shift = 0; shift < 6 && !this.stopped; shift++) {
				for (let i = 0; i < 5; i++) r.setLed(i, LED_MENU_COLORS[((i + shift) % 7) + 1]);
				await this.sleep(150);
			}
		}
		for (let i = 0; i < 5; i++) r.setLed(i, [0, 0, 0]);
	}
}

