<script lang="ts">
	import { ICONS } from './icons';

	export let name: string;
	export let size = 18;
	export let stroke = 2;
</script>

<svg
	class="icon"
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width={stroke}
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true"
	>{@html ICONS[name] ?? ''}</svg
>

<style>
	.icon {
		flex: none;
		display: inline-block;
		vertical-align: middle;
	}
</style>
