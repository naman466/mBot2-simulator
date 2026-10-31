<script lang="ts">
	import { live } from './live';
	import { onDestroy } from 'svelte';
	import type { MBot2 } from '../mblock/targets/mbot2';
	import type { ButtonName, JoystickDirection } from '../mblock/targets/cyberpi';
	import { drawDisplay, SCREEN_SIZE } from '../sim/display';
	import Icon from './ui/icon.svelte';

	export let entity: MBot2;
	export let tick = 0;

	let canvas: HTMLCanvasElement;
	let unsubscribe: (() => void) | null = null;
	let pending = false;

	const render = () => {
		if (pending) return;
		pending = true;
		requestAnimationFrame(() => {
			pending = false;
			if (!canvas) return;
			const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
			ctx.setTransform(canvas.width / SCREEN_SIZE, 0, 0, canvas.height / SCREEN_SIZE, 0, 0);
			drawDisplay(ctx, entity.display);
		});
	};

	$: if (canvas && entity) {
		unsubscribe?.();
		unsubscribe = entity.display.onChange(render);
		render();
	}
	onDestroy(() => unsubscribe?.());

	$: leds = live(tick, entity.body.leds.map(([r, g, b]) => (r + g + b > 0 ? `rgb(${r},${g},${b})` : '')));
	$: brightness = live(tick, entity.body.ledBrightness / 100);

	const down = (name: ButtonName | JoystickDirection) => (e: PointerEvent) => {
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		entity.press(name);
	};
	const up = (name: ButtonName | JoystickDirection) => () => entity.release(name);

	/** Joystick directions and how far to rotate the caret icon. */
	const JOYSTICK: [JoystickDirection, number][] = [['up', 0], ['left', -90], ['middle', -1], ['right', 90], ['down', 180]];
</script>

<div class="device">
	<div class="body">
		<div class="side">
			<button class="btn-a" title="Button A (key A)" on:pointerdown={down('a')} on:pointerup={up('a')} on:pointercancel={up('a')}>A</button>
		</div>
		<div class="center">
			<canvas bind:this={canvas} width="256" height="256" aria-label="CyberPi screen" />
			<div class="leds">
				{#each leds as color, i}
					<span
						class="led"
						class:on={color !== ''}
						style={color ? `background:${color}; box-shadow: 0 0 ${10 * brightness}px ${color}; opacity:${0.35 + 0.65 * brightness}` : ''}
						title={`LED ${i + 1}`}
					/>
				{/each}
			</div>
		</div>
		<div class="side">
			<div class="joystick" title="Joystick (arrow keys, Enter = press)">
				{#each JOYSTICK as [dir, angle]}
					<button
						class={`dir ${dir}`}
						on:pointerdown={down(dir)}
						on:pointerup={up(dir)}
						on:pointercancel={up(dir)}>{#if angle < 0}<span class="dot" />{:else}<span style={`display:inline-grid;transform:rotate(${angle}deg)`}><Icon name="caret" size={12} /></span>{/if}</button
					>
				{/each}
			</div>
			<button class="btn-b" title="Button B (key B)" on:pointerdown={down('b')} on:pointerup={up('b')} on:pointercancel={up('b')}>B</button>
		</div>
	</div>
	<p class="hint">Keys: <kbd>A</kbd> <kbd>B</kbd> buttons · <kbd>↑</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd> joystick · <kbd>Enter</kbd> press</p>
</div>

<style lang="scss">
	.device {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
	}
	.body {
		display: grid;
		grid-template-columns: 56px auto 76px;
		align-items: center;
		gap: 10px;
		background: linear-gradient(160deg, #f8fafc, #e3e8ee);
		border: 1px solid #c9d2dc;
		border-radius: 18px;
		padding: 12px 10px;
		box-shadow: inset 0 1px 0 #fff, var(--shadow);
	}
	.center {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
	}
	canvas {
		width: 168px;
		height: 168px;
		border-radius: 6px;
		border: 4px solid #1b1f24;
		background: #000;
	}
	.leds {
		display: flex;
		gap: 10px;
	}
	.led {
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: #cfd8dc;
		border: 1px solid rgba(0, 0, 0, 0.15);
	}
	.side {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 14px;
	}
	.btn-a,
	.btn-b {
		width: 44px;
		height: 44px;
		border-radius: 50%;
		border: none;
		font-weight: 700;
		font-size: 18px;
		color: #fff;
		box-shadow: 0 3px 0 rgba(0, 0, 0, 0.25);
		touch-action: none;
		user-select: none;
		&:active {
			transform: translateY(2px);
			box-shadow: 0 1px 0 rgba(0, 0, 0, 0.25);
		}
	}
	.btn-a {
		background: #ef5350;
	}
	.btn-b {
		background: #42a5f5;
	}
	.joystick {
		display: grid;
		grid-template-columns: repeat(3, 24px);
		grid-template-rows: repeat(3, 24px);
		gap: 2px;
		.dir {
			border: none;
			border-radius: 6px;
			background: #455a64;
			color: #fff;
			font-size: 10px;
			padding: 0;
			touch-action: none;
			user-select: none;
			&:active {
				background: #263238;
			}
		}
		.up { grid-area: 1 / 2; }
		.left { grid-area: 2 / 1; }
		.middle { grid-area: 2 / 2; background: #78909c; }
		.right { grid-area: 2 / 3; }
		.down { grid-area: 3 / 2; }
	}
	.hint {
		color: var(--muted);
		font-size: 11px;
		text-align: center;
	}
	kbd {
		background: var(--panel-2);
		border: 1px solid var(--border);
		border-radius: 3px;
		padding: 0 3px;
		font-size: 10px;
	}
</style>
