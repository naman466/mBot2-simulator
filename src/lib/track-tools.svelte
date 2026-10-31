<script lang="ts">
	import type { TrackEditor, Tool } from '../sim/track-editor';
	import { live } from './live';
	import Icon from './ui/icon.svelte';

	export let editor: TrackEditor;
	export let version = 0;

	const TOOLS: { tool: Tool; icon: string; label: string }[] = [
		{ tool: 'select', icon: 'pointer', label: 'Select & move' },
		{ tool: 'tape', icon: 'ruler', label: 'Tape line (click points)' },
		{ tool: 'draw', icon: 'pen', label: 'Freehand tape' },
		{ tool: 'zone', icon: 'zone', label: 'Color zone' },
		{ tool: 'wall', icon: 'wall', label: 'Wall / box' },
		{ tool: 'ramp', icon: 'ramp', label: 'Ramp (slope)' },
		{ tool: 'finish', icon: 'flag', label: 'Finish zone' },
		{ tool: 'text', icon: 'text', label: 'Label' },
		{ tool: 'start', icon: 'pin', label: 'Start position' },
		{ tool: 'erase', icon: 'eraser', label: 'Eraser' },
	];

	$: current = live(version, editor.tool);
	$: canUndo = live(version, editor.canUndo);
	$: canRedo = live(version, editor.canRedo);
</script>

<div class="tools" role="toolbar" aria-label="Track editor tools">
	{#each TOOLS as t}
		<button class:active={current === t.tool} title={t.label} on:click={() => editor.setTool(t.tool)}>
			<span class="icon"><Icon name={t.icon} /></span>
			<span class="label">{t.label.split(' ')[0]}</span>
		</button>
	{/each}
	<span class="sep" />
	<button title="Undo (Ctrl+Z)" disabled={!canUndo} on:click={() => editor.undo()}><span class="icon"><Icon name="undo" /></span><span class="label">Undo</span></button>
	<button title="Redo (Ctrl+Y)" disabled={!canRedo} on:click={() => editor.redo()}><span class="icon"><Icon name="redo" /></span><span class="label">Redo</span></button>
</div>

<style lang="scss">
	.tools {
		position: absolute;
		top: 10px;
		left: 56px;
		right: 10px;
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		background: rgba(255, 255, 255, 0.95);
		border: 1px solid var(--border);
		border-radius: 10px;
		padding: 4px;
		box-shadow: var(--shadow);
		width: fit-content;
		max-width: calc(100% - 66px);
	}
	button {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1px;
		border: 1px solid transparent;
		background: transparent;
		border-radius: 8px;
		padding: 3px 6px;
		min-width: 46px;
		&:hover:not(:disabled) {
			background: var(--panel-2);
		}
		&.active {
			background: var(--primary-soft);
			border-color: transparent;
			color: var(--primary-dark);
			.label {
				color: var(--primary-dark);
			}
		}
		&:disabled {
			opacity: 0.35;
		}
	}
	.icon {
		display: grid;
		place-items: center;
		height: 20px;
		color: inherit;
	}
	.label {
		font-size: 10px;
		color: var(--muted);
	}
	.sep {
		width: 1px;
		background: var(--border);
		margin: 2px 2px;
	}
</style>
