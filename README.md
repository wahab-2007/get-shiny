# Badge Builder

Badge Builder is a static GitHub README editor with a searchable catalogue of
more than 800 technology badges. Select badges, organize categories, customize
their appearance, and copy or download the generated Markdown. The browser
saves your progress automatically. Export a project JSON file to transfer it
to another browser or keep a backup.

Choose **Presets** to load a starter collection, or select badges individually
to start from scratch. Use the builder’s appearance settings to change the
whole collection and each badge’s settings to override its appearance or move
it to another category. Use drag and drop or the up and down buttons to reorder
badges. Press **/** or **Ctrl+K** (**⌘K** on macOS) to focus search. The
explorer supports arrow keys, Tab, Enter, and Space.

## Run locally

From the repository root, serve its parent directory to exercise the GitHub
Pages project subpath.

    python3 -m http.server 4173 --directory ..

Open <http://localhost:4173/get-shiny/> if the checkout is named get-shiny.
The site uses HTML, CSS, and JavaScript modules and runs without a backend,
runtime package dependencies, or API keys.

## Test

Run the unit tests with Node.js 24.

    node --test tests/core.test.mjs

For Chromium smoke tests, run the server above and make Playwright available.
You can install it in a scratch directory and set PLAYWRIGHT_MODULE to the
absolute path to its index.mjs file.

    node tests/browser.mjs

Set BADGE_BUILDER_URL to override the default project URL or CHROMIUM_PATH to
use a system Chromium binary. The browser tests simulate successful and failed
Shields.io responses so both paths can be verified independently of network
availability.

## Update the catalogue

Run the importer with Python 3.10+ and npm.

    python3 scripts/update-catalog.py

Pass --ref with an upstream commit or tag for a reproducible import. The script
reads all upstream badge tables, merges duplicate technology names and combines
their search aliases. It groups source categories for browsing, supplements
technologies missing from the starter collection, and normalizes logo slugs
when a matching Simple Icons slug is available. Commit the regenerated files
after running the unit tests.

The badge data is based on [Ileriayo's markdown-badges](https://github.com/Ileriayo/markdown-badges).
Its MIT license is reproduced in [licenses/markdown-badges.txt](licenses/markdown-badges.txt).
Badge images come from [Shields.io](https://shields.io/). If image requests fail,
the app displays a local preview using the available [Simple Icons](https://simpleicons.org/)
logos or the badge label. The local preview approximates Shields.io styling.
See [licenses/simple-icons.txt](licenses/simple-icons.txt) for the icon terms.
The Markdown continues to reference Shields.io.

## Deploy on GitHub Pages

In **Settings → Pages → Build and deployment**, set **Source** to
**GitHub Actions**. The workflow validates the catalogue and publishes the
static files on pushes to main. It can also be run from the **Actions** tab.
After the deploy job succeeds, GitHub displays the published project URL in the
job and in **Settings → Pages**.
