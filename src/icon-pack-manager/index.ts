import { Notice } from 'obsidian';
import config from '@app/config';
import { logger } from '@app/lib/logger';
import GlyphItPlugin from '@app/main';
import { IconCacheStore } from './cache-store';
import { ensureDirectory, FileSystem, joinPath } from './file-system';
import { FolderSource } from './folder-source';
import { IndexStore } from './index-store';
import { buildIndex, isIndexStale } from './indexer';
import { IconPack } from './icon-pack';
import { isReservedDirectory } from './layout';
import { LUCIDE_ICON_PACK_NAME, LucideIconPack } from './lucide';
import { nextIdentifier } from './naming';
import { IconResolver, ResolveOptions, ResolveRequest } from './resolver';
import { Icon, IconEntry, IconPackSourceType } from './types';
import { NullSource } from './null-source';
import { ZipSource } from './zip-source';
import { addFilesToZip, createEmptyZip } from './zip-writer';
import { getExtraPath } from '@app/icon-packs';

export { Icon, IconEntry } from './types';
export { IconPack } from './icon-pack';

/**
 * Outcome of adding icons to a pack.
 */
export interface AddIconsResult {
  /** How many icons were written. */
  added: number;
  /** Filenames that were not SVGs, and so were skipped. */
  rejected: string[];
}

/**
 * An icon located in the pack it belongs to.
 */
export interface LocatedEntry {
  pack: IconPack;
  entry: IconEntry;
}

/**
 * Owns every installed icon pack and the machinery that turns them into
 * renderable icons.
 *
 * The manager keeps packs compressed and loads only their indexes at start-up,
 * then resolves individual icons on demand through a memory and disk cache. A
 * vault therefore pays for the icons it uses rather than for the packs it has
 * installed, which is what lets very large packs stay usable.
 */
export class IconPackManager {
  private path: string;

  private iconPacks: IconPack[] = [];

  /**
   * Packs that are no longer installed but whose icons are still in use.
   *
   * Uninstalling a pack removes it as a place to find new icons; it does not
   * take away icons already applied in the vault. Their index and cached files
   * are kept, so they still render — they simply cannot be browsed or added to
   * any more.
   */
  private detachedPacks: IconPack[] = [];

  private readonly fs: FileSystem;
  private readonly indexStore: IndexStore;
  private readonly cacheStore: IconCacheStore;
  private readonly resolver: IconResolver;
  private readonly lucideIconPack: LucideIconPack;

  constructor(
    private readonly plugin: GlyphItPlugin,
    path: string,
  ) {
    this.fs = plugin.app.vault.adapter as unknown as FileSystem;
    this.path = normalizePath(path);

    this.indexStore = new IndexStore(this.fs, this.path);
    this.cacheStore = new IconCacheStore(this.fs, this.path);
    this.resolver = new IconResolver(this.cacheStore);
    this.lucideIconPack = new LucideIconPack(plugin, this);
  }

  /**
   * Discovers installed packs and brings their indexes up to date.
   *
   * This is the only start-up cost: for a pack whose index is still valid it is
   * a single small JSON read, and the archive is never opened.
   */
  public async init(): Promise<void> {
    await this.createDefaultDirectory();

    this.iconPacks = [];
    const listing = await this.safeList(this.path);

    // Archives are packs that stay compressed.
    for (const file of listing.files) {
      if (!file.endsWith('.zip')) {
        continue;
      }

      const name = basename(file).replace(/\.zip$/, '');
      const source = new ZipSource(this.fs, file, getExtraPath(name) ?? '');
      const isLucide = name === LUCIDE_ICON_PACK_NAME;

      this.iconPacks.push(
        new IconPack(name, source, false, isLucide ? 'Li' : undefined),
      );
    }

    // Directories are either packs the user maintains by hand, or icons an
    // older version unpacked out of an archive.
    const shadowedFolders = new Map<string, string>();

    for (const folder of listing.folders) {
      const name = basename(folder);

      // The plugin's own generated state is not an icon pack.
      if (isReservedDirectory(name)) {
        continue;
      }

      if (this.iconPacks.some((pack) => pack.getName() === name)) {
        // An archive of the same name exists. It is usually authoritative, but
        // it is held back until it proves it actually yields icons.
        shadowedFolders.set(name, folder);
        continue;
      }

      this.iconPacks.push(
        new IconPack(name, new FolderSource(this.fs, folder), true),
      );
    }

    if (this.plugin.doesUseNativeLucideIconPack()) {
      this.iconPacks = this.iconPacks.filter(
        (pack) => pack.getName() !== LUCIDE_ICON_PACK_NAME,
      );
      this.iconPacks.push(this.lucideIconPack.createPack());
    }

    await Promise.all(this.iconPacks.map((pack) => this.loadIndex(pack)));

    await this.adoptShadowedFolders(shadowedFolders);
    await this.loadDetachedPacks();

    // Nothing needs the archives again until an icon is actually resolved.
    this.releaseSources();
  }

