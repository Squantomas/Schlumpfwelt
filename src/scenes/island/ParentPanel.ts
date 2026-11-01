import Phaser from 'phaser';
import { PARENT_RULES } from '../../data/parent';
import { t, type TextKey, type TextParams } from '../../data/texts';
import type { ParentSession } from '../../parent/parentSession';
import type { Rect } from '../../ui/cameraMath';
import { addGraphics } from '../../ui/FastGraphics';
import { createLabel, setLabelSize } from '../../ui/label';
import { ParentFlow } from '../../ui/parentFlow';
import { PAD_KEYS, PARENT_CLOSE, parentSettingsLayout, pinPadLayout, type PadKey, type ParentSettingsLayout, type PinPadLayout } from '../../ui/parentLayout';
import { RoundButton } from '../../ui/RoundButton';
import { COLORS } from '../../ui/style';
import type { ViewSize } from '../../ui/viewport';
import { TextButton } from './TextButton';
import type { MenuSpot } from './VillageMenu';

/** Smallest size of the sentence (CSS px). */
const MIN_TEXT_FONT = 12;

/** A sentence of the panel, and maybe a second one after it. */
interface Sentence {
  readonly key: TextKey;
  readonly params?: TextParams;
  readonly then?: Sentence;
}

function sentenceText(sentence: Sentence): string {
  const text = t(sentence.key, sentence.params);
  return sentence.then ? `${text} ${sentenceText(sentence.then)}` : text;
}

export interface ParentPanelHooks {
  /** A control was touched (the world ignores taps for a moment). */
  readonly touched: (eventTime: number) => void;
  /** "Tutorial noch einmal". */
  readonly onTutorialAgain: () => void;
  /** The panel was closed (the scene looks again whether it is night). */
  readonly onClose: () => void;
}

/**
 * The parents' menu (M8), over everything but the "other window" layer: the big keypad for the PIN (and for the
 * question of "PIN vergessen?"), then the settings – the daily limit, "Heute noch 10 Minuten mehr", "PIN ändern",
 * "Tutorial noch einmal". The steps are in {@link ParentFlow}, the PIN, limit and account in the
 * {@link ParentSession}; this class draws them (layouts in `parentLayout.ts`). A veil swallows every tap; while the
 * panel is open, no play time is counted.
 */
export class ParentPanel {
  private readonly flow: ParentFlow;
  private readonly veil: Phaser.GameObjects.Zone;
  private readonly dim: Phaser.GameObjects.Graphics;
  private readonly panel: Phaser.GameObjects.Graphics;
  private readonly dots: Phaser.GameObjects.Graphics;
  private readonly title: Phaser.GameObjects.Text;
  private readonly sentence: Phaser.GameObjects.Text;
  private readonly label: Phaser.GameObjects.Text;
  private readonly closeButton: RoundButton;
  private readonly keys = new Map<PadKey, TextButton>();
  private readonly forgotButton: TextButton;
  private readonly choices: TextButton[];
  private readonly extraButton: TextButton;
  private readonly pinButton: TextButton;
  private readonly tutorialButton: TextButton;
  private size: ViewSize = { width: 1, height: 1 };
  private pad: PinPadLayout | undefined;
  private settings: ParentSettingsLayout | undefined;
  /** A sentence about the last action in the settings ("10 Minuten mehr"), until the next one. */
  private note: TextKey | undefined;
  /** "Nothing is stored in this browser" – said once per visit, the first time the menu opens. */
  /** The note "nothing is kept" (once per visit, until the parents start typing): why. */
  private memoryNote: 'noStore' | 'newer' | undefined;

