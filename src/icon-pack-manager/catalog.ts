import { requestUrl } from 'obsidian';
import { logger } from '@app/lib/logger';
import predefinedIconPacks, { PredefinedIconPack } from '@app/icon-packs';

/**
 * The list of icon packs available to download.
 *
 * Packs are published alongside this plugin's repository rather than compiled
 * into it: Obsidian only installs `main.js`, `manifest.json` and `styles.css`
 * from a release, so anything shipped inside the plugin folder would be missing
 * for everyone who installs it normally.
 *
 * The catalog is fetched at browse time, which means packs can be added or
 * updated without shipping a new plugin version. A copy of the list is compiled
 * in as a fallback so the feature still works offline, or if the repository is
 * ever unreachable.
 */

/** Where the published packs and their catalog live. */
export const PACK_REPOSITORY =
  'https://raw.githubusercontent.com/jmarasch/glyphit/main/iconPacks';

/** Catalog schema this version understands. */
const SUPPORTED_SCHEMA = 1;

/** How long a fetched catalog is reused before being fetched again. */
const CATALOG_TTL_MS = 60 * 60 * 1000;

/**
 * One downloadable pack, as published in the catalog.
 */
export interface CatalogPack {
  id: string;
  name: string;
  /** Upstream release the archive was built from, e.g. `3.1.0`. */
  version: string;
  /** Archive filename within the pack repository. */
  file: string;
  /** Directory inside the archive holding the icons, if not the root. */
  path: string;
  icons: number;
  bytes: number;
  homepage: string;
}

interface Catalog {
  schemaVersion: number;
  updated?: string;
  packs: CatalogPack[];
}

let cached: { packs: CatalogPack[]; fetchedAt: number } | null = null;

/**
 * The compiled-in list, used when the catalog cannot be fetched.
 *
 * Derived from the same pack definitions, so it always names packs this
 * version knows how to install, if not necessarily the newest ones.
 */
function fallbackPacks(): CatalogPack[] {
  return Object.values(predefinedIconPacks).map(
    (pack: PredefinedIconPack): CatalogPack => ({
      id: pack.name,
      name: pack.displayName,
      version: '',
      file: `${pack.name}.zip`,
      path: pack.path,
      icons: 0,
      bytes: 0,
      homepage: '',
    }),
  );
}

/**
 * Fetches the published catalog.
 *
 * Never throws: a failure falls back to the compiled-in list so that browsing
 * packs still works without a network.
 *
 * @param force Ignore the cached copy and fetch again.
 */
export async function loadCatalog(force = false): Promise<CatalogPack[]> {
  if (!force && cached && Date.now() - cached.fetchedAt < CATALOG_TTL_MS) {
    return cached.packs;
  }

  try {
    const response = await requestUrl({
      url: `${PACK_REPOSITORY}/packs.json`,
      throw: false,
    });

    if (response.status !== 200) {
      throw new Error(`HTTP ${response.status}`);
    }

    const catalog = response.json as Catalog;

    if (catalog?.schemaVersion !== SUPPORTED_SCHEMA) {
      throw new Error(
        `catalog schema ${catalog?.schemaVersion} is not supported by this version`,
      );
    }

    if (!Array.isArray(catalog.packs) || catalog.packs.length === 0) {
      throw new Error('catalog contains no packs');
    }

    cached = { packs: catalog.packs, fetchedAt: Date.now() };
    logger.info(`Loaded icon pack catalog (${catalog.packs.length} packs)`);
    return catalog.packs;
  } catch (error) {
    logger.warn(
      `Could not load the icon pack catalog, using the built-in list (${error})`,
    );
    return fallbackPacks();
  }
}

/**
 * Download URL for a pack's archive.
 */
export function packDownloadUrl(pack: CatalogPack): string {
  return `${PACK_REPOSITORY}/${pack.file}`;
}

/**
 * Whether a newer version of an installed pack is published.
 *
 * Versions are compared as dotted numbers, falling back to a string comparison
 * for anything that does not parse.
 */
export function isNewerVersion(published: string, installed: string): boolean {
  if (!published || !installed || published === installed) {
    return false;
  }

  const parse = (value: string): number[] =>
    value.split(/[.-]/).map((part) => Number.parseInt(part, 10) || 0);

  const a = parse(published);
  const b = parse(installed);

  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const left = a[i] ?? 0;
    const right = b[i] ?? 0;
    if (left !== right) {
      return left > right;
    }
  }

  return false;
}
