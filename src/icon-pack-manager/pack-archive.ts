import { downloadZipFile } from '@app/zip-util';
import { CatalogPack, packDownloadUrl } from './catalog';

/**
 * Downloads a published icon pack's archive.
 *
 * Packs are hosted alongside the plugin's repository rather than shipped inside
 * it, because Obsidian only installs `main.js`, `manifest.json` and
 * `styles.css` from a release — anything else in the plugin folder would be
 * missing for everyone who installs normally.
 *
 * @throws If the archive cannot be downloaded.
 */
export async function loadPackArchive(pack: CatalogPack): Promise<ArrayBuffer> {
  const url = packDownloadUrl(pack);

  try {
    return await downloadZipFile(url);
  } catch (error) {
    throw new Error(
      `Could not download ${pack.name} from ${url}. ` +
        `Check your connection and try again. (${error})`,
    );
  }
}
