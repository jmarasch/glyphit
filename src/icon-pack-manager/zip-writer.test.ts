import { it, describe, expect } from 'vitest';
import JSZip from 'jszip';
import { addFilesToZip, createEmptyZip } from './zip-writer';
import { ZipSource } from './zip-source';
import { buildIndex } from './indexer';
import { MemoryFileSystem, svgFixture } from './test-utils';

const ZIP = 'icons/custom.zip';

async function entriesOf(fs: MemoryFileSystem): Promise<string[]> {
  const zip = await JSZip.loadAsync(await fs.readBinary(ZIP));
  return Object.keys(zip.files).sort();
}

describe('createEmptyZip', () => {
  it('should produce a readable archive with no icons', async () => {
    const fs = new MemoryFileSystem();

    await createEmptyZip(fs, ZIP);

    const source = new ZipSource(fs, ZIP);
    expect(await source.listEntries()).toEqual([]);
    // Readable rather than a zero-byte file.
    expect((await entriesOf(fs)).length).toBeGreaterThan(0);
  });
});

describe('addFilesToZip', () => {
  it('should create the archive when it does not exist yet', async () => {
    const fs = new MemoryFileSystem();

    await addFilesToZip(fs, ZIP, [
      { path: 'sword.svg', content: svgFixture('sword') },
    ]);

    const source = new ZipSource(fs, ZIP);
    expect((await source.listEntries()).map((e) => e.path)).toEqual([
      'sword.svg',
    ]);
  });

  it('should add to an existing archive without losing its contents', async () => {
    const fs = new MemoryFileSystem();
    await addFilesToZip(fs, ZIP, [
      { path: 'sword.svg', content: svgFixture('sword') },
    ]);

    await addFilesToZip(fs, ZIP, [
      { path: 'shield.svg', content: svgFixture('shield') },
    ]);

    const source = new ZipSource(fs, ZIP);
    expect((await source.listEntries()).map((e) => e.path).sort()).toEqual([
      'shield.svg',
      'sword.svg',
    ]);
  });

  it('should replace an entry with the same path', async () => {
    const fs = new MemoryFileSystem();
    await addFilesToZip(fs, ZIP, [
      { path: 'sword.svg', content: svgFixture('old') },
    ]);

    await addFilesToZip(fs, ZIP, [
      { path: 'sword.svg', content: svgFixture('new') },
    ]);

    const source = new ZipSource(fs, ZIP);
    expect(await source.readEntry('sword.svg')).toBe(svgFixture('new'));
    expect((await source.listEntries()).length).toBe(1);
  });

  it('should keep icons in subfolders addressable', async () => {
    const fs = new MemoryFileSystem();

    await addFilesToZip(fs, ZIP, [
      { path: 'melee/sword.svg', content: svgFixture('melee') },
      { path: 'ranged/sword.svg', content: svgFixture('ranged') },
    ]);

    const index = await buildIndex('custom', 'Cu', new ZipSource(fs, ZIP));

    // Same filename in two folders, so both get qualified.
    expect(index.entries.map((e) => e.id).sort()).toEqual([
      'CuMeleeSword',
      'CuRangedSword',
    ]);
  });

  it('should be indexable immediately after writing', async () => {
    const fs = new MemoryFileSystem();
    await createEmptyZip(fs, ZIP);
    await addFilesToZip(fs, ZIP, [
      { path: 'axe.svg', content: svgFixture('axe') },
    ]);

    const index = await buildIndex('custom', 'Cu', new ZipSource(fs, ZIP));

    expect(index.entries.map((e) => e.id)).toEqual(['CuAxe']);
  });
});

describe('icon content validation', () => {
  // Mirrors the check in `addIconsToPack`: content decides, not the extension.
  const isSvg = (content: string) => /<svg[\s>]/i.test(content);

  it('should accept real svg markup', () => {
    expect(isSvg(svgFixture('ok'))).toBe(true);
    expect(isSvg('<?xml version="1.0"?>\n<svg viewBox="0 0 1 1"></svg>')).toBe(
      true,
    );
  });

  it('should reject a raster image renamed to .svg', () => {
    // A PNG read as text starts with its magic bytes, not markup.
    expect(isSvg('\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR')).toBe(false);
  });

  it('should reject empty and non-markup files', () => {
    expect(isSvg('')).toBe(false);
    expect(isSvg('just some text')).toBe(false);
  });

  it('should not be fooled by the word svg in prose', () => {
    expect(isSvg('this file mentions svg but has no markup')).toBe(false);
  });
});
