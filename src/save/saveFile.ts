import { themeValues } from '../data/texts';

/** A save is a few dozen kilobytes; anything over this is not one of ours (and is not read at all). */
export const MAX_SAVE_BYTES = 2_000_000;

/** What came out of choosing a file. */
export type PickResult =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'tooBig' }
  | { readonly kind: 'unreadable' }
  | { readonly kind: 'cancelled' };

/** `name` as a plain file name part: lower case, no accents, only letters, digits and dashes. */
export function fileSafe(name: string): string {
  const plain = name
    .replaceAll('ä', 'ae')
    .replaceAll('ö', 'oe')
    .replaceAll('ü', 'ue')
    .replaceAll('Ä', 'Ae')
    .replaceAll('Ö', 'Oe')
    .replaceAll('Ü', 'Ue')
    .replaceAll('ß', 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return plain === '' ? 'village' : plain;
}

/** The name of the file for a save: game name and local date, e.g. `spielname-2026-10-31.json`. */
export function saveFileName(date: Date = new Date()): string {
  const two = (value: number): string => String(value).padStart(2, '0');
  const day = `${String(date.getFullYear())}-${two(date.getMonth() + 1)}-${two(date.getDate())}`;
  return `${fileSafe(themeValues.get('gameName') ?? '')}-${day}.json`;
}

/** Offers the text as a download (a file the parents can keep). Works with a tap; returns whether the browser took it. */
export function downloadTextFile(fileName: string, text: string): boolean {
  try {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.rel = 'noopener';
    link.style.display = 'none';
    document.body.append(link);
    link.click();
    link.remove();
    // Give the browser a moment to start the download before the address goes away.
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 10_000);
    return true;
  } catch {
    return false;
  }
}

/**
 * Opens the file chooser of the device and reads the chosen file as text. Has
 * to be called from the tap itself (browsers only open the chooser then).
 * Files over {@link MAX_SAVE_BYTES} are not read.
 */
export function pickTextFile(): Promise<PickResult> {
  return new Promise((resolve) => {
    let input: HTMLInputElement;
    try {
      input = document.createElement('input');
    } catch {
      resolve({ kind: 'unreadable' });
      return;
    }
    input.type = 'file';
    input.accept = '.json,application/json';
    // Kept in the page (invisible) until it answers: some tablets do not report a chosen file for a loose input.
    input.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none;';
    let finished = false;
    const finish = (result: PickResult): void => {
      if (finished) {
        return;
      }
      finished = true;
      input.remove();
      resolve(result);
    };
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) {
        finish({ kind: 'cancelled' });
        return;
      }
      if (file.size > MAX_SAVE_BYTES) {
        finish({ kind: 'tooBig' });
        return;
      }
      file
        .text()
        .then((text) => {
          finish({ kind: 'text', text });
        })
        .catch(() => {
          finish({ kind: 'unreadable' });
        });
    });
    input.addEventListener('cancel', () => {
      finish({ kind: 'cancelled' });
    });
    document.body.append(input);
    input.click();
  });
}
