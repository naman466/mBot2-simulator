<script lang="ts">
	import type { ArgType, ProcedureDefinition } from '../mblock/targets/std';
	import type { MBot2 } from '../mblock/targets/mbot2';
	import type { ProcedureArgs } from '../mblock/context';
	import { speaker } from '../sim/audio';
	import Icon from './ui/icon.svelte';

	export let entity: MBot2;

	const LABELS: Record<string, (option: any) => string> = {
		'cyberpi.cyberpi_when_launch': () => 'when CyberPi starts up',
		'cyberpi.cyberpi_when_button_press': (o) => `when button ${String(o).toUpperCase()} is pressed`,
		'cyberpi.cyberpi_when_direction_key_press': (o) => `when joystick ${o}`,
		'cyberpi.cyberpi_wifi_broadcast_when_received_message': (o) => `when I receive LAN message "${o}"`,
		event_whenbroadcastreceived: (o) => `when I receive "${o}"`,
		'cyberpi.cyberpi_when_sensor_value_bigger_or_smaller_than': () => 'when sensor value passes a limit',
		'cyberpi.cyberpi_when_detect_action': (o) => `when CyberPi ${o}`,
		'cyberpi.cyberpi_when_detect_attitude': (o) => `when CyberPi ${o}`,
	};

	$: events = entity.getEvents();

	let procedures: ProcedureDefinition[] = [];
	let args: { [index: string]: ProcedureArgs } = {};
	$: entity.getProcedures().then((list) => {
		procedures = list;
		const next: typeof args = {};
		for (const { procCode, argDefs } of list) {
			next[procCode] = {};
			for (const { name, default_ } of argDefs) next[procCode][name] = default_;
		}
		args = next;
	});

	const label = (opcode: string, option: any) => (LABELS[opcode] ?? ((o: any) => `${opcode}${o ? ` "${o}"` : ''}`))(option);

	const fire = (opcode: string, option: any) => {
		speaker.unlock();
		if (opcode === 'cyberpi.cyberpi_when_button_press' || opcode === 'cyberpi.cyberpi_when_direction_key_press') {
			entity.press(option);
			setTimeout(() => entity.release(option), 150);
		} else entity.runHatBlocks(opcode, option);
	};

	const setArg = (procCode: string, name: string, type: ArgType, e: Event) => {
		const target = e.target as HTMLInputElement;
		let value: string | number | boolean = target.value;
		if (type === 'number') value = Number(value);
		else if (type === 'boolean') value = target.checked;
		args[procCode] = { ...args[procCode], [name]: value };
	};

	const procName = (procCode: string) => procCode.replace(/ %[snb]/g, ' ( )');
</script>

<div class="scripts">
	{#each events as { opcode, option }}
		<button class="run" on:click={() => fire(opcode, option)}>
			<span class="play"><Icon name="play" size={12} /></span>
			<span>{label(opcode, option)}</span>
		</button>
	{/each}
	{#each procedures as { procCode, argDefs } (procCode)}
		<div class="procedure">
			<button class="run" on:click={() => entity.callProcedure(procCode, args[procCode] ?? {})}>
				<span class="play"><Icon name="play" size={12} /></span>
				<span>{procName(procCode)}</span>
			</button>
			{#each argDefs as { name, type } (name)}
				<label class="arg">
					<span>{name}</span>
					<input
						type={type === 'string' ? 'text' : type === 'number' ? 'number' : 'checkbox'}
						on:input={(e) => setArg(procCode, name, type, e)}
						on:change={(e) => setArg(procCode, name, type, e)}
					/>
				</label>
			{/each}
		</div>
	{/each}
	{#if events.length === 0 && procedures.length === 0}
		<p class="empty">No scripts start from an event in this program.</p>
	{/if}
</div>

<style lang="scss">
	.scripts {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.run {
		display: flex;
		gap: 8px;
		align-items: center;
		width: 100%;
		text-align: left;
		background: #fff;
		border: 1px solid var(--border);
		border-radius: 8px;
		padding: 6px 10px;
		&:hover {
			border-color: var(--primary);
			background: var(--primary-soft);
		}
	}
	.play {
		display: inline-grid;
		color: var(--go);
	}
	.procedure {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.arg {
		display: grid;
		grid-template-columns: 40% 60%;
		align-items: center;
		padding-left: 24px;
		font-size: 12px;
		color: var(--muted);
		input {
			border: 1px solid var(--border);
			border-radius: 4px;
			padding: 2px 4px;
		}
	}
	.empty {
		color: var(--muted);
	}
</style>
