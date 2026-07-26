import { App, FuzzyMatch, FuzzySuggestModal, Notice } from 'obsidian';
import predefinedIconPacks, { PredefinedIconPack } from '@app/icon-packs';
import GlyphItPlugin from '@app/main';
import { loadPackArchive } from '@app/icon-pack-manager/pack-archive';
import { generatePrefix } from '@app/icon-pack-manager/naming';
import { logger } from '@app/lib/logger';

export default class IconPackBrowserModal extends FuzzySuggestModal<PredefinedIconPack> {
  private plugin: GlyphItPlugin;

  constructor(app: App, plugin: GlyphItPlugin) {
    super(app);
    this.plugin = plugin;

    this.resultContainerEl.classList.add('glyphit-browse-modal');
    this.inputEl.placeholder = 'Select to download icon pack';
  }

  // eslint-disable-next-line
  onAddedIconPack(): void {}

  onOpen(): void {
    super.onOpen();
  }

  onClose(): void {
    this.contentEl.empty();
  }

  getItemText(item: PredefinedIconPack): string {
    return `${item.displayName} (${generatePrefix(item.name)})`;
  }

  getItems(): PredefinedIconPack[] {
    const iconPacks = Object.values(predefinedIconPacks);
    const allIconPacks = this.plugin.getIconPackManager().getIconPacks();

    return iconPacks.filter(
      (iconPack) =>
        allIconPacks.find((ip) => iconPack.name === ip.getName()) === undefined,
    );
  }

  async onChooseItem(
    item: PredefinedIconPack,
    _event: MouseEvent | KeyboardEvent,
  ): Promise<void> {
    const notice = new Notice(`Adding ${item.displayName}...`, 0);

    try {
      const arrayBuffer = await loadPackArchive(this.plugin, item);

      // The archive is stored as-is and indexed in place; never unpacked.
      const pack = await this.plugin
        .getIconPackManager()
        .registerIconPack(item.name, arrayBuffer);

      notice.hide();

      if (pack.size === 0) {
        new Notice(
          `${item.displayName} was added but contains no usable icons. Its archive layout may have changed upstream.`,
          10000,
        );
      } else {
        new Notice(`${item.displayName} added (${pack.size} icons).`, 5000);
      }

      this.onAddedIconPack();
    } catch (error) {
      // Without this the promise rejects into nowhere and the user is left
      // looking at a notice that never resolves.
      notice.hide();
      logger.error(`Could not add icon pack '${item.name}' (${error})`);
      new Notice(
        `Could not add ${item.displayName}: ${error?.message ?? error}`,
        10000,
      );
    }
  }

  renderSuggestion(
    item: FuzzyMatch<PredefinedIconPack>,
    el: HTMLElement,
  ): void {
    super.renderSuggestion(item, el);

    el.innerHTML = `<div>${el.innerHTML}</div>`;
  }
}
