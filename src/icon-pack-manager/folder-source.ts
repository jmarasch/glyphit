import { FileSystem } from './file-system';
import { IconSource, RawEntry, SourceFingerprint } from './types';

/**
 * Reads icons out of a plain directory of `.svg` files.
 *
 * This backs "custom" icon packs, the ones users build by dropping SVGs into a
 * folder. Unlike the previous implementation the walk is recursive, so a custom
 * pack can be organised into subfolders and still have every icon found; the
 * naming rules then disambiguate any filenames that repeat across them.
 */
export class FolderSource implements IconSource {
  public readonly type = 'folder';

  /**
   * @param fs File system to read through.
   * @param root Vault path of the pack directory.
   */
  constructor(
    private readonly fs: FileSystem,
    private readonly root: string,
  ) {}

  /**
   * Recursively collects every `.svg` file beneath a directory.
   *
   * @param dir Directory to walk.
   * @param collected Accumulator, passed down the recursion.
   */
  private async walk(dir: string, collected: RawEntry[]): Promise<void> {
    if (!(await this.fs.exists(dir))) {
      return;
    }

    const listing = await this.fs.list(dir);

    for (const file of listing.files) {
      if (file.toLowerCase().endsWith('.svg')) {
        collected.push({ path: file });
      }
    }

    for (const folder of listing.folders) {
      await this.walk(folder, collected);
    }
  }

  public async listEntries(): Promise<RawEntry[]> {
    const collected: RawEntry[] = [];
    await this.walk(this.root, collected);
    return collected;
  }

  public async readEntry(path: string): Promise<string | null> {
    if (!(await this.fs.exists(path))) {
      return null;
    }

    return this.fs.read(path);
  }

  public async fingerprint(): Promise<SourceFingerprint> {
    const stat = await this.fs.stat(this.root);
    const entries = await this.listEntries();

    // A directory's own size is meaningless, so the file count carries the
    // signal here: adding or removing an icon changes it.
    return {
      size: 0,
      mtime: stat?.mtime ?? 0,
      count: entries.length,
    };
  }

  public dispose(): void {
    // Nothing is held open; every read goes straight to the file system.
  }
}
