import { IconSource, RawEntry, SourceFingerprint } from './types';

/**
 * A source whose files are gone.
 *
 * Used for packs that have been uninstalled but whose icons the vault still
 * refers to. Their index is kept so those icons can still be named and looked
 * up, and their bytes come from the icon cache; there is simply nothing left to
 * read new icons from.
 */
export class NullSource implements IconSource {
  public readonly type = 'zip';

  public async listEntries(): Promise<RawEntry[]> {
    return [];
  }

  public async readEntry(): Promise<string | null> {
    return null;
  }

  public async fingerprint(): Promise<SourceFingerprint> {
    return { size: 0, mtime: 0, count: 0 };
  }

  public dispose(): void {
    // Nothing is held.
  }
}
