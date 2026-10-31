import type { Input, Inputs, Block, Ops } from "../block";
import type { LANRouter } from "../global";
import { Context, type ProcedureArgs } from "../context";
import type { TargetId } from "../target";
import { compare, listToText, toBoolean, toNumber, toText } from "../values";

export type ArgType = "number" | "string" | "boolean";
export type ArgDefs = { name: string, type: ArgType, default_: string | number | boolean; }[];
export type ProcedureDefinition = { procCode: string; argDefs: ArgDefs; };

type StopOption = "all" | "this script" | "other scripts in sprite" | "other scripts in stage";
type MathOp = "abs" | "floor" | "ceil" | "sqrt" | "sin" | "cos" | "tan" | "asin" | "acos" | "atan" | "ln" | "log" | "e ^" | "10 ^";

const DEG = Math.PI / 180;

/** Rounds away floating point noise like Scratch does for trig results. */
function roundTrig(n: number) {
  return Math.round(n * 1e10) / 1e10;
}

/** Converts a Scratch list index ("last", "random", 1-based numbers) into a 0-based index. */
function listIndex(index: any, length: number, acceptAll = false): number | "all" | null {
  const str = toText(index).toLowerCase();
  if (str === "last") return length - 1;
  if (str === "random" || str === "any") return length > 0 ? Math.floor(Math.random() * length) : null;
  if (acceptAll && str === "all") return "all";
  const n = Math.floor(toNumber(index));
  if (n < 1 || n > length) return null;
  return n - 1;
}

const num = async (c: Context, input: Input | undefined) => toNumber(await c.decodeInput(input));
const str = async (c: Context, input: Input | undefined) => toText(await c.decodeInput(input));
const bool = async (c: Context, input: Input | undefined) => toBoolean(await c.decodeInput(input));
const substack = async (c: Context, b: Block, name = "SUBSTACK") => (await c.decodeInput(b.inputs[name], true)) as string | undefined;

/**
 * The basic operation handler that every target must implement.
 */
