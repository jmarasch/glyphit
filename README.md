# GlyphIt

Add icons to anything in Obsidian — files, folders, tabs, titles and inline text.

Originally a fork of [Iconize](https://github.com/FlorianWoelki/obsidian-iconize)
by Florian Woelki, which is no longer maintained. GlyphIt keeps the same core
idea and reworks how icon packs are stored so that very large packs stay fast.

## What's different

**Icon packs stay zipped.** A pack is never unpacked to disk. On start-up only a
small index of what each pack contains is read, so a pack of 8,000+ icons costs
a few milliseconds instead of thousands of file reads.

**Icons are extracted on first use.** The first time an icon is actually used it
is written to a cache directory as a plain `.svg`, and every later render reads
that file. A vault pays for the icons it uses, not the packs it has installed.

**Subfolders and duplicate names work.** Packs can nest icons in folders, and the
same filename can appear in several of them. Names stay short and only become
folder-qualified where they would otherwise be ambiguous:

```
lorc/acorn.svg           ->  GiAcorn                 (unique, stays short)
lorc/sandstorm.svg       ->  GiLorcSandstorm         (ambiguous, qualified)
delapouite/sandstorm.svg ->  GiDelapouiteSandstorm
```

**Colour is applied at render time.** Icons that hard-code their colour on the
shapes rather than the root element are recoloured correctly, so a single pack
covers every colour instead of needing one copy per colour.

**Packs can be rescanned.** Edit a pack's `.zip` or folder, then hit the rescan
button next to it in settings to pick the change up without restarting Obsidian.

## Layout on disk

```
.obsidian/icons/
  game-icons.zip                      the pack, never unpacked
  my-custom-pack/                     a folder pack you fill yourself
  .cache/
    index/game-icons.json             what is inside that pack
    icons/game-icons-ff8800-none-lorc-sandstorm.svg
```

Cached icons are named `library-foreground-background-folder-name.svg`, so what
each cached file is for is readable at a glance.

## Development

Requires Node 20+.

```sh
git clone <this-repo>
cd glyphit
npm install
npm run dev
```

`npm run dev` builds to `./main.js` in the project and watches for changes.

To have the build install itself into a vault automatically, create an `env.js`
in the project root (it is gitignored):

```js
export const obsidianExportPath =
  '<path-to-your-vault>/.obsidian/plugins/glyphit/';
```

Without `env.js` the build still works, it just does not copy anywhere.

### Other commands

| Command | Does |
| --- | --- |
| `npm run build` | Production build, no source maps |
| `npm test` | Run the test suite |
| `npm run test:coverage` | Tests with coverage thresholds |
| `npm run lint` | ESLint with `--fix` |
| `npm run prettify` | Format with Prettier |
| `npm run docs:dev` | Serve the VitePress docs |

## Licence

MIT — see [LICENSE](./LICENSE). Retains the original copyright, as required.
