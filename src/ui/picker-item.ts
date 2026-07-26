import emoji from '@app/emoji';
import { LocatedEntry } from '@app/icon-pack-manager';

/**
 * One row in the icon picker.
 *
 * The picker used to show an icon's saved identifier verbatim, which for a pack
 * that qualifies names by folder reads as `Gi000000LorcBat` — the actual icon
 * name is buried in the middle. So a row is split into three parts: the plain
 * name, the qualifiers that disambiguate it, and the text used for searching.
 */
export interface PickerItem {
  kind: 'icon' | 'emoji';
  /** The value stored when this row is chosen. */
  id: string;
  /** Human readable name, e.g. `bat`. */
  label: string;
  /**
   * Where the icon came from, e.g. `game-icons · skoll`. Empty for icons that
   * need no disambiguation.
   */
  meta: string;
  /** Pack prefix, or `Emoji`. */
  prefix: string;
  /** Name without the pack prefix, used to resolve the preview. */
  name: string;
  /** Everything the fuzzy search should consider. */
  searchText: string;
}

/**
 * Returns the deepest folder of a path, which is the part that actually
 * distinguishes an icon from its same-named siblings.
 */
function leafFolder(folder: string): string {
  return folder === '' ? '' : folder.substring(folder.lastIndexOf('/') + 1);
}

/**
 * Builds a picker row for an indexed icon.
 */
export function iconPickerItem({ pack, entry }: LocatedEntry): PickerItem {
  const folder = leafFolder(entry.folder);
  const meta = folder === '' ? pack.getName() : `${pack.getName()} · ${folder}`;

  return {
    kind: 'icon',
    id: entry.id,
    label: entry.displayName,
    meta,
    prefix: pack.getPrefix(),
    name: entry.name,
    // The identifier is included so that typing a name copied out of
    // frontmatter still finds its icon.
    searchText: `${entry.displayName} ${entry.id} ${folder} ${pack.getName()}`,
  };
}

/**
 * Builds a picker row for an emoji.
 */
export function emojiPickerItem(unicode: string): PickerItem {
  const shortName = emoji.shortNames[unicode] ?? unicode;
  const shortcode = emoji.getShortcode(unicode);

  return {
    kind: 'emoji',
    id: unicode,
    label: shortName,
    meta: shortcode ? `emoji · :${shortcode}:` : 'emoji',
    prefix: 'Emoji',
    name: shortName,
    searchText: `${shortName} ${shortcode ?? ''} ${unicode}`,
  };
}

/**
 * Builds a picker row for a previously used value, which may be either kind.
 */
export function recentPickerItem(
  value: string,
  locate: (id: string) => LocatedEntry | undefined,
): PickerItem | null {
  if (emoji.isEmoji(value)) {
    return emojiPickerItem(value);
  }

  const located = locate(value);
  return located ? iconPickerItem(located) : null;
}