export const StdOps: Ops<Std> = {
  // Events
  "event_whenbroadcastreceived": async (_, c, b) => (c.decodeField(b.fields["BROADCAST_OPTION"])),
  "event_broadcast": async (self, c, b) => { self.broadcast(await c.decodeInput(b.inputs["BROADCAST_INPUT"])); },
  "event_broadcastandwait": async (self, c, b) => { await self.broadcast(await c.decodeInput(b.inputs["BROADCAST_INPUT"]), c); },

  // Control
  "control_wait": async (_, c, b) => { await c.sleep(await num(c, b.inputs["DURATION"]) * 1000); },
  "control_repeat": async (_, c, b) => (await c.runLoopTimes(await substack(c, b), await num(c, b.inputs["TIMES"]))),
  "control_forever": async (_, c, b) => (await c.runLoopForever(await substack(c, b))),
  "control_if": async (_, c, b) => {
    if (await bool(c, b.inputs["CONDITION"])) await c.runStartingAt(await substack(c, b));
  },
  "control_if_else": async (_, c, b) => {
    if (await bool(c, b.inputs["CONDITION"])) await c.runStartingAt(await substack(c, b));
    else await c.runStartingAt(await substack(c, b, "SUBSTACK2"));
  },
  "control_wait_until": async (_, c, b) => { await c.waitUntil(() => bool(c, b.inputs["CONDITION"])); },
  "control_repeat_until": async (_, c, b) => (await c.runLoopUntil(await substack(c, b), await c.decodeInput(b.inputs["CONDITION"], true))),
  "control_while": async (_, c, b) => (await c.runLoopWhile(await substack(c, b), await c.decodeInput(b.inputs["CONDITION"], true))),
  "control_stop": async (self, c, b) => {
    const stopOption = c.decodeField(b.fields["STOP_OPTION"]) as StopOption;
    switch (stopOption) {
      case "all": self.stopAll(); break;
      case "this script": c.destroy(); break;
      case "other scripts in sprite":
      case "other scripts in stage": self.stopScripts(c.rootId); break;
      default: throw new Error(`"control_stop" option "${stopOption}" is not supported.`);
    }
  },

  // Operators
  "operator_add": async (_, c, b) => (await num(c, b.inputs["NUM1"]) + await num(c, b.inputs["NUM2"])),
  "operator_subtract": async (_, c, b) => (await num(c, b.inputs["NUM1"]) - await num(c, b.inputs["NUM2"])),
  "operator_multiply": async (_, c, b) => (await num(c, b.inputs["NUM1"]) * await num(c, b.inputs["NUM2"])),
  "operator_divide": async (_, c, b) => (await num(c, b.inputs["NUM1"]) / await num(c, b.inputs["NUM2"])),
  "operator_random": async (_, c, b) => {
    const fromRaw = await c.decodeInput(b.inputs["FROM"]);
    const toRaw = await c.decodeInput(b.inputs["TO"]);
    const from = toNumber(fromRaw);
    const to = toNumber(toRaw);
    const low = Math.min(from, to);
    const high = Math.max(from, to);
    const isInt = (v: any) => Number.isInteger(toNumber(v)) && !toText(v).includes(".");
    if (isInt(fromRaw) && isInt(toRaw)) return low + Math.floor(Math.random() * (high - low + 1));
    return low + Math.random() * (high - low);
  },
  "operator_gt": async (_, c, b) => compare(await c.decodeInput(b.inputs["OPERAND1"]), await c.decodeInput(b.inputs["OPERAND2"])) > 0,
  "operator_lt": async (_, c, b) => compare(await c.decodeInput(b.inputs["OPERAND1"]), await c.decodeInput(b.inputs["OPERAND2"])) < 0,
  "operator_equals": async (_, c, b) => compare(await c.decodeInput(b.inputs["OPERAND1"]), await c.decodeInput(b.inputs["OPERAND2"])) === 0,
  "operator_and": async (_, c, b) => (await bool(c, b.inputs["OPERAND1"])) && (await bool(c, b.inputs["OPERAND2"])),
  "operator_or": async (_, c, b) => (await bool(c, b.inputs["OPERAND1"])) || (await bool(c, b.inputs["OPERAND2"])),
  "operator_not": async (_, c, b) => !(await bool(c, b.inputs["OPERAND"])),
  "operator_join": async (_, c, b) => (await str(c, b.inputs["STRING1"])) + (await str(c, b.inputs["STRING2"])),
  "operator_letter_of": async (_, c, b) => {
    const text = await str(c, b.inputs["STRING"]);
    const index = Math.floor(await num(c, b.inputs["LETTER"])) - 1;
    return index >= 0 && index < text.length ? text.charAt(index) : "";
  },
  "operator_length": async (_, c, b) => (await str(c, b.inputs["STRING"])).length,
  "operator_contains": async (_, c, b) => (await str(c, b.inputs["STRING1"])).toLowerCase().includes((await str(c, b.inputs["STRING2"])).toLowerCase()),
  "operator_mod": async (_, c, b) => {
    const n = await num(c, b.inputs["NUM1"]);
    const modulus = await num(c, b.inputs["NUM2"]);
    let result = n % modulus;
    // Scratch's mod takes the sign of the divisor.
    if (result / modulus < 0) result += modulus;
    return result;
  },
  "operator_round": async (_, c, b) => Math.round(await num(c, b.inputs["NUM"])),
  "operator_mathop": async (_, c, b) => {
    const op = c.decodeField(b.fields["OPERATOR"]) as MathOp;
    const n = await num(c, b.inputs["NUM"]);
    // Scratch trig works in degrees.
    switch (op) {
      case "abs": return Math.abs(n);
      case "floor": return Math.floor(n);
      case "ceil": return Math.ceil(n);
      case "sqrt": return Math.sqrt(n);
      case "sin": return roundTrig(Math.sin(n * DEG));
      case "cos": return roundTrig(Math.cos(n * DEG));
      case "tan": return roundTrig(Math.tan(n * DEG));
      case "asin": return Math.asin(n) / DEG;
      case "acos": return Math.acos(n) / DEG;
      case "atan": return Math.atan(n) / DEG;
      case "ln": return Math.log(n);
      case "log": return Math.log10(n);
      case "e ^": return Math.exp(n);
      case "10 ^": return Math.pow(10, n);
      default: throw new Error(`Unsupported math operation: ${op}`);
    }
  },

  // Data: variables
  "data_variable": async (self, c, b) => self.getVariable(c.decodeField(b.fields["VARIABLE"]), b.fields["VARIABLE"]?.[0]),
  "data_setvariableto": async (self, c, b) => self.setVariable(c.decodeField(b.fields["VARIABLE"]), await c.decodeInput(b.inputs["VALUE"]), b.fields["VARIABLE"]?.[0]),
  "data_changevariableby": async (self, c, b) => self.changeVariableBy(c.decodeField(b.fields["VARIABLE"]), await num(c, b.inputs["VALUE"]), b.fields["VARIABLE"]?.[0]),
  "data_showvariable": async () => { },
  "data_hidevariable": async () => { },

  // Data: lists
  "data_listcontents": async (self, c, b) => listToText(self.getList(c.decodeField(b.fields["LIST"]), b.fields["LIST"]?.[0])),
  "data_addtolist": async (self, c, b) => {
    self.getList(c.decodeField(b.fields["LIST"]), b.fields["LIST"]?.[0]).push(await c.decodeInput(b.inputs["ITEM"]));
    self.notifyDataChanged();
  },
  "data_deleteoflist": async (self, c, b) => {
    const list = self.getList(c.decodeField(b.fields["LIST"]), b.fields["LIST"]?.[0]);
    const index = listIndex(await c.decodeInput(b.inputs["INDEX"]), list.length, true);
    if (index === "all") list.length = 0;
    else if (index !== null) list.splice(index, 1);
    self.notifyDataChanged();
  },
  "data_deletealloflist": async (self, c, b) => {
    self.getList(c.decodeField(b.fields["LIST"]), b.fields["LIST"]?.[0]).length = 0;
    self.notifyDataChanged();
  },
  "data_insertatlist": async (self, c, b) => {
    const list = self.getList(c.decodeField(b.fields["LIST"]), b.fields["LIST"]?.[0]);
    const index = listIndex(await c.decodeInput(b.inputs["INDEX"]), list.length + 1);
    if (index !== null && index !== "all") list.splice(index, 0, await c.decodeInput(b.inputs["ITEM"]));
    self.notifyDataChanged();
  },
  "data_replaceitemoflist": async (self, c, b) => {
    const list = self.getList(c.decodeField(b.fields["LIST"]), b.fields["LIST"]?.[0]);
    const index = listIndex(await c.decodeInput(b.inputs["INDEX"]), list.length);
    if (index !== null && index !== "all") list[index] = await c.decodeInput(b.inputs["ITEM"]);
    self.notifyDataChanged();
  },
  "data_itemoflist": async (self, c, b) => {
    const list = self.getList(c.decodeField(b.fields["LIST"]), b.fields["LIST"]?.[0]);
    const index = listIndex(await c.decodeInput(b.inputs["INDEX"]), list.length);
    return index === null || index === "all" ? "" : list[index];
  },
  "data_itemnumoflist": async (self, c, b) => {
    const list = self.getList(c.decodeField(b.fields["LIST"]), b.fields["LIST"]?.[0]);
    const item = await c.decodeInput(b.inputs["ITEM"]);
    return list.findIndex((entry) => compare(entry, item) === 0) + 1;
  },
  "data_lengthoflist": async (self, c, b) => self.getList(c.decodeField(b.fields["LIST"]), b.fields["LIST"]?.[0]).length,
  "data_listcontainsitem": async (self, c, b) => {
    const list = self.getList(c.decodeField(b.fields["LIST"]), b.fields["LIST"]?.[0]);
    const item = await c.decodeInput(b.inputs["ITEM"]);
    return list.some((entry) => compare(entry, item) === 0);
  },
  "data_showlist": async () => { },
  "data_hidelist": async () => { },

  // Custom Procedures
  /** Creates a new Context and runs the function in it. */
  "procedures_definition": async (self, c, b, args: ProcedureArgs) => {
    const procedureContext = new Context(self, args, c);
    if (b.next) {
      self.saveContext(procedureContext);
      await procedureContext.runStartingAt(b.next);
    }
  },
  /** Transforms `procedures_call` inputs into `ProcedureArgs`. */
  "procedures_prototype": async (self, c, b, inputs: Inputs) => {
    const transformedArgs: ProcedureArgs = {};
    for (const [argId, input] of Object.entries(inputs || {})) {
      if (!b.inputs[argId]) continue;
      const argName = c.decodeField(self.getBlock(await c.decodeInput(b.inputs[argId], true)).fields["VALUE"]);
      transformedArgs[argName] = await c.decodeInput(input as Input);
    };
    return transformedArgs;
  },
  /** Returns the value stored in the reporter. */
  "argument_reporter_boolean": async (_, c, b) => toBoolean(c.args[c.decodeField(b.fields["VALUE"])]),
  /** Returns the value stored in the reporter. */
  "argument_reporter_string_number": async (_, c, b) => (c.args[c.decodeField(b.fields["VALUE"])] ?? ""),
  /** Calls the procedure with the inputs of the `procedure_call` block. */
  "procedures_call": async (self, c, b) => {
    const procCode = b.mutation?.procCode;
    if (procCode && self.getProcId(procCode)) {
      const definitionBlock = self.getBlock(self.getProcId(procCode));
      const prototypeBlockId = await c.decodeInput(definitionBlock.inputs["custom_block"], true);
      const args = (await c.evaluateBlock(prototypeBlockId, b.inputs)).ret as object;
      return await self.callProcedure(procCode, args, c);
    }
  },
};

