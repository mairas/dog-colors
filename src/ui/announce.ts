// The page's one polite live region: parse status, errors, drop messages and
// result updates are announced here.

import { h } from './dom.ts';

export interface Announcer {
  readonly region: HTMLElement;
  announce(text: string): void;
}

export function createAnnouncer(): Announcer {
  const region = h('p', { class: 'vh', 'aria-live': 'polite', 'data-testid': 'live' });
  return {
    region,
    announce(text) {
      // Clearing first makes a repeated message announce again.
      region.textContent = '';
      region.textContent = text;
    },
  };
}
