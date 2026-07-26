import { App, FuzzyMatch, FuzzySuggestModal, Notice } from 'obsidian';
import GlyphItPlugin from '@app/main';
import { logger } from '@app/lib/logger';
import { CatalogPack, loadCatalog } from '@app/icon-pack-manager/catalog';
import { loadPackArchive } from '@app/icon-pack-manager/pack-archive';
import { generatePrefix } from '@app/icon-pack-manager/naming';
import { errorMessage } from '@app/lib/util/error';

/**
 * Browses the icon packs available to download.
 *
 * The list comes from the published catalog rather than from anything compiled
 * in, so packs can be added or updated without a new plugin release. Packs
 * already installed are filtered out.
 */
export default class IconPackBrowserModal extends FuzzySuggestModal<CatalogPack> {
  private plugin: GlyphItPlugin;
  private packs: CatalogPack[] = [];

  constructor(app: App, plugin: GlyphItPlugin) {
    super(app);
    this.plugin = plugin;

    this.resultContainerEl.classList.add('glyphit-browse-modal');
    this.inputEl.placeholder = 'Loading available icon packs...';
    this.inputEl.disabled = true;
  }

  onAddedIconPack(): void {}

  onOpen(): void {
    void super.onOpen();
    void this.loadPacks();
  }

  /**
   * Fetches the catalog and re-runs the search once it lands.
   *
   * Detached from `onOpen` so the modal paints immediately instead of waiting
   * on the network.
   */
  private async loadPacks(): Promise<void> {
    this.packs = await loadCatalog();
    this.inputEl.disabled = false;
    this.inputEl.placeholder = 'Select an icon pack to download';

    // The list was empty while the catalog was loading.
    this.inputEl.dispatchEvent(new Event('input'));
  }

  onClose(): void {
    this.contentEl.empty();
  }

  getItemText(item: CatalogPack): string {
    return `${item.name} ${item.id} ${generatePrefix(item.id)}`;
  }

  getItems(): CatalogPack[] {
    const installed = new Set(
      this.plugin
        .getIconPackManager()
        .getIconPacks()
        .map((pack) => pack.getName()),
    );

    return this.packs.filter((pack) => !installed.has(pack.id));
  }

  onChooseItem(item: CatalogPack): void {
    void this.download(item);
  }

  /**
   * Downloads and registers a pack, reporting progress through notices.
   */
  private async download(item: CatalogPack): Promise<void> {
    const notice = new Notice(`Downloading ${item.name}...`, 0);

    try {
      const arrayBuffer = await loadPackArchive(item);

      // Stored compressed and indexed in place; never unpacked.
      const pack = await this.plugin
        .getIconPackManager()
        .registerIconPack(item.id, arrayBuffer, item.version);

      notice.hide();

      if (pack.size === 0) {
        new Notice(
          `${item.name} was added but contains no usable icons. Its published archive may be malformed.`,
          10000,
        );
      } else {
        new Notice(`${item.name} added (${pack.size} icons).`, 5000);
      }

      this.onAddedIconPack();
    } catch (error) {
      notice.hide();
      const message = errorMessage(error);
      logger.error(`Could not add icon pack '${item.id}' (${message})`);
      new Notice(`Could not add ${item.name}: ${message}`, 10000);
    }
  }

  renderSuggestion(match: FuzzyMatch<CatalogPack>, el: HTMLElement): void {
    const pack = match.item;

    el.addClass('glyphit-picker-row');
    const text = el.createDiv({ cls: 'glyphit-picker-text' });
    text.createDiv({
      cls: 'glyphit-picker-name',
      text: `${pack.name} (${generatePrefix(pack.id)})`,
    });

    // Icon count and size tell the user what they are about to download; the
    // catalog omits them when the built-in fallback list is in use.
    const details: string[] = [];
    if (pack.version) {
      details.push(`v${pack.version}`);
    }
    if (pack.icons > 0) {
      details.push(`${pack.icons.toLocaleString()} icons`);
    }
    if (pack.bytes > 0) {
      details.push(`${(pack.bytes / 1048576).toFixed(1)} MB`);
    }

    if (details.length > 0) {
      text.createDiv({
        cls: 'glyphit-picker-meta',
        text: details.join(' · '),
      });
    }
  }
}
