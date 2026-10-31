import { ITEM_IDS, itemNames } from '../data/goods';
import { t } from '../data/texts';

/**
 * Texts for amounts of coins and goods: "3 Holz", "20 Taler und 3 Holz".
 * Names come from `texts.de.json` (singular for 1, plural otherwise).
 */

/** One amount as text, e.g. `amountText('stone', 2)` → "2 Steine". Unknown ids give the id itself. */
export function amountText(id: string, amount: number): string {
  const names = itemNames(id);
  if (!names) {
    return `${String(amount)} ${id}`;
  }
  return `${t('amount.format', { count: amount, name: t(amount === 1 ? names.one : names.many) })}`;
}

/** The name of an item for several units ("Holz", "Steine"); unknown ids give the id. */
export function itemName(id: string, amount = 2): string {
  const names = itemNames(id);
  return names ? t(amount === 1 ? names.one : names.many) : id;
}

/** Amounts as a list in the order of the store: "20 Taler", "20 Taler und 3 Holz", "1 Taler, 2 Holz und 3 Steine". */
export function listText(amounts: Readonly<Record<string, number>>): string {
  const parts = ITEM_IDS.filter((id) => (amounts[id] ?? 0) > 0).map((id) => amountText(id, amounts[id] ?? 0));
  const last = parts.pop();
  if (last === undefined) {
    return '';
  }
  return parts.length === 0 ? last : `${parts.join(', ')} ${t('list.and')} ${last}`;
}

/** The number of units in a list of amounts. */
export function totalUnits(amounts: Readonly<Record<string, number>>): number {
  return Object.values(amounts).reduce((sum, amount) => sum + amount, 0);
}
