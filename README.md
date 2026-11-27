# What the Pup?

Predict puppy coat colours and inherited health risks from two Wisdom Panel genetic reports, in the browser.

Load the Wisdom Panel (MyDogDNA) PDF reports of two dogs, and the site predicts which coat colours their puppies can have and how likely each colour is per puppy. It also flags health conditions where the mating creates a harmful combination.

The site is under construction.

## Privacy

Your reports never leave your computer. The PDFs are read by your browser, on the page itself, and are never uploaded. The dogs you add are kept in this browser until you delete them. Private windows forget them on closing, and Safari may clear them if you don’t visit for a week. Each dog is kept as what the page read from its report, without the PDF and without the owner’s name; its kit ID is kept only as a hash, to recognise the same dog when its report is added again. The site counts page views with [GoatCounter](https://www.goatcounter.com/). For each view it sends the page address, the referring page, the page title and the screen size, and nothing from the reports. As with any request, GoatCounter also receives your IP address and browser identification, which it uses for country and browser statistics. It sets no cookies.

## Development

Requires Node.js (the version in `.nvmrc`) and npm.

```sh
./run setup   # install dependencies
./run dev     # start the dev server at http://localhost:5173/whatthepup/
./run test    # run the tests
./run         # list every command
```

## Licence

MIT. Copyright (c) 2026 Matti Airas. See [LICENSE](LICENSE).
