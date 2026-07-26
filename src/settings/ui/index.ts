import { App, PluginSettingTab, Setting } from 'obsidian';
import GlyphItPlugin from '@app/main';
import CustomIconPackSetting from './customIconPack';
import CacheMaintenanceSetting from './cacheMaintenance';
import CustomIconRuleSetting from './customIconRule';
import EmojiStyleSetting from './emojiStyle';
import ExtraMarginSetting from './extraMargin';
import IconColorSetting from './iconColor';
import IconFontSizeSetting from './iconFontSize';
import IconPacksPathSetting from './iconPacksPath';
import IconPacksBackgroundChecker from './iconPacksBackgroundChecker';
import PredefinedIconPacksSetting from './predefinedIconPacks';
import RecentlyUsedIconsSetting from './recentlyUsedIcons';
import ToggleIconInTabs from './toggleIconInTabs';
import ToggleIconInTitle from './toggleIconInTitle';
import FrontmatterOptions from './frontmatterOptions';
import ToggleIconsInNotes from './toggleIconsInNotes';
import ToggleIconsInLinks from './toggleIconsInLinks';
import IconIdentifierSetting from './iconIdentifier';
import DebugMode from './debugMode';
import UseInternalPlugins from './useInternalPlugins';

/**
 * The settings tab.
 *
 * Grouped by what the user is trying to do rather than by how the code is
 * organised: where icons show up, how they look, where they come from, and the
 * occasional maintenance job. Anything that can destroy work lives at the
 * bottom under its own heading and is marked as such.
 */
export default class GlyphItSettings extends PluginSettingTab {
  private plugin: GlyphItPlugin;

  constructor(app: App, plugin: GlyphItPlugin) {
    super(app, plugin);

    this.plugin = plugin;
  }

  /**
   * Adds a section heading with a short explanation of what it covers.
   */
  private section(title: string, description?: string): void {
    const heading = new Setting(this.containerEl).setName(title).setHeading();
    if (description) {
      heading.setDesc(description);
    }
  }

  display(): void {
    const { plugin, containerEl, app } = this;
    containerEl.empty();

    this.section('Where icons appear', 'Which parts of Obsidian show icons.');
    new ToggleIconInTabs(plugin, containerEl).display();
    new ToggleIconInTitle(plugin, containerEl).display();
    new ToggleIconsInNotes(plugin, containerEl).display();
    new ToggleIconsInLinks(plugin, containerEl).display();
    new UseInternalPlugins(plugin, containerEl).display();

    this.section('Appearance', 'How icons are drawn.');
    new IconFontSizeSetting(plugin, containerEl).display();
    new IconColorSetting(plugin, containerEl).display();
    new ExtraMarginSetting(plugin, containerEl).display();
    new EmojiStyleSetting(plugin, containerEl).display();

    this.section(
      'Icon packs',
      'Where icons come from. Packs stay compressed; icons are extracted only when used.',
    );
    new PredefinedIconPacksSetting(plugin, containerEl, app, () =>
      this.display(),
    ).display();
    new CustomIconPackSetting(plugin, containerEl, () =>
      this.display(),
    ).display();

    this.section(
      'Custom rules',
      'Assign icons automatically by matching file and folder names.',
    );
    new CustomIconRuleSetting(plugin, containerEl, app, () =>
      this.display(),
    ).display();

    this.section(
      'Writing icons in notes',
      'Typing icons inline, and reading them from note properties.',
    );
    new IconIdentifierSetting(plugin, containerEl).display();
    new RecentlyUsedIconsSetting(plugin, containerEl).display();
    new FrontmatterOptions(plugin, containerEl).display();

    this.section(
      'Storage and maintenance',
      'Housekeeping. Some of these change or remove data, and are marked in red.',
    );
    new IconPacksPathSetting(plugin, containerEl).display();
    new IconPacksBackgroundChecker(plugin, containerEl).display();
    new CacheMaintenanceSetting(plugin, containerEl).display();
    new DebugMode(plugin, containerEl).display();
  }
}
