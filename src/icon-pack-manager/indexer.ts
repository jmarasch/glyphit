import { resolveEntryIds } from './naming';
import {
  ICON_PACK_INDEX_VERSION,
  IconPackIndex,
  IconSource,
  SourceFingerprint,
} from './types';

/**
 * Builds the searchable index of a pack from its source.
 *
 * Indexing is deliberately cheap: it reads names, not bytes. A pack with
 * thousands of icons costs one archive directory parse, which is what makes it
 * viable to leave packs zipped and still offer instant search over them.
 */
export async function buildIndex(
  packName: string,
  prefix: string,
  source: IconSource,
): Promise<IconPackIndex> {
  const raws = await source.listEntries();
  const entries = resolveEntryIds(prefix, raws);
  const fingerprint = await source.fingerprint();

  return {
    version: ICON_PACK_INDEX_VERSION,
    packName,
    prefix,
    sourceType: source.type,
    fingerprint: { ...fingerprint, count: entries.length },
    builtAt: Date.now(),
    entries,
  };
}

/**
 * Decides whether a persisted index can still be trusted.
 *
 * An index is rebuilt when it was written by an older version of the schema, or
 * when the source no longer looks the way it did at index time. For archives
 * that means a changed size or timestamp; for folders, a changed file count.
 *
 * @param index The previously persisted index, if any.
 * @param current Fingerprint of the source as it is right now.
 */
export function isIndexStale(
  index: IconPackIndex | null,
  current: SourceFingerprint,
): boolean {
  if (!index || index.version !== ICON_PACK_INDEX_VERSION) {
    return true;
  }

  const previous = index.fingerprint;

  if (index.sourceType === 'folder') {
    return previous.count !== current.count || previous.mtime !== current.mtime;
  }

  return previous.size !== current.size || previous.mtime !== current.mtime;
}
