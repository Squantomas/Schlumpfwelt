import { buildingType } from '../data/buildings';
import { HAT_IDS } from '../data/residents';
import { t, type TextKey } from '../data/texts';
import type { DeepReadonly } from '../sim/readonly';
import { activityOf, type Resident } from '../sim/residents';
import type { SimState } from '../sim/state';
import { itemName } from './costText';

/**
 * What the card of a resident says (M6), without Phaser: the name, the job
 * (the job of the building they work at, "Holzfäller"), the colour of the hat,
 * the house they live in and – in one short sentence – what they are doing
 * right now. Pure and tested; the card only draws it.
 */

export type ResidentInfoView = DeepReadonly<Pick<SimState, 'residents' | 'buildings'>>;

export interface ResidentInfo {
  readonly id: number;
  readonly name: string;
  /** Index of the hat colour (the picture on the card). */
  readonly hat: number;
  /** The lines of the card: job, hat, home. */
  readonly lines: readonly string[];
  /** What the resident is doing now ("Geht zur Arbeit."). */
  readonly activity: string;
}

/** The text of a hat colour ("rot"); `hat.<id>` exists for every id (tested). */
export function hatColorText(hat: number): string {
  const id = HAT_IDS[hat] ?? HAT_IDS[0] ?? 'red';
  return t(`hat.${id}` as TextKey);
}

/** The job of a resident: the job of their workplace, or "noch keiner". */
export function jobText(view: ResidentInfoView, resident: DeepReadonly<Resident>): string {
  const building = resident.job === null ? undefined : view.buildings.find((b) => b.id === resident.job);
  const key = building ? buildingType(building.type)?.jobKey : undefined;
  return t(key ?? 'job.none');
}

/** One sentence about what the resident is doing now. */
export function activityText(resident: DeepReadonly<Resident>): string {
  const activity = activityOf(resident);
  return activity === 'carry' ? t('activity.carry', { good: itemName(resident.carrying ?? '') }) : t(`activity.${activity}`);
}

/** Everything the card shows about a resident, or `undefined` when there is no resident with this id. */
export function residentInfo(view: ResidentInfoView, residentId: number): ResidentInfo | undefined {
  const resident = view.residents.find((r) => r.id === residentId);
  if (!resident) {
    return undefined;
  }
  const home = resident.home === null ? undefined : view.buildings.find((b) => b.id === resident.home);
  const homeType = home ? buildingType(home.type) : undefined;
  return {
    id: resident.id,
    name: resident.name,
    hat: resident.hat,
    lines: [
      t('resident.job', { job: jobText(view, resident) }),
      t('resident.hat', { color: hatColorText(resident.hat) }),
      homeType ? t('resident.home', { house: t(homeType.nameKey) }) : t('resident.homeless'),
    ],
    activity: activityText(resident),
  };
}

/** The card in one sentence, for the hint bar when the card does not fit on the screen: "Lumo: Geht zur Arbeit." */
export function residentSentence(info: ResidentInfo): string {
  return t('resident.sentence', { name: info.name, activity: info.activity });
}
