import type Phaser from 'phaser';
import { buildingType, typesOf, type BuildingType } from '../../data/buildings';
import { ITEM_IDS } from '../../data/goods';
import { t, type TextKey, type TextParams } from '../../data/texts';
import { costOf, missingFor } from '../../sim/economy';
import type { Rect } from '../../ui/cameraMath';
import { TOOLS, TOOL_CATEGORIES, type BuildTool, type BuildToolState, type ToolId } from '../../ui/buildTool';
import { CHIP_H, CHIP_W, EXIT_RADIUS, HINT_MAX_HEIGHT_NARROW, HINT_MIN_HEIGHT, hintBarGeometry, layoutBuildUi, type BuildLayout } from '../../ui/buildLayout';
import { CANCEL_DIAMETER, CONFIRM_DIAMETER } from '../../ui/confirmLayout';
import { createLabel, setLabelSize } from '../../ui/label';
import { cardStatus, productionInfo } from '../../ui/productionInfo';
import { RoundButton } from '../../ui/RoundButton';
import { SquareButton } from '../../ui/SquareButton';
import { worldTapIgnored } from '../../ui/tapPause';
import { COLORS, clamp } from '../../ui/style';
import { drawToolIcon } from '../../ui/toolIcons';
import { PICKER_ARROW, PICKER_GAP, PICKER_PAD } from '../../ui/pickerLayout';
import { TOOLBAR_GAP, TOOLBAR_PAD } from '../../ui/toolbarLayout';
import type { ViewSize } from '../../ui/viewport';
import { buildingTextureKey } from './buildingTextures';
import { CostRow } from './CostRow';
import { registerGoodTextures } from './goodTextures';
import { InfoCard } from './InfoCard';
import { StockBar } from './StockBar';

/** How long a short explanation ("Hier geht das nicht.") stays. */
const NOTICE_MS = 2800;

export interface UiSpot {
  readonly x: number;
  readonly y: number;
  readonly enabled: boolean;
  /** The thing it stands for can not be paid for right now (the button is greyed but still takes taps). */
  readonly dim?: boolean;
  /** Size of the area it covers (CSS px) – only given for the store bar and the info card. */
  readonly w?: number;
  readonly h?: number;
}

const EMPTY: Rect = { x: 0, y: 0, width: 0, height: 0 };

/**
 * The building controls on top of the island: toolbar at the bottom (one big
 * button per tool, wraps on narrow screens), the variant picker above it
 * (it folds into a small chip once a place was tapped), a hint bar at the top
 * with a short sentence and a big ✕, and the ✓ / ✕ buttons at a fixed place
 * bottom right. Everything lives in the UI layer, in CSS pixels. It shows
 * what {@link BuildTool} says and passes taps on; it never touches the
 * simulation itself. M3 adds the store bar at the top left (coins and goods),
 * the cost under each picker card (cards that can not be paid for are greyed,
 * but stay choosable) and the info card of a production building.
 */
export class BuildUI {
  private readonly toolbarPanel: Phaser.GameObjects.Graphics;
  private readonly pickerPanel: Phaser.GameObjects.Graphics;
  private readonly hintPanel: Phaser.GameObjects.Graphics;
  private readonly hintLabel: Phaser.GameObjects.Text;
  private readonly exitButton: RoundButton;
  private readonly prevButton: RoundButton;
  private readonly nextButton: RoundButton;
  private readonly confirmButton: RoundButton;
  private readonly cancelButton: RoundButton;
  private readonly toolButtons = new Map<Exclude<ToolId, 'view'>, SquareButton>();
  private readonly variantButtons = new Map<string, SquareButton>();
  private readonly chipButtons = new Map<string, SquareButton>();
  private readonly costRows = new Map<string, CostRow>();
  private readonly stock: StockBar;
  private readonly card: InfoCard;
  private view: ViewSize = { width: 1, height: 1 };
  private seenVersion = -1;
  private notice: { text: string; until: number } | undefined;
  private hintRect: Rect = EMPTY;
  private toolbarRect: Rect = EMPTY;
  private pickerRect: Rect = EMPTY;
  private chipRect: Rect = EMPTY;
  private pickerOpen = true;
  private pickerPage = 0;
  private hintAtBottom = false;
  private layoutData: BuildLayout | undefined;
  private lastTool: ToolId = 'view';
  private hadPreview = false;
  private lastUiTap = Number.NEGATIVE_INFINITY;
  /** The text of the hint bar as last set (the hint is only worked out when something changed). */
  private currentHint = '';
  private cardTick = -1;
  /** The status sentence shown as a hint when the info card does not fit on a very low screen. */
  private cardFallback: string | undefined;
  private zoomSpots: Record<string, UiSpot> = {};
  private spotsJson = '{}';
  private spotsDirty = true;

