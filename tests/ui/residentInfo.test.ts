import { describe, expect, it } from 'vitest';
import { HAT_IDS } from '../../src/data/residents';
import { t } from '../../src/data/texts';
import type { Resident } from '../../src/sim/residents';
import { createInitialState } from '../../src/sim/state';
import { activityText, hatColorText, jobText, residentInfo, residentSentence } from '../../src/ui/residentInfo';
import { grassState, run } from '../sim/helpers';

const resident = (changes: Partial<Resident> = {}): Resident => ({
  id: 1,
  name: 'Lumo',
  hat: 0,
  home: null,
  job: null,
  at: 0,
  route: [],
  step: 0,
  doing: 'stay',
  goal: 'visit',
  place: null,
  timer: 1,
  carrying: null,
  seen: 0,
  trips: 0,
  meal: 1800,
  hungry: false,
  ...changes,
});

describe('residentInfo', () => {
  it('zeigt im Startdorf Name, Beruf, Mütze und Zuhause der beiden Bewohner', () => {
    const state = createInitialState(1);
    expect(state.residents).toHaveLength(2);
    const jobs = new Set<string>();
    for (const r of state.residents) {
      const info = residentInfo(state, r.id);
      expect(info?.name).toBe(r.name);
      expect(info?.hat).toBe(r.hat);
      expect(info?.lines).toHaveLength(3);
      expect(info?.lines[1]).toBe(t('resident.hat', { color: hatColorText(r.hat) }));
      expect(info?.lines[2]).toBe(t('resident.home', { house: t('build.houseRed') }));
      jobs.add(info?.lines[0] ?? '');
    }
    expect(jobs).toEqual(new Set([t('resident.job', { job: t('job.gardener') }), t('resident.job', { job: t('job.trader') })]));
  });

  it('ohne Arbeit und ohne Haus: „noch keiner“ und „Sucht noch ein Zuhause.“', () => {
    const state = grassState();
    state.residents = [resident()];
    const info = residentInfo(state, 1);
    expect(info?.lines[0]).toBe(t('resident.job', { job: t('job.none') }));
    expect(info?.lines[2]).toBe(t('resident.homeless'));
    expect(jobText(state, resident({ job: 42 }))).toBe(t('job.none'));
  });

  it('der Beruf folgt dem Gebäude, an dem er arbeitet', () => {
    const state = grassState();
    run(state, { type: 'placeBuilding', buildingType: 'bakery', x: 4, y: 4 });
    const worker = state.residents.find((r) => r.job !== null);
    expect(worker && residentInfo(state, worker.id)?.lines[0]).toBe(t('resident.job', { job: t('job.baker') }));
  });

  it('nennt für jede Mütze ihre Farbe', () => {
    HAT_IDS.forEach((id, index) => {
      expect(hatColorText(index)).toBe(t(`hat.${id}` as Parameters<typeof t>[0]));
    });
    expect(hatColorText(999)).toBe(t('hat.red'));
  });

  it('sagt in einem Satz, was der Bewohner gerade tut – auch was er trägt', () => {
    expect(activityText(resident({ doing: 'boat' }))).toBe(t('activity.boat'));
    expect(activityText(resident({ doing: 'walk', goal: 'work', route: [1] }))).toBe(t('activity.toWork'));
    expect(activityText(resident({ doing: 'stay', goal: 'work' }))).toBe(t('activity.work'));
    expect(activityText(resident({ doing: 'walk', goal: 'market', carrying: 'wood', route: [1] }))).toBe(t('activity.carry', { good: 'Holz' }));
    expect(activityText(resident({ doing: 'stay', goal: 'home' }))).toBe(t('activity.rest'));
    expect(activityText(resident({ doing: 'wait' }))).toBe(t('activity.wait'));
  });

  it('gibt nichts zurück für einen unbekannten Bewohner und hat einen kurzen Satz für die Hinweisleiste', () => {
    const state = createInitialState(1);
    expect(residentInfo(state, 999)).toBeUndefined();
    const first = state.residents[0];
    const info = first ? residentInfo(state, first.id) : undefined;
    expect(info && residentSentence(info)).toBe(`${first?.name ?? ''}: ${info?.activity ?? ''}`);
  });
});