  constructor(
    scene: Phaser.Scene,
    uiLayer: Phaser.GameObjects.Layer,
    private readonly session: ParentSession,
    private readonly hooks: ParentPanelHooks,
  ) {
    this.flow = new ParentFlow({
      get hasPin() {
        return session.hasPin;
      },
      get pinGuarded() {
        return session.pinGuarded;
      },
      checkPin: (pin) => session.checkPin(pin),
      setPin: (pin) => {
        session.setPin(pin);
      },
    });
    this.veil = scene.add.zone(0, 0, 1, 1).setOrigin(0, 0).setInteractive();
    this.dim = addGraphics(scene);
    this.panel = addGraphics(scene);
    this.dots = addGraphics(scene);
    this.title = createLabel(scene, t('parent.title'), 28);
    this.sentence = createLabel(scene, '', 18);
    this.label = createLabel(scene, t('parent.limit'), 18);
    const tap = (action: () => void) => (time: number) => {
      hooks.touched(time);
      action();
      this.refresh();
    };
    this.closeButton = new RoundButton(scene, 0, 0, { radius: PARENT_CLOSE / 2, icon: 'cross', variant: 'cancel', onTap: tap(() => this.close()) });
    for (const key of PAD_KEYS) {
      if (key === 'none') {
        continue;
      }
      const text = key === 'back' ? t('parent.backKey') : key;
      this.keys.set(
        key,
        new TextButton(
          scene,
          text,
          tap(() => {
            this.note = undefined;
            if (key === 'back') {
              this.flow.back();
            } else {
              this.flow.press(Number(key));
            }
          }),
        ),
      );
    }
    this.forgotButton = new TextButton(scene, t('parent.forgot'), tap(() => this.flow.forgot()));
    this.choices = PARENT_RULES.limitChoices.map(
      (minutes) =>
        new TextButton(
          scene,
          minutes === 0 ? t('parent.limitOff') : t('parent.limitMinutes', { minutes }),
          tap(() => {
            this.note = undefined;
            session.setLimit(minutes);
          }),
        ),
    );
    this.extraButton = new TextButton(
      scene,
      t('parent.extra', { minutes: PARENT_RULES.extraMinutes }),
      tap(() => {
        session.addExtra();
        this.note = 'parent.extraGiven';
      }),
    );
    this.pinButton = new TextButton(
      scene,
      t('parent.changePin'),
      tap(() => {
        this.note = undefined;
        this.flow.changePin();
      }),
    );
    this.tutorialButton = new TextButton(
      scene,
      t('parent.tutorial'),
      tap(() => {
        // The guided start begins at once: the panel closes, so the child sees the hand (Spieltest, Korrekturrunde 1).
        hooks.onTutorialAgain();
        this.close();
      }),
    );
    uiLayer.add([
      this.veil,
      this.dim,
      this.panel,
      this.title,
      this.sentence,
      this.label,
      this.dots,
      this.closeButton,
      ...this.keys.values(),
      this.forgotButton,
      ...this.choices,
      this.extraButton,
      this.pinButton,
      this.tutorialButton,
    ]);
    this.refresh();
  }

  get isOpen(): boolean {
    return this.flow.isOpen;
  }

  private get extraShown(): boolean {
    return this.session.clock.limitMinutes > 0;
  }

  /** For the page marker (`<html data-parent>`): `closed`, the step, and the sentence shown. */
  get shownState(): string {
    const message = this.sentenceKey();
    return this.flow.mode === 'closed' ? 'closed' : `${this.flow.mode}${message ? `:${message.key}` : ''}`;
  }

  open(): void {
    this.note = undefined;
    this.flow.open();
    this.memoryNote = this.session.takeMemoryNote();
    this.refresh();
  }

  close(): void {
    const wasOpen = this.flow.isOpen;
    this.flow.close();
    this.note = undefined;
    this.refresh();
    if (wasOpen) {
      this.hooks.onClose();
    }
  }

  layout(size: ViewSize): void {
    this.size = size;
    this.refresh();
  }

