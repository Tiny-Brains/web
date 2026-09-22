// Where to ask when the site cannot answer: the Discord server and the GitHub organisation.
//
// One component for every place that says so -- under an error, and where a page runs out -- so
// each says it the same way and links the same two addresses, which live once, in
// copy/common.json's `community`. The header draws the same pair its own way (Shell.tsx).
//
// THEY OPEN IN A NEW TAB, like the book: a question is asked beside the page it is about, and the
// error being asked about stays on screen to be copied. Each link says so to a screen reader.

import type { ReactNode } from 'react'
import { Icon, type IconId } from './ui'
import common from '../../copy/common.json'

const C = common.community

const PLACES: { key: string; href: string; icon: IconId }[] = [
  { key: 'discord', href: C.discord.href, icon: 'i-discord' },
  { key: 'github', href: C.github.href, icon: 'i-github' },
]

function Out({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  return (
    <a className={className} href={href} target="_blank" rel="noopener">
      {children}
      <span className="vis-hidden"> ({C.newTab})</span>
    </a>
  )
}

/** One line under an error: "Stuck?" and the two places, each an icon and its words. */
export function AskForHelp() {
  const words: Record<string, string> = { discord: C.ask.discord, github: C.ask.github }
  return (
    <p className="ask">
      <span>{C.ask.lead}</span>
      {PLACES.map(({ key, href, icon }) => (
        <Out href={href} key={key}>
          <Icon id={icon} />
          {words[key]}
        </Out>
      ))}
    </p>
  )
}

/** The same two places as buttons, for a page that ends by pointing somewhere. */
export function CommunityButtons() {
  const words: Record<string, string> = { discord: C.buttons.discord, github: C.buttons.github }
  return (
    <div className="row">
      {PLACES.map(({ key, href, icon }) => (
        <Out className="btn" href={href} key={key}>
          <Icon id={icon} />
          {words[key]}
        </Out>
      ))}
    </div>
  )
}
