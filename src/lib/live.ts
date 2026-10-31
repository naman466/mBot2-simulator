/**
 * Returns `value` unchanged. Passing the UI `tick` makes a Svelte reactive
 * statement re-run on every tick: `$: distance = live(tick, world.readUltrasonic(body))`.
 */
export function live<T>(_tick: number, value: T): T {
	return value;
}
