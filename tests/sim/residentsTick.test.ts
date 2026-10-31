import { describe, expect, it } from 'vitest';
import { crowdedVillage } from './crowd';

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
      const times: number[] = [];
      for (let i = 0; i < 600; i += 1) {
        const start = performance.now();
        sim.update(sim.tickMs);
        times.push(performance.now() - start);
      }
      times.sort((a, b) => a - b);
      const mean = times.reduce((sum, time) => sum + time, 0) / times.length;
      const p95 = times[Math.floor(times.length * 0.95)] ?? 0;
      expect(mean).toBeLessThan(meanLimit);
      expect(p95).toBeLessThan(p95Limit);
      // Most of them are on their feet: walking, carrying, working or resting – nobody waits for a way.
      expect(sim.state.residents.filter((r) => r.doing === 'wait')).toHaveLength(0);
      expect(sim.state.boats).toHaveLength(0);
    });
  }
});
