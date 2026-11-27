// A parent slot with nothing to choose: empty with a picker, reading, or
// showing why the last file was rejected, with a picker to try again. Also the
// pieces every slot shares: its heading, alert boxes and the undo line.

import type { ParentIndex } from '../health/health.ts';
import { h, svg } from './dom.ts';
import type { Message } from './messages.ts';
import { parentLabel } from './names.ts';

export type OpenSlot =
  | { readonly kind: 'empty'; readonly error: Message | null }
  | { readonly kind: 'reading'; readonly fileName: string };

/** A message tone, shown by its icon and not by colour alone. */
export type Tone = 'warning' | 'info';

const TONE_ICONS: Readonly<Record<Tone, string>> = { warning: '⚠', info: 'ⓘ' };

/** A slot's own message: a rejection (warning) or a note about a report that went elsewhere (info). */
export interface SlotNotice {
  readonly tone: Tone;
  readonly message: Message;
}

/** An error, alert or info paragraph: icon and text. Not a live region; the announcer speaks it. */
export function alertBox(message: Message, className = '', tone: Tone = 'warning'): HTMLElement {
  return h(
    'p',
    { class: ['err', tone === 'info' ? 'info' : '', className].filter((part) => part !== '').join(' ') },
    h('span', { 'aria-hidden': 'true', class: 'icon' }, TONE_ICONS[tone]),
    h(
      'span',
      {},
      message.title === undefined ? null : h('b', {}, `${message.title}.`),
      message.title === undefined ? null : ' ',
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

/** A dog as the page names it, with its predicted own colour when another saved dog shares the name. */
export interface DogLabel {
  readonly name: string;
  readonly colour: string | null;
}

/** "Deleted Luna. Undo": the colour is for screen readers, telling apart dogs that share a name. */
export function undoLine(slot: ParentIndex, deleted: DogLabel, undo: (slot: ParentIndex) => void): HTMLElement {
  const button = h('button', { type: 'button', class: 'ghost', 'data-key': `undo-${slot}` }, 'Undo');
  button.addEventListener('click', () => undo(slot));
  return h(
    'p',
    { class: 'undo' },
    h('span', {}, 'Deleted ', deleted.name, deleted.colour === null ? null : h('span', { class: 'vh' }, `, ${deleted.colour}`), '.'),
    ' ',
    button,
  );
}

/** What an empty slot shows above its picker once saved dogs exist. */
export interface OpenSlotExtras {
  /** The report added here was the other slot's dog. */
  readonly notice: Message | null;
  readonly deleted: DogLabel | null;
  undo(slot: ParentIndex): void;
}

export function renderOpenSlot(
  slot: ParentIndex,
  state: OpenSlot,
  pick: (slot: ParentIndex) => void,
  extras?: OpenSlotExtras,
): HTMLElement {
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
    extras === undefined || extras.notice === null ? null : alertBox(extras.notice, '', 'info'),
    extras === undefined || extras.deleted === null ? null : undoLine(slot, extras.deleted, extras.undo),
    h(
      'div',
      { class: 'drop' },
      state.error === null ? fileIcon() : null,
      picker,
      h('span', { class: 'sec' }, 'or drop the report here'),
    ),
  );
}
