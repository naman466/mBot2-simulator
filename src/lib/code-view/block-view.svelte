<script lang="ts">
	import SlotView from './slot-view.svelte';
	import type { BlockView } from './build';

	export let block: BlockView;
	export let running: Set<string>;

	$: active = running.has(block.id);
	$: style = `--bg: ${block.category.color}; --edge: ${block.category.border};`;
</script>

{#if block.shape === 'c'}
	<div class="c" class:active {style}>
		<div class="row top">
			{#each block.parts as slot}
				<SlotView part={slot} {running} />
			{/each}
		</div>
		{#each block.branches as branch, i}
			{#if i === 1 && block.elseLabel}
				<div class="row middle"><span>else</span></div>
			{/if}
			<div class="mouth">
				<div class="arm" />
				<div class="inner">
					{#each branch as child (child.id)}
						<svelte:self block={child} {running} />
					{/each}
					{#if branch.length === 0}<div class="placeholder" />{/if}
				</div>
			</div>
		{/each}
		<div class="row bottom" />
	</div>
{:else}
	<div class={`block ${block.shape}`} class:active {style}>
		{#each block.parts as slot}
			<SlotView part={slot} {running} />
		{/each}
	</div>
{/if}

<style lang="scss">
	.block,
	.row {
		background: var(--bg);
		border: 1px solid var(--edge);
		color: #fff;
		font-size: 12px;
		font-weight: 700;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 4px;
		line-height: 1.2;
	}
	.block {
		width: fit-content;
		max-width: 100%;
		padding: 5px 8px;
		border-radius: 4px;
		margin-bottom: 2px;
		&.hat {
			border-radius: 18px 18px 4px 4px / 12px 12px 4px 4px;
			padding-top: 10px;
			min-width: 120px;
		}
		&.cap {
			border-radius: 4px 4px 2px 2px;
		}
		&.reporter {
			border-radius: 999px;
			padding: 2px 8px;
			margin: 0;
		}
		&.boolean {
			padding: 2px 12px;
			margin: 0;
			clip-path: polygon(8px 0, calc(100% - 8px) 0, 100% 50%, calc(100% - 8px) 100%, 8px 100%, 0 50%);
			border: none;
		}
		&.active {
			box-shadow: 0 0 0 2px #fff, 0 0 8px 3px #ffe600;
		}
	}
	.c {
		width: fit-content;
		max-width: 100%;
		margin-bottom: 2px;
		.row {
			padding: 5px 8px;
		}
		.top {
			border-radius: 4px 4px 0 0;
			border-bottom: none;
		}
		.middle {
			border-top: none;
			border-bottom: none;
		}
		.bottom {
			height: 12px;
			border-radius: 0 0 4px 4px;
			border-top: none;
			min-width: 60px;
		}
		.mouth {
			display: flex;
		}
		.arm {
			width: 14px;
			flex: none;
			background: var(--bg);
			border-left: 1px solid var(--edge);
		}
		.inner {
			padding: 2px 0 2px 2px;
			min-width: 40px;
		}
		.placeholder {
			height: 14px;
		}
		&.active > .row,
		&.active > .mouth > .arm {
			box-shadow: 0 0 6px 2px #ffe600;
		}
	}
</style>