/**
 * Standard hat blocks.
 */
export const StdHats = ["event_whenbroadcastreceived"];

/** Shadow blocks that only hold a dropdown value (menus, notes). */
function isMenuBlock(block: Block) {
  return block.opcode.endsWith("_menu") || (block.shadow && Object.keys(block.inputs).length === 0 && Object.keys(block.fields).length > 0);
}

export type VariableEntry = { id: string, name: string, value: any, isList: boolean; };

/**
 * A base class for targets that implements all standard blocks.
 */
export abstract class Std {
  public readonly targetId: TargetId;
  public readonly physicsEnabled: boolean = false;
  /**
   * The custom name of the target.
   */
  public readonly name: string;
  /**
   * A map of hat opcodes mapped to all blocks with the same opcode.
   */
  protected readonly hatBlocksByEvent: { [index: string]: { id: string, option: any; }[]; } = {};
  /**
   * The context of the latest run of every hat block, so that re-triggering
   * a hat restarts its script instead of running it twice in parallel.
   */
  private readonly hatContexts = new Map<string, Context>();
  /**
   * A map of procedure codes mapped to their definition block IDs.
   */
  private readonly procedureDefinitionIdsByProcCode: { [index: string]: string; } = {};
  /**
   * A place to store the result of the `this.getProcedures()` function,
   * since it's return value is constant and it's computation is slow.
   */
  private procedureDefinitionCache: ProcedureDefinition[] | null = null;
  /**
   * A map of block IDs mapped to their respective blocks.
   */
  private readonly blocks: { [index: string]: Block; } = {};
  /**
   * Variables and lists, keyed by ID. Global (stage) variables live here too,
   * since in the simulator every robot has its own copy of the program.
   */
  private readonly variables: { [index: string]: { name: string, value: any; }; } = {};
  private readonly lists: { [index: string]: { name: string, value: any[]; }; } = {};
  private initialVariables: { [index: string]: [string, any]; } = {};
  private initialLists: { [index: string]: [string, any[]]; } = {};
  /**
   * Stacks of the target.
   */
  private readonly contexts: { [index: symbol]: Context; } = {};
  /**
   * An empty context in which to deserialize data when
   * there is no other context available yet.
   */
  protected readonly defaultContext = new Context(this);
  /**
   * The network.
   */
  public readonly lanRouter: LANRouter;
  /**
   * Opcodes the simulator doesn't know, collected for the UI.
   */
  public readonly unsupportedOpcodes = new Set<string>();
  /**
   * Runtime errors, deduplicated by opcode, collected for the UI.
   */
  public readonly runtimeErrors = new Map<string, string>();
  private dataListeners = new Set<() => void>();
  /** Stack blocks currently executing (a block can run in several scripts at once). */
  private readonly runningBlocks = new Map<string, number>();

