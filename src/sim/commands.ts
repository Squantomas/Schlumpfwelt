import type { SimState } from './state';

/**
 * Commands are the only way for scenes and UI to change the simulation.
 * Each command is a plain object with a `type` discriminator, so it is easy to
 * log, test and – if ever needed – replay.
 *
 * To add a command: extend the union below and handle it in `applyCommand`.
 * The `never` check makes the compiler complain about unhandled commands.
 */
export type Command = SetPausedCommand;

export interface SetPausedCommand {
  readonly type: 'setPaused';
  readonly paused: boolean;
}

/** Applies a single command to the state (mutates `state`). */
export function applyCommand(state: SimState, command: Command): void {
  switch (command.type) {
    case 'setPaused':
      state.paused = command.paused;
      return;
    default:
      return assertNever(command.type);
  }
}

function assertNever(type: never): never {
  throw new Error(`Unhandled command: ${String(type)}`);
}
