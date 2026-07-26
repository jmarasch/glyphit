import { it, expect, describe } from 'vitest';
import predefinedIconPacks, { getExtraPath } from './icon-packs';

describe('getExtraPath', () => {
  it('should return the configured extra path for an icon pack', () => {
    // Derived from the pack definition rather than hard-coded, so bumping a
    // bundled pack's version cannot rot this test. The previous version pinned
    // the literal path and had been failing since simple-icons was updated.
    const expected = predefinedIconPacks.simpleIcons.path;

    expect(getExtraPath('simple-icons')).toEqual(expected);
    expect(expected).toMatch(/^simple-icons-[\d.]+\/icons\/$/);
  });

  it('should return `undefined` for a pack with no extra path', () => {
    expect(predefinedIconPacks.remixIcons.path).toBe('');
    expect(getExtraPath('remix-icons')).toBeUndefined();
  });

  it('should return `undefined` for an icon pack that does not exist', () => {
    expect(getExtraPath('non-existent-icon-pack')).toBeUndefined();
  });

  it('should give every predefined pack a name and an https download link', () => {
    for (const [key, pack] of Object.entries(predefinedIconPacks)) {
      expect(pack.name, `${key} is missing a name`).toBeTruthy();
      expect(pack.displayName, `${key} is missing a display name`).toBeTruthy();
      expect(pack.downloadLink, `${key} has a bad link`).toMatch(/^https:/);
    }
  });
});
