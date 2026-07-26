import { ExplorerView, TabHeaderLeaf } from '@app/@types/obsidian';
import emoji from '@app/emoji';
import GlyphItPlugin, { FolderIconObject } from '@app/main';
import customRule from './custom-rule';
import dom from './util/dom';
import iconTabs from './icon-tabs';
import { getFileItemInnerTitleEl, getFileItemTitleEl } from '@app/util';
import config from '@app/config';
import { Notice, requireApiVersion } from 'obsidian';
import { IconCache } from './icon-cache';
import { logger } from './logger';
import { Icon } from '@app/icon-pack-manager';

/**
 * Collects every icon the vault refers to, from saved paths and custom rules.
 */
const getReferencedIcons = (
  plugin: GlyphItPlugin,
  data: [string, string | FolderIconObject][],
): Set<string> => {
  const referenced = new Set<string>();

  for (const rule of plugin.getSettings().rules) {
    if (rule.icon && !emoji.isEmoji(rule.icon)) {
      referenced.add(rule.icon);
    }
  }

  for (const [, value] of data) {
    const iconNameWithPrefix =
      typeof value === 'object' ? value?.iconName : value;

    if (iconNameWithPrefix && !emoji.isEmoji(iconNameWithPrefix)) {
      referenced.add(iconNameWithPrefix);
    }
  }

  return referenced;
};

/**
 * Makes sure every icon the vault refers to is extracted and rendered.
 *
 * This deliberately only restores; it never deletes. It can see icons assigned
 * to paths and matched by rules, but not ones written inline in a note as
 * `:IconName:`, so anything it deleted on that basis could well be on screen.
 * Removing unused cache entries is a separate, explicit action that scans the
 * vault first — see `collectAllUsedIcons`.
 */
const checkMissingIcons = async (
  plugin: GlyphItPlugin,
  data: [string, string | FolderIconObject][],
): Promise<void> => {
  const iconPackManager = plugin.getIconPackManager();
  const referenced = getReferencedIcons(plugin, data);
  const restored: string[] = [];

  for (const iconNameWithPrefix of referenced) {
    // Already in memory, so there is nothing to restore.
    if (iconPackManager.peekIcon(iconNameWithPrefix)) {
      continue;
    }

    const icon = await iconPackManager.resolveIcon(iconNameWithPrefix);
    if (!icon) {
      logger.error(
        `Icon with name ${iconNameWithPrefix} could not be found in any installed icon pack`,
      );
      continue;
    }

    restored.push(iconNameWithPrefix);
  }

  if (restored.length !== 0) {
    new Notice(
      `[${config.PLUGIN_NAME}] Background Check: restored ${restored.length} missing icon(s).`,
      10000,
    );

    // Redraw the nodes that were showing nothing.
    for (const iconNameWithPrefix of restored) {
      const nodesWithIcon = document.querySelectorAll(
        `[${config.ICON_ATTRIBUTE_NAME}="${CSS.escape(iconNameWithPrefix)}"]`,
      );

      nodesWithIcon.forEach((node: HTMLElement) => {
        dom.setIconForNode(plugin, iconNameWithPrefix, node);
      });
    }
  }
};

/**
 * This function adds all the possible icons to the corresponding nodes. It
 * adds the icons, that are defined in the data as a basic string to the nodes
 * and the custom rule icons.
 * @param plugin Instance of GlyphItPlugin.
 * @param data Data that will be used to add all the icons to the nodes.
 * @param registeredFileExplorers A WeakSet of file explorers that are being used as a
 * cache for already handled file explorers.
 * @param callback Callback is being called whenever the icons are added to one file
 * explorer.
 */
