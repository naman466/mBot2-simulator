<script lang="ts">
	import { live } from './live';
	import type { Std } from '../mblock/targets/std';
	import { toText } from '../mblock/values';

	export let entity: Std;
	export let tick = 0;

	$: entries = live(tick, entity.getVariableEntries());
</script>

{#if entries.length > 0}
	<table>
		{#each entries as v (v.id)}
			<tr>
				<td class="name">{v.isList ? '☰ ' : ''}{v.name}</td>
				<td class="value">{v.isList ? `[${v.value.map(toText).join(', ')}]` : toText(v.value)}</td>
			</tr>
		{/each}
	</table>
{:else}
	<p class="empty">This program has no variables.</p>
{/if}

<style lang="scss">
	table {
		width: 100%;
		border-collapse: collapse;
	}
	td {
		padding: 4px 6px;
		border-bottom: 1px solid var(--border);
	}
	.name {
		color: var(--muted);
		white-space: nowrap;
	}
	.value {
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		text-align: right;
		word-break: break-all;
	}
	.empty {
		color: var(--muted);
	}
</style>
