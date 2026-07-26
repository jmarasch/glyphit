import { it, describe, expect, vi } from 'vitest';
import {
  generateIcon,
  getNormalizedName,
  getSvgFromLoadedIcon,
  nextIdentifier,
} from './util';
import GlyphItPlugin from '@app/main';
import { IconPack } from './icon-pack';

describe('getNormalizedName', () => {
  it('should return a string with all words capitalized and no spaces or underscores', () => {
    const input = 'this is a test_name';
    const expectedOutput = 'ThisIsATestName';
    expect(getNormalizedName(input)).toEqual(expectedOutput);
  });

  it('should handle input with only one word', () => {
    const input = 'test';
    const expectedOutput = 'Test';
    expect(getNormalizedName(input)).toEqual(expectedOutput);
  });

  it('should handle input with spaces and underscores', () => {
    const input = 'this_is a_test name';
    const expectedOutput = 'ThisIsATestName';
    expect(getNormalizedName(input)).toEqual(expectedOutput);
  });

  it('should handle input with spaces and hyphens', () => {
    const input = 'this-is a-test-name';
    const expectedOutput = 'ThisIsATestName';
    expect(getNormalizedName(input)).toEqual(expectedOutput);
  });
});

describe('nextIdentifier', () => {
  it('should find first uppercase letter or number', () => {
    expect(nextIdentifier('aBcDef')).toBe(1);
    expect(nextIdentifier('a1bcDef')).toBe(1);
    expect(nextIdentifier('aBc123')).toBe(1);
  });

  it('should return 0 when no match found', () => {
    expect(nextIdentifier('abcdef')).toBe(0);
  });

  it('should handle empty string', () => {
    expect(nextIdentifier('')).toBe(0);
  });
});

describe('getSvgFromLoadedIcon', () => {
  // Icons already resolved into memory, which is what the synchronous render
  // path is allowed to see.
  const loaded: Record<string, string> = {
    FaUser: '<svg>user</svg>',
    MdSettings: '<svg>material</svg>',
  };

  const mockPlugin = {
    getIconPackManager: vi.fn(() => ({
      peekIcon: vi.fn((id: string) =>
        loaded[id] ? { svgElement: loaded[id] } : undefined,
      ),
    })),
  } as unknown as GlyphItPlugin;

  it('should find a loaded icon', () => {
    expect(getSvgFromLoadedIcon(mockPlugin, 'Fa', 'User')).toBe(
      '<svg>user</svg>',
    );
  });

  it('should find a loaded icon from another pack', () => {
    expect(getSvgFromLoadedIcon(mockPlugin, 'Md', 'Settings')).toBe(
      '<svg>material</svg>',
    );
  });

  it('should return empty string when the icon is not loaded', () => {
    expect(getSvgFromLoadedIcon(mockPlugin, 'None', 'Missing')).toBe('');
  });
});

describe('generateIcon', () => {
  const mockIconPack = {
    getPrefix: () => 'fa',
    getName: () => 'font-awesome',
  } as IconPack;

  it('should create valid icon structure', () => {
    const result = generateIcon(
      mockIconPack,
      'test',
      '<svg viewBox="0 0 24 24"><path/></svg>',
    );

    expect(result).toEqual({
      name: 'Test',
      prefix: 'fa',
      iconPackName: 'font-awesome',
      displayName: 'test',
      filename: 'test',
      svgContent: '<path/>',
      svgViewbox: 'viewBox="0 0 24 24"',
      svgElement: expect.any(String),
    });
  });

  it('should handle SVG normalization', () => {
    const result = generateIcon(
      mockIconPack,
      'test',
      `
      <svg
        viewBox="0 0 24 24"
        class="test"
      >
        <path />
      </svg>
    `,
    );

    expect(result?.svgContent).toBe('<path />');
    expect(result?.svgViewbox).toBe('viewBox="0 0 24 24"');
  });
});
