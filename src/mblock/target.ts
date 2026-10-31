import { Block } from "./block";
import { MBot2 } from "./targets/mbot2";
import type { LANRouter } from "./global";

export interface MBlockJSON {
  targets: TargetJSON[],
}

export interface TargetJSON {
  isStage: boolean,
  name: string,
  variables: { [index: string]: [string, any]; },
  lists: { [index: string]: [string, any[]]; },
  broadcasts: object,
  blocks: { [index: string]: any; },
  deviceId?: string,
  loadedExtIds?: string[],
}

export type ParsedTarget = { target: TargetJSON, error?: string; };

export enum TargetId {
  MBot2 = "mbot2"
}

export type ParsedProject = {
  /** Device targets that can be simulated. */
  robots: TargetJSON[];
  /** Device targets the simulator can't run, with the reason. */
  unsupported: { name: string, reason: string; }[];
  /** Global variables and lists (stored on the stage). */
  globals: { variables: TargetJSON["variables"], lists: TargetJSON["lists"]; };
};

const DEVICE_NAMES: Record<string, string> = {
  mbot: "mBot (the original mBot)",
  codey: "Codey Rocky",
  halocode: "HaloCode",
  arduino_uno: "Arduino Uno",
  mega2560: "Arduino Mega",
  ranger: "mBot Ranger",
  mbot_mega: "mBot Mega",
  neuron: "Neuron",
};

export function parseProject(mBlock: unknown): ParsedProject {
  if (!mBlock || typeof mBlock !== "object" || !Array.isArray((mBlock as MBlockJSON).targets)) {
    throw new Error("This doesn't look like an mBlock project.");
  }
  const robots: TargetJSON[] = [];
  const unsupported: ParsedProject["unsupported"] = [];
  const globals: ParsedProject["globals"] = { variables: {}, lists: {} };
  for (const target of (mBlock as MBlockJSON).targets) {
    if (target.isStage) {
      Object.assign(globals.variables, target.variables || {});
      Object.assign(globals.lists, target.lists || {});
    } else if (target.deviceId === "cyberpi") {
      // CyberPi on its own and CyberPi mounted on an mBot2 are both simulated as an mBot2.
      robots.push(target);
    } else if (target.deviceId) {
      unsupported.push({ name: target.name, reason: `${DEVICE_NAMES[target.deviceId] ?? target.deviceId} isn't supported — only CyberPi / mBot2.` });
    }
    // Sprites (no deviceId) only run in mBlock's stage and are ignored.
  }
  return { robots, unsupported, globals };
}

export async function createRobot(target: TargetJSON, globals: ParsedProject["globals"], lanRouter: LANRouter, name: string): Promise<MBot2> {
  const entity = new MBot2(TargetId.MBot2, lanRouter, name);
  for (const [id, block] of Object.entries(target.blocks || {})) {
    // Top-level variable reporters are stored as arrays; they never run.
    if (block && typeof block === "object" && !Array.isArray(block) && block.opcode) {
      entity.addBlock(new Block(id, block));
    }
  }
  entity.setInitialData(
    { ...globals.variables, ...(target.variables || {}) },
    { ...globals.lists, ...(target.lists || {}) },
  );
  await entity.processBlocks();
  return entity;
}
