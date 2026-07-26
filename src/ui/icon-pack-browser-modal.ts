import { App, FuzzyMatch, FuzzySuggestModal, Notice } from 'obsidian';
import predefinedIconPacks, { PredefinedIconPack } from '@app/icon-packs';
import GlyphItPlugin from '@app/main';
import { downloadZipFile } from '@app/zip-util';
import { generatePrefix } from '@app/icon-pack-manager/naming';

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
    new Notice(`Adding ${item.displayName}...`);

    const arrayBuffer = await downloadZipFile(item.downloadLink);
    // The archive is stored as-is and indexed in place; it is never unpacked.
    const pack = await this.plugin
      .getIconPackManager()
      .registerIconPack(item.name, arrayBuffer);

    new Notice(`...${item.displayName} added (${pack.size} icons)`);
    this.onAddedIconPack();
  }

  renderSuggestion(
    item: FuzzyMatch<PredefinedIconPack>,
    el: HTMLElement,
  ): void {
    super.renderSuggestion(item, el);

    el.innerHTML = `<div>${el.innerHTML}</div>`;
  }
}
