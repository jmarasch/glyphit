import { Setting } from 'obsidian';
import iconTabs from '@lib/icon-tabs';
import { TabHeaderLeaf } from '@app/@types/obsidian';
import GlyphItSetting from './glyphItSetting';

export default class ToggleIconInTabs extends GlyphItSetting {
  public display(): void {
    new Setting(this.containerEl)
      .setName('Toggle icon in tabs')
      .setDesc('Toggles the visibility of an icon for a file in the tab bar.')
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.getSettings().iconInTabsEnabled)
          .onChange(async (enabled) => {
            this.plugin.getSettings().iconInTabsEnabled = enabled;
            await this.plugin.savePluginData();

            // Updates the already opened files.
            const leaves =
              this.plugin.app.workspace.getLeavesOfType('markdown');
            for (const leaf of leaves) {
              const file = leaf.view.file;
              if (!file) {
                continue;
              }

              const tabHeaderLeaf = leaf as TabHeaderLeaf;
              if (enabled) {
                // Adds the icons to already opened files.
                await iconTabs.add(
                  this.plugin,
                  file.path,
                  tabHeaderLeaf.tabHeaderInnerIconEl,
                );
              } else {
                // Removes the icons from already opened files.
                iconTabs.remove(tabHeaderLeaf.tabHeaderInnerIconEl);
              }
            }
          });
      });
  }
}
