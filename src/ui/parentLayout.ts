import type { Rect } from './cameraMath';

/**
 * Where the parts of the parents' menu go (M8), pure maths in CSS px, tested on every screen size: nothing overlaps,
 * nothing leaves the screen, every key and button is at least 48 px.
 *
 * - The **keypad** (PIN and question): a panel with the title and a big ✕, a sentence, the dots of the digits typed so
 *   far, twelve big keys (1–9, ⌫, 0) and "PIN vergessen?" under them. On a low screen (a phone held sideways) the keys
 *   go to the right half of the panel, everything else to the left.
 * - The **settings**: title and ✕, "Spielzeit pro Tag" with six choices (Aus, 15 … 90 minutes, three in a row), a
 *   sentence (time played today, or what just happened), and three wide buttons ("Heute noch 10 Minuten mehr", "PIN
 *   ändern", "Tutorial noch einmal"). On a low screen the three buttons stand on the right.
 */

export const PARENT_MARGIN = 12;
const PAD = 14;
const GAP = 8;
const KEY_GAP = 10;
export const PARENT_CLOSE = 56;
const HEADER_H = 56;
const MIN_KEY = 52;
const MIN_TAP = 48;
const MAX_KEY_H = 72;
const FORGOT_H = 48;
const DOTS_H = 40;

/** The keys in their order on the pad: three in a row, `back` is ⌫. */
export const PAD_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'back', '0', 'none'] as const;
export type PadKey = Exclude<(typeof PAD_KEYS)[number], 'none'>;

export interface PinPadLayout {
  readonly veil: Rect;
  readonly panel: Rect;
  readonly title: Rect;
  readonly close: Rect;
  readonly text: Rect;
  readonly dots: Rect;
  readonly keys: Readonly<Record<PadKey, Rect>>;
  readonly forgot: Rect;
  readonly low: boolean;
  readonly titleFont: number;
  readonly textFont: number;
  readonly keyFont: number;
}

function panelAt(width: number, height: number, panelW: number, panelH: number): Rect {
  return { x: (width - panelW) / 2, y: Math.max(PARENT_MARGIN, (height - panelH) / 2), width: panelW, height: panelH };
}

function keyGrid(left: number, top: number, keyW: number, keyH: number): Record<PadKey, Rect> {
  const keys: Partial<Record<PadKey, Rect>> = {};
  PAD_KEYS.forEach((key, index) => {
    if (key !== 'none') {
      const col = index % 3;
      const row = Math.floor(index / 3);
      keys[key] = { x: left + col * (keyW + KEY_GAP), y: top + row * (keyH + KEY_GAP), width: keyW, height: keyH };
    }
  });
  return keys as Record<PadKey, Rect>;
}

/** Fixed height of the upright keypad without the four rows of keys. */
const UPRIGHT_FIXED = PAD + HEADER_H + GAP + 52 + GAP + DOTS_H + GAP + 3 * KEY_GAP + GAP + FORGOT_H + PAD;

