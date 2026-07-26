import JSZip, { loadAsync } from 'jszip';
import { FileSystem } from './file-system';

/**
 * Mutating an icon pack archive in place.
 *
 * Zips cannot be appended to incrementally, so adding an icon means reading the
 * archive, inserting the entry and writing the whole thing back. That is fine
 * for the occasional manual addition, and it means a zipped pack is just as
 * editable from inside the app as a folder pack is.
 */

/** A file to place inside an archive. */
export interface ZipEntry {
  /** Path inside the archive, e.g. `weapons/sword.svg`. */
  path: string;
  content: string;
}

/**
 * Creates an empty archive at the given path.
 *
 * JSZip cannot express a truly empty zip that every tool accepts, so a short
 * README is included to give the archive a single entry. It is ignored by the
 * indexer, which only looks at `.svg` files.
 */
export async function createEmptyZip(
  fs: FileSystem,
  zipPath: string,
): Promise<void> {
  const zip = new JSZip();
  zip.file(
    'README.txt',
    'Icon pack archive. Add .svg files here, then use the rescan button in ' +
      'the plugin settings to pick them up.\n',
  );

  await fs.writeBinary(
    zipPath,
    await zip.generateAsync({ type: 'arraybuffer' }),
  );
}

/**
 * Adds files to an existing archive, replacing any entry with the same path.
 *
 * @param fs File system to read and write the archive through.
 * @param zipPath Vault path of the archive.
 * @param entries Files to insert.
 * @returns The names of the entries that were written.
 */
export async function addFilesToZip(
  fs: FileSystem,
  zipPath: string,
  entries: ZipEntry[],
): Promise<string[]> {
  const zip: JSZip = (await fs.exists(zipPath))
    ? await loadAsync(await fs.readBinary(zipPath))
    : new JSZip();

  for (const entry of entries) {
    zip.file(entry.path, entry.content);
  }

  // Written in one pass at the end so a failure part-way through cannot leave
  // a half-written archive behind.
  await fs.writeBinary(
    zipPath,
    await zip.generateAsync({
      type: 'arraybuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 9 },
    }),
  );

  return entries.map((entry) => entry.path);
}
