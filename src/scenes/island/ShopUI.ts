import Phaser from 'phaser';
import { SHOP_CATEGORIES, shopItems, type ShopCategory } from '../../data/buildings';
import { t } from '../../data/texts';
import type { Rect } from '../../ui/cameraMath';
import { createLabel, setLabelSize } from '../../ui/label';
import { RoundButton } from '../../ui/RoundButton';
import { progressText, shopCards, unlockIcons, unlockSentenceText, type ShopCard, type ShopView } from '../../ui/shopModel';
import { SHOP_ARROW, shopCellRects, shopPages, type ShopLayout } from '../../ui/shopLayout';
import { SquareButton } from '../../ui/SquareButton';
import { COLORS, clamp } from '../../ui/style';
import { drawCategoryIcon, drawPadlock, drawStar } from '../../ui/toolIcons';
import { buildingTextureKey } from './buildingTextures';
import { CostRow } from './CostRow';
import { goodTextureKey } from './goodTextures';

/** The foot of a card: what it costs, or – on a locked card – what the village still has to build or earn. */
class CardFooter extends Phaser.GameObjects.Container {
  private readonly cost: CostRow;
  /** The pictures of the condition (a building; for money the market and a coin: "earn it at the market"). */
  private readonly icons: Phaser.GameObjects.Image[];
  private readonly progress: Phaser.GameObjects.Text;
  private footerH = 1;
  private footerW = 1;
  private locked = false;
  private shownIcons = 0;

  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0);
    this.cost = new CostRow(scene);
    this.icons = [0, 1].map(() => scene.add.image(0, 0, goodTextureKey('coins')).setVisible(false));
    this.progress = createLabel(scene, '', 14).setVisible(false);
    this.add([this.cost, ...this.icons, this.progress]);
    scene.add.existing(this);
  }

  layoutTo(width: number, height: number): this {
    this.footerH = height;
    this.footerW = width;
    this.cost.layoutTo(width, height);
    this.placeLock();
    return this;
  }

  showCost(card: ShopCard): void {
    this.locked = false;
    this.cost.setVisible(true).setCost(card.cost, card.missing);
    for (const icon of this.icons) {
      icon.setVisible(false);
    }
    this.progress.setVisible(false);
  }

  /** The requirement as pictures and "0/1" (a lock sits on the picture of the card). */
  showLock(card: ShopCard): void {
    const lock = card.lock;
    if (!lock) {
      return;
    }
    this.locked = true;
    this.cost.setVisible(false);
    const pictures = unlockIcons(lock.unlock);
    this.shownIcons = pictures.length;
    this.icons.forEach((icon, index) => {
      const what = pictures[index];
      icon.setVisible(what !== undefined);
      if (what) {
        icon.setTexture(what.kind === 'coins' ? goodTextureKey('coins') : buildingTextureKey(what.id));
      }
    });
    this.progress.setText(progressText(lock.progress)).setVisible(true);
    this.placeLock();
  }

  /** Pictures and number in one row, as big as the foot allows; the pictures give way first, the number stays at 13 px or more. */
  private placeLock(): void {
    if (!this.locked) {
      return;
    }
    const fontSize = clamp(this.footerH * 0.8, 13, 17);
    setLabelSize(this.progress, fontSize);
    const gap = 3;
    let size = Math.min(this.footerH * 1.05, 30);
    const shownIcons = this.icons.slice(0, this.shownIcons);
    const widthOf = (icon: Phaser.GameObjects.Image, edge: number): number => icon.width * Math.min(edge / icon.width, edge / icon.height);
    const total = (): number => shownIcons.reduce((sum, icon) => sum + widthOf(icon, size) + gap, 0) + this.progress.width;
    while (total() > this.footerW - 2 && size > 14) {
      size -= 1;
    }
    let left = -total() / 2;
    for (const icon of shownIcons) {
      const scale = Math.min(size / icon.width, size / icon.height);
      icon.setScale(scale).setPosition(left + (icon.width * scale) / 2, 0);
      left += icon.width * scale + gap;
    }
    this.progress.setPosition(left + this.progress.width / 2, 0);
  }
}

/** One card of the grid: the button plus the things drawn over it (lock, star). */
interface Card {
  readonly typeId: string;
  readonly button: SquareButton;
  readonly footer: CardFooter;
  readonly padlock: Phaser.GameObjects.Graphics;
  readonly star: Phaser.GameObjects.Graphics;
}

