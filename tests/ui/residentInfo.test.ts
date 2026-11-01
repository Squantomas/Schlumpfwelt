import { describe, expect, it } from 'vitest';
import { HAT_IDS } from '../../src/data/residents';
import { t } from '../../src/data/texts';
import type { Resident } from '../../src/sim/residents';
import { createInitialState } from '../../src/sim/state';
import type { MoodFactors } from '../../src/sim/mood';
import { activityText, hatColorText, jobText, moodLine, moodReason, moodTip, residentInfo, residentSentence } from '../../src/ui/residentInfo';
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

describe('Stimmung auf der Karte (M7)', () => {
  const factors = (changes: Partial<MoodFactors>): MoodFactors => ({ mood: 'normal', homeless: false, deco: false, far: false, near: false, hungry: false, ...changes });

  it('im Startdorf sind beide fröhlich: Deko am Haus, dazu ein Lob', () => {
    const state = createInitialState(1);
    for (const r of state.residents) {
      const info = residentInfo(state, r.id);
      expect(info?.mood).toBe('happy');
      expect(info?.moodLine).toBe('Fröhlich – Deko am Haus.');
      expect(info?.tip).toBe('Fröhlich geht die Arbeit schneller!');
      expect(info?.canMove).toBe(true);
    }
  });

  it('ohne Deko normal mit dem Tipp „Blumen am Haus machen fröhlich.“; mit Hunger traurig mit dem Tipp zum Essen', () => {
    const state = createInitialState(1);
    const cx = Math.floor(state.world.width / 2);
    const cy = Math.floor(state.world.height / 2);
    run(state, { type: 'demolish', x: cx - 4, y: cy - 1 }, { type: 'demolish', x: cx - 1, y: cy - 3 });
    const [first] = state.residents;
    if (!first) {
      throw new Error('fehlt');
    }
    expect(residentInfo(state, first.id)).toMatchObject({ mood: 'normal', moodLine: 'Normal – keine Deko am Haus.', tip: 'Tipp: Blumen am Haus machen fröhlich.' });
    first.hungry = true;
    expect(residentInfo(state, first.id)).toMatchObject({ mood: 'sad', moodLine: 'Traurig – hat Hunger.', tip: 'Tipp: Ein Beerengarten bringt Essen.' });
  });

  it('wer noch kein Zuhause hat, ist normal und bekommt den Tipp zum Haus; auf dem Boot kann niemand umziehen', () => {
    const state = grassState();
    state.residents = [resident(), resident({ id: 2, doing: 'boat' })];
    expect(residentInfo(state, 1)).toMatchObject({ mood: 'normal', moodLine: 'Normal – noch kein Zuhause.', tip: 'Tipp: Bau ein Haus mit Blumen daneben.', canMove: true });
    expect(residentInfo(state, 2)?.canMove).toBe(false);
  });

  it('der Grund nennt zuerst, was stört (Hunger, weiter Weg, kein Zuhause), sonst die Deko', () => {
    expect(moodReason(factors({ hungry: true, far: true }))).toBe('reason.hungryFar');
    expect(moodReason(factors({ hungry: true, homeless: true }))).toBe('reason.hungryHomeless');
    expect(moodReason(factors({ hungry: true, deco: true }))).toBe('reason.hungry');
    expect(moodReason(factors({ far: true, deco: true }))).toBe('reason.decoFar');
    expect(moodReason(factors({ far: true }))).toBe('reason.far');
    expect(moodReason(factors({ homeless: true }))).toBe('reason.homeless');
    expect(moodReason(factors({ deco: true, near: true }))).toBe('reason.deco');
    expect(moodReason(factors({}))).toBe('reason.noDeco');
  });

  it('der Tipp hilft dort, wo es hakt: Essen vor Weg vor Haus vor Deko; fröhlich gibt es ein Lob', () => {
    expect(moodTip(factors({ mood: 'happy', deco: true }))).toBe('tip.happy');
    expect(moodTip(factors({ mood: 'sad', hungry: true, far: true }))).toBe('tip.food');
    expect(moodTip(factors({ mood: 'sad', far: true }))).toBe('tip.near');
    expect(moodTip(factors({ homeless: true }))).toBe('tip.house');
    expect(moodTip(factors({}))).toBe('tip.deco');
    expect(moodLine(factors({ mood: 'sad', far: true }))).toBe('Traurig – weiter Weg zur Arbeit.');
  });

  it('jede Zeile bleibt kurz (höchstens 42 Zeichen) – sie passt auf die Karte eines Handys', () => {
    const all: MoodFactors[] = [];
    for (const mood of ['happy', 'normal', 'sad'] as const) {
      for (let bits = 0; bits < 16; bits += 1) {
        all.push(factors({ mood, homeless: (bits & 1) > 0, deco: (bits & 2) > 0, far: (bits & 4) > 0, hungry: (bits & 8) > 0 }));
      }
    }
    for (const f of all) {
      expect(moodLine(f).length).toBeLessThanOrEqual(42);
      expect(t(moodTip(f)).length).toBeLessThanOrEqual(42);
    }
  });
});
