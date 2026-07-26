/**
 * The slice of Obsidian's `DataAdapter` that the icon pack layer needs.
 *
 * Depending on this interface rather than on `GlyphItPlugin` keeps the sources,
 * the indexer and the cache independently testable: a plain object literal is
 * enough to exercise them, no Obsidian app instance required. Obsidian's real
 * adapter satisfies this shape structurally, so it can be passed directly.
 */
export interface FileSystem {
  exists(path: string): Promise<boolean>;
  read(path: string): Promise<string>;
  readBinary(path: string): Promise<ArrayBuffer>;
  write(path: string, data: string): Promise<void>;
  writeBinary(path: string, data: ArrayBuffer): Promise<void>;
  remove(path: string): Promise<void>;
  mkdir(path: string): Promise<void>;
  rmdir(path: string, recursive: boolean): Promise<void>;
  list(path: string): Promise<{ files: string[]; folders: string[] }>;
  stat(path: string): Promise<{ size: number; mtime: number } | null>;
}

/**
 * Joins path segments with `/`, dropping empty segments so that callers do not
 * have to special-case an empty directory.
 */
export function joinPath(...segments: string[]): string {
  return segments.filter((segment) => segment !== '').join('/');
}

/**
 * Ensures a directory exists, creating it when missing.
 *
 * @returns `true` if the directory had to be created.
 */
export async function ensureDirectory(
  fs: FileSystem,
  path: string,
): Promise<boolean> {
  if (await fs.exists(path)) {
    return false;
  }

  await fs.mkdir(path);
  return true;
}