  constructor(
    private readonly scene: Phaser.Scene,
    uiLayer: Phaser.GameObjects.Layer,
    private readonly tool: BuildTool,
    private readonly getState: () => BuildToolState,
    private readonly onChange: () => void,
  ) {
    registerGoodTextures(scene);
    this.stock = new StockBar(scene, uiLayer);
    this.card = new InfoCard(scene, uiLayer, (time) => {
      this.touched(time);
      this.tool.closeInfo();
      this.refresh();
    });
    this.stock.update(this.getState().inventory, false);
    this.toolbarPanel = scene.add.graphics();
    this.pickerPanel = scene.add.graphics();
    this.hintPanel = scene.add.graphics();
    uiLayer.add([this.toolbarPanel, this.pickerPanel, this.hintPanel]);

    this.hintLabel = createLabel(scene, '', 24);
    this.exitButton = new RoundButton(scene, 0, 0, {
      radius: EXIT_RADIUS,
      // Blue arrow back: "done" – not the red ✕ of the preview (that one throws the preview away).
      icon: 'back',
      variant: 'done',
      onTap: (time) => {
        this.touched(time);
        this.tool.exitTool();
        this.refresh();
      },
    });
    const pager = (icon: 'left' | 'right', step: number): RoundButton =>
      new RoundButton(scene, 0, 0, {
        radius: PICKER_ARROW / 2,
        icon,
        onTap: (time) => {
          this.touched(time);
          this.pickerPage += step;
          this.refresh();
        },
      });
    this.prevButton = pager('left', -1);
    this.nextButton = pager('right', 1);

    for (const id of TOOLS) {
      const button = new SquareButton(scene, {
        label: t(`tool.${id}`),
        content: scene.add.graphics(),
        fitContent: (content, width, height) => {
          drawToolIcon(content as Phaser.GameObjects.Graphics, id, Math.min(width, height));
        },
        onTap: (time) => {
          this.touched(time);
          const again = this.tool.tool === id;
          this.tool.selectTool(id);
          // Tapping the tool that is on opens its picker again; it never switches the tool off.
          if (again && this.tool.variantCategory) {
            this.pickerOpen = true;
          }
          this.refresh();
        },
      });
      this.toolButtons.set(id, button);
    }

    const categories = new Set(Object.values(TOOL_CATEGORIES));
    const types = [...categories].flatMap((category) => typesOf(category));
    for (const type of types) {
      this.variantButtons.set(type.id, this.variantButton(type, 'cell'));
      this.chipButtons.set(type.id, this.variantButton(type, 'chip'));
    }

    this.confirmButton = new RoundButton(scene, 0, 0, {
      radius: CONFIRM_DIAMETER / 2,
      icon: 'check',
      variant: 'confirm',
      onTap: (time) => {
        this.touched(time);
        const notice = this.tool.confirm();
        if (notice) {
          this.showNotice(notice, this.tool.hintParams);
        } else {
          // Built: an old note ("Hier geht das nicht.") must not stay on.
          this.notice = undefined;
        }
        this.refresh();
      },
    });
    this.cancelButton = new RoundButton(scene, 0, 0, {
      radius: CANCEL_DIAMETER / 2,
      icon: 'cross',
      variant: 'cancel',
      onTap: (time) => {
        this.touched(time);
        this.tool.cancel();
        this.refresh();
      },
    });
    for (const object of [this.confirmButton, this.cancelButton, this.exitButton, this.hintLabel, this.prevButton, this.nextButton]) {
      object.setVisible(false);
    }

    uiLayer.add([
      ...this.toolButtons.values(),
      ...this.variantButtons.values(),
      ...this.chipButtons.values(),
      this.hintLabel,
      this.exitButton,
      this.prevButton,
      this.nextButton,
      this.confirmButton,
      this.cancelButton,
    ]);
  }

