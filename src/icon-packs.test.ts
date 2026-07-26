import { it, expect, describe } from 'vitest';
import predefinedIconPacks, { getExtraPath } from './icon-packs';

describe('getExtraPath', () => {
  it('should return the configured extra path for a pack that has one', () => {
    // Boxicons keeps its archive's own `svg/` directory.
    expect(predefinedIconPacks.boxicons.path).toBe('svg');
    expect(getExtraPath('boxicons')).toBe('svg');
  });

  it('should return `undefined` for a pack with no extra path', () => {
    expect(predefinedIconPacks.remixIcons.path).toBe('');
    expect(getExtraPath('remix-icons')).toBeUndefined();
  });

  it('should return `undefined` for an icon pack that does not exist', () => {
    expect(getExtraPath('non-existent-icon-pack')).toBeUndefined();
  });

  it('should give every predefined pack a usable source', () => {
    for (const [key, pack] of Object.entries(predefinedIconPacks)) {
      expect(pack.name, `${key} is missing a name`).toBeTruthy();
      expect(pack.displayName, `${key} is missing a display name`).toBeTruthy();

      if (pack.source === 'bundled') {
        // Bundled packs name a file inside the plugin's iconPacks folder.
        expect(pack.downloadLink, `${key} is not a bare filename`).toMatch(
          /^[\w.-]+\.zip$/,
        );
      } else {
        expect(pack.source, `${key} has an unknown source`).toBe('remote');
        expect(pack.downloadLink, `${key} has a bad link`).toMatch(/^https:/);
      }
    }
  });

  it('should not pin a release version in any extra path', () => {
    // Bundled archives are repacked so their icons sit at the root. A path
    // carrying a version number would break the moment the pack was refreshed
    // from a newer upstream release, which is exactly what used to happen.
    for (const [key, pack] of Object.entries(predefinedIconPacks)) {
      expect(pack.path, `${key} pins a version in its extra path`).not.toMatch(
        /\d+\.\d+/,
      );
    }
  });

  it('should give every pack a distinct name', () => {
    const names = Object.values(predefinedIconPacks).map((pack) => pack.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
