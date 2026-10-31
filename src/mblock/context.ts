import { Loop } from "./loop";
import type { Std } from "./targets/std";
import { ScratchType, type Input, type Field } from "./block";
import { listToText } from "./values";

export type ProcedureArgs = { [index: string]: any; };

/**
 * Thrown inside a block that's still evaluating its inputs when its script is
 * stopped, so it can't run its effect (e.g. set the motors) after the stop.
 */
export const STOPPED = Symbol("stopped");

export class Context {
  /**
   * A symbol to uniquely identify this context.
   */
  public readonly id = Symbol();
  /**
   * The ID of the script (hat block run) this context belongs to.
   * Procedure calls create child contexts that share their caller's root.
   */
  public readonly rootId: symbol;
  /**
   * A reference to the parent target.
   */
  private readonly self: Std;
  /**
   * Whether the current context may continue running.
   */
  private active = true;
  /**
   * Whether the next call to `runStartingAt` is the context's outermost run.
   */
  private isMainRunner = true;
  /**
   * Local variables of the context.
   */
  public readonly args: { [index: string]: any; };
  /**
   * The loops currently running in this context.
   */
  private readonly activeLoops: { [index: symbol]: Loop; } = {};
  /**
   * Contexts started from this one (procedure calls) that must stop with it.
   */
  private readonly children = new Set<Context>();
  /**
   * Resolvers of pending sleeps, so stopping a script interrupts its waits.
   */
  private readonly wakers = new Set<() => void>();

  /**
   * @param self The parent target.
   * @param args Arguments to be passed to the context.
   * @param parent The context that started this one, if any.
   */
  public constructor(self: Std, args: { [index: string]: any; } = {}, parent?: Context) {
    this.self = self;
    Object.freeze(args);
    this.args = args;
    this.rootId = parent ? parent.rootId : this.id;
    if (parent) parent.children.add(this);
  }

  public get isActive() {
    return this.active;
  }

  /**
   * Decodes a scratch input array based on its scratch datatype.
   * @param input An input array.
   * @param noEval Can be set to `true` to return the ID of the block without running it.
   * @returns The input in the smartest format available.
   */
  public async decodeInput(input: Input | undefined, noEval?: true): Promise<any> {
    const value = await this.decodeInputRaw(input, noEval);
    if (!this.active && !noEval) throw STOPPED;
    return value;
  }

  private async decodeInputRaw(input: Input | undefined, noEval?: true): Promise<any> {
    if (!input) return noEval ? undefined : "";
    const [type, value, shadow] = input;
    if (
      type === ScratchType.InputSameBlockShadow ||
      type === ScratchType.InputBlockNoShadow ||
      type === ScratchType.InputDiffBlockShadow
    ) {
      // An empty slot falls back to its shadow (the value typed into the hole).
      const inner = value === null || value === undefined ? shadow : value;
      if (inner === null || inner === undefined) return noEval ? undefined : "";
      if (Array.isArray(inner)) return this.decodeInput(inner as Input, noEval);
      if (noEval) return inner;
      // A block ID: either a reporter or a shadow menu block.
      return (await this.evaluateBlock(inner as string)).ret;
    }
    if (type === ScratchType.Broadcast) return String(shadow ?? value);
    if (type === ScratchType.Variable) return this.self.getVariable(shadow as string, value as string);
    if (type === ScratchType.List) return listToText(this.self.getList(shadow as string, value as string));
    // Literals are returned raw; operations cast them like Scratch does.
    return value;
  }

  /**
   * Decodes a scratch field array.
   * @param field A field array.
   * @returns The ID, otherwise the data saved in the field.
   */
  public decodeField(field: Field | undefined) {
    if (!field) return "";
    return field[1] || field[0];
  }

  /**
   * Runs an existing block.
   * @param id The block's ID.
   * @param option Options to pass to the block.
   * @returns The ID of the next block and the raw return value of the operation.
   */
  public async evaluateBlock(id: string, option?: any): Promise<{ nextId: string | null, ret: any; }> {
    const block = this.self.getBlock(id);
    if (!block) return { nextId: null, ret: "" };
    let ret;
    try {
      ret = await this.self.runOp(this, block, option);
    } catch (error) {
      if (error === STOPPED) return { nextId: null, ret: "" };
      this.self.reportError(block.opcode, error);
    }
    return { nextId: block.next, ret };
  }

