// `/start` — the five steps from a clone to a place on the ladder.
//
// Both hero buttons on the home page land here, so it is the first page most
// people read. It says the whole shape once and HANDS OFF TO THE BOOK rather than
// repeating it: nothing here is a second copy of a rule.
//
// EVERY COMMAND HERE IS REAL. Each block was run before it was written down: the clone and
// `cargo install` from drill's README, `tinybrains matches/baselines.json` and `tinybrains check`
// against the nano baseline, the training commands from ants-baselines' README, the adapter from
// the book's own minimal example. The first page a developer reads must not be the first thing
// that fails when copied -- it used to clone a repository that did not exist and run a `drill`
// command nobody shipped.

import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'
import { usePlatform, useWeightClasses } from '../providers/platform-context'
import { cap } from '../lib/format'
import { Shell } from '../components/Shell'
import { Card, CardBody, SectionHead, Steps } from '../components/ui'
import { WeightScale } from '../components/Model'

type Step = { h: string; p: string[]; code: ReactNode; doc: [label: string, href: string] }

const STEPS: Step[] = [
  {
    h: 'Clone drill and play a match',
    p: [
      'drill is the ladder’s match on your own machine: the same engine, the same boards, the same referee, and the two trained baselines the platform seeds. No Docker, no database, no account.',
      'Until a release is cut, the tinybrains CLI builds from source and reads the game from a checkout beside it — four clones rather than one.',
    ],
    code: (
      <>
        <span className="c"># four clones until a release is cut</span>
        {'\n'}git clone https://github.com/Tiny-Brains/drill{'\n'}git clone https://github.com/Tiny-Brains/ants
        {'\n'}git clone https://github.com/Tiny-Brains/devops{'\n'}git clone https://github.com/Tiny-Brains/axon
        {'\n'}cargo install --path devops/cli{'\n'}cd drill &amp;&amp; tinybrains matches/baselines.json
      </>
    ),
    doc: ['drill on GitHub', 'https://github.com/Tiny-Brains/drill'],
  },
  {
    h: 'Train something small',
    p: [
      'ants-baselines is the platform’s own entries and the worked example of how they were trained: a scripted teacher, behaviour cloning into each weight class, and an export to ONNX that prints the platform’s verdict. Its nano entry is 2,930 parameters in under 6 KiB.',
      'Everything you change here — width, depth, fp16 — moves the one number that decides your class. The smallest class is a whole weight class of its own. That is the point of the contest.',
    ],
    code: (
      <>
        <span className="c"># the nano baseline, retrained: collect, clone, export</span>
        {'\n'}git clone https://github.com/Tiny-Brains/ants-baselines
        {'\n'}cd ants-baselines &amp;&amp; pip install -e .
        {'\n'}python -m tb_baselines.collect --seat-turns 250000
        {'\n'}python -m tb_baselines.train.bc --class nano --epochs 5
        {'\n'}python -m tb_baselines.export --class nano \{'\n'}  --weights runs/nano-bc/best.pt --out out/nano
      </>
    ),
    doc: ['Weight classes', '/docs/models/weight-classes'],
  },
  {
    h: 'Write the adapter',
    p: [
      'adapter.json is the contract between the referee and your model: two small programs in a JSON dialect. in turns the board it sends into the tensors your graph takes; out turns your output into one move per ant.',
      'It is data, not code — which is why it is measured alongside the weights. The baselines generate theirs from the same code that trains them, so the two encodings cannot drift.',
    ],
    code: (
      <>
        <span className="c">{'// adapter.json — the book’s minimal adapter, whole'}</span>
        {'\n'}
        {'{ "dialect": 1,'}
        {'\n'}
        {'  "in": { "positions": { "tb.tensor": ['}
        {'\n'}
        {'    { "reduce": [ {"var": "mine"},'}
        {'\n'}
        {'                  {"merge": [{"var": "accumulator"},'}
        {'\n'}
        {'                             {"var": "current"}]}, [] ] },'}
        {'\n'}
        {'    [ {"length": [{"var": "mine"}]}, 2 ],'}
        {'\n'}
        {'    "float32" ] } },'}
        {'\n'}
        {'  "out": { "map": ['}
        {'\n'}
        {'    {"tb.argmax": [{"var": "outputs.policy"}, 1]},'}
        {'\n'}
        {'    {"tb.at": [["N", "E", "S", "W", "-"], {"var": ""}]} ] } }'}
      </>
    ),
    doc: ['Adapters, and a real one piece by piece', '/docs/models/adapters'],
  },
  {
    h: 'Check it the way admission will',
    p: [
      'tinybrains check runs admission’s own two calls over the game’s reference observations: the graph’s operators and shapes, the adapter’s worst operation count against its budget, and the slowest inference. Then name your files in a seat of a match file and play the baselines.',
      'A pass is necessary and not sufficient: your machine has no download allowlist and decides no size class.',
    ],
    code: (
      <>
        tinybrains check model.onnx adapter.json{'\n'}
        <span className="c"># then name your files in seat 0 of matches/quick.json</span>
        {'\n'}tinybrains matches/quick.json{'\n'}tinybrains view replays/quick.json
      </>
    ),
    doc: ['Testing before you submit', '/docs/models/testing'],
  },
  {
    h: 'Publish, then submit',
    p: [
      'Tag a GitHub release with both files attached under exactly those names. Then give us the repository, the tag, and the two hashes — we fetch the release and check that it is byte for byte what you said it was.',
    ],
    code: (
      <>
        gh release create v1 model.onnx adapter.json{'\n'}shasum -a 256 model.onnx adapter.json{' '}
        <span className="c"># sha256sum on Linux</span>
      </>
    ),
    doc: ['Submit a version', '/submit'],
  },
]