  /**
   * Falls back to an unpacked directory when its archive turned up empty.
   *
   * An archive can index to nothing while a directory of the same name holds
   * real icons: predefined packs pin a versioned path inside the archive, so a
   * user carrying an older release ends up with an archive the pinned path does
   * not match. Those users' icons live in the directory an earlier version of
   * the plugin unpacked, and discarding it would break every icon they saved.
   */
  private async adoptShadowedFolders(
    shadowedFolders: Map<string, string>,
  ): Promise<void> {
    for (const [name, folder] of shadowedFolders) {
      const pack = this.getIconPackByName(name);
      if (pack && pack.size > 0) {
        continue;
      }

      const replacement = new IconPack(
        name,
        new FolderSource(this.fs, folder),
        true,
      );
      const count = await this.loadIndex(replacement, true);

      if (count === 0) {
        continue;
      }

      logger.info(
        `Icon pack '${name}' resolved from its unpacked directory (${count} icons); its archive matched no icons`,
      );

      const index = this.iconPacks.findIndex((p) => p.getName() === name);
      if (index > -1) {
        this.iconPacks[index].dispose();
        this.iconPacks[index] = replacement;
      } else {
        this.iconPacks.push(replacement);
      }
    }
  }

  /**
   * Forgets detached packs that nothing refers to any more.
   *
   * A detached pack only exists to keep icons that are still applied working.
   * Once none of its icons are referenced there is nothing left to preserve,
   * so its index and cached files are released rather than kept forever.
   *
   * @param referenced Every icon identifier the vault still uses.
   * @returns The names of the packs that were dropped.
   */
  public async pruneDetachedPacks(referenced: Set<string>): Promise<string[]> {
    const dropped: string[] = [];

    for (const pack of [...this.detachedPacks]) {
      const stillUsed = pack
        .getEntries()
        .some((entry) => referenced.has(entry.id));

      if (stillUsed) {
        continue;
      }

      const name = pack.getName();
      this.detachedPacks = this.detachedPacks.filter((p) => p !== pack);
      this.resolver.forgetLibrary(name);
      await this.cacheStore.removeForLibrary(name);
      await this.indexStore.delete(name);
      dropped.push(name);

      logger.info(
        `Released data for removed icon pack '${name}'; none of its icons are in use`,
      );
    }

    return dropped;
  }

  /**
   * Loads the indexes of packs that are indexed but no longer installed.
   */
  private async loadDetachedPacks(): Promise<void> {
    this.detachedPacks = [];
    const installed = new Set(this.iconPacks.map((pack) => pack.getName()));

    for (const name of await this.indexStore.listIndexedPacks()) {
      if (installed.has(name)) {
        continue;
      }

      const stored = await this.indexStore.load(name);
      if (!stored || stored.entries.length === 0) {
        continue;
      }

      const pack = new IconPack(name, new NullSource(), false, stored.prefix);
      pack.setIndex(stored);
      this.detachedPacks.push(pack);

      logger.info(
        `Icon pack '${name}' is no longer installed; ${stored.entries.length} of its icons remain resolvable from the cache`,
      );
    }
  }

