import { describe, expect, it } from 'vitest';
import { FixedStepClock, TICK_MS } from '../../src/sim/clock';
import { Simulation } from '../../src/sim/simulation';
import { createInitialState } from '../../src/sim/state';

describe('Simulation', () => {
  it('zählt pro vergangener Tick-Dauer einen Tick', () => {
    const sim = new Simulation();
    expect(sim.state.tick).toBe(0);
    sim.update(100);
    expect(sim.state.tick).toBe(1);
    sim.update(250);
    expect(sim.state.tick).toBe(3);
  });

  it('gibt das Interpolations-Alpha der Uhr zurück', () => {
    const sim = new Simulation();
    expect(sim.update(30)).toBeCloseTo(0.3);
    expect(sim.update(100)).toBeCloseTo(0.3);
    expect(sim.state.tick).toBe(1);
  });

  it('wendet Befehle erst beim nächsten Tick an', () => {
    const sim = new Simulation();
    sim.send({ type: 'setPaused', paused: true });
    expect(sim.state.paused).toBe(false);
    sim.update(50);
    expect(sim.state.paused).toBe(false);
    sim.update(50);
    expect(sim.state.paused).toBe(true);
  });

  it('wendet Befehle in der gesendeten Reihenfolge an', () => {
    const sim = new Simulation();
    sim.send({ type: 'setPaused', paused: true });
    sim.send({ type: 'setPaused', paused: false });
    sim.update(TICK_MS);
    expect(sim.state.paused).toBe(false);
    expect(sim.state.tick).toBe(1);
  });

  it('wendet Befehle schon im ersten von mehreren Ticks eines Frames an', () => {
    const sim = new Simulation();
    sim.send({ type: 'setPaused', paused: true });
    sim.update(TICK_MS * 2);
    expect(sim.state.tick).toBe(0);
    expect(sim.state.paused).toBe(true);
  });

  it('wendet jeden Befehl nur einmal an', () => {
    const sim = new Simulation();
    sim.send({ type: 'setPaused', paused: true });
    sim.update(TICK_MS);
    sim.send({ type: 'setPaused', paused: false });
    sim.update(TICK_MS);
    sim.update(TICK_MS);
    expect(sim.state.paused).toBe(false);
    expect(sim.state.tick).toBe(2);
  });

  it('hält die Zeit an, solange pausiert ist', () => {
    const sim = new Simulation();
    sim.update(200);
    sim.send({ type: 'setPaused', paused: true });
    expect(sim.update(130)).toBe(0);
    sim.update(1000);
    expect(sim.state.tick).toBe(2);
    expect(sim.state.paused).toBe(true);

    sim.send({ type: 'setPaused', paused: false });
    sim.update(TICK_MS);
    expect(sim.state.tick).toBe(3);
  });

  it('übernimmt einen vorgegebenen Zustand und eine eigene Uhr', () => {
    const sim = new Simulation({ ...createInitialState(), tick: 41 }, new FixedStepClock({ ticksPerSecond: 1 }));
    expect(sim.tickMs).toBe(1000);
    sim.update(999);
    expect(sim.state.tick).toBe(41);
    sim.update(1);
    expect(sim.state.tick).toBe(42);
  });

  it('kopiert den Startzustand, damit ihn niemand von außen ändert', () => {
    const initial = { ...createInitialState(), tick: 5 };
    const sim = new Simulation(initial);
    initial.tick = 1000;
    initial.paused = true;
    initial.world.tiles[0] = 'rock';
    expect(sim.state.tick).toBe(5);
    expect(sim.state.paused).toBe(false);
    expect(sim.state.world.tiles[0]).toBe('water');
  });

  it('meldet die Tick-Dauer der Uhr', () => {
    expect(new Simulation().tickMs).toBe(TICK_MS);
  });

  it('ist deterministisch: gleiche Eingaben ergeben gleichen Zustand', () => {
    const run = (): unknown => {
      const sim = new Simulation();
      const frames = [16, 17, 16, 33, 8, 120, 16, 16];
      frames.forEach((frame, index) => {
        if (index === 3) sim.send({ type: 'setPaused', paused: true });
        if (index === 6) sim.send({ type: 'setPaused', paused: false });
        sim.update(frame);
      });
      return sim.state;
    };
    expect(run()).toEqual(run());
  });
});
