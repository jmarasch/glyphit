import { Notice, Setting } from 'obsidian';
import GlyphItSetting from './glyphItSetting';
import { collectAllUsedIcons } from '@app/lib/icon-usage';
import { logger } from '@app/lib/logger';

/**
 * Housekeeping for the icon cache.
 *
 * Cleaning up is offered as an explicit action rather than run automatically,
 * because knowing whether an icon is still used means reading every note in the
 * vault: an icon can be written inline as `:IconName:` anywhere. That is fine
 * to do when asked, and the wrong thing to do on every launch of a large vault.
 */
export default class CacheMaintenanceSetting extends GlyphItSetting {
  public display(): void {
    const setting = new Setting(this.containerEl)
      .setName('Clean unused cached icons')
      .setDesc(
        'Removes cached icons that nothing refers to any more. Reads every ' +
          'note to find icons written inline, so it may take a moment on a ' +
          'large vault.',
      );

    setting.addButton((btn) => {
      btn.setButtonText('Scan and clean');
      btn.setWarning();
      btn.onClick(async () => {
        btn.setDisabled(true);
        const originalDesc = setting.descEl.getText();

        try {
          await this.clean(setting, originalDesc);
        } catch (error) {
          logger.error(`Could not clean the icon cache (${error})`);
          new Notice(`Could not clean the icon cache: ${error}`);
          setting.setDesc(originalDesc);
        } finally {
          btn.setDisabled(false);
        }
      });
    });
  }

  private async clean(setting: Setting, originalDesc: string): Promise<void> {
    const iconPackManager = this.plugin.getIconPackManager();

    const { referenced, filesScanned, durationMs } = await collectAllUsedIcons(
      this.plugin,
      (scanned, total) => {
        setting.setDesc(`Scanning notes... ${scanned} of ${total}`);
      },
    );

    // Cache entries are grouped by icon rather than by color, so every color
    // of an icon that is still used is kept.
    const keep = new Set<string>();
    for (const iconName of referenced) {
      const located = iconPackManager.findEntry(iconName);
      if (located) {
        keep.add(
          iconPackManager
            .getCacheStore()
            .identityOf(located.pack.getName(), located.entry),
        );
      }
    }

    const removed = await iconPackManager.getCacheStore().pruneExcept(keep);
    const droppedPacks = await iconPackManager.pruneDetachedPacks(referenced);

    setting.setDesc(originalDesc);

    const parts = [
      `${removed} cached icon${removed === 1 ? '' : 's'} removed`,
      `${referenced.size} still in use`,
      `${filesScanned} notes scanned in ${(durationMs / 1000).toFixed(1)}s`,
    ];
    if (droppedPacks.length > 0) {
      parts.push(`released data for ${droppedPacks.length} removed pack(s)`);
    }

    new Notice(parts.join(', ') + '.', 8000);
    logger.info(`Icon cache cleaned: ${parts.join(', ')}`);
  }
}
