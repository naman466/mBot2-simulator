<script lang="ts">
	import { onDestroy, onMount, tick as svelteTick } from 'svelte';
	import CyberpiDevice from '$lib/cyberpi-device.svelte';
	import SensorPanel from '$lib/sensor-panel.svelte';
	import VariablesPanel from '$lib/variables-panel.svelte';
	import ScriptsPanel from '$lib/scripts-panel.svelte';
	import CodeView from '$lib/code-view/code-view.svelte';
	import PythonIde from '$lib/python-ide/python-ide.svelte';
	import Icon from '$lib/ui/icon.svelte';
	import Logo from '$lib/ui/logo.svelte';
	import Menu from '$lib/ui/menu.svelte';
	import TrackTools from '$lib/track-tools.svelte';
	import TrackEditorPanel from '$lib/track-editor-panel.svelte';
	import { EXAMPLES } from '$lib/examples';
	import { live } from '$lib/live';
	import { readProjectFile } from '$lib/load-project';
	import { LANRouter } from '../mblock/global';
	import { createRobot, parseProject, type ParsedProject } from '../mblock/target';
	import type { MBot2 } from '../mblock/targets/mbot2';
	import type { ButtonName, JoystickDirection } from '../mblock/targets/cyberpi';
	import { World, type Wall } from '../sim/world';
	import { Renderer } from '../sim/renderer';
	import { MAPS } from '../sim/maps';
	import { TrackEditor } from '../sim/track-editor';
	import {
		deleteSavedTrack,
		downloadTrack,
		emptyTrack,
		isTrackDoc,
		loadSavedTracks,
		preloadImages,
		readTrackFile,
		saveTrack,
		trackFromImage,
		trackFromMap,
		trackToMap,
		type TrackDoc,
	} from '../sim/track';
	import { speaker } from '../sim/audio';

	const SAVED_PROGRAM_KEY = 'mbot2-sim:program';
	const SAVED_MAP_KEY = 'mbot2-sim:map';
	const ROBOT_COLORS = ['#1e88e5', '#43a047', '#fb8c00', '#8e24aa'];
	const MAX_ROBOTS = 4;

	let canvas: HTMLCanvasElement;
	let fileInput: HTMLInputElement;
	let imageInput: HTMLInputElement;
	let trackInput: HTMLInputElement;
	let world: World;
	let renderer: Renderer;
	const lanRouter = new LANRouter();

	let robots: MBot2[] = [];
	let selected = 0;
	let parsed: ParsedProject | null = null;
	let programName = '';
	let loadError = '';
	let notice = '';
	let noticeTimer: ReturnType<typeof setTimeout>;

	let mapId = MAPS[0].id;
	/** Tracks saved in this browser, and an unsaved track being tried out. */
	let savedTracks: TrackDoc[] = [];
	let scratchTrack: TrackDoc | null = null;
	let editor: TrackEditor | null = null;
	let editorVersion = 0;
	let editorSaved = false;
	let mapBeforeEditing = MAPS[0].id;
	let showCode = true;
	/** Which program the left panel shows (and ▶ Run starts): the blocks or the Python editor. */
	let leftTab: 'blocks' | 'python' = 'blocks';
	let pythonIde: PythonIde;
	let pythonRunning = false;

	// --- Layout: panel widths (resizable, remembered) and the robot panel tab.
	const LAYOUT_KEY = 'mbot2-sim:layout';
	let rightTab: 'robot' | 'sensors' | 'data' | 'more' = 'robot';
	let showSide = true;
	let codeWidth = 360;
	let pyWidth = 470;
	let sideWidth = 360;

	function restoreLayout() {
		try {
			const saved = JSON.parse(localStorage.getItem(LAYOUT_KEY) ?? '{}');
			codeWidth = saved.codeWidth ?? codeWidth;
			pyWidth = saved.pyWidth ?? pyWidth;
			sideWidth = saved.sideWidth ?? sideWidth;
		} catch {
			/* defaults */
		}
	}

	/** Drag handler for the panel dividers. */
	function startResize(which: 'code' | 'side') {
		return (e: PointerEvent) => {
			const handle = e.currentTarget as HTMLElement;
			const main = handle.parentElement as HTMLElement;
			handle.setPointerCapture(e.pointerId);
			const move = (ev: PointerEvent) => {
				const box = main.getBoundingClientRect();
				if (which === 'code') {
					const width = Math.round(Math.min(Math.max(ev.clientX - box.left, 260), box.width * 0.55));
					if (leftTab === 'python') pyWidth = width;
					else codeWidth = width;
				} else {
					sideWidth = Math.round(Math.min(Math.max(box.right - ev.clientX, 300), 520));
				}
			};
			const up = () => {
				handle.removeEventListener('pointermove', move);
				handle.removeEventListener('pointerup', up);
				try {
					localStorage.setItem(LAYOUT_KEY, JSON.stringify({ codeWidth, pyWidth, sideWidth }));
				} catch {
					/* not important */
				}
			};
			handle.addEventListener('pointermove', move);
			handle.addEventListener('pointerup', up);
		};
	}

	/** The Blocks / Python switch: clicking the open view again hides the panel. */
	function toggleBlocks() {
		if (showCode && leftTab === 'blocks') showCode = false;
		else {
			showCode = true;
			leftTab = 'blocks';
		}
	}

	function togglePython() {
		if (showCode && leftTab === 'python') showCode = false;
		else openPython();
	}
	let runStartedAt: number | null = null;
	let results: { name: string; seconds: number; track: string }[] = [];
	let showTrail = true;
	let showSensors = true;
	let muted = false;
	let dragOver = false;
	let tick = 0;
	let running = false;
	let mounted = false;

	$: entity = robots[selected] as MBot2 | undefined;
	$: myTracks = scratchTrack && !savedTracks.some((t) => t.id === scratchTrack?.id) ? [...savedTracks, scratchTrack] : savedTracks;
	$: currentTrack = mapId.startsWith('track:') ? myTracks.find((t) => `track:${t.id}` === mapId) ?? null : null;
	$: currentSaved = Boolean(currentTrack && savedTracks.some((t) => t.id === currentTrack?.id));
	$: currentMapInfo = live(tick, world?.map ? { name: world.map.name, description: world.map.description } : null);
	$: warnings = live(tick, collectWarnings(robots, parsed));

	function collectWarnings(list: MBot2[], project: ParsedProject | null) {
		const out: string[] = [];
		for (const u of project?.unsupported ?? []) out.push(`"${u.name}": ${u.reason}`);
		const unsupported = new Set<string>();
		const errors = new Map<string, string>();
		for (const r of list) {
			r.unsupportedOpcodes.forEach((o) => unsupported.add(o));
			r.runtimeErrors.forEach((message, opcode) => errors.set(opcode, message));
		}
		for (const opcode of unsupported) out.push(`Block not simulated yet: ${opcode.replace(/^[^.]+\./, '')}`);
		const offline = new Set<string>();
		for (const r of list) r.offlineFeatures.forEach((f) => offline.add(f));
		if (offline.size > 0) out.push(`Needs the internet on the real robot, so it does nothing here: ${[...offline].join(', ')}.`);
		for (const [opcode, message] of errors) out.push(`${opcode.replace(/^[^.]+\./, '')}: ${message}`);
		return out;
	}

	function flash(message: string) {
		notice = message;
		clearTimeout(noticeTimer);
		noticeTimer = setTimeout(() => (notice = ''), 4000);
	}

	function save(key: string, value: string) {
		try {
			localStorage.setItem(key, value);
		} catch {
			/* storage full or blocked: not important */
		}
	}

	function load(key: string) {
		try {
			return localStorage.getItem(key);
		} catch {
			return null;
		}
	}

	// --- Program loading --------------------------------------------------------------

	async function loadProgram(project: unknown, name: string, remember = true) {
		loadError = '';
		let result: ParsedProject;
		try {
			result = parseProject(project);
		} catch (error) {
			loadError = error instanceof Error ? error.message : String(error);
			return;
		}
		if (result.robots.length === 0) {
			loadError = `"${name}" has no CyberPi / mBot2 device. Add the CyberPi device in mBlock and save again.`;
			parsed = result;
			return;
		}
		for (const old of robots) {
			old.prepareDeletion();
			world.removeRobot(old.body);
		}
		const created: MBot2[] = [];
		for (const [i, target] of result.robots.slice(0, MAX_ROBOTS).entries()) {
			const robot = await createRobot(target, result.globals, lanRouter, target.name);
			robot.body.color = ROBOT_COLORS[i % ROBOT_COLORS.length];
			robot.body.trailEnabled = showTrail;
			robot.attachWorld(world);
			world.addRobot(robot.body);
			created.push(robot);
		}
		robots = created;
		selected = 0;
		renderer.selected = robots[0]?.body ?? null;
		parsed = result;
		programName = name;
		if (remember) save(SAVED_PROGRAM_KEY, JSON.stringify({ name, project }));
		const pythonCode = pythonFromTarget(result.robots[0]);
		if (pythonCode && remember) {
			await openPython(pythonCode, `${name}.py`);
			flash(`Loaded "${name}" — it was saved in Python mode, so it opened in the 🐍 Python editor.`);
		} else {
			flash(`Loaded "${name}". Press ▶ Run to start it.`);
		}
	}

	/** The Python code of a device saved in mBlock's Python mode, if any. */
	function pythonFromTarget(target: any): string | null {
		if (!target || target.editorMode === 'block') return null;
		const codes = target.codes;
		if (typeof codes === 'string' && codes.trim()) return codes;
		if (codes && typeof codes === 'object') {
			const value = codes.python ?? codes.upload ?? Object.values(codes).find((v) => typeof v === 'string');
			if (typeof value === 'string' && value.trim()) return value;
			if (value && typeof value === 'object' && typeof (value as any).code === 'string') return (value as any).code;
		}
		return null;
	}

	/** A robot with no block program, for running Python. */
	async function ensureRobot() {
		if (robots.length > 0) return;
		await loadProgram(
			{ targets: [{ isStage: true, name: 'Stage', variables: {}, lists: {}, broadcasts: {}, blocks: {} },
				{ isStage: false, name: 'cyberpi', deviceId: 'cyberpi', loadedExtIds: ['mbot2'], variables: {}, lists: {}, broadcasts: {}, blocks: {} }] },
			'Python program',
			false,
		);
		notice = '';
	}

	/** Shows the Python editor, optionally with code from a file. */
	async function openPython(code?: string, fileName?: string) {
		await ensureRobot();
		showCode = true;
		leftTab = 'python';
		await svelteTick();
		if (code !== undefined) pythonIde?.loadCode(code, fileName);
	}

	async function openFile(file: File | undefined) {
		if (!file) return;
		if (/\.py$/i.test(file.name)) {
			await openPython(await file.text(), file.name);
			flash(`Opened "${file.name}". Press ▶ Run to start it.`);
			return;
		}
		try {
			await loadProgram(await readProjectFile(file), file.name.replace(/\.mblock$/i, ''));
		} catch (error) {
			loadError = error instanceof Error ? error.message : String(error);
		}
	}

	async function openExample(id: string) {
		const example = EXAMPLES.find((e) => e.id === id);
		if (!example) return;
		changeMap(example.mapId);
		await loadProgram(example.build(), example.name);
	}

	// --- Controls ----------------------------------------------------------------------

	function run() {
		speaker.unlock();
		runStartedAt = performance.now();
		if (showCode && leftTab === 'python' && pythonIde) {
			pythonIde.run();
			return;
		}
		pythonIde?.stop();
		for (const robot of robots) robot.launch();
	}

	function stop() {
		pythonIde?.stop();
		for (const robot of robots) {
			robot.stopAll();
			robot.body.stopMotors();
		}
	}

	function resetRobots() {
		stop();
		for (const robot of robots) world.placeAtSpawn(robot.body);
	}

	function findTrack(id: string) {
		// Not `myTracks`: reactive values lag behind within the same update.
		return [...savedTracks, ...(scratchTrack ? [scratchTrack] : [])].find((t) => `track:${t.id}` === id);
	}

	async function changeMap(id: string) {
		stop();
		const track = id.startsWith('track:') ? findTrack(id) : undefined;
		if (track) {
			await preloadImages(track);
			world.loadMap(trackToMap(track));
			mapId = id;
		} else {
			const map = MAPS.find((m) => m.id === id) ?? MAPS[0];
			world.loadMap(map);
			mapId = map.id;
		}
		renderer?.fit();
		if (!track || savedTracks.some((t) => t.id === track.id)) save(SAVED_MAP_KEY, mapId);
	}

	/** Shows a track that isn't saved yet (new, imported or from a picture). */
	async function tryTrack(doc: TrackDoc) {
		scratchTrack = doc;
		await Promise.resolve();
		await changeMap(`track:${doc.id}`);
	}

	function onMapSelect(e: Event) {
		const select = e.target as HTMLSelectElement;
		const value = select.value;
		if (value.startsWith('__')) {
			select.value = mapId;
			if (value === '__image') imageInput.click();
			else if (value === '__file') trackInput.click();
			else if (value === '__new') newTrack();
		} else changeMap(value);
	}

	/** Shrinks big photos so tracks stay small enough to save in the browser. */
	function shrinkImage(image: HTMLImageElement, maxSize = 1600): string {
		const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
		const canvas = document.createElement('canvas');
		canvas.width = Math.round(image.width * scale);
		canvas.height = Math.round(image.height * scale);
		canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height);
		return canvas.toDataURL('image/jpeg', 0.85);
	}

	function openImage(file: File | undefined) {
		if (!file) return;
		const url = URL.createObjectURL(file);
		const image = new Image();
		image.onload = async () => {
			const answer = prompt('How wide is this track in real life, in centimetres?', '200');
			const width = Math.max(30, Math.min(1000, Number(answer) || 200));
			const doc = trackFromImage(shrinkImage(image), image.width, image.height, width, file.name.replace(/\.[^.]+$/, ''));
			URL.revokeObjectURL(url);
			await tryTrack(doc);
			flash('Picture loaded. Use ✏️ Edit track to set the start, add walls or ramps, and save it.');
		};
		image.onerror = () => flash("That picture couldn't be opened.");
		image.src = url;
	}

	async function openTrackFile(file: File | undefined) {
		if (!file) return;
		try {
			const doc = await readTrackFile(file);
			await tryTrack(doc);
			flash(`Opened track "${doc.name}". Save it in ✏️ Edit track to keep it in this browser.`);
		} catch (error) {
			flash(error instanceof Error ? error.message : String(error));
		}
	}

	// --- Track editor ---------------------------------------------------------------------

	function newTrack() {
		const doc = emptyTrack(`My track ${savedTracks.length + 1}`);
		startEditing(doc);
	}

	/** Opens the editor on the current track (built-in tracks are edited as a copy). */
	function editCurrentTrack() {
		const doc: TrackDoc = currentTrack
			? JSON.parse(JSON.stringify(currentTrack))
			: trackFromMap(MAPS.find((m) => m.id === mapId) ?? MAPS[0]);
		startEditing(doc);
	}

	async function startEditing(doc: TrackDoc) {
		stop();
		mapBeforeEditing = mapId;
		editorSaved = savedTracks.some((t) => t.id === doc.id);
		editor = new TrackEditor(doc);
		editor.onChange = async (d) => {
			editorSaved = false;
			await preloadImages(d);
			world.loadMap(trackToMap(d));
		};
		editor.onUiChange = () => (editorVersion += 1);
		renderer.editor = editor;
		world.paused = true;
		await preloadImages(doc);
		world.loadMap(trackToMap(doc));
		renderer.fit();
	}

	function saveEditing() {
		if (!editor) return;
		const doc = editor.doc;
		if (!saveTrack(doc)) {
			flash('This track is too big to save in the browser (large pictures). Use ⬇ Share file instead.');
			return;
		}
		savedTracks = loadSavedTracks();
		editorSaved = true;
		mapId = `track:${doc.id}`;
		save(SAVED_MAP_KEY, mapId);
		flash(`Saved "${doc.name}". It's in the Track list under My tracks.`);
	}

	async function finishEditing() {
		if (!editor) return;
		const doc = editor.doc;
		if (!editorSaved) scratchTrack = doc;
		else savedTracks = loadSavedTracks();
		renderer.editor = null;
		editor = null;
		world.paused = false;
		await Promise.resolve();
		await changeMap(`track:${doc.id}`);
	}

	async function discardEditing() {
		if (editor && !editorSaved && !confirm('Throw away the changes to this track?')) return;
		renderer.editor = null;
		editor = null;
		world.paused = false;
		await changeMap(mapBeforeEditing);
	}

	async function deleteCurrentTrack() {
		if (!currentTrack || !confirm(`Delete the track "${currentTrack.name}" from this browser?`)) return;
		deleteSavedTrack(currentTrack.id);
		savedTracks = loadSavedTracks();
		await changeMap(MAPS[0].id);
	}

	function addBox() {
		const c = renderer.viewCenter;
		const x = Math.max(15, Math.min(world.width - 15, c.x));
		const y = Math.max(15, Math.min(world.height - 15, c.y));
		world.addBox(x, y);
		flash('Box added. Drag it around; right-click a box you added to remove it.');
	}

	function toggleTrail() {
		showTrail = !showTrail;
		for (const robot of robots) {
			robot.body.trailEnabled = showTrail;
			if (!showTrail) robot.body.trail = [];
		}
	}

	function toggleSensors() {
		showSensors = !showSensors;
		renderer.showSensors = showSensors;
	}

	function toggleMute() {
		muted = !muted;
		speaker.muted = muted;
		if (muted) speaker.stop();
		else speaker.unlock();
	}

	function selectRobot(i: number) {
		selected = i;
		renderer.selected = robots[i]?.body ?? null;
	}

	// --- Keyboard: CyberPi buttons ------------------------------------------------------

	const KEYS: Record<string, ButtonName | JoystickDirection> = {
		a: 'a', b: 'b', ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Enter: 'middle',
	};

	function isTyping(e: KeyboardEvent) {
		const el = e.target as HTMLElement;
		return el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
	}

	function keyDown(e: KeyboardEvent) {
		if (editor) {
			if (!isTyping(e) && editor.keyDown(e)) e.preventDefault();
			return;
		}
		if (isTyping(e) || e.ctrlKey || e.metaKey || e.altKey) return;
		const name = KEYS[e.key.length === 1 ? e.key.toLowerCase() : e.key];
		if (!name || !entity) return;
		e.preventDefault();
		if (e.repeat) return;
		speaker.unlock();
		entity.press(name);
	}

	function keyUp(e: KeyboardEvent) {
		const name = KEYS[e.key.length === 1 ? e.key.toLowerCase() : e.key];
		if (name && entity) entity.release(name);
	}

	// --- Drag and drop ------------------------------------------------------------------

	function onDragOver(e: DragEvent) {
		if (!e.dataTransfer?.types.includes('Files')) return;
		e.preventDefault();
		dragOver = true;
	}

	function onDrop(e: DragEvent) {
		e.preventDefault();
		dragOver = false;
		const file = e.dataTransfer?.files[0];
		if (!file) return;
		if (file.type.startsWith('image/')) openImage(file);
		else if (/\.py$/i.test(file.name)) openFile(file);
		else if (/\.json$/i.test(file.name)) {
			file.text().then((text) => {
				let parsedJson: unknown = null;
				try {
					parsedJson = JSON.parse(text);
				} catch {
					/* not JSON: let the program loader report it */
				}
				if (isTrackDoc(parsedJson)) openTrackFile(file);
				else openFile(file);
			});
		} else openFile(file);
	}

	// --- Lifecycle ------------------------------------------------------------------------

	let uiTimer: ReturnType<typeof setInterval>;
	let unsubscribeTick: (() => void) | undefined;

	onMount(async () => {
		world = new World();
		restoreLayout();
		// Small screens start with the robot panel below the track instead.
		if (window.innerWidth < 1000) showCode = false;
		savedTracks = loadSavedTracks();
		world.loadMap(MAPS[0]);
		renderer = new Renderer(canvas, world);
		const savedMapId = load(SAVED_MAP_KEY);
		if (savedMapId && (MAPS.some((m) => m.id === savedMapId) || savedTracks.some((t) => `track:${t.id}` === savedMapId))) {
			await changeMap(savedMapId);
		}
		world.onFinish((body) => {
			const robot = robots.find((r) => r.body === body);
			if (!robot || runStartedAt === null) return;
			const seconds = Math.round((performance.now() - runStartedAt) / 100) / 10;
			results = [{ name: robot.name, seconds, track: world.map.name }, ...results].slice(0, 6);
			flash(`🏁 ${robot.name} reached the finish in ${seconds} s!`);
		});
		renderer.showSensors = showSensors;
		renderer.onSelect = (body) => {
			const i = robots.findIndex((r) => r.body === body);
			if (i >= 0) selected = i;
		};
		renderer.onWallContext = (wall: Wall) => {
			if (wall.userAdded) world.removeWall(wall);
		};
		unsubscribeTick = world.onTick(() => {
			for (const robot of robots) robot.tick();
			pythonIde?.tick();
		});
		world.start();
		if (import.meta.env.DEV) (window as any).__sim = { world, robots: () => robots, python: () => pythonIde };
		uiTimer = setInterval(() => {
			tick++;
			running = robots.some((r) => r.isRunning);
		}, 100);
		mounted = true;

		const saved = load(SAVED_PROGRAM_KEY);
		if (saved) {
			try {
				const { name, project } = JSON.parse(saved);
				await loadProgram(project, name, false);
				notice = '';
			} catch {
				/* ignore a broken save */
			}
		}
	});

	onDestroy(() => {
		clearInterval(uiTimer);
		unsubscribeTick?.();
		world?.stop();
		renderer?.destroy();
		for (const robot of robots) robot.prepareDeletion();
	});
