import { ButtonComponent, ColorComponent } from 'obsidian';

/**
 * A labelled color chooser: quick swatches, a full picker, and a reset.
 *
 * Both the foreground and the background need exactly this, so it lives here
 * rather than being written twice. `undefined` is a meaningful value — it means
 * "no explicit color", which for the icon means following the theme and for the
 * background means none at all.
 */

/** Quick-pick colors offered above the full picker. */
export const PREDEFINED_COLORS = [
  '#272727',
  '#FF393C',
  '#FF8D28',
  '#FFCC02',
  '#35C759',
  '#03C3CF',
  '#0088FF',
  '#6254F5',
  '#CB30E0',
  '#FF2C55',
  '#AC7F5E',
  '#8E8E94',
];

export interface ColorFieldOptions {
  /** Heading shown above the swatches. */
  label: string;
  /** Explains what the color does. */
  description: string;
  /** Text of the button that clears the color. */
  resetLabel: string;
  /** Starting value, or `undefined` for none. */
  value: string | undefined;
  /** Called whenever the value changes. */
  onChange: (value: string | undefined) => void;
}

export class ColorField {
  private value: string | undefined;
  private readonly swatches: HTMLButtonElement[] = [];
  private readonly picker: ColorComponent;

  constructor(container: HTMLElement, options: ColorFieldOptions) {
    this.value = options.value;

    const section = container.createDiv({ cls: 'glyphit-color-field' });
    section.createDiv({
      cls: 'glyphit-color-field-label',
      text: options.label,
    });
    section.createDiv({
      cls: 'glyphit-color-field-description setting-item-description',
      text: options.description,
    });

    const swatchRow = section.createDiv({ cls: 'glyphit-swatches' });
    for (const color of PREDEFINED_COLORS) {
      const swatch = swatchRow.createEl('button', { cls: 'glyphit-swatch' });
      swatch.type = 'button';
      swatch.setAttr('aria-label', `Select ${color}`);
      swatch.setAttr('title', color);
      swatch.style.backgroundColor = color;

      swatch.addEventListener('click', () => {
        this.picker.setValue(color);
        this.set(color, options.onChange);
      });

      this.swatches.push(swatch);
    }

    const row = section.createDiv({ cls: 'glyphit-color-field-row' });
    this.picker = new ColorComponent(row)
      .setValue(this.value ?? '#000000')
      .onChange((value) => this.set(value, options.onChange));

    const reset = new ButtonComponent(row);
    reset.setButtonText(options.resetLabel);
    reset.setTooltip(`Clear this color (${options.resetLabel.toLowerCase()})`);
    reset.onClick(() => {
      this.picker.setValue('#000000');
      this.set(undefined, options.onChange);
    });

    this.highlightSelected();
  }

  private set(
    value: string | undefined,
    onChange: (value: string | undefined) => void,
  ): void {
    this.value = value;
    this.highlightSelected();
    onChange(value);
  }

  /**
   * Rings the swatch matching the current value, if any.
   */
  private highlightSelected(): void {
    this.swatches.forEach((swatch, index) => {
      swatch.toggleClass(
        'is-selected',
        this.value?.toLowerCase() === PREDEFINED_COLORS[index].toLowerCase(),
      );
    });
  }
}
