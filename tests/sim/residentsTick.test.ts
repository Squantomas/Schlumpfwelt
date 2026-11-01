import { describe, expect, it } from 'vitest';
import { RESIDENT_RULES } from '../../src/data/residents';
import { MAX_RESIDENTS } from '../../src/sim/limits';
import { fromSaveData, saveToText } from '../../src/sim/saveData';
import { Simulation } from '../../src/sim/simulation';
import type { SimState } from '../../src/sim/state';
import { crowdedVillage } from './crowd';
import { fillTerrain } from './helpers';

/** Mean and the 95th percentile of `count` ticks (ms). */
function timeTicks(sim: Simulation, count: number): { mean: number; p95: number } {
  const times: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const start = performance.now();
    sim.update(sim.tickMs);
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  return { mean: times.reduce((sum, time) => sum + time, 0) / times.length, p95: times[Math.floor(times.length * 0.95)] ?? 0 };
}

/**
 * Was ein Tick mit vielen Bewohnern kostet (M6): Ein Tick läuft zehnmal pro Sekunde; mit 4-facher CPU-Drosselung
 * (ein langsames Tablet) muss ein ganzes Bild unter 33 ms bleiben. Die Grenzen hier sind großzügig (Testrechner
 * schwanken), gemessen wurden etwa 0,02 ms (30), 0,03 ms (100) und 0,07 ms (200 Bewohner) im Mittel.
 */
describe('Tick-Kosten der Bewohner', () => {
  for (const [count, meanLimit, p95Limit] of [
    [30, 1, 4],
    [100, 2, 6],
    [200, 3, 10],
  ] as const) {
    it(`${String(count)} Bewohner: im Mittel unter ${String(meanLimit)} ms, 95 % der Ticks unter ${String(p95Limit)} ms`, () => {
      const sim = crowdedVillage(count);
      expect(sim.state.residents).toHaveLength(count);
      // The boats land and everybody gets going first.
      for (let i = 0; i < 300; i += 1) {
        sim.update(sim.tickMs);
      }
      const { mean, p95 } = timeTicks(sim, 600);
      expect(mean).toBeLessThan(meanLimit);
      expect(p95).toBeLessThan(p95Limit);
      // Most of them are on their feet: walking, carrying, working or resting – nobody waits for a way.
      expect(sim.state.residents.filter((r) => r.doing === 'wait')).toHaveLength(0);
      expect(sim.state.boats).toHaveLength(0);
    });
  }
});

/**
 * Durch Wasser abgeschnitten (nur aus einer Datei möglich, das Spiel baut nie eine zweite Insel): Früher suchte jeder
 * abgeschnittene Bewohner alle 4 s per A* die ganze Landmasse ab (ein Tick mit 500 Bewohnern über 6 ms). Jetzt kennt
 * jede Kachel ihre Landmasse, der Weg wird ohne Suche abgelehnt, und wer abgeschnitten ist, wartet eine Minute.
 */
describe('Tick-Kosten bei abgeschnittenen Bewohnern', () => {
  it(`${String(MAX_RESIDENTS)} Bewohner jenseits einer Wasserrinne: im Mittel unter 1 ms, 95 % der Ticks unter 3 ms`, () => {
    const sim = crowdedVillage(200);
    for (let i = 0; i < 300; i += 1) {
      sim.update(sim.tickMs);
    }
    const played = structuredClone(sim.state) as SimState;
    const { width, height } = played.world;
    // A channel of water at x 43 cuts off the strip at x 44 (the markets stand at x 41 and 42).
    fillTerrain(played, 43, 3, 1, height - 6, 'water');
    const data = JSON.parse(saveToText(played)) as Record<string, unknown>;
    const saved = data['residents'] as Record<string, unknown>[];
    const template = saved[0] ?? {};
    let nextId = Number(data['nextResidentId']);
    while (saved.length < MAX_RESIDENTS) {
      saved.push({ ...template, id: nextId, name: `Gast ${String(nextId)}`, home: null, job: null });
      nextId += 1;
    }
    data['nextResidentId'] = nextId;
    saved.forEach((resident, i) => {
      resident['at'] = (3 + (i % (height - 6))) * width + 44;
      resident['route'] = [];
      resident['step'] = 0;
      resident['doing'] = 'stay';
      resident['timer'] = 1;
    });
    const result = fromSaveData(data);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const loaded = new Simulation(result.state);
    expect(loaded.state.residents).toHaveLength(MAX_RESIDENTS);
    for (let i = 0; i < 50; i += 1) {
      loaded.update(loaded.tickMs);
    }
    const { mean, p95 } = timeTicks(loaded, 1200);
    expect(mean).toBeLessThan(1);
    expect(p95).toBeLessThan(3);
    // Nobody on the strip can reach anything: all of them wait (for a minute at a time), nobody hangs or walks into the water.
    const waiting = loaded.state.residents.filter((r) => r.doing === 'wait');
    expect(waiting).toHaveLength(MAX_RESIDENTS);
    expect(waiting.every((r) => r.timer <= RESIDENT_RULES.routine.cutOffTicks)).toBe(true);
    expect(loaded.state.residents.every((r) => r.at % width === 44)).toBe(true);
  });
});
