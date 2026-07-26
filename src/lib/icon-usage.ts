import GlyphItPlugin, { FolderIconObject } from '@app/main';
import emoji from '@app/emoji';

/**
 * Working out which icons a vault actually uses.
 *
 * There are three ways an icon gets used, and they cost very different amounts
 * to discover:
 *
 * - Assigned to a file or folder — a lookup in the plugin's own data.
 * - Matched by a custom rule — a lookup in the settings.
 * - Written inline in a note as `:IconName:` — only discoverable by reading
 *   the note.
 *
 * The first two are free. The third means reading every markdown file, which on
 * a large vault is real work, so it is never done automatically: nothing here
 * runs unless the user asks for it.
 */

/** Notes read before yielding back to the UI thread. */
const SCAN_BATCH_SIZE = 50;

export interface UsageScanResult {
  /** Every icon identifier the vault refers to. */
  referenced: Set<string>;
  /** How many notes were read. */
  filesScanned: number;
  /** How long the scan took, in milliseconds. */
  durationMs: number;
}

/**
 * Icons referenced by file assignments and custom rules.
 *
 * Cheap: reads only the plugin's own data, no vault I/O.
 */
export function collectAssignedIcons(plugin: GlyphItPlugin): Set<string> {
  const referenced = new Set<string>();

  for (const rule of plugin.getSettings().rules) {
    if (rule.icon && !emoji.isEmoji(rule.icon)) {
      referenced.add(rule.icon);
    }
  }

  for (const [path, value] of Object.entries(plugin.getData())) {
    if (path === 'settings' || path === 'migrated') {
      continue;
    }

    const iconName =
      typeof value === 'object'
        ? (value as FolderIconObject)?.iconName
        : (value as string);

    if (iconName && !emoji.isEmoji(iconName)) {
      referenced.add(iconName);
    }
  }

  return referenced;
}

/**
 * Builds the pattern that matches an inline icon reference.
 *
 * Kept in step with the editor's own matcher so that a scan agrees with what
 * actually renders; a mismatch here would mean deleting an icon that is on
 * screen.
 */
function inlineIconPattern(identifier: string): RegExp {
  const escaped = identifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(
    `(${escaped})((\\w{1,64}:\\d{17,18})|(\\w{1,64}))(${escaped})`,
    'g',
  );
}

/**
 * Scans every note for inline `:IconName:` references.
 *
 * Reads through Obsidian's cached reader, and yields to the UI thread between
 * batches so a large vault does not freeze the app.
 *
 * @param plugin Plugin instance.
 * @param onProgress Called with the number of notes read so far.
 */
export async function collectInlineIcons(
  plugin: GlyphItPlugin,
  onProgress?: (scanned: number, total: number) => void,
): Promise<Set<string>> {
  const identifier = plugin.getSettings().iconIdentifier;
  const pattern = inlineIconPattern(identifier);
  const referenced = new Set<string>();

  const files = plugin.app.vault.getMarkdownFiles();

  for (let i = 0; i < files.length; i++) {
    const content = await plugin.app.vault.cachedRead(files[i]);

    // Cheap rejection before running the pattern over the whole note.
    if (content.includes(identifier)) {
      pattern.lastIndex = 0;
      for (const match of content.matchAll(pattern)) {
        const iconName = match[0].slice(
          identifier.length,
          match[0].length - identifier.length,
        );
        if (iconName && !emoji.isEmoji(iconName)) {
          referenced.add(iconName);
        }
      }
    }

    if ((i + 1) % SCAN_BATCH_SIZE === 0) {
      onProgress?.(i + 1, files.length);
      // Lets Obsidian repaint rather than locking up for the whole scan.
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    }
  }

  onProgress?.(files.length, files.length);
  return referenced;
}

/**
 * Every icon the vault uses, including inline references.
 *
 * This is the only complete picture, and the only safe basis for deleting
 * anything from the cache.
 */
export async function collectAllUsedIcons(
  plugin: GlyphItPlugin,
  onProgress?: (scanned: number, total: number) => void,
): Promise<UsageScanResult> {
  const startedAt = Date.now();
  const referenced = collectAssignedIcons(plugin);

  for (const iconName of await collectInlineIcons(plugin, onProgress)) {
    referenced.add(iconName);
  }

  return {
    referenced,
    filesScanned: plugin.app.vault.getMarkdownFiles().length,
    durationMs: Date.now() - startedAt,
  };
}
