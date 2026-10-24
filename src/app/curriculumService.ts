import {
  CURRICULUM,
  moduleProgress,
  nextModule,
  type CurriculumModule,
  type ModuleProgress,
  type ModuleStatus,
  type RequirementProgress,
} from '../domain/curriculum/modules'
import { evidenceFrom } from '../domain/curriculum/evidence'
import { lessonFor, type ModuleLesson } from '../domain/curriculum/lessons'
import { loadIntuneProgress } from './intuneProgress'
import { getLocalDatabase } from './persistenceService'

/** How far back the curriculum looks. Local history is small; this is a guard. */
const HISTORY_SCAN = 4_000

export interface ModuleRequirementView extends RequirementProgress {
  /** Rendered as "3 / 5" beside the requirement. */
  progressLabel: string
}

export interface ModuleView {
  id: string
  number: number
  title: string
  summary: string
  status: ModuleStatus
  met: number
  total: number
  percent: number
  complete: boolean
  /** XP earned on the families this module covers. Zero when it has no scope. */
  xp: number
  /**
   * How the module is practised: a ticket from its lesson's first family, the
   * Job targets page, or nowhere because the module is not playable.
   */
  practice: 'tickets' | 'targets' | null
  /** The one requirement to work on next, if the module is not finished. */
  nextRequirement: ModuleRequirementView | null
  requirements: readonly ModuleRequirementView[]
  note: string | null
}

export interface CurriculumView {
  modules: readonly ModuleView[]
  /** Modules that can be practised today. */
  playable: number
  complete: number
  /** Total requirements met across every built module. */
  met: number
  total: number
  percent: number
  /** The next unfinished module in course order. */
  next: ModuleView | null
}

function toView(
  module: CurriculumModule,
  progress: ModuleProgress,
  xp: number,
): ModuleView {
  const requirements: ModuleRequirementView[] = progress.requirements.map((entry) => ({
    ...entry,
    progressLabel: `${Math.min(entry.current, entry.target)} / ${entry.target}`,
  }))

  return {
    id: module.id,
    number: module.number,
    title: module.title,
    summary: module.summary,
    status: module.status,
    met: progress.met,
    total: progress.total,
    percent: progress.percent,
    complete: progress.complete,
    xp,
    practice: lessonFor(module.id)?.practice.kind ?? null,
    nextRequirement: requirements.find((entry) => !entry.met) ?? null,
    requirements,
    note: module.note ?? null,
  }
}

export interface ModuleLessonView {
  module: ModuleView
  lesson: ModuleLesson
}

/**
 * One module with its lesson, or null when there is no lesson to open: an
 * unknown id, a module that is still planned, or one whose content has not been
 * written yet.
 */
export async function loadModuleLesson(moduleId: string): Promise<ModuleLessonView | null> {
  const lesson = lessonFor(moduleId)
  if (!lesson) {
    return null
  }

  const curriculum = await loadCurriculum()
  const found = curriculum.modules.find((module) => module.id === moduleId)
  if (!found || found.status !== 'playable') {
    return null
  }

  return { module: found, lesson }
}

/**
 * Module progression, derived on read from scores, sessions, actions and saved
 * listings. Nothing is stored: adding a requirement to the catalog re-scores
 * the whole history the next time this runs.
 */
export async function loadCurriculum(): Promise<CurriculumView> {
  const db = await getLocalDatabase()
  const [ticketHistory, sessions, actions, listings, intune] = await Promise.all([
    db.scores.listHistory(),
    db.sessions.listRecent(HISTORY_SCAN),
    db.actions.listRecent(HISTORY_SCAN),
    db.targets.list(),
    loadIntuneProgress(),
  ])

  // Intune attempts count as scored attempts — they are real work, judged and
  // dated — and their own numbers come in beside the ticket history because
  // there is no session for this reader to fold them from.
  const history = [...ticketHistory, ...intune.history]
  const evidence = evidenceFrom({ history, sessions, actions, listings, intune: intune.evidence })

  const xpByFamily = new Map<string, number>()
  for (const entry of history) {
    xpByFamily.set(entry.scenarioId, (xpByFamily.get(entry.scenarioId) ?? 0) + entry.xp)
  }

  const progressById: Record<string, ModuleProgress> = {}
  const modules: ModuleView[] = CURRICULUM.map((module) => {
    const progress = moduleProgress(module, evidence)
    progressById[module.id] = progress
    const xp = module.scope.reduce((total, family) => total + (xpByFamily.get(family) ?? 0), 0)
    return toView(module, progress, xp)
  })

  const playableModules = modules.filter((module) => module.status === 'playable')
  const met = playableModules.reduce((total, module) => total + module.met, 0)
  const total = playableModules.reduce((total, module) => total + module.total, 0)
  const upcoming = nextModule(CURRICULUM, progressById)

  return {
    modules,
    playable: playableModules.length,
    complete: playableModules.filter((module) => module.complete).length,
    met,
    total,
    percent: total === 0 ? 0 : Math.floor((met / total) * 100),
    next: upcoming ? (modules.find((module) => module.id === upcoming.id) ?? null) : null,
  }
}
