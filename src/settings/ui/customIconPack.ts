import { Notice, Setting, TextComponent } from 'obsidian';
import GlyphItSetting from './glyphItSetting';
import GlyphItPlugin from '@app/main';
import { readFileSync } from '@app/util';
import icon from '@app/lib/icon';
import { LucideIconPackType } from '../data';
import { LUCIDE_ICON_PACK_NAME } from '@app/icon-pack-manager/lucide';
import { IconPack } from '@app/icon-pack-manager';
import { IconPackSourceType } from '@app/icon-pack-manager/types';

export default class CustomIconPackSetting extends GlyphItSetting {
  private textComponent: TextComponent;
  private dragOverElement: HTMLElement;
  /** Window timer handle; a number in the browser, not a Node `Timeout`. */
  private closeTimer: number;
  private dragTargetElement: HTMLElement;
  private refreshDisplay: () => void;

  /** Style used for the next pack created from the settings page. */
  private newPackStyle: IconPackSourceType = 'zip';

  constructor(
    plugin: GlyphItPlugin,
    containerEl: HTMLElement,
    refreshDisplay: () => void,
  ) {
    super(plugin, containerEl);
    this.refreshDisplay = refreshDisplay;
    this.dragOverElement = createDiv();
    this.dragOverElement.addClass('glyphit-dragover-el');

    this.dragOverElement.createEl('p', { text: 'Drop to add icon.' });
  }

  private normalizeIconPackName(value: string): string {
    return value.toLowerCase().replace(/\s/g, '-');
  }

  private preventDefaults(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
  }

  private highlight(el: HTMLElement): void {
    window.clearTimeout(this.closeTimer);

    if (!this.dragTargetElement) {
      el.appendChild(this.dragOverElement);
      el.classList.add('glyphit-dragover');
      this.dragTargetElement = el;
    }
  }

  private unhighlight(target: HTMLElement, el: HTMLElement): void {
    if (this.dragTargetElement && this.dragTargetElement !== target) {
      this.dragTargetElement.removeChild(this.dragOverElement);
      this.dragTargetElement.classList.remove('glyphit-dragover');
      this.dragTargetElement = undefined;
    }

    window.clearTimeout(this.closeTimer);
    this.closeTimer = window.setTimeout(() => {
      if (this.dragTargetElement) {
        el.removeChild(this.dragOverElement);
        el.classList.remove('glyphit-dragover');
        this.dragTargetElement = undefined;
      }
    }, 100);
  }

  /**
   * Writes SVG files into a pack's folder and re-indexes it.
   *
   * Only folder-backed packs can be added to; a zipped pack is left to the user
   * to edit with an archive tool, after which the rescan control picks the
   * change up.
   *
   * @returns How many icons were added.
   */
  private async addIcons(iconPack: IconPack, files: File[]): Promise<number> {
    const svgs: { name: string; content: string }[] = [];

    for (const file of files) {
      svgs.push({ name: file.name, content: await readFileSync(file) });
    }

    try {
      // The manager handles both storage styles, and rejects anything that is
      // not actually an SVG.
      const { added, rejected } = await this.plugin
        .getIconPackManager()
        .addIconsToPack(iconPack, svgs);

      if (rejected.length > 0) {
        new Notice(
          `Skipped ${rejected.length} file(s) that are not SVGs: ` +
            `${rejected.slice(0, 3).join(', ')}${rejected.length > 3 ? '...' : ''}. ` +
            'Icons must be SVG; convert raster images first.',
          10000,
        );
      }

      return added;
    } catch (error) {
      new Notice(`Could not add icons to ${iconPack.getName()}: ${error}`);
      return 0;
    }
  }

