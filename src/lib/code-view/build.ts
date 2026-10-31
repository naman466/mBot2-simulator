import type { Std } from '../../mblock/targets/std';
import type { Block, Input } from '../../mblock/block';
import { LED_MENU_COLORS } from '../../sim/colors';
import { TURN_CW_MEANS_LEFT } from '../../sim/constants';
import { LABELS, categoryOf, fallbackLabel, isBooleanOpcode, type Category, type Shape } from './block-labels';

export type Slot =
	| { kind: 'text'; text: string }
	| { kind: 'literal'; text: string; numeric: boolean }
	| { kind: 'color'; color: string }
	| { kind: 'leds'; colors: string[] }
	| { kind: 'menu'; text: string }
	| { kind: 'variable'; text: string; list: boolean }
	| { kind: 'empty'; boolean: boolean }
	| { kind: 'block'; block: BlockView };

export type BlockView = {
	id: string;
	opcode: string;
	shape: Shape;
	category: Category;
	parts: Slot[];
	/** C-blocks: one or two inner stacks ("else" goes between them). */
	branches: BlockView[][];
	elseLabel: boolean;
};

const SUBSTACKS = ['SUBSTACK', 'SUBSTACK2'];

function isMenu(block: Readonly<Block>) {
	return (
		block.opcode.endsWith('_menu') ||
		(block.shadow && Object.keys(block.inputs).length === 0 && Object.keys(block.fields).length > 0)
	);
}

function menuText(opcode: string, key: string, value: string) {
	const chassis = opcode === 'mbot2.mbot2_move_direction_with_rpm' || opcode === 'mbot2.mbot2_move_direction_with_time' || opcode === 'mbot2.mbot2_move_straight_with_cm_and_inch';
	if (chassis && key === 'DIRECTION') {
		return { forward: 'move forward', backward: 'move backward', left: 'turn left', right: 'turn right' }[value] ?? value;
	}
	if (opcode === 'mbot2.mbot2_cw_and_ccw_with_angle' && key === 'fieldMenu_1') {
		const left = value === 'cw' ? TURN_CW_MEANS_LEFT : !TURN_CW_MEANS_LEFT;
		return left ? 'turn left' : 'turn right';
	}
	if (key === 'STOP_OPTION' && value === 'other scripts in sprite') return 'other scripts';
	if (value === 'color_sta') return 'color';
	return value;
}

function ledColors(value: string) {
	return [...value.padEnd(5, '0')].slice(0, 5).map((d) => {
		const [r, g, b] = LED_MENU_COLORS[Number(d)] ?? [0, 0, 0];
		return r + g + b === 0 ? '#3a3f44' : `rgb(${r},${g},${b})`;
	});
}

export class CodeBuilder {
	constructor(private readonly entity: Std) {}

	private get(id: string) {
		return this.entity.getBlock(id);
	}

	public scripts(): BlockView[][] {
		return this.entity.getScripts().map((id) => this.stack(id));
	}

	private stack(firstId: string | null | undefined): BlockView[] {
		const out: BlockView[] = [];
		let id = firstId;
		let guard = 0;
		while (id && guard++ < 2000) {
			const block = this.get(id);
			if (!block) break;
			out.push(this.block(block, false));
			id = block.next;
		}
		return out;
	}

	private shapeOf(block: Readonly<Block>, asInput: boolean): Shape {
		if (asInput) return isBooleanOpcode(block.opcode) ? 'boolean' : 'reporter';
		if (block.opcode === 'procedures_definition' || this.entity.isHatBlock(block.opcode)) return 'hat';
		if (SUBSTACKS.some((s) => s in block.inputs) || ['control_forever', 'control_repeat', 'control_if', 'control_if_else', 'control_repeat_until', 'control_while'].includes(block.opcode)) return 'c';
		if (block.opcode === 'control_stop') {
			const option = block.fields['STOP_OPTION']?.[0];
			return option === 'other scripts in sprite' ? 'stack' : 'cap';
		}
		if (block.opcode === 'control_forever') return 'c';
		return 'stack';
	}

	private block(block: Readonly<Block>, asInput: boolean): BlockView {
		const view: BlockView = {
			id: block.id,
			opcode: block.opcode,
			shape: this.shapeOf(block, asInput),
			category: categoryOf(block.opcode),
			parts: [],
			branches: [],
			elseLabel: block.opcode === 'control_if_else',
		};

		if (block.opcode === 'procedures_definition') {
			view.parts = [{ kind: 'text', text: 'define' }, ...this.prototypeParts(block)];
		} else if (block.opcode === 'procedures_call') {
			view.parts = this.callParts(block);
		} else if (block.opcode === 'argument_reporter_string_number' || block.opcode === 'argument_reporter_boolean') {
			view.parts = [{ kind: 'text', text: String(block.fields['VALUE']?.[0] ?? '') }];
		} else {
			view.parts = this.templateParts(block);
		}

		for (const name of SUBSTACKS) {
			if (name === 'SUBSTACK2' && block.opcode !== 'control_if_else') continue;
			if (view.shape !== 'c') break;
			const first = block.inputs[name]?.[1];
			view.branches.push(this.stack(typeof first === 'string' ? first : null));
		}
		if (view.shape === 'c' && view.branches.length === 0) view.branches.push([]);
		return view;
	}

