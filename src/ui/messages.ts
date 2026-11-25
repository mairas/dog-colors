// What the page says when a report can't be used: the cause, then what to do.

import type { RejectionKind } from '../report/types.ts';

export interface Message {
  readonly text: string;
  readonly link?: { readonly href: string; readonly label: string };
}

const ISSUES = 'https://github.com/mairas/dog-colors/issues';

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

export const DROP_TOO_MANY = 'Drop at most two reports.';
export const DROP_ONE_FREE = "Only one slot was free, so the second report wasn't loaded.";
export const DROP_FULL = 'Both slots are full. Use Replace on a card.';

export function replacementRejected(message: Message): Message {
  return { ...message, text: `Replacement not loaded: ${message.text.charAt(0).toLowerCase()}${message.text.slice(1)}` };
}