  public markRunning(blockId: string, delta: 1 | -1) {
    const count = (this.runningBlocks.get(blockId) ?? 0) + delta;
    if (count > 0) this.runningBlocks.set(blockId, count);
    else this.runningBlocks.delete(blockId);
  }

  public isBlockRunning(blockId: string) {
    return this.runningBlocks.has(blockId);
  }

  /** Blocks executing right now, for highlighting in the code view. */
  public runningBlockIds(): string[] {
    return [...this.runningBlocks.keys()];
  }

  /** IDs of the top-level blocks (scripts) on the workspace, in reading order. */
  public getScripts(): string[] {
    return Object.values(this.blocks)
      .filter((block) => block.topLevel && !block.shadow)
      .sort((a, b) => a.y - b.y || a.x - b.x)
      .map((block) => block.id);
  }

  /** Whether the script starting at this top-level block is running. */
  public isScriptRunning(topBlockId: string) {
    const context = this.hatContexts.get(topBlockId);
    return Boolean(context?.isActive);
  }

  public isHatBlock(opcode: string) {
    return this.isHat(opcode);
  }

  public constructor(targetId: TargetId, lanRouter: LANRouter, name: string) {
    this.targetId = targetId;
    this.lanRouter = lanRouter;
    this.name = name;
    lanRouter.registerTarget(this);
  }