  /**
   * Loads a pack's index, rebuilding it when it is missing or out of date.
   *
   * @param pack Pack to index.
   * @param force Rebuild even if the persisted index still looks current. Used
   * by the manual refresh in settings.
   * @returns The number of icons the pack contains.
   */
  public async loadIndex(
    pack: IconPack,
    force = false,
    packVersion?: string,
  ): Promise<number> {
    const name = pack.getName();

    try {
      const stored = force ? null : await this.indexStore.load(name);
      const fingerprint = await pack.getSource().fingerprint();

      if (!isIndexStale(stored, fingerprint)) {
        pack.setIndex(stored!);
        return pack.size;
      }

      const rebuilt = await buildIndex(
        name,
        pack.getPrefix(),
        pack.getSource(),
      );
      // Preserved across rescans so that re-indexing an installed pack does
      // not lose track of which published version it came from.
      rebuilt.packVersion = packVersion ?? stored?.packVersion;
      pack.setIndex(rebuilt);
      await this.indexStore.save(rebuilt);

      logger.info(
        `Indexed icon pack '${name}' (${rebuilt.entries.length} icons)`,
      );
      return pack.size;
    } catch (error) {
      logger.error(`Could not index icon pack '${name}' (${error})`);
      return 0;
    }
  }

  /**
   * Rebuilds a pack's index from its source, ignoring the persisted one.
   *
   * This is what the refresh control in settings calls after the user has
   * edited a pack's archive or folder, so the new contents show up without an
   * Obsidian restart.
   *
   * @returns The number of icons found, or `null` if there is no such pack.
   */
  public async refreshIconPack(packName: string): Promise<number | null> {
    const pack = this.getIconPackByName(packName);
    if (!pack) {
      return null;
    }

    // Anything already resolved may no longer match the source.
    pack.getSource().dispose();
    this.resolver.forgetLibrary(packName);

    const count = await this.loadIndex(pack, true);
    pack.getSource().dispose();

    return count;
  }

  /**
   * Rebuilds every pack's index.
   *
   * @returns Total number of icons across all packs.
   */
  public async refreshAll(): Promise<number> {
    let total = 0;
    for (const pack of this.iconPacks) {
      total += (await this.refreshIconPack(pack.getName())) ?? 0;
    }
    return total;
  }

  /**
   * Finds an icon by its full identifier, e.g. `GiSandstorm`.
   */
  public findEntry(iconNameWithPrefix: string): LocatedEntry | undefined {
    if (!iconNameWithPrefix) {
      return undefined;
    }

    const split = nextIdentifier(iconNameWithPrefix);
    const prefix = iconNameWithPrefix.substring(0, split);
    const name = iconNameWithPrefix.substring(split);

    // Installed packs first, then packs that were uninstalled while some of
    // their icons were still in use.
    for (const pack of [...this.iconPacks, ...this.detachedPacks]) {
      if (pack.getPrefix() !== prefix) {
        continue;
      }

      const entry = pack.getEntry(name) ?? pack.getEntry(iconNameWithPrefix);
      if (entry) {
        return { pack, entry };
      }
    }

    return undefined;
  }

  /**
   * Builds the resolver request for an icon.
   */
  private requestFor(
    located: LocatedEntry,
    color?: string | null,
  ): ResolveRequest {
    return {
      entry: located.entry,
      library: located.pack.getName(),
      prefix: located.pack.getPrefix(),
      source: located.pack.getSource(),
      foreground: color,
    };
  }

  /**
   * Returns an icon that has already been resolved this session.
   *
   * The render path is synchronous, so it relies on this; icons the vault uses
   * are brought into memory by {@link prefetch} before the first render.
   */
  public peekIcon(
    iconNameWithPrefix: string,
    color?: string | null,
  ): Icon | undefined {
    const located = this.findEntry(iconNameWithPrefix);
    if (!located) {
      return undefined;
    }

    return (
      this.resolver.peek(this.requestFor(located, color)) ??
      // Fall back to the uncolored form, which is the same drawing; the DOM
      // layer applies color again when it sets the icon.
      (color ? this.resolver.peek(this.requestFor(located)) : undefined)
    );
  }

