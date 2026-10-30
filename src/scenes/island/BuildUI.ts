import type Phaser from 'phaser';
import { typesOf } from '../../data/buildings';
import { t, type TextKey } from '../../data/texts';
import type { Rect } from '../../ui/cameraMath';
import { TOOLS, type BuildTool, type ToolId } from '../../ui/buildTool';
import { placeConfirmButtons } from '../../ui/confirmLayout';
import { createLabel, setLabelSize } from '../../ui/label';
import { RoundButton } from '../../ui/RoundButton';
import { SquareButton } from '../../ui/SquareButton';
import { COLORS, clamp } from '../../ui/style';
import { drawToolIcon } from '../../ui/toolIcons';
import type { ViewSize } from '../../ui/viewport';
import { buildingTextureKey } from './buildingTextures';

/** Toolbar: button size limits, gaps and distance to the screen edge (CSS px). */
const TOOL_MIN = 64;
const TOOL_MAX = 96;
const GAP = 8;
const EDGE = 10;
const PANEL_PAD = 8;
/** Picker cells. */
const CELL_W = 84;
const CELL_H = 104;
/** ✓ and ✕ buttons. */
const CONFIRM_RADIUS = 36;
const EXIT_RADIUS = 26;
/** Width kept free at the right for the zoom buttons (CSS px). */
const ZOOM_COLUMN = 108;
/** How long a short explanation ("Hier geht das nicht.") stays. */
const NOTICE_MS = 2800;

export interface UiSpot {
  readonly x: number;
  readonly y: number;
  readonly enabled: boolean;
}

