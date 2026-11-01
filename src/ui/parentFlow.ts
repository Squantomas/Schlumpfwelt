import { PARENT_RULES } from '../data/parent';
import type { TextKey } from '../data/texts';

/**
 * The steps of the parents' menu (M8), pure and tested; `ParentPanel` draws them, the parents' session keeps the PIN.
 *
 * - `newPin` / `repeatPin`: the first time (and "PIN ändern", and after "PIN vergessen?") the parents choose a PIN of
 *   four digits and type it twice. Two different ones: friendly, once more from the start.
 * - `enterPin`: the PIN opens the settings. A wrong one only says so – no waiting, no lock: it keeps the children out,
 *   it must never keep the parents out.
 * - `question`: "PIN vergessen?" asks for the product of two numbers from 12 to 29 (e.g. 23 × 14 – easy for an adult,
 *   or with a calculator, hard for a child of 6 to 10). The right answer lets the parents choose a new PIN; a wrong one
 *   gives a new question.
 * - `settings`: the limit, "10 Minuten mehr", "PIN ändern", "Tutorial noch einmal" (the scene does these).
 *
 * Digits are entered on the big keypad; a full PIN (or a full answer – always three digits) is checked at once, so
 * there is no extra "OK".
 */
export type ParentMode = 'closed' | 'newPin' | 'repeatPin' | 'enterPin' | 'question' | 'settings';

export interface PinKeeper {
  readonly hasPin: boolean;
  checkPin(pin: string): boolean;
  setPin(pin: string): void;
}

export class ParentFlow {
  private current: ParentMode = 'closed';
  private typed = '';
  private first = '';
  private note: TextKey | undefined;
  private factors: readonly [number, number] = [12, 12];

  constructor(
    private readonly pins: PinKeeper,
    private readonly random: () => number = Math.random,
  ) {}

  get mode(): ParentMode {
    return this.current;
  }

  get isOpen(): boolean {
    return this.current !== 'closed';
  }

  /** The digits typed so far. */
  get digits(): string {
    return this.typed;
  }

  /** How many digits the current entry has (4 for a PIN, 3 for the answer). */
  get length(): number {
    return this.current === 'question' ? String(this.answer).length : PARENT_RULES.pinLength;
  }

  /** The sentence about the last step ("Die zwei PINs waren verschieden."), if any; it goes with the next digit. */
  get message(): TextKey | undefined {
    return this.note;
  }

  /** What to do now ("Wähle eine PIN …", "Noch einmal …", "Wie viel ist {a} × {b}?"). */
  get prompt(): TextKey | undefined {
    switch (this.current) {
      case 'newPin':
        return 'parent.newPin';
      case 'repeatPin':
        return 'parent.repeat';
      case 'enterPin':
        return 'parent.enterPin';
      case 'question':
        return 'parent.question';
      case 'closed':
      case 'settings':
        return undefined;
    }
  }

  /** The two numbers of the question. */
  get question(): readonly [number, number] {
    return this.factors;
  }

  private get answer(): number {
    return this.factors[0] * this.factors[1];
  }

  /** Opens the menu: with a PIN it asks for it, the first time the parents choose one. */
  open(): void {
    this.go(this.pins.hasPin ? 'enterPin' : 'newPin');
  }

  close(): void {
    this.go('closed');
  }

  /** One digit on the keypad. A full entry is checked at once. */
  press(digit: number): void {
    if (!Number.isInteger(digit) || digit < 0 || digit > 9 || this.current === 'closed' || this.current === 'settings') {
      return;
    }
    if (this.typed.length >= this.length) {
      return;
    }
    this.typed += String(digit);
    this.note = this.typed.length === 1 ? undefined : this.note;
    if (this.typed.length === this.length) {
      this.submit();
    }
  }

  /** ⌫: the last digit goes. */
  back(): void {
    this.typed = this.typed.slice(0, -1);
  }

  /** "PIN vergessen?" (only while asking for the PIN). */
  forgot(): void {
    if (this.current === 'enterPin') {
      this.newQuestion();
      this.go('question');
    }
  }

  /** "PIN ändern" in the settings. */
  changePin(): void {
    if (this.current === 'settings') {
      this.go('newPin');
    }
  }

  private submit(): void {
    const entry = this.typed;
    switch (this.current) {
      case 'newPin':
        this.first = entry;
        this.go('repeatPin');
        return;
      case 'repeatPin':
        if (entry === this.first) {
          this.pins.setPin(entry);
          this.go('settings');
          this.note = 'parent.pinSaved';
        } else {
          this.go('newPin');
          this.note = 'parent.pinMismatch';
        }
        return;
      case 'enterPin':
        if (this.pins.checkPin(entry)) {
          this.go('settings');
        } else {
          this.typed = '';
          this.note = 'parent.pinWrong';
        }
        return;
      case 'question':
        if (Number(entry) === this.answer) {
          this.go('newPin');
          this.note = 'parent.questionRight';
        } else {
          this.newQuestion();
          this.typed = '';
          this.note = 'parent.questionWrong';
        }
        return;
      case 'closed':
      case 'settings':
        return;
    }
  }

  private newQuestion(): void {
    const { min, max } = PARENT_RULES.question;
    const pick = (): number => min + Math.min(max - min, Math.floor(this.random() * (max - min + 1)));
    this.factors = [pick(), pick()];
  }

  private go(mode: ParentMode): void {
    this.current = mode;
    this.typed = '';
    this.note = undefined;
    if (mode !== 'repeatPin') {
      this.first = mode === 'newPin' ? '' : this.first;
    }
  }
}
