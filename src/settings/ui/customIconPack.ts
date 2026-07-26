import { Notice, Setting, TextComponent } from 'obsidian';
import GlyphItSetting from './glyphItSetting';
import GlyphItPlugin from '@app/main';
import { readFileSync } from '@app/util';
import icon from '@app/lib/icon';
import { LucideIconPackType } from '../data';
import { LUCIDE_ICON_PACK_NAME } from '@app/icon-pack-manager/lucide';
import { IconPack } from '@app/icon-pack-manager';

export default class CustomIconPackSetting extends GlyphItSetting {
  private textComponent: TextComponent;
  private dragOverElement: HTMLElement;
  private closeTimer: NodeJS.Timeout;
  private dragTargetElement: HTMLElement;
  private refreshDisplay: () => void;

  constructor(
    plugin: GlyphItPlugin,
    containerEl: HTMLElement,
    refreshDisplay: () => void,
  ) {
    super(plugin, containerEl);
    this.refreshDisplay = refreshDisplay;
    this.dragOverElement = document.createElement('div');
    this.dragOverElement.addClass('glyphit-dragover-el');
    this.dragOverElement.style.display = 'hidden';
    this.dragOverElement.innerHTML = '<p>Drop to add icon.</p>';
  }

  private normalizeIconPackName(value: string): string {
    return value.toLowerCase().replace(/\s/g, '-');
  }

  private preventDefaults(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
  }

  private highlight(el: HTMLElement): void {
    clearTimeout(this.closeTimer);

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

    clearTimeout(this.closeTimer);
    this.closeTimer = setTimeout(() => {
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
    if (!iconPack.isCustomPack()) {
      new Notice(
        `${iconPack.getName()} is a zipped icon pack. Add the SVGs to the .zip file, then use the rescan button.`,
        8000,
      );
      return 0;
    }

    const iconPackManager = this.plugin.getIconPackManager();
    const folder = `${iconPackManager.getPath()}/${iconPack.getName()}`;
    let added = 0;

    for (const file of files) {
      const content = await readFileSync(file);
      const filename = file.name.endsWith('.svg')
        ? file.name
        : `${file.name}.svg`;

      try {
        await this.plugin.app.vault.adapter.write(
          `${folder}/${filename}`,
          content,
        );
        added++;
      } catch (error) {
        new Notice(`Could not add ${file.name}: ${error}`);
      }
    }

    if (added > 0) {
      // Re-index so the new files are addressable, and so any name collisions
      // they introduced are resolved consistently with the rest of the pack.
      await iconPackManager.refreshIconPack(iconPack.getName());
    }

    return added;
  }

  public display(): void {
    new Setting(this.containerEl)
      .setName('Add custom icon pack')
      .setDesc('Add a custom icon pack.')
      .addText((text) => {
        text.setPlaceholder('Your icon pack name');
        this.textComponent = text;
      })
      .addButton((btn) => {
        btn.setButtonText('Add icon pack');
        btn.onClick(async () => {
          const name = this.textComponent.getValue();
          if (name.length === 0) {
            return;
          }

          const normalizedName = this.normalizeIconPackName(
            this.textComponent.getValue(),
          );

          if (
            await this.plugin
              .getIconPackManager()
              .doesIconPackExist(normalizedName)
          ) {
            new Notice('Icon pack already exists.');
            return;
          }

          await this.plugin
            .getIconPackManager()
            .createCustomIconPackDirectory(normalizedName);
          this.textComponent.setValue('');
          this.refreshDisplay();
          new Notice('Icon pack successfully created.');
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
                Object.entries(this.plugin.getData()) as any,
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
        btn.setTooltip('Add an icon');
        btn.onClick(async () => {
          const fileSelector = document.createElement('input');
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
        btn.setTooltip('Remove the icon pack');
        btn.onClick(async () => {
          await this.plugin.getIconPackManager().removeIconPack(iconPack);
          this.refreshDisplay();
          new Notice('Icon pack successfully deleted.');
        });
      });

      ['dragenter', 'dragover', 'dragleave', 'drop'].forEach((event) => {
        iconPackSetting.settingEl.addEventListener(
          event,
          this.preventDefaults,
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
        async (event) => {
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

          const added = await this.addIcons(iconPack, svgs);
          iconPackSetting.setDesc(describe(` (added: ${added})`));
          new Notice(`${added} icon(s) successfully added.`);
        },
        false,
      );
    });
  }
}
