import { Notice, Setting } from 'obsidian';
import GlyphItSetting from './glyphItSetting';

export default class IconPacksBackgroundChecker extends GlyphItSetting {
  public display(): void {
    new Setting(this.containerEl)
      .setName('Icons background check')
      .setDesc(
        'Check in the background on every load of Obsidian, if icons are missing and it will try to add them to the specific icon pack.',
      )
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.getSettings().iconsBackgroundCheckEnabled)
          .onChange(async (enabled) => {
            this.plugin.getSettings().iconsBackgroundCheckEnabled = enabled;
            await this.plugin.savePluginData();

            if (enabled) {
              new Notice(
                'You need to reload Obsidian for this to take effect.',
                10000,
              );
            }
          });
      });
  }
}
