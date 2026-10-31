import type Phaser from 'phaser';
import { typesOf, type BuildingType } from '../../data/buildings';
import { t, type TextKey } from '../../data/texts';
import type { Rect } from '../../ui/cameraMath';
import { TOOLS, TOOL_CATEGORIES, type BuildTool, type ToolId } from '../../ui/buildTool';
import { CANCEL_DIAMETER, CONFIRM_DIAMETER, placeConfirmButtons } from '../../ui/confirmLayout';
import { createLabel, setLabelSize } from '../../ui/label';
import { RoundButton } from '../../ui/RoundButton';
import { SquareButton } from '../../ui/SquareButton';
import { worldTapIgnored } from '../../ui/tapPause';
import { COLORS, clamp } from '../../ui/style';
import { drawToolIcon } from '../../ui/toolIcons';
import { TOOLBAR_EDGE, TOOLBAR_GAP, TOOLBAR_PAD, toolbarLayout } from '../../ui/toolbarLayout';
import type { ViewSize } from '../../ui/viewport';
import { buildingTextureKey } from './buildingTextures';

const GAP = 8;
/** Picker cells and the small chip that the picker folds into. */
const CELL_W = 84;
const CELL_H = 104;
const CHIP_W = 76;
const CHIP_H = 90;
/** The ✕ in the hint bar (64 px). */
const EXIT_RADIUS = 32;
/** Width kept free at the right for the zoom buttons (CSS px). */
const ZOOM_COLUMN = 108;
/** How long a short explanation ("Hier geht das nicht.") stays. */
const NOTICE_MS = 2800;

export interface UiSpot {
  readonly x: number;
  readonly y: number;
  readonly enabled: boolean;
}

const EMPTY: Rect = { x: 0, y: 0, width: 0, height: 0 };

/**
 * The building controls on top of the island: toolbar at the bottom (one big
 * button per tool, wraps on narrow screens), the variant picker above it
 * (it folds into a small chip once a place was tapped), a hint bar at the top
 * with a short sentence and a big ✕, and the ✓ / ✕ buttons at a fixed place
 * bottom right. Everything lives in the UI layer, in CSS pixels. It shows
 * what {@link BuildTool} says and passes taps on; it never touches the
 * simulation itself.
 */
export class BuildUI {
  private readonly toolbarPanel: Phaser.GameObjects.Graphics;
  private readonly pickerPanel: Phaser.GameObjects.Graphics;
  private readonly hintPanel: Phaser.GameObjects.Graphics;
  private readonly hintLabel: Phaser.GameObjects.Text;
  private readonly exitButton: RoundButton;
  private readonly confirmButton: RoundButton;
  private readonly cancelButton: RoundButton;
  private readonly toolButtons = new Map<Exclude<ToolId, 'view'>, SquareButton>();
  private readonly variantButtons = new Map<string, SquareButton>();
  private readonly chipButtons = new Map<string, SquareButton>();
  private view: ViewSize = { width: 1, height: 1 };
  private seenVersion = -1;
  private notice: { text: string; until: number } | undefined;
  private hintRect: Rect = EMPTY;
  private toolbarRect: Rect = EMPTY;
  private pickerRect: Rect = EMPTY;
  private chipRect: Rect = EMPTY;
  private pickerOpen = true;
  private lastTool: ToolId = 'view';
  private hadPreview = false;
  private lastUiTap = Number.NEGATIVE_INFINITY;
  private zoomSpots: Record<string, UiSpot> = {};
  private spotsJson = '{}';
  private spotsDirty = true;

  constructor(
    private readonly scene: Phaser.Scene,
    uiLayer: Phaser.GameObjects.Layer,
    private readonly tool: BuildTool,
    private readonly onChange: () => void,
  ) {
    this.toolbarPanel = scene.add.graphics();
    this.pickerPanel = scene.add.graphics();
    this.hintPanel = scene.add.graphics();
    uiLayer.add([this.toolbarPanel, this.pickerPanel, this.hintPanel]);

    this.hintLabel = createLabel(scene, '', 24);
    this.exitButton = new RoundButton(scene, 0, 0, {
      radius: EXIT_RADIUS,
      icon: 'cross',
      variant: 'cancel',
      onTap: (time) => {
        this.touched(time);
        this.tool.exitTool();
        this.refresh();
      },
    });

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
          this.showNotice(notice);
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
    for (const object of [this.confirmButton, this.cancelButton, this.exitButton, this.hintLabel]) {
      object.setVisible(false);
    }

    uiLayer.add([
      ...this.toolButtons.values(),
      ...this.variantButtons.values(),
      ...this.chipButtons.values(),
      this.hintLabel,
      this.exitButton,
      this.confirmButton,
      this.cancelButton,
    ]);
  }

