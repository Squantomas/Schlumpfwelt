import type Phaser from 'phaser';
import { SHOP_CATEGORIES, buildingType, shopItems, type BuildingType } from '../../data/buildings';
import { ITEM_IDS } from '../../data/goods';
import { t, type TextKey, type TextParams } from '../../data/texts';
import type { Rect } from '../../ui/cameraMath';
import { TOOLS, type BuildTool, type BuildToolState, type ToolId } from '../../ui/buildTool';
import { CHIP_H, CHIP_W, EXIT_RADIUS, HINT_MAX_HEIGHT_NARROW, HINT_MIN_HEIGHT, hintBarGeometry, layoutBuildUi, type BuildLayout } from '../../ui/buildLayout';
import { CANCEL_DIAMETER, CONFIRM_DIAMETER } from '../../ui/confirmLayout';
import { createLabel, setLabelSize } from '../../ui/label';
import { cardStatus, productionInfo } from '../../ui/productionInfo';
import { RoundButton } from '../../ui/RoundButton';
import { MessageBoard, newsVisible } from '../../ui/messageBoard';
import { newItemsText } from '../../ui/shopModel';
import { SquareButton } from '../../ui/SquareButton';
import { worldTapIgnored } from '../../ui/tapPause';
import { COLORS, clamp } from '../../ui/style';
import { drawStar, drawToolIcon } from '../../ui/toolIcons';
import { TOOLBAR_GAP, TOOLBAR_PAD } from '../../ui/toolbarLayout';
import type { ViewSize } from '../../ui/viewport';
import { buildingTextureKey } from './buildingTextures';
import { registerGoodTextures } from './goodTextures';
import { InfoCard } from './InfoCard';
import { ShopUI } from './ShopUI';
import { StockBar } from './StockBar';

/** The message "Neu im Shop: …" stays a good while (a child has to read it): at least 6 seconds. */
const NEWS_MS = 7000;

export interface UiSpot {
  readonly x: number;
  readonly y: number;
  readonly enabled: boolean;
  /** The thing it stands for can not be paid for right now (the button is greyed but still takes taps). */
  readonly dim?: boolean;
  /** Size of the area it covers (CSS px) – only given for the store bar, the info card and the shop. */
  readonly w?: number;
  readonly h?: number;
  /** Shop cards: `ok`, `dear` (greyed) or `locked`; the star ("new"); the chosen card / the shown tab. */
  readonly state?: string;
  readonly fresh?: boolean;
  readonly active?: boolean;
  /** The shop button shows the star "something new". */
  readonly badge?: boolean;
  /** Toolbar buttons and shop tabs: the size of the word under the picture (0: only the picture). */
  readonly font?: number;
  /** The shop line: height of the sentence as measured (CSS px). */
  readonly textH?: number;
}

/** The words under the toolbar buttons and the shop tabs are at least this big (CSS px), else only the picture stays. */
const MIN_LABEL_FONT = 12;

const EMPTY: Rect = { x: 0, y: 0, width: 0, height: 0 };

/** The most cards any tab of the shop has: the panel is as big for all tabs. */
const SHOP_MOST = Math.max(...SHOP_CATEGORIES.map((category) => shopItems(category).length));

/**
 * The building controls on top of the island: toolbar at the bottom (one big
 * button per tool, wraps on narrow screens), a hint bar at the top with a short
 * sentence and a big ✕, the ✓ / ✕ buttons at a fixed place bottom right, and
 * the shop. Everything lives in the UI layer, in CSS pixels. It shows what
 * {@link BuildTool} says and passes taps on; it never touches the simulation
 * itself.
 *
 * - M3: the store bar at the top left (coins and goods), the cost on every
 *   card (cards that can not be paid for are greyed, but stay choosable) and
 *   the info card of a production building.
 * - M4: the shop ({@link ShopUI}) replaces the three pickers: the "Shop"
 *   button opens a panel with tabs and cards that covers the screen below the
 *   store bar; a tap on a card starts placing that item. While an item is being
 *   placed a small chip (its picture) leads back to the shop. A star on the shop
 *   button, and the message "Neu im Shop: …", tell about new unlocks.
 */
