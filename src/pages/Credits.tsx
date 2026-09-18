// `/credits` — what the platform is built on, and who made it.
//
// ONE ENTRY IS AN OBLIGATION RATHER THAN A COURTESY: the logo is a derivative of a Noun Project
// icon under CC BY 3.0, so `attrib` carries the licence's required attribution string verbatim and
// is the one thing on the page drawn on a surface of its own. Editing that row is editing a licence
// term — the same string belongs in web/README.md and inside both logo SVGs, which travel alone as
// the favicons.
//
// The list is data because a dependency bump is then one line. Versions are the ones that ship, so
// they are checked against the manifests and Dockerfiles they come from: package.json, the three
// Cargo.tomls, ants/baselines/pyproject.toml, docker-compose.yml, and soma's and kalam's ARG blocks.
// A version written here and nowhere else is a version that goes stale silently.

import type { ReactNode } from 'react'
import { Shell } from '../components/Shell'
import { Icon, PageHeader } from '../components/ui'

/** A credited thing. `href` links the name; `links` are whatever else is worth reaching. */
type Entry = {
  name: ReactNode
  href?: string
  version?: string
  lic: string
  note?: ReactNode
  links?: [label: string, href: string][]
  attrib?: string
}

type Sec = { id: string; title: string; entries: Entry[] }

const PLASMATIC: [string, string] = ['goplasmatic.io', 'https://goplasmatic.io']