  /** A picker cell (`cell`) or the small chip (`chip`) for one type. */
  private variantButton(type: BuildingType, kind: 'cell' | 'chip'): SquareButton {
    // A picker cell shows the cost under the name; the chip is too small for it.
    const footer = kind === 'cell' ? new CostRow(this.scene) : undefined;
    if (footer) {
      this.costRows.set(type.id, footer);
    }
    const button = new SquareButton(this.scene, {
      label: kind === 'cell' ? t(type.nameKey) : t(type.nameKey).replace(' ', '\n'),
      ...(footer ? { footer } : {}),
      content: this.scene.add.image(0, 0, buildingTextureKey(type.id)),
      fitContent: (content, width, height) => {
        const picture = content as Phaser.GameObjects.Image;
        picture.setScale(Math.min(width / picture.width, height / picture.height));
      },
      onTap: (time) => {
        this.touched(time);
        if (kind === 'chip') {
          // On a low screen the open picker has no room next to a preview: the preview is dropped first.
          if (this.tool.hasPreview && this.layoutData?.pickerFitsWithPreview === false) {
            this.tool.cancel();
          }
          this.pickerOpen = true;
        } else {
          this.tool.selectVariant(type.id);
          // Once a variant is chosen the picker folds into the chip and leaves the island free.
          this.pickerOpen = false;
        }
        this.refresh();
      },
    });
    button.setVisible(false);
    return button;
  }

  /** A control was tapped: for a moment the world ignores taps (double taps on ✓ / ✕ must not fall through). */
  private touched(eventTime: number): void {
    this.lastUiTap = eventTime;
  }

  /**
   * Right after a tap on a control: taps on the world do nothing. Compared by
   * the times of the browser events, so slow frames (which handle both taps
   * together) do not hide a double tap.
   */
  worldTapsPaused(eventTime: number): boolean {
    return worldTapIgnored(eventTime, this.lastUiTap);
  }

  /** Short explanation for the child ("Dieses Haus braucht einen Weg."). */
  showNotice(key: TextKey, params?: TextParams): void {
    this.notice = { text: t(key, params), until: this.scene.time.now + NOTICE_MS };
    this.seenVersion = -1;
  }

  /** Where the store bar ends at the top (CSS px): the greeting sits below it. */
  get stockBottom(): number {
    return this.stock.rect.y + this.stock.rect.height;
  }

  /** Is the info card of a production building open? */
  get cardOpen(): boolean {
    return this.card.isOpen;
  }

  /** Where the hint bar ends at the top (0 if there is none up there): things in the world should not hide below it. */
  get topInset(): number {
    return this.hintRect.height > 0 && !this.hintAtBottom ? this.hintRect.y + this.hintRect.height + 6 : 0;
  }

  /** Is this screen point (CSS px) on a panel? Then a press there is not for the camera. */
  coversPoint(x: number, y: number): boolean {
    return [this.toolbarRect, this.pickerRect, this.hintRect, this.chipRect, this.stock.rect, this.card.rect].some(
      (rect) => rect.width > 0 && x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height,
    );
  }

  /** Call whenever the visible area changes (start, resize, rotation). `zoomSpots` are published with the others. */
  layout(size: ViewSize, zoomSpots: Record<string, UiSpot>): void {
    this.view = size;
    this.zoomSpots = zoomSpots;
    this.refresh();
  }

  /** Sets the hint text and returns the height of the hint bar (0 if there is no text). */
  private measureHint(): number {
    const { width, height } = this.view;
    const text = this.hintText();
    this.currentHint = text ?? '';
    this.hintLabel.setVisible(text !== undefined);
    if (text === undefined) {
      return 0;
    }
    const inTool = this.tool.tool !== 'view';
    const exitSpace = inTool ? 2 * EXIT_RADIUS + 10 : 0;
    let fontSize = clamp(Math.min(width, height) * 0.04, 16, 26);
    // The text never runs under the ✕ button: wrap narrower than the free space and shrink if it is still too wide.
    const textMax = Math.max(100, hintBarGeometry(width).width - exitSpace - 40);
    setLabelSize(this.hintLabel.setWordWrapWidth(textMax - 12).setText(text), fontSize, textMax);
    // On a low screen (a phone held sideways) the bar is never taller than its minimum, on a narrow one (a phone held
    // upright) not much taller: long sentences get smaller letters, so the picker below keeps its room.
    const maxHeight = height < 400 ? HINT_MIN_HEIGHT : width < 420 ? HINT_MAX_HEIGHT_NARROW : Number.POSITIVE_INFINITY;
    if (maxHeight < Number.POSITIVE_INFINITY) {
      while (this.hintLabel.height + 20 > maxHeight && fontSize > 11) {
        fontSize -= 1;
        setLabelSize(this.hintLabel, fontSize, textMax);
      }
    }
    return Math.max(this.hintLabel.height + 20, inTool ? HINT_MIN_HEIGHT : 0);
  }