export interface ShopUiHandlers {
  /** A control was touched (the world ignores taps for a moment). */
  readonly touched: (eventTime: number) => void;
  readonly onTab: (category: ShopCategory) => void;
  readonly onClose: () => void;
  readonly onPick: (typeId: string) => void;
  readonly onPage: (step: number) => void;
}

export interface ShopSpot {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  /** For cards: the state ('ok', 'dear', 'locked'), the star ("new"), and whether the card is on the page now. */
  readonly state?: string;
  readonly fresh?: boolean;
  readonly active?: boolean;
  /** Tabs: the size of the word under the picture (0: only the picture). */
  readonly font?: number;
}

/**
 * The shop: a panel over the island with four big tabs (houses, decoration,
 * buildings, island), a big ✕ and a grid of cards. Every card shows a picture,
 * the name and the cost – too expensive cards are greyed but can be chosen,
 * locked cards show a lock and what is still missing. It draws what
 * {@link shopCards} says and where {@link shopLayout} puts it, and reports
 * taps; it never changes the simulation. Lives in the UI layer, CSS pixels.
 */
export class ShopUI {
  private readonly panel: Phaser.GameObjects.Graphics;
  private readonly tabs = new Map<ShopCategory, SquareButton>();
  private readonly cards = new Map<string, Card>();
  private readonly closeButton: RoundButton;
  private readonly prevButton: RoundButton;
  private readonly nextButton: RoundButton;
  private readonly tipPanel: Phaser.GameObjects.Graphics;
  private readonly tipLabel: Phaser.GameObjects.Text;
  private readonly tabStars = new Map<ShopCategory, Phaser.GameObjects.Graphics>();
  private layoutData: ShopLayout | undefined;
  /** The sentence of the locked card that was tapped last; it stays until something else is tapped. */
  private tip = '';
  private activeTab: ShopCategory = SHOP_CATEGORIES[0];
  /** What is on the page right now (cards with their rectangles). */
  private shown: { cards: { card: ShopCard; rect: Rect | undefined }[]; page: number; pages: number } = { cards: [], page: 0, pages: 1 };

  constructor(
    scene: Phaser.Scene,
    uiLayer: Phaser.GameObjects.Layer,
    private readonly handlers: ShopUiHandlers,
  ) {
    this.panel = scene.add.graphics().setVisible(false);
    uiLayer.add(this.panel);

    for (const category of SHOP_CATEGORIES) {
      const tab = new SquareButton(scene, {
        label: t(`shop.${category}`),
        minCaptionFont: 12,
        content: scene.add.graphics(),
        fitContent: (content, width, height) => {
          drawCategoryIcon(content as Phaser.GameObjects.Graphics, category, Math.min(width, height));
        },
        onTap: (time) => {
          handlers.touched(time);
          handlers.onTab(category);
        },
      });
      const star = scene.add.graphics().setVisible(false);
      drawStar(star, 11);
      tab.add(star);
      tab.setVisible(false);
      this.tabs.set(category, tab);
      this.tabStars.set(category, star);
      uiLayer.add(tab);
    }

    for (const category of SHOP_CATEGORIES) {
      for (const type of shopItems(category)) {
        const footer = new CardFooter(scene);
        const button = new SquareButton(scene, {
          label: t(type.nameKey),
          footer,
          content: scene.add.image(0, 0, buildingTextureKey(type.id)),
          fitContent: (content, width, height) => {
            const picture = content as Phaser.GameObjects.Image;
            picture.setScale(Math.min(width / picture.width, height / picture.height));
          },
          onTap: (time) => {
            handlers.touched(time);
            this.onCardTap(type.id);
          },
        });
        const padlock = scene.add.graphics();
        const star = scene.add.graphics();
        drawStar(star, 12);
        button.add([padlock, star]);
        button.setVisible(false);
        this.cards.set(type.id, { typeId: type.id, button, footer, padlock, star });
        uiLayer.add(button);
      }
    }

    this.closeButton = new RoundButton(scene, 0, 0, {
      radius: 32,
      icon: 'cross',
      variant: 'cancel',
      onTap: (time) => {
        handlers.touched(time);
        handlers.onClose();
      },
    });
    const pager = (icon: 'left' | 'right', step: number): RoundButton =>
      new RoundButton(scene, 0, 0, {
        radius: SHOP_ARROW / 2,
        icon,
        onTap: (time) => {
          handlers.touched(time);
          handlers.onPage(step);
        },
      });
    this.prevButton = pager('left', -1);
    this.nextButton = pager('right', 1);
    this.tipPanel = scene.add.graphics().setVisible(false);
    this.tipLabel = createLabel(scene, '', 18).setVisible(false);
    for (const object of [this.closeButton, this.prevButton, this.nextButton]) {
      object.setVisible(false);
    }
    uiLayer.add([this.closeButton, this.prevButton, this.nextButton, this.tipPanel, this.tipLabel]);
  }

