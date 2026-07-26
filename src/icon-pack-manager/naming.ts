import { IconEntry, RawEntry } from './types';

/**
 * Naming rules for icon packs.
 *
 * Every icon is addressed by a single string that concatenates a short pack
 * prefix with a PascalCase name (e.g. `GiSandstorm`). That string is what ends
 * up in the plugin data and in user frontmatter, so the rules here are a
 * compatibility surface: changing them silently repoints saved icons.
 *
 * The one rule that is new is collision handling. Packs are allowed to contain
 * several icons that share a filename in different subfolders (game-icons.net
 * has 47 such pairs), so a bare filename is not a unique key. When a filename
 * is ambiguous, and only then, the folder is folded into the name. Icons with
 * unique filenames keep their short name, which keeps every pack that has no
 * subfolders byte-for-byte compatible with previous versions.
 */

/**
 * Converts an arbitrary file or folder name into its PascalCase form.
 *
 * @example `arrow-scope` -> `ArrowScope`, `police badge` -> `PoliceBadge`
 */
export function getNormalizedName(s: string): string {
  return s
    .split(/[ -]|[ _]/g)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

/**
 * Finds the offset at which the icon pack prefix ends and the icon name begins.
 *
 * The prefix is lowercase after its first character, so the name starts at the
 * first uppercase letter or digit past index 0.
 *
 * @example `GiSandstorm` -> 2, so prefix `Gi` and name `Sandstorm`.
 */
export function nextIdentifier(iconName: string): number {
  return iconName.substring(1).search(/[(A-Z)|(0-9)]/) + 1;
}

/**
 * Derives the short prefix used to address a pack's icons.
 *
 * Hyphenated names contribute one letter per segment, everything else uses the
 * first two characters.
 *
 * @example `game-icons.net.svg` -> `Gi`, `boxicons` -> `Bo`
 */
export function generatePrefix(packName: string): string {
  if (packName.includes('-')) {
    const splitted = packName.split('-');
    let result = splitted[0].charAt(0).toUpperCase();
    for (let i = 1; i < splitted.length; i++) {
      result += splitted[i].charAt(0).toLowerCase();
    }

    return result;
  }

  return packName.charAt(0).toUpperCase() + packName.charAt(1).toLowerCase();
}

/**
 * An icon name has to start with an uppercase letter or a digit, otherwise the
 * prefix splitter cannot tell where the prefix stops.
 */
const VALID_ICON_NAME = /^[A-Z0-9]/;

/**
 * Strips the `.svg` extension from a filename, if present.
 */
function stripExtension(filename: string): string {
  return filename.replace(/\.svg$/i, '');
}

/**
 * Returns the directory portion of a path, without a trailing slash.
 */
function dirnameOf(path: string): string {
  const index = path.lastIndexOf('/');
  return index === -1 ? '' : path.substring(0, index);
}

/**
 * Returns the filename portion of a path.
 */
function basenameOf(path: string): string {
  return path.substring(path.lastIndexOf('/') + 1);
}

/**
 * Computes the deepest directory shared by every given path.
 *
 * Icon zips are usually wrapped in boilerplate directories that carry no
 * meaning (`icons/ffffff/transparent/1x1/...`). Stripping the shared root makes
 * the remaining directory the part that actually distinguishes icons, which is
 * exactly what collision handling wants to fold into a name.
 *
 * @param paths Full entry paths.
 * @returns The common directory including a trailing slash, or `''` when the
 * paths share no directory.
 */
export function commonRootOf(paths: string[]): string {
  if (paths.length === 0) {
    return '';
  }

  const segmentLists = paths.map((path) => {
    const dir = dirnameOf(path);
    return dir === '' ? [] : dir.split('/');
  });

  let common = segmentLists[0];
  for (const segments of segmentLists.slice(1)) {
    let i = 0;
    while (
      i < common.length &&
      i < segments.length &&
      common[i] === segments[i]
    ) {
      i++;
    }
    common = common.slice(0, i);
    if (common.length === 0) {
      break;
    }
  }

  return common.length === 0 ? '' : `${common.join('/')}/`;
}

/**
 * Normalizes a (possibly nested) folder path into a PascalCase name fragment.
 *
 * @example `caro-asercion` -> `CaroAsercion`, `weapons/melee` -> `WeaponsMelee`
 */
function normalizeFolder(folder: string): string {
  if (folder === '') {
    return '';
  }

  return getNormalizedName(folder.split('/').join('-'));
}

interface Candidate {
  path: string;
  folder: string;
  base: string;
  displayName: string;
}

/**
 * Picks the folder segments that tell a group of same-named icons apart.
 *
 * Packs often nest icons under directories that carry no distinguishing
 * information for a given collision. game-icons.net ships every icon twice,
 * under `000000/transparent/1x1/<author>` and `ffffff/transparent/1x1/<author>`;
 * for two icons that differ only in colour, `transparent`, `1x1` and the author
 * are identical and only the colour segment is worth keeping.
 *
 * So rather than folding in the whole folder path, only the segments that vary
 * within the colliding group are used. That yields `Ffffff`/`000000` for a
 * colour-only clash, and colour plus author when the same filename is also used
 * by two different authors.
 *
 * @param folders Folder paths of every icon in the colliding group.
 * @returns Indices of the segments that differ, in path order.
 */
function distinguishingSegments(folders: string[]): number[] {
  const segmentLists = folders.map((folder) =>
    folder === '' ? [] : folder.split('/'),
  );
  const depth = Math.max(...segmentLists.map((segments) => segments.length), 0);
  const indices: number[] = [];

  for (let i = 0; i < depth; i++) {
    const values = new Set(segmentLists.map((segments) => segments[i] ?? ''));
    if (values.size > 1) {
      indices.push(i);
    }
  }

  return indices;
}

/**
 * Turns raw source entries into fully named {@link IconEntry} objects.
 *
 * Names are assigned in three passes so that the result depends only on the set
 * of paths, never on the order they were discovered in:
 *
 * 1. Filenames that are unique within the pack keep their short name.
 * 2. Filenames shared by several icons get their folder folded in.
 * 3. Anything still ambiguous gets a numeric suffix, applied in path order.
 *
 * @param prefix Icon pack prefix, e.g. `Gi`.
 * @param raws Entries as discovered by the source.
 * @param commonRoot Directory prefix to strip from every path when deriving the
 * folder. Defaults to the deepest shared directory.
 * @returns Named entries, sorted by path.
 */
export function resolveEntryIds(
  prefix: string,
  raws: RawEntry[],
  commonRoot = commonRootOf(raws.map((raw) => raw.path)),
): IconEntry[] {
  const candidates: Candidate[] = [];

  for (const raw of raws) {
    const filename = basenameOf(raw.path);
    const displayName = stripExtension(filename);
    const base = getNormalizedName(displayName);

    // The prefix splitter cannot address names that do not start with an
    // uppercase letter or digit, so such icons are unreachable and skipped.
    if (!VALID_ICON_NAME.test(base)) {
      continue;
    }

    const dir = dirnameOf(raw.path);
    const folder = dir.startsWith(commonRoot.replace(/\/$/, ''))
      ? dir.substring(commonRoot.length)
      : dir;

    candidates.push({ path: raw.path, folder, base, displayName });
  }

  // Sorting up front makes every later tie-break deterministic.
  candidates.sort((a, b) => a.path.localeCompare(b.path));

  // Pass 1 + 2: fold folder segments in only for filenames that are ambiguous,
  // and only the segments that actually distinguish the clashing icons.
  const groups = new Map<string, Candidate[]>();
  for (const candidate of candidates) {
    const key = candidate.base.toLowerCase();
    const group = groups.get(key);
    if (group) {
      group.push(candidate);
    } else {
      groups.set(key, [candidate]);
    }
  }

  const qualifierByPath = new Map<string, string>();
  for (const group of groups.values()) {
    if (group.length === 1) {
      qualifierByPath.set(group[0].path, '');
      continue;
    }

    const indices = distinguishingSegments(
      group.map((candidate) => candidate.folder),
    );

    for (const candidate of group) {
      const segments =
        candidate.folder === '' ? [] : candidate.folder.split('/');
      const qualifier = indices
        .map((index) => normalizeFolder(segments[index] ?? ''))
        .join('');
      qualifierByPath.set(candidate.path, qualifier);
    }
  }

  const entries: IconEntry[] = candidates.map((candidate) => {
    const name = `${qualifierByPath.get(candidate.path) ?? ''}${candidate.base}`;

    return {
      id: `${prefix}${name}`,
      name,
      displayName: candidate.displayName,
      folder: candidate.folder,
      path: candidate.path,
    };
  });

  // Pass 3: two icons can still collide if they share both filename and folder
  // name (e.g. `a/x/icon.svg` and `b/x/icon.svg`). Disambiguate numerically.
  const seen = new Map<string, number>();
  for (const entry of entries) {
    const key = entry.id.toLowerCase();
    const occurrence = seen.get(key) ?? 0;
    seen.set(key, occurrence + 1);

    if (occurrence > 0) {
      entry.name = `${entry.name}${occurrence + 1}`;
      entry.id = `${prefix}${entry.name}`;
    }
  }

  return entries;
}