/**
 * The building controls on top of the island: toolbar at the bottom (one big
 * button per tool), the variant picker above it, a hint bar at the top with a
 * short sentence, and the ✓ / ✕ buttons next to the preview. Everything lives
 * in the UI layer, in CSS pixels. It shows what {@link BuildTool} says and
 * passes taps on; it never touches the simulation itself.
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
  private view: ViewSize = { width: 1, height: 1 };
  private seenVersion = -1;
  private notice: { text: string; until: number } | undefined;
  private hintRect: Rect = { x: 0, y: 0, width: 0, height: 0 };
  private toolbarRect: Rect = { x: 0, y: 0, width: 0, height: 0 };
  private pickerRect: Rect = { x: 0, y: 0, width: 0, height: 0 };
  private avoidRects: Rect[] = [];

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
      onTap: () => {
        this.tool.exitTool();
        this.changed();
      },
    });

    for (const id of TOOLS) {
      const icon = scene.add.graphics();
      const button = new SquareButton(scene, {
        label: t(`tool.${id}`),
        content: icon,
        fitContent: (content, width, height) => {
          drawToolIcon(content as Phaser.GameObjects.Graphics, id, Math.min(width, height));
        },
        onTap: () => {
          this.tool.selectTool(id);
          this.changed();
        },
      });
      this.toolButtons.set(id, button);
    }

    for (const type of [...typesOf('house'), ...typesOf('deco')]) {
      const image = scene.add.image(0, 0, buildingTextureKey(type.id));
      const button = new SquareButton(scene, {
        label: t(type.nameKey).replace(' ', '\n'),
        content: image,
        fitContent: (content, width, height) => {
          const picture = content as Phaser.GameObjects.Image;
          picture.setScale(Math.min(width / picture.width, height / picture.height));
        },
        onTap: () => {
          this.tool.selectVariant(type.id);
          this.changed();
        },
      });
      button.setVisible(false);
      this.variantButtons.set(type.id, button);
    }

    this.confirmButton = new RoundButton(scene, 0, 0, {
      radius: CONFIRM_RADIUS,
      icon: 'check',
      variant: 'confirm',
      onTap: () => {
        const notice = this.tool.confirm();
        if (notice) {
          this.showNotice(notice);
        }
        this.changed();
      },
    });
    this.cancelButton = new RoundButton(scene, 0, 0, {
      radius: CONFIRM_RADIUS,
      icon: 'cross',
      variant: 'cancel',
      onTap: () => {
        this.tool.cancel();
        this.changed();
      },
    });
    this.confirmButton.setVisible(false);
    this.cancelButton.setVisible(false);
    this.exitButton.setVisible(false);
    this.hintLabel.setVisible(false);

    uiLayer.add([...this.toolButtons.values(), ...this.variantButtons.values(), this.hintLabel, this.exitButton, this.confirmButton, this.cancelButton]);
  }

  /** Short explanation for the child ("Dieses Haus braucht einen Weg."). */
  showNotice(key: TextKey): void {
    this.notice = { text: t(key), until: this.scene.time.now + NOTICE_MS };
    this.seenVersion = -1;
  }

  /** The toolbar, picker and hint bar areas plus the zoom buttons – places the ✓ / ✕ must stay out of. */
  get avoid(): readonly Rect[] {
    return this.avoidRects;
  }

  /** Free area for the ✓ / ✕ buttons: not under the toolbar, picker or hint bar. */
  get safeArea(): Rect {
    const top = this.hintRect.y + this.hintRect.height + 6;
    const bottom = Math.min(this.toolbarRect.y, this.pickerRect.height > 0 ? this.pickerRect.y : Infinity) - 8;
    return { x: 8, y: top, width: this.view.width - 16, height: Math.max(40, bottom - top) };
  }

  /** Is this screen point (CSS px) on a panel? Then a press there is not for the camera. */
  coversPoint(x: number, y: number): boolean {
    return [this.toolbarRect, this.pickerRect, this.hintRect].some(
      (rect) => rect.width > 0 && x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height,
    );
  }

  /** Call whenever the visible area changes (start, resize, rotation). `zoomButtons` are kept free of ✓ / ✕. */
  layout(size: ViewSize, zoomButtons: Rect): void {
    this.view = size;
    const { width, height } = size;

    // Toolbar: five big buttons in a row, centred at the bottom.
    const count = TOOLS.length;
    const buttonSize = clamp((width - 2 * EDGE - 2 * PANEL_PAD - (count - 1) * GAP) / count, TOOL_MIN, TOOL_MAX);
    const panelW = count * buttonSize + (count - 1) * GAP + 2 * PANEL_PAD;
    const panelH = buttonSize + 2 * PANEL_PAD;
    const panelX = (width - panelW) / 2;
    const panelY = height - EDGE - panelH;
    this.toolbarRect = { x: panelX, y: panelY, width: panelW, height: panelH };
    drawPanel(this.toolbarPanel, this.toolbarRect);
    TOOLS.forEach((id, index) => {
      this.toolButtons
        .get(id)
        ?.layoutTo(buttonSize, buttonSize)
        .setPosition(panelX + PANEL_PAD + buttonSize / 2 + index * (buttonSize + GAP), panelY + panelH / 2);
    });

    this.avoidRects = [zoomButtons];
    this.layoutPicker();
    this.layoutHint();
    this.refresh();
  }

  private layoutPicker(): void {
    const { width } = this.view;
    const category = this.tool.variantCategory;
    const types = category ? typesOf(category) : [];
    for (const [id, button] of this.variantButtons) {
      button.setVisible(types.some((type) => type.id === id));
    }
    this.pickerPanel.clear();
    if (types.length === 0) {
      this.pickerRect = { x: 0, y: 0, width: 0, height: 0 };
      return;
    }
    const maxCols = Math.max(1, Math.floor((width - 2 * EDGE - 2 * PANEL_PAD + GAP) / (CELL_W + GAP)));
    const cols = Math.min(types.length, maxCols);
    const rows = Math.ceil(types.length / cols);
    const panelW = cols * CELL_W + (cols - 1) * GAP + 2 * PANEL_PAD;
    const panelH = rows * CELL_H + (rows - 1) * GAP + 2 * PANEL_PAD;
    const panelX = (width - panelW) / 2;
    const panelY = this.toolbarRect.y - GAP - panelH;
    this.pickerRect = { x: panelX, y: panelY, width: panelW, height: panelH };
    drawPanel(this.pickerPanel, this.pickerRect);
    types.forEach((type, index) => {
      const row = Math.floor(index / cols);
      // The last row is centred when it is not full.
      const inRow = row === rows - 1 ? types.length - row * cols : cols;
      const col = index - row * cols;
      const rowW = inRow * CELL_W + (inRow - 1) * GAP;
      const x = (width - rowW) / 2 + CELL_W / 2 + col * (CELL_W + GAP);
      this.variantButtons
        .get(type.id)
        ?.layoutTo(CELL_W, CELL_H)
        .setPosition(x, panelY + PANEL_PAD + CELL_H / 2 + row * (CELL_H + GAP))
        .setHighlighted(this.tool.variant === type.id);
    });
  }

  private layoutHint(): void {
    const { width, height } = this.view;
    const text = this.hintText();
    const visible = text !== undefined;
    this.hintLabel.setVisible(visible);
    this.hintPanel.clear();
    this.exitButton.setVisible(visible && this.tool.tool !== 'view');
    if (!visible) {
      this.hintRect = { x: 0, y: 0, width: 0, height: 0 };
      return;
    }
    const exitSpace = this.tool.tool !== 'view' ? 2 * EXIT_RADIUS + 10 : 0;
    // The zoom buttons sit at the top right: keep the bar clear of them. On narrow screens the text wraps.
    const fontSize = clamp(Math.min(width, height) * 0.04, 18, 26);
    const maxBar = Math.max(width - 2 * ZOOM_COLUMN, Math.min(width - ZOOM_COLUMN - 12, 420));
    const textMax = Math.max(120, maxBar - exitSpace - 32);
    setLabelSize(this.hintLabel.setWordWrapWidth(textMax).setText(text), fontSize);
    const barW = this.hintLabel.width + 32 + exitSpace;
    const barH = Math.max(this.hintLabel.height + 20, 2 * EXIT_RADIUS + 8);
    const barX = clamp((width - barW) / 2, 12, Math.max(12, width - ZOOM_COLUMN - barW));
    const barY = 12;
    this.hintRect = { x: barX, y: barY, width: barW, height: barH };
    drawPanel(this.hintPanel, this.hintRect);
    this.hintLabel.setPosition(barX + 16 + this.hintLabel.width / 2, barY + barH / 2);
    this.exitButton.setPosition(barX + barW - 8 - EXIT_RADIUS, barY + barH / 2);
  }

  private hintText(): string | undefined {
    if (this.notice && this.scene.time.now < this.notice.until) {
      return this.notice.text;
    }
    const hint = this.tool.hint;
    return hint ? t(hint) : undefined;
  }

  /** Brings the buttons in line with the tool state (highlight, picker, hint). */
  private refresh(): void {
    for (const [id, button] of this.toolButtons) {
      button.setHighlighted(this.tool.tool === id);
    }
    this.layoutPicker();
    this.layoutHint();
    this.seenVersion = this.tool.version;
    this.onChange();
  }

  private changed(): void {
    this.refresh();
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

  /**
   * Puts ✓ and ✕ next to the preview. `target` is the preview on screen
   * (CSS px) or `undefined` when there is none.
   */
  placeConfirm(target: Rect | undefined): void {
    const show = target !== undefined && this.tool.hasPreview;
    this.confirmButton.setVisible(show);
    this.cancelButton.setVisible(show);
    if (!show || !target) {
      return;
    }
    const placement = placeConfirmButtons(target, this.safeArea, this.avoidRects, CONFIRM_RADIUS * 2, 12);
    this.confirmButton.setPosition(placement.confirm.x, placement.confirm.y).setDimmed(!this.tool.canConfirm);
    this.cancelButton.setPosition(placement.cancel.x, placement.cancel.y);
  }

  /** Where the tappable controls are right now (CSS px) – for the smoke test. */
  spots(): Record<string, UiSpot> {
    const spots: Record<string, UiSpot> = {};
    for (const [id, button] of this.toolButtons) {
      spots[`tool-${id}`] = { x: button.x, y: button.y, enabled: true };
    }
    for (const [id, button] of this.variantButtons) {
      if (button.visible) {
        spots[`variant-${id}`] = { x: button.x, y: button.y, enabled: true };
      }
    }
    if (this.exitButton.visible) {
      spots['exit'] = { x: this.exitButton.x, y: this.exitButton.y, enabled: true };
    }
    if (this.confirmButton.visible) {
      spots['confirm'] = { x: this.confirmButton.x, y: this.confirmButton.y, enabled: this.tool.canConfirm };
      spots['cancel'] = { x: this.cancelButton.x, y: this.cancelButton.y, enabled: true };
    }
    return spots;
  }

  /** The text shown in the hint bar, for tests. */
  get shownHint(): string {
    return this.hintText() ?? '';
  }

  get bottomInset(): number {
    return this.view.height - Math.min(this.toolbarRect.y, this.pickerRect.height > 0 ? this.pickerRect.y : Infinity);
  }
}

function drawPanel(g: Phaser.GameObjects.Graphics, rect: Rect): void {
  g.clear();
  g.fillStyle(COLORS.panel, 0.55).fillRoundedRect(rect.x, rect.y, rect.width, rect.height, 20);
  g.lineStyle(3, COLORS.toolActiveRim, 0.6).strokeRoundedRect(rect.x, rect.y, rect.width, rect.height, 20);
}

