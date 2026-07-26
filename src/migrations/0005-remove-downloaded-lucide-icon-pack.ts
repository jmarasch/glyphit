import { LUCIDE_ICON_PACK_NAME } from '@app/icon-pack-manager/lucide';
import GlyphItPlugin from '@app/main';

export default async function migrate(plugin: GlyphItPlugin): Promise<void> {
  if (plugin.getSettings().migrated === 5) {
    const iconPack = plugin
      .getIconPackManager()
      .getIconPackByName(LUCIDE_ICON_PACK_NAME);
    if (iconPack) {
      const doesIconPackExist = await plugin
        .getIconPackManager()
        .doesIconPackExist(iconPack.getName());
      if (doesIconPackExist) {
        await plugin.getIconPackManager().removeIconPack(iconPack);
      }
    }

    plugin.getSettings().migrated++;
  }
}
