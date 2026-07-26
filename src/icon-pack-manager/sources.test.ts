import { it, describe, expect, beforeAll } from 'vitest';
import JSZip from 'jszip';
import { ZipSource } from './zip-source';
import { FolderSource } from './folder-source';
import { MemoryFileSystem, svgFixture } from './test-utils';

/**
 * Builds a real zip archive so the source is exercised against JSZip rather
 * than a stand-in.
 */
async function buildZip(files: Record<string, string>): Promise<ArrayBuffer> {
  const zip = new JSZip();
  for (const [path, content] of Object.entries(files)) {
    zip.file(path, content);
  }
  return zip.generateAsync({ type: 'arraybuffer' });
}

describe('ZipSource', () => {
  let archive: ArrayBuffer;

  beforeAll(async () => {
    archive = await buildZip({
      'icons/lorc/sandstorm.svg': svgFixture('lorc'),
      'icons/delapouite/sandstorm.svg': svgFixture('delapouite'),
      'icons/license.txt': 'not an icon',
      'icons/nested/deep/blade.svg': svgFixture('blade'),
    });
  });

  const sourceFor = (extraPath?: string) => {
    const fs = new MemoryFileSystem();
    fs.set('packs/game.zip', archive);
    return { fs, source: new ZipSource(fs, 'packs/game.zip', extraPath) };
  };

  it('should list only svg entries', async () => {
    const { source } = sourceFor();

    const entries = await source.listEntries();

    expect(entries.map((entry) => entry.path).sort()).toEqual([
      'icons/delapouite/sandstorm.svg',
      'icons/lorc/sandstorm.svg',
      'icons/nested/deep/blade.svg',
    ]);
  });

  it('should restrict entries to the extra path when given', async () => {
    const { source } = sourceFor('icons/lorc/');

    const entries = await source.listEntries();

    expect(entries.map((entry) => entry.path)).toEqual([
      'icons/lorc/sandstorm.svg',
    ]);
  });

  it('should fall back to a version-agnostic path when the pinned one misses', async () => {
    // A predefined pack pins the release directory, which carries a version.
    // A user with a different release installed would otherwise index nothing.
    const archive = await buildZip({
      'fontawesome-free-6.5.1-web/svgs/solid/gear.svg': svgFixture('gear'),
      'fontawesome-free-6.5.1-web/svgs/brands/github.svg': svgFixture('gh'),
    });
    const fs = new MemoryFileSystem();
    fs.set('packs/fa.zip', archive);
    const source = new ZipSource(
      fs,
      'packs/fa.zip',
      'fontawesome-free-7.2.0-web/svgs/solid/',
    );

    const entries = await source.listEntries();

    expect(entries.map((entry) => entry.path)).toEqual([
      'fontawesome-free-6.5.1-web/svgs/solid/gear.svg',
    ]);
  });

  it('should prefer an exact extra path match over the relaxed one', async () => {
    const archive = await buildZip({
      'pack-1.0/svgs/solid/gear.svg': svgFixture('right'),
      'other/svgs/solid/gear.svg': svgFixture('wrong'),
    });
    const fs = new MemoryFileSystem();
    fs.set('packs/p.zip', archive);
    const source = new ZipSource(fs, 'packs/p.zip', 'pack-1.0/svgs/solid/');

    const entries = await source.listEntries();

    expect(entries.map((entry) => entry.path)).toEqual([
      'pack-1.0/svgs/solid/gear.svg',
    ]);
  });

  it('should return nothing when neither the exact nor relaxed path matches', async () => {
    const archive = await buildZip({ 'a/b/c/gear.svg': svgFixture('gear') });
    const fs = new MemoryFileSystem();
    fs.set('packs/p.zip', archive);
    const source = new ZipSource(fs, 'packs/p.zip', 'x-1.0/nope/here/');

    expect(await source.listEntries()).toEqual([]);
  });

  it('should read a single entry back', async () => {
    const { source } = sourceFor();

    const content = await source.readEntry('icons/lorc/sandstorm.svg');

    expect(content).toBe(svgFixture('lorc'));
  });

  it('should distinguish same-named entries in different folders', async () => {
    const { source } = sourceFor();

    expect(await source.readEntry('icons/lorc/sandstorm.svg')).toBe(
      svgFixture('lorc'),
    );
    expect(await source.readEntry('icons/delapouite/sandstorm.svg')).toBe(
      svgFixture('delapouite'),
    );
  });

  it('should return null for a missing entry', async () => {
    const { source } = sourceFor();

    expect(await source.readEntry('icons/nope.svg')).toBeNull();
  });

  it('should parse the archive once across many reads', async () => {
    const { fs, source } = sourceFor();

    await source.listEntries();
    await source.readEntry('icons/lorc/sandstorm.svg');
    await source.readEntry('icons/delapouite/sandstorm.svg');

    expect(fs.reads).toBe(1);
  });

  it('should re-read the archive after being disposed', async () => {
    const { fs, source } = sourceFor();

    await source.listEntries();
    source.dispose();
    await source.listEntries();

    expect(fs.reads).toBe(2);
  });

  it('should share one read between concurrent callers', async () => {
    const { fs, source } = sourceFor();

    await Promise.all([
      source.listEntries(),
      source.listEntries(),
      source.readEntry('icons/lorc/sandstorm.svg'),
    ]);

    expect(fs.reads).toBe(1);
  });

  it('should not cache a failed parse', async () => {
    const fs = new MemoryFileSystem();
    const source = new ZipSource(fs, 'packs/missing.zip');

    await expect(source.listEntries()).rejects.toThrow();

    fs.set('packs/missing.zip', archive);
    expect((await source.listEntries()).length).toBe(3);
  });

  it('should fingerprint from the archive file stat', async () => {
    const { source } = sourceFor();

    const fingerprint = await source.fingerprint();

    expect(fingerprint.size).toBe(archive.byteLength);
    expect(fingerprint.mtime).toBe(1);
  });
});

describe('FolderSource', () => {
  const seeded = () => {
    const fs = new MemoryFileSystem();
    fs.set('packs/custom/one.svg', svgFixture('one'));
    fs.set('packs/custom/sub/two.svg', svgFixture('two'));
    fs.set('packs/custom/sub/deeper/three.svg', svgFixture('three'));
    fs.set('packs/custom/notes.txt', 'ignored');
    return { fs, source: new FolderSource(fs, 'packs/custom') };
  };

  it('should walk subfolders recursively', async () => {
    const { source } = seeded();

    const entries = await source.listEntries();

    expect(entries.map((entry) => entry.path).sort()).toEqual([
      'packs/custom/one.svg',
      'packs/custom/sub/deeper/three.svg',
      'packs/custom/sub/two.svg',
    ]);
  });

  it('should ignore non-svg files', async () => {
    const { source } = seeded();

    const entries = await source.listEntries();

    expect(entries.some((entry) => entry.path.endsWith('.txt'))).toBe(false);
  });

  it('should read an entry back', async () => {
    const { source } = seeded();

    expect(await source.readEntry('packs/custom/sub/two.svg')).toBe(
      svgFixture('two'),
    );
  });

  it('should return null for a missing entry', async () => {
    const { source } = seeded();

    expect(await source.readEntry('packs/custom/nope.svg')).toBeNull();
  });

  it('should return no entries for a directory that does not exist', async () => {
    const fs = new MemoryFileSystem();
    const source = new FolderSource(fs, 'packs/absent');

    expect(await source.listEntries()).toEqual([]);
  });

  it('should fingerprint on the file count', async () => {
    const { source } = seeded();

    expect((await source.fingerprint()).count).toBe(3);
  });
});
