/**
 * Obsidian's DOM extensions, for tests.
 *
 * Obsidian adds a set of convenience methods to `Element` and `Node` at
 * runtime — `addClass`, `createDiv`, `setText` and friends. They are declared
 * in `obsidian.d.ts`, so they type-check, but nothing defines them outside the
 * app. Without these, any code under test that uses them throws
 * `x.addClass is not a function`, which pushes production code towards the
 * plain DOM API purely to keep tests running.
 *
 * These are close enough for tests, not exact reimplementations.
 */

type DomElementInfo = {
  cls?: string | string[];
  text?: string | DocumentFragment;
  attr?: Record<string, string | number | boolean | null>;
  title?: string;
  value?: string;
  type?: string;
  placeholder?: string;
  href?: string;
};

const applyInfo = (el: Element, info?: DomElementInfo): void => {
  if (!info) {
    return;
  }

  if (info.cls) {
    const classes = Array.isArray(info.cls) ? info.cls : info.cls.split(/\s+/);
    for (const cls of classes.filter(Boolean)) {
      el.classList.add(cls);
    }
  }

  if (typeof info.text === 'string') {
    el.textContent = info.text;
  } else if (info.text) {
    el.appendChild(info.text);
  }

  for (const key of ['title', 'value', 'type', 'placeholder', 'href'] as const) {
    if (info[key] !== undefined) {
      el.setAttribute(key, String(info[key]));
    }
  }

  for (const [key, value] of Object.entries(info.attr ?? {})) {
    if (value !== null && value !== false) {
      el.setAttribute(key, String(value));
    }
  }
};

const define = (target: object, name: string, value: unknown): void => {
  Object.defineProperty(target, name, {
    value,
    writable: true,
    configurable: true,
    enumerable: false,
  });
};

/**
 * Installs the extensions onto the global DOM prototypes.
 *
 * Safe to call more than once.
 */
export const installObsidianDomExtensions = (): void => {
  define(Element.prototype, 'addClass', function (
    this: Element,
    ...classes: string[]
  ) {
    this.classList.add(...classes);
  });

  define(Element.prototype, 'removeClass', function (
    this: Element,
    ...classes: string[]
  ) {
    this.classList.remove(...classes);
  });

  define(Element.prototype, 'toggleClass', function (
    this: Element,
    classes: string | string[],
    value: boolean,
  ) {
    for (const cls of Array.isArray(classes) ? classes : [classes]) {
      this.classList.toggle(cls, value);
    }
  });

  define(Element.prototype, 'hasClass', function (this: Element, cls: string) {
    return this.classList.contains(cls);
  });

  define(Element.prototype, 'setText', function (
    this: Element,
    text: string | DocumentFragment,
  ) {
    if (typeof text === 'string') {
      this.textContent = text;
    } else {
      this.textContent = '';
      this.appendChild(text);
    }
  });

  define(Element.prototype, 'appendText', function (
    this: Element,
    text: string,
  ) {
    this.appendChild(this.ownerDocument.createTextNode(text));
  });

  define(Node.prototype, 'empty', function (this: Node) {
    while (this.firstChild) {
      this.removeChild(this.firstChild);
    }
  });

  define(Node.prototype, 'detach', function (this: Node) {
    (this as ChildNode).parentNode?.removeChild(this);
  });

  define(Element.prototype, 'createEl', function (
    this: Element,
    tag: string,
    info?: DomElementInfo,
    callback?: (el: HTMLElement) => void,
  ) {
    const el = this.ownerDocument.createElement(tag);
    applyInfo(el, info);
    this.appendChild(el);
    callback?.(el);
    return el;
  });

  define(Element.prototype, 'createDiv', function (
    this: Element,
    info?: DomElementInfo | string,
    callback?: (el: HTMLElement) => void,
  ) {
    return (this as HTMLElement).createEl(
      'div',
      typeof info === 'string' ? { cls: info } : info,
      callback,
    );
  });

  define(Element.prototype, 'createSpan', function (
    this: Element,
    info?: DomElementInfo | string,
    callback?: (el: HTMLElement) => void,
  ) {
    return (this as HTMLElement).createEl(
      'span',
      typeof info === 'string' ? { cls: info } : info,
      callback,
    );
  });

  define(HTMLElement.prototype, 'setCssStyles', function (
    this: HTMLElement,
    styles: Partial<CSSStyleDeclaration>,
  ) {
    Object.assign(this.style, styles);
  });

  define(HTMLElement.prototype, 'setCssProps', function (
    this: HTMLElement,
    props: Record<string, string>,
  ) {
    for (const [key, value] of Object.entries(props)) {
      this.style.setProperty(key, value);
    }
  });

  // The document-level and free-standing constructors Obsidian also provides.
  const doc = globalThis.document as unknown as Record<string, unknown>;
  const global = globalThis as unknown as Record<string, unknown>;
  for (const name of ['createEl', 'createDiv', 'createSpan'] as const) {
    const make = (...args: unknown[]) =>
      (
        document.body as unknown as Record<
          string,
          (...a: unknown[]) => HTMLElement
        >
      )[name](...args);
    define(doc, name, make);
    define(global, name, make);
  }
};
