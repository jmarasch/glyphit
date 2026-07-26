/**
 * Core data model for icon packs.
 *
 * The model separates two concepts that used to be conflated:
 *
 * - {@link IconEntry} is *metadata only*. It says an icon exists, what it is
 *   called and where its bytes live. Building it never decompresses anything,
 *   so a pack with thousands of icons can be indexed cheaply.
 * - {@link Icon} is a *resolved* icon. It carries the actual SVG markup and is
 *   only produced on demand, for icons that are really used or rendered.
 *
 * Keeping these apart is what allows packs to stay zipped: we hold an index of
 * every icon in memory, but only ever inflate the handful the vault uses.
 */

/**
 * A single icon inside a pack, without its SVG content.
 */
export interface IconEntry {
  /**
   * Globally unique identifier of the icon, prefix included (e.g. `GiSandstorm`).
   * This is the string persisted in the plugin data and typed by users into
   * frontmatter, so it must stay stable across re-indexes.
   */
  id: string;
  /**
   * The identifier without the icon pack prefix (e.g. `Sandstorm`).
   */
  name: string;
  /**
   * Human friendly name, derived from the original filename (e.g. `sandstorm`).
   */
  displayName: string;
  /**
   * Directory the icon lives in, relative to the pack root and with the pack's
   * common root stripped (e.g. `lorc`). Empty string when the icon sits at the
   * root of the pack.
   */
  folder: string;
  /**
   * Path of the icon inside its source, used to read the bytes back out. For a
   * zip source this is the zip entry name, for a folder source the vault path.
   */
  path: string;
}

/**
 * A fully resolved icon, including its SVG markup.
 *
 * @remarks The shape is kept backwards compatible with the pre-index version of
 * the plugin so that the public API and the DOM helpers did not need to change.
 */
export interface Icon {
  name: string;
  prefix: string;
  displayName: string;
  /** `null` when the icon is an emoji rather than a real icon pack entry. */
  iconPackName: string | null;
  filename: string;
  svgContent: string;
  svgViewbox: string;
  svgElement: string;
}

/**
 * Where a pack's icons physically live.
 *
 * `zip` packs stay compressed on disk and are read entry by entry. `folder`
 * packs are plain directories of `.svg` files, which is what the "custom icon
 * pack" feature creates.
 */
export type IconPackSourceType = 'zip' | 'folder';

/**
 * The persisted index of a single icon pack.
 *
 * This is written next to the pack as a sidecar JSON file so that subsequent
 * app starts can skip opening the archive entirely.
 */
export interface IconPackIndex {
  /**
   * Schema version of the index file. Bumped whenever the index format or the
   * naming rules change, which forces a rebuild on the next load.
   */
  version: number;
  packName: string;
  prefix: string;
  /**
   * Version of the published pack this was built from, when it came from the
   * catalog. Empty for packs the user made themselves. Compared against the
   * catalog to offer updates.
   */
  packVersion?: string;
  sourceType: IconPackSourceType;
  /**
   * Fingerprint of the source at index time, used to detect that the pack
   * changed underneath us (e.g. the user replaced the zip).
   */
  fingerprint: SourceFingerprint;
  /** Epoch millis the index was built, for diagnostics. */
  builtAt: number;
  entries: IconEntry[];
}

/**
 * Cheap staleness signal for a pack source. For zips this is the file size and
 * mtime; for folders the number of files and the newest mtime.
 */
export interface SourceFingerprint {
  size: number;
  mtime: number;
  count: number;
}

/**
 * An entry as discovered by a source, before naming rules are applied.
 */
export interface RawEntry {
  /** Full path of the icon inside the source. */
  path: string;
  /** Size of the entry in bytes, when the source can report it cheaply. */
  size?: number;
}

/**
 * A place icons can be read from.
 *
 * Implementations must make {@link listEntries} cheap: it is called during
 * indexing and may run over thousands of icons. {@link readEntry} is the only
 * method allowed to do real work, and is called once per icon actually needed.
 */
export interface IconSource {
  readonly type: IconPackSourceType;
  /**
   * Lists every `.svg` entry in the source without reading its contents.
   */
  listEntries(): Promise<RawEntry[]>;
  /**
   * Reads the raw SVG markup of a single entry.
   * @param path Entry path as reported by {@link listEntries}.
   * @returns The file contents, or `null` if the entry no longer exists.
   */
  readEntry(path: string): Promise<string | null>;
  /**
   * Computes the current staleness fingerprint of the source.
   */
  fingerprint(): Promise<SourceFingerprint>;
  /**
   * Releases any handle the source is holding (e.g. a decompressed zip
   * directory). Sources must transparently reopen on the next call.
   */
  dispose(): void;
}

/**
 * Version of the index schema. Increment to invalidate every existing sidecar.
 */
export const ICON_PACK_INDEX_VERSION = 1;