  /** Loads the variables and lists from the project (all targets' and the stage's). */
  public setInitialData(variables: { [index: string]: [string, any]; }, lists: { [index: string]: [string, any[]]; }) {
    this.initialVariables = variables;
    this.initialLists = lists;
    this.resetData();
  }

  public resetData() {
    for (const key of Object.keys(this.variables)) delete this.variables[key];
    for (const key of Object.keys(this.lists)) delete this.lists[key];
    for (const [id, [name, value]] of Object.entries(this.initialVariables)) this.variables[id] = { name, value };
    for (const [id, [name, value]] of Object.entries(this.initialLists)) this.lists[id] = { name, value: [...value] };
    this.notifyDataChanged();
  }

  /** Finds a variable by ID, falling back to its name (IDs can differ between stage and device). */
  private findVariable(id: string, name?: string) {
    if (this.variables[id]) return this.variables[id];
    if (name) {
      const byName = Object.values(this.variables).find((v) => v.name === name);
      if (byName) return byName;
    }
    return (this.variables[id] = { name: name ?? id, value: 0 });
  }

  public setVariable(id: string, value: any, name?: string) {
    this.findVariable(id, name).value = value;
    this.notifyDataChanged();
  }

  public changeVariableBy(id: string, value: number, name?: string) {
    const variable = this.findVariable(id, name);
    variable.value = toNumber(variable.value) + value;
    this.notifyDataChanged();
  }

  public getVariable(id: string, name?: string) {
    return this.findVariable(id, name).value;
  }

  public getList(id: string, name?: string): any[] {
    if (this.lists[id]) return this.lists[id].value;
    if (name) {
      const byName = Object.values(this.lists).find((l) => l.name === name);
      if (byName) return byName.value;
    }
    return (this.lists[id] = { name: name ?? id, value: [] }).value;
  }

  public getVariableEntries(): VariableEntry[] {
    return [
      ...Object.entries(this.variables).map(([id, { name, value }]) => ({ id, name, value, isList: false })),
      ...Object.entries(this.lists).map(([id, { name, value }]) => ({ id, name, value: [...value], isList: true })),
    ];
  }

  public onDataChanged(listener: () => void) {
    this.dataListeners.add(listener);
    return () => this.dataListeners.delete(listener);
  }

  public notifyDataChanged() {
    for (const listener of this.dataListeners) listener();
  }

  /**
   * Adds a block to the target.
   * @param block The block to add to the target.
   */
  public async addBlock(block: Block) {
    this.blocks[block.id] = block;
  }

  /**
   * Processes all added blocks.
   *
   * This is where all the opcodes are checked for support and hat blocks are registered.
   */
  public async processBlocks() {
    for (const block of Object.values(this.blocks)) {
      try {
        if (!this.opcodeSupported(block.opcode) && !isMenuBlock(block)) {
          this.unsupportedOpcodes.add(block.opcode);
          continue;
        }
        if (this.isHat(block.opcode)) await this.registerEventBlock(block);
        if (block.opcode === "procedures_definition") await this.registerProcedureBlock(block);
      } catch (error) {
        console.error(error);
      }
    }
  }

  /**
   * Gets a block from the internal block storage.
   * @param id The block's ID.
   * @returns A readonly version of the block.
   */
  public getBlock(id: string): Readonly<Block> {
    return this.blocks[id];
  }

  /**
   * Saves the event block to the events register.
   * @param block The event block.
   */
  private async registerEventBlock(block: Block) {
    const { opcode, id } = block;
    if (!(opcode in this.hatBlocksByEvent)) this.hatBlocksByEvent[opcode] = [];
    const ret = (await this.defaultContext.evaluateBlock(id)).ret;
    this.hatBlocksByEvent[opcode].push({ id, option: ret });
  }

