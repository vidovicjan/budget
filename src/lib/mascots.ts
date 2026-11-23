export type MascotId = 'bit' | 'otto' | 'sprout';

/**
 * wave: greetings and empty states. think: the month is still being worked out.
 * cheer: things went well. alert: over budget, or something needs attention.
 */
export type MascotPose = 'wave' | 'think' | 'cheer' | 'alert';

export interface MascotInfo {
  id: MascotId;
  name: string;
  kind: string;
  blurb: string;
  /** Panel colour behind the mascot, in both themes: the navy artwork needs a light background. */
  tint: string;
}

export const MASCOTS: MascotInfo[] = [
  { id: 'bit', name: 'Bit', kind: 'Robot', blurb: 'Precise, upbeat, a little nerdy', tint: '#E3E8F2' },
  { id: 'otto', name: 'Otto', kind: 'Octopus', blurb: 'Playful, busy, warm', tint: '#FBE3DC' },
  { id: 'sprout', name: 'Sprout', kind: 'Money plant', blurb: 'Patient, calm, hopeful', tint: '#EFE7D8' },
];

export const DEFAULT_MASCOT: MascotId = 'otto';

/** Falls back to the default when nothing (or something unknown) is stored. */
export const mascotInfo = (id: MascotId | undefined): MascotInfo =>
  MASCOTS.find((m) => m.id === id) ?? MASCOTS.find((m) => m.id === DEFAULT_MASCOT)!;
