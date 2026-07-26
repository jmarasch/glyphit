import GlyphItPlugin from '@app/main';
import { PredefinedIconPack } from '@app/icon-packs';
import { downloadZipFile } from '@app/zip-util';

/**
 * Obtains the archive for a predefined icon pack.
 *
 * Predefined packs ship inside the plugin folder, repacked to contain only the
 * SVGs the plugin reads. Loading them locally means adding a pack works
 * offline, needs no hosting, and cannot break because an upstream release was
 * retagged or removed.
 *
 * The `remote` branch is kept for packs added later that are too large to ship
 * or that should track upstream.
 *
 * @param plugin Plugin instance, used to locate its own folder.
 * @param pack The pack definition to load.
 * @returns The archive bytes.
 * @throws If a bundled pack's file is missing from the plugin folder.
 */
export async function loadPackArchive(
  plugin: GlyphItPlugin,
  pack: PredefinedIconPack,
): Promise<ArrayBuffer> {
  if (pack.source !== 'bundled') {
    return downloadZipFile(pack.downloadLink);
  }

  const path = `${plugin.manifest.dir}/iconPacks/${pack.downloadLink}`;

  if (!(await plugin.app.vault.adapter.exists(path))) {
    throw new Error(
      `${pack.displayName} ships with the plugin, but '${path}' is missing. ` +
        `Reinstall the plugin, or rebuild it so the iconPacks folder is copied across.`,
    );
  }

  return plugin.app.vault.adapter.readBinary(path);
}
