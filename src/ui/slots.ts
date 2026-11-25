// A parent slot before it holds a card: empty with a picker, reading, or
// showing why the last file was rejected, with a picker to try again.

import type { ParentIndex } from '../health/health.ts';
import { h, svg } from './dom.ts';
import type { Message } from './messages.ts';
import { parentLabel } from './names.ts';

export type OpenSlot =
  | { readonly kind: 'empty'; readonly error: Message | null }
  | { readonly kind: 'reading'; readonly fileName: string };

/** An error or alert paragraph: icon and text, not colour alone. */
export function alertBox(message: Message, className = ''): HTMLElement {
  return h(
    'p',
    { class: `err ${className}`.trim() },
    h('span', { 'aria-hidden': 'true', class: 'icon' }, '⚠'),
    h(
      'span',
      {},
      message.text,
      message.link === undefined ? null : ' ',
      message.link === undefined ? null : h('a', { href: message.link.href, rel: 'noopener' }, message.link.label),
    ),
  );
}

export const slotHeadingId = (slot: ParentIndex): string => `parent-${slot}-name`;

/** A slot's heading, the same element whatever the slot holds, so focus can return to it. */
export function slotHeading(slot: ParentIndex, text: string): HTMLElement {
  return h('h2', { id: slotHeadingId(slot), tabindex: '-1', 'data-key': `name-${slot}` }, h('small', {}, parentLabel(slot)), text);
}

function fileIcon(): SVGSVGElement {
  return svg(
    'svg',
    { width: '32', height: '32', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'aria-hidden': 'true' },
    svg('path', { d: 'M14 3H6v18h12V7z' }),
    svg('path', { d: 'M14 3v4h4' }),
  );
}

export function renderOpenSlot(slot: ParentIndex, state: OpenSlot, pick: (slot: ParentIndex) => void): HTMLElement {
  const headingId = slotHeadingId(slot);
  const heading = (text: string): HTMLElement => slotHeading(slot, text);

  if (state.kind === 'reading') {
    return h(
      'section',
      { class: 'slot', 'aria-labelledby': headingId, 'aria-busy': 'true', 'data-slot': String(slot) },
      heading('Reading report…'),
      h('div', { class: 'drop' }, h('div', { class: 'spin', 'aria-hidden': 'true' }), h('span', { class: 'file' }, state.fileName)),
    );
  }

  const picker = h(
    'button',
    { type: 'button', class: 'pick', 'data-key': `pick-${slot}`, 'aria-describedby': headingId },
    state.error === null ? 'Choose PDF' : 'Choose another PDF',
  );
  picker.addEventListener('click', () => pick(slot));
  return h(
    'section',
    { class: 'slot', 'aria-labelledby': headingId, 'data-slot': String(slot) },
    heading(state.error === null ? 'No report yet' : 'Report can’t be read'),
    state.error === null ? null : alertBox(state.error),
    h(
      'div',
      { class: 'drop' },
      state.error === null ? fileIcon() : null,
      picker,
      h('span', { class: 'sec' }, 'or drop the report here'),
    ),
  );
}
