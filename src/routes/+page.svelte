<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import CyberpiDevice from '$lib/cyberpi-device.svelte';
	import SensorPanel from '$lib/sensor-panel.svelte';
	import VariablesPanel from '$lib/variables-panel.svelte';
	import ScriptsPanel from '$lib/scripts-panel.svelte';
	import CodeView from '$lib/code-view/code-view.svelte';
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
		flash(`Loaded "${name}". Press ▶ Run to start it.`);
	}

	async function openFile(file: File | undefined) {
		if (!file) return;
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
		for (const robot of robots) robot.launch();
	}

	function stop() {
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
		});
		world.start();
		if (import.meta.env.DEV) (window as any).__sim = { world, robots: () => robots };
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

<input bind:this={fileInput} type="file" accept=".mblock,.json" hidden on:change={(e) => { openFile(e.currentTarget.files?.[0]); e.currentTarget.value = ''; }} />
<input bind:this={imageInput} type="file" accept="image/*" hidden on:change={(e) => { openImage(e.currentTarget.files?.[0]); e.currentTarget.value = ''; }} />
<input bind:this={trackInput} type="file" accept=".json" hidden on:change={(e) => { openTrackFile(e.currentTarget.files?.[0]); e.currentTarget.value = ''; }} />

<div class="app">
	<header>
		<div class="brand">
			<span class="logo">🤖</span>
			<span class="title">mBot2 Simulator</span>
		</div>

		<button class="tool primary" on:click={() => fileInput.click()}>📂 Open .mblock</button>
		<select
			class="examples-select"
			value=""
			title="Load an example program"
			on:change={(e) => {
				openExample(e.currentTarget.value);
				e.currentTarget.value = '';
			}}
		>
			<option value="" disabled>Examples…</option>
			{#each EXAMPLES as example}
				<option value={example.id}>{example.name}</option>
			{/each}
		</select>
		{#if programName}
			<span class="program" title="Loaded program">{programName}</span>
		{/if}
		<button class="tool" class:pressed={showCode} on:click={() => (showCode = !showCode)} disabled={!entity} title="Show the program's blocks">🧩 Code</button>

		<div class="run-controls">
			<button class="tool go" on:click={run} disabled={robots.length === 0} title="Start the program (like turning the robot on)">
				▶ Run
			</button>
			<button class="tool stop" on:click={stop} disabled={robots.length === 0} title="Stop all scripts and motors">■ Stop</button>
			<button class="tool" on:click={resetRobots} disabled={robots.length === 0} title="Stop and put the robot back at the start">↺ Reset</button>
			{#if running}<span class="status">running…</span>{/if}
		</div>

		<label class="map-select">
			<span>Track</span>
			<select value={mapId} on:change={onMapSelect} disabled={Boolean(editor)}>
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
					<option value="__new">➕ New empty track…</option>
					<option value="__image">📷 Use a picture of a track…</option>
					<option value="__file">📂 Open a track file…</option>
				</optgroup>
			</select>
		</label>
	</header>

	<main class:with-code={showCode && entity && !editor}>
		{#if showCode && entity && !editor}
			<section class="code">
				{#key entity}
					<CodeView {entity} {tick} />
				{/key}
			</section>
		{/if}
		<section class="stage" class:dragover={dragOver}>
			<canvas bind:this={canvas} />

			<div class="stage-tools">
				<button on:click={() => renderer.zoomBy(1.25)} title="Zoom in">＋</button>
				<button on:click={() => renderer.zoomBy(0.8)} title="Zoom out">－</button>
				<button on:click={() => renderer.fit()} title="Show the whole track">⤢</button>
				<span class="sep" />
				<button on:click={addBox} title="Add a box (an obstacle)">📦</button>
				<button class:off={!showTrail} on:click={toggleTrail} title="Draw the robot's path">〰</button>
				<button class:off={!showSensors} on:click={toggleSensors} title="Show what the sensors see">👁</button>
				<button class:off={muted} on:click={toggleMute} title="Sound on/off">{muted ? '🔇' : '🔊'}</button>
				<span class="sep" />
				<button on:click={editCurrentTrack} disabled={Boolean(editor)} title="Edit this track (built-in tracks are copied)">✏️</button>
				{#if currentTrack && !editor}
					<button on:click={() => currentTrack && downloadTrack(currentTrack)} title="Download this track to share it">⬇</button>
					{#if currentSaved}
						<button on:click={deleteCurrentTrack} title="Delete this track from the browser">🗑</button>
					{/if}
				{/if}
			</div>

			{#if editor}
				<TrackTools {editor} version={editorVersion} />
			{/if}

			{#if mounted && currentMapInfo && !editor}
				<div class="map-info">{currentMapInfo.name}: {currentMapInfo.description}</div>
			{/if}

			{#if notice}
				<div class="toast">{notice}</div>
			{/if}

			{#if mounted && robots.length === 0 && !editor}
				<div class="welcome">
					<h1>Welcome! 👋</h1>
					<ol>
						<li>Build your program for <strong>CyberPi / mBot2</strong> in mBlock.</li>
						<li>In mBlock choose <strong>File → Save to your computer</strong>. You get a <code>.mblock</code> file.</li>
						<li>Drop that file here, or click the button below.</li>
					</ol>
					<button class="tool primary big" on:click={() => fileInput.click()}>📂 Open my .mblock file</button>
					<p class="muted">…or try an example:</p>
					<div class="examples">
						{#each EXAMPLES as example}
							<button class="tool" on:click={() => openExample(example.id)}>{example.name}</button>
						{/each}
					</div>
					{#if loadError}<p class="error">{loadError}</p>{/if}
				</div>
			{/if}

			{#if dragOver}
				<div class="drop">Drop your <strong>.mblock</strong> file, a track file or a track picture here</div>
			{/if}
		</section>

		<aside>
			{#if editor}
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
				<p class="help">Scroll to zoom and drag empty floor (with the ↖ tool) to look around. The robots wait at the start while you edit.</p>
			{:else if entity}
				{#if robots.length > 1}
					<div class="tabs">
						{#each robots as robot, i}
							<button class:active={i === selected} on:click={() => selectRobot(i)} style={`--c: ${robot.body.color}`}>
								{robot.name}
							</button>
						{/each}
					</div>
				{/if}

				{#if loadError}<div class="card error">{loadError}</div>{/if}

				<div class="card">
					<CyberpiDevice {entity} {tick} />
				</div>

				<details class="card" open>
					<summary>Sensors</summary>
					<SensorPanel {entity} {world} {tick} />
				</details>

				<details class="card" open>
					<summary>Variables</summary>
					<VariablesPanel {entity} {tick} />
				</details>

				{#if results.length > 0}
					<details class="card" open>
						<summary>🏁 Finish times</summary>
						<table class="results">
							{#each results as r}
								<tr><td>{r.name}</td><td>{r.track}</td><td class="time">{r.seconds} s</td></tr>
							{/each}
						</table>
					</details>
				{/if}

				{#if warnings.length > 0}
					<details class="card warn" open>
						<summary>Heads up ({warnings.length})</summary>
						<ul>
							{#each warnings as warning}<li>{warning}</li>{/each}
						</ul>
					</details>
				{/if}

				<details class="card">
					<summary>Scripts &amp; custom blocks</summary>
					{#key entity}
						<ScriptsPanel {entity} />
					{/key}
				</details>

				<details class="card">
					<summary>Environment</summary>
					<label class="slider">
						<span>Room light (light sensor) <strong>{entity.brightness}</strong></span>
						<input type="range" min="0" max="100" bind:value={entity.brightness} />
					</label>
					<label class="slider">
						<span>Noise (microphone) <strong>{entity.loudness}</strong></span>
						<input type="range" min="0" max="100" bind:value={entity.loudness} />
					</label>
				</details>

				<p class="help">
					Drag the robot to move it, drag the blue dot to turn it. Scroll to zoom, drag the floor to look around.
				</p>
			{:else}
				<div class="card">
					<h2>No program yet</h2>
					<p class="muted">Open an <code>.mblock</code> file to put your mBot2 on the track.</p>
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
	header {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 10px;
		padding: 8px 14px;
		background: var(--panel);
		border-bottom: 1px solid var(--border);
		box-shadow: var(--shadow);
		z-index: 2;
	}
	.brand {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-right: 8px;
		.logo {
			font-size: 22px;
		}
		.title {
			font-weight: 700;
			font-size: 17px;
		}
	}
	.program {
		background: var(--panel-2);
		border: 1px solid var(--border);
		border-radius: 999px;
		padding: 3px 10px;
		max-width: 220px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.run-controls {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-left: auto;
	}
	.status {
		color: var(--go);
		font-weight: 700;
		font-size: 12px;
	}
	.examples-select {
		border: 1px solid var(--border);
		border-radius: 8px;
		padding: 7px 8px;
		background: #fff;
		font-weight: 700;
	}
	.map-select {
		display: flex;
		align-items: center;
		gap: 6px;
		color: var(--muted);
		select {
			border: 1px solid var(--border);
			border-radius: 8px;
			padding: 6px 8px;
			background: #fff;
			color: var(--text);
		}
	}
	.tool {
		border: 1px solid var(--border);
		background: #fff;
		border-radius: 8px;
		padding: 7px 12px;
		font-weight: 700;
		&:hover:not(:disabled) {
			background: var(--panel-2);
		}
		&:disabled {
			opacity: 0.45;
			cursor: not-allowed;
		}
		&.primary {
			background: var(--primary);
			border-color: var(--primary-dark);
			color: #fff;
			&:hover {
				background: var(--primary-dark);
			}
		}
		&.go {
			background: var(--go);
			border-color: var(--go-dark);
			color: #fff;
			padding: 7px 18px;
			&:hover:not(:disabled) {
				background: var(--go-dark);
			}
		}
		&.stop {
			background: var(--stop);
			border-color: var(--stop-dark);
			color: #fff;
			&:hover:not(:disabled) {
				background: var(--stop-dark);
			}
		}
		&.big {
			font-size: 16px;
			padding: 10px 18px;
		}
	}
	main {
		flex: 1;
		min-height: 0;
		display: grid;
		grid-template-columns: 1fr 380px;
		&.with-code {
			grid-template-columns: minmax(260px, 340px) 1fr 380px;
		}
	}
	.code {
		min-height: 0;
		min-width: 0;
		border-right: 1px solid var(--border);
		background: var(--panel);
	}
	.tool.pressed {
		background: #e3f0ff;
		border-color: var(--primary);
	}
	.results {
		width: 100%;
		border-collapse: collapse;
		font-size: 12px;
		td {
			padding: 3px 4px;
			border-bottom: 1px solid var(--border);
		}
		.time {
			text-align: right;
			font-weight: 700;
			font-variant-numeric: tabular-nums;
		}
	}
	.stage {
		position: relative;
		min-width: 0;
		min-height: 0;
		canvas {
			display: block;
			width: 100%;
			height: 100%;
			touch-action: none;
		}
		&.dragover canvas {
			filter: brightness(0.9);
		}
	}
	.stage-tools {
		position: absolute;
		top: 10px;
		left: 10px;
		display: flex;
		flex-direction: column;
		gap: 4px;
		background: rgba(255, 255, 255, 0.92);
		border: 1px solid var(--border);
		border-radius: 10px;
		padding: 4px;
		box-shadow: var(--shadow);
		button {
			width: 34px;
			height: 34px;
			border: none;
			border-radius: 6px;
			background: transparent;
			font-size: 16px;
			&:hover {
				background: var(--panel-2);
			}
			&.off {
				opacity: 0.35;
			}
			&:disabled {
				opacity: 0.3;
				cursor: not-allowed;
			}
		}
		.sep {
			height: 1px;
			background: var(--border);
			margin: 2px 4px;
		}
	}
	.map-info {
		position: absolute;
		left: 56px;
		bottom: 10px;
		background: rgba(255, 255, 255, 0.92);
		border: 1px solid var(--border);
		border-radius: 8px;
		padding: 4px 10px;
		font-size: 12px;
		color: var(--muted);
		pointer-events: none;
	}
	.toast {
		position: absolute;
		top: 10px;
		left: 50%;
		transform: translateX(-50%);
		background: #263238;
		color: #fff;
		border-radius: 8px;
		padding: 8px 14px;
		box-shadow: var(--shadow);
		max-width: 80%;
		text-align: center;
		pointer-events: none;
	}
	.welcome {
		position: absolute;
		inset: 0;
		margin: auto;
		width: min(460px, 90%);
		height: fit-content;
		background: var(--panel);
		border-radius: 16px;
		box-shadow: 0 10px 40px rgba(16, 24, 40, 0.2);
		padding: 24px;
		display: flex;
		flex-direction: column;
		gap: 12px;
		h1 {
			font-size: 24px;
		}
		ol {
			padding-left: 20px;
			display: flex;
			flex-direction: column;
			gap: 6px;
		}
		.examples {
			display: flex;
			flex-wrap: wrap;
			gap: 6px;
		}
	}
	.drop {
		position: absolute;
		inset: 16px;
		border: 3px dashed var(--primary);
		border-radius: 16px;
		background: rgba(30, 136, 229, 0.08);
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 20px;
		color: var(--primary-dark);
		pointer-events: none;
	}
	aside {
		background: var(--bg);
		border-left: 1px solid var(--border);
		overflow-y: auto;
		padding: 10px;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.card {
		background: var(--panel);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 10px;
		box-shadow: var(--shadow);
		summary {
			font-weight: 700;
			cursor: pointer;
			margin-bottom: 8px;
		}
		&:not([open]) summary {
			margin-bottom: 0;
		}
		&.warn {
			background: var(--warn-bg);
			color: var(--warn);
			ul {
				padding-left: 18px;
				font-size: 12px;
				word-break: break-word;
			}
		}
		&.error {
			color: var(--stop-dark);
		}
	}
	.tabs {
		display: flex;
		gap: 4px;
		button {
			flex: 1;
			border: 1px solid var(--border);
			border-bottom: 3px solid var(--c);
			background: #fff;
			border-radius: 8px;
			padding: 6px;
			&.active {
				background: var(--c);
				color: #fff;
			}
		}
	}
	.slider {
		display: flex;
		flex-direction: column;
		gap: 2px;
		margin-bottom: 8px;
		font-size: 12px;
		color: var(--muted);
	}
	.help,
	.muted {
		color: var(--muted);
		font-size: 12px;
	}
	.error {
		color: var(--stop-dark);
	}
	code {
		background: var(--panel-2);
		border-radius: 4px;
		padding: 0 4px;
	}
	@media (max-width: 900px) {
		main,
		main.with-code {
			grid-template-columns: 1fr;
			grid-template-rows: auto;
			overflow-y: auto;
		}
		.stage {
			height: 60vh;
			order: -1;
		}
		.code {
			max-height: 70vh;
			border-right: none;
			border-top: 1px solid var(--border);
		}
		aside {
			border-left: none;
			border-top: 1px solid var(--border);
			overflow: visible;
		}
		.run-controls {
			margin-left: 0;
		}
	}
</style>
