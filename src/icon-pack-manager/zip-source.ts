import JSZip, { loadAsync } from 'jszip';
import { logger } from '@app/lib/logger';
import { FileSystem } from './file-system';
import { IconSource, RawEntry, SourceFingerprint } from './types';

/**
 * Reads icons out of a `.zip` archive without ever unpacking it to disk.
 *
 * JSZip parses only the archive directory when loading, and inflates an entry's
 * bytes lazily on `async()`. That split is what this class is built around:
 * {@link listEntries} walks thousands of names for the cost of parsing a
 * directory, while {@link readEntry} pays decompression for exactly one icon.
 *
 * The parsed archive is held onto between calls so that a burst of reads shares
 * one parse, and released by {@link dispose} so a large pack does not sit in
 * memory for the rest of the session.
 */
export class ZipSource implements IconSource {
  public readonly type = 'zip';

  /**
   * In-flight or completed archive parse. Stored as the promise rather than the
   * result so concurrent callers share a single read of the underlying file.
   */
  private archive: Promise<JSZip> | null = null;

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

  private open(): Promise<JSZip> {
    if (this.archive === null) {
      this.archive = this.fs
        .readBinary(this.zipPath)
        .then((buffer) => loadAsync(buffer));

      // A failed parse must not be cached, otherwise every later read of a
      // transiently unreadable archive fails too.
      this.archive.catch(() => {
        this.archive = null;
      });
    }

    return this.archive;
  }

  /**
   * Whether an archive entry is an SVG at all.
   */
  private isSvg(file: JSZip.JSZipObject): boolean {
    return !file.dir && file.name.toLowerCase().endsWith('.svg');
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
    const archive = await this.open();
    const svgs = Object.values(archive.files).filter((file) =>
      this.isSvg(file),
    );

    if (this.extraPath === '') {
      return svgs.map((file) => ({ path: file.name }));
    }

    const exact = svgs.filter((file) => file.name.startsWith(this.extraPath));
    if (exact.length > 0) {
      return exact.map((file) => ({ path: file.name }));
    }

    // Nothing matched, most likely because the installed archive is a different
    // release than the one the extra path was written for.
    const relaxed = this.relaxedExtraPath();
    if (relaxed !== '') {
      const matched = svgs.filter((file) => file.name.includes(`/${relaxed}`));
      if (matched.length > 0) {
        logger.info(
          `Matched icon pack entries in '${this.zipPath}' on relaxed path '${relaxed}' because '${this.extraPath}' matched nothing`,
        );
        return matched.map((file) => ({ path: file.name }));
      }
    }

    return [];
  }

  public async readEntry(path: string): Promise<string | null> {
    const archive = await this.open();
    const file = archive.file(path);
    if (!file) {
      return null;
    }

    return file.async('string');
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
