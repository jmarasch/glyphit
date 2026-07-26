import { it, describe, expect, beforeEach } from 'vitest';
import JSZip from 'jszip';
import { IconCacheStore } from './cache-store';
import { IndexStore } from './index-store';
import { IconResolver } from './resolver';
import { ZipSource } from './zip-source';
import { NullSource } from './null-source';
import { buildIndex } from './indexer';
import { IconPack } from './icon-pack';
import { MemoryFileSystem, svgFixture } from './test-utils';

const PACKS = 'icons';
const LIBRARY = 'doomed-pack';
const ZIP = `${PACKS}/${LIBRARY}.zip`;

/**
 * An icon applied in a vault must keep rendering after its pack is removed:
 * uninstalling a pack takes away a place to find new icons, not the icons
 * already in use.
 */
describe('icons outlive their pack', () => {
  let fs: MemoryFileSystem;
  let cache: IconCacheStore;
  let indexStore: IndexStore;

  beforeEach(async () => {
    const zip = new JSZip();
    zip.file('sword.svg', svgFixture('sword'));
    fs = new MemoryFileSystem();
    fs.set(ZIP, await zip.generateAsync({ type: 'arraybuffer' }));
    cache = new IconCacheStore(fs, PACKS);
    indexStore = new IndexStore(fs, PACKS);
  });

  it('should resolve from cache once the archive is gone', async () => {
    // Use the icon while the pack is installed, which caches it.
    const source = new ZipSource(fs, ZIP);
    const index = await buildIndex(LIBRARY, 'Dp', source);
    await indexStore.save(index);

    const entry = index.entries[0];
    const resolver = new IconResolver(cache);
    await resolver.resolve({
      entry,
      library: LIBRARY,
      prefix: 'Dp',
      source,
    });
    expect(await cache.list()).toHaveLength(1);

    // The pack is uninstalled: its archive goes, its index and cache stay.
    await fs.remove(ZIP);

    // A later session, with nothing to read the icon from.
    const detached = new IconPack(LIBRARY, new NullSource(), false, 'Dp');
    const stored = await indexStore.load(LIBRARY);
    expect(stored).not.toBeNull();
    detached.setIndex(stored!);

    const icon = await new IconResolver(cache).resolve({
      entry: detached.getEntry('DpSword')!,
      library: LIBRARY,
      prefix: 'Dp',
      source: detached.getSource(),
    });

    expect(icon).not.toBeNull();
    expect(icon!.svgElement).toContain('sword');
  });

  it('should still name its icons so they can be looked up', async () => {
    const index = await buildIndex(LIBRARY, 'Dp', new ZipSource(fs, ZIP));
    await indexStore.save(index);
    await fs.remove(ZIP);

    const detached = new IconPack(LIBRARY, new NullSource(), false, 'Dp');
    detached.setIndex((await indexStore.load(LIBRARY))!);

    expect(detached.getEntry('DpSword')?.id).toBe('DpSword');
    expect(detached.size).toBe(1);
  });

  it('should report nothing to browse, so it cannot be added to', async () => {
    const source = new NullSource();

    expect(await source.listEntries()).toEqual([]);
    expect(await source.readEntry()).toBeNull();
  });

  it('should return null for an icon that was never cached', async () => {
    const index = await buildIndex(LIBRARY, 'Dp', new ZipSource(fs, ZIP));
    await indexStore.save(index);
    await fs.remove(ZIP);

    const detached = new IconPack(LIBRARY, new NullSource(), false, 'Dp');
    detached.setIndex((await indexStore.load(LIBRARY))!);

    // Never used while installed, so there is no cached copy to fall back to.
    const icon = await new IconResolver(cache).resolve({
      entry: detached.getEntry('DpSword')!,
      library: LIBRARY,
      prefix: 'Dp',
      source: detached.getSource(),
    });

    expect(icon).toBeNull();
  });
});

describe('pruning leftovers', () => {
  it('should keep a detached pack while any of its icons is in use', async () => {
    const zip = new JSZip();
    zip.file('sword.svg', svgFixture('sword'));
    const fs = new MemoryFileSystem();
    fs.set(ZIP, await zip.generateAsync({ type: 'arraybuffer' }));

    const indexStore = new IndexStore(fs, PACKS);
    const index = await buildIndex(LIBRARY, 'Dp', new ZipSource(fs, ZIP));
    await indexStore.save(index);

    expect(await indexStore.load(LIBRARY)).not.toBeNull();
    // Referenced, so the index has to stay: it is the only thing mapping
    // `DpSword` onto its cached file.
    const referenced = new Set(['DpSword']);
    expect(index.entries.some((entry) => referenced.has(entry.id))).toBe(true);
  });

  it('should be releasable once nothing refers to it', async () => {
    const zip = new JSZip();
    zip.file('sword.svg', svgFixture('sword'));
    const fs = new MemoryFileSystem();
    fs.set(ZIP, await zip.generateAsync({ type: 'arraybuffer' }));

    const indexStore = new IndexStore(fs, PACKS);
    const index = await buildIndex(LIBRARY, 'Dp', new ZipSource(fs, ZIP));
    await indexStore.save(index);
    await indexStore.delete(LIBRARY);

    expect(await indexStore.load(LIBRARY)).toBeNull();
    expect(await indexStore.listIndexedPacks()).not.toContain(LIBRARY);
  });

  it('should list indexed packs so orphans can be found', async () => {
    const fs = new MemoryFileSystem();
    const indexStore = new IndexStore(fs, PACKS);
    const zip = new JSZip();
    zip.file('sword.svg', svgFixture('sword'));
    fs.set(ZIP, await zip.generateAsync({ type: 'arraybuffer' }));
    await indexStore.save(
      await buildIndex(LIBRARY, 'Dp', new ZipSource(fs, ZIP)),
    );

    expect(await indexStore.listIndexedPacks()).toEqual([LIBRARY]);
  });
});