export class BuildUI {
  private readonly toolbarPanel: Phaser.GameObjects.Graphics;
  private readonly hintPanel: Phaser.GameObjects.Graphics;
  private readonly hintLabel: Phaser.GameObjects.Text;
  private readonly exitButton: RoundButton;
  private readonly confirmButton: RoundButton;
  private readonly cancelButton: RoundButton;
  private readonly toolButtons = new Map<Exclude<ToolId, 'view' | 'place'>, SquareButton>();
  private readonly chipButtons = new Map<string, SquareButton>();
  private readonly shopStar: Phaser.GameObjects.Graphics;
  /** The gear under the zoom buttons: opens the menu (save and load a file). Only while looking. */
  private readonly menuButton: RoundButton;
  private menuRect: Rect = EMPTY;
  private readonly stock: StockBar;
  private readonly card: InfoCard;
  private readonly shop: ShopUI;
  private view: ViewSize = { width: 1, height: 1 };
  private seenVersion = -1;
  private readonly board = new MessageBoard();
  /** The message the hint bar showed last (the hint is redrawn when it changes, also when news runs out). */
  private lastMessage: string | undefined;
  private hintRect: Rect = EMPTY;
  private toolbarRect: Rect = EMPTY;
  private chipRect: Rect = EMPTY;
  private shopPage = 0;
  private lastTool: ToolId = 'view';
  private hintAtBottom = false;
  private lastUiTap = Number.NEGATIVE_INFINITY;
  /** The text of the hint bar as last set (the hint is only worked out when something changed). */
  private currentHint = '';
  private cardTick = -1;
  /** The status sentence shown as a hint when the info card does not fit on a very low screen. */
  private cardFallback: string | undefined;
  private zoomSpots: Record<string, UiSpot> = {};
  private spotsJson = '{}';
  private spotsDirty = true;
  private shownShop = '';

  constructor(
    private readonly scene: Phaser.Scene,
    uiLayer: Phaser.GameObjects.Layer,
    private readonly tool: BuildTool,
    private readonly getState: () => BuildToolState,
    private readonly onChange: () => void,
    private readonly onMenu: () => void,
    /** Is the menu behind the gear open? It covers the hint bar, so "Neu im Shop" must not run out under it. */
    private readonly menuOpen: () => boolean,
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
    this.hintPanel = scene.add.graphics();
    uiLayer.add([this.toolbarPanel, this.hintPanel]);

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

    this.shopStar = scene.add.graphics().setVisible(false);
    drawStar(this.shopStar, 13);
    for (const id of TOOLS) {
      const button = new SquareButton(scene, {
        label: t(`tool.${id}`),
        minCaptionFont: MIN_LABEL_FONT,
        content: scene.add.graphics(),
        fitContent: (content, width, height) => {
          drawToolIcon(content as Phaser.GameObjects.Graphics, id, Math.min(width, height));
        },
        onTap: (time) => {
          this.touched(time);
          this.tool.selectTool(id);
          this.refresh();
        },
      });
      if (id === 'shop') {
        button.add(this.shopStar);
      }
      this.toolButtons.set(id, button);
    }

    this.shop = new ShopUI(scene, uiLayer, {
      touched: (time) => {
        this.touched(time);
      },
      onTab: (category) => {
        this.shop.clearTip();
        this.tool.setShopTab(category);
        this.shopPage = 0;
        this.refresh();
      },
      onClose: () => {
        this.shop.clearTip();
        this.tool.closeShop();
        this.refresh();
      },
      onPick: (typeId) => {
        this.shop.clearTip();
        const notice = this.tool.chooseItem(typeId);
        if (notice) {
          this.showNotice(notice);
        } else {
          // Starting with a clean slate: an old note does not belong to the new item.
          this.board.clearExplanation();
        }
        this.refresh();
      },
      onPage: (step) => {
        this.shop.clearTip();
        this.shopPage += step;
        this.refresh();
      },
    });

    for (const category of SHOP_CATEGORIES) {
      for (const type of shopItems(category)) {
        this.chipButtons.set(type.id, this.chipButton(type));
      }
    }

    this.menuButton = new RoundButton(scene, 0, 0, {
      radius: 34, // the real size comes from `zoomLayout`
      icon: 'gear',
      onTap: (time) => {
        this.touched(time);
        this.onMenu();
      },
    });
    this.menuButton.setVisible(false);

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
          this.board.clearExplanation();
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

    uiLayer.add([...this.toolButtons.values(), ...this.chipButtons.values(), this.menuButton, this.hintLabel, this.exitButton, this.confirmButton, this.cancelButton]);
  }

  /** The small button "back to the shop" for one item: its picture and name. */
  private chipButton(type: BuildingType): SquareButton {
    const button = new SquareButton(this.scene, {
      label: t(type.nameKey).replace(' ', '\n'),
      content: this.scene.add.image(0, 0, buildingTextureKey(type.id)),
      fitContent: (content, width, height) => {
        const picture = content as Phaser.GameObjects.Image;
        picture.setScale(Math.min(width / picture.width, height / picture.height));
      },
      onTap: (time) => {
        this.touched(time);
        // The place that was tapped stays; the shop opens on the tab of this item.
        this.tool.openShop();
        this.refresh();
      },
    });
    button.setVisible(false);
    return button;
  }

