// `/start` — the five steps from a clone to a place on the ladder.
//
// Both hero buttons on the home page land here, so it is the first page most
// people read. It says the whole shape once and HANDS OFF TO THE BOOK rather than
// repeating it: nothing here is a second copy of a rule.

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
    h: 'Clone the starter',
    p: [
      'A working entry you can submit unchanged: a tiny trained model, an adapter that describes it, and the scripts that build both.',
    ],
    code: (
      <>
        <span className="c"># the shortest path to something that plays</span>
        {'\n'}git clone https://github.com/Tiny-Brains/ants-starter{'\n'}cd ants-starter &amp;&amp; make
      </>
    ),
    doc: ['Quickstart', '/docs/quickstart'],
  },
  {
    h: 'Train something small',
    p: [
      'The starter trains a policy network from self-play. Everything you change here — width, depth, quantisation — moves the one number that decides your class.',
      'The smallest class is a whole weight class of its own. That is the point of the contest.',
    ],
    code: (
      <>
        <span className="c"># the file you are about to be measured on</span>
        {'\n'}python train.py --steps 200000 --out model.onnx
      </>
    ),
    doc: ['Weight classes', '/docs/models/weight-classes'],
  },
  {
    h: 'Write the adapter',
    p: [
      'adapter.json is the contract between the referee and your model: how the board it sends becomes the tensor you expect, and how your output becomes moves.',
      'It is data, not code — which is why it is measured alongside the weights.',
    ],
    code: (
      <>
        <span className="c">{'// adapter.json'}</span>
        {'\n'}
        {'{ "input": { "shape": [1, 11, 23, 23] },'}
        {'\n'}
        {'  "output": { "kind": "per_ant_move" } }'}
      </>
    ),
    doc: ['The adapter dialect', '/docs/models/adapters'],
  },
  {
    h: 'Play it locally with drill',
    p: [
      'drill is the arena on your machine: the same engine, the same presets, the same seeds. A match you can reproduce locally is a result you can argue with.',
      'It also prints the two hashes the submit form asks for.',
    ],
    code: (
      <>
        drill play --preset maze --seed 42 \{'\n'} model.onnx adapter.json{'\n'}drill hash model.onnx
        adapter.json
      </>
    ),
    doc: ['Testing locally with drill', '/docs/drill'],
  },
  {
    h: 'Publish, then submit',
    p: [
      'Tag a GitHub release with both files attached. Then give us the repository, the tag, and the two hashes — we fetch the release and check that it is byte for byte what you said it was.',
    ],
    code: <>gh release create v1 model.onnx adapter.json</>,
    doc: ['Submit a version', '/submit'],
  },
]

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
                {/* /docs is served by nginx at this origin, not routed by the SPA. */}
                {s.doc[1].startsWith('/docs') ? (
                  <a className="doc" href={s.doc[1]}>
                    {s.doc[0]} →
                  </a>
                ) : (
                  <Link className="doc" to={s.doc[1]}>
                    {s.doc[0]} →
                  </Link>
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