const SECTIONS: Sec[] = [
  {
    id: 'game',
    title: 'The game',
    entries: [
      {
        name: 'Ants',
        href: 'https://ants.aichallenge.org',
        lic: 'Game design',
        note: 'The game of the 2011 Google AI Challenge, run by the University of Waterloo Computer Science Club. Reimplemented here for trained networks; the rules are theirs.',
        links: [
          ['Contest source', 'https://github.com/aichallenge/aichallenge'],
          ['UW Computer Science Club', 'https://csclub.uwaterloo.ca'],
        ],
      },
      {
        name: 'The classic opening bot',
        href: 'https://github.com/Tiny-Brains/ants/blob/main/baselines/src/tb_baselines/teacher.py',
        lic: 'Prior art',
        note: 'Our scripted teacher is the contest’s standard breadth-first opening bot.',
      },
    ],
  },
  {
    id: 'design',
    title: 'Design',
    entries: [
      {
        name: 'Logo',
        lic: 'CC BY 3.0',
        note: 'Designed by Rizqi Auliya, from The Noun Project.',
        links: [
          ['“Ai Brain”', 'https://thenounproject.com/icon/ai-brain-7276116/'],
          ['Rizqi Auliya', 'https://thenounproject.com/creator/rizqiauliya47/'],
          ['The Noun Project', 'https://thenounproject.com'],
          ['CC BY 3.0', 'https://creativecommons.org/licenses/by/3.0/'],
        ],
        attrib: '“Ai Brain” by Rizqi Auliya from Noun Project, licensed under CC BY 3.0.',
      },
    ],
  },
  {
    id: 'runtime',
    title: 'The runtime',
    entries: [
      {
        name: 'Orion',
        href: 'https://github.com/GoPlasmatic/Orion',
        version: '1.8.1',
        lic: 'Apache-2.0',
        note: 'The server Soma and Kalam run on. They ship no server code — they are Orion packages.',
        links: [PLASMATIC],
      },
      {
        name: 'orion-plugin-sdk',
        href: 'https://crates.io/crates/orion-plugin-sdk',
        version: '1.7',
        lic: 'Apache-2.0',
        note: 'The shim our four WebAssembly plugins are built against.',
        links: [PLASMATIC],
      },
      {
        name: 'dataflow-rs',
        href: 'https://github.com/GoPlasmatic/dataflow-rs',
        version: '3.13',
        lic: 'Apache-2.0',
        note: 'The workflow engine inside Orion.',
        links: [PLASMATIC],
      },
      {
        name: 'datalogic-rs',
        href: 'https://github.com/GoPlasmatic/datalogic-rs',
        version: '5.5',
        lic: 'Apache-2.0',
        note: 'Evaluates your manifest’s adapters, and counts their operations against the budget.',
        links: [PLASMATIC, ['DataLogic Studio', 'https://goplasmatic.github.io/datalogic-rs/playground/']],
      },
      {
        name: 'JSONLogic',
        href: 'https://jsonlogic.com',
        lic: 'MIT',
        note: 'The language datalogic implements, by Jeremy Wadhams.',
      },
    ],
  },
  {
    id: 'inference',
    title: 'Running your model',
    entries: [
      {
        name: 'tract',
        href: 'https://github.com/sonos/tract',
        version: '0.23.7',
        lic: 'MIT / Apache-2.0',
        note: 'Runs every model, on the ladder and in the CLI. By Sonos.',
      },
      { name: 'ONNX', href: 'https://onnx.ai', lic: 'Apache-2.0', note: 'The model format a submission is.' },
      {
        name: 'prost',
        href: 'https://github.com/tokio-rs/prost',
        version: '0.14',
        lic: 'Apache-2.0',
        note: 'Decodes the ONNX protobuf.',
      },
    ],
  },
  {
    id: 'wasm',
    title: 'WebAssembly',
    entries: [
      {
        name: 'Wasmtime',
        href: 'https://wasmtime.dev',
        version: '48',
        lic: 'Apache-2.0 WITH LLVM-exception',
        note: 'Executes the cartridge, with Cranelift as its compiler.',
        links: [['Cranelift', 'https://cranelift.dev']],
      },
      {
        name: 'wasm-tools',
        href: 'https://github.com/bytecodealliance/wasm-tools',
        version: '1.258',
        lic: 'Apache-2.0 WITH LLVM-exception',
        note: 'Builds the components.',
      },
      {
        name: 'jco',
        href: 'https://github.com/bytecodealliance/jco',
        version: '1.32.1',
        lic: 'Apache-2.0 WITH LLVM-exception',
        note: 'Transpiles the cartridge, so the replay viewer runs the same engine the match was played on.',
      },
      {
        name: 'The Component Model',
        href: 'https://component-model.bytecodealliance.org',
        lic: 'Specification',
        note: 'The contract a cartridge is written against. By the Bytecode Alliance, as are the three above.',
        links: [['Bytecode Alliance', 'https://bytecodealliance.org']],
      },
    ],
  },
  {
    id: 'ratings',
    title: 'Ratings',
    entries: [
      {
        name: 'TrueSkill',
        href: 'https://www.microsoft.com/en-us/research/publication/trueskilltm-a-bayesian-skill-rating-system/',
        lic: 'Research',
        note: 'Ralf Herbrich, Tom Minka and Thore Graepel (Microsoft Research, 2006). Every rating on the leaderboard is a posterior from their update.',
        links: [['TrueSkill at MSR', 'https://www.microsoft.com/en-us/research/project/trueskill-ranking-system/']],
      },
      {
        name: (
          <>
            The <code>trueskill</code> package
          </>
        ),
        href: 'https://trueskill.org',
        lic: 'BSD',
        note: 'Heungsub Lee’s implementation, which ours is tested against to 1e-9.',
      },
      {
        name: 'Numerical Recipes',
        href: 'https://numerical.recipes',
        lic: 'Published method',
        note: 'Press, Teukolsky, Vetterling and Flannery. The error-function approximation our Gaussians use.',
      },
    ],
  },
  {
    id: 'training',
    title: 'Training the baselines',
    entries: [
      {
        name: 'PyTorch',
        href: 'https://pytorch.org',
        version: '≥ 2.2',
        lic: 'BSD-3-Clause',
        note: 'Trains and exports every baseline.',
      },
      {
        name: 'NumPy',
        href: 'https://numpy.org',
        version: '≥ 1.26',
        lic: 'BSD-3-Clause',
        note: 'The training-side observation encoding.',
      },
      {
        name: 'onnx',
        href: 'https://github.com/onnx/onnx',
        version: '≥ 1.16',
        lic: 'Apache-2.0',
        note: 'The float16 rewrite that halves a model’s bytes.',
      },
      {
        name: 'Proximal Policy Optimization',
        href: 'https://arxiv.org/abs/1707.06347',
        lic: 'Research',
        note: 'Schulman, Wolski, Dhariwal, Radford and Klimov (OpenAI, 2017). The self-play trainer.',
      },
      {
        name: 'Generalized Advantage Estimation',
        href: 'https://arxiv.org/abs/1506.02438',
        lic: 'Research',
        note: 'Schulman, Moritz, Levine, Jordan and Abbeel (2015).',
      },
    ],
  },
  {
    id: 'web',
    title: 'This website',
    entries: [
      {
        name: 'React',
        href: 'https://react.dev',
        version: '19',
        lic: 'MIT',
        note: 'This interface, and the replay viewer’s shell.',
      },
      { name: 'React Router', href: 'https://reactrouter.com', version: '7', lic: 'MIT', note: 'The routes.' },
      { name: 'Vite', href: 'https://vite.dev', version: '8', lic: 'MIT', note: 'The dev server and the build.' },
      { name: 'TypeScript', href: 'https://www.typescriptlang.org', version: '6', lic: 'Apache-2.0' },
      { name: 'oxlint', href: 'https://oxc.rs', version: '1.79', lic: 'MIT', note: 'The linter, from Oxc.' },
    ],
  },
  {
    id: 'book',
    title: 'The competitor guide',
    entries: [
      {
        name: 'mdBook',
        href: 'https://rust-lang.github.io/mdBook/',
        version: '0.5.4',
        lic: 'MPL-2.0',
        note: (
          <>
            Renders the book at <code>/docs</code>.
          </>
        ),
      },
      {
        name: 'Bundled by mdBook',
        lic: 'BSD-3-Clause / MIT',
        note: 'Highlighting, search, copy buttons and editable samples on every page of the book.',
        links: [
          ['highlight.js', 'https://highlightjs.org'],
          ['elasticlunr.js', 'https://github.com/weixsong/elasticlunr.js'],
          ['clipboard.js', 'https://clipboardjs.com'],
          ['Ace', 'https://ace.c9.io'],
        ],
      },
    ],
  },
  {
    id: 'infra',
    title: 'What a deployment runs on',
    entries: [
      {
        name: 'PostgreSQL',
        href: 'https://www.postgresql.org',
        version: '16',
        lic: 'PostgreSQL Licence',
        note: 'The shared schema Soma and Kalam coordinate through. They never call each other.',
      },
      {
        name: 'Redis',
        href: 'https://redis.io',
        version: '7',
        lic: 'RSALv2 / SSPLv1',
        note: 'Orion’s cluster state, which makes each clock a single runner across the fleet.',
      },
      { name: 'MinIO', href: 'https://min.io', lic: 'AGPL-3.0', note: 'Models and replays.' },
      {
        name: 'nginx',
        href: 'https://nginx.org',
        version: '1.27',
        lic: 'BSD-2-Clause',
        note: (
          <>
            Serves this site and the book, and proxies <code>/v1</code>.
          </>
        ),
      },
      {
        name: 'Docker, Debian, Alpine, BusyBox and curl',
        lic: 'Apache-2.0, and others',
        note: 'Every image the platform publishes is built from these.',
        links: [
          ['Docker', 'https://www.docker.com'],
          ['Debian', 'https://www.debian.org'],
          ['Alpine', 'https://alpinelinux.org'],
          ['BusyBox', 'https://busybox.net'],
          ['curl', 'https://curl.se'],
        ],
      },
      {
        name: 'GitHub and Homebrew',
        lic: 'Services',
        note: 'Every release is cut by a workflow; the CLI installs from a tap; sign-in here is GitHub OAuth.',
        links: [
          ['GitHub Actions', 'https://github.com/features/actions'],
          ['Homebrew', 'https://brew.sh'],
        ],
      },
    ],
  },
  {
    id: 'rust',
    title: 'Rust, and the CLI’s crates',
    entries: [
      {
        name: 'The Rust project',
        href: 'https://www.rust-lang.org',
        version: '1.98.1',
        lic: 'MIT / Apache-2.0',
        note: (
          <>
            The cartridge, all four plugins and the <code>tinybrains</code> binary.
          </>
        ),
      },
      {
        name: 'serde and serde_json',
        href: 'https://serde.rs',
        lic: 'MIT / Apache-2.0',
        note: 'Every JSON boundary in the platform.',
      },
      {
        name: 'rustls and ring',
        lic: 'Apache-2.0 / MIT / ISC',
        note: 'HTTPS for the two things the CLI fetches: a cartridge release, and a model.',
        links: [
          ['rustls', 'https://github.com/rustls/rustls'],
          ['ring', 'https://github.com/briansmith/ring'],
        ],
      },
      {
        name: 'ureq, tar, flate2, toml and sha2',
        lic: 'MIT / Apache-2.0',
        note: 'The request, the archive, the games registry, and the digests that prove a cartridge is the one the ladder plays.',
        links: [
          ['ureq', 'https://github.com/algesten/ureq'],
          ['tar', 'https://github.com/alexcrichton/tar-rs'],
          ['flate2', 'https://github.com/rust-lang/flate2-rs'],
          ['toml', 'https://github.com/toml-rs/toml'],
          ['sha2', 'https://github.com/RustCrypto/hashes'],
        ],
      },
    ],
  },
]