  /** The area of the panel (CSS px), or an empty rectangle when the shop is closed. */
  get rect(): Rect {
    return this.layoutData?.rect ?? { x: 0, y: 0, width: 0, height: 0 };
  }

  get isOpen(): boolean {
    return this.layoutData !== undefined;
  }

  /**
   * Puts everything where `layout` says (`undefined` closes the shop) and shows
   * the page of the tab. `fresh` says which cards carry a star ("new").
   */
  show(
    layout: ShopLayout | undefined,
    view: ShopView,
    tab: ShopCategory,
    page: number,
    fresh: (typeId: string) => boolean,
    chosen: string | undefined,
  ): void {
    this.layoutData = layout;
    this.activeTab = tab;
    const visible = layout !== undefined;
    this.panel.setVisible(visible);
    for (const button of this.tabs.values()) {
      button.setVisible(visible);
    }
    this.closeButton.setVisible(visible);
    for (const card of this.cards.values()) {
      card.button.setVisible(false);
    }
    this.prevButton.setVisible(false);
    this.nextButton.setVisible(false);
    if (!layout) {
      this.tip = '';
      this.tipPanel.setVisible(false);
      this.tipLabel.setVisible(false);
      return;
    }

    this.panel.clear();
    this.panel.fillStyle(COLORS.panel, 0.96).fillRoundedRect(layout.rect.x, layout.rect.y, layout.rect.width, layout.rect.height, 22);
    this.panel.lineStyle(3, COLORS.toolActiveRim, 0.75).strokeRoundedRect(layout.rect.x, layout.rect.y, layout.rect.width, layout.rect.height, 22);

    const placeTabs = (): void => {
      SHOP_CATEGORIES.forEach((category, index) => {
        const rect = layout.tabs[index];
        const button = this.tabs.get(category);
        if (rect && button) {
          button.layoutTo(rect.width, rect.height).setPosition(rect.x + rect.width / 2, rect.y + rect.height / 2).setHighlighted(category === tab);
          const star = this.tabStars.get(category);
          const news = shopItems(category).some((type) => fresh(type.id));
          star?.setVisible(news).setPosition(rect.width / 2 - 8, -rect.height / 2 + 8);
        }
      });
    };
    for (const button of this.tabs.values()) {
      button.setCaptionOff(false);
    }
    placeTabs();
    // Where one tab has no room for its word (at 12 px or more), none shows it: the row looks alike, only pictures.
    if ([...this.tabs.values()].some((button) => button.captionFont === 0)) {
      for (const button of this.tabs.values()) {
        button.setCaptionOff(true);
      }
      placeTabs();
    }
    this.closeButton.setRadius(layout.close.width / 2).setPosition(layout.close.x + layout.close.width / 2, layout.close.y + layout.close.height / 2);

    const cards = shopCards(view, tab);
    const pages = shopPages(layout, cards.length);
    const current = clamp(page, 0, pages - 1);
    const onPage = cards.slice(current * layout.perPage, (current + 1) * layout.perPage);
    const rects = shopCellRects(layout, onPage.length);
    onPage.forEach((card, index) => {
      const rect = rects[index];
      const entry = this.cards.get(card.typeId);
      if (rect && entry) {
        this.placeCard(entry, card, rect, fresh(card.typeId), chosen === card.typeId);
      }
    });
    if (layout.paged && layout.prev && layout.next) {
      this.prevButton.setVisible(true).setPosition(layout.prev.x + layout.prev.width / 2, layout.prev.y + layout.prev.height / 2).setDimmed(current === 0);
      this.nextButton.setVisible(true).setPosition(layout.next.x + layout.next.width / 2, layout.next.y + layout.next.height / 2).setDimmed(current >= pages - 1);
    }
    this.shown = { cards: onPage.map((card, index) => ({ card, rect: rects[index] })), page: current, pages };
    this.drawLine();
  }