  public display(): void {
    new Setting(this.containerEl)
      .setName('Add custom icon pack')
      .setDesc(
        'Create an empty icon pack. Archive packs keep every icon in one ' +
          'file, which is much kinder to file sync and directory watchers; ' +
          'folder packs are easier to edit by hand.',
      )
      .addText((text) => {
        text.setPlaceholder('Your icon pack name');
        this.textComponent = text;
      })
      .addDropdown((dropdown) => {
        dropdown.addOptions({
          zip: 'Archive (.zip)',
          folder: 'Folder',
        } satisfies Record<IconPackSourceType, string>);
        dropdown.setValue(this.newPackStyle);
        dropdown.onChange((value: IconPackSourceType) => {
          this.newPackStyle = value;
        });
      })
      .addButton((btn) => {
        btn.setIcon('plus');
        btn.setTooltip('Create the icon pack');
        btn.onClick(async () => {
          const name = this.textComponent.getValue();
          if (name.length === 0) {
            return;
          }

          const normalizedName = this.normalizeIconPackName(name);
          const iconPackManager = this.plugin.getIconPackManager();

          if (
            (await iconPackManager.doesIconPackExist(normalizedName)) ||
            iconPackManager.getIconPackByName(normalizedName)
          ) {
            new Notice('Icon pack already exists.');
            return;
          }

          await iconPackManager.createIconPack(
            normalizedName,
            this.newPackStyle,
          );
          this.textComponent.setValue('');
          this.refreshDisplay();
          new Notice(
            `Icon pack created as ${
              this.newPackStyle === 'zip' ? 'an archive' : 'a folder'
            }.`,
          );
        });
      });

    // Sorts lucide icon pack always to the top.
    const iconPacks = [...this.plugin.getIconPackManager().getIconPacks()].sort(
      (a, b) => {
        if (a.getName() === LUCIDE_ICON_PACK_NAME) return -1;
        if (b.getName() === LUCIDE_ICON_PACK_NAME) return 1;
        return a.getName().localeCompare(b.getName());
      },
    );

    iconPacks.forEach((iconPack) => {
      const isLucideIconPack = iconPack.getName() === LUCIDE_ICON_PACK_NAME;
      const additionalLucideDescription =
        '(Native Pack has fewer icons but 100% Obsidian Sync support)';

      const describe = (suffix = ''): string =>
        `Total icons: ${iconPack.size}${
          isLucideIconPack ? ` ${additionalLucideDescription}` : ''
        }${suffix}`;

      const iconPackSetting = new Setting(this.containerEl)
        .setName(`${iconPack.getName()} (${iconPack.getPrefix()})`)
        .setDesc(describe());

      // Packs stay compressed, so editing one's archive or folder does not
      // change what the plugin knows about it until it is re-indexed. This
      // rescans the pack in place and updates the count.
      iconPackSetting.addButton((btn) => {
        btn.setIcon('refresh-cw');
        btn.setTooltip('Rescan this icon pack for added or removed icons');
        btn.onClick(async () => {
          btn.setDisabled(true);
          iconPackSetting.setDesc(describe(' (rescanning...)'));

          const before = iconPack.size;
          const count = await this.plugin
            .getIconPackManager()
            .refreshIconPack(iconPack.getName());

          btn.setDisabled(false);

          if (count === null) {
            iconPackSetting.setDesc(describe(' (could not be rescanned)'));
            new Notice(`Could not rescan ${iconPack.getName()}.`);
            return;
          }

          const delta = count - before;
          const change =
            delta === 0
              ? ' (no change)'
              : ` (${delta > 0 ? '+' : ''}${delta} since last scan)`;

          iconPackSetting.setDesc(describe(change));
          new Notice(`${iconPack.getName()}: ${count} icons.`);
        });
      });

      // iconPackSetting.addButton((btn) => {
      //   btn.setIcon('broken-link');
      //   btn.setTooltip('Try to fix icon pack');
      //   btn.onClick(async () => {
      //     new Notice('Try to fix icon pack...');
      //     getIconPack(iconPack.name).icons = [];
      //     const icons = await getFilesInDirectory(this.plugin, `${getPath()}/${iconPack.name}`);
      //     for (let i = 0; i < icons.length; i++) {
      //       const filePath = icons[i];
      //       const fileName = filePath.split('/').pop();
      //       const file = await this.plugin.app.vault.adapter.read(filePath);
      //       const iconContent = file
      //         .replace(/stroke="#fff"/g, 'stroke="currentColor"')
      //         .replace(/fill="#fff"/g, 'fill="currentColor"');

      //       await this.plugin.app.vault.adapter.write(filePath, iconContent);
      //       await normalizeFileName(this.plugin, filePath);

      //       addIconToIconPack(iconPack.name, fileName, iconContent);
      //     }
      //     new Notice('...tried to fix icon pack');

      //     // Refreshes the DOM.
      //     Object.entries(this.plugin.getData()).forEach(async ([k, v]) => {
      //       const doesPathExist = await this.plugin.app.vault.adapter.exists(k, true);
      //       if (doesPathExist && typeof v === 'string') {
      //         // dom.removeIconInPath(k);
      //         dom.createIconNode(this.plugin, k, v);
      //       }
      //     });
      //   });
      // });

      if (isLucideIconPack) {
        iconPackSetting.addDropdown((dropdown) => {
          dropdown.addOptions({
            native: 'Native',
            custom: 'Custom',
            none: 'None',
          } satisfies Record<LucideIconPackType, string>);
          dropdown.setValue(this.plugin.getSettings().lucideIconPackType);
          dropdown.onChange(async (value: LucideIconPackType) => {
            dropdown.setDisabled(true);
            new Notice('Changing icon packs...');
            this.plugin.getSettings().lucideIconPackType = value;
            await this.plugin.savePluginData();
            if (value === 'native' || value === 'none') {
              await this.plugin
                .getIconPackManager()
                .getLucideIconPack()
                .removeCustom();
            } else {
              await this.plugin
                .getIconPackManager()
                .getLucideIconPack()
                .addCustom();
              await icon.checkMissingIcons(
                this.plugin,
                icon.getAssignments(this.plugin),
              );
            }

            dropdown.setDisabled(false);
            new Notice('Done. This change requires a restart of Obsidian');
          });
        });
        return;
      }

      iconPackSetting.addButton((btn) => {
        btn.setIcon('plus');
        btn.setTooltip(
          iconPack.getSource().type === 'zip'
            ? 'Add SVG files into this archive'
            : 'Add SVG files to this folder',
        );
        btn.onClick(async () => {
          const fileSelector = createEl('input');
          fileSelector.setAttribute('type', 'file');
          fileSelector.setAttribute('multiple', 'multiple');
          fileSelector.setAttribute('accept', '.svg');
          fileSelector.click();
          fileSelector.onchange = async (e) => {
            const target = e.target as HTMLInputElement;
            const added = await this.addIcons(
              iconPack,
              Array.from(target.files),
            );
            iconPackSetting.setDesc(describe(` (added: ${added})`));
            new Notice(`${added} icon(s) successfully added.`);
          };
        });
      });
      iconPackSetting.addButton((btn) => {
        btn.setIcon('trash');
        btn.setWarning();
        btn.setTooltip(
          'Remove the icon pack. Icons already in use keep working, but this pack can no longer be browsed.',
        );
        btn.onClick(async () => {
          await this.plugin.getIconPackManager().removeIconPack(iconPack);
          this.refreshDisplay();
          new Notice('Icon pack successfully deleted.');
        });
      });

      ['dragenter', 'dragover', 'dragleave', 'drop'].forEach((event) => {
        iconPackSetting.settingEl.addEventListener(
          event,
          (e) => this.preventDefaults(e),
          false,
        );
      });
      ['dragenter', 'dragover'].forEach((event) => {
        iconPackSetting.settingEl.addEventListener(
          event,
          () => this.highlight(iconPackSetting.settingEl),
          false,
        );
      });
      ['dragleave', 'drop'].forEach((event) => {
        iconPackSetting.settingEl.addEventListener(
          event,
          (event) =>
            this.unhighlight(
              event.currentTarget as HTMLElement,
              iconPackSetting.settingEl,
            ),
          false,
        );
      });
      iconPackSetting.settingEl.addEventListener(
        'drop',
        (event) => {
          const dropped = Array.from(event.dataTransfer.files);
          const svgs = dropped.filter((file) => {
            if (file.type === 'image/svg+xml') {
              return true;
            }
            new Notice(`File ${file.name} is not a SVG file.`);
            return false;
          });

          if (svgs.length === 0) {
            return;
          }

          // A drop listener cannot be awaited, so the work is deliberately
          // detached; failures surface as a notice rather than a rejection.
          void this.addIcons(iconPack, svgs).then((added) => {
            iconPackSetting.setDesc(describe(` (added: ${added})`));
            new Notice(`${added} icon(s) successfully added.`);
          });
        },
        false,
      );
    });
  }
}
