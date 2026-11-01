import { buildingType } from '../data/buildings';
import { HAT_IDS } from '../data/residents';
import { t, type TextKey } from '../data/texts';
import { moodOf, type Mood, type MoodFactors, type MoodView } from '../sim/mood';
import type { DeepReadonly } from '../sim/readonly';
import { activityOf, type Resident } from '../sim/residents';
import type { SimState } from '../sim/state';
import { itemName } from './costText';

/**
 * What the card of a resident says (M6), without Phaser: the name, the job
 * (the job of the building they work at, "Holzfäller"), the colour of the hat,
 * the house they live in and – in one short sentence – what they are doing
 * right now. Since M7 also how they feel and why ("Fröhlich – Deko am Haus.")
 * and one tip that makes them happier. Pure and tested; the card only draws it.
 */

export type ResidentInfoView = MoodView & DeepReadonly<Pick<SimState, 'residents' | 'buildings'>>;

export interface ResidentInfo {
  readonly id: number;
  readonly name: string;
  /** Index of the hat colour (the picture on the card). */
  readonly hat: number;
  /** The lines of the card: job, hat, home. */
  readonly lines: readonly string[];
  /** What the resident is doing now ("Geht zur Arbeit."). */
  readonly activity: string;
  /** How they feel (M7) – the picture on the card – and in words, with the reason ("Fröhlich – Deko am Haus."). */
  readonly mood: Mood;
  readonly moodLine: string;
  /** What would make them happier, or a word of praise when they are happy already. */
  readonly tip: string;
  /** Can they move house now? (Not while they are still on the boat.) */
  readonly canMove: boolean;
}

/** Why a resident feels the way they do, in a few words: what hurts first (hunger, the way, no home), else the decoration. */
export function moodReason(factors: MoodFactors): TextKey {
  if (factors.hungry) {
    return factors.far ? 'reason.hungryFar' : factors.homeless ? 'reason.hungryHomeless' : 'reason.hungry';
  }
  if (factors.far) {
    return factors.deco ? 'reason.decoFar' : 'reason.far';
  }
  if (factors.homeless) {
    return 'reason.homeless';
  }
  return factors.deco ? 'reason.deco' : 'reason.noDeco';
}

/** The one tip that helps this resident most (food, a nearer house, a house at all, decoration) – or praise when happy. */
export function moodTip(factors: MoodFactors): TextKey {
  if (factors.mood === 'happy') {
    return 'tip.happy';
  }
  if (factors.hungry) {
    return 'tip.food';
  }
  if (factors.far) {
    return 'tip.near';
  }
  return factors.homeless ? 'tip.house' : 'tip.deco';
}

/** The mood in words with its reason: "Traurig – hat Hunger." */
export function moodLine(factors: MoodFactors): string {
  return t('resident.mood', { mood: t(`mood.${factors.mood}`), reason: t(moodReason(factors)) });
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
  const factors = moodOf(view, resident);
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
    mood: factors.mood,
    moodLine: moodLine(factors),
    tip: t(moodTip(factors)),
    canMove: resident.doing !== 'boat',
  };
}

/**
 * The rows of the card, from top to bottom: tall – job, hat, home, what they do, mood, tip; compact (a phone held
 * sideways) – job, home, mood, tip (the hat is in the picture, what they do can be seen on the island). `note`
 * takes the place of the tip (the sentence after a tap on the dimmed "Umziehen": "Lumo steigt gleich aus.").
 */
export function cardRows(info: ResidentInfo, compact: boolean, note?: string): readonly string[] {
  const [job = '', hat = '', home = ''] = info.lines;
  const tip = note ?? info.tip;
  return compact ? [job, home, info.moodLine, tip] : [job, hat, home, info.activity, info.moodLine, tip];
}

/** The card in one sentence, for the hint bar when the card does not fit on the screen: "Lumo: Geht zur Arbeit." */
export function residentSentence(info: ResidentInfo): string {
  return t('resident.sentence', { name: info.name, activity: info.activity });
}