/** The six repositories, for the closing section. */
const REPOS = ['ants', 'cli', 'soma', 'kalam', 'web', 'ants-starter']

/** Every link on this page leaves the site, so each one says so the way the footer's do. */
function Ext({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} rel="noopener">
      {children}
      <Icon id="i-ext" label="opens another site" />
    </a>
  )
}

function Credit({ e }: { e: Entry }) {
  return (
    <div className="credit">
      <h3>
        {e.href ? <Ext href={e.href}>{e.name}</Ext> : e.name}
        {e.version ? <span className="v">{e.version}</span> : null}
      </h3>
      <span className="lic">{e.lic}</span>
      {e.note ? <p>{e.note}</p> : null}
      {e.links?.length ? (
        <p className="credit-links">
          {e.links.map(([label, href]) => (
            <Ext href={href} key={href}>
              {label}
            </Ext>
          ))}
        </p>
      ) : null}
      {/* A licence term, not a caption. See the note at the top of this file. */}
      {e.attrib ? <p className="attrib">{e.attrib}</p> : null}
    </div>
  )
}

export default function Credits() {
  return (
    <Shell title="Credits">
      <PageHeader
        crumbs={[{ label: 'Credits' }]}
        title="Credits"
        sub="What TinyBrains is built on, and who made it."
      />
      <div className="wrap page-body doc">
        <div className="prose credits-doc">
          {SECTIONS.map((s) => (
            <section key={s.id}>
              <h2 id={s.id}>{s.title}</h2>
              <div className="credits">
                {s.entries.map((e, i) => (
                  <Credit e={e} key={i} />
                ))}
              </div>
            </section>
          ))}

          <section>
            <h2 id="licence">TinyBrains itself</h2>
            <p className="credits-end">All six repositories are Apache-2.0.</p>
            <p className="credit-links">
              {REPOS.map((r) => (
                <Ext href={`https://github.com/Tiny-Brains/${r}`} key={r}>
                  {r}
                </Ext>
              ))}
              <Ext href="https://www.apache.org/licenses/LICENSE-2.0">Apache-2.0</Ext>
            </p>
            <p className="credits-end">
              Missing or credited wrongly? Open an issue on{' '}
              <Ext href="https://github.com/Tiny-Brains/web">Tiny-Brains/web</Ext>.
            </p>
          </section>
        </div>
        <nav className="toc" aria-label="On this page">
          <b>On this page</b>
          {SECTIONS.map((s) => (
            <a href={`#${s.id}`} key={s.id}>
              {s.title}
            </a>
          ))}
          <a href="#licence">TinyBrains itself</a>
        </nav>
      </div>
    </Shell>
  )
}
