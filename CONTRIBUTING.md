# Contributing

Thanks for wanting to make Cycle Nav better. Yes, really. Even after reading the code.

Cycle Nav is free software under the **GNU General Public License v3.0 or later** (see `LICENSE`). By contributing you agree that your contribution is licensed the same way.

## The vibe check

This app was mostly written by an AI with a human steering, and we're not going to pretend otherwise. That means:

- **You're allowed to use AI too.** We'd be hypocrites otherwise. Just read what it wrote, try it on a real bike or in demo mode, and own the result.
- **Refactors are welcome**, as long as the app still does the same thing afterwards. "I made it cleaner and now rerouting is broken" is not a trade we're taking.
- **"This code is bad" is not a bug report.** We know. "This code is bad and here's a pull request that makes it better" is the best kind of message.

## Good first contributions

- **Bug reports** with what you expected, what happened, your phone and Android version (or browser), and a GPX file if it's about a route.
- **Translations.** Strings live in `src/lib/i18n.js`. English is written in the code; every other language maps English text to its own. Dutch is the only other one so far.
- **Routing profile tweaks** in `profiles/calm.brf`, with an example route that gets better.
- **The rest of the SvelteKit move.** [docs/plans/sveltekit.md](docs/plans/sveltekit.md) lists the components still to do; each is a nice self-contained chunk.
- **Rides.** Seriously: go use it, and tell us where it sent you somewhere silly.

## Before you open a pull request

```bash
npm install
npm run build          # the web app still builds
node scripts/test-net.mjs
node scripts/test-hours.mjs
```

- Try your change in the browser (`npm run dev`, with demo mode in Settings → More for navigation) and, if it touches Android, on a phone.
- Add an English string with `t()` and a Dutch translation in `src/lib/i18n.js` for any new text.
- Keep personal data out of the code, tests and examples: no home addresses, real ride tracks or API keys.
- Be gentle with the free services the app uses (BRouter, Photon, Overpass, Nominatim and friends). All network calls go through `src/lib/net.js`, which keeps to their limits.

## Being kind

Be respectful and assume good intent. Discussions are about the work, not the people. Roast the code all you like; it can take it.
