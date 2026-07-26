import { it, describe, expect } from 'vitest';
import {
  commonRootOf,
  generatePrefix,
  nextIdentifier,
  resolveEntryIds,
} from './naming';
import { RawEntry } from './types';

const entries = (...paths: string[]): RawEntry[] =>
  paths.map((path) => ({ path }));

describe('generatePrefix', () => {
  it('should take one letter per hyphen separated segment', () => {
    expect(generatePrefix('game-icons.net.svg')).toBe('Gi');
    expect(generatePrefix('font-awesome-solid')).toBe('Fas');
    expect(generatePrefix('rpg-awesome')).toBe('Ra');
  });

  it('should take the first two characters when there is no hyphen', () => {
    expect(generatePrefix('boxicons')).toBe('Bo');
    expect(generatePrefix('octicons')).toBe('Oc');
  });
});

describe('commonRootOf', () => {
  it('should strip the boilerplate directories of a real pack layout', () => {
    const root = commonRootOf([
      'icons/ffffff/transparent/1x1/lorc/sandstorm.svg',
      'icons/ffffff/transparent/1x1/delapouite/acorn.svg',
      'icons/ffffff/transparent/1x1/skoll/glock.svg',
    ]);

    expect(root).toBe('icons/ffffff/transparent/1x1/');
  });

  it('should return an empty string when paths share no directory', () => {
    expect(commonRootOf(['a/one.svg', 'b/two.svg'])).toBe('');
    expect(commonRootOf(['one.svg', 'two.svg'])).toBe('');
  });

  it('should handle a single path and an empty list', () => {
    expect(commonRootOf(['a/b/one.svg'])).toBe('a/b/');
    expect(commonRootOf([])).toBe('');
  });
});

describe('resolveEntryIds', () => {
  it('should keep short names for filenames that are unique', () => {
    const result = resolveEntryIds(
      'Gi',
      entries('root/lorc/acorn.svg', 'root/skoll/glock.svg'),
    );

    expect(result.map((entry) => entry.id)).toEqual(['GiAcorn', 'GiGlock']);
  });

  it('should fold the folder in only for colliding filenames', () => {
    const result = resolveEntryIds(
      'Gi',
      entries(
        'root/lorc/sandstorm.svg',
        'root/delapouite/sandstorm.svg',
        'root/lorc/acorn.svg',
      ),
    );

    expect(result.map((entry) => entry.id).sort()).toEqual([
      'GiAcorn',
      'GiDelapouiteSandstorm',
      'GiLorcSandstorm',
    ]);
  });

  it('should produce ids that split back into prefix and name', () => {
    const [entry] = resolveEntryIds(
      'Gi',
      entries('root/lorc/sandstorm.svg', 'root/delapouite/sandstorm.svg'),
    );

    const split = nextIdentifier(entry.id);
    expect(entry.id.substring(0, split)).toBe('Gi');
    expect(entry.id.substring(split)).toBe(entry.name);
  });

  it('should normalize hyphenated folders and filenames', () => {
    const result = resolveEntryIds(
      'Gi',
      entries(
        'root/caro-asercion/arrow-scope.svg',
        'root/lorc/arrow-scope.svg',
      ),
    );

    expect(result.map((entry) => entry.id).sort()).toEqual([
      'GiCaroAsercionArrowScope',
      'GiLorcArrowScope',
    ]);
  });

  it('should drop folder segments that are common to the colliding group', () => {
    const result = resolveEntryIds(
      'Gi',
      entries('a/shared/icon.svg', 'b/shared/icon.svg'),
    );

    expect(result.map((entry) => entry.id)).toEqual(['GiAIcon', 'GiBIcon']);
  });

  it('should qualify parallel variant trees by the variant segment alone', () => {
    // The real pack ships every icon twice, under a black and a white tree.
    // Only the colour segment differs, so only it should reach the name.
    const result = resolveEntryIds(
      'Gi',
      entries(
        'icons/000000/transparent/1x1/lorc/sandstorm.svg',
        'icons/ffffff/transparent/1x1/lorc/sandstorm.svg',
      ),
    );

    expect(result.map((entry) => entry.id)).toEqual([
      'Gi000000Sandstorm',
      'GiFfffffSandstorm',
    ]);
  });

  it('should add the author segment only when the author also differs', () => {
    const result = resolveEntryIds(
      'Gi',
      entries(
        'icons/000000/transparent/1x1/lorc/bat.svg',
        'icons/000000/transparent/1x1/skoll/bat.svg',
        'icons/ffffff/transparent/1x1/lorc/bat.svg',
        'icons/ffffff/transparent/1x1/skoll/bat.svg',
      ),
    );

    expect(result.map((entry) => entry.id)).toEqual([
      'Gi000000LorcBat',
      'Gi000000SkollBat',
      'GiFfffffLorcBat',
      'GiFfffffSkollBat',
    ]);
  });

  it('should fall back to a numeric suffix when nothing else disambiguates', () => {
    const result = resolveEntryIds(
      'Gi',
      entries('root/icon.svg', 'root/icon.svg'),
    );

    expect(result.map((entry) => entry.id)).toEqual(['GiIcon', 'GiIcon2']);
  });

  it('should skip icons whose name cannot be addressed', () => {
    const result = resolveEntryIds(
      'Gi',
      entries('root/.hidden.svg', 'root/valid.svg'),
    );

    expect(result.map((entry) => entry.id)).toEqual(['GiValid']);
  });

  it('should record the folder relative to the common root', () => {
    const result = resolveEntryIds(
      'Gi',
      entries(
        'icons/ffffff/transparent/1x1/lorc/sandstorm.svg',
        'icons/ffffff/transparent/1x1/delapouite/sandstorm.svg',
      ),
    );

    expect(result.map((entry) => entry.folder).sort()).toEqual([
      'delapouite',
      'lorc',
    ]);
  });

  it('should leave the folder empty for icons at the pack root', () => {
    const result = resolveEntryIds('Bo', entries('one.svg', 'two.svg'));

    expect(result.map((entry) => entry.folder)).toEqual(['', '']);
    expect(result.map((entry) => entry.id)).toEqual(['BoOne', 'BoTwo']);
  });

  it('should be independent of discovery order', () => {
    const paths = [
      'root/lorc/sandstorm.svg',
      'root/delapouite/sandstorm.svg',
      'root/skoll/glock.svg',
    ];

    const forwards = resolveEntryIds('Gi', entries(...paths));
    const backwards = resolveEntryIds('Gi', entries(...[...paths].reverse()));

    expect(forwards).toEqual(backwards);
  });

  it('should preserve display names for the picker', () => {
    const result = resolveEntryIds('Gi', entries('root/lorc/arrow-scope.svg'));

    expect(result[0].displayName).toBe('arrow-scope');
    expect(result[0].path).toBe('root/lorc/arrow-scope.svg');
  });
});
