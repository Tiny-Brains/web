// `/start` — the five steps from a clone to a place on the ladder.
//
// Both hero buttons on the home page land here, so it is the first page most
// people read. It says the whole shape once and HANDS OFF TO THE BOOK rather than
// repeating it: nothing here is a second copy of a rule.
//
// EVERY COMMAND HERE IS REAL. Each block was run before it was written down: the starter's
// self-play match and `tinybrains check` against its entry, its `train.py` (which is
// ants/baselines' collect / clone / export as one command, and produced the entry it ships),
// the manifest from the book's own minimal example. The first page a developer reads must not be
// the first thing that fails when copied -- it used to clone a repository that did not exist and
// run a `drill` command nobody shipped. Each step also says what it prints when it worked, from
// those same runs, and which steps are one command and which take thought.

import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'
import { usePlatform, useWeightClasses } from '../providers/platform-context'
import { cap } from '../lib/format'
import { Shell } from '../components/Shell'
import { KeyValueList, PageHeader, StepTracker } from '../components/ui'
import { ClassScale } from '../components/Model'

type Step = {
  h: string
  /** How heavy the step is, said beside its name: a wall of equal-weight rows hides which two
   *  take thought. */
  tag: string
  p: string[]
  code: ReactNode
  /** How you know it worked: what the commands print, from a real run. */
  see: ReactNode
  docs: [label: string, href: string][]
}

const STEPS: Step[] = [
  {
    h: 'Clone the starter and play a match',
    tag: 'one install, one clone',
    p: [
      'ants-starter is a working entry you can submit unchanged: a trained nano model, the manifest that describes it, and the one command that retrains it. The match it plays is the ladder’s, on your own machine — the same engine, the same boards, the same referee. No Docker, no database, no account.',
      'The tinybrains CLI installs with Homebrew or as a release binary, and the starter pins the game as a release the CLI downloads once — there is nothing else to clone or build.',
    ],
    code: (
      <>
        <span className="c"># once</span>
        {'\n'}brew tap tiny-brains/cli https://github.com/Tiny-Brains/cli
        {'\n'}brew install tiny-brains/cli/tinybrains
        {'\n'}git clone https://github.com/Tiny-Brains/ants-starter
        {'\n'}cd ants-starter &amp;&amp; tinybrains matches/self-play.json
      </>
    ),
    see: (
      <>
        <code>300 turns, 600 seat-turns: mean 86063 ops, mean 2.46 ms inference</code>, a replay under{' '}
        <code>replays/</code> that <code>tinybrains view replays/self-play.json</code> plays, and ants that
        move.
      </>
    ),
    docs: [
      ['The starter on GitHub', 'https://github.com/Tiny-Brains/ants-starter'],
      ['Match files: other boards, other opponents', '/docs/models/testing#match-files'],
    ],
  },
  {
    h: 'Train something small',
    tag: 'the long one',
    p: [
      'The starter’s train.py runs the recipe the platform’s own baselines were trained with — a scripted teacher, behaviour cloning into a weight class, an export that prints the platform’s verdict — and replaces the four files that ship. Its nano entry is 3,006 parameters in 12 KiB.',
      'Everything you change here — width, depth, fp16 — moves the one number that decides your class. The smallest class is a whole weight class of its own. That is the point of the contest.',
    ],
    code: (
      <>
        <span className="c"># collect, clone, export: about an hour</span>
        {'\n'}cd ants-starter &amp;&amp; pip install -r requirements.txt
        {'\n'}python train.py --seed 3
        {'\n'}
        <span className="c"># a bigger class is the same recipe with a bigger budget</span>
        {'\n'}python train.py --class micro --skip-collect
      </>
    ),
    see: (
      <>
        Collecting takes about nine minutes and 90 MB. The export prints{' '}
        <code>12,280 bytes, 75% of the nano cap</code> and the inference time, and the two files it
        writes are the new version.
      </>
    ),
    docs: [
      ['The baselines, and how they were trained', 'https://github.com/Tiny-Brains/ants/tree/main/baselines'],
      ['Weight classes', '/docs/models/weight-classes'],
    ],
  },
  {
    h: 'Write the manifest',
    tag: 'the hard part',
    p: [
      'manifest.json declares what your graph takes and returns, and carries one adapter expression per input: a small JSON program that turns the observation the referee sends into that tensor. A dimension may be a name — H and W bind to whatever board the season runs, so one manifest serves every size.',
      'It is data, not code, which is why it is measured alongside the weights. You do not write the output side: the referee reads your policy head. The baselines generate their manifest from the same code that trains them, so the two encodings cannot drift.',
    ],
    code: (
      <>
        <span className="c">{'// manifest.json — two planes in, a per-cell policy out'}</span>
        {'\n'}
        {'{ "abi": "orion:model@1.0.0", "format": "onnx", "name": "tb.mine",'}
        {'\n'}
        {'  "inputs": [{ "name": "board", "dtype": "i8",'}
        {'\n'}
        {'    "shape": [1, 2, "H", "W"],'}
        {'\n'}
        {'    "adapter": { "reshape": ['}
        {'\n'}
        {'      { "stack": [[ {"scatter": [{"var": "mine"}, {"var": "size"}, "i8"]},'}
        {'\n'}
        {'                    {"rle_expand": [{"var": "water.rle"},'}
        {'\n'}
        {'                                    {"var": "size"}, "i8"]} ], 0] },'}
        {'\n'}
        {'      { "merge": [[1, 2], {"var": "size"}] } ] } }],'}
        {'\n'}
        {'  "outputs": [{ "name": "policy", "dtype": "f32",'}
        {'\n'}
        {'                "shape": [1, 5, "H", "W"] }],'}
        {'\n'}
        {'  "probe_dims": { "H": 128, "W": 128 } }'}
      </>
    ),
    see: (
      <>
        <code>tinybrains adapt model.onnx manifest.json</code> writes the tensor each adapter builds for
        each of the ten reference observations, as <code>.npy</code> files. Compare them with your trainer’s
        encoder before you train on anything.
      </>
    ),
    docs: [
      ['The manifest', '/docs/models/adapters'],
      ['A real manifest, piece by piece', '/docs/models/adapters/walkthrough'],
    ],
  },
  {
    h: 'Check it the way admission will',
    tag: 'two commands',
    p: [
      'tinybrains check measures what admission measures, over the game’s reference observations: the graph read from the protobuf, the manifest evaluated on the same expression engine a node uses, and the graph run on the same runtime. It prints the operators, the size metric, the worst operation count against the budget, and the slowest inference. Then play the starter’s baseline match, which seats your model.onnx against the nano baseline.',
      'A pass is necessary and not sufficient: your machine decides no size class.',
    ],
    code: (
      <>
        tinybrains check model.onnx manifest.json{'\n'}
        <span className="c"># then play it against the nano baseline</span>
        {'\n'}tinybrains matches/vs-nano-bc.json{'\n'}tinybrains view replays/vs-nano-bc.json
      </>
    ),
    see: (
      <>
        <code>adapters (10 reference observations, budget 1000000, turn 1000 ms) PASSED</code>, the worst
        case’s operations against the budget, and the slowest inference. Then a replay in which your ants
        move.
      </>
    ),
    docs: [['Testing before you submit', '/docs/models/testing']],
  },
  {
    h: 'Submit and upload',
    tag: 'no commands',
    p: [
      'Name your entry on the Models page once, then go to /submit, pick it, and pick your two files. The page hashes them in your browser and uploads them straight to the object store — there is no repository to own, no release to cut, and nothing passes through the site.',
      'This is the one step with nothing to paste. If you would rather script it, the same two calls are in the book; either way the platform re-hashes what arrives, and anything that is not what you declared is refused, naming the hash it measured.',
    ],
    code: (
      <>
        <span className="c"># nothing to run: /submit takes the two files</span>
        {'\n'}
        <span className="c"># scripting it instead? the digests it would declare are</span>
        {'\n'}shasum -a 256 model.onnx manifest.json{' '}
        <span className="c"># sha256sum on Linux</span>
      </>
    ),
    see: (
      <>
        Both digests on screen as you pick, then <b>“Both files uploaded.”</b> The version page shows
        admission’s verdict from there — usually within minutes.
      </>
    ),
    docs: [['Submit a version', '/submit']],
  },
]

