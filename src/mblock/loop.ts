import type { Context } from "./context";
import { toBoolean } from "./values";

export class Loop {
  private running = true;
  private runIteration: () => Promise<void>;
  private context: Context;
  private ownLoopSymbol: symbol;

  /**
   * Creates a new loop.
   * @param context The context in which to evaluate the block.
   * @param firstLoopBlockId The ID of the first block in the loop, if the loop isn't empty.
   */
  constructor(context: Context, firstLoopBlockId: string | undefined, ownLoopSymbol: symbol) {
    this.context = context;
    // Every iteration yields to the event loop (like a Scratch frame), so a
    // `forever` without waits can't freeze the page and the physics keeps running.
    this.runIteration = () => new Promise<void>((resolve) => {
      setTimeout(async () => {
        if (firstLoopBlockId) await context.runStartingAt(firstLoopBlockId);
        resolve();
      }, 0);
    });
    this.ownLoopSymbol = ownLoopSymbol;
  }

  private get shouldRun() {
    return this.running && this.context.isActive;
  }

  /**
   * Runs the loop forever.
   */
  public async forever() {
    while (this.shouldRun) {
      await this.runIteration();
    }
    this.destroy();
  }

  /**
   * Runs the loop `times` times.
   * @param times The amount of times to run the loop.
   */
  public async times(times: number) {
    for (let i = 0; this.shouldRun && i < Math.round(times); i++) {
      await this.runIteration();
    }
    this.destroy();
  }

  private async condition(conditionBlockId: string | undefined) {
    if (!conditionBlockId) return false;
    return toBoolean((await this.context.evaluateBlock(conditionBlockId)).ret);
  }

  /**
   * Runs the loop until the condition is met.
   * @param conditionBlockId The condition block that must become true for the loop to stop.
   */
  public async until(conditionBlockId: string | undefined) {
    while (this.shouldRun && !(await this.condition(conditionBlockId))) {
      await this.runIteration();
    }
    this.destroy();
  }

  /**
   * Runs the loop while the condition is true.
   */
  public async while(conditionBlockId: string | undefined) {
    while (this.shouldRun && (await this.condition(conditionBlockId))) {
      await this.runIteration();
    }
    this.destroy();
  }

  /**
   * Prevent the loop from starting a new iteration.
   */
  public stop() {
    this.running = false;
  }

  /**
   * Stop the loop and delete it from its host's `activeLoops` map.
   */
  private destroy() {
    this.stop();
    this.context.deleteLoop(this.ownLoopSymbol);
  }
}
