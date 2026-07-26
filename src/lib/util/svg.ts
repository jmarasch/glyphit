// This library file does not include any other dependency and is a standalone file that
// only include utility functions for manipulating or extracting svg information.

/**
 * Extracts an SVG string from a given input string and returns a cleaned up and
 * formatted SVG string.
 * @param svgString SVG string to extract from.
 * @returns Cleaned up and formatted SVG string.
 */
const extract = (svgString: string): string => {
  // Removes unnecessary spaces and newlines.
  svgString = svgString.replace(/(\r\n|\n|\r)/gm, '');
  svgString = svgString.replace(/>\s+</gm, '><');

  // Create a parser for better parsing of HTML.
  const parser = new DOMParser();
  const svg = parser
    .parseFromString(svgString, 'text/html')
    .querySelector('svg');

  // Removes `width` and `height` from the `style` attribute.
  if (svg.hasAttribute('style')) {
    svg.style.width = '';
    svg.style.height = '';
  }

  // Add `viewbox`, if it is not already a attribute.
  if (svg.viewBox.baseVal.width === 0 && svg.viewBox.baseVal.height === 0) {
    const width = svg.width.baseVal.value ?? 16;
    const height = svg.height.baseVal.value ?? 16;
    svg.viewBox.baseVal.width = width;
    svg.viewBox.baseVal.height = height;
  }

  if (!svg.hasAttribute('fill')) {
    svg.setAttribute('fill', 'currentColor');
  }

  const possibleTitle = svg.querySelector('title');
  if (possibleTitle) {
    possibleTitle.remove();
  }

  svg.setAttribute('width', '16px');
  svg.setAttribute('height', '16px');

  return svg.outerHTML;
};

/**
 * Sets the font size of an SVG string by modifying its width and/or height attributes.
 * The font size will be always set in pixels.
 * @param svgString SVG string to modify.
 * @param fontSize Font size in pixels to set.
 * @returns Modified SVG string.
 */
const setFontSize = (svgString: string, fontSize: number): string => {
  const widthRe = new RegExp(/width="[\d.]+(px)?"/);
  const heightRe = new RegExp(/height="[\d.]+(px)?"/);
  if (svgString.match(widthRe)) {
    svgString = svgString.replace(widthRe, `width="${fontSize}px"`);
  }
  if (svgString.match(heightRe)) {
    svgString = svgString.replace(heightRe, `height="${fontSize}px"`);
  }
  return svgString;
};

/**
 * Applies a color to an element's paint attribute, leaving `none` alone.
 *
 * `fill="none"` and `stroke="none"` are structural rather than decorative:
 * outline icons rely on an unfilled shape, so overwriting them would turn the
 * icon into a solid blob.
 *
 * @returns Whether the element was painted.
 */
const paintElement = (element: Element, color: string): boolean => {
  let painted = false;

  for (const attribute of ['fill', 'stroke']) {
    const current = element.getAttribute(attribute);
    if (current !== null && current !== 'none') {
      element.setAttribute(attribute, color);
      painted = true;
    }
  }

  return painted;
};

/**
 * Replaces the fill and stroke colors of an SVG string with a given color.
 *
 * Two modes, because the two callers want different things:
 *
 * - **Deep** (an explicit color was chosen) also recolors descendants. Many
 *   packs hard-code their color on the individual shapes rather than on the
 *   `<svg>` element (game-icons.net ships `<path fill="#fff">`), and such a
 *   shape wins over anything set on the root, so recoloring only the root would
 *   leave the icon looking untouched.
 * - **Shallow** (no color chosen, so the icon just inherits the theme) touches
 *   only the root. Descending here would flatten deliberately multi-colored
 *   icons such as flags and brand logos into a single color on every render.
 *
 * @param svgString SVG string to modify.
 * @param color Color to set. Defaults to `currentColor`, which makes the icon
 * follow the theme.
 * @param deep Whether descendants are recolored too. Defaults to `true` exactly
 * when an explicit color was given.
 * @returns The modified SVG string.
 */
const colorize = (
  svgString: string,
  color: string | undefined | null,
  deep = Boolean(color),
): string => {
  if (!color) {
    color = 'currentColor';
  }

  const parser = new DOMParser();
  // Tries to parse the string into a HTML node.
  const parsedNode = parser.parseFromString(svgString, 'text/html');
  const svg = parsedNode.querySelector('svg');

  if (!svg) {
    return svgString;
  }

  if (!deep) {
    if (svg.hasAttribute('fill') && svg.getAttribute('fill') !== 'none') {
      svg.setAttribute('fill', color);
    } else if (
      svg.hasAttribute('stroke') &&
      svg.getAttribute('stroke') !== 'none'
    ) {
      svg.setAttribute('stroke', color);
    }

    return svg.outerHTML;
  }

  const paintedRoot = paintElement(svg, color);

  let paintedChild = false;
  for (const descendant of Array.from(svg.querySelectorAll('*'))) {
    paintedChild = paintElement(descendant, color) || paintedChild;
  }

  // An icon that declares no paint at all inherits it, so give the root
  // something to inherit rather than leaving the color unapplied.
  if (!paintedRoot && !paintedChild) {
    svg.setAttribute('fill', color);
  }

  return svg.outerHTML;
};

export default {
  extract,
  colorize,
  setFontSize,
};