  get pageInfo(): { page: number; pages: number } {
    return { page: this.shown.page, pages: this.shown.pages };
  }

  private placeCard(entry: Card, card: ShopCard, rect: Rect, fresh: boolean, chosen: boolean): void {
    const locked = card.state === 'locked';
    entry.button
      .setVisible(true)
      .layoutTo(rect.width, rect.height)
      .setPosition(rect.x + rect.width / 2, rect.y + rect.height / 2)
      .setHighlighted(chosen)
      .setDimmed(card.state !== 'ok');
    if (locked) {
      entry.footer.showLock(card);
    } else {
      entry.footer.showCost(card);
    }
    // The lock sits on the picture; the star ("new") in the corner.
    entry.padlock.setVisible(locked);
    if (locked) {
      const size = Math.min(rect.width * 0.4, rect.height * 0.36);
      drawPadlock(entry.padlock, size);
      entry.padlock.setPosition(0, -rect.height * 0.2);
    }
    entry.star.setVisible(fresh && !locked).setPosition(rect.width / 2 - 10, -rect.height / 2 + 10);
  }

  private onCardTap(typeId: string): void {
    const card = this.shown.cards.find((entry) => entry.card.typeId === typeId);
    if (card?.card.state === 'locked' && card.card.lock) {
      // A locked card: say what to do, in the fixed line at the bottom of the panel (it does not choose anything).
      this.tip = unlockSentenceText(card.card.lock.unlock);
      this.drawLine();
      return;
    }
    this.handlers.onPick(typeId);
  }

  /** Empties the line at the bottom: something else was tapped. */
  clearTip(): void {
    if (this.tip !== '') {
      this.tip = '';
      this.drawLine();
    }
  }

  /** The fixed line at the bottom of the panel: a slot that holds the sentence of a locked card, as big as it fits. */
  private drawLine(): void {
    const layout = this.layoutData;
    this.tipPanel.clear().setVisible(layout !== undefined);
    this.tipLabel.setVisible(layout !== undefined && this.tip !== '');
    if (!layout) {
      return;
    }
    const { x, y, width, height } = layout.line;
    const filled = this.tip !== '';
    this.tipPanel.fillStyle(filled ? COLORS.cardFace : COLORS.black, filled ? 0.98 : 0.12).fillRoundedRect(x, y, width, height, Math.min(16, height / 2));
    if (filled) {
      this.tipPanel.lineStyle(3, COLORS.markerRim, 1).strokeRoundedRect(x, y, width, height, Math.min(16, height / 2));
      // As big as fits (two lines at most in the slot), never under 11 px.
      const maxW = width - 20;
      let size = clamp(height * 0.42, 12, 20);
      this.tipLabel.setWordWrapWidth(maxW).setText(this.tip);
      setLabelSize(this.tipLabel, size, maxW);
      while (this.tipLabel.height > height - 6 && size > 11) {
        size -= 1;
        setLabelSize(this.tipLabel, size, maxW);
      }
      this.tipLabel.setPosition(x + width / 2, y + height / 2);
    }
  }

  /** The sentence that is shown in the line now (for tests). */
  get shownTip(): string {
    return this.tip;
  }

  /** Where the controls are (CSS px), for the test marker. */
  spots(chosen: string | undefined): Record<string, ShopSpot> {
    const spots: Record<string, ShopSpot> = {};
    const layout = this.layoutData;
    if (!layout) {
      return spots;
    }
    const center = (rect: Rect): { x: number; y: number; w: number; h: number } => ({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, w: rect.width, h: rect.height });
    spots['shop'] = center(layout.rect);
    spots['shop-line'] = center(layout.line);
    SHOP_CATEGORIES.forEach((category, index) => {
      const rect = layout.tabs[index];
      if (rect) {
        spots[`tab-${category}`] = { ...center(rect), active: category === this.activeTab, font: this.tabs.get(category)?.captionFont ?? 0 };
      }
    });
    spots['shop-close'] = center(layout.close);
    for (const { card, rect } of this.shown.cards) {
      if (rect) {
        spots[`item-${card.typeId}`] = { ...center(rect), state: card.state, fresh: this.cards.get(card.typeId)?.star.visible === true, active: chosen === card.typeId };
      }
    }
    if (layout.paged && layout.prev && layout.next) {
      spots['page-prev'] = center(layout.prev);
      spots['page-next'] = center(layout.next);
    }
    return spots;
  }
}