export function pinPadLayout(width: number, height: number): PinPadLayout {
  const veil: Rect = { x: 0, y: 0, width, height };
  const uprightKeyH = Math.min(MAX_KEY_H, (height - 2 * PARENT_MARGIN - UPRIGHT_FIXED) / 4);
  const low = uprightKeyH < MIN_KEY;
  if (!low) {
    const keyH = Math.max(MIN_KEY, uprightKeyH);
    const panelW = Math.min(420, width - 2 * PARENT_MARGIN);
    const panelH = UPRIGHT_FIXED + 4 * keyH;
    const panel = panelAt(width, height, panelW, panelH);
    const innerX = panel.x + PAD;
    const innerW = panelW - 2 * PAD;
    const close: Rect = { x: panel.x + panelW - PAD - PARENT_CLOSE, y: panel.y + PAD, width: PARENT_CLOSE, height: PARENT_CLOSE };
    const title: Rect = { x: innerX, y: panel.y + PAD, width: close.x - GAP - innerX, height: HEADER_H };
    const text: Rect = { x: innerX, y: title.y + HEADER_H + GAP, width: innerW, height: 52 };
    const dots: Rect = { x: innerX, y: text.y + text.height + GAP, width: innerW, height: DOTS_H };
    const keyW = (innerW - 2 * KEY_GAP) / 3;
    const keysTop = dots.y + DOTS_H + GAP;
    const keys = keyGrid(innerX, keysTop, keyW, keyH);
    const forgot: Rect = { x: innerX, y: keysTop + 4 * keyH + 3 * KEY_GAP + GAP, width: innerW, height: FORGOT_H };
    return { veil, panel, title, close, text, dots, keys, forgot, low, titleFont: width < 420 ? 24 : 28, textFont: width < 420 ? 16 : 18, keyFont: Math.min(34, keyH * 0.5) };
  }
  // Low: the keys on the right, all the rest on the left.
  const panelW = Math.min(680, width - 2 * PARENT_MARGIN);
  const panelH = Math.min(420, height - 2 * PARENT_MARGIN);
  const panel = panelAt(width, height, panelW, panelH);
  const keyH = Math.max(MIN_TAP, (panelH - 2 * PAD - 3 * KEY_GAP) / 4);
  // The left half keeps at least 170 px for the sentence.
  const keyW = Math.max(MIN_TAP, Math.min(96, keyH * 1.25, (panelW - 3 * PAD - 170 - 2 * KEY_GAP) / 3));
  const padW = 3 * keyW + 2 * KEY_GAP;
  const keysLeft = panel.x + panelW - PAD - padW;
  const keys = keyGrid(keysLeft, panel.y + PAD, keyW, keyH);
  const innerX = panel.x + PAD;
  const leftW = keysLeft - PAD - innerX;
  const close: Rect = { x: innerX + leftW - PARENT_CLOSE, y: panel.y + PAD, width: PARENT_CLOSE, height: PARENT_CLOSE };
  const title: Rect = { x: innerX, y: panel.y + PAD, width: close.x - GAP - innerX, height: HEADER_H };
  const forgot: Rect = { x: innerX, y: panel.y + panelH - PAD - FORGOT_H, width: leftW, height: FORGOT_H };
  const dots: Rect = { x: innerX, y: forgot.y - GAP - DOTS_H, width: leftW, height: DOTS_H };
  const textTop = title.y + HEADER_H + GAP;
  const text: Rect = { x: innerX, y: textTop, width: leftW, height: dots.y - GAP - textTop };
  return { veil, panel, title, close, text, dots, keys, forgot, low, titleFont: 22, textFont: 15, keyFont: Math.min(30, keyH * 0.5) };
}

export interface ParentSettingsLayout {
  readonly veil: Rect;
  readonly panel: Rect;
  readonly title: Rect;
  readonly close: Rect;
  /** "Spielzeit pro Tag". */
  readonly label: Rect;
  /** One button per choice of the limit, in the order of `limitChoices`. */
  readonly choices: readonly Rect[];
  /** Time played today, or what just happened. */
  readonly text: Rect;
  readonly extra: Rect;
  readonly pin: Rect;
  readonly tutorial: Rect;
  /** M9: music and noises on/off, side by side. */
  readonly music: Rect;
  readonly sfx: Rect;
  readonly low: boolean;
  readonly titleFont: number;
  readonly textFont: number;
  readonly buttonFont: number;
}

const CHOICE_H = 52;
const ACTION_H = 56;
/** Upright the three actions are a little lower since M9, so the row of the sound fits the phone (320×568). */
const UPRIGHT_ACTION_H = 52;
const SOUND_H = 52;
/** Sideways (M9): a little less frame and a lower title, so four rows of 48 px fit on the right (320 px high). */
const LOW_PAD = 12;
const LOW_HEADER_H = 48;
const LABEL_H = 28;
const TEXT_H = 52;
/** Upright: the frame below the row of the sound is as wide as above the title (Korrekturrunde 1). */
const UPRIGHT_SETTINGS_H =
  PAD + HEADER_H + GAP + LABEL_H + GAP + 2 * CHOICE_H + GAP + GAP + TEXT_H + GAP + 3 * (UPRIGHT_ACTION_H + GAP) + SOUND_H + PAD;

function choiceGrid(left: number, top: number, innerW: number, count: number): Rect[] {
  const cols = 3;
  const each = (innerW - (cols - 1) * GAP) / cols;
  return Array.from({ length: count }, (_unused, index) => ({
    x: left + (index % cols) * (each + GAP),
    y: top + Math.floor(index / cols) * (CHOICE_H + GAP),
    width: each,
    height: CHOICE_H,
  }));
}

