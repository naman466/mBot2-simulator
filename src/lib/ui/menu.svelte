<script lang="ts">
	import { onDestroy } from 'svelte';
	import Icon from './icon.svelte';

	export let label: string;
	export let icon: string | null = null;
	export let align: 'left' | 'right' = 'left';

	let open = false;
	let root: HTMLDivElement;

	function onDocumentPointer(e: PointerEvent) {
		if (open && root && !root.contains(e.target as Node)) open = false;
	}
	function onKey(e: KeyboardEvent) {
		if (e.key === 'Escape') open = false;
	}

	$: if (typeof document !== 'undefined') {
		if (open) {
			document.addEventListener('pointerdown', onDocumentPointer, true);
			document.addEventListener('keydown', onKey);
		} else {
			document.removeEventListener('pointerdown', onDocumentPointer, true);
			document.removeEventListener('keydown', onKey);
		}
	}
	onDestroy(() => {
		if (typeof document === 'undefined') return;
		document.removeEventListener('pointerdown', onDocumentPointer, true);
		document.removeEventListener('keydown', onKey);
	});

	/** Any click on an item inside the menu closes it. */
	function onMenuClick(e: MouseEvent) {
		if ((e.target as HTMLElement).closest('button')) open = false;
	}
</script>

<div class="menu" bind:this={root}>
	<button class="trigger" class:open aria-haspopup="menu" aria-expanded={open} on:click={() => (open = !open)}>
		{#if icon}<Icon name={icon} size={17} />{/if}
		<span>{label}</span>
		<Icon name="chevronDown" size={14} />
	</button>
	{#if open}
		<div class="popover" class:right={align === 'right'} role="menu" on:click={onMenuClick} on:keydown={() => {}}>
			<slot />
		</div>
	{/if}
</div>

<style lang="scss">
	.menu {
		position: relative;
	}
	.trigger {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		height: 36px;
		padding: 0 10px 0 12px;
		border: 1px solid var(--border);
		background: var(--panel);
		border-radius: var(--radius-sm);
		font-weight: 600;
		color: var(--text-2);
		&:hover,
		&.open {
			background: var(--panel-2);
			border-color: var(--border-strong);
		}
	}
	.popover {
		position: absolute;
		top: calc(100% + 6px);
		left: 0;
		z-index: 50;
		min-width: 260px;
		max-height: 70vh;
		overflow-y: auto;
		background: var(--panel);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		box-shadow: var(--shadow-lg);
		padding: 6px;
		&.right {
			left: auto;
			right: 0;
		}
		:global(button) {
			display: flex;
			align-items: center;
			gap: 10px;
			width: 100%;
			text-align: left;
			border: none;
			background: none;
			padding: 8px 10px;
			border-radius: var(--radius-sm);
			color: var(--text);
		}
		:global(button:hover) {
			background: var(--primary-soft);
			color: var(--primary-dark);
		}
		:global(.menu-label) {
			padding: 8px 10px 4px;
			font-size: 11px;
			font-weight: 700;
			letter-spacing: 0.04em;
			text-transform: uppercase;
			color: var(--muted);
		}
		:global(.menu-sep) {
			height: 1px;
			background: var(--border);
			margin: 6px 4px;
		}
		:global(.menu-hint) {
			margin-left: auto;
			font-size: 12px;
			color: var(--muted);
		}
	}
</style>
