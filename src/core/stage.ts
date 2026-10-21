export type Stage = 1 | 2 | 3 | 4;

export type StageInfo = {
  name: string;
  summary: string;
  /** Stages that write data need the user to confirm a dev or test database. */
  writesData: boolean;
};

export const STAGE_NUMBERS: readonly Stage[] = [1, 2, 3, 4];

export const STAGES: Readonly<Record<Stage, StageInfo>> = {
  1: {
    name: 'look only',
    summary: 'Reads what the app already shows. Safe against anything.',
    writesData: false,
  },
  2: {
    name: 'poke',
    summary: 'Sends odd input through the app and leaves junk data behind.',
    writesData: true,
  },
  3: {
    name: 'pressure',
    summary: 'Hammers login and signup to see whether anything pushes back.',
    writesData: true,
  },
  4: {
    name: 'flood',
    summary: 'Ramps up a crowd of users until something breaks.',
    writesData: true,
  },
};
