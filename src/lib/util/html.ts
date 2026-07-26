/**
 * Putting icon markup into the document without handing it to an HTML sink.
 *
 * Every icon this plugin draws is an SVG string that came from an archive or
 * folder the user installed. That makes it untrusted by construction: a
 * hand-edited pack, or one downloaded from somewhere unwise, can carry an
 * `onload=` attribute or a `javascript:` link just as easily as a `<path>`.
 * Assigning such a string to `innerHTML` runs whatever it contains with the
 * full privileges of the Obsidian window.
 *
 * Parsing it into a detached document first means the markup is never live in
 * our document while it is being inspected, and scripts parsed this way are
 * flagged as already-started, so they never execute. What parsing does not
 * stop is inline event handlers and `javascript:` URLs, so those are stripped
 * before the nodes are adopted.
 */

/** Attribute values that navigate, and so can carry a `javascript:` URL. */
const URL_ATTRIBUTES = ['href', 'xlink:href', 'src', 'action', 'formaction'];

/** Elements that have no business being inside an icon. */
const FORBIDDEN_TAGS = new Set([
  'script',
  'iframe',
  'object',
  'embed',
  'link',
  'meta',
  'base',
]);

const isDangerousUrl = (value: string): boolean => {
  // Entities and whitespace come off first: `java&#115;cript:` and
  // `java\tscript:` both survive a naive prefix check but still navigate.
  const normalized = value
    .replace(/&#(\d+);?/g, (_, code: string) =>
      String.fromCharCode(Number(code)),
    )
    .replace(/\s/g, '')
    .toLowerCase();

  return (
    normalized.startsWith('javascript:') ||
    normalized.startsWith('data:text/html')
  );
};

/**
 * Removes anything executable from a parsed subtree, in place.
 */
const sanitize = (root: ParentNode): void => {
  for (const element of Array.from(root.querySelectorAll('*'))) {
    if (FORBIDDEN_TAGS.has(element.tagName.toLowerCase())) {
      element.remove();
      continue;
    }

    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();

      // `onclick`, `onload`, and every other inline handler.
      if (name.startsWith('on')) {
        element.removeAttribute(attribute.name);
        continue;
      }

      if (URL_ATTRIBUTES.includes(name) && isDangerousUrl(attribute.value)) {
        element.removeAttribute(attribute.name);
      }
    }
  }
};

/**
 * Parses icon markup into nodes that are safe to insert.
 *
 * @param markup SVG or emoji markup. Plain text becomes a text node.
 * @returns A fragment holding the parsed, sanitized nodes.
 */
export const parseIconMarkup = (markup: string): DocumentFragment => {
  const parsed = new DOMParser().parseFromString(markup, 'text/html');
  sanitize(parsed.body);

  const fragment = document.createDocumentFragment();
  for (const node of Array.from(parsed.body.childNodes)) {
    fragment.appendChild(document.importNode(node, true));
  }

  return fragment;
};

/**
 * Replaces a node's children with parsed icon markup.
 *
 * The direct replacement for `node.innerHTML = markup`.
 */
export const setIconMarkup = (node: Element, markup: string): void => {
  node.replaceChildren(parseIconMarkup(markup));
};

/**
 * Appends parsed icon markup to a node, leaving existing children alone.
 */
export const appendIconMarkup = (node: Element, markup: string): void => {
  node.appendChild(parseIconMarkup(markup));
};