  /** A control was tapped: for a moment the world ignores taps (double taps on ✓ / ✕ must not fall through). */
  touched(eventTime: number): void {
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

  /**
   * Short explanation for the child ("Dieses Haus braucht einen Weg."). It stays until the child taps something else
   * (a tap on the world, another tool, ✓ or ✕) – a slow reader gets all the time, nothing runs out by the clock.
   */
  showNotice(key: TextKey, params?: TextParams): void {
    this.board.explain(t(key, params));
    this.seenVersion = -1;
  }

  /** The next tap of the child: an old explanation goes away. */
  clearNotice(): void {
    if (this.board.hasExplanation) {
      this.board.clearExplanation();
      this.seenVersion = -1;
    }
  }

  /** Is the info card of a production building open? */
  get cardOpen(): boolean {
    return this.card.isOpen;
  }

  /** Is the shop open? It covers the screen below the store bar; the zoom buttons are hidden then. */
  get shopOpen(): boolean {
    return this.tool.shopOpen;
  }

  /** Where the hint bar ends at the top (0 if there is none up there): things in the world should not hide below it. */
  get topInset(): number {
    return this.hintRect.height > 0 && !this.hintAtBottom ? this.hintRect.y + this.hintRect.height + 6 : 0;
  }

  /** Is this screen point (CSS px) on a panel? Then a press there is not for the camera. */
  coversPoint(x: number, y: number): boolean {
    return [this.toolbarRect, this.shop.rect, this.hintRect, this.chipRect, this.stock.rect, this.card.rect].some(
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
    // upright) not much taller: long sentences get smaller letters, so the picture below keeps its room.
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
    this.stock.layout(layout.stock);
    this.applyCard(layout);
    this.menuRect = layout.menu ?? EMPTY;
    this.menuButton.setVisible(layout.menu !== undefined);
    if (layout.menu) {
      this.menuButton.setRadius(layout.menu.width / 2).setPosition(layout.menu.x + layout.menu.width / 2, layout.menu.y + layout.menu.height / 2);
    }

    // Toolbar: big buttons, in several rows when the screen is too narrow or low. The open shop covers it.
    const shopOpen = layout.shop !== undefined;
    const { size: button, cols, rect: bar } = layout.toolbar;
    this.toolbarRect = shopOpen ? EMPTY : bar;
    this.toolbarPanel.setVisible(!shopOpen);
    drawPanel(this.toolbarPanel, bar);
    const placeTools = (): void => {
      TOOLS.forEach((id, index) => {
        const row = Math.floor(index / cols);
        const inRow = Math.min(cols, TOOLS.length - row * cols);
        const col = index - row * cols;
        const rowW = inRow * button + (inRow - 1) * TOOLBAR_GAP;
        this.toolButtons
          .get(id)
          ?.setVisible(!shopOpen)
          .layoutTo(button, button)
          .setPosition((width - rowW) / 2 + button / 2 + col * (button + TOOLBAR_GAP), bar.y + TOOLBAR_PAD + button / 2 + row * (button + TOOLBAR_GAP));
      });
    };
    for (const toolButton of this.toolButtons.values()) {
      toolButton.setCaptionOff(false);
    }
    placeTools();
    // No room for a word at 12 px or more on one button: no button shows its word (only pictures, all alike).
    if ([...this.toolButtons.values()].some((toolButton) => toolButton.captionFont === 0)) {
      for (const toolButton of this.toolButtons.values()) {
        toolButton.setCaptionOff(true);
      }
      placeTools();
    }
    // The star "something new in the shop" at the corner of the shop button.
    this.shopStar.setVisible(this.tool.shopHasNews).setPosition(button / 2 - 8, -button / 2 + 8);

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

    this.applyShop(layout);

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

  /** The shop (when open) and the chip "back to the shop" (while an item is being placed). */
  private applyShop(layout: BuildLayout): void {
    const tool = this.tool;
    const shop = layout.shop;
    if (shop) {
      const pages = Math.max(1, Math.ceil(shopItems(tool.shopTab).length / shop.perPage));
      this.shopPage = clamp(this.shopPage, 0, pages - 1);
    }
    this.shop.show(shop, this.getState(), tool.shopTab, this.shopPage, (typeId) => tool.isFresh(typeId), tool.item);
    this.shownShop = shop ? `${tool.shopTab}:${String(this.shop.pageInfo.page + 1)}/${String(this.shop.pageInfo.pages)}` : 'closed';

    // The chip: the picture of the item that is being placed, bottom left.
    this.chipRect = layout.chip ?? EMPTY;
    for (const [id, button] of this.chipButtons) {
      const shown = layout.chip !== undefined && tool.item === id;
      button.setVisible(shown);
      if (shown && layout.chip) {
        button.layoutTo(CHIP_W, CHIP_H).setPosition(layout.chip.x + CHIP_W / 2, layout.chip.y + CHIP_H / 2).setHighlighted(true);
      }
    }
  }

  private hintText(): string | undefined {
    // The shop explains itself (cards, locks): no hint bar over it.
    if (this.tool.shopOpen) {
      return undefined;
    }
    // The info card says everything itself: no extra note beside it (and if it does not fit, its sentence is the hint).
    if (this.tool.inspectedId !== undefined) {
      return this.cardFallback;
    }
    const message = this.board.current(this.scene.time.now, this.newsAllowed());
    if (message !== undefined) {
      return message;
    }
    const hint = this.tool.hint;
    return hint ? t(hint, this.tool.hintParams) : undefined;
  }

  /** May news ("Neu im Shop") be shown now? Only where the hint bar really shows it – otherwise its 7 seconds would run out unseen. */
  private newsAllowed(): boolean {
    return newsVisible({ hasPreview: this.tool.hasPreview, shopOpen: this.tool.shopOpen, inspectedId: this.tool.inspectedId, menuOpen: this.menuOpen() });
  }

  /** Brings the buttons in line with the tool state (highlight, shop, hint, ✓ / ✕). */
  private refresh(): void {
    // An explanation about the last tool does not belong to the next one.
    if (this.tool.tool !== this.lastTool) {
      this.lastTool = this.tool.tool;
      this.board.clearExplanation();
    }
    for (const [id, button] of this.toolButtons) {
      // The shop button stays lit while an item from the shop is being placed.
      button.setHighlighted(this.tool.tool === id || (id === 'shop' && this.tool.tool === 'place'));
    }
    const hasPreview = this.tool.hasPreview;
    const input = {
      width: this.view.width,
      height: this.view.height,
      toolCount: TOOLS.length,
      stockCount: ITEM_IDS.length,
      shopOpen: this.tool.shopOpen,
      shopCount: SHOP_MOST,
      shopTabs: SHOP_CATEGORIES.length,
      hasChip: this.tool.tool === 'place',
      hasPreview,
      hintAtTop: this.tool.tool !== 'view',
      hasMenu: this.tool.tool === 'view',
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

  /** Once per frame: follow changes of the tool and the store, let notices run out, announce unlocks. */
  update(): void {
    // Look at the store first: a change counts as a change of the tool (see `BuildTool.sync`).
    this.tool.sync();
    const state = this.getState();
    // News runs out by itself: redraw the hint bar when what it shows changes (then a standing explanation is back).
    const message = this.board.current(this.scene.time.now, this.newsAllowed());
    const expired = message !== this.lastMessage;
    this.lastMessage = message;
    // Something was unlocked: a friendly message (and the star on the shop button, which `refresh` redraws).
    const news = this.tool.takeAnnouncements();
    if (news.length > 0) {
      this.board.announce(newItemsText(news), NEWS_MS);
      this.lastMessage = undefined;
    }
    // The numbers pop when they change; cards that can (not) be paid for change with them.
    const stockChanged = this.stock.update(state.inventory);
    if (expired || news.length > 0 || this.seenVersion !== this.tool.version || (stockChanged && this.tool.shopOpen)) {
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
      if (!this.shop.isOpen) {
        for (const [id, button] of this.toolButtons) {
          spots[`tool-${id}`] = { x: button.x, y: button.y, enabled: true, font: button.captionFont, ...(id === 'shop' ? { badge: this.tool.shopHasNews } : {}) };
        }
      } else {
        delete spots['zoom-in'];
        delete spots['zoom-out'];
      }
      if (this.menuButton.visible) {
        spots['menu'] = { x: this.menuButton.x, y: this.menuButton.y, enabled: true, w: this.menuRect.width, h: this.menuRect.height };
      }
      for (const [name, spot] of Object.entries(this.shop.spots(this.tool.item))) {
        spots[name] = { x: spot.x, y: spot.y, enabled: true, w: spot.w, h: spot.h, ...(spot.state !== undefined ? { state: spot.state, dim: spot.state !== 'ok' } : {}), ...(spot.fresh !== undefined ? { fresh: spot.fresh } : {}), ...(spot.active !== undefined ? { active: spot.active } : {}), ...(spot.font !== undefined ? { font: spot.font } : {}), ...(spot.textH !== undefined ? { textH: spot.textH } : {}) };
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

  /** The shop for the test marker: `closed`, or `<tab>:<page>/<pages>`. */
  get shownShopState(): string {
    return this.shownShop;
  }

  /** The sentence on a tapped locked card, for tests. */
  get shownTip(): string {
    return this.shop.shownTip;
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
