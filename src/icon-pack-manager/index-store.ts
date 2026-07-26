import { logger } from '@app/lib/logger';
import { ensureDirectory, FileSystem } from './file-system';
import { indexDir, packIndexPath } from './layout';
import { IconEntry, IconPackIndex } from './types';

/**
 * The on-disk form of an entry.
 *
 * Only what cannot be derived is stored. `id` is the prefix plus the name, and
 * `displayName` is the filename in `path`, so persisting either would roughly
 * double the file for no gain: a pack of 8,000 icons writes about 700KB this
 * way instead of 1.5MB, and parses correspondingly faster on every start.
 */
interface StoredEntry {
  /** Name without the pack prefix. */
  n: string;
  /** Folder relative to the pack root. */
  f: string;
  /** Path of the icon inside its source. */
  p: string;
}

function toStored(entry: IconEntry): StoredEntry {
  return { n: entry.name, f: entry.folder, p: entry.path };
}

function fromStored(stored: StoredEntry, prefix: string): IconEntry {
  const filename = stored.p.substring(stored.p.lastIndexOf('/') + 1);

  return {
    id: `${prefix}${stored.n}`,
    name: stored.n,
    displayName: filename.replace(/\.svg$/i, ''),
    folder: stored.f,
    path: stored.p,
  };
}

/**
 * Reads and writes pack indexes to disk.
 *
 * Persisting the index is what makes the second start of a vault fast: the
 * archive does not need to be opened at all unless it changed, so a pack of any
 * size costs one small JSON read.
 */
export class IndexStore {
  constructor(
    private readonly fs: FileSystem,
    private iconPacksPath: string,
  ) {}

  /**
   * Points the store at a new icon packs path, after the setting changed.
   */
  public setIconPacksPath(iconPacksPath: string): void {
    this.iconPacksPath = iconPacksPath;
  }

  /**
   * Loads a pack's index.
   *
   * A missing or corrupt index is reported as absent rather than as an error:
   * the caller's response either way is to rebuild it from the source.
   *
   * @returns The index, or `null` if it is missing or unreadable.
   */
  public async load(packName: string): Promise<IconPackIndex | null> {
    const path = packIndexPath(this.iconPacksPath, packName);

    if (!(await this.fs.exists(path))) {
      return null;
    }

    try {
      const parsed = JSON.parse(await this.fs.read(path)) as Omit<
        IconPackIndex,
        'entries'
      > & { entries: StoredEntry[] };

      // Guard against a truncated or hand-edited file producing an index with
      // no entries array, which would otherwise fail much later and further
      // away from the cause.
      if (!parsed || !Array.isArray(parsed.entries)) {
        logger.warn(`Discarding malformed icon pack index at '${path}'`);
        return null;
      }

      return {
        ...parsed,
        entries: parsed.entries.map((entry) =>
          fromStored(entry, parsed.prefix),
        ),
      };
    } catch (error) {
      logger.warn(`Could not read icon pack index at '${path}' (${error})`);
      return null;
    }
  }

  /**
   * Writes a pack's index, creating the cache directory if needed.
   */
  public async save(index: IconPackIndex): Promise<void> {
    await ensureDirectory(this.fs, indexDir(this.iconPacksPath));
    await this.fs.write(
      packIndexPath(this.iconPacksPath, index.packName),
      JSON.stringify({ ...index, entries: index.entries.map(toStored) }),
    );
  }

  /**
   * Names every pack that has a persisted index.
   *
   * Includes packs that are no longer installed, whose index is deliberately
   * kept so icons already in use can still be resolved from the cache.
   */
  public async listIndexedPacks(): Promise<string[]> {
    const dir = indexDir(this.iconPacksPath);

    if (!(await this.fs.exists(dir))) {
      return [];
    }

    const listing = await this.fs.list(dir);
    return listing.files
      .map((file) => file.substring(file.lastIndexOf('/') + 1))
      .filter((name) => name.endsWith('.json'))
      .map((name) => name.slice(0, -'.json'.length));
  }

  /**
   * Removes a pack's index, if it exists.
   */
  public async delete(packName: string): Promise<void> {
    const path = packIndexPath(this.iconPacksPath, packName);
    if (await this.fs.exists(path)) {
      await this.fs.remove(path);
    }
  }
}
