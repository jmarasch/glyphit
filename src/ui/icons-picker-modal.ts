import {
  App,
  ButtonComponent,
  Modal,
  Notice,
  Setting,
  prepareFuzzySearch,
} from 'obsidian';
import GlyphItPlugin from '@app/main';
import emoji from '@app/emoji';
import dom from '@app/lib/util/dom';
import svg from '@app/lib/util/svg';
import { saveIconToIconPack } from '@app/util';
import { getSvgFromLoadedIcon } from '@app/icon-pack-manager/util';
import { logger } from '@app/lib/logger';
import { errorMessage } from '@app/lib/util/error';
import { ColorField } from './color-field';
import {
  PickerItem,
  emojiPickerItem,
  iconPickerItem,
  recentPickerItem,
} from './picker-item';

/** How many rows are rendered for a query. */
const RESULT_LIMIT = 120;

/** Milliseconds to wait after a keystroke before searching. */
const SEARCH_DEBOUNCE_MS = 80;

/**
 * The icon picker.
 *
 * Choosing an icon is a two step affair: pick a candidate, then confirm it.
 * The previous version committed on the first click and closed immediately,
 * which left no opportunity to see the icon at full size, to change your mind,
 * or to set its colors. Here the selection drives a preview, colors can be
 * adjusted against that preview, and nothing is written until Apply.
 *
 * Rows are built from the pack indexes rather than from loaded icons, so
 * opening the picker costs a list of names however many icons are installed,
 * and previews are read out of their pack only when drawn — never written to
 * the on-disk cache.
 */
export default class IconsPickerModal extends Modal {
  private plugin: GlyphItPlugin;
  private path: string;

  private items: PickerItem[] = [];
  private recentlyUsed: PickerItem[] = [];
  private selected: PickerItem | null = null;

  /** The icon already in use, shown first and selected on open. */
  private current: PickerItem | null = null;

  /** Color applied to the icon itself, or undefined to follow the theme. */
  private foreground: string | undefined;

  /** Color drawn behind the icon, or undefined for none. */
  private background: string | undefined;

  private searchInput: HTMLInputElement;
  private resultsEl: HTMLElement;
  private previewEl: HTMLElement;
  private previewNameEl: HTMLElement;
  /**
   * Held as the component rather than its element: disabling through Obsidian's
   * API also applies an `is-disabled` class whose styling swallows pointer
   * events, so it has to be cleared the same way it was set.
   */
  private applyButton: ButtonComponent;
  private searchTimer: number | undefined;

  /** Called with the chosen identifier once the user confirms. */
  public onSelect: (iconName: string) => void | undefined;

  /**
   * Whether confirming assigns the icon to {@link path}.
   *
   * Callers that only want to learn which icon was chosen — the custom rule
   * editor, for instance, which stores it against a rule rather than a file —
   * set this to `false` and read the selection from {@link onChooseItem}.
   */
  public commitToPath = true;

  /**
   * Icon to start from, overriding whatever {@link path} currently has.
   *
   * Callers that store an icon somewhere other than against a file path — the
   * custom rule editor, for instance — use this so that reopening the dialog
   * starts on the icon already in use.
   */
  public initialIcon: string | undefined;

  constructor(app: App, plugin: GlyphItPlugin, path: string) {
    super(app);
    this.plugin = plugin;
    this.path = path;

    this.foreground = plugin.getIconColor(path);
    this.background = plugin.getIconBackgroundColor(path);
  }

  onOpen(): void {
    this.modalEl.addClass('glyphit-picker-modal');
    this.contentEl.style.display = 'block';
    this.titleEl.setText('Choose an icon');

    this.buildItems();
    this.resolveCurrent();
    this.buildSearch();
    this.buildColorControls();
    this.buildResults();
    this.buildFooter();

    this.renderResults('');
    this.renderPreview();
    this.scrollSelectedIntoView();
    this.searchInput.focus();
  }

  /**
   * Works out which icon is already in use, and starts on it.
   *
   * Without this, editing an entry that already has an icon opened on an empty
   * selection, so there was nothing to compare a change against and Apply
   * started out disabled.
   */
  private resolveCurrent(): void {
    const existing =
      this.initialIcon ??
      (this.commitToPath && this.path
        ? this.plugin.getIconNameFromPath(this.path)
        : undefined);

    if (!existing) {
      return;
    }

    this.current = recentPickerItem(existing, (id) =>
      this.plugin.getIconPackManager().findEntry(id),
    );
    this.selected = this.current;
  }

  /**
   * Brings the pre-selected row into view, which it will not be if the icon
   * sits far down the unfiltered list.
   */
  private scrollSelectedIntoView(): void {
    this.resultsEl
      .querySelector('.glyphit-picker-row.is-selected')
      ?.scrollIntoView({ block: 'nearest' });
  }

  onClose(): void {
    window.clearTimeout(this.searchTimer);
    this.contentEl.empty();
  }