  /** A picker cell (`cell`) or the small chip (`chip`) for one type. */
  private variantButton(type: BuildingType, kind: 'cell' | 'chip'): SquareButton {
    const button = new SquareButton(this.scene, {
      label: t(type.nameKey).replace(' ', '\n'),
      content: this.scene.add.image(0, 0, buildingTextureKey(type.id)),
      fitContent: (content, width, height) => {
        const picture = content as Phaser.GameObjects.Image;
        picture.setScale(Math.min(width / picture.width, height / picture.height));
      },
      onTap: (time) => {
        this.touched(time);
        if (kind === 'chip') {
          this.pickerOpen = true;
        } else {
          this.tool.selectVariant(type.id);
          // Choosing while a place is already tapped folds the picker away again.
          this.pickerOpen = !this.tool.hasPreview;
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
  showNotice(key: TextKey): void {
    this.notice = { text: t(key), until: this.scene.time.now + NOTICE_MS };
    this.seenVersion = -1;
  }

  /** Is this screen point (CSS px) on a panel? Then a press there is not for the camera. */
  coversPoint(x: number, y: number): boolean {
    return [this.toolbarRect, this.pickerRect, this.hintRect, this.chipRect].some(
      (rect) => rect.width > 0 && x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height,
    );
  }

  /** Call whenever the visible area changes (start, resize, rotation). `zoomSpots` are published with the others. */
  layout(size: ViewSize, zoomSpots: Record<string, UiSpot>): void {
    this.view = size;
    this.zoomSpots = zoomSpots;
    const { width, height } = size;

    // Toolbar: big buttons, in several rows when the screen is too narrow.
    const { size: button, cols, rows } = toolbarLayout(width, TOOLS.length);
    const panelW = cols * button + (cols - 1) * TOOLBAR_GAP + 2 * TOOLBAR_PAD;
    const panelH = rows * button + (rows - 1) * TOOLBAR_GAP + 2 * TOOLBAR_PAD;
    const panelX = (width - panelW) / 2;
    const panelY = height - TOOLBAR_EDGE - panelH;
    this.toolbarRect = { x: panelX, y: panelY, width: panelW, height: panelH };
    drawPanel(this.toolbarPanel, this.toolbarRect);
    TOOLS.forEach((id, index) => {
      const row = Math.floor(index / cols);
      const inRow = Math.min(cols, TOOLS.length - row * cols);
      const col = index - row * cols;
      const rowW = inRow * button + (inRow - 1) * TOOLBAR_GAP;
      this.toolButtons
        .get(id)
        ?.layoutTo(button, button)
        .setPosition((width - rowW) / 2 + button / 2 + col * (button + TOOLBAR_GAP), panelY + TOOLBAR_PAD + button / 2 + row * (button + TOOLBAR_GAP));
    });
    this.refresh();
  }

  private layoutPicker(): void {
    const { width } = this.view;
    const category = this.tool.variantCategory;
    const types = category ? typesOf(category) : [];
    const open = types.length > 0 && this.pickerOpen;
    // Above the toolbar – and above the ✓ / ✕ row, while there is a preview.
    const bottom = this.toolbarRect.y - GAP - (this.tool.hasPreview ? CONFIRM_DIAMETER + GAP : 0);

    for (const [id, button] of this.variantButtons) {
      button.setVisible(open && types.some((type) => type.id === id));
    }
    this.pickerPanel.clear();
    this.pickerRect = EMPTY;
    if (open) {
      const maxCols = Math.max(1, Math.floor((width - 2 * TOOLBAR_EDGE - 2 * TOOLBAR_PAD + GAP) / (CELL_W + GAP)));
      const cols = Math.min(types.length, maxCols);
      const rows = Math.ceil(types.length / cols);
      const panelW = cols * CELL_W + (cols - 1) * GAP + 2 * TOOLBAR_PAD;
      const panelH = rows * CELL_H + (rows - 1) * GAP + 2 * TOOLBAR_PAD;
      const panelY = bottom - panelH;
      this.pickerRect = { x: (width - panelW) / 2, y: panelY, width: panelW, height: panelH };
      drawPanel(this.pickerPanel, this.pickerRect);
      types.forEach((type, index) => {
        const row = Math.floor(index / cols);
        // The last row is centred when it is not full.
        const inRow = row === rows - 1 ? types.length - row * cols : cols;
        const col = index - row * cols;
        const rowW = inRow * CELL_W + (inRow - 1) * GAP;
        this.variantButtons
          .get(type.id)
          ?.layoutTo(CELL_W, CELL_H)
          .setPosition((width - rowW) / 2 + CELL_W / 2 + col * (CELL_W + GAP), panelY + TOOLBAR_PAD + CELL_H / 2 + row * (CELL_H + GAP))
          .setHighlighted(this.tool.variant === type.id);
      });
    }

    // The folded picker: a small chip with the chosen variant, bottom left.
    this.chipRect = EMPTY;
    for (const [id, button] of this.chipButtons) {
      const shown = types.length > 0 && !this.pickerOpen && this.tool.variant === id;
      button.setVisible(shown);
      if (shown) {
        this.chipRect = { x: TOOLBAR_EDGE, y: bottom - CHIP_H, width: CHIP_W, height: CHIP_H };
        button.layoutTo(CHIP_W, CHIP_H).setPosition(TOOLBAR_EDGE + CHIP_W / 2, bottom - CHIP_H / 2).setHighlighted(true);
      }
    }
  }

  private layoutConfirm(): void {
    const show = this.tool.hasPreview;
    this.confirmButton.setVisible(show);
    this.cancelButton.setVisible(show);
    if (!show) {
      return;
    }
    const placement = placeConfirmButtons(this.view.width, this.toolbarRect.y);
    this.confirmButton.setPosition(placement.confirm.x, placement.confirm.y).setDimmed(!this.tool.canConfirm);
    this.cancelButton.setPosition(placement.cancel.x, placement.cancel.y);
  }

  private layoutHint(): void {
    const { width, height } = this.view;
    const text = this.hintText();
    const visible = text !== undefined;
    this.hintLabel.setVisible(visible);
    this.hintPanel.clear();
    this.exitButton.setVisible(visible && this.tool.tool !== 'view');
    if (!visible) {
      this.hintRect = EMPTY;
      return;
    }
    const exitSpace = this.tool.tool !== 'view' ? 2 * EXIT_RADIUS + 10 : 0;
    // The zoom buttons sit at the top right: keep the bar clear of them. On narrow screens the text wraps.
    const fontSize = clamp(Math.min(width, height) * 0.04, 18, 26);
    const maxBar = Math.max(width - 2 * ZOOM_COLUMN, Math.min(width - ZOOM_COLUMN - 12, 420));
    // The bar always has the same width, so the ✕ never moves under the finger when the text changes.
    const barW = Math.min(maxBar, 720);
    const textMax = Math.max(120, barW - exitSpace - 32);
    setLabelSize(this.hintLabel.setWordWrapWidth(textMax).setText(text), fontSize);
    const barH = Math.max(this.hintLabel.height + 20, 2 * EXIT_RADIUS + 8);
    const barX = clamp((width - barW) / 2, 12, Math.max(12, width - ZOOM_COLUMN - barW));
    const barY = 12;
    this.hintRect = { x: barX, y: barY, width: barW, height: barH };
    drawPanel(this.hintPanel, this.hintRect);
    this.hintLabel.setPosition(barX + 16 + textMax / 2, barY + barH / 2);
    this.exitButton.setPosition(barX + barW - 8 - EXIT_RADIUS, barY + 4 + EXIT_RADIUS);
  }

  private hintText(): string | undefined {
    if (this.notice && this.scene.time.now < this.notice.until) {
      return this.notice.text;
    }
    const hint = this.tool.hint;
    return hint ? t(hint) : undefined;
  }

  /** Brings the buttons in line with the tool state (highlight, picker, hint, ✓ / ✕). */
  private refresh(): void {
    // A new tool opens its picker; tapping a place on the map folds it into the chip.
    if (this.tool.tool !== this.lastTool) {
      this.lastTool = this.tool.tool;
      this.pickerOpen = true;
    }
    const hasPreview = this.tool.hasPreview;
    if (hasPreview && !this.hadPreview) {
      this.pickerOpen = false;
    }
    this.hadPreview = hasPreview;

    for (const [id, button] of this.toolButtons) {
      button.setHighlighted(this.tool.tool === id);
    }
    this.layoutPicker();
    this.layoutHint();
    this.layoutConfirm();
    this.seenVersion = this.tool.version;
    this.spotsDirty = true;
    this.onChange();
  }

  /** Once per frame: follow changes of the tool and let notices run out. */
  update(): void {
    const expired = this.notice !== undefined && this.scene.time.now >= this.notice.until;
    if (expired) {
      this.notice = undefined;
    }
    if (expired || this.seenVersion !== this.tool.version) {
      this.refresh();
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
          spots[`variant-${id}`] = { x: button.x, y: button.y, enabled: true };
        }
      }
      for (const button of this.chipButtons.values()) {
        if (button.visible) {
          spots['chip'] = { x: button.x, y: button.y, enabled: true };
        }
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

  /** The text shown in the hint bar, for tests. */
  get shownHint(): string {
    return this.hintText() ?? '';
  }
}

function drawPanel(g: Phaser.GameObjects.Graphics, rect: Rect): void {
  g.clear();
  g.fillStyle(COLORS.panel, 0.55).fillRoundedRect(rect.x, rect.y, rect.width, rect.height, 20);
  g.lineStyle(3, COLORS.toolActiveRim, 0.6).strokeRoundedRect(rect.x, rect.y, rect.width, rect.height, 20);
}
