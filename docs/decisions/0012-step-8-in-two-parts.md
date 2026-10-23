# 0012: Step 8, in two parts

Status: accepted, 2026-10-23

## Context

Decision 0011 plans step 8 as "prove and release the engine". It mixes work that can be written and checked on its own with work that needs the maintainer's apps and accounts: the real-app check, the screenshot and the publishing set-up. One pull request for all of it would wait on the slowest part, and the publishing set-up would sit in the same change as the code it publishes.

## Decision

Step 8 is two pull requests.

Step 8a: friendlier and more accurate

- Angular. The Scout names an Angular app and says whether it is a dev server or a production build. It looks at what Angular leaves behind: the file names of its build (a bundle called main followed by eight capital letters or digits, or runtime, polyfills and main with a sixteen character hash), the unhashed bundles of a classic dev server, and the words ng-version or @angular/core in a script. Angular wins over Vite when both show, because an Angular dev server is built on Vite. Fix prompts say "an Angular app".
- Headers. Every header finding on an app with no server of its own (Angular, Vite, or a stack the Scout cannot name) says where the header goes on the common hosts: a _headers file on Netlify and Cloudflare Pages, vercel.json on Vercel, the server config on nginx or Apache, and that GitHub Pages cannot set headers (a meta tag can carry a Content-Security-Policy, nothing else). A scan only sees localhost, so Hooligans cannot know the real host and lists the common ones instead of guessing. Next.js and Express keep their own advice.
- Plain start. hooligans scan with no --url asks for the address. It says to start the app first, accepts 3000, :3000 or localhost:3000 as well as a full address, and refuses anything that is not on the user's own machine, with the reason. It gives up after three tries. Without a terminal it says to use --url and stops with code 2. It never looks for apps (0005). A bare hooligans with no command still prints the help.
- Everyday words. The database question no longer says "stages 2 to 4". It says what Hooligans will do (type made-up data into forms, try a few wrong logins, send a crowd of visitors) and asks whether the database is a test copy the user would not mind filling with junk. When the Scout saw a hosted backend, it says plainly that it cannot tell whether that is live data, and to answer no if it might be.
- A question that the terminal closes on, such as with Ctrl+C, no longer leaves the command waiting.
- Docs. A coverage map in the README, and docs/roster.md, docs/safety.md and docs/architecture.md written. A test checks that docs/roster.md names every hooligan and its job as the roster does, so the page cannot drift from the code.
- Done when the demo and the Angular fixtures behave as the tests say, the three pages are written and npm run check is green. Nothing in 8a is proved on a real app until 8b.

Step 8b: the real-app check and the release

- Run Hooligans against at least three real apps, running the way they run in development. Each false alarm and each miss becomes a test or a written reason.
- The README screenshot, the sample report on GitHub Pages and the release workflow, with npm provenance.
- Done when npx hooligans scan works from the published package on a clean machine, npm shows provenance and the friend test from 0011 passes with the command line.

## Consequences

- The Angular signals come from how Angular names its files and what its runtime contains. They are written from knowledge of its builds and tested against made-up fixtures, so the real-app check in 8b has to confirm them on built apps and on a dev server.
- Header advice for static hosts is longer than before. A prompt now lists several hosts, and the AI tool has to pick the one that applies.
- Apart from naming Angular, 8a changes no scanning rule. Its risk is in wording and in the new prompts, and the real-app check in 8b is still the first test of how accurate a scan is on real apps.
