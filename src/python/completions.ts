// Autocomplete entries for the robot API, generated from the Python module
// sources so they always match what the simulator implements.

import { PYTHON_LIBS } from './libs';

export type ApiEntry = { name: string; signature: string; module: string };

function parse(module: string, source: string): ApiEntry[] {
	const entries: ApiEntry[] = [];
	const classMethods = new Map<string, { name: string; params: string }[]>();
	let currentClass: string | null = null;
	for (const line of source.split('\n')) {
		const cls = /^class (\w+)/.exec(line);
		if (cls) {
			currentClass = cls[1];
			classMethods.set(currentClass, []);
			continue;
		}
		const method = /^ {4}def (\w+)\(self,? ?(.*)\):/.exec(line);
		if (method && currentClass) {
			if (!method[1].startsWith('_')) classMethods.get(currentClass)!.push({ name: method[1], params: method[2] });
			continue;
		}
		const fn = /^def (\w+)\((.*)\):/.exec(line);
		if (fn) {
			currentClass = null;
			if (!fn[1].startsWith('_')) entries.push({ name: `${module}.${fn[1]}`, signature: `${module}.${fn[1]}(${fn[2]})`, module });
			continue;
		}
		const instance = /^(\w+) = (_\w+)\(/.exec(line);
		if (instance && classMethods.has(instance[2])) {
			for (const m of classMethods.get(instance[2])!) {
				entries.push({ name: `${module}.${instance[1]}.${m.name}`, signature: `${module}.${instance[1]}.${m.name}(${m.params})`, module });
			}
		}
	}
	return entries;
}

export const API_ENTRIES: ApiEntry[] = [
	...parse('cyberpi', PYTHON_LIBS.cyberpi),
	...parse('mbot2', PYTHON_LIBS.mbot2),
	...parse('mbuild', PYTHON_LIBS.mbuild),
	...parse('event', PYTHON_LIBS.event).map((e) => ({ ...e, name: `@${e.name}`, signature: `@${e.signature}` })),
	...parse('time', PYTHON_LIBS.time),
];

/** Extra names a module is imported as, e.g. `import cyberpi as cpi`. */
export function importAliases(code: string): Record<string, string> {
	const aliases: Record<string, string> = {};
	for (const m of code.matchAll(/import\s+(cyberpi|mbot2|mbuild|event|time)\s+as\s+(\w+)/g)) aliases[m[2]] = m[1];
	return aliases;
}
