# dog-colors

Predict puppy coat colours from two Wisdom Panel genetic reports, in the browser.

Load the Wisdom Panel (MyDogDNA) PDF reports of two dogs, and the site predicts which coat colours their puppies can have and how likely each colour is per puppy. It also flags health conditions where the mating creates a harmful combination.

The site is under construction.

## Privacy

Your reports never leave your computer. The PDFs are read by your browser, on the page itself. Nothing is uploaded and nothing is saved: close the page and the reports are gone from it. The only script the site loads from elsewhere is [GoatCounter](https://www.goatcounter.com/)'s counter, which counts page views. For each view it sends the page address, the referring page, the page title and the screen size, and nothing from the reports. As with any request, GoatCounter also receives your IP address and browser identification, which it uses for country and browser statistics. It sets no cookies.

## Development

Requires Node.js (the version in `.nvmrc`) and npm.

```sh
./run setup   # install dependencies
./run dev     # start the dev server at http://localhost:5173/dog-colors/
./run test    # run the tests
./run         # list every command
```

## Licence

MIT. Copyright (c) 2026 Matti Airas. See [LICENSE](LICENSE).
