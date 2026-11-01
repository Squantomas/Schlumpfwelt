import tutorialJson from './tutorial.json';

/**
 * The guided start (M8) from `tutorial.json`: the steps in their order, without code.
 *
 * - `steps`: the order of the steps. Every `id` has its goal in `src/ui/tutorial.ts` (`resident`: open the card of a
 *   resident; `shop`: open the shop; `deco`: set any decoration; `coins`: see the market earn coins; `house`: build any
 *   house; `path`: every house has a path; `praise`: a last "Super!", gone with the next tap). `item` is the shop item
 *   the hand shows (any item of the same kind counts). A step can be left out or moved; its sentence is
 *   `tutorial.<id>` in `texts.de.json`.
 * - `searchRadius`: how far (in tiles) around the first house the hand looks for a free place.
 * - `pulseMs`: one beat of the soft glow around the place the hand points at.
 */
export const TUTORIAL_STEP_IDS = ['resident', 'shop', 'deco', 'coins', 'house', 'path', 'praise'] as const;

export type TutorialStepId = (typeof TUTORIAL_STEP_IDS)[number];

export interface TutorialStepDef {
  readonly id: TutorialStepId;
  readonly item?: string;
}

export interface TutorialRules {
  readonly steps: readonly TutorialStepDef[];
  readonly searchRadius: number;
  readonly pulseMs: number;
}

function isStepId(id: string): id is TutorialStepId {
  return (TUTORIAL_STEP_IDS as readonly string[]).includes(id);
}

export const TUTORIAL_RULES: TutorialRules = {
  ...tutorialJson,
  steps: tutorialJson.steps.map((step) => {
    if (!isStepId(step.id)) {
      throw new Error(`tutorial.json: unknown step ${step.id}`);
    }
    return { ...step, id: step.id };
  }),
};
