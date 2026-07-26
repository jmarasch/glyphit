import { Notice, Setting, TextComponent } from 'obsidian';
import GlyphItSetting from './glyphItSetting';

export default class IconIdentifierSetting extends GlyphItSetting {
  private textComp: TextComponent;

  public display(): void {
    const setting = new Setting(this.containerEl)
      .setName('Icon identifier')
      .setDesc('Change the icon identifier used in notes.')
      .setClass('glyphit-setting');

    setting.addText((text) => {
      this.textComp = text;
      text.setValue(this.plugin.getSettings().iconIdentifier);
    });

    setting.addButton((btn) => {
      btn.setButtonText('Save');
      btn.onClick(async () => {
        const newIdentifier = this.textComp.getValue();
        const oldIdentifier = this.plugin.getSettings().iconIdentifier;

        if (newIdentifier === oldIdentifier) {
          return;
        }

        this.plugin.getSettings().iconIdentifier = newIdentifier;
        await this.plugin.savePluginData();
        new Notice('...saved successfully');
      });
    });
  }
}
