import type { TextKey } from '../data/texts';
import type { SaveRejection } from '../sim/saveData';

/**
 * The little menu behind the gear ("Dein Dorf"): save to a file, load from a
 * file. Loading never replaces the village at once – a chosen file first
 * waits for a ✓ ("Dein jetziges Dorf wird ersetzt"), ✕ throws it away. Pure
 * and tested; `VillageMenu` shows what it says.
 *
 * - `closed`: the gear is just a button.
 * - `menu`: the two buttons, with a sentence (`message`) about what happened last.
 * - `confirm`: a village from a file is waiting (`pending`) for ✓ or ✕.
 */
export type MenuMode = 'closed' | 'menu' | 'confirm';

/** The sentence for a file that could not be used. */
export function rejectionText(reason: SaveRejection): TextKey {
  switch (reason) {
    case 'notSave':
      return 'menu.errorNotSave';
    case 'tooNew':
      return 'menu.errorTooNew';
    case 'broken':
      return 'menu.errorBroken';
  }
}

export class MenuFlow<T> {
  private currentMode: MenuMode = 'closed';
  private note: TextKey | undefined;
  private waiting: T | undefined;

  get mode(): MenuMode {
    return this.currentMode;
  }

  /** The sentence about the last action (an error, "file saved"), or `undefined` for the standing info line. */
  get message(): TextKey | undefined {
    return this.note;
  }

  /** The village from a file that waits for ✓. */
  get pending(): T | undefined {
    return this.waiting;
  }

  get isOpen(): boolean {
    return this.currentMode !== 'closed';
  }

  open(): void {
    this.currentMode = 'menu';
    this.note = undefined;
    this.waiting = undefined;
  }

  close(): void {
    this.currentMode = 'closed';
    this.note = undefined;
    this.waiting = undefined;
  }

  /** A sentence in the menu (file saved, file could not be used); nothing changes otherwise. */
  say(message: TextKey): void {
    if (this.currentMode !== 'closed') {
      this.currentMode = 'menu';
      this.note = message;
      this.waiting = undefined;
    }
  }

  /** A usable village was chosen: now ✓ or ✕. */
  ask(village: T): void {
    if (this.currentMode !== 'closed') {
      this.currentMode = 'confirm';
      this.note = undefined;
      this.waiting = village;
    }
  }

  /** ✓: hands over the waiting village and closes the menu. `undefined` if none is waiting. */
  confirm(): T | undefined {
    const village = this.currentMode === 'confirm' ? this.waiting : undefined;
    if (village !== undefined) {
      this.close();
    }
    return village;
  }

  /** ✕ on the question: the file is forgotten, back to the two buttons. */
  cancel(): void {
    if (this.currentMode === 'confirm') {
      this.currentMode = 'menu';
      this.note = undefined;
      this.waiting = undefined;
    }
  }
}
