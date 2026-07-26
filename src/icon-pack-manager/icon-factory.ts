import { logger } from '@app/lib/logger';
import svg from '@app/lib/util/svg';
import { Icon } from './types';

/**
 * Turns raw SVG markup into the {@link Icon} shape the rest of the plugin
 * renders.
 *
 * This is the only place that parses icon markup, so the normalisation applied
 * to a downloaded pack, a user's custom folder and a cached file is identical.
 */

/** An icon name has to start with an uppercase letter or a digit. */
const VALID_ICON_NAME = /^[A-Z0-9]/;

const SVG_VIEWBOX_RE = /viewBox="([^"]*)"/g;
const SVG_CONTENT_RE = /<svg.*>(.*?)<\/svg>/g;

export interface CreateIconParams {
  /** Icon name without the pack prefix, e.g. `Sandstorm`. */
  name: string;
  /** Pack prefix, e.g. `Gi`. */
  prefix: string;
  /** Name of the pack the icon belongs to. */
  packName: string | null;
  /** Human readable name, usually the original filename without extension. */
  displayName: string;
  /** Raw SVG markup. */
  markup: string;
}

/**
 * Builds an {@link Icon} from SVG markup.
 *
 * @returns The icon, or `null` when the markup is empty, is not an SVG, or the
 * name cannot be addressed by the prefix splitter.
 */
export function createIcon(params: CreateIconParams): Icon | null {
  const { name, prefix, packName, displayName } = params;

  if (params.markup.length === 0) {
    return null;
  }

  if (!VALID_ICON_NAME.test(name)) {
    logger.info(`Skipping icon with invalid name: ${name}`);
    return null;
  }

  // Collapse whitespace so the extraction regexes below see a single line.
  const markup = params.markup
    .replace(/(\r\n|\n|\r)/gm, '')
    .replace(/>\s+</gm, '><');

  const viewboxMatch = markup.match(SVG_VIEWBOX_RE);
  const svgViewbox =
    viewboxMatch && viewboxMatch.length !== 0 ? viewboxMatch[0] : '';

  const contentMatch = markup.match(SVG_CONTENT_RE);
  if (!contentMatch) {
    logger.info(`Skipping icon with invalid svg content: ${name}`);
    return null;
  }

  const svgContent = contentMatch.map((value) =>
    value.replace(/<\/?svg>/g, '').replace(/<svg.+?>/g, ''),
  )[0];

  return {
    name,
    prefix,
    iconPackName: packName,
    displayName,
    filename: displayName,
    svgContent,
    svgViewbox,
    svgElement: svg.extract(markup),
  };
}