	private templateParts(block: Readonly<Block>): Slot[] {
		const inputs = Object.keys(block.inputs).filter((k) => !SUBSTACKS.includes(k));
		const fields = Object.keys(block.fields);
		const template = LABELS[block.opcode] ?? fallbackLabel(block.opcode, inputs, fields);
		const parts: Slot[] = [];
		for (const piece of template.split(/(\{[^}]+\})/)) {
			if (!piece) continue;
			const match = /^\{([^}]+)\}$/.exec(piece);
			if (!match) {
				parts.push({ kind: 'text', text: piece.trim() });
				continue;
			}
			const name = match[1];
			if (name in block.fields) parts.push(this.fieldSlot(block, name));
			else if (name in block.inputs) parts.push(this.inputSlot(block, name, block.inputs[name]));
			else if (name === 'index') parts.push({ kind: 'menu', text: '1' });
		}
		return parts.filter((p) => p.kind !== 'text' || p.text !== '');
	}

	private fieldSlot(block: Readonly<Block>, name: string): Slot {
		const raw = String(block.fields[name]?.[0] ?? '');
		if (name === 'ledRing') return { kind: 'leds', colors: ledColors(raw) };
		if (name === 'VARIABLE') return { kind: 'variable', text: raw, list: false };
		if (name === 'LIST') return { kind: 'variable', text: raw, list: true };
		return { kind: 'menu', text: menuText(block.opcode, name, raw) };
	}

	private inputSlot(parent: Readonly<Block>, name: string, input: Input | undefined): Slot {
		if (!input) return { kind: 'empty', boolean: false };
		const [, value, shadow] = input;
		const inner = value === null || value === undefined ? shadow : value;
		if (inner === null || inner === undefined) return { kind: 'empty', boolean: name === 'CONDITION' || name.startsWith('OPERAND') };
		if (Array.isArray(inner)) {
			const [type, a, b] = inner as [number, any, any];
			if (type >= 4 && type <= 8) return { kind: 'literal', text: String(a ?? ''), numeric: true };
			if (type === 9) return { kind: 'color', color: String(a) };
			if (type === 10) return { kind: 'literal', text: String(a ?? ''), numeric: false };
			if (type === 11) return { kind: 'menu', text: String(a) };
			if (type === 12) return { kind: 'variable', text: String(a), list: false };
			if (type === 13) return { kind: 'variable', text: String(a), list: true };
			return { kind: 'literal', text: String(b ?? a ?? ''), numeric: false };
		}
		const child = this.get(String(inner));
		if (!child) return { kind: 'empty', boolean: false };
		if (isMenu(child)) {
			const field = Object.values(child.fields)[0];
			const raw = String(field?.[0] ?? '');
			if (/^#[0-9a-f]{6}$/i.test(raw)) return { kind: 'color', color: raw };
			return { kind: 'menu', text: menuText(parent.opcode, name, raw) };
		}
		return { kind: 'block', block: this.block(child, true) };
	}

	private prototype(block: Readonly<Block>) {
		const id = block.inputs['custom_block']?.[1];
		return typeof id === 'string' ? this.get(id) : undefined;
	}

	/** "define jump (height)" from the procedure prototype. */
	private prototypeParts(definition: Readonly<Block>): Slot[] {
		const proto = this.prototype(definition);
		const code = proto?.mutation?.procCode ?? '';
		const names = proto?.mutation?.argumentNames ?? [];
		let arg = 0;
		return code.split(' ').map((word): Slot => {
			if (/^%[snb]$/.test(word)) {
				const text = String(names[arg++] ?? '');
				return { kind: 'block', block: { id: `${definition.id}-arg${arg}`, opcode: 'argument_reporter', shape: word === '%b' ? 'boolean' : 'reporter', category: categoryOf('argument_'), parts: [{ kind: 'text', text }], branches: [], elseLabel: false } };
			}
			return { kind: 'text', text: word };
		});
	}

	private callParts(call: Readonly<Block>): Slot[] {
		const code = call.mutation?.procCode ?? '';
		const ids = call.mutation?.argumentIds ?? [];
		let arg = 0;
		return code.split(' ').map((word): Slot => {
			if (/^%[snb]$/.test(word)) {
				const id = ids[arg++];
				return this.inputSlot(call, id, call.inputs[id]);
			}
			return { kind: 'text', text: word };
		});
	}
}