</script>

<svelte:window on:keydown={keyDown} on:keyup={keyUp} on:dragover={onDragOver} on:drop={onDrop} on:dragleave={(e) => { if (!e.relatedTarget) dragOver = false; }} />

<svelte:head>
	<title>mBot2 Simulator</title>
</svelte:head>

<input bind:this={fileInput} type="file" accept=".mblock,.json,.py" hidden on:change={(e) => { openFile(e.currentTarget.files?.[0]); e.currentTarget.value = ''; }} />
<input bind:this={imageInput} type="file" accept="image/*" hidden on:change={(e) => { openImage(e.currentTarget.files?.[0]); e.currentTarget.value = ''; }} />
<input bind:this={trackInput} type="file" accept=".json" hidden on:change={(e) => { openTrackFile(e.currentTarget.files?.[0]); e.currentTarget.value = ''; }} />

<div class="app">
	<header class="topbar">
		<div class="brand">
			<Logo size={30} />
			<div class="brand-text">
				<span class="name">mBot2 Simulator</span>
				{#if programName}<span class="project" title="Loaded program">{programName}</span>{/if}
			</div>
		</div>

		<Menu label="File" icon="folder">
			<button on:click={() => fileInput.click()}><Icon name="folder" />Open program…<span class="menu-hint">.mblock · .py</span></button>
			<button on:click={() => openPython()}><Icon name="code" />New Python program</button>
			<div class="menu-sep" />
			<div class="menu-label">Block examples</div>
			{#each EXAMPLES as example}
				<button on:click={() => openExample(example.id)}><Icon name="sparkles" />{example.name}</button>
			{/each}
			<div class="menu-sep" />
			<div class="menu-label">Tracks</div>
			<button on:click={newTrack}><Icon name="filePlus" />New track…</button>
			<button on:click={() => imageInput.click()}><Icon name="image" />Track from a picture…</button>
			<button on:click={() => trackInput.click()}><Icon name="upload" />Open a track file…</button>
		</Menu>

		<div class="segmented" role="tablist" aria-label="Program view">
			<button role="tab" class:active={showCode && leftTab === 'blocks'} aria-selected={showCode && leftTab === 'blocks'} disabled={!entity} on:click={toggleBlocks} title="Show the program's blocks">
				<Icon name="blocks" size={16} />Blocks
			</button>
			<button role="tab" class:active={showCode && leftTab === 'python'} aria-selected={showCode && leftTab === 'python'} on:click={togglePython} title="Write the program in Python (mBlock Python)">
				<Icon name="code" size={16} />Python{#if pythonRunning}<span class="live-dot" />{/if}
			</button>
		</div>

		<div class="spacer" />

		<label class="track-picker" title="Track">
			<Icon name="map" size={16} />
			<select value={mapId} on:change={onMapSelect} disabled={Boolean(editor)} aria-label="Track">
				<optgroup label="Practice tracks">
					{#each MAPS as map}
						<option value={map.id}>{map.name}</option>
					{/each}
				</optgroup>
				{#if myTracks.length > 0}
					<optgroup label="My tracks">
						{#each myTracks as track (track.id)}
							<option value={`track:${track.id}`}>{track.name}{savedTracks.some((t) => t.id === track.id) ? '' : ' (not saved)'}</option>
						{/each}
					</optgroup>
				{/if}
				<optgroup label="Make your own">
					<option value="__new">New empty track…</option>
					<option value="__image">Use a picture of a track…</option>
					<option value="__file">Open a track file…</option>
				</optgroup>
			</select>
			<Icon name="chevronDown" size={14} />
		</label>

		<div class="run-group">
			<button class="btn run" class:running on:click={run} disabled={robots.length === 0 || Boolean(editor)} title="Start the program (like switching the robot on)">
				<Icon name="play" size={16} />{running ? 'Running' : 'Run'}
			</button>
			<button class="btn stop" on:click={stop} disabled={robots.length === 0} title="Stop all scripts and motors">
				<Icon name="stop" size={15} />Stop
			</button>
			<button class="btn icon-btn" on:click={resetRobots} disabled={robots.length === 0} title="Stop and put the robot back at the start" aria-label="Reset">
				<Icon name="reset" />
			</button>
		</div>

		<button class="btn icon-btn ghost" class:pressed={showSide} on:click={() => (showSide = !showSide)} title={showSide ? 'Hide the robot panel' : 'Show the robot panel'} aria-label="Toggle robot panel">
			<Icon name="panelRight" />
		</button>
	</header>

	<main>
		{#if entity}
			<!-- Kept alive while hidden so a running Python program keeps going. -->
			<section class="code" class:hidden={!showCode || editor} style={`width: ${leftTab === 'python' ? pyWidth : codeWidth}px`}>
				<div class="code-body" class:hidden={leftTab !== 'blocks'}>
					{#key entity}
						<CodeView {entity} {tick} />
					{/key}
				</div>
				<div class="code-body" class:hidden={leftTab !== 'python'}>
					<PythonIde
						bind:this={pythonIde}
						{entity}
						on:state={(e) => (pythonRunning = e.detail.running)}
						on:example={(e) => changeMap(e.detail.mapId)}
					/>
				</div>
			</section>
			<div class="resizer" class:hidden={!showCode || editor} on:pointerdown={startResize('code')} title="Drag to resize" />
		{/if}

		<section class="stage" class:dragover={dragOver}>
			<canvas bind:this={canvas} />

			<div class="stage-tools" role="toolbar" aria-label="View">
				<button on:click={() => renderer.zoomBy(1.25)} title="Zoom in" aria-label="Zoom in"><Icon name="zoomIn" /></button>
				<button on:click={() => renderer.zoomBy(0.8)} title="Zoom out" aria-label="Zoom out"><Icon name="zoomOut" /></button>
				<button on:click={() => renderer.fit()} title="Show the whole track" aria-label="Fit track"><Icon name="fit" /></button>
				<span class="sep" />
				<button on:click={addBox} title="Add a box (an obstacle)" aria-label="Add box"><Icon name="box" /></button>
				<button class:off={!showTrail} on:click={toggleTrail} title="Draw the robot's path" aria-label="Trail"><Icon name="trail" /></button>
				<button class:off={!showSensors} on:click={toggleSensors} title="Show what the sensors see" aria-label="Sensor view"><Icon name={showSensors ? 'eye' : 'eyeOff'} /></button>
				<button class:off={muted} on:click={toggleMute} title="Sound on/off" aria-label="Sound"><Icon name={muted ? 'volumeOff' : 'volume'} /></button>
				<span class="sep" />
				<button on:click={editCurrentTrack} disabled={Boolean(editor)} title="Edit this track (built-in tracks are copied)" aria-label="Edit track"><Icon name="pencil" /></button>
				{#if currentTrack && !editor}
					<button on:click={() => currentTrack && downloadTrack(currentTrack)} title="Download this track to share it" aria-label="Download track"><Icon name="download" /></button>
					{#if currentSaved}
						<button class="danger" on:click={deleteCurrentTrack} title="Delete this track from the browser" aria-label="Delete track"><Icon name="trash" /></button>
					{/if}
				{/if}
			</div>

			{#if editor}
				<TrackTools {editor} version={editorVersion} />
			{/if}

			{#if mounted && currentMapInfo && !editor}
				<div class="map-chip" title={currentMapInfo.description}>
					<Icon name="map" size={14} />{currentMapInfo.name}
				</div>
			{/if}

			{#if notice}
				<div class="toast" role="status">{notice}</div>
			{/if}

			{#if mounted && robots.length === 0 && !editor}
				<div class="welcome">
					<div class="welcome-head">
						<Logo size={44} />
						<div>
							<h1>Welcome to the mBot2 Simulator</h1>
							<p>Practise mBot2 coding without a robot, with your real mBlock programs.</p>
						</div>
					</div>
					<div class="welcome-actions">
						<button class="btn primary big" on:click={() => fileInput.click()}><Icon name="folder" />Open a program</button>
						<button class="btn big" on:click={() => openPython()}><Icon name="code" />Write Python</button>
					</div>
					<ol class="steps">
						<li><span>1</span><div>Build your program for <strong>CyberPi / mBot2</strong> in mBlock.</div></li>
						<li><span>2</span><div>Choose <strong>File → Save to your computer</strong> to get a <code>.mblock</code> file.</div></li>
						<li><span>3</span><div>Drop it anywhere on this page, or click <strong>Open a program</strong>.</div></li>
					</ol>
					<div class="examples">
						<span class="muted">Or try an example</span>
						{#each EXAMPLES as example}
							<button class="chip" on:click={() => openExample(example.id)}><Icon name="sparkles" size={14} />{example.name}</button>
						{/each}
					</div>
					{#if loadError}<p class="error">{loadError}</p>{/if}
				</div>
			{/if}

			{#if dragOver}
				<div class="drop"><Icon name="upload" size={28} />Drop an <strong>.mblock</strong> or <strong>.py</strong> program, a track file or a track picture</div>
			{/if}
		</section>

		<div class="resizer" class:hidden={!showSide} on:pointerdown={startResize('side')} title="Drag to resize" />
		<aside class:hidden={!showSide} style={`width: ${sideWidth}px`}>
			{#if editor}
				<div class="aside-scroll">
					<div class="card">
						<TrackEditorPanel
							{editor}
							version={editorVersion}
							saved={editorSaved}
							on:save={saveEditing}
							on:download={() => editor && downloadTrack(editor.doc)}
							on:done={finishEditing}
							on:discard={discardEditing}
						/>
					</div>
					<p class="help">Scroll to zoom and drag empty floor (with the select tool) to look around. Robots wait at the start while you edit.</p>
				</div>
			{:else if entity}
				<nav class="side-tabs" role="tablist" aria-label="Robot panel">
					<button role="tab" class:active={rightTab === 'robot'} on:click={() => (rightTab = 'robot')}><Icon name="cpu" size={16} />Robot</button>
					<button role="tab" class:active={rightTab === 'sensors'} on:click={() => (rightTab = 'sensors')}><Icon name="activity" size={16} />Sensors</button>
					<button role="tab" class:active={rightTab === 'data'} on:click={() => (rightTab = 'data')}><Icon name="list" size={16} />Data</button>
					<button role="tab" class:active={rightTab === 'more'} on:click={() => (rightTab = 'more')}>
						<Icon name="sliders" size={16} />More{#if warnings.length > 0}<span class="badge">{warnings.length}</span>{/if}
					</button>
				</nav>
				<div class="aside-scroll">
					{#if robots.length > 1}
						<div class="robot-switch">
							{#each robots as robot, i}
								<button class:active={i === selected} on:click={() => selectRobot(i)} style={`--c: ${robot.body.color}`}>
									<span class="swatch" />{robot.name}
								</button>
							{/each}
						</div>
					{/if}
					{#if loadError}<div class="card error">{loadError}</div>{/if}

					{#if rightTab === 'robot'}
						<div class="card">
							<CyberpiDevice {entity} {tick} />
						</div>
						{#if warnings.length > 0}
							<button class="notice-card" on:click={() => (rightTab = 'more')}>
								<Icon name="alert" size={16} />{warnings.length} thing{warnings.length > 1 ? 's' : ''} to check in this program
							</button>
						{/if}
						<p class="help">Drag the robot to move it, drag the blue dot to turn it. Scroll to zoom, drag the floor to look around.</p>
					{:else if rightTab === 'sensors'}
						<div class="card">
							<SensorPanel {entity} {world} {tick} />
						</div>
					{:else if rightTab === 'data'}
						<div class="card">
							<h3 class="card-title"><Icon name="list" size={16} />Variables</h3>
							<VariablesPanel {entity} {tick} />
						</div>
						<div class="card">
							<h3 class="card-title"><Icon name="flag" size={16} />Finish times</h3>
							{#if results.length > 0}
								<table class="results">
									{#each results as r}
										<tr><td>{r.name}</td><td>{r.track}</td><td class="time">{r.seconds} s</td></tr>
									{/each}
								</table>
							{:else}
								<p class="muted">Drive into a finish zone (e.g. on the Hill climb track) to time a run.</p>
							{/if}
						</div>
					{:else}
						{#if warnings.length > 0}
							<div class="card warn">
								<h3 class="card-title"><Icon name="alert" size={16} />Heads up</h3>
								<ul>
									{#each warnings as warning}<li>{warning}</li>{/each}
								</ul>
							</div>
						{/if}
						<div class="card">
							<h3 class="card-title"><Icon name="play" size={14} />Scripts &amp; custom blocks</h3>
							{#key entity}
								<ScriptsPanel {entity} />
							{/key}
						</div>
						<div class="card">
							<h3 class="card-title"><Icon name="sliders" size={16} />Environment</h3>
							<label class="slider">
								<span>Room light (light sensor)<strong>{entity.brightness}</strong></span>
								<input type="range" min="0" max="100" bind:value={entity.brightness} />
							</label>
							<label class="slider">
								<span>Noise (microphone)<strong>{entity.loudness}</strong></span>
								<input type="range" min="0" max="100" bind:value={entity.loudness} />
							</label>
						</div>
					{/if}
				</div>
			{:else}
				<div class="aside-scroll">
					<div class="empty">
						<Icon name="robot" size={40} stroke={1.5} />
						<h2>No robot yet</h2>
						<p>Open an <code>.mblock</code> or <code>.py</code> program, or start writing Python.</p>
						<button class="btn primary" on:click={() => fileInput.click()}><Icon name="folder" />Open a program</button>
					</div>
				</div>
			{/if}
		</aside>
	</main>
</div>

<style lang="scss">
	.app {
		display: flex;
		flex-direction: column;
		height: 100vh;
	}

	/* --- Top bar ------------------------------------------------------------ */
	.topbar {
		display: flex;
		align-items: center;
		gap: 10px;
		height: 60px;
		padding: 0 14px;
		background: var(--panel);
		border-bottom: 1px solid var(--border);
		box-shadow: var(--shadow-sm);
		z-index: 20;
	}
	.brand {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-right: 6px;
		min-width: 0;
	}
	.brand-text {
		display: flex;
		flex-direction: column;
		line-height: 1.15;
		min-width: 0;
		.name {
			font-weight: 700;
			font-size: 15px;
			letter-spacing: -0.01em;
			white-space: nowrap;
		}
		.project {
			font-size: 12px;
			color: var(--muted);
			white-space: nowrap;
			overflow: hidden;
			text-overflow: ellipsis;
			max-width: 200px;
		}
	}
	.spacer {
		flex: 1;
	}
	.segmented {
		display: inline-flex;
		background: var(--panel-3);
		border-radius: 9px;
		padding: 3px;
		gap: 2px;
		button {
			display: inline-flex;
			align-items: center;
			gap: 6px;
			height: 30px;
			padding: 0 12px;
			border: none;
			background: transparent;
			border-radius: 7px;
			font-weight: 600;
			color: var(--muted);
			&:hover:not(:disabled) {
				color: var(--text);
			}
			&.active {
				background: var(--panel);
				color: var(--text);
				box-shadow: var(--shadow);
			}
			&:disabled {
				opacity: 0.45;
				cursor: not-allowed;
			}
		}
	}
	.live-dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--go);
		box-shadow: 0 0 0 3px rgba(22, 163, 74, 0.2);
	}
	.track-picker {
		position: relative;
		display: inline-flex;
		align-items: center;
		gap: 6px;
		height: 36px;
		padding: 0 8px 0 10px;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--panel);
		color: var(--text-2);
		&:hover {
			border-color: var(--border-strong);
		}
		select {
			appearance: none;
			border: none;
			background: transparent;
			font-weight: 600;
			color: var(--text);
			padding-right: 2px;
			max-width: 190px;
			cursor: pointer;
			&:focus-visible {
				outline: none;
			}
		}
		&:focus-within {
			outline: 2px solid var(--primary);
			outline-offset: 1px;
		}
	}
	.run-group {
		display: inline-flex;
		gap: 6px;
	}

	/* Buttons */
	.btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 7px;
		height: 36px;
		padding: 0 14px;
		border: 1px solid var(--border);
		background: var(--panel);
		border-radius: var(--radius-sm);
		font-weight: 600;
		color: var(--text-2);
		transition: background 0.12s, border-color 0.12s, transform 0.06s;
		&:hover:not(:disabled) {
			background: var(--panel-2);
			border-color: var(--border-strong);
		}
		&:active:not(:disabled) {
			transform: translateY(1px);
		}
		&:disabled {
			opacity: 0.45;
			cursor: not-allowed;
		}
		&.icon-btn {
			width: 36px;
			padding: 0;
		}
		&.ghost {
			border-color: transparent;
			background: transparent;
			&.pressed {
				background: var(--panel-3);
			}
		}
		&.primary {
			background: var(--primary);
			border-color: var(--primary);
			color: #fff;
			&:hover:not(:disabled) {
				background: var(--primary-dark);
				border-color: var(--primary-dark);
			}
		}
		&.run {
			background: var(--go);
			border-color: var(--go);
			color: #fff;
			min-width: 92px;
			&:hover:not(:disabled) {
				background: var(--go-dark);
				border-color: var(--go-dark);
			}
			&.running {
				box-shadow: 0 0 0 3px rgba(22, 163, 74, 0.22);
			}
		}
		&.stop {
			color: var(--stop);
			&:hover:not(:disabled) {
				background: #fef2f2;
				border-color: #fecaca;
			}
		}
		&.big {
			height: 44px;
			padding: 0 18px;
			font-size: 15px;
		}
	}

	/* --- Layout -------------------------------------------------------------- */
	main {
		flex: 1;
		min-height: 0;
		display: flex;
	}
	.code {
		flex: none;
		min-height: 0;
		min-width: 0;
		background: var(--panel);
		display: flex;
		flex-direction: column;
		&.hidden {
			display: none;
		}
	}
	.code-body {
		flex: 1;
		min-height: 0;
		&.hidden {
			display: none;
		}
	}
	.resizer {
		flex: none;
		width: 6px;
		margin: 0 -3px;
		z-index: 5;
		cursor: col-resize;
		position: relative;
		&::after {
			content: '';
			position: absolute;
			top: 0;
			bottom: 0;
			left: 2px;
			width: 1px;
			background: var(--border);
			transition: background 0.15s, width 0.15s;
		}
		&:hover::after {
			background: var(--primary);
			width: 2px;
		}
		&.hidden {
			display: none;
		}
	}
	.stage {
		position: relative;
		flex: 1;
		min-width: 0;
		min-height: 0;
		canvas {
			display: block;
			width: 100%;
			height: 100%;
			touch-action: none;
		}
		&.dragover canvas {
			filter: brightness(0.92);
		}
	}
	.stage-tools {
		position: absolute;
		top: 12px;
		left: 12px;
		display: flex;
		flex-direction: column;
		gap: 2px;
		background: rgba(255, 255, 255, 0.96);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 4px;
		box-shadow: var(--shadow);
		backdrop-filter: blur(6px);
		button {
			display: grid;
			place-items: center;
			width: 34px;
			height: 34px;
			border: none;
			border-radius: 7px;
			background: transparent;
			color: var(--text-2);
			&:hover:not(:disabled) {
				background: var(--panel-3);
				color: var(--text);
			}
			&.off {
				color: #a7b0bd;
			}
			&.danger:hover {
				color: var(--stop);
				background: #fef2f2;
			}
			&:disabled {
				opacity: 0.35;
				cursor: not-allowed;
			}
		}
		.sep {
			height: 1px;
			background: var(--border);
			margin: 3px 5px;
		}
	}
	.map-chip {
		position: absolute;
		top: 12px;
		right: 12px;
		display: inline-flex;
		align-items: center;
		gap: 6px;
		background: rgba(255, 255, 255, 0.96);
		border: 1px solid var(--border);
		border-radius: 999px;
		padding: 5px 12px;
		font-size: 12px;
		font-weight: 600;
		color: var(--text-2);
		box-shadow: var(--shadow-sm);
	}
	.toast {
		position: absolute;
		bottom: 18px;
		left: 50%;
		transform: translateX(-50%);
		background: #1f2937;
		color: #f9fafb;
		border-radius: var(--radius);
		padding: 10px 16px;
		box-shadow: var(--shadow-lg);
		max-width: min(560px, 86%);
		text-align: center;
		pointer-events: none;
		font-weight: 500;
		animation: toast-in 0.2s ease-out;
	}
	@keyframes toast-in {
		from {
			opacity: 0;
			transform: translate(-50%, 8px);
		}
	}

	/* Welcome */
	.welcome {
		position: absolute;
		inset: 0;
		margin: auto;
		width: min(540px, 92%);
		height: fit-content;
		background: var(--panel);
		border: 1px solid var(--border);
		border-radius: 18px;
		box-shadow: var(--shadow-lg);
		padding: 28px;
		display: flex;
		flex-direction: column;
		gap: 20px;
		h1 {
			font-size: 21px;
			margin-bottom: 2px;
		}
		p {
			color: var(--muted);
		}
	}
	.welcome-head {
		display: flex;
		gap: 14px;
		align-items: center;
	}
	.welcome-actions {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 10px;
	}
	.steps {
		list-style: none;
		padding: 14px;
		margin: 0;
		background: var(--panel-2);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		display: flex;
		flex-direction: column;
		gap: 10px;
		color: var(--text-2);
		li {
			display: grid;
			grid-template-columns: 22px 1fr;
			gap: 10px;
			align-items: center;
		}
		span {
			flex: none;
			display: grid;
			place-items: center;
			width: 22px;
			height: 22px;
			border-radius: 50%;
			background: var(--primary-soft);
			color: var(--primary-dark);
			font-size: 12px;
			font-weight: 700;
		}
	}
	.examples {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px;
		.muted {
			margin-right: 4px;
		}
	}
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		border: 1px solid var(--border);
		background: var(--panel);
		border-radius: 999px;
		padding: 5px 12px;
		font-size: 13px;
		font-weight: 600;
		color: var(--text-2);
		&:hover {
			border-color: var(--primary);
			color: var(--primary-dark);
			background: var(--primary-soft);
		}
	}
	.drop {
		position: absolute;
		inset: 16px;
		border: 2px dashed var(--primary);
		border-radius: 18px;
		background: rgba(37, 99, 235, 0.06);
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 10px;
		font-size: 17px;
		color: var(--primary-dark);
		pointer-events: none;
	}

	/* --- Robot panel ------------------------------------------------------------ */
	aside {
		flex: none;
		display: flex;
		flex-direction: column;
		min-height: 0;
		background: var(--bg);
		&.hidden {
			display: none;
		}
	}
	.side-tabs {
		display: flex;
		gap: 2px;
		padding: 8px 10px 0;
		background: var(--panel);
		border-bottom: 1px solid var(--border);
		button {
			flex: 1;
			display: inline-flex;
			align-items: center;
			justify-content: center;
			gap: 6px;
			height: 38px;
			border: none;
			background: transparent;
			border-bottom: 2px solid transparent;
			font-weight: 600;
			font-size: 13px;
			color: var(--muted);
			&:hover {
				color: var(--text);
			}
			&.active {
				color: var(--primary-dark);
				border-bottom-color: var(--primary);
			}
		}
	}
	.badge {
		min-width: 18px;
		height: 18px;
		padding: 0 5px;
		border-radius: 999px;
		background: #f59e0b;
		color: #fff;
		font-size: 11px;
		font-weight: 700;
		display: inline-grid;
		place-items: center;
	}
	.aside-scroll {
		flex: 1;
		overflow-y: auto;
		padding: 12px;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.card {
		background: var(--panel);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		padding: 14px;
		box-shadow: var(--shadow-sm);
		&.warn {
			background: var(--warn-bg);
			border-color: var(--warn-border);
			color: var(--warn);
			ul {
				padding-left: 18px;
				font-size: 13px;
				word-break: break-word;
				display: flex;
				flex-direction: column;
				gap: 4px;
			}
		}
		&.error {
			color: var(--stop-dark);
			border-color: #fecaca;
			background: #fef2f2;
		}
	}
	.card-title {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 13px;
		margin-bottom: 10px;
		color: var(--text);
	}
	.notice-card {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		text-align: left;
		background: var(--warn-bg);
		border: 1px solid var(--warn-border);
		color: var(--warn);
		border-radius: var(--radius);
		padding: 10px 12px;
		font-weight: 600;
		font-size: 13px;
	}
	.robot-switch {
		display: flex;
		gap: 6px;
		button {
			flex: 1;
			display: inline-flex;
			align-items: center;
			justify-content: center;
			gap: 6px;
			border: 1px solid var(--border);
			background: var(--panel);
			border-radius: var(--radius-sm);
			padding: 6px;
			font-weight: 600;
			&.active {
				border-color: var(--c);
				box-shadow: 0 0 0 1px var(--c);
			}
		}
		.swatch {
			width: 10px;
			height: 10px;
			border-radius: 50%;
			background: var(--c);
		}
	}
	.slider {
		display: flex;
		flex-direction: column;
		gap: 4px;
		margin-bottom: 10px;
		font-size: 13px;
		color: var(--text-2);
		span {
			display: flex;
			justify-content: space-between;
		}
		input {
			accent-color: var(--primary);
		}
	}
	.results {
		width: 100%;
		border-collapse: collapse;
		font-size: 13px;
		td {
			padding: 5px 4px;
			border-bottom: 1px solid var(--border);
		}
		.time {
			text-align: right;
			font-weight: 700;
			font-variant-numeric: tabular-nums;
		}
	}
	.empty {
		margin-top: 40px;
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		gap: 10px;
		color: var(--muted);
		h2 {
			color: var(--text);
			font-size: 17px;
		}
	}
	.help,
	.muted {
		color: var(--muted);
		font-size: 12.5px;
	}
	.error {
		color: var(--stop-dark);
	}
	code {
		background: var(--panel-3);
		border-radius: 4px;
		padding: 1px 5px;
		font-family: var(--mono);
		font-size: 0.92em;
	}

	/* --- Smaller screens ---------------------------------------------------------- */
	@media (max-width: 1180px) {
		.brand-text {
			display: none;
		}
	}
	@media (max-width: 900px) {
		.topbar {
			height: auto;
			flex-wrap: wrap;
			padding: 8px 10px;
		}
		.spacer {
			display: none;
		}
		main {
			flex-direction: column;
			overflow-y: auto;
		}
		.code,
		aside {
			width: 100% !important;
		}
		.code {
			height: 70vh;
			order: 2;
		}
		.stage {
			flex: none;
			height: 60vh;
			order: 1;
		}
		aside {
			order: 3;
		}
		.resizer {
			display: none;
		}
	}
</style>
