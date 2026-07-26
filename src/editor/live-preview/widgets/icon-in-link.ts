import emoji from '@app/emoji';
import { Icon } from '@app/icon-pack-manager';
import {
  calculateFontTextSize,
  calculateHeaderSize,
  HeaderToken,
} from '@app/lib/util/text';
import svg from '@app/lib/util/svg';
import GlyphItPlugin from '@app/main';
import { WidgetType } from '@codemirror/view';
import { setIconMarkup } from '@app/lib/util/html';

export class IconInLinkWidget extends WidgetType {
  constructor(
    private plugin: GlyphItPlugin,
    private iconData: Icon | string,
    private path: string,
    private headerType: HeaderToken | null,
  ) {
    super();
  }

  toDOM() {
    const iconNode = document.createElement('span');
    const iconName =
      typeof this.iconData === 'string'
        ? this.iconData
        : this.iconData.prefix + this.iconData.name;
    iconNode.style.color =
      this.plugin.getIconColor(this.path) ??
      this.plugin.getSettings().iconColor;
    iconNode.setAttribute('title', iconName);
    iconNode.classList.add('glyphit-icon-in-link');

    // A string payload is an emoji, which needs no baseline nudge.
    iconNode.toggleClass('glyphit-icon-is-emoji', typeof this.iconData === 'string');

    let innerHTML =
      typeof this.iconData === 'string'
        ? this.iconData
        : this.iconData.svgElement;

    let fontSize = calculateFontTextSize();
    if (this.headerType) {
      fontSize = calculateHeaderSize(this.headerType);
    }

    if (emoji.isEmoji(innerHTML)) {
      innerHTML = emoji.parseEmoji(
        this.plugin.getSettings().emojiStyle,
        innerHTML,
        fontSize,
      );
    } else {
      innerHTML = svg.setFontSize(innerHTML, fontSize);
    }

    setIconMarkup(iconNode, innerHTML);
    return iconNode;
  }

  ignoreEvent(): boolean {
    return true;
  }
}
