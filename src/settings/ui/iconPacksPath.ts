import { Notice, Setting, TextComponent } from 'obsidian';
import GlyphItSetting from './glyphItSetting';

export default class IconPacksPathSetting extends GlyphItSetting {
  private iconPacksSettingTextComp: TextComponent;

  public display(): void {
    const iconPacksPathSetting = new Setting(this.containerEl)
      .setName('Icon packs folder path')
      .setDesc('Change the default icon packs folder path.');

    iconPacksPathSetting.addText((text) => {
      this.iconPacksSettingTextComp = text;
      text.setValue(this.plugin.getSettings().iconPacksPath);
    });

    iconPacksPathSetting.addButton((btn) => {
      btn.setButtonText('Save');
      btn.onClick(async () => {
        const newPath = this.iconPacksSettingTextComp.getValue();
        const oldPath = this.plugin.getSettings().iconPacksPath;

        if (oldPath === this.iconPacksSettingTextComp.getValue()) {
          return;
        }

        new Notice('Saving in progress...');
        this.plugin.getIconPackManager().setPath(newPath);
        await this.plugin.getIconPackManager().createDefaultDirectory();
        await this.plugin
          .getIconPackManager()
          .moveIconPackDirectories(oldPath, newPath);

        this.plugin.getSettings().iconPacksPath = newPath;
        await this.plugin.savePluginData();
        new Notice('...saved successfully');
      });
    });
  }
}