/** What a first entry needs, before the steps: a reader should know the cost before the path. */
const NEEDS: [string, string][] = [
  ['A GitHub account', 'It is how the platform knows whose entry is whose, and signing in is the whole account.'],
  [
    'Python 3.11 with PyTorch and onnx',
    'If you train the way the baselines do. Anything that exports an ONNX graph works; the format chapter says which operators.',
  ],
  ['A Rust toolchain', 'cargo builds the tinybrains CLI from source until a release is cut. Nothing else compiles.'],
  [
    'An afternoon',
    'Playing the starter is minutes. Retraining its entry is about an hour, most of it unattended. The manifest is the part that takes thought.',
  ],
]

/** The book is served by nginx at this origin, not routed by the SPA; a GitHub link is not ours
 *  at all. Only a path of this application goes through the router. */
function routed(href: string): boolean {
  return href.startsWith('/') && !href.startsWith('/docs')
}

function DocLink({ label, href }: { label: string; href: string }) {
  if (routed(href))
    return (
      <Link className="doc" to={href}>
        {label} →
      </Link>
    )
  const out = href.startsWith('http')
  return (
    <a className="doc" href={href} rel={out ? 'noopener' : undefined}>
      {label} {out ? '↗' : '→'}
    </a>
  )
}

const TOC: [string, string][] = [
  ['measured', 'Measured, not chosen'],
  ['need', 'What you need'],
  ['turn', 'One turn, end to end'],
  ['steps', 'The five steps'],
  ['after', 'After you submit'],
  ['next', 'Next'],
]

