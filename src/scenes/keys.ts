/** Scene keys – one place, so scenes can start each other without typos. */
export const SCENES = {
  boot: 'boot',
  island: 'island',
} as const;

export type SceneKey = (typeof SCENES)[keyof typeof SCENES];
