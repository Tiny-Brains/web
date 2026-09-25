// STUB: replaced by the page's implementation.

import { Shell } from '../components/Shell'
import { PageHeader } from '../components/ui'
import { AdminTabs } from '../components/AdminTabs'
import T from '../../copy/admin-post-edit.json'

export default function PostEdit() {
  return (
    <Shell title={T.tab}>
      <PageHeader title={T.title} />
      <div className="wrap">
        <AdminTabs current="posts" />
      </div>
    </Shell>
  )
}
