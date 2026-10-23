/** Power-up items that float above the track and are collected by flying through them. */
export enum ItemKind {
  None = 0,
  /** Absorbs one crash into a wall, plasma or a moving block, then grants a short phase-through window. */
  Shield = 1,
  /** Pulls in energy orbs from neighbouring lanes for a while. */
  Magnet = 2,
  /** One extra jump in mid-air. */
  Wings = 3,
  /** Stored speed burst fired on demand. */
  Nitro = 4,
  /** Doubles points for a while. */
  Multiplier = 5,
  /** One extra life. */
  Life = 6,
}

export interface ItemInfo {
  name: string;
  short: string;
  description: string;
  color: string;
  /** Character used for this item in the track DSL (item sits on a standard tile). */
  dsl: string;
  /** Word accepted by the `:item` DSL directive. */
  word: string;
}

export const ITEM_INFO: Record<Exclude<ItemKind, ItemKind.None>, ItemInfo> = {
  [ItemKind.Shield]: { name: 'Shield', short: 'SHIELD', description: 'Survive one crash into a wall, plasma or a moving block. Falls still count.', color: '#38d6ff', dsl: 'S', word: 'shield' },
  [ItemKind.Magnet]: { name: 'Magnet', short: 'MAGNET', description: 'Pulls in energy orbs from two lanes away for 8 seconds.', color: '#ff5468', dsl: 'M', word: 'magnet' },
  [ItemKind.Wings]: { name: 'Wings', short: 'WINGS', description: 'Press jump again in mid-air for one extra jump.', color: '#f4f4ff', dsl: 'W', word: 'wings' },
  [ItemKind.Nitro]: { name: 'Nitro', short: 'NITRO', description: 'Stored burst of speed. Fire it with E (hold up to two).', color: '#ff9a2e', dsl: 'N', word: 'nitro' },
  [ItemKind.Multiplier]: { name: '2× Score', short: '2× SCORE', description: 'Every point counts double for 10 seconds.', color: '#ffd23f', dsl: '2', word: 'x2' },
  [ItemKind.Life]: { name: 'Extra Life', short: '+1 LIFE', description: 'One more try. Rare.', color: '#ff6fb5', dsl: 'H', word: 'life' },
};

export const ITEM_ORDER: ItemKind[] = [ItemKind.Shield, ItemKind.Wings, ItemKind.Nitro, ItemKind.Magnet, ItemKind.Multiplier, ItemKind.Life];

export const MAGNET_DURATION = 8;
export const MULTIPLIER_DURATION = 10;
/** Invulnerable phase-through window after a shield absorbs a hit. */
export const SHIELD_GHOST = 1.0;
export const NITRO_DURATION = 1.6;
export const MAX_NITRO = 2;
export const MAX_WINGS = 2;
/** Mid-air jump strength as a share of the ship's normal jump. */
export const AIR_JUMP_FACTOR = 0.9;
/** Lives can exceed the sector's starting lives by this much. */
export const EXTRA_LIVES_CAP = 2;

export function itemFromWord(word: string): ItemKind {
  const w = word.toLowerCase();
  for (const k of ITEM_ORDER) if (ITEM_INFO[k as Exclude<ItemKind, ItemKind.None>].word === w) return k;
  return ItemKind.None;
}

export function info(kind: ItemKind): ItemInfo {
  if (kind === ItemKind.None) throw new Error('No item');
  return ITEM_INFO[kind];
}
