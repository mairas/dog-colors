// The author line's "Haru and Allu" button opens a photo of the dogs in a
// modal dialog; Esc, its Close button or a click outside the photo closes it.

export function wireDogsDialog(page: Document): void {
  const dialog = page.querySelector<HTMLDialogElement>('dialog#dogs');
  const opener = page.querySelector<HTMLButtonElement>('button[aria-controls="dogs"]');
  if (dialog === null || opener === null) {
    throw new Error('index.html is missing the dogs dialog or its button');
  }
  opener.addEventListener('click', () => dialog.showModal());
  dialog.querySelector('button')?.addEventListener('click', () => dialog.close());
  // Only a backdrop click targets the dialog itself: its content sits in .dogs-body.
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) {
      dialog.close();
    }
  });
}
