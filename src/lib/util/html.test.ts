import { describe, expect, it } from 'vitest';
import { parseIconMarkup, setIconMarkup } from './html';

const render = (markup: string): string => {
  const node = document.createElement('div');
  setIconMarkup(node, markup);
  return node.innerHTML;
};

describe('setIconMarkup', () => {
  it('should keep an ordinary icon intact', () => {
    const output = render(
      '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M0 0h24v24H0z"></path></svg>',
    );
    expect(output).toContain('<svg');
    expect(output).toContain('viewBox="0 0 24 24"');
    expect(output).toContain('<path d="M0 0h24v24H0z">');
  });

  it('should replace existing children rather than appending to them', () => {
    const node = document.createElement('div');
    setIconMarkup(node, '<svg id="first"></svg>');
    setIconMarkup(node, '<svg id="second"></svg>');
    expect(node.children).toHaveLength(1);
    expect(node.children[0].getAttribute('id')).toBe('second');
  });

  it('should render a plain emoji as text', () => {
    expect(render('😀')).toBe('😀');
  });

  it('should keep a twemoji image', () => {
    const output = render('<img src="https://example.com/1f600.svg" alt="😀">');
    expect(output).toContain('src="https://example.com/1f600.svg"');
  });
});

describe('setIconMarkup sanitizing', () => {
  it('should drop a script element', () => {
    const output = render('<svg></svg><script>globalThis.pwned = true;</script>');
    expect(output).not.toContain('script');
    expect((globalThis as Record<string, unknown>).pwned).toBeUndefined();
  });

  it('should drop inline event handlers', () => {
    const output = render(
      '<svg onload="globalThis.pwned = true"><path onclick="alert(1)"></path></svg>',
    );
    expect(output).not.toContain('onload');
    expect(output).not.toContain('onclick');
    expect(output).toContain('<path>');
  });

  it('should drop a `javascript:` link but keep a real one', () => {
    expect(render('<a href="javascript:alert(1)">x</a>')).not.toContain('href');
    expect(render('<a href="https://example.com">x</a>')).toContain(
      'href="https://example.com"',
    );
  });

  it('should see through entity encoding and whitespace in a URL', () => {
    expect(render('<a href="java&#115;cript:alert(1)">x</a>')).not.toContain(
      'href',
    );
    expect(render('<a href="java\tscript:alert(1)">x</a>')).not.toContain(
      'href',
    );
  });

  it('should drop an iframe', () => {
    expect(render('<svg></svg><iframe></iframe>')).not.toContain('iframe');
  });
});

describe('parseIconMarkup', () => {
  it('should return a fragment that can be inserted more than once', () => {
    const fragment = parseIconMarkup('<svg></svg>');
    expect(fragment.childNodes).toHaveLength(1);
  });

  it('should return an empty fragment for empty markup', () => {
    expect(parseIconMarkup('').childNodes).toHaveLength(0);
  });
});
