import { TutorialView } from '../../shared/TutorialPage'
import { DESKTOP_TUTORIAL } from '../data/tutorial'
import { DesktopNav } from './DesktopNav'

/** The desktop bench's walkthrough, in the shared tutorial layout. */
export function DesktopTutorialPage() {
  return <TutorialView tutorial={DESKTOP_TUTORIAL} nav={<DesktopNav />} />
}
