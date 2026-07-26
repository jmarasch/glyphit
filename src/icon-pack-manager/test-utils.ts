import { FileSystem } from './file-system';

/**
 * An in-memory {@link FileSystem} for tests.
 *
 * Directories are implicit: any path that is a prefix of a stored file is
 * treated as an existing folder, which matches how Obsidian's adapter behaves
 * closely enough for the icon pack layer.
 */
export class MemoryFileSystem implements FileSystem {
  private readonly files = new Map<string, string | ArrayBuffer>();
  private readonly dirs = new Set<string>();
  private readonly mtimes = new Map<string, number>();

  /** Number of reads performed, for asserting on laziness. */
  public reads = 0;

  constructor(initial: Record<string, string | ArrayBuffer> = {}) {
    for (const [path, content] of Object.entries(initial)) {
      this.set(path, content);
    }
  }

  /**
   * Seeds a file and every directory above it.
   */
  public set(path: string, content: string | ArrayBuffer, mtime = 1): void {
    this.files.set(path, content);
    this.mtimes.set(path, mtime);

    const segments = path.split('/');
    for (let i = 1; i < segments.length; i++) {
      const dir = segments.slice(0, i).join('/');
      this.dirs.add(dir);
      if (!this.mtimes.has(dir)) {
        this.mtimes.set(dir, mtime);
      }
    }
  }

  public async exists(path: string): Promise<boolean> {
    return this.files.has(path) || this.dirs.has(path);
  }

  public async read(path: string): Promise<string> {
    this.reads++;
    const content = this.files.get(path);
    if (content === undefined) {
      throw new Error(`ENOENT: ${path}`);
    }
    return content as string;
  }

  public async readBinary(path: string): Promise<ArrayBuffer> {
    this.reads++;
    const content = this.files.get(path);
    if (content === undefined) {
      throw new Error(`ENOENT: ${path}`);
    }
    return content as ArrayBuffer;
  }

  public async write(path: string, data: string): Promise<void> {
    this.set(path, data);
  }

  public async writeBinary(path: string, data: ArrayBuffer): Promise<void> {
    this.set(path, data);
  }

  public async remove(path: string): Promise<void> {
    this.files.delete(path);
    this.mtimes.delete(path);
  }

  public async mkdir(path: string): Promise<void> {
    this.dirs.add(path);
    this.mtimes.set(path, 1);
  }

  public async rmdir(path: string, recursive: boolean): Promise<void> {
    this.dirs.delete(path);
    if (!recursive) {
      return;
    }

    for (const file of [...this.files.keys()]) {
      if (file.startsWith(`${path}/`)) {
        this.files.delete(file);
      }
    }
    for (const dir of [...this.dirs]) {
      if (dir.startsWith(`${path}/`)) {
        this.dirs.delete(dir);
      }
    }
  }

  public async list(
    path: string,
  ): Promise<{ files: string[]; folders: string[] }> {
    const prefix = path === '' ? '' : `${path}/`;
    const files: string[] = [];
    const folders = new Set<string>();

    for (const file of this.files.keys()) {
      if (!file.startsWith(prefix)) {
        continue;
      }
      const rest = file.substring(prefix.length);
      if (rest.includes('/')) {
        folders.add(prefix + rest.split('/')[0]);
      } else {
        files.push(file);
      }
    }

    for (const dir of this.dirs) {
      if (dir.startsWith(prefix) && dir !== path) {
        const rest = dir.substring(prefix.length);
        if (!rest.includes('/')) {
          folders.add(dir);
        }
      }
    }

    return { files, folders: [...folders] };
  }

  public async stat(
    path: string,
  ): Promise<{ size: number; mtime: number } | null> {
    if (!(await this.exists(path))) {
      return null;
    }

    const content = this.files.get(path);
    const size =
      typeof content === 'string' ? content.length : (content?.byteLength ?? 0);

    return { size, mtime: this.mtimes.get(path) ?? 1 };
  }
}

/**
 * A minimal but valid SVG, for tests that only care about plumbing.
 */
export const svgFixture = (marker: string): string =>
  `<svg viewBox="0 0 24 24"><path d="${marker}"/></svg>`;
