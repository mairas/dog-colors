const app = document.querySelector<HTMLElement>('#app');
if (!app) {
  throw new Error('index.html is missing the #app element');
}

const heading = document.createElement('h1');
heading.textContent = 'Puppy colour predictor';

const status = document.createElement('p');
status.textContent = 'This site is under construction.';

app.replaceChildren(heading, status);
