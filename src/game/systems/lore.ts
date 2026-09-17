/**
 * The survivor's logs.
 *
 * Six fragments, found in dungeon chests, that explain where the antenna came
 * from and why the Vault is sealed. They are the only part of the game that
 * tells the story rather than gating it — deliberately optional, and the reason
 * a chest that holds "just a log" is still worth opening.
 *
 * Entries are revealed in order regardless of which chest they came from: out of
 * order they would read as noise, and the player has no way to sort them.
 */
import type { GameState } from '../core/types';

export const LOG_ENTRIES: string[] = [
  'DAY 3 — The lander is scrap. I salvaged what I could and walked inland. Whoever was here before me built well, and left in a hurry.',
  'DAY 11 — Found a shaft under the ridge, braced with steel we do not make any more. It goes down further than my lamp reaches.',
  'DAY 24 — The second level is not a mine. The walls are cut square. Something down here kept the lights on long after the people stopped.',
  'DAY 40 — The machines in the deep still answer when you knock. One of them answered back.',
  'DAY 52 — They sealed the Vault from the inside and left the key with the thing they were afraid of. I understand the logic. I do not like it.',
  'DAY 58 — If you are reading this, the antenna on the ridge still stands. It needs a core. The core is down there. So am I, by now.',
];

/**
 * Reveal the next unread entry.
 *
 * Returns null once every entry has been read, so a seventh log is a duplicate
 * rather than an empty message box.
 */
export function readNextLog(state: GameState): string | null {
  const index = state.progress.logsRead;
  if (index >= LOG_ENTRIES.length) return null;
  state.progress.logsRead = index + 1;
  return LOG_ENTRIES[index];
}
