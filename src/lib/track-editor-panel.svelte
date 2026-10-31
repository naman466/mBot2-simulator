<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import type { TrackEditor } from '../sim/track-editor';
	import { SWATCHES } from '../sim/colors';
	import { live } from './live';

	export let editor: TrackEditor;
	export let version = 0;
	export let saved = false;

	const dispatch = createEventDispatcher<{ save: void; download: void; done: void; discard: void }>();

	const TAPE_COLORS = ['#111111', SWATCHES.red, SWATCHES.yellow, SWATCHES.green, SWATCHES.cyan, SWATCHES.blue, SWATCHES.purple];
	const ZONE_COLORS = [SWATCHES.red, SWATCHES.yellow, SWATCHES.green, SWATCHES.cyan, SWATCHES.blue, SWATCHES.purple, '#111111', '#ffffff'];
	const WALL_COLORS = ['#8d6e63', '#ff8f00', '#43a047', '#e53935', '#1e88e5', '#8e24aa'];
	const DIRECTIONS: { deg: number; icon: string; name: string }[] = [
		{ deg: -90, icon: '⬆', name: 'up' },
		{ deg: 0, icon: '➡', name: 'right' },
		{ deg: 90, icon: '⬇', name: 'down' },
		{ deg: 180, icon: '⬅', name: 'left' },
	];
	const HINTS: Record<string, string> = {
		select: 'Click something to select it. Drag to move, drag the blue corner to resize, Delete to remove.',
		tape: 'Click to add points of a tape line. Double-click or Enter to finish, click the first point to close a loop. Hold Shift for straight angles.',
		draw: 'Drag to draw tape freehand.',
		zone: 'Drag to paint a colored area (a click makes a 30×30 cm square).',
		wall: 'Drag to place a wall or box. The robot can bump into it and the ultrasonic sensor sees it.',
		ramp: 'Drag to place a ramp. It slows the robot uphill and tilts CyberPi (tilt and gyro blocks).',
		finish: 'Drag to place a finish zone. Reaching it shows the time since ▶ Run.',
		text: 'Click to place the label text below.',
		start: 'Click where the robot starts, or drag to also set the direction it faces.',
		erase: 'Click a piece of the track to remove it.',
	};

	$: doc = live(version, editor.doc);
	$: tool = live(version, editor.tool);
	$: selected = live(version, editor.selected);
	$: options = live(version, editor.options);

	function setOption<K extends keyof typeof editor.options>(key: K, value: (typeof editor.options)[K]) {
		editor.options[key] = value;
		editor.onUiChange();
	}

	function setSize(key: 'width' | 'height', value: number) {
		const v = Math.round(Math.max(60, Math.min(600, value || 0)));
		editor.change((d) => {
			d[key] = v;
			d.spawn.x = Math.min(d.spawn.x, d.width);
			d.spawn.y = Math.min(d.spawn.y, d.height);
		});
	}
</script>