  /**
   * Resolves an icon, reading from its pack if this is the first use.
   */
  public async resolveIcon(
    iconNameWithPrefix: string,
    color?: string | null,
    options: ResolveOptions = {},
  ): Promise<Icon | null> {
    const located = this.findEntry(iconNameWithPrefix);
    if (!located) {
      return null;
    }

    return this.resolver.resolve(this.requestFor(located, color), options);
  }

  /**
   * Brings a set of icons into memory, extracting any that are not cached yet.
   *
   * Called at start-up with the icons the vault actually references, which is
   * what allows the synchronous render path to find everything it needs.
   *
   * @param iconNames Full icon identifiers.
   * @param colorOf Optional lookup of the color each icon should be drawn in.
   */
  public async prefetch(
    iconNames: string[],
    colorOf?: (iconName: string) => string | undefined,
  ): Promise<void> {
    const missing: string[] = [];

    for (const iconName of new Set(iconNames)) {
      if (!iconName) {
        continue;
      }

      const located = this.findEntry(iconName);
      if (!located) {
        missing.push(iconName);
        continue;
      }

      await this.resolver.resolve(
        this.requestFor(located, colorOf?.(iconName)),
      );
    }

    if (missing.length > 0) {
      logger.warn(
        `${missing.length} icon(s) could not be found in any installed pack: ${missing
          .slice(0, 10)
          .join(', ')}`,
      );

      if (!this.plugin.getSettings().iconsBackgroundCheckEnabled) {
        new Notice(
          `[${config.PLUGIN_NAME}] ${missing.length} icon(s) are missing an installed icon pack.`,
          5000,
        );
      }
    }

    this.releaseSources();
  }

  /**
   * Whether an icon identifier resolves to something installed.
   */
  public doesIconExists(iconNameWithPrefix: string): boolean {
    return this.findEntry(iconNameWithPrefix) !== undefined;
  }

  public doesIconPackExist(iconPackName: string): Promise<boolean> {
    return this.fs.exists(joinPath(this.path, iconPackName));
  }

  /**
   * Every icon across every pack, as metadata.
   *
   * Safe to call for large packs: these are names, not parsed SVG documents.
   */
  public getAllEntries(): LocatedEntry[] {
    const all: LocatedEntry[] = [];

    for (const pack of this.iconPacks) {
      for (const entry of pack.getEntries()) {
        all.push({ pack, entry });
      }
    }

    return all;
  }

  /**
   * Total number of icons installed.
   */
  public get totalIcons(): number {
    return this.iconPacks.reduce((total, pack) => total + pack.size, 0);
  }

  public async createDefaultDirectory(): Promise<void> {
    await ensureDirectory(this.fs, this.path);
  }

  /**
   * Installs a pack from a downloaded archive, leaving it compressed.
   */
  public async registerIconPack(
    name: string,
    arrayBuffer: ArrayBuffer,
    packVersion?: string,
  ): Promise<IconPack> {
    await this.createDefaultDirectory();

    const zipPath = joinPath(this.path, `${name}.zip`);
    await this.fs.writeBinary(zipPath, arrayBuffer);

    const existing = this.getIconPackByName(name);
    if (existing) {
      await this.removeIconPack(existing, { deleteFiles: false });
    }

    const pack = new IconPack(
      name,
      new ZipSource(this.fs, zipPath, getExtraPath(name) ?? ''),
      false,
      name === LUCIDE_ICON_PACK_NAME ? 'Li' : undefined,
    );

    this.iconPacks.push(pack);
    await this.loadIndex(pack, true, packVersion);
    pack.dispose();

    return pack;
  }

  /**
   * The published version a pack was installed from, if it came from the
   * catalog. Used to offer updates.
   */
  public async getInstalledPackVersion(
    packName: string,
  ): Promise<string | undefined> {
    const stored = await this.indexStore.load(packName);
    return stored?.packVersion;
  }

