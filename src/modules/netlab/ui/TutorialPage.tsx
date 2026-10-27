import { TutorialView } from '../../shared/TutorialPage'
import { NETLAB_TUTORIAL } from '../data/tutorial'
import { NetlabNav } from './NetlabNav'

/** The networking lab's walkthrough, in the shared tutorial layout. */
export function NetlabTutorialPage() {
  return <TutorialView tutorial={NETLAB_TUTORIAL} nav={<NetlabNav />} />
}
