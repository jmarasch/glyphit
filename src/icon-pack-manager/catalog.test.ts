import { it, describe, expect } from 'vitest';
import { isNewerVersion, packDownloadUrl, PACK_REPOSITORY } from './catalog';
import type { CatalogPack } from './catalog';

const pack = (over: Partial<CatalogPack> = {}): CatalogPack => ({
  id: 'tabler-icons',
  name: 'Tabler Icons',
  version: '3.1.0',
  file: 'tabler-icons.zip',
  path: '',
  icons: 5219,
  bytes: 2190000,
  homepage: '',
  ...over,
});

describe('packDownloadUrl', () => {
  it('should build a url under the pack repository', () => {
    expect(packDownloadUrl(pack())).toBe(`${PACK_REPOSITORY}/tabler-icons.zip`);
  });

  it('should use the raw content host, not the html one', () => {
    // github.com/<user>/<repo>/raw/... redirects; the raw host serves the
    // bytes directly, which is what `requestUrl` needs.
    expect(PACK_REPOSITORY).toMatch(/^https:\/\/raw\.githubusercontent\.com\//);
  });
});

describe('isNewerVersion', () => {
  it('should detect a newer published version', () => {
    expect(isNewerVersion('3.2.0', '3.1.0')).toBe(true);
    expect(isNewerVersion('4.0.0', '3.9.9')).toBe(true);
    expect(isNewerVersion('16.15.0', '16.5.0')).toBe(true);
  });

  it('should not offer an update for the same or older version', () => {
    expect(isNewerVersion('3.1.0', '3.1.0')).toBe(false);
    expect(isNewerVersion('3.0.0', '3.1.0')).toBe(false);
  });

  it('should compare numerically rather than as text', () => {
    // The bug a string comparison would introduce: '9' > '10'.
    expect(isNewerVersion('10.0.0', '9.0.0')).toBe(true);
    expect(isNewerVersion('9.0.0', '10.0.0')).toBe(false);
  });

  it('should handle versions of differing depth', () => {
    expect(isNewerVersion('4.1', '4.0.9')).toBe(true);
    expect(isNewerVersion('4.1', '4.1.0')).toBe(false);
  });

  it('should say no when either version is unknown', () => {
    // Packs the user made themselves carry no version.
    expect(isNewerVersion('', '3.1.0')).toBe(false);
    expect(isNewerVersion('3.2.0', '')).toBe(false);
  });
});