<div class="panel">
	<div class="title-row">
		<strong>✏️ Track editor</strong>
		<span class="badge" class:saved>{saved ? 'saved' : 'not saved'}</span>
	</div>

	<label class="field">
		<span>Name</span>
		<input value={doc.name} on:change={(e) => editor.change((d) => (d.name = e.currentTarget.value || 'My track'))} />
	</label>
	<div class="row">
		<label class="field"><span>Width (cm)</span><input type="number" min="60" max="600" value={doc.width} on:change={(e) => setSize('width', +e.currentTarget.value)} /></label>
		<label class="field"><span>Height (cm)</span><input type="number" min="60" max="600" value={doc.height} on:change={(e) => setSize('height', +e.currentTarget.value)} /></label>
		<label class="field"><span>Mat</span><input type="color" value={doc.background} on:change={(e) => editor.change((d) => (d.background = e.currentTarget.value))} /></label>
	</div>
	<label class="check"><input type="checkbox" checked={options.snap} on:change={(e) => setOption('snap', e.currentTarget.checked)} /> Snap to 5 cm grid (hold Alt to place freely)</label>

	<p class="hint">{HINTS[tool]}</p>

	{#if tool === 'tape' || tool === 'draw' || tool === 'text'}
		<div class="group">
			<span class="group-title">{tool === 'text' ? 'Label color' : 'Tape color'}</span>
			<div class="swatches">
				{#each TAPE_COLORS as c}
					<button class="swatch" class:on={options.tapeColor === c} style={`background:${c}`} on:click={() => setOption('tapeColor', c)} aria-label={c} />
				{/each}
			</div>
			{#if tool !== 'text'}
				<label class="field"><span>Tape width: {options.tapeWidth} cm</span><input type="range" min="1" max="6" step="0.2" value={options.tapeWidth} on:input={(e) => setOption('tapeWidth', +e.currentTarget.value)} /></label>
			{:else}
				<label class="field"><span>Text</span><input value={options.text} on:input={(e) => setOption('text', e.currentTarget.value)} /></label>
				<label class="field"><span>Size: {options.textSize} cm</span><input type="range" min="3" max="30" value={options.textSize} on:input={(e) => setOption('textSize', +e.currentTarget.value)} /></label>
			{/if}
		</div>
	{:else if tool === 'zone'}
		<div class="group">
			<span class="group-title">Zone color</span>
			<div class="swatches">
				{#each ZONE_COLORS as c}
					<button class="swatch" class:on={options.zoneColor === c} style={`background:${c}`} on:click={() => setOption('zoneColor', c)} aria-label={c} />
				{/each}
			</div>
		</div>
	{:else if tool === 'wall'}
		<div class="group">
			<span class="group-title">Wall color</span>
			<div class="swatches">
				{#each WALL_COLORS as c}
					<button class="swatch" class:on={options.wallColor === c} style={`background:${c}`} on:click={() => setOption('wallColor', c)} aria-label={c} />
				{/each}
			</div>
		</div>
	{:else if tool === 'ramp'}
		<div class="group">
			<label class="field"><span>Steepness: {options.rampAngle}°</span><input type="range" min="3" max="35" value={options.rampAngle} on:input={(e) => setOption('rampAngle', +e.currentTarget.value)} /></label>
			<span class="group-title">Goes up towards</span>
			<div class="dirs">
				{#each DIRECTIONS as d}
					<button class:on={options.rampUphill === d.deg} on:click={() => setOption('rampUphill', d.deg)} title={d.name}>{d.icon}</button>
				{/each}
			</div>
		</div>
	{/if}

	{#if selected && tool === 'select'}
		<div class="group selected">
			<span class="group-title">Selected: {selected.kind}</span>
			{#if selected.kind === 'tape'}
				<div class="swatches">
					{#each TAPE_COLORS as c}
						<button class="swatch" class:on={selected.color === c} style={`background:${c}`} on:click={() => editor.updateSelected({ color: c })} aria-label={c} />
					{/each}
				</div>
				<label class="field"><span>Width: {selected.width} cm</span><input type="range" min="1" max="6" step="0.2" value={selected.width} on:change={(e) => editor.updateSelected({ width: +e.currentTarget.value })} /></label>
			{:else if selected.kind === 'zone'}
				<div class="swatches">
					{#each ZONE_COLORS as c}
						<button class="swatch" class:on={selected.color === c} style={`background:${c}`} on:click={() => editor.updateSelected({ color: c })} aria-label={c} />
					{/each}
				</div>
			{:else if selected.kind === 'wall'}
				<label class="check"><input type="checkbox" checked={selected.movable} on:change={(e) => editor.updateSelected({ movable: e.currentTarget.checked })} /> Students can drag it while driving</label>
			{:else if selected.kind === 'ramp'}
				<label class="field"><span>Steepness: {selected.angleDeg}°</span><input type="range" min="3" max="35" value={selected.angleDeg} on:change={(e) => editor.updateSelected({ angleDeg: +e.currentTarget.value })} /></label>
				<div class="dirs">
					{#each DIRECTIONS as d}
						<button class:on={selected.uphillDeg === d.deg} on:click={() => editor.updateSelected({ uphillDeg: d.deg })} title={d.name}>{d.icon}</button>
					{/each}
				</div>
			{:else if selected.kind === 'text'}
				<label class="field"><span>Text</span><input value={selected.text} on:change={(e) => editor.updateSelected({ text: e.currentTarget.value })} /></label>
			{/if}
			<div class="row buttons">
				<button on:click={() => editor.reorderSelected(true)}>Bring to front</button>
				<button on:click={() => editor.reorderSelected(false)}>Send to back</button>
				<button class="danger" on:click={() => editor.deleteSelected()}>Delete</button>
			</div>
		</div>
	{/if}

	<div class="row buttons main">
		<button class="primary" on:click={() => dispatch('save')}>💾 Save</button>
		<button on:click={() => dispatch('download')} title="Download a file to share with students">⬇ Share file</button>
		<button class="go" on:click={() => dispatch('done')}>✔ Done</button>
	</div>
	<button class="link" on:click={() => dispatch('discard')}>Discard changes</button>
</div>

<style lang="scss">
	.panel {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.title-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	.badge {
		font-size: 11px;
		padding: 1px 8px;
		border-radius: 999px;
		background: var(--warn-bg);
		color: var(--warn);
		&.saved {
			background: #e8f5e9;
			color: #2e7d32;
		}
	}
	.row {
		display: flex;
		gap: 6px;
		flex-wrap: wrap;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 2px;
		font-size: 12px;
		color: var(--muted);
		flex: 1;
		input:not([type='range']):not([type='color']) {
			border: 1px solid var(--border);
			border-radius: 6px;
			padding: 4px 6px;
			color: var(--text);
			min-width: 0;
		}
		input[type='color'] {
			height: 28px;
			width: 44px;
			border: 1px solid var(--border);
			border-radius: 6px;
			padding: 1px;
		}
	}
	.check {
		font-size: 12px;
		color: var(--muted);
		display: flex;
		gap: 6px;
		align-items: center;
	}
	.hint {
		font-size: 12px;
		background: #f0f7ff;
		border: 1px solid #cfe3fb;
		border-radius: 8px;
		padding: 6px 8px;
		color: #24527a;
	}
	.group {
		display: flex;
		flex-direction: column;
		gap: 6px;
		background: var(--panel-2);
		border-radius: 8px;
		padding: 8px;
		&.selected {
			border: 1px solid #cfe3fb;
		}
	}
	.group-title {
		font-size: 12px;
		font-weight: 700;
	}
	.swatches {
		display: flex;
		gap: 6px;
		flex-wrap: wrap;
	}
	.swatch {
		width: 24px;
		height: 24px;
		border-radius: 50%;
		border: 2px solid #fff;
		box-shadow: 0 0 0 1px var(--border);
		&.on {
			box-shadow: 0 0 0 2px var(--primary);
		}
	}
	.dirs {
		display: flex;
		gap: 4px;
		button {
			width: 34px;
			height: 30px;
			border: 1px solid var(--border);
			background: #fff;
			border-radius: 6px;
			&.on {
				background: #e3f0ff;
				border-color: var(--primary);
			}
		}
	}
	.buttons button {
		border: 1px solid var(--border);
		background: #fff;
		border-radius: 8px;
		padding: 5px 10px;
		font-weight: 700;
		font-size: 12px;
		&.primary {
			background: var(--primary);
			border-color: var(--primary-dark);
			color: #fff;
		}
		&.go {
			background: var(--go);
			border-color: var(--go-dark);
			color: #fff;
		}
		&.danger {
			color: var(--stop-dark);
		}
	}
	.main {
		margin-top: 4px;
	}
	.link {
		border: none;
		background: none;
		color: var(--muted);
		font-size: 12px;
		text-decoration: underline;
		align-self: flex-start;
	}
</style>