  /** Puts every control where {@link layoutBuildUi} says. */
  private applyLayout(layout: BuildLayout): void {
    const { width } = this.view;
    this.layoutData = layout;
    this.stock.layout(layout.stock);
    this.applyCard(layout);

    // Toolbar: big buttons, in several rows when the screen is too narrow or low.
    const { size: button, cols, rect: bar } = layout.toolbar;
    this.toolbarRect = bar;
    drawPanel(this.toolbarPanel, bar);
    TOOLS.forEach((id, index) => {
      const row = Math.floor(index / cols);
      const inRow = Math.min(cols, TOOLS.length - row * cols);
      const col = index - row * cols;
      const rowW = inRow * button + (inRow - 1) * TOOLBAR_GAP;
      this.toolButtons
        .get(id)
        ?.layoutTo(button, button)
        .setPosition((width - rowW) / 2 + button / 2 + col * (button + TOOLBAR_GAP), bar.y + TOOLBAR_PAD + button / 2 + row * (button + TOOLBAR_GAP));
    });

    // Hint bar.
    this.hintPanel.clear();
    this.hintAtBottom = this.tool.tool === 'view';
    this.hintRect = layout.hint ?? EMPTY;
    this.exitButton.setVisible(layout.hint !== undefined && this.tool.tool !== 'view');
    if (layout.hint) {
      const hint = layout.hint;
      const exitSpace = this.tool.tool !== 'view' ? 2 * EXIT_RADIUS + 10 : 0;
      const textMax = Math.max(100, hint.width - exitSpace - 40);
      drawPanel(this.hintPanel, hint);
      this.hintLabel.setPosition(hint.x + 20 + textMax / 2, hint.y + hint.height / 2);
      this.exitButton.setPosition(hint.x + hint.width - 8 - EXIT_RADIUS, hint.y + 4 + EXIT_RADIUS);
    }

    this.applyPicker(layout);

    // ✓ and ✕ at their fixed place.
    this.confirmButton.setVisible(layout.confirm !== undefined);
    this.cancelButton.setVisible(layout.cancel !== undefined);
    if (layout.confirm && layout.cancel) {
      this.confirmButton.setPosition(layout.confirm.x + layout.confirm.width / 2, layout.confirm.y + layout.confirm.height / 2).setDimmed(!this.tool.canConfirm);
      this.cancelButton.setPosition(layout.cancel.x + layout.cancel.width / 2, layout.cancel.y + layout.cancel.height / 2);
    }
  }

  /** What the building is doing, in one sentence (for the card and for the hint if the card does not fit). */
  private cardSentence(buildingId: number): string | undefined {
    const status = cardStatus(this.getState(), buildingId);
    return status ? t(status.text, status.params) : undefined;
  }

  /** Opens, moves or closes the info card of the building the child tapped. */
  private applyCard(layout: BuildLayout): void {
    const id = this.tool.inspectedId;
    const building = id === undefined ? undefined : this.getState().buildings.find((b) => b.id === id);
    const type = building ? buildingType(building.type) : undefined;
    const info = type ? productionInfo(type.id) : undefined;
    if (layout.card?.fits && type && info && id !== undefined) {
      this.card.show(layout.card, t(type.nameKey), info);
      this.card.setStatus(cardStatus(this.getState(), id));
      this.cardTick = this.getState().tick;
    } else {
      this.card.hide();
    }
  }

