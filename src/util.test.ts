import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getAllOpenedFiles,
  isHexadecimal,
  readFileSync,
  removeIconFromIconPack,
  saveIconToIconPack,
  stringToHex,
} from './util';

describe('readFileSync', () => {
  it('should read file content', async () => {
    const mockFileContent = 'Hello World!';
    const mockFile = new Blob([mockFileContent], { type: 'text/plain' });
    const result = await readFileSync(mockFile as any);
    expect(result).toBe(mockFileContent);
  });
});

describe('getAllOpenedFiles', () => {
  it('should return all opened files', () => {
    const plugin: any = {
      app: {
        workspace: {
          getLeavesOfType: () => [
            {
              view: {
                file: {
                  path: 'file/path',
                },
              },
            },
          ],
        },
      },
    };

    const openedFiles = getAllOpenedFiles(plugin);
    expect(openedFiles).toHaveLength(1);
    expect(openedFiles[0]).toEqual({
      path: 'file/path',
      pinned: false,
      leaf: {
        view: {
          file: {
            path: 'file/path',
          },
        },
      },
    });
  });
});

describe('saveIconToIconPack', () => {
  const managerFor = (exists: boolean) => ({
    doesIconExists: vi.fn(() => exists),
    resolveIcon: vi.fn(async () => ({ name: 'Test' })),
  });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should throw when the icon is in no installed pack', () => {
    const manager = managerFor(false);
    const plugin: any = { getIconPackManager: () => manager };

    expect(() => saveIconToIconPack(plugin, 'IbTest')).toThrow(
      /could not be found/,
    );
    expect(manager.resolveIcon).toBeCalledTimes(0);
  });

  it('should resolve the icon so it lands in the cache', () => {
    const manager = managerFor(true);
    const plugin: any = { getIconPackManager: () => manager };

    saveIconToIconPack(plugin, 'IbTest');

    expect(manager.resolveIcon).toBeCalledTimes(1);
    expect(manager.resolveIcon).toBeCalledWith('IbTest');
  });
});

describe('removeIconFromIconPack', () => {
  const managerWith = (located: unknown) => ({
    findEntry: vi.fn(() => located),
    getCacheStore: () => ({ removeForIcon }),
  });
  let removeForIcon: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    removeForIcon = vi.fn(async () => 1);
  });

  it('should keep the cached icon while another path still uses it', () => {
    const manager = managerWith({});
    const plugin: any = {
      getDataPathByValue: () => 'folder/path',
      getIconPackManager: () => manager,
    };

    removeIconFromIconPack(plugin, 'IbTest');

    expect(removeForIcon).toBeCalledTimes(0);
  });

  it('should drop the cached icon once nothing refers to it', () => {
    const entry = { folder: 'lorc', name: 'Test' };
    const manager = managerWith({
      pack: { getName: () => 'icon-brew' },
      entry,
    });
    const plugin: any = {
      getDataPathByValue: () => '',
      getIconPackManager: () => manager,
    };

    removeIconFromIconPack(plugin, 'IbTest');

    expect(removeForIcon).toBeCalledTimes(1);
    expect(removeForIcon).toBeCalledWith('icon-brew', entry);
  });

  it('should do nothing when the icon is in no installed pack', () => {
    const manager = managerWith(undefined);
    const plugin: any = {
      getDataPathByValue: () => '',
      getIconPackManager: () => manager,
    };

    removeIconFromIconPack(plugin, 'IbTest');

    expect(removeForIcon).toBeCalledTimes(0);
  });
});

describe('stringToHex', () => {
  it('should handle strings with leading zeros', () => {
    expect(stringToHex('000000')).toBe('#000000');
    expect(stringToHex('00f')).toBe('#00000f');
  });

  it('should handle strings without leading zeros', () => {
    expect(stringToHex('11c0a1')).toBe('#11c0a1');
    expect(stringToHex('f0f0f0')).toBe('#f0f0f0');
  });

  it('should handle mixed-case hexadecimal strings', () => {
    expect(stringToHex('aBc123')).toBe('#aBc123');
    expect(stringToHex('AbCdEf')).toBe('#AbCdEf');
  });

  it('should return original string if it already starts with #', () => {
    expect(stringToHex('#123456')).toBe('#123456');
  });

  it('should handle empty strings', () => {
    expect(stringToHex('')).toBe('#000000');
  });
});

describe('isHexadecimal', () => {
  it('should return true for valid hexadecimal strings', () => {
    expect(isHexadecimal('000000')).toBe(true);
    expect(isHexadecimal('#000000', true)).toBe(true);
    expect(isHexadecimal('00f')).toBe(true);
    expect(isHexadecimal('#00f', true)).toBe(true);
  });

  it('should return false for invalid hexadecimal strings', () => {
    expect(isHexadecimal('0000000')).toBe(false);
    expect(isHexadecimal('#0000000', true)).toBe(false);
    expect(isHexadecimal('00g')).toBe(false);
    expect(isHexadecimal('#00g', true)).toBe(false);
  });
});
