import GlyphItPlugin from '@app/main';
import config from '@app/config';
import emoji from '@app/emoji';
import svg from './util/svg';
import { IconInTitlePosition } from '@app/settings/data';
import { setIconMarkup } from './util/html';

const getTitleIcon = (leaf: HTMLElement): HTMLElement | null => {
  return leaf.querySelector(`.${config.TITLE_ICON_CLASS}`);
};

interface Options {
  fontSize?: number;
}

const add = (
  plugin: GlyphItPlugin,
  inlineTitleEl: HTMLElement,
  svgElement: string,
  options?: Options,
): void => {
  if (!inlineTitleEl.parentElement) {
    return;
  }

  if (options?.fontSize) {
    svgElement = svg.setFontSize(svgElement, options.fontSize);
  }

  let titleIcon = getTitleIcon(inlineTitleEl.parentElement);
  if (!titleIcon) {
    titleIcon = document.createElement('div');
  }

  const isInline =
    plugin.getSettings().iconInTitlePosition === IconInTitlePosition.Inline;

  titleIcon.addClass(config.TITLE_ICON_CLASS);
  titleIcon.removeClass('glyphit-is-hidden');
  titleIcon.toggleClass('glyphit-title-inline', isInline);
  titleIcon.toggleClass('glyphit-title-above', !isInline);

  // Checks if the passed element is an emoji.
  const isEmoji = emoji.isEmoji(svgElement);
  titleIcon.toggleClass('glyphit-title-emoji', isEmoji);
  if (isEmoji && options.fontSize) {
    svgElement =
      emoji.parseEmoji(
        plugin.getSettings().emojiStyle,
        svgElement,
        options.fontSize,
      ) ?? svgElement;
    titleIcon.setCssProps({
      '--glyphit-title-font-size': `${options.fontSize}px`,
    });
  }
  setIconMarkup(titleIcon, svgElement);

  let wrapperElement = inlineTitleEl.parentElement;
  // Checks the parent and selects the correct wrapper element.
  // This should only happen in the beginning.
  if (
    wrapperElement &&
    !wrapperElement.classList.contains(config.INLINE_TITLE_WRAPPER_CLASS)
  ) {
    wrapperElement = wrapperElement.querySelector(
      `.${config.INLINE_TITLE_WRAPPER_CLASS}`,
    );
  }

  // Whenever there is no correct wrapper element, we create one.
  if (!wrapperElement) {
    wrapperElement = inlineTitleEl.parentElement.createDiv();
    wrapperElement.classList.add(config.INLINE_TITLE_WRAPPER_CLASS);
  }

  // Avoiding adding the same nodes together when changing the title.
  if (wrapperElement !== inlineTitleEl.parentElement) {
    inlineTitleEl.parentElement.prepend(wrapperElement);
  }

  wrapperElement.toggleClass('glyphit-title-inline', isInline);
  wrapperElement.toggleClass('glyphit-title-above', !isInline);

  if (isInline) {
    // The title's padding depends on the theme and the heading level, so the
    // only way to line the icon up with the text is to measure it.
    const inlineTitlePaddingTop = getComputedStyle(
      inlineTitleEl,
      null,
    ).getPropertyValue('padding-top');
    titleIcon.setCssProps({
      '--glyphit-title-padding-top': inlineTitlePaddingTop,
    });
  }

  wrapperElement.append(titleIcon);
  wrapperElement.append(inlineTitleEl);
};

const updateStyle = (inlineTitleEl: HTMLElement, options: Options): void => {
  if (!inlineTitleEl.parentElement) {
    return;
  }

  const titleIcon = getTitleIcon(inlineTitleEl.parentElement);
  if (!titleIcon) {
    return;
  }

  if (options.fontSize) {
    if (!emoji.isEmoji(titleIcon.innerHTML)) {
      setIconMarkup(
        titleIcon,
        svg.setFontSize(titleIcon.innerHTML, options.fontSize),
      );
    } else {
      titleIcon.style.fontSize = `${options.fontSize}px`;
    }
  }
};

/**
 * Hides the title icon from the provided HTMLElement.
 * @param contentEl HTMLElement to hide the title icon from.
 */
const hide = (inlineTitleEl: HTMLElement): void => {
  if (!inlineTitleEl.parentElement) {
    return;
  }

  const titleIconContainer = getTitleIcon(inlineTitleEl.parentElement);
  if (!titleIconContainer) {
    return;
  }

  titleIconContainer.addClass('glyphit-is-hidden');
};

const remove = (inlineTitleEl: HTMLElement): void => {
  if (!inlineTitleEl.parentElement) {
    return;
  }

  const titleIconContainer = getTitleIcon(inlineTitleEl.parentElement);
  if (!titleIconContainer) {
    return;
  }

  titleIconContainer.remove();
};

export default {
  add,
  updateStyle,
  hide,
  remove,
};
