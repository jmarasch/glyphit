import config from '@app/config';
import GlyphItPlugin from '@app/main';
import { logger } from '@app/lib/logger';
import style from './style';
import svg from './svg';
import emoji from '@app/emoji';
import { setIconMarkup } from './html';

/**
 * Removes the `glyphit-icon` icon node from the provided HTMLElement.
 * @param el HTMLElement from which the icon node will be removed.
 */
const removeIconInNode = (el: HTMLElement): void => {
  const iconNode = el.querySelector('.glyphit-icon');
  if (!iconNode) {
    return;
  }

  iconNode.remove();
};

interface RemoveOptions {
  /**
   * The container that will be used to remove the icon. If not defined, it will try to
   * find the path within the `document`.
   */
  container?: HTMLElement;
}

/**
 * Removes the 'glyphit-icon' icon node from the HTMLElement corresponding
 * to the specified file path.
 * @param path File path for which the icon node will be removed.
 */
const removeIconInPath = (path: string, options?: RemoveOptions): void => {
  const node =
    options?.container ?? document.querySelector(`[data-path="${path}"]`);
  if (!node) {
    logger.warn(`Element with data path not found (path: ${path})`);
    return;
  }

  removeIconInNode(node);
};

interface SetIconForNodeOptions {
  color?: string;
  /**
   * Color drawn behind the icon. Applied to the container rather than the
   * SVG, so it works for emoji as well as icons.
   */
  backgroundColor?: string;
  shouldApplyAllStyles?: boolean;
  /**
   * Whether resolving the icon may write it to the on-disk cache. Browsing UIs
   * pass `false` so that scrolling a pack does not fill the cache with icons
   * that were only ever looked at.
   */
  persist?: boolean;
}

/**
 * Sets an icon or emoji for an HTMLElement based on the specified icon name and color.
 * The function manipulates the specified node inline.
 * @param plugin Instance of the GlyphItPlugin.
 * @param iconName Name of the icon or emoji to add.
 * @param node HTMLElement to which the icon or emoji will be added.
 * @param options Options for adjusting settings while the icon is being set.
 */
const setIconForNode = (
  plugin: GlyphItPlugin,
  iconName: string,
  node: HTMLElement,
  options?: SetIconForNodeOptions,
): void => {
  options ??= {};
  options.shouldApplyAllStyles ??= true;

  // Looked up at the color it will be drawn in. Color is part of the cache
  // key, so peeking without it misses an icon that was resolved with one, and
  // the miss used to fall through to the emoji branch below.
  const possibleIcon =
    plugin.getIconPackManager().peekIcon(iconName, options?.color)
      ?.svgElement ?? '';

  // The background sits on the container, so it is set the same way whether
  // the node ends up holding an icon or an emoji.
  if (options?.backgroundColor) {
    node.style.backgroundColor = options.backgroundColor;
    node.classList.add('glyphit-icon-has-background');
  } else {
    node.style.removeProperty('background-color');
    node.classList.remove('glyphit-icon-has-background');
  }

  if (possibleIcon) {
    // The icon is possibly not an emoji.
    let iconContent = options?.shouldApplyAllStyles
      ? style.applyAll(plugin, possibleIcon, node)
      : possibleIcon;
    if (options?.color) {
      node.style.color = options.color;
      iconContent = svg.colorize(iconContent, options.color);
    }
    setIconMarkup(node, iconContent);
  } else if (emoji.isEmoji(iconName)) {
    const parsedEmoji =
      emoji.parseEmoji(plugin.getSettings().emojiStyle, iconName) ?? iconName;
    setIconMarkup(
      node,
      options?.shouldApplyAllStyles
        ? style.applyAll(plugin, parsedEmoji, node)
        : parsedEmoji,
    );
  } else {
    // An icon that is not loaded and is not an emoji has nothing to draw.
    // Writing the identifier out as text here would put raw names like
    // `GiSeaDragon` on screen at whatever size the container happens to be.
    node.empty();
  }

  node.setAttribute('title', iconName);
};

