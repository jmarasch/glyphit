import { App, FileSystemAdapter, Platform } from 'obsidian';
import { logger } from '@app/lib/logger';

/**
 * Opening vault files in the operating system's file browser.
 *
 * Icon packs are ordinary files that users are expected to edit outside the
 * app — dropping SVGs into a folder pack, or opening an archive in a zip tool.
 * Getting there by hand means digging through a hidden `.obsidian` directory,
 * so the settings page offers to jump straight to it.
 */

/**
 * Whether revealing a file is possible on this platform.
 *
 * Mobile has no file browser to hand off to, and a vault that is not backed by
 * the local file system has no path to reveal.
 */
export function canRevealInFileBrowser(app: App): boolean {
  return (
    Platform.isDesktopApp && app.vault.adapter instanceof FileSystemAdapter
  );
}

/**
 * Opens the operating system's file browser at the given vault path.
 *
 * Selects the item when it exists so the user lands on the pack itself rather
 * than in the directory above it.
 *
 * @param app Obsidian app, used to resolve the vault-relative path.
 * @param vaultPath Path relative to the vault root.
 * @returns Whether the file browser was opened.
 */
export function revealInFileBrowser(app: App, vaultPath: string): boolean {
  if (!canRevealInFileBrowser(app)) {
    return false;
  }

  const adapter = app.vault.adapter as FileSystemAdapter;
  const fullPath = adapter.getFullPath(vaultPath);

  try {
    // Electron is only present in the desktop app, and is reached through the
    // bundler-opaque `window.require` so it is never pulled into the bundle.
    const electron = (
      window as unknown as {
        require?: (id: string) => {
          shell: {
            showItemInFolder(path: string): void;
            openPath(path: string): Promise<string>;
          };
        };
      }
    ).require?.('electron');

    if (!electron?.shell) {
      return false;
    }

    electron.shell.showItemInFolder(fullPath);
    return true;
  } catch (error) {
    logger.warn(
      `Could not reveal '${fullPath}' in the file browser (${error})`,
    );
    return false;
  }
}
