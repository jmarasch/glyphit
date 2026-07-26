import {
  App,
  Editor,
  EditorPosition,
  EditorSuggest,
  EditorSuggestContext,
  EditorSuggestTriggerInfo,
} from 'obsidian';
import icon from '@app/lib/icon';
import dom from '@app/lib/util/dom';
import { appendIconMarkup } from '@app/lib/util/html';
import emoji from '@app/emoji';
import { saveIconToIconPack } from '@app/util';
import GlyphItPlugin from '@app/main';

export default class SuggestionIcon extends EditorSuggest<string> {
  constructor(
    app: App,
    public plugin: GlyphItPlugin,
  ) {
    super(app);
  }

  onTrigger(cursor: EditorPosition, editor: Editor): EditorSuggestTriggerInfo {
    // Isolate shortcode starting position closest to the cursor.
    const shortcodeStart = editor
      .getLine(cursor.line)
      .substring(0, cursor.ch)
      .lastIndexOf(this.plugin.getSettings().iconIdentifier);

    // `onTrigger` needs to return `null` as soon as possible to save processing performance.
    if (shortcodeStart === -1) {
      return null;
    }

    // Regex for checking if the shortcode is not done yet.
    const regex = new RegExp(
      `^(${this.plugin.getSettings().iconIdentifier})\\w+$`,
      'g',
    );
    const regexOngoingShortcode = editor
      .getLine(cursor.line)
      .substring(shortcodeStart, cursor.ch)
      .match(regex);

    if (regexOngoingShortcode === null) {
      return null;
    }

    const startingIndex = editor
      .getLine(cursor.line)
      .indexOf(regexOngoingShortcode[0]);

    return {
      start: {
        line: cursor.line,
        ch: startingIndex,
      },
      end: {
        line: cursor.line,
        ch: startingIndex + regexOngoingShortcode[0].length,
      },
      query: regexOngoingShortcode[0],
    };
  }

  getSuggestions(context: EditorSuggestContext): string[] {
    const queryLowerCase = context.query
      .substring(this.plugin.getSettings().iconIdentifier.length)
      .toLowerCase();

    // Store all icons corresponding to the current query. This searches the
    // pack indexes, which hold names only, so no icon is decompressed to
    // answer a keystroke.
    const iconsNameArray = this.plugin
      .getIconPackManager()
      .getAllEntries()
      .filter(({ entry }) => entry.id.toLowerCase().includes(queryLowerCase))
      .map(({ entry }) => entry.id);

    // Store all emojis correspoding to the current query - parsing whitespaces and
    // colons for shortcodes compatibility.
    const emojisNameArray = Object.keys(emoji.shortNames).filter((e) =>
      emoji.getShortcode(e)?.includes(queryLowerCase),
    );

    return [...iconsNameArray, ...emojisNameArray];
  }

  renderSuggestion(value: string, el: HTMLElement): void {
    el.addClass('glyphit-suggestion-row');

    // Already loaded, so it can be drawn immediately.
    const iconObject = icon.getIconByName(this.plugin, value);
    if (iconObject) {
      el.empty();
      appendIconMarkup(el, iconObject.svgElement);
      el.appendText(' ');
      el.createSpan({ text: value });
      return;
    }

    const shortcode = emoji.getShortcode(value);
    if (shortcode) {
      // Suggest an emoji - display its shortcode version.
      el.empty();
      el.createSpan({ text: value });
      el.appendText(' ');
      el.createSpan({ text: shortcode });
      return;
    }

    // Known to the pack index but never used, so it is still inside its
    // archive. Show the label now and fill the preview in once it is read out.
    if (!this.plugin.getIconPackManager().doesIconExists(value)) {
      return;
    }

    el.empty();
    const preview = el.createSpan();
    el.appendText(' ');
    el.createSpan({ text: value });

    void dom.setIconForNodeAsync(this.plugin, value, preview, {
      shouldApplyAllStyles: false,
    });
  }

  selectSuggestion(value: string): void {
    const isEmoji = emoji.isEmoji(value.replace(/_/g, ' '));
    if (!isEmoji) {
      saveIconToIconPack(this.plugin, value);
    }

    // Replace query with iconNameWithPrefix or emoji unicode directly.
    const updatedValue = isEmoji
      ? value
      : `${this.plugin.getSettings().iconIdentifier}${value}${
          this.plugin.getSettings().iconIdentifier
        }`;
    this.context.editor.replaceRange(
      updatedValue,
      this.context.start,
      this.context.end,
    );
  }
}
