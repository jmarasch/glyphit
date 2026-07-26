import { Notice, Setting } from 'obsidian';
import GlyphItSetting from './glyphItSetting';
import config from '@app/config';

export default class ToggleIconsInLinks extends GlyphItSetting {
  public display(): void {
    new Setting(this.containerEl)
      .setName('Toggle icons in links')
      .setDesc(
        'Toggles whether you are able to see icons in the links to other notes',
      )
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.getSettings().iconsInLinksEnabled)
          .onChange(async (enabled) => {
            this.plugin.getSettings().iconsInLinksEnabled = enabled;
            await this.plugin.savePluginData();
            new Notice(
              `[${config.PLUGIN_NAME}] Obsidian has to be restarted for this change to take effect.`,
            );
          });
      });
  }
}