  private applyPicker(layout: BuildLayout): void {
    const { width } = this.view;
    const category = this.tool.variantCategory;
    const types = category ? typesOf(category) : [];
    this.pickerPanel.clear();
    this.pickerRect = EMPTY;
    for (const button of this.variantButtons.values()) {
      button.setVisible(false);
    }
    this.prevButton.setVisible(false);
    this.nextButton.setVisible(false);

    const picker = layout.picker;
    if (picker) {
      this.pickerPage = clamp(this.pickerPage, 0, picker.pages - 1);
      this.pickerRect = picker.rect;
      drawPanel(this.pickerPanel, picker.rect);
      const shown = types.slice(this.pickerPage * picker.perPage, (this.pickerPage + 1) * picker.perPage);
      const rowsShown = picker.paged ? 1 : picker.rows;
      const cols = picker.paged ? picker.perPage : picker.cols;
      shown.forEach((type, index) => {
        const row = Math.floor(index / cols);
        // The last row is centred when it is not full.
        const inRow = row === rowsShown - 1 ? shown.length - row * cols : cols;
        const col = index - row * cols;
        const rowW = inRow * picker.cellW + (inRow - 1) * PICKER_GAP;
        this.variantButtons
          .get(type.id)
          ?.setVisible(true)
          .layoutTo(picker.cellW, picker.cellH)
          .setPosition(
            (width - rowW) / 2 + picker.cellW / 2 + col * (picker.cellW + PICKER_GAP),
            picker.rect.y + PICKER_PAD + picker.cellH / 2 + row * (picker.cellH + PICKER_GAP),
          )
          .setHighlighted(this.tool.variant === type.id)
          .setDimmed(Object.keys(missingFor(this.getState(), type.id)).length > 0);
        this.costRows.get(type.id)?.setCost(costOf(type.id), missingFor(this.getState(), type.id));
      });
      if (picker.paged) {
        const y = picker.rect.y + picker.rect.height / 2;
        this.prevButton.setVisible(true).setPosition(picker.rect.x + PICKER_PAD + PICKER_ARROW / 2, y).setDimmed(this.pickerPage === 0);
        this.nextButton
          .setVisible(true)
          .setPosition(picker.rect.x + picker.rect.width - PICKER_PAD - PICKER_ARROW / 2, y)
          .setDimmed(this.pickerPage >= picker.pages - 1);
      }
    }

    // The folded picker: a small chip with the chosen variant, bottom left.
    this.chipRect = layout.chip ?? EMPTY;
    for (const [id, button] of this.chipButtons) {
      const shown = layout.chip !== undefined && this.tool.variant === id;
      button.setVisible(shown);
      if (shown && layout.chip) {
        button
          .layoutTo(CHIP_W, CHIP_H)
          .setPosition(layout.chip.x + CHIP_W / 2, layout.chip.y + CHIP_H / 2)
          .setHighlighted(true)
          .setDimmed(Object.keys(missingFor(this.getState(), id)).length > 0);
      }
    }
  }

  private hintText(): string | undefined {
    // The info card says everything itself: no extra note beside it (and if it does not fit, its sentence is the hint).
    if (this.tool.inspectedId !== undefined) {
      return this.cardFallback;
    }
    if (this.notice && this.scene.time.now < this.notice.until) {
      return this.notice.text;
    }
    const hint = this.tool.hint;
    return hint ? t(hint, this.tool.hintParams) : undefined;
  }

  /** Brings the buttons in line with the tool state (highlight, picker, hint, ✓ / ✕). */
  private refresh(): void {
    // A new tool opens its picker; tapping a place on the map folds it into the chip.
    if (this.tool.tool !== this.lastTool) {
      this.lastTool = this.tool.tool;
      this.pickerOpen = true;
      // A note about the last tool does not belong to the next one.
      this.notice = undefined;
    }
    const hasPreview = this.tool.hasPreview;
    if (hasPreview && !this.hadPreview) {
      this.pickerOpen = false;
    }
    this.hadPreview = hasPreview;

    for (const [id, button] of this.toolButtons) {
      button.setHighlighted(this.tool.tool === id);
    }
    const category = this.tool.variantCategory;
    const input = {
      width: this.view.width,
      height: this.view.height,
      toolCount: TOOLS.length,
      stockCount: ITEM_IDS.length,
      variantCount: category ? typesOf(category).length : 0,
      pickerOpen: this.pickerOpen,
      hasPreview,
      hintAtTop: this.tool.tool !== 'view',
    };
    const inspected = this.tool.inspectedId;
    this.cardFallback = undefined;
    let layout = layoutBuildUi({ ...input, infoOpen: inspected !== undefined, hintHeight: this.measureHint() });
    if (inspected !== undefined && layout.card && !layout.card.fits) {
      // No room for the card (a very low screen): its sentence goes into the hint bar instead.
      this.cardFallback = this.cardSentence(inspected);
      layout = layoutBuildUi({ ...input, infoOpen: false, hintHeight: this.measureHint() });
    }
    this.applyLayout(layout);
    this.seenVersion = this.tool.version;
    this.spotsDirty = true;
    this.onChange();
  }