const TURN: [string, string, string, string][] = [
  [
    'The referee sends an observation',
    `{ "size": [64,96],
  "mine": [[12,30],[13,30]],
  "foes": [[12,33,1]],
  "food": [[11,31]],
  "hills": [[12,30,0]],
  "water": {"rle": [0,6144]} }`,
    'Your living ants, and what they can see: enemy ants, food, hills, and the water found so far. No scores, no turn number, no memory between turns.',
    'your manifest’s adapter',
  ],
  ['Your model takes tensors', 'board: int8[1, 7, 64, 96]', 'Whatever shapes your manifest declares. H and W may be names, so one manifest plays every board size.', 'model.onnx'],
  ['…and returns tensors', 'policy: float32[1, 5, 64, 96]', 'Five scores per cell here, one per move. A per-ant graph returns [N, 5] instead.', 'the referee reads it'],
  [
    'The referee gets one move per ant',
    '["N", "E"]',
    'One of N E S W - for each ant, in order. The channel order is the game’s, not yours. All three steps share one turn’s deadline.',
    '',
  ],
]

export default function Start() {
  const { season, gameName } = usePlatform()
  const classes = useWeightClasses()
  const largest = classes.at(-1) ?? null

  return (
    <Shell title="Get started">
      <PageHeader
        crumbs={[{ label: 'Get started' }]}
        title="Five steps from a clone to a place on the ladder"
        sub="Train a small neural network, describe how the referee talks to it, and submit both. The platform measures them, gives them a weight class, and starts playing."
        actions={
          <>
            <a className="btn primary" href="/docs/quickstart">
              Read the quickstart
            </a>
            <Link className="btn" to="/matches">
              Watch a match first
            </Link>
          </>
        }
      />
      <div className="wrap page-body doc">
        <div className="prose">
          <h2 id="measured">Your class is measured, not chosen</h2>
          <p className="muted">
            Whatever you submit is measured — the graph&apos;s bytes plus the manifest&apos;s, against digests the platform re-hashes. That
            number picks your class, and the class is where you are ranked against people with the same budget. Every version also plays on
            Open, against models of every size.
          </p>
          <div style={{ marginTop: 16 }}>
            <ClassScale classes={classes} />
          </div>
          <p className="hint" style={{ marginTop: 10 }}>
            {largest ? `Over ${cap(largest.max_bytes)} is refused. ` : null}
            {season ? `These are ${gameName} ${season.name}'s caps; ` : ''}a season owns its classes.{' '}
            <a href="/docs/models/weight-classes">How the measurement works</a>
          </p>

          <h2 id="need">What you need</h2>
          <KeyValueList items={NEEDS.map(([key, value]) => ({ key, value }))} />

          <h2 id="turn">One turn, end to end</h2>
          <ol className="steplist">
            {TURN.map(([title, code, said, via]) => (
              <li key={title}>
                <div>
                  <h3>{title}</h3>
                  <pre className="code-block">{code}</pre>
                  <p className="see">{said}</p>
                  {via ? <p className="see"><b>then</b> {via}</p> : null}
                </div>
              </li>
            ))}
          </ol>
          <p className="doclinks">
            <a href="/docs/models/observation">What your model sees</a>
            <a href="/docs/models/actions">What it answers</a>
            <a href="/docs/models/adapters">The manifest</a>
          </p>

          <h2 id="steps">The five steps</h2>
          <ol className="steplist">
            {STEPS.map((step) => (
              <li key={step.h}>
                <div>
                  <h3>
                    {step.h}
                    <span className="tag">{step.tag}</span>
                  </h3>
                  {step.p.map((t) => (
                    <p key={t}>{t}</p>
                  ))}
                  <pre className="code-block">{step.code}</pre>
                  <p className="see">
                    <b>You should see</b> {step.see}
                  </p>
                  <p className="doclinks">
                    {step.docs.map(([label, href]) => (
                      <DocLink label={label} href={href} key={href} />
                    ))}
                  </p>
                </div>
              </li>
            ))}
          </ol>

          <h2 id="after">After you submit</h2>
          <StepTracker
            steps={[
              { label: 'submitted', tone: 'done' },
              { label: 'admitted', tone: 'done' },
              { label: 'trial', tone: 'done' },
              { label: 'active', tone: 'done' },
            ]}
            say="We check the files against the hashes you declared, measure them into a class, then play one trial against a baseline — it only has to finish below the strike limit. Then your version plays continuously, and the previous one keeps playing until the new one is through. Each step arrives as a notification."
          />

          <h2 id="next">Next</h2>
          <div className="row">
            <Link className="btn primary" to="/submit">
              Submit a version
            </Link>
            <Link className="btn" to="/faq">
              Questions people ask first
            </Link>
            <a className="btn" href="/docs">
              The book
            </a>
          </div>
        </div>
        <nav className="toc" aria-label="On this page">
          <b>On this page</b>
          {TOC.map(([id, label]) => (
            <a href={`#${id}`} key={id}>
              {label}
            </a>
          ))}
        </nav>
      </div>
    </Shell>
  )
}
