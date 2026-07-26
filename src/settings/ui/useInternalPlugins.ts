import { Notice, Setting } from 'obsidian';
import GlyphItSetting from './glyphItSetting';
import config from '@app/config';

export default class UseInternalPlugins extends GlyphItSetting {
  public display(): void {
    new Setting(this.containerEl)
      .setName('Experimental: Use internal plugins')
      .setDesc(
        'Toggles whether to try to add icons to the bookmark and outline internal plugins.',
      )
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.getSettings().useInternalPlugins)
          .onChange(async (enabled) => {
            this.plugin.getSettings().useInternalPlugins = enabled;
            await this.plugin.savePluginData();
            new Notice(
              `[${config.PLUGIN_NAME}] Obsidian has to be restarted for this change to take effect.`,
            );
          });
      });
  }
}