export function parentSettingsLayout(width: number, height: number, choiceCount: number): ParentSettingsLayout {
  const veil: Rect = { x: 0, y: 0, width, height };
  const rows = Math.ceil(choiceCount / 3);
  const choicesH = rows * CHOICE_H + (rows - 1) * GAP;
  const uprightH = UPRIGHT_SETTINGS_H - (2 * CHOICE_H + GAP) + choicesH;
  const low = uprightH > height - 2 * PARENT_MARGIN;
  if (!low) {
    const panelW = Math.min(520, width - 2 * PARENT_MARGIN);
    const panel = panelAt(width, height, panelW, uprightH);
    const innerX = panel.x + PAD;
    const innerW = panelW - 2 * PAD;
    const close: Rect = { x: panel.x + panelW - PAD - PARENT_CLOSE, y: panel.y + PAD, width: PARENT_CLOSE, height: PARENT_CLOSE };
    const title: Rect = { x: innerX, y: panel.y + PAD, width: close.x - GAP - innerX, height: HEADER_H };
    const label: Rect = { x: innerX, y: title.y + HEADER_H + GAP, width: innerW, height: LABEL_H };
    const choicesTop = label.y + LABEL_H + GAP;
    const choices = choiceGrid(innerX, choicesTop, innerW, choiceCount);
    const text: Rect = { x: innerX, y: choicesTop + choicesH + GAP, width: innerW, height: TEXT_H };
    const actionTop = text.y + TEXT_H + GAP;
    const action = (index: number): Rect => ({ x: innerX, y: actionTop + index * (UPRIGHT_ACTION_H + GAP), width: innerW, height: UPRIGHT_ACTION_H });
    const soundTop = actionTop + 3 * (UPRIGHT_ACTION_H + GAP);
    const half = (innerW - GAP) / 2;
    const music: Rect = { x: innerX, y: soundTop, width: half, height: SOUND_H };
    const sfx: Rect = { x: innerX + half + GAP, y: soundTop, width: half, height: SOUND_H };
    return {
      veil,
      panel,
      title,
      close,
      label,
      choices,
      text,
      extra: action(0),
      pin: action(1),
      tutorial: action(2),
      music,
      sfx,
      low,
      titleFont: width < 420 ? 24 : 28,
      textFont: width < 420 ? 15 : 17,
      buttonFont: width < 420 ? 17 : 20,
    };
  }
  const panelW = Math.min(760, width - 2 * PARENT_MARGIN);
  const panelH = Math.min(440, height - 2 * PARENT_MARGIN);
  const panel = panelAt(width, height, panelW, panelH);
  const innerX = panel.x + LOW_PAD;
  const innerW = panelW - 2 * LOW_PAD;
  const close: Rect = { x: panel.x + panelW - LOW_PAD - LOW_HEADER_H, y: panel.y + LOW_PAD, width: LOW_HEADER_H, height: LOW_HEADER_H };
  const title: Rect = { x: innerX, y: panel.y + LOW_PAD, width: close.x - GAP - innerX, height: LOW_HEADER_H };
  const bodyTop = title.y + LOW_HEADER_H + GAP;
  const bodyH = panel.y + panelH - LOW_PAD - bodyTop;
  const colW = (innerW - 2 * GAP) / 2;
  const label: Rect = { x: innerX, y: bodyTop, width: colW, height: LABEL_H };
  const choicesTop = bodyTop + LABEL_H + GAP;
  const choices = choiceGrid(innerX, choicesTop, colW, choiceCount);
  const textTop = choicesTop + choicesH + GAP;
  const text: Rect = { x: innerX, y: textTop, width: colW, height: bodyTop + bodyH - textTop };
  const rightX = innerX + colW + 2 * GAP;
  const actionH = Math.min(ACTION_H + 8, (bodyH - 3 * GAP) / 4);
  const action = (index: number): Rect => ({ x: rightX, y: bodyTop + index * (actionH + GAP), width: colW, height: actionH });
  const sound = action(3);
  const half = (colW - GAP) / 2;
  const music: Rect = { ...sound, width: half };
  const sfx: Rect = { ...sound, x: sound.x + half + GAP, width: half };
  return { veil, panel, title, close, label, choices, text, extra: action(0), pin: action(1), tutorial: action(2), music, sfx, low, titleFont: 22, textFont: 14, buttonFont: 16 };
}
