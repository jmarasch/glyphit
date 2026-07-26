import { it, describe, expect, beforeEach } from 'vitest';
import JSZip from 'jszip';
import { IconCacheStore } from './cache-store';
import { IconResolver, ResolveRequest } from './resolver';
import { ZipSource } from './zip-source';
import { buildIndex, isIndexStale } from './indexer';
import { IndexStore } from './index-store';
import { generatePrefix } from './naming';
import { MemoryFileSystem, svgFixture } from './test-utils';
import { IconPackIndex } from './types';

const PACKS = 'icons';
const LIBRARY = 'game-icons.net.svg';
const ZIP = `${PACKS}/${LIBRARY}.zip`;

async function buildArchive(): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file('icons/lorc/sandstorm.svg', svgFixture('lorc-sandstorm'));
  zip.file('icons/skoll/bat.svg', svgFixture('skoll-bat'));
  zip.file('icons/delapouite/bat.svg', svgFixture('delapouite-bat'));
  return zip.generateAsync({ type: 'arraybuffer' });
}

describe('index + cache + resolve', () => {
  let fs: MemoryFileSystem;
  let source: ZipSource;
  let cache: IconCacheStore;
  let resolver: IconResolver;
  let index: IconPackIndex;

  beforeEach(async () => {
    fs = new MemoryFileSystem();
    fs.set(ZIP, await buildArchive());
    source = new ZipSource(fs, ZIP);
    cache = new IconCacheStore(fs, PACKS);
    resolver = new IconResolver(cache);
    index = await buildIndex(LIBRARY, generatePrefix(LIBRARY), source);
  });

  const requestFor = (id: string, foreground?: string): ResolveRequest => {
    const entry = index.entries.find((candidate) => candidate.id === id);
    if (!entry) {
      throw new Error(`no such entry: ${id}`);
    }
    return {
      entry,
      library: LIBRARY,
      prefix: index.prefix,
      source,
      foreground,
    };
  };

  it('should index every icon without decompressing any of them', async () => {
    expect(index.entries).toHaveLength(3);
    expect(index.prefix).toBe('Gi');
    // One read of the archive file, and no per-icon reads.
    expect(fs.reads).toBe(1);
  });

  it('should disambiguate same-named icons from different folders', () => {
    const ids = index.entries.map((entry) => entry.id).sort();
    expect(ids).toEqual(['GiDelapouiteBat', 'GiSandstorm', 'GiSkollBat']);
  });

  it('should resolve an icon out of the zip on first use', async () => {
    const icon = await resolver.resolve(requestFor('GiSandstorm'));

    expect(icon).not.toBeNull();
    expect(icon!.name).toBe('Sandstorm');
    expect(icon!.svgElement).toContain('lorc-sandstorm');
  });

  it('should write a cache file named library-fg-bg-folder-name', async () => {
    await resolver.resolve(requestFor('GiSandstorm'));

    expect(await cache.list()).toEqual([
      'game_icons.net.svg-none-none-lorc-sandstorm.svg',
    ]);
  });

  it('should put the chosen colour in the cache filename', async () => {
    await resolver.resolve(requestFor('GiSandstorm', '#FF8800'));

    expect(await cache.list()).toEqual([
      'game_icons.net.svg-ff8800-none-lorc-sandstorm.svg',
    ]);
  });

  it('should cache each colour of an icon separately', async () => {
    await resolver.resolve(requestFor('GiSandstorm'));
    await resolver.resolve(requestFor('GiSandstorm', '#ff8800'));
    await resolver.resolve(requestFor('GiSandstorm', '#0088ff'));

    expect((await cache.list()).sort()).toEqual([
      'game_icons.net.svg-0088ff-none-lorc-sandstorm.svg',
      'game_icons.net.svg-ff8800-none-lorc-sandstorm.svg',
      'game_icons.net.svg-none-none-lorc-sandstorm.svg',
    ]);
  });

  it('should apply the colour to the cached markup', async () => {
    await resolver.resolve(requestFor('GiSandstorm', '#ff8800'));

    const cached = await fs.read(
      `${PACKS}/.cache/icons/game_icons.net.svg-ff8800-none-lorc-sandstorm.svg`,
    );
    expect(cached).toContain('#ff8800');
  });

  it('should not collide in the cache for same-named icons', async () => {
    await resolver.resolve(requestFor('GiSkollBat'));
    await resolver.resolve(requestFor('GiDelapouiteBat'));

    const files = await cache.list();
    expect(files).toHaveLength(2);
    expect(new Set(files).size).toBe(2);
  });

  it('should serve a second resolve from memory without touching the zip', async () => {
    await resolver.resolve(requestFor('GiSandstorm'));
    const readsAfterFirst = fs.reads;

    await resolver.resolve(requestFor('GiSandstorm'));

    expect(fs.reads).toBe(readsAfterFirst);
  });

  it('should serve from the disk cache in a fresh session', async () => {
    await resolver.resolve(requestFor('GiSandstorm'));

    // A new session: new resolver and a source that has to reopen the archive.
    const freshSource = new ZipSource(fs, ZIP);
    const freshResolver = new IconResolver(cache);
    const entry = index.entries.find((e) => e.id === 'GiSandstorm')!;
    fs.reads = 0;

    const icon = await freshResolver.resolve({
      entry,
      library: LIBRARY,
      prefix: index.prefix,
      source: freshSource,
    });

    expect(icon!.svgElement).toContain('lorc-sandstorm');
    // Exactly one read: the cached svg. The archive was never opened.
    expect(fs.reads).toBe(1);
  });

  it('should expose resolved icons synchronously via peek', async () => {
    expect(resolver.peek(requestFor('GiSandstorm'))).toBeUndefined();

    await resolver.resolve(requestFor('GiSandstorm'));

    expect(resolver.peek(requestFor('GiSandstorm'))!.name).toBe('Sandstorm');
  });

  it('should return null for an icon whose bytes vanished', async () => {
    const entry = { ...index.entries[0], path: 'icons/gone.svg' };

    const icon = await resolver.resolve({
      entry,
      library: LIBRARY,
      prefix: index.prefix,
      source,
    });

    expect(icon).toBeNull();
  });

  it('should rebuild from source when a cache file is corrupt', async () => {
    await resolver.resolve(requestFor('GiSandstorm'));
    await fs.write(
      `${PACKS}/.cache/icons/game_icons.net.svg-none-none-lorc-sandstorm.svg`,
      'not an svg',
    );
    resolver.clear();

    const icon = await resolver.resolve(requestFor('GiSandstorm'));

    expect(icon!.svgElement).toContain('lorc-sandstorm');
  });

  it('should drop cached icons for a library on demand', async () => {
    await resolver.resolve(requestFor('GiSandstorm'));
    await resolver.resolve(requestFor('GiSkollBat'));

    const removed = await cache.removeForLibrary(LIBRARY);

    expect(removed).toBe(2);
    expect(await cache.list()).toEqual([]);
  });
});