/**
 * Sets an icon on a node, extracting it from its pack first if necessary.
 *
 * {@link setIconForNode} is synchronous and can therefore only draw icons that
 * are already in memory. Browsing UIs show icons that have never been used, so
 * they need this instead: it resolves the icon, then draws it once available.
 *
 * @param plugin Instance of the GlyphItPlugin.
 * @param iconName Name of the icon or emoji to add.
 * @param node HTMLElement to draw into.
 * @param options Options for adjusting settings while the icon is being set.
 */
const setIconForNodeAsync = async (
  plugin: GlyphItPlugin,
  iconName: string,
  node: HTMLElement,
  options?: SetIconForNodeOptions,
): Promise<void> => {
  if (!emoji.isEmoji(iconName)) {
    await plugin.getIconPackManager().resolveIcon(iconName, options?.color, {
      persist: options?.persist ?? false,
    });
  }

  // The node can be recycled or removed while the icon is being read.
  if (node.isConnected) {
    setIconForNode(plugin, iconName, node, options);
  }
};

interface CreateOptions {
  /**
   * The container that will be used to insert the icon. If not defined, it will try to
   * find the path within the `document`.
   */
  container?: HTMLElement;
  /**
   * The color that will be applied to the icon.
   */
  color?: string;
  /**
   * The color drawn behind the icon.
   */
  backgroundColor?: string;
}

/**
 * Creates an icon node for the specified path and inserts it to the DOM.
 * @param plugin Instance of the GlyphItPlugin.
 * @param path Path for which the icon node will be created.
 * @param iconName Name of the icon or emoji to add.
 * @param color Optional color of the icon to add.
 */
const createIconNode = (
  plugin: GlyphItPlugin,
  path: string,
  iconName: string,
  options?: CreateOptions,
): void => {
  // Get the container from the provided options or try to find the node that has the
  // path from the document itself.
  const node =
    options?.container ?? document.querySelector(`[data-path="${path}"]`);
  if (!node) {
    logger.warn(`Element with data path not found (path: ${path})`);
    return;
  }

  // Get the folder or file title node.
  let titleNode = node.querySelector('.nav-folder-title-content');
  if (!titleNode) {
    titleNode = node.querySelector('.nav-file-title-content');

    if (!titleNode) {
      logger.warn(`Element with title node not found (path: ${path})`);
      return;
    }
  }

  let iconNode: HTMLDivElement = node.querySelector('.glyphit-icon');
  // If the icon is already set in the path, we do not need to create a new div element.
  if (iconNode) {
    setIconForNode(plugin, iconName, iconNode, {
      color: options?.color,
      backgroundColor: options?.backgroundColor,
    });
  } else {
    // Creates a new icon node and inserts it to the DOM.
    iconNode = createDiv();
    iconNode.setAttribute(config.ICON_ATTRIBUTE_NAME, iconName);
    iconNode.classList.add('glyphit-icon');

    setIconForNode(plugin, iconName, iconNode, {
      color: options?.color,
      backgroundColor: options?.backgroundColor,
    });

    node.insertBefore(iconNode, titleNode);
  }
};

/**
 * Checks if the element has an icon node by checking if the element has a child with the
 * class `glyphit-icon`.
 * @param element HTMLElement which will be checked if it has an icon.
 * @returns Boolean whether the element has an icon node or not.
 */
const doesElementHasIconNode = (element: HTMLElement): boolean => {
  return element.querySelector('.glyphit-icon') !== null;
};

/**
 * Gets the icon name of the element if it has an icon node.
 * @param element HTMLElement parent which includes a node with the icon.
 * @returns String with the icon name if the element has an icon, `undefined` otherwise.
 */
const getIconFromElement = (element: HTMLElement): string | undefined => {
  const iconNode = element.querySelector('.glyphit-icon');
  const existingIcon = iconNode?.getAttribute(config.ICON_ATTRIBUTE_NAME);
  return existingIcon;
};

const getIconNodeFromPath = (path: string): HTMLElement | undefined => {
  return document
    .querySelector(`[data-path="${path}"]`)
    ?.querySelector('[data-icon]');
};

export default {
  setIconForNode,
  setIconForNodeAsync,
  createIconNode,
  doesElementHasIconNode,
  getIconFromElement,
  getIconNodeFromPath,
  removeIconInNode,
  removeIconInPath,
};
