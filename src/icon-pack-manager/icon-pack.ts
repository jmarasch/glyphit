import { generatePrefix } from './naming';
import { IconEntry, IconPackIndex, IconSource } from './types';

/**
 * One installed icon pack.
 *
 * A pack holds an *index* of what it contains, never the icons themselves. The
 * index is metadata only, so a pack of ten thousand icons costs a list of names
 * rather than ten thousand parsed SVG documents, and the archive behind it
 * stays compressed on disk.
 *
 * Turning an entry into something renderable is the resolver's job; a pack only
 * knows what exists and where to find it.
 */
export class IconPack {
  private entries: IconEntry[] = [];

  /** Lookup by lowercased id and by lowercased bare name. */
  private byKey = new Map<string, IconEntry>();

  private readonly prefix: string;

  /**
   * @param name Pack name, as shown in settings and used in cache keys.
   * @param source Where the pack's icons are read from.
   * @param isCustom Whether the user maintains this pack's files themselves.
   * @param prefix Overrides the derived prefix. Only needed for packs whose
   * prefix is fixed by history, such as Lucide's `Li`.
   */
  constructor(
    private readonly name: string,
    private readonly source: IconSource,
    private readonly isCustom: boolean,
    prefix?: string,
  ) {
    this.prefix = prefix ?? generatePrefix(name);
  }

  public getName(): string {
    return this.name;
  }

  public getPrefix(): string {
    return this.prefix;
  }

  public getSource(): IconSource {
    return this.source;
  }

  /**
   * Whether the user owns this pack's files, in which case the plugin must not
   * delete anything inside it.
   */
  public isCustomPack(): boolean {
    return this.isCustom;
  }

  /**
   * Number of icons in the pack.
   */
  public get size(): number {
    return this.entries.length;
  }

  /**
   * Every icon in the pack, as metadata.
   */
  public getEntries(): IconEntry[] {
    return this.entries;
  }

  /**
   * Looks an icon up by its full id or by its bare name.
   *
   * Both are accepted because callers arrive from different directions: saved
   * data holds full ids, while some legacy paths pass the name alone.
   */
  public getEntry(nameOrId: string): IconEntry | undefined {
    return this.byKey.get(nameOrId.toLowerCase());
  }

  /**
   * Replaces the pack's contents with a freshly built or loaded index.
   */
  public setIndex(index: IconPackIndex): void {
    this.entries = index.entries;
    this.byKey = new Map();

    for (const entry of index.entries) {
      this.byKey.set(entry.id.toLowerCase(), entry);
      // The bare name is a secondary key, so a genuine id always wins over a
      // name that happens to look like one.
      const nameKey = entry.name.toLowerCase();
      if (!this.byKey.has(nameKey)) {
        this.byKey.set(nameKey, entry);
      }
    }
  }

  /**
   * Releases whatever the source was holding open.
   */
  public dispose(): void {
    this.source.dispose();
  }
}