describe('index persistence', () => {
  it('should round-trip an index through the store', async () => {
    const fs = new MemoryFileSystem();
    fs.set(ZIP, await buildArchive());
    const store = new IndexStore(fs, PACKS);
    const index = await buildIndex(LIBRARY, 'Gi', new ZipSource(fs, ZIP));

    await store.save(index);

    expect(await store.load(LIBRARY)).toEqual(index);
  });

  it('should report a missing index as absent', async () => {
    const store = new IndexStore(new MemoryFileSystem(), PACKS);

    expect(await store.load(LIBRARY)).toBeNull();
  });

  it('should discard a corrupt index rather than throw', async () => {
    const fs = new MemoryFileSystem();
    fs.set(`${PACKS}/.cache/index/${LIBRARY}.json`, '{ not json');
    const store = new IndexStore(fs, PACKS);

    expect(await store.load(LIBRARY)).toBeNull();
  });

  it('should treat a changed archive as stale', async () => {
    const fs = new MemoryFileSystem();
    fs.set(ZIP, await buildArchive());
    const source = new ZipSource(fs, ZIP);
    const index = await buildIndex(LIBRARY, 'Gi', source);

    expect(isIndexStale(index, await source.fingerprint())).toBe(false);

    // The user replaces the pack with a bigger one.
    fs.set(ZIP, await buildArchive(), 99);
    expect(isIndexStale(index, await source.fingerprint())).toBe(true);
  });

  it('should treat an index from an older schema as stale', async () => {
    const fs = new MemoryFileSystem();
    fs.set(ZIP, await buildArchive());
    const source = new ZipSource(fs, ZIP);
    const index = await buildIndex(LIBRARY, 'Gi', source);

    const old = { ...index, version: 0 };

    expect(isIndexStale(old, await source.fingerprint())).toBe(true);
  });
});
