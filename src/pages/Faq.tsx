// `/faq` — the dozen questions a newcomer asks, each answered in a few lines and handed to the
// chapter that answers it in full.
//
// The book is the authority and this page does not compete with it: every answer here is short,
// says nothing the book does not, and links the chapter. Numbers a season owns (the caps) are not
// written here -- the home page and the leaderboard draw them from the season -- and numbers the
// deployment owns (the turn deadline, the strike limit) are named as the book names them, with
// the reference page linked so a change there is one edit away from here.

import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'
import { Shell } from '../components/Shell'
import { Card, CardBody, KeyValues } from '../components/ui'

type Q = { q: string; a: ReactNode; more: [label: string, href: string][] }

const QUESTIONS: Q[] = [
  {
    q: 'Do I need to run the platform?',
    a: 'No. The ladder is hosted. You need a GitHub account, an ONNX model and an adapter, and drill plays the same match on your own machine with nothing at stake.',
    more: [
      ['The quickstart', '/docs/quickstart'],
      ['Get started', '/start'],
    ],
  },
  {
    q: 'Can I use PyTorch, JAX, or anything else?',
    a: 'Yes. What you submit is one self-contained model.onnx; how you made it is your business. The platform’s own baselines are PyTorch, exported through torch.onnx and rewritten to float16 initializers.',
    more: [
      ['Model format', '/docs/models/format'],
      ['The baselines', 'https://github.com/Tiny-Brains/ants-baselines'],
    ],
  },
  {
    q: 'Which operators are allowed?',
    a: 'ONNX opsets 13 to 19 and an allowlist: Conv, MatMul, Gemm, the usual activations and reductions, Resize, Gather, Slice and the rest the format chapter lists. Attributes are not operators, so a dilated Conv is allowed. ConvTranspose is not on the list; Resize is the upsampler.',
    more: [['The list, in the format chapter', '/docs/models/format']],
  },
  {
    q: 'How is size measured, and which class am I in?',
    a: 'The metric is the model’s initializer data and the exact adapter file, each compressed with zstd at level 19, added together. It is not the raw file size. Admission measures it and gives you the smallest class whose cap fits; the caps are the season’s, shown on the home page. Float16 initializers fit about twice the parameters of float32.',
    more: [
      ['Weight classes', '/docs/models/weight-classes'],
      ['How size is measured', '/docs/models/format'],
    ],
  },
  {
    q: 'Is there a compute cap?',
    a: 'No. Size is the only thing a class limits. What bounds compute is the turn deadline: input adaptation, inference and output adaptation share it, and the platform divides one turn’s deadline among the seats it plays together. A graph too slow for its share misses the turn and takes a strike; admission measures and reports your inference time and does not reject you for it.',
    more: [
      ['Weight classes', '/docs/models/weight-classes'],
      ['Limits and budgets', '/docs/reference/limits'],
    ],
  },
  {
    q: 'What does my model see?',
    a: 'One JSON object per turn: the board size, your living ants, the enemy ants, food and hills in view, and the water found so far as a run-length mask. No scores, no turn number, no memory between turns. Owners are relative to you, so both seats of a match see the same encoding.',
    more: [['What your model sees', '/docs/models/observation']],
  },
  {
    q: 'What must it answer?',
    a: 'One of N, E, S, W or - for each of your ants, in the order the observation lists them. Holding every ant is a normal answer; failing to answer is a strike.',
    more: [['What your model answers', '/docs/models/actions']],
  },
  {
    q: 'What is the adapter, and why is it not code?',
    a: 'Two small programs in a JSON dialect: in turns the observation into the tensors your graph takes, out turns the tensors it returns into moves. It is data because the evaluator counts its operations under a budget and it is measured into your size beside the weights. The baselines generate theirs from the same code that trains them, and a test proves the two encodings agree.',
    more: [
      ['Adapters', '/docs/models/adapters'],
      ['A real adapter, piece by piece', '/docs/models/adapters/walkthrough'],
    ],
  },
  {
    q: 'Can I enter more than one model?',
    a: 'Yes. A model is a repository and a name, and you may hold as many as the season allows. Each is its own entry with its own rating; one of yours beating another is an ordinary result. One version of a model goes through admission at a time, and a season may cap how many of yours are in flight together.',
    more: [
      ['Models and versions', '/docs/competing/models'],
      ['Seasons', '/docs/competing/seasons'],
    ],
  },
  {
    q: 'Can I resubmit the same weights?',
    a: 'Not in one season: it counts one entry per set of weights, so the same file cannot take a second place on the ladder. A new release tag per attempt; even a formatting-only edit to the adapter changes its hash and its size.',
    more: [['Submitting a version', '/docs/competing/submitting']],
  },
  {
    q: 'What happens after I submit?',
    a: 'The release is fetched and its hashes checked, the model is measured into a class, and one trial match is played against a baseline. The trial only has to finish below the strike limit; losing it is fine. Then the version is active and plays continuously, and the previous version of that model keeps playing until the new one is through.',
    more: [
      ['The life of a version', '/docs/competing/version-life'],
      ['Rejection reasons', '/docs/reference/rejection-reasons'],
    ],
  },
  {
    q: 'How do I test before submitting?',
    a: 'tinybrains check runs admission’s own two calls over the game’s reference observations. tinybrains adapt writes the tensors your adapter builds, to compare with your trainer’s encoder. A drill match plays your files against the baselines through the real engine. A pass is necessary and not sufficient: your machine decides no class.',
    more: [
      ['Testing before you submit', '/docs/models/testing'],
      ['drill', 'https://github.com/Tiny-Brains/drill'],
    ],
  },
  {
    q: 'How is the rating computed?',
    a: 'Every match counts on Open, and a match between versions of one class also counts on that class’s ladder. The number shown is mu − 3σ, so a rating rises as it settles; prov marks one still settling, and it is shown rather than hidden.',
    more: [['Ranking', '/docs/competing/ranking']],
  },
]

function More({ label, href }: { label: string; href: string }) {
  if (href.startsWith('http'))
    return (
      <a href={href} rel="noopener">
        {label} ↗
      </a>
    )
  if (href.startsWith('/docs')) return <a href={href}>{label} →</a>
  return <Link to={href}>{label} →</Link>
}

export default function Faq() {
  return (
    <Shell title="FAQ">
      <section className="wrap lede-wrap">
        <div className="eyebrow">Questions</div>
        <h1>
          The things people ask <i>first</i>.
        </h1>
        <p>
          Short answers, and the chapter of the book that answers each in full. The book is the authority;
          this page is only the door to it.
        </p>
      </section>

      <section className="wrap sec tight">
        <Card>
          <CardBody>
            <KeyValues
              className="faq"
              items={QUESTIONS.map((x) => ({
                key: x.q,
                value: x.a,
                hint: (
                  <span className="faq-more">
                    {x.more.map(([label, href]) => (
                      <More label={label} href={href} key={href} />
                    ))}
                  </span>
                ),
              }))}
            />
          </CardBody>
        </Card>
      </section>
    </Shell>
  )
}
