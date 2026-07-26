import { getIcon, getIconIds } from 'obsidian';
import GlyphItPlugin from '@app/main';
import predefinedIconPacks from '@app/icon-packs';
import { downloadZipFile } from '@app/zip-util';
import { IconPackManager } from '.';
import { IconPack } from './icon-pack';
import { MemorySource } from './memory-source';

export const LUCIDE_ICON_PACK_NAME = 'lucide-icons';

/**
 * Prefix Lucide icons have always used. Fixed rather than derived from the pack
 * name so that icons saved by earlier versions keep resolving.
 */
export const LUCIDE_PREFIX = 'Li';

/**
 * Lucide, which Obsidian ships internally.
 *
 * Obsidian exposes its bundled Lucide set through `getIconIds`, so the "native"
 * pack has no archive behind it. It is wrapped in a {@link MemorySource} so it
 * indexes, names and resolves exactly like a pack read from disk, instead of
 * needing a special case at every call site.
 *
 * The "custom" mode instead downloads the full Lucide release, which contains
 * far more icons than Obsidian bundles, and installs it as an ordinary archive.
 */
export class LucideIconPack {
  constructor(
    private readonly plugin: GlyphItPlugin,
    private readonly iconPackManager: IconPackManager,
  ) {}

  /**
   * Reads Obsidian's bundled icon set into a source.
   */
  private nativeSource(): MemorySource {
    const entries = new Map<string, string>();

    for (const rawId of getIconIds()) {
      const id = rawId.replace(/^lucide-/, '');
      const element = getIcon(id);
      if (!element) {
        continue;
      }

      // Obsidian's own class would leak its sizing rules into the icon.
      element.removeClass('svg-icon');
      entries.set(`${id}.svg`, element.outerHTML);
    }

    return new MemorySource(entries);
  }

  /**
   * Builds the pack backed by Obsidian's bundled Lucide icons.
   */
  public createPack(): IconPack {
    return new IconPack(
      LUCIDE_ICON_PACK_NAME,
      this.nativeSource(),
      false,
      LUCIDE_PREFIX,
    );
  }

  /**
   * Replaces the native pack with the full downloaded Lucide release.
   */
  public async addCustom(): Promise<void> {
    const existing = this.iconPackManager.getIconPackByName(
      LUCIDE_ICON_PACK_NAME,
    );
    if (existing) {
      await this.iconPackManager.removeIconPack(existing);
    }

    const arrayBuffer = await downloadZipFile(
      predefinedIconPacks['lucide'].downloadLink,
    );
    await this.iconPackManager.registerIconPack(
      LUCIDE_ICON_PACK_NAME,
      arrayBuffer,
    );
  }

  /**
   * Removes the downloaded pack, falling back to Obsidian's bundled icons when
   * the setting still asks for them.
   */
  public async removeCustom(): Promise<void> {
    const existing = this.iconPackManager.getIconPackByName(
      LUCIDE_ICON_PACK_NAME,
    );
    if (existing) {
      await this.iconPackManager.removeIconPack(existing);
    }

    if (this.plugin.doesUseNativeLucideIconPack()) {
      const pack = this.createPack();
      this.iconPackManager.getIconPacks().push(pack);
      await this.iconPackManager.loadIndex(pack, true);
    }
  }
}
