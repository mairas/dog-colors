// What the page says when a report can't be used: the cause, then what to do.

import type { RejectionKind } from '../report/types.ts';
import type { StoreMode } from '../saved/store.ts';

export interface Message {
  /** A bold lead-in, written before the text and followed by a full stop. */
  readonly title?: string;
  readonly text: string;
  readonly link?: { readonly href: string; readonly label: string };
}

const ISSUES = 'https://github.com/mairas/whatthepup/issues';

export const REJECTIONS: Readonly<Record<RejectionKind, Message>> = {
  'not-pdf': { text: "This file isn't a PDF. Choose the report PDF from Wisdom Panel." },
  encrypted: { text: 'This PDF is password-protected. Save a copy without the password and try again.' },
  'adobe-pdf-printer': {
    text: "This report was saved with the Windows 'Adobe PDF' printer, which scrambles the text so it can't be read. Download the report from Wisdom Panel instead. Or open the web report in Chrome or Edge, choose Print, and set the printer to 'Save as PDF'.",
  },
  'unreadable-text': {
    text: "The text in this PDF can't be read: it may be a scan, a photo, or a print that scrambled the text. Download the report from Wisdom Panel instead.",
  },
  'no-text': { text: 'This PDF contains no text, perhaps a scan or a photo. Download the report from Wisdom Panel instead.' },
  'not-wisdom-dog': {
    text: "This PDF isn't a Wisdom Panel dog report. Choose the genetics report you got from Wisdom Panel or MyDogDNA.",
  },
  'unrecognised-layout': {
    text: "This looks like a Wisdom Panel report, but its layout isn't one this page knows. Only English reports are supported.",
    link: { href: ISSUES, label: 'Report the layout on the issue tracker' },
  },
  'too-large': { text: 'This file is too large to be a Wisdom Panel report.' },
};

export const READER_FAILED: Message = { text: "Couldn't start the PDF reader. Reload the page and try again." };

/** What a bulk add says as it starts: "Reading 8 reports…". */
export const bulkStartText = (total: number): string => (total === 1 ? 'Reading 1 report…' : `Reading ${total} reports…`);

/** A bulk add's progress: "Reading 3 of 8 reports…". */
export const bulkProgressText = (current: number, total: number): string =>
  total === 1 ? bulkStartText(total) : `Reading ${current} of ${total} reports…`;

const dogCount = (count: number): string => `${count} ${count === 1 ? 'dog' : 'dogs'}`;

/** A bulk add's summary lead, from the names of the dogs it added and updated: "Added 6 dogs and updated 1.", or the name when one dog was saved. */
export function bulkSummaryLead(added: readonly string[], updated: readonly string[]): string {
  const [only] = [...added, ...updated];
  if (added.length + updated.length === 1 && only !== undefined) {
    return `${added.length === 1 ? 'Added' : 'Updated'} ${only}.`;
  }
  if (updated.length === 0) {
    return added.length === 0 ? 'No dogs added.' : `Added ${dogCount(added.length)}.`;
  }
  return added.length === 0 ? `Updated ${dogCount(updated.length)}.` : `Added ${dogCount(added.length)} and updated ${updated.length}.`;
}

/** The results area's message when the genetics reject a pair's stored data. */
export const RESULTS_FAILED: Message = {
  title: 'Puppy colours can’t be worked out for this pair',
  text: 'The saved data of one of these dogs can’t be used. Add its report again, or choose another dog.',
};

/** The warning above the slots once the saved dogs can't be kept, by the store's mode. */
export const STORAGE_WARNINGS: Readonly<Record<Exclude<StoreMode, 'working'>, Message>> = {
  'nothing-stored': {
    title: 'Dogs can’t be saved in this browser',
    text: 'The dogs you add are kept only until you close or reload this page. Browser storage that is turned off or full can cause this.',
  },
  full: {
    title: 'New dogs can’t be saved in this browser',
    text: 'Storage is full, so dogs added from now on are kept only until you close or reload this page. Dogs saved earlier stay until you delete them.',
  },
  'out-of-date': { title: 'This page is out of date', text: 'Reload it to see your saved dogs.' },
};

export const PRIVACY_READ = 'Reports are read in your browser and never uploaded.';
/** Dropped while nothing can be stored. */
export const PRIVACY_KEPT =
  'The dogs you add are kept in this browser until you delete them. Private windows forget them on closing, and Safari may clear them if you don’t visit for a week.';
export const PRIVACY_DOWNLOAD =
  'Download the PDF from your dog’s results on Wisdom Panel, or print the web report from Chrome, Edge or Safari with “Save as PDF”.';

/** A slot's note when the report added there is the dog the other slot holds. */
export function sameDogNotice(name: string, parent: string): Message {
  return { text: `This report is ${name}, already ${parent}; the saved dog was updated.` };
}
