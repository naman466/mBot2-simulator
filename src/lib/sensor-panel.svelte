<script lang="ts">
	import { live } from './live';
	import type { MBot2 } from '../mblock/targets/mbot2';
	import type { World } from '../sim/world';
	import { PROBE_ORDER } from '../sim/constants';
	import type { Motor } from '../sim/robot';

	export let entity: MBot2;
	export let world: World;
	export let tick = 0;

	$: quad = live(tick, world.readQuad(entity.body));
	$: distance = live(tick, world.readUltrasonic(entity.body));
	$: em1 = live(tick, entity.body.em1);
	$: em2 = live(tick, entity.body.em2);
	$: motors = [['EM1 (left)', em1], ['EM2 (right)', em2]] as [string, Motor][];
	$: yaw = live(tick, entity.yaw);
	$: timer = live(tick, Math.round((performance.now() - entity.timerStart) / 100) / 10);
	$: status = quad.lineStatus.toString(2).padStart(4, '0');
	$: deviationPct = (quad.deviation + 100) / 2;
</script>

<div class="sensors">
	<div class="row big">
		<div class="tile">
			<span class="label">Ultrasonic</span>
			<span class="value">{distance >= 300 ? 'out of range' : `${distance} cm`}</span>
		</div>
		<div class="tile">
			<span class="label">Gyro z (yaw)</span>
			<span class="value">{yaw}°</span>
		</div>
		<div class="tile">
			<span class="label">Timer</span>
			<span class="value">{timer} s</span>
		</div>
	</div>

	<div class="block">
		<div class="block-title">
			<span>Quad RGB sensor</span>
			<span class="muted">line status <code>{status}</code> = {quad.lineStatus}</span>
		</div>
		<div class="probes">
			{#each PROBE_ORDER as name}
				{@const p = quad.probes[name]}
				<div class="probe" class:line={p.isLine}>
					<span class="swatch" style={`background: rgb(${p.rgb.map(Math.round).join(',')})`} />
					<strong>{name}</strong>
					<span class="muted">{p.color}</span>
					<span class="muted">gray {Math.round(p.gray)}</span>
				</div>
			{/each}
		</div>
		<div class="deviation" title="Line deviation (off track) from -100 to 100">
			<span class="label">off track</span>
			<div class="meter">
				<div class="zero" />
				<div class="needle" style={`left: ${deviationPct}%`} />
			</div>
			<span class="value num">{quad.deviation}</span>
		</div>
	</div>

	<div class="block">
		<div class="block-title"><span>Encoder motors</span></div>
		<div class="motors">
			{#each motors as [label, m]}
				<div class="motor">
					<span>{label}</span>
					<span class="num">{Math.round(m.rpm)} rpm</span>
					<span class="muted num">{Math.round(m.angle)}°</span>
				</div>
			{/each}
		</div>
	</div>
</div>

<style lang="scss">
	.sensors {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.row {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 6px;
	}
	.tile {
		background: var(--panel-2);
		border-radius: 8px;
		padding: 6px 8px;
		display: flex;
		flex-direction: column;
	}
	.label {
		font-size: 11px;
		color: var(--muted);
	}
	.value {
		font-weight: 700;
		font-size: 15px;
		font-variant-numeric: tabular-nums;
	}
	.num {
		font-variant-numeric: tabular-nums;
	}
	.muted {
		color: var(--muted);
		font-size: 11px;
	}
	.block {
		background: var(--panel-2);
		border-radius: 8px;
		padding: 8px;
	}
	.block-title {
		display: flex;
		justify-content: space-between;
		font-weight: 700;
		font-size: 12px;
		margin-bottom: 6px;
		code {
			font-family: ui-monospace, monospace;
		}
	}
	.probes {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 4px;
	}
	.probe {
		display: flex;
		flex-direction: column;
		align-items: center;
		background: #fff;
		border: 2px solid transparent;
		border-radius: 6px;
		padding: 4px 2px;
		&.line {
			border-color: #ff1744;
		}
	}
	.swatch {
		width: 22px;
		height: 22px;
		border-radius: 50%;
		border: 1px solid rgba(0, 0, 0, 0.2);
	}
	.deviation {
		display: grid;
		grid-template-columns: auto 1fr 36px;
		align-items: center;
		gap: 8px;
		margin-top: 8px;
		.value {
			text-align: right;
		}
	}
	.meter {
		position: relative;
		height: 10px;
		border-radius: 5px;
		background: linear-gradient(90deg, #ffcdd2, #fff 50%, #bbdefb);
		border: 1px solid var(--border);
		.zero {
			position: absolute;
			left: 50%;
			top: -2px;
			bottom: -2px;
			width: 1px;
			background: #90a4ae;
		}
		.needle {
			position: absolute;
			top: -3px;
			width: 4px;
			height: 14px;
			margin-left: -2px;
			border-radius: 2px;
			background: #263238;
		}
	}
	.motors {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 6px;
	}
	.motor {
		display: flex;
		flex-direction: column;
		background: #fff;
		border-radius: 6px;
		padding: 4px 8px;
	}
</style>