  /**
   * Gets the available events.
   * @returns The list of events that are being listened for.
   */
  public getEvents(): { opcode: string, option: any; }[] {
    const events: { opcode: string, option: any; }[] = [];
    for (const [opcode, blocks] of Object.entries(this.hatBlocksByEvent)) {
      for (const { option } of blocks) {
        if (!events.some((event) => event.opcode === opcode && event.option === option)) {
          events.push({ opcode, option });
        }
      }
    }
    return events;
  }

  public hasEvent(eventOpcode: string) {
    return (this.hatBlocksByEvent[eventOpcode]?.length ?? 0) > 0;
  }

  /**
   * Runs one hat block's script, restarting it if it's already running.
   */
  protected startHat(hatBlockId: string): Context {
    this.hatContexts.get(hatBlockId)?.destroy();
    const newContext = new Context(this);
    this.hatContexts.set(hatBlockId, newContext);
    this.saveContext(newContext);
    newContext.runStartingAt(hatBlockId);
    return newContext;
  }

  /**
   * Runs all hat blocks with a certain opcode.
   * @param eventOpcode The opcode of the hat block.
   * @param option Option to pass to the hat block.
   * @returns The started contexts.
   */
  public runHatBlocks(eventOpcode: string, option?: any): Context[] {
    if (!this.hatBlocksByEvent[eventOpcode]) return [];
    const started: Context[] = [];
    for (const hatBlock of this.hatBlocksByEvent[eventOpcode]) {
      if (option === undefined || hatBlock.option == option || compare(hatBlock.option, option) === 0) {
        started.push(this.startHat(hatBlock.id));
      }
    }
    return started;
  }

  /**
   * Fires a broadcast. With a context given, waits until all receivers finished.
   */
  public async broadcast(message: any, waitingContext?: Context) {
    const started = this.runHatBlocks("event_whenbroadcastreceived", message);
    if (waitingContext) await waitingContext.waitUntil(() => started.every((c) => !c.isActive));
  }

  /**
   * Saves a reference to a context belonging to this target.
   * @param context The context to be saved.
   */
  public saveContext(context: Context) {
    this.contexts[context.id] = context;
  }

  /**
   * Saves the procedure definition to the procedure register.
   * @param block The `procedure_definition` block.
   */
  public async registerProcedureBlock(block: Block) {
    const prototypeBlockId = await this.defaultContext.decodeInput(block.inputs["custom_block"], true);
    const procCode = this.getBlock(prototypeBlockId)?.mutation?.procCode;
    if (procCode) this.procedureDefinitionIdsByProcCode[procCode] = block.id;
  }

  /**
   * Gets the block ID of the procedure definition block by its procedure code.
   * @param procCode The procedure code.
   * @returns The block ID of the procedure definition block.
   */
  public getProcId(procCode: string): string {
    return this.procedureDefinitionIdsByProcCode[procCode];
  }

  /**
   * Calls a procedure.
   * @param procCode The procedure code.
   * @param args The procedure arguments.
   * @param context Optionally the current execution context. Not needed when calling the procedure manually.
   */
  public async callProcedure(procCode: string, args: ProcedureArgs, context?: Context) {
    if (!context) {
      // Called from the UI: give it its own script so "Stop" can stop it.
      context = new Context(this);
      this.saveContext(context);
    }
    return await context.evaluateBlock(this.getProcId(procCode), args);
  }