  /** Once per frame: follow changes of the tool and the store, and let notices run out. */
  update(): void {
    const state = this.getState();
    const expired = this.notice !== undefined && this.scene.time.now >= this.notice.until;
    if (expired) {
      this.notice = undefined;
    }
    // The numbers pop when they change; cards that can (not) be paid for change with them.
    const stockChanged = this.stock.update(state.inventory);
    if (expired || this.seenVersion !== this.tool.version || (stockChanged && this.tool.variantCategory !== undefined)) {
      this.refresh();
    }
    // The card follows the simulation, which changes once per tick.
    const inspected = this.tool.inspectedId;
    if (inspected !== undefined && this.cardTick !== state.tick) {
      this.cardTick = state.tick;
      if (this.cardFallback !== undefined) {
        // The sentence is the hint now: follow it when it changes.
        if (this.cardSentence(inspected) !== this.cardFallback) {
          this.refresh();
        }
      } else {
        this.card.setStatus(cardStatus(state, inspected));
      }
    }
  }

  /** Where the tappable controls are (CSS px) as JSON – for the smoke test; rebuilt only after a change. */
  get spots(): string {
    if (this.spotsDirty) {
      this.spotsDirty = false;
      const spots: Record<string, UiSpot> = { ...this.zoomSpots };
      for (const [id, button] of this.toolButtons) {
        spots[`tool-${id}`] = { x: button.x, y: button.y, enabled: true };
      }
      for (const [id, button] of this.variantButtons) {
        if (button.visible) {
          spots[`variant-${id}`] = { x: button.x, y: button.y, enabled: true, dim: Object.keys(missingFor(this.getState(), id)).length > 0 };
        }
      }
      const stockRect = this.stock.rect;
      spots['stock'] = { x: stockRect.x + stockRect.width / 2, y: stockRect.y + stockRect.height / 2, enabled: true, w: stockRect.width, h: stockRect.height };
      if (this.card.isOpen) {
        const cardRect = this.card.rect;
        spots['card'] = { x: cardRect.x + cardRect.width / 2, y: cardRect.y + cardRect.height / 2, enabled: true, w: cardRect.width, h: cardRect.height };
        spots['card-close'] = { ...this.card.closeSpot, enabled: true, w: 64, h: 64 };
      }
      for (const button of this.chipButtons.values()) {
        if (button.visible) {
          spots['chip'] = { x: button.x, y: button.y, enabled: true };
        }
      }
      if (this.prevButton.visible) {
        spots['page-prev'] = { x: this.prevButton.x, y: this.prevButton.y, enabled: this.pickerPage > 0 };
        spots['page-next'] = { x: this.nextButton.x, y: this.nextButton.y, enabled: true };
      }
      if (this.exitButton.visible) {
        spots['exit'] = { x: this.exitButton.x, y: this.exitButton.y, enabled: true };
      }
      if (this.confirmButton.visible) {
        spots['confirm'] = { x: this.confirmButton.x, y: this.confirmButton.y, enabled: this.tool.canConfirm };
        spots['cancel'] = { x: this.cancelButton.x, y: this.cancelButton.y, enabled: true };
      }
      this.spotsJson = JSON.stringify(spots);
    }
    return this.spotsJson;
  }

  /** The numbers of the store bar as JSON (for tests). */
  get shownStock(): string {
    return this.stock.shownText;
  }

  /** The text shown in the hint bar, for tests. */
  get shownHint(): string {
    return this.currentHint;
  }
}

function drawPanel(g: Phaser.GameObjects.Graphics, rect: Rect): void {
  g.clear();
  g.fillStyle(COLORS.panel, 0.55).fillRoundedRect(rect.x, rect.y, rect.width, rect.height, 20);
  g.lineStyle(3, COLORS.toolActiveRim, 0.6).strokeRoundedRect(rect.x, rect.y, rect.width, rect.height, 20);
}
