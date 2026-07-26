import GlyphItPlugin from '@app/main';

export default abstract class GlyphItSetting {
  protected plugin: GlyphItPlugin;
  protected containerEl: HTMLElement;

  constructor(plugin: GlyphItPlugin, containerEl: HTMLElement) {
    this.plugin = plugin;
    this.containerEl = containerEl;
  }

  public abstract display(): void;
}
