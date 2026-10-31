import { MAX_AMOUNT } from '../../src/data/goods';
import type { Command } from '../../src/sim/commands';
import { Simulation } from '../../src/sim/simulation';
import type { SimState } from '../../src/sim/state';
import { fillTerrain, grassState, run, setStore } from './helpers';

/** Rows of paths, one every {@link ROW_STEP} tiles; buildings stand in two lines along each row. */
const FIRST_ROW = 5;
const ROW_STEP = 6;
const SIZE = 48;
const EDGE = 3;

/**
 * A big test village on a 48×48 island (grass inside a water border of 3 tiles):
 * rows of paths with 2×2 buildings in a line above and below each row. A third
 * of the residents work: in berry gardens and bakeries along the rows and at the
 * markets at the ends of the rows (one market for every eight workplaces); the
 * others are invited (they come by boat). There are just enough houses for all
 * of them. Everything is paid from a full store. Returns the simulation once
 * every invitation is sent (boats may still be on their way).
 */
export function crowdedVillage(residents: number): Simulation {
  const state: SimState = grassState(SIZE);
  fillTerrain(state, 0, 0, SIZE, EDGE, 'water');
  fillTerrain(state, 0, SIZE - EDGE, SIZE, EDGE, 'water');
  fillTerrain(state, 0, 0, EDGE, SIZE, 'water');
  fillTerrain(state, SIZE - EDGE, 0, EDGE, SIZE, 'water');
  const full: Record<string, number> = { coins: MAX_AMOUNT, wood: MAX_AMOUNT, stone: MAX_AMOUNT, berries: 0, furniture: 0, cake: 0 };
  setStore(state, full);
  const workers = Math.max(1, Math.round(residents / 3));
  const markets = Math.max(1, Math.round(workers / 8));
  let producers = workers - markets;
  let houses = Math.ceil(residents / 2);
  const commands: Command[] = [];
  let row = FIRST_ROW;
  for (let line = 0; row + 3 < SIZE - EDGE; line += 1, row += ROW_STEP) {
    commands.push({ type: 'placePaths', tiles: Array.from({ length: 41 - EDGE }, (_, i) => ({ x: EDGE + i, y: row })) });
    if (line < markets) {
      commands.push({ type: 'placeBuilding', buildingType: 'market', x: 41, y: row + 1 });
    }
    for (let x = 4; x <= 38; x += 2) {
      for (const y of [row - 2, row + 1]) {
        if (producers > 0) {
          commands.push({ type: 'placeBuilding', buildingType: producers % 3 === 0 ? 'bakery' : 'berry-garden', x, y });
          producers -= 1;
        } else if (houses > 0) {
          commands.push({ type: 'placeBuilding', buildingType: 'house-red', x, y });
          houses -= 1;
        }
      }
    }
  }
  run(state, ...commands);
  setStore(state, full);
  const sim = new Simulation(state);
  while (sim.state.residents.length < residents) {
    sim.send({ type: 'inviteResident', typeId: 'invite' });
    sim.update(sim.tickMs);
  }
  return sim;
}