const addAll = (
  plugin: GlyphItPlugin,
  data: [string, string | FolderIconObject][],
  registeredFileExplorers: WeakSet<ExplorerView>,
  callback?: () => void,
): void => {
  const fileExplorers = plugin.app.workspace.getLeavesOfType('file-explorer');

  for (const fileExplorer of fileExplorers) {
    if (registeredFileExplorers.has(fileExplorer.view)) {
      continue;
    }

    registeredFileExplorers.add(fileExplorer.view);

    const setIcons = () => {
      // Adds icons to already open file tabs.
      if (plugin.getSettings().iconInTabsEnabled) {
        for (const leaf of plugin.app.workspace.getLeavesOfType('markdown')) {
          const filePath = leaf.view.file?.path ?? leaf.view.getState().file;
          if (typeof filePath === 'string') {
            const tabHeaderLeaf = leaf as TabHeaderLeaf;
            const iconColor = plugin.getIconColor(filePath);
            iconTabs.add(plugin, filePath, tabHeaderLeaf.tabHeaderInnerIconEl, {
              iconColor,
            });
          }
        }
      }

      for (const [dataPath, value] of data) {
        const fileItem = fileExplorer.view.fileItems[dataPath];
        if (fileItem) {
          const titleEl = getFileItemTitleEl(fileItem);
          const titleInnerEl = getFileItemInnerTitleEl(fileItem);

          // Need to check this because refreshing the plugin will duplicate all the icons.
          if (titleEl.children.length === 2 || titleEl.children.length === 1) {
            const iconName = typeof value === 'string' ? value : value.iconName;
            const iconColor =
              typeof value === 'string' ? undefined : value.iconColor;
            const iconBackgroundColor =
              typeof value === 'string' ? undefined : value.iconBackgroundColor;
            if (iconName) {
              // Removes a possible existing icon.
              const existingIcon = titleEl.querySelector('.glyphit-icon');
              if (existingIcon) {
                existingIcon.remove();
              }

              // Creates the new node with the icon inside.
              const iconNode = titleEl.createDiv();
              iconNode.setAttribute(config.ICON_ATTRIBUTE_NAME, iconName);
              iconNode.classList.add('glyphit-icon');

              IconCache.getInstance().set(dataPath, {
                iconNameWithPrefix: iconName,
              });
              dom.setIconForNode(plugin, iconName, iconNode, {
                color: iconColor,
                backgroundColor: iconBackgroundColor,
              });

              titleEl.insertBefore(iconNode, titleInnerEl);
            }
          }
        }
      }

      // Callback function to register other events to this file explorer.
      callback?.();
    };

    if (requireApiVersion('1.7.2')) {
      // TODO: Remove loading deferred view to improve performance.
      void fileExplorer.loadIfDeferred().then(setIcons);
    } else {
      setIcons();
    }
  }

  // Handles the custom rules.
  for (const rule of customRule.getSortedRules(plugin)) {
    void customRule.addToAllFiles(plugin, rule);
  }
};

/**
 * Gets the icon of a given path. This function returns the first occurrence of an icon.
 * @param plugin Instance of the GlyphItPlugin.
 * @param path Path to get the icon of.
 * @returns The icon of the path if it exists, undefined otherwise.
 */
const getByPath = (plugin: GlyphItPlugin, path: string): string | undefined => {
  if (path === 'settings' || path === 'migrated') {
    return undefined;
  }

  const value = plugin.getData()[path];
  if (typeof value === 'string') {
    // If the value is a plain icon name, return it.
    return value;
  } else if (typeof value === 'object') {
    const v = value as FolderIconObject;
    if (v.iconName !== null) {
      return v.iconName;
    }
  }

  // Tries to get the custom rule for the path and returns its icon if it exists.
  const rule = customRule.getSortedRules(plugin).find((rule) => {
    return customRule.doesMatchPath(rule, path);
  });
  if (rule) {
    return rule.icon;
  }

  return undefined;
};

interface IconWithPath {
  path: string;
  icon: string;
}

/**
 * Gets all the icons with their paths as an object.
 * @param plugin Instance of the GlyphItPlugin.
 * @returns An object that consists of the path and the icon name for the data
 * or custom rule.
 */
const getAllWithPath = (plugin: GlyphItPlugin): IconWithPath[] => {
  const result: IconWithPath[] = [];
  Object.keys(plugin.getData()).forEach((path) => {
    if (path === 'settings' || path === 'migrated') {
      return;
    }

    const icon = getByPath(plugin, path);
    if (icon && !emoji.isEmoji(icon)) {
      result.push({ path, icon });
    }
  });

  // Add all icons for the custom rules with the rule as the path.
  for (const rule of plugin.getSettings().rules) {
    if (!emoji.isEmoji(rule.icon)) {
      result.push({ path: rule.rule, icon: rule.icon });
    }
  }
  return result;
};

/**
 * Returns the {@link Icon} for the given icon name. It is important, that the icon name
 * contains the icon pack prefix.
 * @param iconNameWithPrefix String that contains the icon pack prefix combined with the
 * icon name.
 * @returns Icon if it exists, `null` otherwise.
 */
const getIconByName = (
  plugin: GlyphItPlugin,
  iconNameWithPrefix: string,
): Icon | null => {
  return plugin.getIconPackManager().peekIcon(iconNameWithPrefix) ?? null;
};

/**
 * Returns the {@link Icon} for the given path.
 * @param plugin GlyphItPlugin instance.
 * @param path String which is the path to get the icon of.
 * @returns Icon or Emoji as string if it exists, `null` otherwise.
 */
const getIconByPath = (
  plugin: GlyphItPlugin,
  path: string,
): Icon | string | null => {
  const iconNameWithPrefix = getByPath(plugin, path);
  if (!iconNameWithPrefix) {
    return null;
  }

  if (emoji.isEmoji(iconNameWithPrefix)) {
    return iconNameWithPrefix;
  }

  return getIconByName(plugin, iconNameWithPrefix);
};

export default {
  addAll,
  getByPath,
  getAllWithPath,
  getIconByPath,
  getIconByName,
  checkMissingIcons,
};
