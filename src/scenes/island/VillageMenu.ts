import Phaser from 'phaser';
import { t, type TextKey } from '../../data/texts';
import { deliverTextFile, pickTextFile, saveFileName } from '../../save/saveFile';
import type { GameSession } from '../../save/session';
import { loadFromText, saveToText } from '../../sim/saveData';
import type { SimState } from '../../sim/state';
import type { Rect } from '../../ui/cameraMath';
import { createLabel, setLabelSize } from '../../ui/label';
import { LatestOnly } from '../../ui/latestOnly';
import { MenuFlow, rejectionText } from '../../ui/menuFlow';
import { MENU_CLOSE, menuLayout, menuTitleCenterX, type MenuLayout } from '../../ui/menuLayout';
import { RoundButton } from '../../ui/RoundButton';
import { COLORS } from '../../ui/style';
import { iconImage } from '../art/icon';
import type { ViewSize } from '../../ui/viewport';
import { addGraphics } from '../../ui/FastGraphics';

/** Smallest size of the sentence in the menu (CSS px): longer sentences shrink down to it, then the line is cut by the panel. */
const MIN_TEXT_FONT = 13;

export interface VillageMenuHooks {
  /** A control of the menu was touched (the world ignores taps for a moment). */
  readonly touched: (eventTime: number) => void;
  /** The village from a file replaced the one in the game: the scene has to start again. */
  readonly onReplaced: () => void;
  /** "Für Eltern" (M8): the menu closes and the parents' menu opens. */
  readonly onParent: () => void;
}

export interface MenuSpot {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  /** The chosen one of several (M8: the limit of the parents' menu). */
  readonly active?: boolean;
}

/** A wide button with a picture on the left and a word: "Als Datei sichern". */
class MenuButton extends Phaser.GameObjects.Container {
  private readonly face: Phaser.GameObjects.Graphics;
  private readonly picture: Phaser.GameObjects.Image;
  private readonly caption: Phaser.GameObjects.Text;
  private buttonWidth = 0;
  private buttonHeight = 0;
  private pressed = false;

  constructor(
    scene: Phaser.Scene,
    icon: string,
    text: string,
    onTap: (eventTime: number) => void,
  ) {
    super(scene, 0, 0);
    this.face = addGraphics(scene);
    this.picture = iconImage(scene, icon);
    this.caption = createLabel(scene, text, 22);
    this.add([this.face, this.picture, this.caption]);
    this.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => {
      this.pressed = true;
      this.setScale(0.97);
    });
    this.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () => {
      this.pressed = false;
      this.setScale(1);
    });
    this.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, (pointer: Phaser.Input.Pointer) => {
      this.setScale(1);
      if (this.pressed && !pointer.wasCanceled) {
        this.pressed = false;
        onTap(pointer.event?.timeStamp ?? this.scene.time.now);
      }
      this.pressed = false;
    });
    scene.add.existing(this);
  }

  /** Sizes the button to `rect` (CSS px) and puts it there. */
  place(rect: Rect): this {
    this.buttonWidth = rect.width;
    this.buttonHeight = rect.height;
    this.setPosition(rect.x + rect.width / 2, rect.y + rect.height / 2);
    this.setSize(rect.width, rect.height);
    const hitArea = new Phaser.Geom.Rectangle(0, 0, rect.width, rect.height);
    if (this.input) {
      this.input.hitArea = hitArea;
    } else {
      this.setInteractive({ hitArea, hitAreaCallback: (area: Phaser.Geom.Rectangle, x: number, y: number) => area.contains(x, y), useHandCursor: true });
    }
    const icon = Math.min(rect.height * 0.7, 52);
    this.picture.setPosition(-rect.width / 2 + 16 + icon / 2, 0);
    this.picture.setDisplaySize(icon, icon);
    const room = rect.width - 16 - icon - 16 - 14;
    setLabelSize(this.caption, Math.min(24, rect.height * 0.34), room);
    this.caption.setPosition(-rect.width / 2 + 16 + icon + 10 + room / 2, 0);
    this.draw();
    return this;
  }

  private draw(): void {
    const w = this.buttonWidth;
    const h = this.buttonHeight;
    const radius = Math.min(w, h) * 0.2;
    this.face.clear();
    this.face.fillStyle(COLORS.toolFaceShade).fillRoundedRect(-w / 2, -h / 2 + 4, w, h, radius);
    this.face.fillStyle(COLORS.buttonRim).fillRoundedRect(-w / 2, -h / 2, w, h, radius);
    this.face.fillStyle(COLORS.toolFace).fillRoundedRect(-w / 2 + 3, -h / 2 + 3, w - 6, h - 6, radius * 0.8);
  }
}

/**
 * The menu behind the gear: a panel over the island with the title "Dein
 * Dorf", the sentence about the last thing that happened, and two big
 * buttons – "Als Datei sichern" and "Aus Datei laden". A chosen file never
 * replaces the village at once: the panel asks first (✓ replaces, ✕ keeps
 * the village). The steps are in {@link MenuFlow}; this class draws them, does
 * the file work (download, chooser) and hands a confirmed village to the
 * session. Lives in the UI layer, CSS pixels.
 */
