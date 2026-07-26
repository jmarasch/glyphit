import { joinPath } from './file-system';

/**
 * Where everything the icon pack layer generates lives on disk.
 *
 * Packs themselves are never unpacked. All generated state goes under a single
 * directory inside the configured icon packs path, so the user's own files sit
 * next to it untouched:
 *
 * ```
 * .obsidian/icons/
 *   game-icons.net.svg.zip                     the pack, stays zipped
 *   my-custom-pack/                            a folder pack, edited by the user
 *   .cache/
 *     index/game-icons.net.svg.json            what is inside that pack
 *     icons/game-icons.net.svg-ffffff-none-lorc-sandstorm.svg
 * ```
 *
 * Every path is derived here rather than assembled at call sites, so changing
 * the layout means editing this file only.
 */

/**
 * Directory holding all generated state, relative to the icon packs path.
 *
 * Named with a leading dot so it reads as internal, and so discovery can tell
 * it apart from user-created pack folders.
 */
export const CACHE_DIR_NAME = '.cache';

/** Subdirectory holding one index file per pack. */
export const INDEX_DIR_NAME = 'index';

/** Subdirectory holding icons extracted and coloured on first use. */
export const ICON_DIR_NAME = 'icons';

/**
 * Token used in a cache key when a colour was not specified, meaning the icon
 * inherits the theme's colour via `currentColor`.
 */
export const NO_COLOR = 'none';

/**
 * Token used in a cache key for icons that sit at the root of their pack.
 */
export const NO_FOLDER = 'root';

/**
 * Root of all generated state.
 */
export function cacheRoot(iconPacksPath: string): string {
  return joinPath(iconPacksPath, CACHE_DIR_NAME);
}

/**
 * Directory holding every pack index.
 */
export function indexDir(iconPacksPath: string): string {
  return joinPath(cacheRoot(iconPacksPath), INDEX_DIR_NAME);
}

/**
 * Path of a pack's persisted icon index.
 */
export function packIndexPath(iconPacksPath: string, packName: string): string {
  return joinPath(indexDir(iconPacksPath), `${packName}.json`);
}

/**
 * Directory holding every cached icon.
 */
export function iconCacheDir(iconPacksPath: string): string {
  return joinPath(cacheRoot(iconPacksPath), ICON_DIR_NAME);
}

/**
 * Reduces a value to characters that are safe in a filename on every platform.
 *
 * Cache keys are built out of pack names, folder names and colours, all of
 * which are user supplied, so this is the single point where that input is made
 * safe to concatenate into a path.
 */
export function sanitizeKeyPart(value: string): string {
  const cleaned = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._]+/g, '_')
    .replace(/^_+|_+$/g, '');

  return cleaned === '' ? '_' : cleaned;
}

/**
 * Normalizes a colour into a cache key token.
 *
 * @param color A CSS colour, with or without a leading `#`. Anything empty
 * means "no explicit colour".
 * @returns The colour without its `#`, or {@link NO_COLOR}.
 */
export function colorToken(color: string | null | undefined): string {
  if (!color) {
    return NO_COLOR;
  }

  return sanitizeKeyPart(color.replace(/^#/, ''));
}

/**
 * Identifies one rendered form of one icon.
 *
 * Colour is part of the key because the cache stores icons exactly as they are
 * drawn. The same source icon in two colours is two cache entries, and neither
 * has to be recomputed once written.
 */
export interface CacheKeyParts {
  /** Name of the icon pack the icon came from. */
  library: string;
  /** Foreground colour, or nullish to inherit from the theme. */
  foreground?: string | null;
  /** Background colour, or nullish for none. */
  background?: string | null;
  /** Folder the icon sits in inside its pack, relative to the pack root. */
  folder?: string;
  /** The icon's own name. */
  name: string;
}

/**
 * Builds the filename of a cached icon.
 *
 * The shape is `library-foreground-background-folder-name.svg`, so a cached
 * file says on its face which pack, colour and folder it came from. That keeps
 * the cache browsable and makes stale entries easy to spot by eye.
 *
 * @example `game-icons.net.svg-ffffff-none-lorc-sandstorm.svg`
 */
export function cacheKey(parts: CacheKeyParts): string {
  const segments = [
    sanitizeKeyPart(parts.library),
    colorToken(parts.foreground),
    colorToken(parts.background),
    parts.folder ? sanitizeKeyPart(parts.folder) : NO_FOLDER,
    sanitizeKeyPart(parts.name),
  ];

  return `${segments.join('-')}.svg`;
}

/**
 * Full path of a cached icon.
 */
export function cachedIconPath(
  iconPacksPath: string,
  parts: CacheKeyParts,
): string {
  return joinPath(iconCacheDir(iconPacksPath), cacheKey(parts));
}

/**
 * Whether a directory found in the icon packs path is generated state rather
 * than a user's icon pack.
 *
 * Discovery uses this to avoid presenting the cache as an icon pack, which
 * would make it show up in the settings list and in the icon picker.
 */
export function isReservedDirectory(name: string): boolean {
  return name === CACHE_DIR_NAME || name.startsWith('.');
}
