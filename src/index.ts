import GlyphItAPI from './lib/api';
import GlyphItPlugin from './main';

export function getApi(plugin: GlyphItPlugin): GlyphItAPI | undefined {
  return plugin.app.plugins.plugins['glyphit']?.api;
}
