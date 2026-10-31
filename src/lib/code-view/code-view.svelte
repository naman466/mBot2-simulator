<script lang="ts">
	import BlockView from './block-view.svelte';
	import { CodeBuilder } from './build';
	import { live } from '../live';
	import type { MBot2 } from '../../mblock/targets/mbot2';
	import { speaker } from '../../sim/audio';

	export let entity: MBot2;
	export let tick = 0;

	let zoom = 1;

	$: scripts = new CodeBuilder(entity).scripts();
	$: running = live(tick, new Set(entity.runningBlockIds()));
	$: runningScripts = live(tick, new Set(scripts.map((s) => s[0]?.id).filter((id) => id && entity.isScriptRunning(id))));

	/** Clicking a hat block runs its script, like clicking it in mBlock. */
	async function runScript(firstId: string | undefined) {
		if (!firstId) return;
		const block = entity.getBlock(firstId);
		if (!block || !entity.isHatBlock(block.opcode)) return;
		speaker.unlock();
		const events = entity.getEvents();
		const event = events.find((e) => e.opcode === block.opcode);
		if (block.opcode === 'cyberpi.cyberpi_when_button_press' || block.opcode === 'cyberpi.cyberpi_when_direction_key_press') {
			const option = String(block.fields['fieldMenu_2']?.[0] ?? event?.option ?? '');
			entity.press(option as any);
			setTimeout(() => entity.release(option as any), 150);
		} else {
			entity.runHatBlocks(block.opcode, event?.option);
		}
	}
</script>

<div class="code-view">
	<div class="toolbar">
		<span class="title">🧩 Code: <strong>{entity.name}</strong></span>
		<span class="zoom">
			<button on:click={() => (zoom = Math.max(0.6, zoom - 0.1))} title="Smaller">A−</button>
			<button on:click={() => (zoom = Math.min(1.6, zoom + 0.1))} title="Bigger">A+</button>
		</span>
	</div>
	<p class="hint">Glowing blocks are running right now. Click a hat block (the top of a script) to run that script.</p>
	<div class="scripts" style={`zoom: ${zoom}`}>
		{#each scripts as script, i (script[0]?.id ?? i)}
			<div
				class="script"
				class:running={runningScripts.has(script[0]?.id)}
				on:click={() => runScript(script[0]?.id)}
				on:keydown={(e) => e.key === 'Enter' && runScript(script[0]?.id)}
				role="button"
				tabindex="0"
			>
				{#each script as block (block.id)}
					<BlockView {block} {running} />
				{/each}
			</div>
		{/each}
		{#if scripts.length === 0}
			<p class="hint">This program has no blocks.</p>
		{/if}
	</div>
</div>

<style lang="scss">
	.code-view {
		display: flex;
		flex-direction: column;
		height: 100%;
		min-height: 0;
	}
	.toolbar {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 8px 10px;
		border-bottom: 1px solid var(--border);
		background: var(--panel);
		.zoom button {
			border: 1px solid var(--border);
			background: #fff;
			border-radius: 6px;
			padding: 2px 6px;
			font-size: 11px;
		}
	}
	.hint {
		color: var(--muted);
		font-size: 11px;
		padding: 6px 10px 0;
	}
	.scripts {
		flex: 1;
		overflow: auto;
		padding: 10px;
		display: flex;
		flex-direction: column;
		gap: 16px;
		background-color: #f9f9fb;
		background-image: radial-gradient(#dde1e8 1px, transparent 1px);
		background-size: 16px 16px;
	}
	.script {
		width: fit-content;
		max-width: 100%;
		border-radius: 8px;
		padding: 2px;
		cursor: pointer;
		outline: none;
		&.running {
			box-shadow: 0 0 0 3px #ffe600, 0 0 14px 4px rgba(255, 230, 0, 0.6);
		}
		&:focus-visible {
			box-shadow: 0 0 0 3px var(--primary);
		}
	}
</style>
