import { unzipSync, strFromU8 } from 'fflate';
import { logger } from '@app/lib/logger';
import { FileSystem } from './file-system';
import { IconSource, RawEntry, SourceFingerprint } from './types';

/**
 * Reads icons out of a `.zip` archive without ever unpacking it to disk.
 *
 * A zip's central directory is a flat table of names and offsets at the end of
 * the file, so it can be walked without touching the compressed bytes at all.
 * That split is what this class is built around: {@link listEntries} reads
 * thousands of names for the cost of walking that table, while
 * {@link readEntry} pays decompression for exactly one icon.
 *
 * `fflate`'s `filter` callback is how the two are told apart — it runs per
 * entry during the directory walk, and returning `false` means the entry is
 * skipped rather than inflated.
 *
 * Only the synchronous API is used. The asynchronous one spawns workers by
 * building a script at runtime and handing it to a blob URL, which is exactly
 * the pattern that makes a plugin impossible to review statically.
 *
 * The archive bytes are held between calls so a burst of reads shares one file
 * read, and released by {@link dispose} so a large pack does not sit in memory
 * for the rest of the session.
 */
export class ZipSource implements IconSource {
  public readonly type = 'zip';

  /**
   * In-flight or completed read of the archive. Stored as the promise rather
   * than the result so concurrent callers share a single read of the file.
   */
  private archive: Promise<Uint8Array> | null = null;

  /**
   * @param fs File system to read the archive through.
   * @param zipPath Vault path of the `.zip` file.
   * @param extraPath Optional directory inside the archive to restrict icons
   * to. Used by predefined packs whose archives bundle more than icons.
   */
  constructor(
    private readonly fs: FileSystem,
    private readonly zipPath: string,
    private readonly extraPath = '',
  ) {}

  private open(): Promise<Uint8Array> {
    if (this.archive === null) {
      this.archive = this.fs
        .readBinary(this.zipPath)
        .then((buffer) => new Uint8Array(buffer));

      // A failed read must not be cached, otherwise every later read of a
      // transiently unreadable archive fails too.
      this.archive.catch(() => {
        this.archive = null;
      });
    }

    return this.archive;
  }

  /**
   * Every entry name in the archive, without decompressing anything.
   */
  private listNames(bytes: Uint8Array): string[] {
    const names: string[] = [];
    unzipSync(bytes, {
      filter: (file) => {
        names.push(file.name);
        // Never inflate: this walk only wants the directory.
        return false;
      },
    });
    return names;
  }

  /**
   * Whether an archive entry is an SVG at all.
   *
   * Directory entries are recorded with a trailing slash, which is how they
   * are told apart from files.
   */
  private isSvg(name: string): boolean {
    return !name.endsWith('/') && name.toLowerCase().endsWith('.svg');
  }

  /**
   * Drops the leading segment of the configured extra path.
   *
   * Predefined packs pin an extra path that includes the release directory, and
   * that directory carries a version number (`fontawesome-free-7.2.0-web/svgs/
   * solid/`). Users often have an archive of a different version installed, in
   * which case the pinned path matches nothing and the pack silently indexes to
   * zero icons. Matching on everything after the versioned segment
   * (`svgs/solid/`) keeps the pack working across releases.
   */
  private relaxedExtraPath(): string {
    const firstSlash = this.extraPath.indexOf('/');
    return firstSlash === -1 ? '' : this.extraPath.substring(firstSlash + 1);
  }

  public async listEntries(): Promise<RawEntry[]> {
    const bytes = await this.open();
    const svgs = this.listNames(bytes).filter((name) => this.isSvg(name));

    if (this.extraPath === '') {
      return svgs.map((path) => ({ path }));
    }

    const exact = svgs.filter((name) => name.startsWith(this.extraPath));
    if (exact.length > 0) {
      return exact.map((path) => ({ path }));
    }

    // Nothing matched, most likely because the installed archive is a different
    // release than the one the extra path was written for.
    const relaxed = this.relaxedExtraPath();
    if (relaxed !== '') {
      const matched = svgs.filter((name) => name.includes(`/${relaxed}`));
      if (matched.length > 0) {
        logger.info(
          `Matched icon pack entries in '${this.zipPath}' on relaxed path '${relaxed}' because '${this.extraPath}' matched nothing`,
        );
        return matched.map((path) => ({ path }));
      }
    }

    return [];
  }

  public async readEntry(path: string): Promise<string | null> {
    const bytes = await this.open();

    // The filter means only this one entry is inflated, however many the
    // archive holds.
    const unzipped = unzipSync(bytes, {
      filter: (file) => file.name === path,
    });

    const entry = unzipped[path];
    return entry ? strFromU8(entry) : null;
  }

  public async fingerprint(): Promise<SourceFingerprint> {
    const stat = await this.fs.stat(this.zipPath);
    return {
      size: stat?.size ?? 0,
      mtime: stat?.mtime ?? 0,
      count: 0,
    };
  }

  public dispose(): void {
    this.archive = null;
  }
}
