<script lang="ts">
	import BlockView from './block-view.svelte';
	import type { Slot } from './build';

	export let part: Slot;
	$: slot = part;
	export let running: Set<string>;
</script>

{#if slot.kind === 'text'}
	<span class="text">{slot.text}</span>
{:else if slot.kind === 'literal'}
	<span class="literal" class:numeric={slot.numeric}>{slot.text}</span>
{:else if slot.kind === 'color'}
	<span class="swatch" style={`background:${slot.color}`} />
{:else if slot.kind === 'leds'}
	<span class="leds">{#each slot.colors as c}<i style={`background:${c}`} />{/each}</span>
{:else if slot.kind === 'menu'}
	<span class="menu">{slot.text} ▾</span>
{:else if slot.kind === 'variable'}
	<span class="variable" class:list={slot.list}>{slot.text}</span>
{:else if slot.kind === 'empty'}
	<span class="empty" class:bool={slot.boolean} />
{:else if slot.kind === 'block'}
	<BlockView block={slot.block} {running} />
{/if}

<style lang="scss">
	.text {
		white-space: nowrap;
	}
	.literal {
		background: #fff;
		color: #575e75;
		border-radius: 4px;
		padding: 1px 7px;
		min-width: 18px;
		text-align: center;
		font-weight: 600;
		&.numeric {
			border-radius: 999px;
		}
	}
	.swatch {
		width: 22px;
		height: 14px;
		border-radius: 999px;
		border: 2px solid #fff;
	}
	.leds {
		display: inline-flex;
		gap: 2px;
		background: rgba(0, 0, 0, 0.2);
		padding: 2px 4px;
		border-radius: 4px;
		i {
			width: 8px;
			height: 8px;
			border-radius: 50%;
		}
	}
	.menu {
		background: rgba(0, 0, 0, 0.18);
		border: 1px solid rgba(0, 0, 0, 0.15);
		border-radius: 4px;
		padding: 1px 6px;
		white-space: nowrap;
	}
	.variable {
		background: #ff8c1a;
		border: 1px solid #db6e00;
		border-radius: 999px;
		padding: 1px 7px;
		&.list {
			background: #ff661a;
		}
	}
	.empty {
		width: 24px;
		height: 14px;
		border-radius: 999px;
		background: rgba(0, 0, 0, 0.15);
		&.bool {
			clip-path: polygon(6px 0, calc(100% - 6px) 0, 100% 50%, calc(100% - 6px) 100%, 6px 100%, 0 50%);
			border-radius: 0;
		}
	}
</style>