  /** The keys, choices and buttons (CSS px), for the test marker. */
  get spots(): Record<string, MenuSpot> {
    const center = (rect: Rect): MenuSpot => ({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, w: rect.width, h: rect.height });
    const spots: Record<string, MenuSpot> = {};
    if (this.pad) {
      spots['parent-panel'] = center(this.pad.panel);
      spots['parent-close'] = center(this.pad.close);
      for (const key of this.keys.keys()) {
        spots[`pin-${key}`] = center(this.pad.keys[key]);
      }
      if (this.flow.mode === 'enterPin') {
        spots['pin-forgot'] = center(this.pad.forgot);
      }
    }
    if (this.settings) {
      const layout = this.settings;
      spots['parent-panel'] = center(layout.panel);
      spots['parent-close'] = center(layout.close);
      PARENT_RULES.limitChoices.forEach((minutes, index) => {
        const rect = layout.choices[index];
        if (rect) {
          spots[`limit-${String(minutes)}`] = { ...center(rect), ...(this.session.clock.limitMinutes === minutes ? { active: true } : {}) };
        }
      });
      if (this.extraShown) {
        spots['parent-extra'] = center(layout.extra);
      }
      spots['parent-pin'] = center(layout.pin);
      spots['parent-tutorial'] = center(layout.tutorial);
    }
    return spots;
  }

  /** The sentence shown now, for tests. */
  get shownSentence(): string {
    return this.flow.isOpen ? this.sentence.text : '';
  }

  /**
   * The sentence of the panel: a main part (its key is published in `data-parent`) and sometimes a second one after it
   * (Korrekturrunde 1): the note "nothing is kept" does not hide what to do ("Wählen Sie eine PIN …"), and after
   * "+10 Minuten" the time of today stays to be seen.
   */
  private sentenceKey(): Sentence | undefined {
    if (this.flow.mode === 'closed') {
      return undefined;
    }
    const main = this.mainSentence();
    if (this.memoryNote) {
      // Both sentences must fit on a phone: the short request for a PIN after the note.
      const then = main?.key === 'parent.firstPin' ? { key: 'parent.newPin' as const } : main;
      return { key: this.memoryNote === 'newer' ? 'parent.newerSettings' : 'parent.memoryOnly', ...(then ? { then } : {}) };
    }
    return main;
  }

  private mainSentence(): Sentence | undefined {
    const message = this.flow.message;
    if (this.flow.mode === 'settings') {
      const account = this.session.clock.account;
      const used = Math.floor(account.usedMs / 60_000);
      const allowed = this.session.clock.allowedMs;
      const today: Sentence = allowed === undefined ? { key: 'parent.usedOff', params: { used } } : { key: 'parent.used', params: { used, allowed: Math.round(allowed / 60_000) } };
      const note = this.note ?? message;
      if (note === 'parent.extraGiven') {
        return { key: note, params: { minutes: PARENT_RULES.extraMinutes }, then: today };
      }
      return note ? { key: note } : today;
    }
    // Every sentence of the question names its two numbers.
    const [a, b] = this.flow.question;
    const params = this.flow.mode === 'question' ? { a, b } : undefined;
    const key = message ?? this.flow.prompt;
    return key ? { key, ...(params ? { params } : {}) } : undefined;
  }