export class VillageMenu {
  private readonly flow = new MenuFlow<SimState>();
  private readonly veil: Phaser.GameObjects.Zone;
  private readonly dim: Phaser.GameObjects.Graphics;
  private readonly panel: Phaser.GameObjects.Graphics;
  private readonly title: Phaser.GameObjects.Text;
  private readonly sentence: Phaser.GameObjects.Text;
  private readonly saveButton: MenuButton;
  private readonly loadButton: MenuButton;
  private readonly parentButton: MenuButton;
  private readonly closeButton: RoundButton;
  private readonly confirmButton: RoundButton;
  private readonly cancelButton: RoundButton;
  private size: ViewSize = { width: 1, height: 1 };
  private layoutData: MenuLayout | undefined;
  /** Only the newest file chooser counts: one that never answers (old tablets) does not block the button. */
  private readonly picks = new LatestOnly();

  constructor(
    scene: Phaser.Scene,
    uiLayer: Phaser.GameObjects.Layer,
    private readonly session: GameSession,
    private readonly hooks: VillageMenuHooks,
  ) {
    // The veil catches every press (the island below must not move or get tapped) and darkens the screen.
    this.veil = scene.add.zone(0, 0, 1, 1).setOrigin(0, 0).setInteractive();
    this.dim = addGraphics(scene);
    this.panel = addGraphics(scene);
    this.title = createLabel(scene, t('menu.title'), 30);
    this.sentence = createLabel(scene, '', 19);
    this.saveButton = new MenuButton(scene, 'file-save', t('menu.save'), (time) => {
      hooks.touched(time);
      this.saveFile();
    });
    this.loadButton = new MenuButton(scene, 'file-load', t('menu.load'), (time) => {
      hooks.touched(time);
      this.chooseFile();
    });
    this.parentButton = new MenuButton(scene, 'lock', t('menu.parent'), (time) => {
      hooks.touched(time);
      this.close();
      hooks.onParent();
    });
    this.closeButton = new RoundButton(scene, 0, 0, {
      radius: MENU_CLOSE / 2,
      icon: 'cross',
      variant: 'cancel',
      onTap: (time) => {
        hooks.touched(time);
        this.close();
      },
    });
    this.confirmButton = new RoundButton(scene, 0, 0, {
      radius: 40,
      icon: 'check',
      variant: 'confirm',
      onTap: (time) => {
        hooks.touched(time);
        this.confirmReplace();
      },
    });
    this.cancelButton = new RoundButton(scene, 0, 0, {
      radius: 36,
      icon: 'cross',
      variant: 'cancel',
      onTap: (time) => {
        hooks.touched(time);
        this.flow.cancel();
        this.refresh();
      },
    });
    uiLayer.add([this.veil, this.dim, this.panel, this.title, this.sentence, this.saveButton, this.loadButton, this.parentButton, this.closeButton, this.confirmButton, this.cancelButton]);
    this.refresh();
  }

  get isOpen(): boolean {
    return this.flow.isOpen;
  }

  /** The whole screen while the menu is open (a press there is not for the camera), else an empty rectangle. */
  get rect(): Rect {
    return this.flow.isOpen ? { x: 0, y: 0, width: this.size.width, height: this.size.height } : { x: 0, y: 0, width: 0, height: 0 };
  }

  open(): void {
    this.picks.cancel();
    this.flow.open();
    this.refresh();
  }

  close(): void {
    this.picks.cancel();
    this.flow.close();
    this.refresh();
  }

  /** Call whenever the visible area changes. */
  layout(size: ViewSize): void {
    this.size = size;
    this.refresh();
  }

  /** For the page marker: `closed`, `menu`, `menu:<sentence key>` or `confirm`. */
  get shownState(): string {
    const { mode, message } = this.flow;
    return mode === 'menu' && message !== undefined ? `menu:${message}` : mode;
  }

  /** Where the controls are (CSS px), for the test marker. */
  get spots(): Record<string, MenuSpot> {
    const layout = this.layoutData;
    if (!layout) {
      return {};
    }
    const center = (rect: Rect): MenuSpot => ({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, w: rect.width, h: rect.height });
    const spots: Record<string, MenuSpot> = { 'menu-panel': center(layout.panel) };
    if (layout.close) {
      spots['menu-close'] = center(layout.close);
    }
    if (layout.save && layout.load) {
      spots['menu-save'] = center(layout.save);
      spots['menu-load'] = center(layout.load);
    }
    if (layout.parent) {
      spots['menu-parent'] = center(layout.parent);
    }
    if (layout.confirm && layout.cancel) {
      spots['menu-confirm'] = center(layout.confirm);
      spots['menu-cancel'] = center(layout.cancel);
    }
    return spots;
  }