  /**
   * Creates an empty icon pack for the user to fill.
   *
   * @param name Pack name, which becomes its folder or archive name.
   * @param style `folder` keeps icons as loose files, which is easiest to edit
   * by hand. `zip` keeps them in a single archive, which is far kinder to file
   * syncing and to directory watchers when the pack holds thousands of icons.
   */
  public async createIconPack(
    name: string,
    style: IconPackSourceType = 'folder',
  ): Promise<IconPack> {
    await this.createDefaultDirectory();

    let pack: IconPack;

    if (style === 'zip') {
      const zipPath = joinPath(this.path, `${name}.zip`);
      await createEmptyZip(this.fs, zipPath);
      pack = new IconPack(name, new ZipSource(this.fs, zipPath), true);
    } else {
      const folder = joinPath(this.path, name);
      await ensureDirectory(this.fs, folder);
      pack = new IconPack(name, new FolderSource(this.fs, folder), true);
    }

    this.iconPacks.push(pack);
    await this.loadIndex(pack, true);

    return pack;
  }

  /**
   * Where a pack lives on disk: its archive, or its directory.
   */
  public getPackLocation(pack: IconPack): string {
    return pack.getSource().type === 'zip'
      ? joinPath(this.path, `${pack.getName()}.zip`)
      : joinPath(this.path, pack.getName());
  }

  /**
   * Adds SVG files to a pack, whichever way it stores them, and re-indexes it.
   *
   * @param pack Pack to add to.
   * @param files Filenames and SVG markup to write.
   * @returns How many icons were added.
   */
  public async addIconsToPack(
    pack: IconPack,
    files: { name: string; content: string }[],
  ): Promise<AddIconsResult> {
    // Validated here rather than at each call site: a file dialog's `accept`
    // is only a hint, so anything can arrive. Content is checked instead of
    // the extension, which catches a mislabelled file as well as a raster one
    // renamed to `.svg`. Writing those through would put unusable files in the
    // pack and report them as added.
    const rejected: string[] = [];
    const accepted = files.filter((file) => {
      if (/<svg[\s>]/i.test(file.content)) {
        return true;
      }
      rejected.push(file.name);
      return false;
    });

    const named = accepted.map((file) => ({
      path: file.name.toLowerCase().endsWith('.svg')
        ? file.name
        : `${file.name}.svg`,
      content: file.content,
    }));

    if (named.length === 0) {
      return { added: 0, rejected };
    }

    const location = this.getPackLocation(pack);

    if (pack.getSource().type === 'zip') {
      // The archive is rewritten, so anything holding it open must let go
      // first or it would keep serving the previous contents.
      pack.getSource().dispose();
      await addFilesToZip(this.fs, location, named);
    } else {
      await ensureDirectory(this.fs, location);
      for (const file of named) {
        await this.fs.write(joinPath(location, file.path), file.content);
      }
    }

    // Re-index so the new icons are addressable and any name collisions they
    // introduce are resolved consistently with the rest of the pack.
    await this.refreshIconPack(pack.getName());

    return { added: named.length, rejected };
  }

  /**
   * Removes a pack, its index and its cached icons.
   *
   * @param options.deleteFiles Whether the pack's own files are deleted too.
   */
  public async removeIconPack(
    iconPack: IconPack,
    options: { deleteFiles?: boolean } = {},
  ): Promise<void> {
    const { deleteFiles = true } = options;
    const name = iconPack.getName();

    // Remove exactly one pack. The previous implementation omitted splice's
    // delete count, which dropped every pack from this index onwards.
    const index = this.iconPacks.findIndex((pack) => pack.getName() === name);
    if (index > -1) {
      this.iconPacks.splice(index, 1);
    }

    iconPack.dispose();

    if (!deleteFiles) {
      // Being replaced rather than uninstalled, so nothing is retained.
      this.resolver.forgetLibrary(name);
      await this.cacheStore.removeForLibrary(name);
      await this.indexStore.delete(name);
      return;
    }

    // The pack's own files go, but its index and cached icons stay: anything
    // already applied in the vault has to keep rendering. The pack is kept as
    // a detached one so those icons can still be looked up by name.
    const detached = new IconPack(
      name,
      new NullSource(),
      false,
      iconPack.getPrefix(),
    );
    const stored = await this.indexStore.load(name);
    if (stored && stored.entries.length > 0) {
      detached.setIndex(stored);
      this.detachedPacks.push(detached);
    }

    const folder = joinPath(this.path, name);
    if (await this.fs.exists(folder)) {
      await this.fs.rmdir(folder, true);
    }

    const zip = joinPath(this.path, `${name}.zip`);
    if (await this.fs.exists(zip)) {
      await this.fs.remove(zip);
    }
  }

