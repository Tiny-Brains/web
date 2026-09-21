// `/credits` — what the platform is built on, and who made it.
//
// ONE ENTRY IS AN OBLIGATION RATHER THAN A COURTESY: the logo is a derivative of a Noun Project
// icon under CC BY 3.0, so `attrib` carries the licence's required attribution string verbatim and
// is the one thing on the page drawn on a surface of its own. Editing that row (in copy/credits.json)
// is editing a licence term — the same string belongs in web/README.md and inside both logo SVGs,
// which travel alone as the favicons.
//
// The list is data, in copy/credits.json, because a dependency bump is then one line. Versions are
// the ones that ship, so they are checked against the manifests and Dockerfiles they come from:
// package.json, the three Cargo.tomls, ants/baselines/pyproject.toml, docker-compose.yml, and
// soma's and kalam's ARG blocks. A version written here and nowhere else is a version that goes
// stale silently.

import type { ReactNode } from 'react'
import { Shell } from '../components/Shell'
import { Icon, PageHeader, Rich } from '../components/ui'
import T from '../../copy/credits.json'
import common from '../../copy/common.json'

/** A credited thing. `href` links the name; `links` are whatever else is worth reaching. A name
 *  and a note may carry markup. */
type Entry = {
  name: string
  href?: string
  version?: string
  lic: string
  note?: string
  links?: { label: string; href: string }[]
  attrib?: string
}

/** Every link on this page leaves the site, so each one says so the way the footer's do. */
function Ext({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} rel="noopener">
      {children}
      <Icon id="i-ext" label={common.shell.footer.external} />
    </a>
  )
}

function Credit({ e }: { e: Entry }) {
  return (
    <div className="credit">
      <h3>
        {e.href ? (
          <Ext href={e.href}>
            <Rich text={e.name} />
          </Ext>
        ) : (
          <Rich text={e.name} />
        )}
        {e.version ? <span className="v">{e.version}</span> : null}
      </h3>
      <span className="lic">{e.lic}</span>
      {e.note ? (
        <p>
          <Rich text={e.note} />
        </p>
      ) : null}
      {e.links?.length ? (
        <p className="credit-links">
          {e.links.map(({ label, href }) => (
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
    <Shell title={T.tab}>
      <PageHeader crumbs={[{ label: T.header.crumb }]} title={T.header.title} sub={T.header.sub} />
      <div className="wrap page-body doc">
        <div className="prose credits-doc">
          {T.sections.map((s) => (
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
            <h2 id="licence">{T.licence.title}</h2>
            <p className="credits-end">{T.licence.text}</p>
            <p className="credit-links">
              {T.licence.repos.map((r) => (
                <Ext href={`https://github.com/Tiny-Brains/${r}`} key={r}>
                  {r}
                </Ext>
              ))}
              <Ext href="https://www.apache.org/licenses/LICENSE-2.0">{T.licence.apache}</Ext>
            </p>
            <p className="credits-end">
              <Rich
                text={T.licence.missing}
                vars={{ link: <Ext href="https://github.com/Tiny-Brains/web">{T.licence.link}</Ext> }}
              />
            </p>
          </section>
        </div>
        <nav className="toc" aria-label={T.toc.label}>
          <b>{T.toc.heading}</b>
          {T.sections.map((s) => (
            <a href={`#${s.id}`} key={s.id}>
              {s.title}
            </a>
          ))}
          <a href="#licence">{T.licence.title}</a>
        </nav>
      </div>
    </Shell>
  )
}
