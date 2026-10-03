// Write a game's engines.json: which engine its root viewer is, and which others it keeps by digest.
//
//   node scripts/engines-index.mjs public/cartridges/ants sha256:<hex>
//
// THE ONE WRITER OF THE INDEX, run by scripts/vendor-viewers.sh for the dev loop and by the
// Dockerfile for the image, so the two cannot lay it out differently. lib/viz.ts reads it to choose
// the viewer a replay is drawn by: the root (/cartridges/<game>/viz.js) for a match on `current`,
// /cartridges/<game>/engines/<hex>/viz.js for one listed in `engines`, and NOTHING for any other --
// a replay drawn by another engine is a plausible match that never happened.
//
// An engine is listed when its directory holds a viz.js, which is the copy having finished; the
// digest is the directory's name, which the copy took from the component it hashed.

import { existsSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const [dir, current] = process.argv.slice(2)
if (!dir) {
  console.error('usage: engines-index.mjs <public/cartridges/<game>> [sha256:<hex> of the root viewer]')
  process.exit(2)
}
const kept = join(dir, 'engines')
const engines = existsSync(kept)
  ? readdirSync(kept)
      .filter((hex) => /^[0-9a-f]{64}$/.test(hex) && existsSync(join(kept, hex, 'viz.js')))
      .sort()
      .map((hex) => `sha256:${hex}`)
  : []
const index = { current: /^sha256:[0-9a-f]{64}$/.test(current ?? '') ? current : null, engines }
writeFileSync(join(dir, 'engines.json'), `${JSON.stringify(index, null, 2)}\n`)
console.log(`engines-index: ${dir}: current ${index.current ?? 'unknown'}, ${engines.length} kept by digest`)
