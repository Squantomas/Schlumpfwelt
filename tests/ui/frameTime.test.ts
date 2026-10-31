import { describe, expect, it } from 'vitest';
import { MAX_FRAME_MS, TICK_MS } from '../../src/sim/clock';
import { Simulation } from '../../src/sim/simulation';
import { createInitialState } from '../../src/sim/state';
import { simulationDelta } from '../../src/ui/frameTime';

describe('simulationDelta', () => {
  it('nimmt die rohe Frame-Zeit, nicht die geglättete (die Abkühlzeit und das Glätten verfälschen sie)', () => {
    expect(simulationDelta(217, 16.7)).toBe(217);
    expect(simulationDelta(990, 115)).toBe(990);
  });

  it('fällt bei kaputten Werten auf die geglättete Zeit und dann auf 0 zurück', () => {
    expect(simulationDelta(Number.NaN, 40)).toBe(40);
    expect(simulationDelta(-5, 40)).toBe(40);
    expect(simulationDelta(Number.POSITIVE_INFINITY, Number.NaN)).toBe(0);
  });

  it('lässt allein die Uhr der Simulation kappen: ein Hänger von 990 ms bringt höchstens 250 ms Arbeit', () => {
    const sim = new Simulation(createInitialState(1));
    sim.update(simulationDelta(990, 115));
    expect(sim.state.tick).toBe(Math.floor(MAX_FRAME_MS / TICK_MS));
    // Zehn geglättete Frames à 99 ms hätten zusammen 990 ms nachgeholt – so nicht.
    const other = new Simulation(createInitialState(1));
    other.update(simulationDelta(990, 99));
    other.update(simulationDelta(0, 99));
    expect(other.state.tick).toBe(sim.state.tick);
  });

  it('lässt langsame Geräte in Echtzeit laufen (4 Bilder pro Sekunde mit 217 ms je Bild)', () => {
    const sim = new Simulation(createInitialState(1));
    for (let i = 0; i < 40; i += 1) {
      sim.update(simulationDelta(217, 16.7));
    }
    // 40 Frames × 217 ms = 8,7 s = 86 Ticks.
    expect(sim.state.tick).toBeGreaterThanOrEqual(85);
  });
});