  /**
   * Moves every pack to a new icon packs directory after the setting changed.
   */
  public async moveIconPackDirectories(
    from: string,
    to: string,
  ): Promise<void> {
    from = normalizePath(from);
    to = normalizePath(to);

    if (from === to) {
      return;
    }

    await ensureDirectory(this.fs, to);
    new Notice(`[${config.PLUGIN_NAME}] Moving icon packs...`);

    const listing = await this.safeList(from);

    for (const file of listing.files) {
      if (!file.endsWith('.zip')) {
        continue;
      }

      const name = basename(file);
      await this.fs.writeBinary(
        joinPath(to, name),
        await this.fs.readBinary(file),
      );
      await this.fs.remove(file);
    }

    for (const folder of listing.folders) {
      const name = basename(folder);
      if (isReservedDirectory(name)) {
        // Generated state is rebuilt in the new location rather than moved.
        await this.fs.rmdir(folder, true);
        continue;
      }

      await this.copyDirectory(folder, joinPath(to, name));
      await this.fs.rmdir(folder, true);
    }

    new Notice(`[${config.PLUGIN_NAME}] ...moved icon packs.`);
  }

  private async copyDirectory(from: string, to: string): Promise<void> {
    await ensureDirectory(this.fs, to);
    const listing = await this.safeList(from);

    for (const file of listing.files) {
      await this.fs.write(
        joinPath(to, basename(file)),
        await this.fs.read(file),
      );
    }

    for (const folder of listing.folders) {
      await this.copyDirectory(folder, joinPath(to, basename(folder)));
    }
  }

  /**
   * Points the manager at a new icon packs directory.
   */
  public setPath(newPath: string): void {
    this.path = normalizePath(newPath);
    this.indexStore.setIconPacksPath(this.path);
    this.cacheStore.setIconPacksPath(this.path);
  }

  /**
   * Lists a directory, treating a missing one as empty.
   */
  private async safeList(
    path: string,
  ): Promise<{ files: string[]; folders: string[] }> {
    if (!(await this.fs.exists(path))) {
      return { files: [], folders: [] };
    }

    try {
      return await this.fs.list(path);
    } catch (error) {
      logger.warn(`Could not list '${path}' (${error})`);
      return { files: [], folders: [] };
    }
  }

  /**
   * Lets every pack release its open archive.
   */
  public releaseSources(): void {
    for (const pack of this.iconPacks) {
      pack.dispose();
    }
  }

  public getPath(): string {
    return this.path;
  }

  public getIconPacks(): IconPack[] {
    return this.iconPacks;
  }

  /**
   * Whether a pack is currently installed, as opposed to detached.
   *
   * Detached packs can still resolve icons that are already applied, but they
   * are not a place to pick new ones from.
   */
  public isPackInstalled(name: string): boolean {
    return this.iconPacks.some((pack) => pack.getName() === name);
  }

  public getIconPackByName(name: string): IconPack | undefined {
    return this.iconPacks.find((iconPack) => iconPack.getName() === name);
  }

  public getIconPackByPrefix(prefix: string): IconPack | undefined {
    return this.iconPacks.find((iconPack) => iconPack.getPrefix() === prefix);
  }

  public getLucideIconPack(): LucideIconPack {
    return this.lucideIconPack;
  }

  public getCacheStore(): IconCacheStore {
    return this.cacheStore;
  }

  public getResolver(): IconResolver {
    return this.resolver;
  }
}

/**
 * Strips a leading slash, which Obsidian's adapter treats as equivalent to no
 * slash but which would break path comparisons.
 */
function normalizePath(path: string): string {
  return path.startsWith('/') ? path.slice(1) : path;
}

function basename(path: string): string {
  return path.substring(path.lastIndexOf('/') + 1);
}