  /** The sentence shown now, for tests. */
  get shownSentence(): string {
    return this.layoutData ? this.sentence.text : '';
  }

  private saveFile(): void {
    // Called from the tap itself: the share sheet of an iPad only opens then.
    const delivering = deliverTextFile(saveFileName(), saveToText(this.session.simulation.state));
    void delivering.then((result) => {
      if (!this.flow.isOpen || result === 'cancelled') {
        return;
      }
      this.flow.say(result === 'failed' ? 'menu.fileFailed' : 'menu.fileSaved');
      this.refresh();
    });
  }

  private chooseFile(): void {
    // A new tap replaces an older chooser, even if that one never answered.
    const token = this.picks.start();
    void pickTextFile().then((picked) => {
      // The player may have closed the menu or tapped again meanwhile: then the answer is of no use.
      if (!this.picks.isCurrent(token) || !this.flow.isOpen) {
        return;
      }
      switch (picked.kind) {
        case 'cancelled':
          return;
        case 'tooBig':
          this.flow.say('menu.errorTooBig');
          break;
        case 'unreadable':
          this.flow.say('menu.errorRead');
          break;
        case 'text': {
          const loaded = loadFromText(picked.text);
          if (loaded.ok) {
            this.flow.ask(loaded.state);
          } else {
            this.flow.say(rejectionText(loaded.reason));
          }
          break;
        }
      }
      this.refresh();
    });
  }

  private confirmReplace(): void {
    const village = this.flow.confirm();
    this.refresh();
    if (village) {
      this.session.replaceVillage(village);
      this.hooks.onReplaced();
    }
  }

  /** The sentence for the current step. */
  private sentenceKey(): TextKey {
    if (this.flow.mode === 'confirm') {
      return 'menu.replace';
    }
    return this.flow.message ?? (this.session.saves ? 'menu.infoAuto' : 'menu.infoManual');
  }

  /** Shows what the flow says, where {@link menuLayout} puts it; hides everything while closed. */
  private refresh(): void {
    const mode = this.flow.mode;
    const visible = mode !== 'closed';
    this.layoutData = visible ? menuLayout(this.size.width, this.size.height, mode) : undefined;
    for (const object of [this.veil, this.dim, this.panel, this.title, this.sentence]) {
      object.setVisible(visible);
    }
    const layout = this.layoutData;
    this.closeButton.setVisible(layout?.close !== undefined);
    this.saveButton.setVisible(layout?.save !== undefined);
    this.loadButton.setVisible(layout?.load !== undefined);
    this.parentButton.setVisible(layout?.parent !== undefined);
    this.confirmButton.setVisible(layout?.confirm !== undefined);
    this.cancelButton.setVisible(layout?.cancel !== undefined);
    if (!layout) {
      return;
    }
    const { width, height } = this.size;
    this.veil.setSize(width, height);
    if (this.veil.input) {
      this.veil.input.hitArea = new Phaser.Geom.Rectangle(0, 0, width, height);
    }
    this.dim.clear().fillStyle(COLORS.black, 0.5).fillRect(0, 0, width, height);
    const { panel } = layout;
    this.panel.clear();
    this.panel.fillStyle(COLORS.panel, 0.97).fillRoundedRect(panel.x, panel.y, panel.width, panel.height, 22);
    this.panel.lineStyle(3, COLORS.toolActiveRim, 0.75).strokeRoundedRect(panel.x, panel.y, panel.width, panel.height, 22);

    setLabelSize(this.title, layout.titleFont, layout.title.width);
    this.title.setPosition(menuTitleCenterX(layout, this.title.width), layout.title.y + layout.title.height / 2);

    // The sentence: wrapped to the room, smaller letters until it fits the height.
    const text = layout.text;
    let font = layout.textFont;
    this.sentence.setWordWrapWidth(text.width).setText(t(this.sentenceKey()));
    setLabelSize(this.sentence, font, text.width);
    while (this.sentence.height > text.height && font > MIN_TEXT_FONT) {
      font -= 1;
      setLabelSize(this.sentence, font, text.width);
    }
    this.sentence.setPosition(text.x + text.width / 2, text.y + text.height / 2);

    const centerOf = (rect: Rect): { x: number; y: number } => ({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });
    if (layout.close) {
      this.closeButton.setPosition(centerOf(layout.close).x, centerOf(layout.close).y);
    }
    if (layout.save && layout.load) {
      this.saveButton.place(layout.save);
      this.loadButton.place(layout.load);
    }
    if (layout.parent) {
      this.parentButton.place(layout.parent);
    }
    if (layout.confirm && layout.cancel) {
      this.confirmButton.setRadius(layout.confirm.width / 2).setPosition(centerOf(layout.confirm).x, centerOf(layout.confirm).y);
      this.cancelButton.setRadius(layout.cancel.width / 2).setPosition(centerOf(layout.cancel).x, centerOf(layout.cancel).y);
    }
  }
}