  /**
   * Get the all procedure codes and their corresponding arguments.
   * @returns The procedures and arguments.
   */
  public async getProcedures(): Promise<ProcedureDefinition[]> {
    if (this.procedureDefinitionCache !== null) return this.procedureDefinitionCache;

    /**
     * Extracts the types from the procedure code.
     *
     * Example:
     * ```ts
     * console.log(getArgTypes("myProcedure %s %b %n %s"));
     * // output:
     * [ 'string', 'boolean', 'number', 'string' ]
     * ```
     * @param procCode The procedure code to extract the types from.
     * @returns A list of argument types in the correct order.
     */
    function getArgTypes(procCode: string): ArgType[] {
      const parts = procCode.split(" ");
      const types: ArgType[] = [];
      for (const part of parts) {
        if (part.search(/^%[snb]$/) === 0) {
          switch (part.split("")[1]) {
            case "s": types.push("string"); break;
            case "n": types.push("number"); break;
            case "b": types.push("boolean"); break;
          }
        }
      }
      return types;
    };

    const procedures: { procCode: string, argDefs: ArgDefs; }[] = [];
    for (const [procCode, definitionId] of Object.entries(this.procedureDefinitionIdsByProcCode)) {
      const definitionBlock = this.getBlock(definitionId);
      const prototypeBlock = this.getBlock(await this.defaultContext.decodeInput(definitionBlock.inputs["custom_block"], true));
      if (!prototypeBlock.mutation?.argumentIds) {
        console.log(new Error(`Property "mutation.argumentIds" is undefined for block "${prototypeBlock.id}".`));
        continue;
      }

      const argTypes = getArgTypes(procCode);
      const argumentIds = prototypeBlock.mutation.argumentIds;
      const argDefs: ArgDefs = [];
      for (let i = 0; i < argumentIds.length; i++) {
        const argId = argumentIds[i];
        const reporter = this.getBlock(await this.defaultContext.decodeInput(prototypeBlock.inputs[argId], true));
        if (!reporter) continue;
        const name = this.defaultContext.decodeField(reporter.fields["VALUE"]);
        const type = argTypes[i];
        let default_: string | number | boolean = "";
        if (type === "number") default_ = 0;
        else if (type === "boolean") default_ = false;
        argDefs.push({ name, type, default_ });
      }
      procedures.push({ procCode, argDefs });
    }
    this.procedureDefinitionCache = procedures;
    return procedures;
  }

  /**
   * Deletes a context by its symbol.
   * @param context The symbol that identifies the context.
   */
  public deleteContext(context: symbol) {
    if (this.contexts[context]) delete this.contexts[context];
  }

  /** Whether any script is currently running. */
  public get isRunning() {
    return Reflect.ownKeys(this.contexts).some((key) => this.contexts[key as symbol].isActive);
  }

  /**
   * Stops all scripts except the one with the root `exceptRoot` ("stop other scripts").
   * Unlike `stopAll`, motors and sounds keep going, just like on the robot.
   */
  public stopScripts(exceptRoot?: symbol) {
    for (const key of Reflect.ownKeys(this.contexts)) {
      const context = this.contexts[key as symbol];
      if (exceptRoot && context.rootId === exceptRoot) continue;
      context.stop();
    }
  }

  /**
   * Stops everything, including motors and sounds.
   */
  public stopAll() {
    this.stopScripts();
    this.stopCustom();
  }

  /**
   * A hook that is called by the `stopAll` function
   * to stop custom intervals running outside a
   * scratch context.
   */
  protected stopCustom() { }

  /**
   * Performs a minimal cleanup in preparation for deletion of the object.
   */
  public prepareDeletion() {
    this.stopAll();
    this.lanRouter.unregisterTarget(this);
  }

  public reportError(opcode: string, error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (!this.runtimeErrors.has(opcode)) {
      this.runtimeErrors.set(opcode, message);
      console.error(`[${opcode}]`, error);
    }
  }

  /**
   * Checks if an opcode is supported on the target.
   * @param opcode The opcode to check support for.
   */
  protected opcodeSupported(opcode: string): boolean {
    return opcode in StdOps;
  };

  /**
   * Checks if an opcode belongs to a block that may be triggered by an event.
   * @param opcode The opcode to check.
   */
  protected isHat(opcode: string): boolean {
    return StdHats.includes(opcode);
  };

  /**
   * The operation table of the target.
   */
  protected abstract get ops(): Ops<any>;

  /**
   * Executes an operation based on the block and the target.
   * @param context The context in which to run the operation.
   * @param block The block to execute.
   * @param option Option to pass to the operation handler.
   * @returns This function may return `any` value to be processed by
   * the caller of this function.
   */
  public async runOp(context: Context, block: Block, option?: any): Promise<void | null | symbol | any> {
    const op = this.ops[block.opcode];
    if (op) return await op(this, context, block, option);
    if (isMenuBlock(block)) {
      // Dropdown shadow blocks just report their selected value.
      const field = Object.values(block.fields)[0];
      return field ? field[0] : "";
    }
    this.unsupportedOpcodes.add(block.opcode);
    return "";
  };

  /**
   * Runs the activation event.
   *
   * For example: For a sprite this would be the 'green flag pressed' event.
   */
  public abstract activate(): void;
}
