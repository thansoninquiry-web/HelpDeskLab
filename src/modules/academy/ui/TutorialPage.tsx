import { TutorialView } from '../../shared/TutorialPage'
import { ACADEMY_TUTORIAL } from '../data/tutorial'
import { AcademyNav } from './AcademyNav'

/** The school desk's walkthrough, in the shared tutorial layout. */
export function AcademyTutorialPage() {
  return <TutorialView tutorial={ACADEMY_TUTORIAL} nav={<AcademyNav />} />
}