  /**
   * Run the block with ID `id` and all `next` blocks after it.
   * @param id The block's ID.
   * @param option Option to pass to the starting block.
   */
  public async runStartingAt(id: string | undefined, option?: any) {
    const isMainRunner = this.isMainRunner;
    if (isMainRunner) this.isMainRunner = false;
    if (id && this.active) {
      let { nextId } = await this.runStackBlock(id, option);
      while (nextId && this.active) {
        nextId = (await this.runStackBlock(nextId, null)).nextId;
      }
    }
    if (isMainRunner) this.destroy();
  }

  /** Runs one block of a stack, marking it as running for the code view. */
  private async runStackBlock(id: string, option: any) {
    this.self.markRunning(id, 1);
    try {
      return await this.evaluateBlock(id, option);
    } finally {
      this.self.markRunning(id, -1);
    }
  }

  /**
   * Waits for `ms` milliseconds. Resolves early if the context is stopped.
   */
  public sleep(ms: number): Promise<void> {
    if (!this.active) return Promise.resolve();
    return new Promise((resolve) => {
      const wake = () => {
        clearTimeout(timer);
        this.wakers.delete(wake);
        resolve();
      };
      const timer = setTimeout(wake, Math.max(0, ms));
      this.wakers.add(wake);
    });
  }

  /**
   * Waits until `condition` returns true. Resolves early if the context is stopped.
   */
  public async waitUntil(condition: () => boolean | Promise<boolean>, pollMs = 10) {
    while (this.active && !(await condition())) {
      await this.sleep(pollMs);
    }
  }

  /**
   * Runs a loop forever.
   * @param firstLoopBlockId The first block in the loop.
   */
  public async runLoopForever(firstLoopBlockId: string | undefined) {
    const ownLoop = Symbol();
    const newLoop = new Loop(this, firstLoopBlockId, ownLoop);
    this.activeLoops[ownLoop] = newLoop;
    await newLoop.forever();
  }

  /**
   * Runs a loop a certain amount of times.
   * @param firstLoopBlockId The first block in the loop.
   * @param times The amount of times to run the loop.
   */
  public async runLoopTimes(firstLoopBlockId: string | undefined, times: number) {
    const ownLoop = Symbol();
    const newLoop = new Loop(this, firstLoopBlockId, ownLoop);
    this.activeLoops[ownLoop] = newLoop;
    await newLoop.times(times);
  }

  /**
   * Runs a loop until a condition is met.
   * @param firstLoopBlockId The first block in the loop.
   * @param conditionBlockId The condition block that must become true for the loop to stop.
   */
  public async runLoopUntil(firstLoopBlockId: string | undefined, conditionBlockId: string | undefined) {
    const ownLoop = Symbol();
    const newLoop = new Loop(this, firstLoopBlockId, ownLoop);
    this.activeLoops[ownLoop] = newLoop;
    await newLoop.until(conditionBlockId);
  }

  /**
   * Runs a loop while a condition holds.
   */
  public async runLoopWhile(firstLoopBlockId: string | undefined, conditionBlockId: string | undefined) {
    const ownLoop = Symbol();
    const newLoop = new Loop(this, firstLoopBlockId, ownLoop);
    this.activeLoops[ownLoop] = newLoop;
    await newLoop.while(conditionBlockId);
  }

  /**
   * Deletes a loop by its symbol.
   * @param loop The symbol that identifies the loop.
   */
  public deleteLoop(loop: symbol) {
    if (this.activeLoops[loop]) delete this.activeLoops[loop];
  }

  /**
   * Stops the execution of everything in this context.
   */
  public stop() {
    this.active = false;
    for (const loop of Reflect.ownKeys(this.activeLoops)) {
      this.activeLoops[loop as symbol].stop();
    }
    for (const wake of [...this.wakers]) wake();
    for (const child of this.children) child.stop();
  }

  /**
   * Stop the execution and deletes the context.
   */
  public destroy() {
    this.stop();
    this.self.deleteContext(this.id);
  }
}
