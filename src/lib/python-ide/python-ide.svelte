<script lang="ts">
	import { createEventDispatcher, onDestroy, onMount } from 'svelte';
	import { EditorState, StateEffect, StateField } from '@codemirror/state';
	import { Decoration, EditorView, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers, drawSelection, type DecorationSet } from '@codemirror/view';
	import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
	import { bracketMatching, defaultHighlightStyle, indentOnInput, syntaxHighlighting } from '@codemirror/language';
	import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap, type CompletionContext } from '@codemirror/autocomplete';
	import { python } from '@codemirror/lang-python';
	import { PythonRunner, type OutputKind } from '../../python/runner';
	import { API_ENTRIES, importAliases } from '../../python/completions';
	import { PYTHON_EXAMPLES, STARTER_CODE } from '../../python/examples';
	import type { MBot2 } from '../../mblock/targets/mbot2';
	import { speaker } from '../../sim/audio';
	import Icon from '../ui/icon.svelte';

	export let entity: MBot2;
	/** Name of the file being edited (shown in the toolbar). */
	export let fileName = 'main.py';

	const STORAGE_KEY = 'mbot2-sim:python';
	const dispatch = createEventDispatcher<{ example: { mapId: string }; state: { running: boolean } }>();

	let editorHost: HTMLDivElement;
	let consoleHost: HTMLPreElement;
	let fileInput: HTMLInputElement;
	let view: EditorView;
	let runner: PythonRunner | null = null;
	let running = false;
	let loading = false;
	let output: { text: string; kind: OutputKind }[] = [];
	let fontSize = 13;

	// --- Error line highlight --------------------------------------------------------
	const setErrorLine = StateEffect.define<number | null>();
	const errorLineField = StateField.define<DecorationSet>({
		create: () => Decoration.none,
		update(deco, tr) {
			deco = deco.map(tr.changes);
			for (const e of tr.effects) {
				if (!e.is(setErrorLine)) continue;
				if (e.value === null || e.value < 1 || e.value > tr.state.doc.lines) deco = Decoration.none;
				else deco = Decoration.set([Decoration.line({ class: 'cm-error-line' }).range(tr.state.doc.line(e.value).from)]);
			}
			return tr.docChanged ? Decoration.none : deco;
		},
		provide: (f) => EditorView.decorations.from(f),
	});

	// --- Autocomplete for the robot API ------------------------------------------------
	function completeApi(context: CompletionContext) {
		const word = context.matchBefore(/@?[\w.]+/);
		if (!word || (word.from === word.to && !context.explicit)) return null;
		const aliases = importAliases(context.state.doc.toString());
		const options = API_ENTRIES.flatMap((entry) => {
			const base = { label: entry.name, detail: entry.signature.slice(entry.name.length), type: 'function', apply: `${entry.name}()` };
			const extra = Object.entries(aliases)
				.filter(([, module]) => entry.name.startsWith(`${module}.`))
				.map(([alias, module]) => {
					const name = alias + entry.name.slice(module.length);
					return { ...base, label: name, apply: `${name}()` };
				});
			return [base, ...extra];
		});
		return { from: word.from, options, validFor: /^@?[\w.]*$/ };
	}

	function savedCode() {
		try {
			return localStorage.getItem(STORAGE_KEY) ?? STARTER_CODE;
		} catch {
			return STARTER_CODE;
		}
	}

	onMount(() => {
		view = new EditorView({
			parent: editorHost,
			state: EditorState.create({
				doc: savedCode(),
				extensions: [
					lineNumbers(),
					highlightActiveLineGutter(),
					highlightActiveLine(),
					drawSelection(),
					history(),
					indentOnInput(),
					bracketMatching(),
					closeBrackets(),
					syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
					python(),
					autocompletion({ override: [completeApi], icons: false }),
					keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap, ...completionKeymap, indentWithTab,
						{ key: 'Ctrl-Enter', run: () => (run(), true) }, { key: 'F5', run: () => (run(), true) }]),
					errorLineField,
					EditorState.tabSize.of(4),
					EditorView.updateListener.of((update) => {
						if (!update.docChanged) return;
						try {
							localStorage.setItem(STORAGE_KEY, update.state.doc.toString());
						} catch {
							/* storage full: not important */
						}
					}),
					EditorView.theme({
						'&': { height: '100%' },
						'.cm-scroller': { fontFamily: 'ui-monospace, Consolas, monospace' },
						'.cm-error-line': { backgroundColor: 'rgba(229, 57, 53, 0.15)' },
					}),
				],
			}),
		});
	});

	onDestroy(() => {
		runner?.stop();
		view?.destroy();
	});

	// Programs belong to one robot: switching robots stops the old program.
	$: if (runner && entity && (runner as any).robot !== entity) {
		runner.stop();
		runner = null;
	}

	function print(text: string, kind: OutputKind) {
		const last = output[output.length - 1];
		if (last && last.kind === kind && kind === 'out') last.text += text;
		else output.push({ text, kind });
		if (output.length > 400) output.splice(0, output.length - 400);
		output = output;
		requestAnimationFrame(() => consoleHost && (consoleHost.scrollTop = consoleHost.scrollHeight));
	}

	export async function run() {
		if (!view) return;
		speaker.unlock();
		view.dispatch({ effects: setErrorLine.of(null) });
		if (!runner) {
			runner = new PythonRunner(entity, print);
			runner.onStateChange = () => {
				running = runner?.running ?? false;
				dispatch('state', { running });
				if (runner?.errorLine) view.dispatch({ effects: setErrorLine.of(runner.errorLine) });
			};
		}
		loading = true;
		try {
			await runner.run(view.state.doc.toString());
		} catch (error) {
			print(`✖ ${error instanceof Error ? error.message : String(error)}\n`, 'err');
		} finally {
			loading = false;
		}
	}

	export function stop() {
		if (runner?.running) print('■ Stopped\n', 'info');
		runner?.stop();
	}

	/** Called every simulation tick (sensor and tilt events). */
	export function tick() {
		runner?.tick();
	}

	export function isRunning() {
		return running;
	}

	export function loadCode(code: string, name = 'main.py') {
		fileName = name;
		view?.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: code } });
	}

	function openFile(file: File | undefined) {
		if (!file) return;
		file.text().then((text) => loadCode(text, file.name));
	}

	function download() {
		const blob = new Blob([view.state.doc.toString()], { type: 'text/x-python' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = fileName.endsWith('.py') ? fileName : `${fileName}.py`;
		a.click();
		setTimeout(() => URL.revokeObjectURL(url), 1000);
	}

	function pickExample(id: string) {
		const example = PYTHON_EXAMPLES.find((e) => e.id === id);
		if (!example) return;
		stop();
		loadCode(example.code, `${example.id}.py`);
		dispatch('example', { mapId: example.mapId });
	}
</script>

<input bind:this={fileInput} type="file" accept=".py,.txt" hidden on:change={(e) => { openFile(e.currentTarget.files?.[0]); e.currentTarget.value = ''; }} />

<div class="ide">
	<div class="toolbar">
		<span class="file" title="File name"><Icon name="code" size={16} /><span>{fileName}</span></span>
		<div class="buttons">
			<button class="go" on:click={run} disabled={loading} title="Run (Ctrl+Enter or F5)">
				<Icon name={running ? 'reset' : 'play'} size={14} />{loading ? 'Loading…' : running ? 'Restart' : 'Run'}
			</button>
			<button class="icon stop" on:click={stop} disabled={!running} title="Stop" aria-label="Stop"><Icon name="stop" size={14} /></button>
			<span class="divider" />
			<button class="icon" on:click={() => fileInput.click()} title="Open a .py file" aria-label="Open"><Icon name="folder" size={16} /></button>
			<button class="icon" on:click={download} title="Download this program as a .py file" aria-label="Download"><Icon name="download" size={16} /></button>
			<label class="examples" title="Python examples">
				<Icon name="sparkles" size={15} />
				<select value="" on:change={(e) => { pickExample(e.currentTarget.value); e.currentTarget.value = ''; }} aria-label="Python examples">
					<option value="" disabled>Examples</option>
					{#each PYTHON_EXAMPLES as example}
						<option value={example.id}>{example.name}</option>
					{/each}
				</select>
			</label>
			<span class="divider" />
			<button class="icon" on:click={() => (fontSize = Math.max(10, fontSize - 1))} title="Smaller text" aria-label="Smaller text"><Icon name="textSmaller" size={16} /></button>
			<button class="icon" on:click={() => (fontSize = Math.min(22, fontSize + 1))} title="Bigger text" aria-label="Bigger text"><Icon name="textBigger" size={16} /></button>
		</div>
	</div>
	<div class="editor" bind:this={editorHost} style={`font-size: ${fontSize}px`} />
	<div class="console-bar">
		<span class="console-title"><Icon name="terminal" size={14} />Output</span>
		<button on:click={() => (output = [])}>Clear</button>
	</div>
	<pre class="console" bind:this={consoleHost}>{#each output as line}<span class={line.kind}>{line.text}</span>{/each}{#if output.length === 0}<span class="info">print() output and errors show up here. CyberPi's screen is on the right.</span>{/if}</pre>
</div>

<style lang="scss">
	.ide {
		display: grid;
		grid-template-rows: auto 1fr auto 140px;
		height: 100%;
		min-height: 0;
	}
	.toolbar {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		align-items: center;
		gap: 6px;
		min-height: 44px;
		padding: 6px 8px 6px 14px;
		border-bottom: 1px solid var(--border);
		background: var(--panel);
	}
	.file {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		font-weight: 650;
		min-width: 0;
		span {
			max-width: 150px;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}
	}
	.buttons {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 2px;
		button {
			display: inline-flex;
			align-items: center;
			gap: 6px;
			height: 30px;
			border: none;
			background: transparent;
			border-radius: 6px;
			padding: 0 8px;
			font-weight: 600;
			color: var(--text-2);
			&:hover:not(:disabled) {
				background: var(--panel-3);
			}
			&:disabled {
				opacity: 0.35;
				cursor: not-allowed;
			}
			&.icon {
				width: 30px;
				padding: 0;
				justify-content: center;
			}
		}
		.go {
			background: var(--go);
			color: #fff;
			padding: 0 12px;
			margin-right: 2px;
			&:hover:not(:disabled) {
				background: var(--go-dark);
			}
		}
		.stop:not(:disabled) {
			color: var(--stop);
		}
		.divider {
			width: 1px;
			height: 20px;
			background: var(--border);
			margin: 0 4px;
		}
		.examples {
			display: inline-flex;
			align-items: center;
			gap: 4px;
			height: 30px;
			padding: 0 6px;
			border-radius: 6px;
			color: var(--text-2);
			&:hover {
				background: var(--panel-3);
			}
			select {
				border: none;
				background: transparent;
				font-weight: 600;
				color: var(--text-2);
				cursor: pointer;
				max-width: 110px;
			}
		}
	}
	.editor {
		min-height: 0;
		overflow: hidden;
		background: #fff;
		:global(.cm-editor) {
			height: 100%;
		}
		:global(.cm-editor.cm-focused) {
			outline: none;
		}
	}
	.console-bar {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 6px 12px;
		background: #1b2430;
		color: #c3cad5;
		font-size: 12px;
		font-weight: 600;
		.console-title {
			display: inline-flex;
			align-items: center;
			gap: 6px;
		}
		button {
			border: none;
			background: transparent;
			color: #90a4ae;
			font-size: 11px;
		}
	}
	.console {
		margin: 0;
		padding: 6px 8px;
		background: #141b24;
		color: #e5e9f0;
		font: 12.5px/1.5 var(--mono);
		overflow: auto;
		white-space: pre-wrap;
		word-break: break-word;
		.err {
			color: #ff8a80;
		}
		.info {
			color: #80cbc4;
		}
	}
</style>
