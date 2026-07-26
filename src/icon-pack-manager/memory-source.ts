import { IconSource, RawEntry, SourceFingerprint } from './types';

/**
 * Serves icons that are already in memory rather than stored on disk.
 *
 * Obsidian ships Lucide internally, so that pack has no archive and no folder
 * behind it. Wrapping it as a source lets it flow through the same index,
 * naming and resolution path as every other pack instead of needing a parallel
 * code path everywhere.
 */
export class MemorySource implements IconSource {
  public readonly type = 'folder';

  /**
   * @param entries Map of pseudo path to SVG markup. Paths are treated exactly
   * like real ones, so nesting them in folders works as it would on disk.
   */
  constructor(private entries: Map<string, string>) {}

  /**
   * Replaces the backing icons, e.g. after Obsidian's icon set changed.
   */
  public setEntries(entries: Map<string, string>): void {
    this.entries = entries;
  }

  public async listEntries(): Promise<RawEntry[]> {
    return [...this.entries.keys()].map((path) => ({ path }));
  }

  public async readEntry(path: string): Promise<string | null> {
    return this.entries.get(path) ?? null;
  }

  public async fingerprint(): Promise<SourceFingerprint> {
    // Nothing persists between sessions, so the count is the only thing worth
    // comparing; a changed Obsidian version showing more icons rebuilds it.
    return { size: 0, mtime: 0, count: this.entries.size };
  }

  public dispose(): void {
    // Nothing to release.
  }
}