/** The book is served by nginx at this origin, not routed by the SPA; a GitHub link is not ours
 *  at all. Only a path of this application goes through the router. */
function routed(href: string): boolean {
  return href.startsWith('/') && !href.startsWith('/docs')
}

export default function Start() {
  const { season, gameName } = usePlatform()
  const classes = useWeightClasses()
  const largest = classes.at(-1) ?? null

  return (
    <Shell>
      <section className="wrap lede-wrap">
        <div className="eyebrow">Get started</div>
        <h1>
          Five steps from a clone to a place on the <i>ladder</i>.
        </h1>
        <p>
          You train a small neural network, describe how the referee should talk to it, and publish both on
          GitHub. The platform measures what you published, gives it a weight class, and starts playing it.
        </p>
        <div className="hero-cta">
          <a className="btn primary lg" href="/docs/quickstart">
            Read the quickstart ↗
          </a>
          <Link className="btn lg" to="/matches">
            Watch a match first
          </Link>
        </div>
      </section>

      <section className="wrap sec">
        <div className="steps-list">
          {STEPS.map((s, i) => (
            <div className="step" key={s.h}>
              <div className="n">{String(i + 1).padStart(2, '0')}</div>
              <div>
                <h3>{s.h}</h3>
                {s.p.map((t) => (
                  <p key={t}>{t}</p>
                ))}
                {routed(s.doc[1]) ? (
                  <Link className="doc" to={s.doc[1]}>
                    {s.doc[0]} →
                  </Link>
                ) : (
                  <a className="doc" href={s.doc[1]} rel={s.doc[1].startsWith('http') ? 'noopener' : undefined}>
                    {s.doc[0]} {s.doc[1].startsWith('http') ? '↗' : '→'}
                  </a>
                )}
              </div>
              <div className="aside">
                <pre className="code">{s.code}</pre>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="wrap sec">
        <SectionHead title="Your class is measured, not chosen" sub="model and adapter together, compressed" />
        <div className="band flush">
          <div className="eb-say">
            <p className="muted">
              Whatever you publish is compressed and measured. That number picks your class, and the class
              is where you are ranked against people solving the same problem under the same budget. Every
              version also races on Open, against models of every size.
            </p>
          </div>
          <WeightScale classes={classes} />
        </div>
        <p className="muted after-band">
          {largest ? `Over ${cap(largest.max_bytes)} is refused. ` : null}
          These are {gameName} season {season?.number}'s caps — a season owns its classes, so a result in
          one class is comparable within its season and not across seasons.{' '}
          <a href="/docs/models/weight-classes">How the measurement works →</a>
        </p>
      </section>

      <section className="wrap sec">
        <SectionHead title="After you submit" sub="nothing you have to do" />
        <Card>
          <CardBody>
            <Steps
              steps={[
                { label: 'submitted', tone: 'done' },
                { label: 'admitted', tone: 'done' },
                { label: 'trial', tone: 'done' },
                { label: 'active', tone: 'done' },
              ]}
              say="We fetch the release and check it, measure it into a class, then play one match against a baseline. The trial only has to finish below the strike limit — you do not have to win it. After that your version is active: it plays continuously, and its rating on Open and on its class moves with every match. Submitting again starts the same four steps for the new version, and the old one keeps playing until the new one is through."
            />
          </CardBody>
        </Card>
      </section>

      <section className="wrap sec">
        <div className="band">
          <div className="eb-say">
            <h3>Ready when you are.</h3>
            <p className="muted">
              Everything above is documented in full in the book. This page is only the shape of it.
            </p>
          </div>
          <div className="band-acts">
            <a className="btn lg" href="/docs">
              The book ↗
            </a>
            <Link className="btn primary lg" to="/submit">
              Submit a version
            </Link>
          </div>
        </div>
      </section>
    </Shell>
  )
}
