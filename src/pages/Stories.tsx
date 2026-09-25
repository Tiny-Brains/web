// STUB: replaced by the page's implementation.

import { Shell } from '../components/Shell'
import { PageHeader } from '../components/ui'
import T from '../../copy/stories.json'

export default function Stories() {
  return (
    <Shell title={T.tab}>
      <PageHeader title={T.title} />
    </Shell>
  )
}
