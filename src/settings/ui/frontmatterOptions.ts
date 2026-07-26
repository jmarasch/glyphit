import { Setting, TextComponent } from 'obsidian';
import GlyphItSetting from './glyphItSetting';
import { Notice } from 'obsidian';
import config from '@app/config';
import { isHexadecimal, stringToHex } from '@app/util';
import { logger } from '@app/lib/logger';

export default class FrontmatterOptions extends GlyphItSetting {
  private iconFieldNameTextComp: TextComponent;
  private iconColorFieldNameTextComp: TextComponent;

  public display(): void {
    new Setting(this.containerEl)
      .setName('Use icon in frontmatter')
      .setDesc(
        'Toggles whether to set the icon based on the frontmatter property `icon`.',
      )
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.getSettings().iconInFrontmatterEnabled)
          .onChange(async (enabled) => {
            this.plugin.getSettings().iconInFrontmatterEnabled = enabled;
            await this.plugin.savePluginData();
          });
      });

    new Setting(this.containerEl)
      .setName('Frontmatter icon field name')
      .setDesc(
        'Sets the name of the frontmatter field which contains the icon.',
      )
      .addText((text) => {
        this.iconFieldNameTextComp = text;
        text.setValue(this.plugin.getSettings().iconInFrontmatterFieldName);
      })
      .addButton((button) => {
        button.setButtonText('Save');
        button.onClick(async () => {
          const newValue = this.iconFieldNameTextComp.getValue();
          const oldValue = this.plugin.getSettings().iconInFrontmatterFieldName;

          if (newValue === oldValue) {
            return;
          }

          this.plugin.getSettings().iconInFrontmatterFieldName = newValue;
          await this.plugin.savePluginData();
          new Notice('...saved successfully');
        });
      });

    new Setting(this.containerEl)
      .setName('Frontmatter icon color field name')
      .setDesc(
        'Sets the name of the frontmatter field which contains the icon color.',
      )
      .addText((text) => {
        this.iconColorFieldNameTextComp = text;
        text.setValue(
          this.plugin.getSettings().iconColorInFrontmatterFieldName,
        );
      })
      .addButton((button) => {
        button.setButtonText('Save');
        button.onClick(async () => {
          const newValue = this.iconColorFieldNameTextComp.getValue();
          const oldValue =
            this.plugin.getSettings().iconColorInFrontmatterFieldName;

          if (newValue === oldValue) {
            return;
          }

          this.plugin.getSettings().iconColorInFrontmatterFieldName = newValue;
          await this.plugin.savePluginData();
          new Notice('...saved successfully');
        });
      });

    new Setting(this.containerEl)
      .setName('Refresh icons from frontmatter')
      .setClass('glyphit-destructive')
      .setDesc(
        'Sets the icon and color for each note in the vault based on the frontmatter properties. This replaces any manually set icon with the one defined in the frontmatter, and removes the icon from any note that has none. Restart Obsidian after this completes to see the changes.',
      )
      .addButton((btn) => {
        btn
          .setButtonText('Refresh')
          .setWarning()
          .onClick(async () => {
            if (!this.plugin.getSettings().iconInFrontmatterEnabled) {
              new Notice(
                `[${config.PLUGIN_NAME}] Please enable "Use icon in frontmatter".`,
              );
              return;
            }

            new Notice(
              `[${config.PLUGIN_NAME}] Refreshing icons from frontmatter, please wait...`,
            );

            const files = this.plugin.app.vault.getMarkdownFiles();

            for (const file of files) {
              const fileCache =
                this.plugin.app.metadataCache.getFileCache(file);

              const frontmatterIconKey =
                this.plugin.getSettings().iconInFrontmatterFieldName;
              const frontmatterIconColorKey =
                this.plugin.getSettings().iconColorInFrontmatterFieldName;

              // Frontmatter holds whatever the user typed, so both values
              // are narrowed below before anything is done with them.
              const frontmatter = fileCache.frontmatter as
                | Record<string, unknown>
                | undefined;
              const iconName = frontmatter?.[frontmatterIconKey];
              const rawIconColor = frontmatter?.[frontmatterIconColorKey];

              if (!iconName) {
                this.plugin.removeFolderIcon(file.path);
                continue;
              }

              if (typeof iconName !== 'string') {
                const message = `${file.path}\nFrontmatter property type \`${frontmatterIconKey}\` has to be of type \`text\`.`;
                logger.warn(message);
                new Notice(`[${config.PLUGIN_NAME}]\n${message}`);
                continue;
              }

              this.plugin.addFolderIcon(file.path, iconName);

              if (!rawIconColor) {
                this.plugin.removeIconColor(file.path);
                continue;
              }

              if (typeof rawIconColor !== 'string') {
                const message = `${file.path}\nFrontmatter property type \`${frontmatterIconColorKey}\` has to be of type \`text\`.`;
                logger.warn(message);
                new Notice(`[${config.PLUGIN_NAME}]\n${message}`);
                continue;
              }

              const iconColor = isHexadecimal(rawIconColor)
                ? stringToHex(rawIconColor)
                : rawIconColor;

              this.plugin.addIconColor(file.path, iconColor);
            }
            new Notice(
              `[${config.PLUGIN_NAME}] Refreshed icons from frontmatter. Please restart Obsidian to see the changes.`,
            );
          });
      });
  }
}
