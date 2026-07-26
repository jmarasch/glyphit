import { MarkdownView } from 'obsidian';
import GlyphItPlugin from '@app/main';
import { logger } from './logger';

/**
 * Loads icons that a render path asked for but could not draw.
 *
 * Rendering is synchronous and can only draw icons already in memory, but icons
 * written inline in a note as `:IconName:` are not known ahead of time — they
 * are discovered as the note is drawn, by which point it is too late to await
 * anything. Startup cannot preload them either without reading every note,
 * which is not viable on a large vault.
 *
 * So misses are collected here instead: the icons are fetched in the
 * background, and once they arrive the open notes are repainted. The first
 * paint of a never-before-seen inline icon shows nothing, and the next one,
 * milliseconds later, shows the icon.
 */

/** How long to wait for further misses before fetching, in milliseconds. */
const BATCH_DELAY_MS = 60;

/** Icons waiting to be fetched. */
const pending = new Set<string>();

/**
 * Icons that could not be resolved.
 *
 * Remembered so that a name which does not exist in any pack — a typo, or an
 * icon from a pack that was removed — is not retried on every repaint, which
 * would otherwise loop forever.
 */
const failed = new Set<string>();

let timer: number | undefined;
let inFlight = false;

/**
 * Asks for an icon that a render path could not draw.
 *
 * Safe to call from inside a render: it never blocks, and repeated calls for
 * the same icon collapse into one fetch.
 */
export function requestIcon(plugin: GlyphItPlugin, iconName: string): void {
  if (!iconName || failed.has(iconName) || pending.has(iconName)) {
    return;
  }

  // Already loaded, so the caller simply looked before it was stored.
  if (plugin.getIconPackManager().peekIcon(iconName)) {
    return;
  }

  pending.add(iconName);
  schedule(plugin);
}

function schedule(plugin: GlyphItPlugin): void {
  if (timer !== undefined || inFlight) {
    return;
  }

  timer = window.setTimeout(() => {
    timer = undefined;
    void flush(plugin);
  }, BATCH_DELAY_MS);
}

/**
 * Fetches everything queued, then repaints so the icons appear.
 */
async function flush(plugin: GlyphItPlugin): Promise<void> {
  if (pending.size === 0) {
    return;
  }

  const names = [...pending];
  pending.clear();
  inFlight = true;

  let loaded = 0;

  try {
    for (const iconName of names) {
      // Persisted: an icon written into a note is genuinely in use, so it
      // belongs in the cache rather than the preview tier.
      const icon = await plugin
        .getIconPackManager()
        .resolveIcon(iconName, undefined, { persist: true });

      if (icon) {
        loaded++;
      } else {
        failed.add(iconName);
        logger.warn(
          `Inline icon '${iconName}' is not in any installed icon pack`,
        );
      }
    }
  } catch (error) {
    logger.error(`Could not load inline icons (${error})`);
  } finally {
    inFlight = false;
  }

  if (loaded > 0) {
    repaintOpenNotes(plugin);
  }

  // Anything that arrived while fetching.
  if (pending.size > 0) {
    schedule(plugin);
  }
}

/**
 * Forces open markdown views to draw again.
 *
 * Reading mode is re-rendered outright. Live preview keeps its decorations in
 * a CodeMirror state field, which recomputes on any transaction, so an empty
 * one is enough to make it pick the icons up.
 */
function repaintOpenNotes(plugin: GlyphItPlugin): void {
  for (const leaf of plugin.app.workspace.getLeavesOfType('markdown')) {
    const view = leaf.view;
    if (!(view instanceof MarkdownView)) {
      continue;
    }

    try {
      const editorView = (
        view.editor as unknown as { cm?: { dispatch(spec: object): void } }
      ).cm;
      editorView?.dispatch({});

      view.previewMode?.rerender(true);
    } catch (error) {
      logger.warn(`Could not repaint a note after loading icons (${error})`);
    }
  }
}

/**
 * Clears what has been tried, so newly installed packs get another chance.
 */
export function resetIconLoader(): void {
  pending.clear();
  failed.clear();
}
