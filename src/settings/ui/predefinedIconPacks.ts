import { App, Setting } from 'obsidian';
import GlyphItSetting from './glyphItSetting';
import IconPackBrowserModal from '@app/ui/icon-pack-browser-modal';
import GlyphItPlugin from '@app/main';

export default class PredefinedIconPacksSetting extends GlyphItSetting {
  private app: App;
  private refreshDisplay: () => void;

  constructor(
    plugin: GlyphItPlugin,
    containerEl: HTMLElement,
    app: App,
    refreshDisplay: () => void,
  ) {
    super(plugin, containerEl);
    this.app = app;
    this.refreshDisplay = refreshDisplay;
  }

  public display(): void {
    new Setting(this.containerEl)
      .setName('Add predefined icon pack')
      .setDesc('Add a predefined icon pack that is officially supported.')
      .addButton((btn) => {
        btn.setButtonText('Browse icon packs');
        btn.onClick(() => {
          const modal = new IconPackBrowserModal(this.app, this.plugin);
          modal.onAddedIconPack = () => {
            this.refreshDisplay();
          };
          modal.open();
        });
      });
  }
}
