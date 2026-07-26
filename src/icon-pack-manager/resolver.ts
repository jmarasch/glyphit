import svg from '@app/lib/util/svg';
import { logger } from '@app/lib/logger';
import { IconCacheStore } from './cache-store';
import { createIcon } from './icon-factory';
import { CacheKeyParts, cacheKey } from './layout';
import { Icon, IconEntry, IconSource } from './types';

/**
 * Everything needed to produce one rendered icon.
 */
export interface ResolveRequest {
  /** The indexed icon to resolve. */
  entry: IconEntry;
  /** Name of the pack the icon belongs to. */
  library: string;
  /** The pack's prefix, e.g. `Gi`. */
  prefix: string;
  /** Where the icon's bytes can be read from on a cache miss. */
  source: IconSource;
  /** Color to draw the icon in, or nullish to inherit from the theme. */
  foreground?: string | null;
  /** Background color, or nullish for none. */
  background?: string | null;
}

/**
 * Produces rendered icons, cheapest source first.
 *
 * Resolution walks three tiers, and stops at the first hit:
 *
 * 1. **Memory** — already resolved this session. Synchronous, and the tier the
 *    render path relies on.
 * 2. **Disk cache** — resolved during an earlier session. One small file read.
 * 3. **The pack itself** — first ever use of this icon. Parses the archive and
 *    inflates one entry, then writes the result to the disk cache so this tier
 *    is not reached again.
 *
 * The practical effect is that a vault only ever pays for the icons it actually
 * uses, no matter how large the installed packs are.
 */
/**
 * How a resolved icon should be retained.
 */
export interface ResolveOptions {
  /**
   * Whether the result is written to the on-disk cache.
   *
   * `true` for icons the vault actually uses. `false` for previews: browsing
   * the picker touches thousands of icons that will never be chosen, and
   * writing each one out would fill the cache with junk on the first search.
   */
  persist?: boolean;
}

/**
 * How many preview icons are held in memory before the oldest are dropped.
 *
 * Scrolling a large pack can touch thousands of icons; without a bound they
 * would all be retained for the rest of the session.
 */
const PREVIEW_MEMORY_LIMIT = 400;

export class IconResolver {
  /**
   * Icons the vault uses. Unbounded: these are needed for rendering and there
   * are only ever as many as the vault refers to.
   */
  private readonly memory = new Map<string, Icon>();

  /**
   * Icons resolved only to draw a preview. Bounded and never written to disk;
   * insertion-ordered so the oldest can be evicted.
   */
  private readonly previews = new Map<string, Icon>();

  constructor(private readonly cache: IconCacheStore) {}

  /**
   * Builds the cache key for a request.
   *
   * The name segment uses the icon's indexed name rather than its original
   * filename, because that name already carries any qualifier needed to make it
   * unique within the pack. Without it, two icons that share a filename in
   * different pack folders would map onto the same cache entry.
   */
  private keyPartsFor(request: ResolveRequest): CacheKeyParts {
    const folder = request.entry.folder;

    return {
      library: request.library,
      foreground: request.foreground,
      background: request.background,
      // Only the immediate parent folder is used, which keeps cache filenames
      // readable; uniqueness is carried by the name segment.
      folder:
        folder === '' ? '' : folder.substring(folder.lastIndexOf('/') + 1),
      name: request.entry.name,
    };
  }

  /**
   * Returns an icon that has already been resolved this session.
   *
   * This is the synchronous entry point used by the render path, which cannot
   * await. Anything it needs is prefetched during start-up.
   *
   * @returns The icon, or `undefined` if it is not in memory.
   */
  public peek(request: ResolveRequest): Icon | undefined {
    const key = cacheKey(this.keyPartsFor(request));
    return this.memory.get(key) ?? this.previews.get(key);
  }