  private refresh(): void {
    // The note about the memory store stays until the parents start typing.
    if (this.memoryNote && this.flow.digits.length > 0) {
      this.memoryNote = undefined;
    }
    const mode = this.flow.mode;
    const open = mode !== 'closed';
    const { width, height } = this.size;
    this.pad = open && mode !== 'settings' ? pinPadLayout(width, height) : undefined;
    this.settings = mode === 'settings' ? parentSettingsLayout(width, height, PARENT_RULES.limitChoices.length) : undefined;
    for (const object of [this.veil, this.dim, this.panel, this.title, this.sentence, this.closeButton]) {
      object.setVisible(open);
    }
    this.dots.setVisible(this.pad !== undefined);
    for (const key of this.keys.values()) {
      key.setVisible(this.pad !== undefined);
    }
    this.forgotButton.setVisible(this.pad !== undefined && mode === 'enterPin');
    this.label.setVisible(this.settings !== undefined);
    for (const button of [...this.choices, this.extraButton, this.pinButton, this.tutorialButton]) {
      button.setVisible(this.settings !== undefined);
    }
    // "+10 Minuten" only with a limit (without one there is nothing to add).
    this.extraButton.setVisible(this.settings !== undefined && this.extraShown);
    const layout = this.pad ?? this.settings;
    if (!layout) {
      return;
    }
    this.veil.setSize(width, height);
    if (this.veil.input) {
      this.veil.input.hitArea = new Phaser.Geom.Rectangle(0, 0, width, height);
    }
    this.dim.clear().fillStyle(COLORS.black, 0.6).fillRect(0, 0, width, height);
    const { panel } = layout;
    this.panel.clear();
    this.panel.fillStyle(COLORS.panel, 0.98).fillRoundedRect(panel.x, panel.y, panel.width, panel.height, 22);
    this.panel.lineStyle(3, COLORS.toolActiveRim, 0.75).strokeRoundedRect(panel.x, panel.y, panel.width, panel.height, 22);
    setLabelSize(this.title, layout.titleFont, layout.title.width);
    this.title.setPosition(layout.title.x + layout.title.width / 2, layout.title.y + layout.title.height / 2);
    this.closeButton.setRadius(layout.close.width / 2).setPosition(layout.close.x + layout.close.width / 2, layout.close.y + layout.close.height / 2);

    const said = this.sentenceKey();
    const text = layout.text;
    let font = layout.textFont;
    this.sentence.setWordWrapWidth(text.width).setText(said ? sentenceText(said) : '');
    setLabelSize(this.sentence, font, text.width);
    while (this.sentence.height > text.height && font > MIN_TEXT_FONT) {
      font -= 1;
      setLabelSize(this.sentence, font, text.width);
    }
    this.sentence.setPosition(text.x + text.width / 2, text.y + text.height / 2);

    if (this.pad) {
      const pad = this.pad;
      for (const [key, button] of this.keys) {
        button.place(pad.keys[key], key === 'back' ? pad.keyFont * 0.8 : pad.keyFont);
      }
      this.forgotButton.place(pad.forgot, pad.low ? 15 : 17);
      this.drawDots(pad.dots);
    }
    if (this.settings) {
      const settings = this.settings;
      setLabelSize(this.label, settings.textFont + 1, settings.label.width);
      this.label.setPosition(settings.label.x + settings.label.width / 2, settings.label.y + settings.label.height / 2);
      PARENT_RULES.limitChoices.forEach((minutes, index) => {
        const rect = settings.choices[index];
        const button = this.choices[index];
        if (rect && button) {
          button.place(rect, settings.buttonFont).setHighlighted(this.session.clock.limitMinutes === minutes);
        }
      });
      this.extraButton.place(settings.extra, settings.buttonFont);
      this.pinButton.place(settings.pin, settings.buttonFont);
      this.tutorialButton.place(settings.tutorial, settings.buttonFont);
    }
  }

  /** One circle per digit, filled for the digits typed so far (the digits themselves are never shown). */
  private drawDots(rect: Rect): void {
    const count = this.flow.length;
    const radius = Math.min(13, rect.height / 2 - 4);
    const gap = radius * 1.4;
    const total = count * 2 * radius + (count - 1) * gap;
    const g = this.dots.clear();
    for (let i = 0; i < count; i += 1) {
      const x = rect.x + (rect.width - total) / 2 + radius + i * (2 * radius + gap);
      const y = rect.y + rect.height / 2;
      g.fillStyle(COLORS.white, i < this.flow.digits.length ? 1 : 0.25).fillCircle(x, y, radius);
      g.lineStyle(3, COLORS.white, 1).strokeCircle(x, y, radius);
    }
  }
}