  /**
   * Builds every row once, up front. These are names only, so even a very large
   * installed set is cheap to hold.
   */
  private buildItems(): void {
    const iconPackManager = this.plugin.getIconPackManager();

    this.recentlyUsed = [...this.plugin.getSettings().recentlyUsedIcons]
      .reverse()
      .map((value) => {
        if (emoji.isEmoji(value)) {
          return recentPickerItem(value, () => undefined);
        }

        // Recents from an uninstalled pack are deliberately dropped: those
        // icons keep rendering where they are already applied, but a removed
        // pack should not still be a place to pick new icons from.
        const located = iconPackManager.findEntry(value);
        if (
          !located ||
          !iconPackManager.isPackInstalled(located.pack.getName())
        ) {
          return null;
        }

        return recentPickerItem(value, () => located);
      })
      .filter((item): item is PickerItem => item !== null);

    this.items = [
      ...iconPackManager.getAllEntries().map(iconPickerItem),
      ...Object.keys(emoji.shortNames).map(emojiPickerItem),
    ];
  }

  private buildSearch(): void {
    this.searchInput = this.contentEl.createEl('input', {
      type: 'text',
      cls: 'glyphit-picker-search',
    });
    this.searchInput.placeholder = 'Search icons and emoji';

    this.searchInput.addEventListener('input', () => {
      window.clearTimeout(this.searchTimer);
      this.searchTimer = window.setTimeout(
        () => this.renderResults(this.searchInput.value),
        SEARCH_DEBOUNCE_MS,
      );
    });

    // Enter confirms, so a chosen icon can be applied without reaching for the
    // mouse. Escape is handled by the modal itself.
    this.searchInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && this.selected) {
        event.preventDefault();
        this.apply();
      }
    });
  }

  /**
   * Color controls, which act on the preview rather than on the vault.
   *
   * This is the only place icon colors are set. There used to be a separate
   * dialog for it, which meant two places to keep in step for no benefit:
   * choosing an icon and choosing how it looks belong together.
   */
  private buildColorControls(): void {
    const bar = this.contentEl.createDiv({ cls: 'glyphit-color-bar' });

    new ColorField(bar, {
      label: 'Icon color',
      description: 'The color the icon is drawn in.',
      resetLabel: 'Use theme color',
      value: this.foreground,
      onChange: (value) => {
        this.foreground = value;
        this.refreshColors();
      },
    });

    new ColorField(bar, {
      label: 'Background color',
      description: 'Drawn behind the icon.',
      resetLabel: 'No background',
      value: this.background,
      onChange: (value) => {
        this.background = value;
        this.refreshColors();
      },
    });
  }

  /**
   * Redraws the preview after a color change.
   *
   * Only the preview follows the color. The result rows stay in their natural
   * colors: recoloring the whole list on every tick of a color input is both
   * visually noisy and needless work, and the point of the preview is to show
   * what the choice will actually look like.
   */
  private refreshColors(): void {
    this.renderPreview();
  }

  private buildResults(): void {
    this.resultsEl = this.contentEl.createDiv({
      cls: 'glyphit-picker-results',
    });
  }

  /**
   * The preview and the confirm/cancel buttons.
   */
  private buildFooter(): void {
    const footer = this.contentEl.createDiv({ cls: 'glyphit-picker-footer' });

    const preview = footer.createDiv({ cls: 'glyphit-picker-selection' });
    this.previewEl = preview.createDiv({ cls: 'glyphit-picker-preview' });
    this.previewNameEl = preview.createDiv({
      cls: 'glyphit-picker-preview-name',
      text: 'Nothing selected',
    });

    new Setting(footer)
      .addButton((btn) => {
        btn.setButtonText('Cancel');
        btn.onClick(() => this.close());
      })
      .addButton((btn) => {
        btn.setButtonText('Apply');
        btn.setCta();
        btn.setDisabled(true);
        this.applyButton = btn;
        btn.onClick(() => this.apply());
      });
  }

  /**
   * Filters and draws the result rows for a query.
   */
  private renderResults(query: string): void {
    this.resultsEl.empty();

    const matches = this.search(query);

    if (matches.length === 0) {
      this.resultsEl.createDiv({
        cls: 'glyphit-picker-empty',
        text:
          this.items.length === 0 ? 'No icon packs installed.' : 'No matches.',
      });
      return;
    }

    for (const item of matches) {
      this.renderRow(item);
    }
  }

  /**
   * Ranks rows against a query, falling back to recently used when empty.
   */
  private search(query: string): PickerItem[] {
    const trimmed = query.trim();

    if (trimmed.length === 0) {
      // The icon in use first, then recently used, then everything else.
      const lead = [
        ...(this.current ? [this.current] : []),
        ...this.recentlyUsed,
      ];
      const seen = new Set(lead.map((item) => item.id));

      return [
        ...lead.filter(
          (item, index) => lead.findIndex((o) => o.id === item.id) === index,
        ),
        ...this.items.filter((item) => !seen.has(item.id)),
      ].slice(0, RESULT_LIMIT);
    }

    const matcher = prepareFuzzySearch(trimmed);
    const scored: { item: PickerItem; score: number }[] = [];

    for (const item of this.items) {
      const result = matcher(item.searchText);
      if (result) {
        scored.push({ item, score: result.score });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, RESULT_LIMIT).map((entry) => entry.item);
  }

  private renderRow(item: PickerItem): void {
    const row = this.resultsEl.createDiv({ cls: 'glyphit-picker-row' });
    if (this.selected?.id === item.id) {
      row.addClass('is-selected');
    }

    const preview = row.createDiv({ cls: 'glyphit-icon-preview' });
    const text = row.createDiv({ cls: 'glyphit-picker-text' });
    text.createDiv({ cls: 'glyphit-picker-name', text: item.label });
    if (item.meta) {
      text.createDiv({ cls: 'glyphit-picker-meta', text: item.meta });
    }

    this.drawInto(preview, item, false);

    row.addEventListener('click', () => {
      this.selected = item;
      // Only the selection state changes, so redrawing the list is enough.
      this.resultsEl
        .querySelectorAll('.glyphit-picker-row.is-selected')
        .forEach((el) => el.removeClass('is-selected'));
      row.addClass('is-selected');
      this.renderPreview();
    });
  }

  /**
   * Draws an icon or emoji into a container at the current colors.
   *
   * @param large Whether this is the confirmation preview rather than a row.
   */
  private drawInto(el: HTMLElement, item: PickerItem, large: boolean): void {
    el.empty();

    // Only the confirmation preview is tinted; rows show icons as they are.
    const foreground = large ? this.foreground : undefined;
    el.style.backgroundColor = (large ? this.background : undefined) ?? '';

    if (item.kind === 'emoji') {
      const parsed = emoji.parseEmoji(
        this.plugin.getSettings().emojiStyle,
        item.id,
      );
      if (parsed) {
        el.innerHTML = parsed;
      }
      return;
    }

    const loaded = getSvgFromLoadedIcon(this.plugin, item.prefix, item.name);
    if (loaded) {
      el.innerHTML = foreground ? svg.colorize(loaded, foreground) : loaded;
      return;
    }

    // Not resolved yet, so it is still inside its pack. `persist` stays off:
    // browsing must not write anything to the cache.
    void dom.setIconForNodeAsync(this.plugin, item.id, el, {
      shouldApplyAllStyles: false,
      color: foreground,
    });

    if (large) {
      el.addClass('glyphit-picker-preview-loading');
    }
  }

  /**
   * Updates the confirmation preview to match the current selection.
   */
  private renderPreview(): void {
    if (!this.selected) {
      this.previewNameEl.setText('Nothing selected');
      this.applyButton?.setDisabled(true);
      return;
    }

    this.drawInto(this.previewEl, this.selected, true);
    this.previewNameEl.setText(
      this.selected.meta
        ? `${this.selected.label} — ${this.selected.meta}`
        : this.selected.label,
    );
    this.applyButton?.setDisabled(false);
  }

  /**
   * Commits the selection. This is the only path that writes anything.
   */
  private apply(): void {
    const item = this.selected;
    if (!item) {
      return;
    }

    try {
      this.commit(item);
    } catch (error) {
      const message = errorMessage(error);
      logger.error(`Could not apply icon '${item.id}' (${message})`);
      new Notice(`Could not apply ${item.label}: ${message}`);
      return;
    }

    // Handlers may be async; the modal closes without waiting on them.
    void this.onChooseItem(item);
    this.onSelect?.(item.id);
    this.close();
  }

  /**
   * Writes the selection out. Separated so a failure can be reported without
   * closing the dialog and losing what the user picked.
   */
  private commit(item: PickerItem): void {
    if (item.kind === 'icon') {
      // Promotes the icon out of the preview tier and writes it to the cache.
      saveIconToIconPack(this.plugin, item.id);
    }

    if (this.commitToPath && this.path) {
      dom.createIconNode(this.plugin, this.path, item.id, {
        color: this.foreground,
        backgroundColor: this.background,
      });

      this.plugin.addFolderIcon(this.path, item.id);

      if (this.foreground) {
        this.plugin.addIconColor(this.path, this.foreground);
      } else {
        this.plugin.removeIconColor(this.path);
      }

      if (this.background) {
        this.plugin.addIconBackgroundColor(this.path, this.background);
      } else {
        this.plugin.removeIconBackgroundColor(this.path);
      }

      this.plugin.notifyPlugins();
    }
  }

  /**
   * Hook for callers that need the chosen row rather than just its identifier.
   */
  public onChooseItem(_item: PickerItem): void | Promise<void> {}
}