  /**
   * Records a resolved icon in the appropriate tier.
   */
  private remember(key: string, icon: Icon, persist: boolean): void {
    if (persist) {
      this.previews.delete(key);
      this.memory.set(key, icon);
      return;
    }

    this.previews.set(key, icon);

    while (this.previews.size > PREVIEW_MEMORY_LIMIT) {
      const oldest = this.previews.keys().next().value as string | undefined;
      if (oldest === undefined) {
        break;
      }
      this.previews.delete(oldest);
    }
  }

  /**
   * Resolves an icon, reading from the pack only if it has to.
   *
   * @returns The rendered icon, or `null` if its bytes could not be found.
   */
  public async resolve(
    request: ResolveRequest,
    options: ResolveOptions = {},
  ): Promise<Icon | null> {
    const persist = options.persist ?? true;
    const parts = this.keyPartsFor(request);
    const key = cacheKey(parts);

    const memoized = this.memory.get(key) ?? this.previews.get(key);
    if (memoized) {
      // A preview that is now genuinely in use gets promoted and written out.
      if (persist && !this.memory.has(key)) {
        this.remember(key, memoized, true);
        await this.cache.write(parts, memoized.svgElement);
      }
      return memoized;
    }

    const cached = await this.cache.read(parts);
    if (cached !== null) {
      const icon = this.build(request, cached);
      if (icon) {
        this.remember(key, icon, persist);
        return icon;
      }

      // The cached file is unusable; fall through and rebuild it from source.
      logger.warn(`Rebuilding unusable cache entry '${key}'`);
    }

    const markup = await request.source.readEntry(request.entry.path);
    if (markup === null) {
      logger.error(
        `Icon '${request.entry.id}' is missing from pack '${request.library}' (path: ${request.entry.path})`,
      );
      return null;
    }

    const icon = this.build(request, markup);
    if (!icon) {
      return null;
    }

    // Color is applied after normalization, not before: normalizing is what
    // gives the markup a paint attribute to override in the first place.
    if (request.foreground) {
      icon.svgElement = svg.colorize(icon.svgElement, request.foreground);
    }

    this.remember(key, icon, persist);

    if (persist) {
      // The cache stores the icon exactly as it renders, so a cache hit needs
      // no further work.
      await this.cache.write(parts, icon.svgElement);
    }

    return icon;
  }

  /**
   * Resolves many icons, reusing one open archive per pack.
   *
   * Sources keep their parsed archive between reads, so resolving a batch
   * together costs one parse rather than one per icon.
   */
  public async resolveAll(requests: ResolveRequest[]): Promise<Icon[]> {
    const icons: Icon[] = [];

    for (const request of requests) {
      const icon = await this.resolve(request);
      if (icon) {
        icons.push(icon);
      }
    }

    return icons;
  }

  private build(request: ResolveRequest, markup: string): Icon | null {
    return createIcon({
      name: request.entry.name,
      prefix: request.prefix,
      packName: request.library,
      displayName: request.entry.displayName,
      markup,
    });
  }

  /**
   * Forgets every in-memory icon belonging to a pack.
   *
   * Called when a pack is re-indexed or removed, so that stale markup cannot
   * outlive the source it came from.
   */
  public forgetLibrary(library: string): void {
    for (const tier of [this.memory, this.previews]) {
      for (const [key, icon] of tier) {
        if (icon.iconPackName === library) {
          tier.delete(key);
        }
      }
    }
  }

  /**
   * Forgets every in-memory icon.
   */
  public clear(): void {
    this.memory.clear();
    this.previews.clear();
  }

  /**
   * Drops preview icons, which are never needed to render the vault.
   */
  public clearPreviews(): void {
    this.previews.clear();
  }

  /**
   * Number of icons currently held in memory, for diagnostics.
   */
  public get size(): number {
    return this.memory.size;
  }

  /**
   * Number of preview icons held in memory, for diagnostics.
   */
  public get previewSize(): number {
    return this.previews.size;
  }
}
