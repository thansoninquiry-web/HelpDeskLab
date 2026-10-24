import { useEffect, useId, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router'
import { loadProgressSummary, type ProgressSummary } from '../../app/practiceService'
import styles from './AppShell.module.css'

/**
 * Rank and streak in the header. It stays silent when the database is not
 * ready, so a storage error never blocks navigation.
 *
 * At a desk the score is the chip: XP, rank, and streak written out. On a phone
 * the same three facts do not fit beside the brand, so they move behind a
 * compact button — one press opens the popover, and the identity row gets the
 * width the chip used to take. The chip stays in the tree at that width (the
 * stylesheet hides it) because the popover is the only thing a finger uses, and
 * a document without it is still a document with the score.
 *
 * The trigger's own label carries the number and the rank, so the score is read
 * out without opening anything. The popover closes on a second press, on
 * Escape, on a press outside it, on a scroll or a resize, and on a change of
 * section: an open panel over the page it describes has outlived its reason.
 */
export function ProgressChip() {
  const [summary, setSummary] = useState<ProgressSummary | null>(null)
  // The section the summary was opened on. Storing the route, rather than a
  // plain boolean and an effect that resets it, makes the panel close itself as
  // the section changes: a summary opened on Practice is not open on Progress.
  const [openedOn, setOpenedOn] = useState<string | null>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const holder = useRef<HTMLSpanElement>(null)
  const panelId = useId()
  const { pathname } = useLocation()
  const open = openedOn === pathname

  useEffect(() => {
    let active = true
    loadProgressSummary().then(
      (value) => {
        if (active) {
          setSummary(value)
        }
      },
      () => {
        // The header is decorative; the failure is reported where it matters.
      },
    )
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!open) {
      return
    }

    // Every close below writes the same state; the effect owns the listeners
    // that are only worth holding while the panel is up.
    const dismiss = () => setOpenedOn(null)

    const onPointerDown = (event: PointerEvent) => {
      if (!holder.current?.contains(event.target as Node)) {
        dismiss()
      }
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return
      }
      // Only take the focus back if the popover had it; an Escape pressed
      // somewhere else on the page should not move the caret to the header.
      if (holder.current?.contains(document.activeElement)) {
        trigger.current?.focus()
      }
      dismiss()
    }

    // Scrolling folds the phone header, and folding it away from under an open
    // panel is exactly when a popover should go. A resize covers the rotation
    // out of the phone layout, where the panel is hidden but still open.
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('scroll', dismiss, { passive: true })
    window.addEventListener('resize', dismiss)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('scroll', dismiss)
      window.removeEventListener('resize', dismiss)
    }
  }, [open])

  if (!summary) {
    return null
  }

  const { rank } = summary
  const remaining = rank.nextAt === null ? null : Math.max(0, rank.nextAt - rank.xp)

  return (
    <>
      <span
        className={styles.progressChip}
        title={`${summary.totalXp} lifetime XP · ${rank.title}`}
      >
        <span className={styles.pointsBlock}>
          <span className={styles.xp}>{summary.totalXp} XP</span>
          <span className={styles.rankName}>{rank.title}</span>
        </span>
        <span className={styles.streak}>
          {summary.streakDays === 0 ? 'No streak' : `${summary.streakDays}-day streak`}
        </span>
      </span>

      <span className={styles.scorePopover} ref={holder}>
        <button
          type="button"
          ref={trigger}
          className={styles.scoreTrigger}
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          aria-label={`Score: ${summary.totalXp} XP, ${rank.title}. Open the score summary.`}
          onClick={() => setOpenedOn(open ? null : pathname)}
        >
          <svg
            width={18}
            height={18}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M8 4h8v4a4 4 0 0 1-8 0V4Z" />
            <path d="M8 5.5H5.5V7a3 3 0 0 0 3 3" />
            <path d="M16 5.5h2.5V7a3 3 0 0 1-3 3" />
            <path d="M12 12v3.5" />
            <path d="M9.4 20h5.2l-.8-4.5h-3.6L9.4 20Z" />
          </svg>
        </button>

        {open ? (
          <span id={panelId} className={styles.scorePanel}>
            <span className={styles.scoreLabel}>Score</span>
            <span className={styles.scoreXp}>{summary.totalXp} XP</span>
            <span className={styles.scoreRank}>{rank.title}</span>
            <span className={styles.scoreNext}>
              {remaining !== null && rank.nextTitle !== null
                ? `${remaining} XP to ${rank.nextTitle}`
                : 'Top rank reached'}
            </span>
            <span className={styles.scoreStreak}>
              {summary.streakDays === 0
                ? 'No streak yet — one scored attempt starts one.'
                : `${summary.streakDays}-day streak`}
            </span>
            <Link className={styles.scoreLink} to="/progress">
              See the progress page
            </Link>
          </span>
        ) : null}
      </span>
    </>
  )
}
