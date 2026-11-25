// Element builders. Strings become text nodes, never markup: much of what the
// page shows comes from untrusted PDF text.

export type Child = Node | string | null | undefined | false;
export type Attributes = Readonly<Record<string, string | boolean | undefined>>;

function fill<E extends Element>(element: E, attributes: Attributes, children: readonly Child[]): E {
  for (const [name, value] of Object.entries(attributes)) {
    if (value === true) {
      element.setAttribute(name, '');
    } else if (typeof value === 'string') {
      element.setAttribute(name, value);
    }
  }
  for (const child of children) {
    if (typeof child === 'string') {
      element.append(document.createTextNode(child));
    } else if (child) {
      element.append(child);
    }
  }
  return element;
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attributes: Attributes = {},
  ...children: readonly Child[]
): HTMLElementTagNameMap[K] {
  return fill(document.createElement(tag), attributes, children);
}

const SVG_NS = 'http://www.w3.org/2000/svg';

export function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attributes: Attributes = {},
  ...children: readonly Child[]
): SVGElementTagNameMap[K] {
  return fill(document.createElementNS(SVG_NS, tag), attributes, children);
}

/** The children that render, for replaceChildren. */
export const present = (children: readonly Child[]): (Node | string)[] =>
  children.filter((child): child is Node | string => typeof child === 'string' || child instanceof Node);
