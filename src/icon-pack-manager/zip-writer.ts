import { zipSync, unzipSync, strToU8, Zippable } from 'fflate';
import { FileSystem } from './file-system';

/**
 * Mutating an icon pack archive in place.
 *
 * Zips cannot be appended to incrementally, so adding an icon means reading the
 * archive, inserting the entry and writing the whole thing back. That is fine
 * for the occasional manual addition, and it means a zipped pack is just as
 * editable from inside the app as a folder pack is.
 *
 * Only `fflate`'s synchronous API is used. The asynchronous one builds a worker
 * script at runtime and loads it from a blob URL, which defeats static review.
 * Rewriting an archive is a rare, user-initiated action, so paying for it on
 * the main thread is the better trade.
 */

/** Compression level, matching what the icon pack archives already use. */
const COMPRESSION_LEVEL = 9;

/** A file to place inside an archive. */
export interface ZipEntry {
  /** Path inside the archive, e.g. `weapons/sword.svg`. */
  path: string;
  content: string;
}

/**
 * Narrows a view to the exact bytes it covers.
 *
 * `zipSync` can hand back a view onto a larger pooled buffer, so writing
 * `.buffer` straight out would append unrelated trailing bytes to the file.
 */
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

/**
 * Creates an empty archive at the given path.
 *
 * A truly empty zip is not accepted by every tool, so a short README gives the
 * archive a single entry. It is ignored by the indexer, which only looks at
 * `.svg` files.
 */
export async function createEmptyZip(
  fs: FileSystem,
  zipPath: string,
): Promise<void> {
  const zipped = zipSync(
    {
      'README.txt': strToU8(
        'Icon pack archive. Add .svg files here, then use the rescan button ' +
          'in the plugin settings to pick them up.\n',
      ),
    },
    { level: COMPRESSION_LEVEL },
  );

  await fs.writeBinary(zipPath, toArrayBuffer(zipped));
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
  // Everything already in the archive has to be decompressed to be written
  // back out, because a zip cannot be appended to in place.
  const existing: Zippable = (await fs.exists(zipPath))
    ? unzipSync(new Uint8Array(await fs.readBinary(zipPath)))
    : {};

  for (const entry of entries) {
    existing[entry.path] = strToU8(entry.content);
  }

  // Written in one pass at the end so a failure part-way through cannot leave
  // a half-written archive behind.
  await fs.writeBinary(
    zipPath,
    toArrayBuffer(zipSync(existing, { level: COMPRESSION_LEVEL })),
  );

  return entries.map((entry) => entry.path);
}
