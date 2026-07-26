import GlyphItPlugin from '@app/main';
import { createIcon } from './icon-factory';
import { IconPack } from './icon-pack';
import { Icon } from './types';

/**
 * Compatibility surface for the icon pack layer.
 *
 * The naming rules now live in `naming.ts` and icon construction in
 * `icon-factory.ts`; this module re-exports them so the many call sites that
 * import from here keep working.
 */
export { getNormalizedName, nextIdentifier, generatePrefix } from './naming';

/**
 * Returns the SVG markup of an icon that is already loaded.
 *
 * Synchronous by necessity: the DOM helpers that call this run inside render
 * paths that cannot await. Icons the vault references are brought into memory
 * during start-up, so in practice this finds what it is asked for.
 *
 * @param plugin Instance of the GlyphItPlugin.
 * @param iconPrefix Icon pack prefix, e.g. `Gi`.
 * @param iconName Icon name without the prefix, e.g. `Sandstorm`.
 * @returns The SVG markup, or an empty string when the icon is not loaded.
 */
export function getSvgFromLoadedIcon(
  plugin: GlyphItPlugin,
  iconPrefix: string,
  iconName: string,
): string {
  const icon = plugin.getIconPackManager().peekIcon(`${iconPrefix}${iconName}`);

  return icon?.svgElement ?? '';
}

/**
 * Builds an {@link Icon} from raw SVG markup.
 *
 * @deprecated Prefer `createIcon` from `icon-factory.ts`, which does not need
 * an {@link IconPack} to be constructed first.
 */
export function generateIcon(
  iconPack: IconPack,
  iconName: string,
  content: string,
): Icon | null {
  const normalizedName =
    iconName.charAt(0).toUpperCase() + iconName.substring(1);

  return createIcon({
    name: normalizedName.split('.svg')[0],
    prefix: iconPack.getPrefix(),
    packName: iconPack.getName(),
    displayName: iconName,
    markup: content,
  });
}
