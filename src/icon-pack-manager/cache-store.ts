import { logger } from '@app/lib/logger';
import { ensureDirectory, FileSystem, joinPath } from './file-system';
import {
  CacheKeyParts,
  NO_FOLDER,
  cacheKey,
  cacheRoot,
  iconCacheDir,
  sanitizeKeyPart,
} from './layout';

/**
 * The on-disk cache of icons that are actually in use.
 *
 * Packs stay compressed, so reading an icon out of one costs an archive parse
 * plus a decompression. Doing that on every render would be wasteful, so the
 * first time an icon is used it is written out here as a plain `.svg` file and
 * every later read is a direct file read.
 *
 * Entries are keyed by pack, colour and folder (see {@link cacheKey}), which
 * means a recoloured icon is a new entry rather than an overwrite, and the same
 * filename in two pack folders never collides.
 */
export class IconCacheStore {
  constructor(
    private readonly fs: FileSystem,
    private iconPacksPath: string,
  ) {}

  /**
   * Points the cache at a new icon packs path, after the setting changed.
   */
  public setIconPacksPath(iconPacksPath: string): void {
    this.iconPacksPath = iconPacksPath;
  }

  private pathFor(parts: CacheKeyParts): string {
    return joinPath(iconCacheDir(this.iconPacksPath), cacheKey(parts));
  }

  /**
   * Reads a cached icon.
   *
   * @returns The cached SVG markup, or `null` when it has not been cached yet.
   */
  public async read(parts: CacheKeyParts): Promise<string | null> {
    const path = this.pathFor(parts);

    if (!(await this.fs.exists(path))) {
      return null;
    }

    try {
      return await this.fs.read(path);
    } catch (error) {
      logger.warn(`Could not read cached icon at '${path}' (${error})`);
      return null;
    }
  }

  /**
   * Writes an icon to the cache.
   *
   * Failures are logged and swallowed: the caller already holds the markup, so
   * a cache write that does not land costs performance, never correctness.
   */
  public async write(parts: CacheKeyParts, markup: string): Promise<void> {
    try {
      await ensureDirectory(this.fs, cacheRoot(this.iconPacksPath));
      await ensureDirectory(this.fs, iconCacheDir(this.iconPacksPath));
      await this.fs.write(this.pathFor(parts), markup);
    } catch (error) {
      logger.warn(`Could not cache icon '${cacheKey(parts)}' (${error})`);
    }
  }

  /**
   * Removes a single cached icon, if present.
   */
  public async remove(parts: CacheKeyParts): Promise<void> {
    const path = this.pathFor(parts);
    if (await this.fs.exists(path)) {
      await this.fs.remove(path);
    }
  }

  /**
   * Lists the filenames of every cached icon.
   */
  public async list(): Promise<string[]> {
    const dir = iconCacheDir(this.iconPacksPath);

    if (!(await this.fs.exists(dir))) {
      return [];
    }

    const listing = await this.fs.list(dir);
    return listing.files.map((file) =>
      file.substring(file.lastIndexOf('/') + 1),
    );
  }

  /**
   * Drops every cached icon belonging to a pack.
   *
   * Used when a pack is removed or re-indexed, where previously cached icons
   * may no longer correspond to anything in the source.
   *
   * @param library Pack name, matched against the cache key's first segment.
   * @returns How many entries were removed.
   */
  public async removeForLibrary(library: string): Promise<number> {
    const prefix = `${sanitizeKeyPart(library)}-`;
    const dir = iconCacheDir(this.iconPacksPath);
    let removed = 0;

    for (const filename of await this.list()) {
      if (!filename.startsWith(prefix)) {
        continue;
      }

      try {
        await this.fs.remove(joinPath(dir, filename));
        removed++;
      } catch (error) {
        logger.warn(`Could not remove cached icon '${filename}' (${error})`);
      }
    }

    return removed;
  }

  /**
   * Drops every cached form of a single icon, in every colour it was drawn in.
   *
   * Colour is part of the cache key, so one icon can have several files. They
   * are matched positionally rather than by parsing: the library is the first
   * field and the folder and name are the last two, and no field value can
   * contain the `-` separator.
   *
   * @returns How many entries were removed.
   */
  public async removeForIcon(
    library: string,
    entry: { folder: string; name: string },
  ): Promise<number> {
    const prefix = `${sanitizeKeyPart(library)}-`;
    const folder = entry.folder;
    const suffix = `-${
      folder === ''
        ? NO_FOLDER
        : sanitizeKeyPart(folder.substring(folder.lastIndexOf('/') + 1))
    }-${sanitizeKeyPart(entry.name)}.svg`;

    const dir = iconCacheDir(this.iconPacksPath);
    let removed = 0;

    for (const filename of await this.list()) {
      if (!filename.startsWith(prefix) || !filename.endsWith(suffix)) {
        continue;
      }

      try {
        await this.fs.remove(joinPath(dir, filename));
        removed++;
      } catch (error) {
        logger.warn(`Could not remove cached icon '${filename}' (${error})`);
      }
    }

    return removed;
  }

  /**
   * The colour-independent identity of an icon's cache entries.
   *
   * Cache filenames are `library-fg-bg-folder-name.svg`; this returns the
   * `library` and `-folder-name` parts that every colour of one icon shares, so
   * entries can be grouped without parsing colours back out.
   */
  public identityOf(
    library: string,
    entry: { folder: string; name: string },
  ): string {
    const folder = entry.folder;
    const leaf =
      folder === ''
        ? NO_FOLDER
        : sanitizeKeyPart(folder.substring(folder.lastIndexOf('/') + 1));

    return `${sanitizeKeyPart(library)}|${leaf}-${sanitizeKeyPart(entry.name)}.svg`;
  }

  /**
   * Derives the identity of an existing cache filename.
   *
   * @returns The identity, or `null` if the filename is not shaped like a cache
   * key and should be left alone.
   */
  private identityOfFilename(filename: string): string | null {
    const fields = filename.split('-');
    if (fields.length < 5) {
      return null;
    }

    // library-fg-bg-folder-name.svg: the colours are always fields 1 and 2.
    const library = fields[0];
    const rest = fields.slice(3).join('-');
    return `${library}|${rest}`;
  }

  /**
   * Deletes every cached icon whose identity is not in the keep set.
   *
   * @param keep Identities produced by {@link identityOf}.
   * @returns How many entries were removed.
   */
  public async pruneExcept(keep: Set<string>): Promise<number> {
    const dir = iconCacheDir(this.iconPacksPath);
    let removed = 0;

    for (const filename of await this.list()) {
      const identity = this.identityOfFilename(filename);
      if (identity === null || keep.has(identity)) {
        continue;
      }

      try {
        await this.fs.remove(joinPath(dir, filename));
        removed++;
      } catch (error) {
        logger.warn(`Could not remove cached icon '${filename}' (${error})`);
      }
    }

    return removed;
  }

  /**
   * Empties the entire icon cache.
   *
   * @returns How many entries were removed.
   */
  public async clear(): Promise<number> {
    const dir = iconCacheDir(this.iconPacksPath);
    const filenames = await this.list();

    for (const filename of filenames) {
      try {
        await this.fs.remove(joinPath(dir, filename));
      } catch (error) {
        logger.warn(`Could not remove cached icon '${filename}' (${error})`);
      }
    }

    return filenames.length;
  }
}
