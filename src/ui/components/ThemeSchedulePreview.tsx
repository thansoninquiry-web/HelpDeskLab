import { useState } from 'react'
import { themeAtMinute, type ThemeSchedule } from '../../app/themeService'
import styles from './ThemeSchedulePreview.module.css'

const MINUTES_IN_DAY = 24 * 60
/** One-minute steps: every time of day can be chosen, not just round hours. */
const STEP_MINUTES = 1

function clockOfMinute(minute: number): string {
  const hours = Math.floor(minute / 60) % 24
  const minutes = minute % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

function currentMinute(): number {
  const now = new Date()
  return now.getHours() * 60 + now.getMinutes()
}

interface ThemeSchedulePreviewProps {
  /** The dawn and dusk in the form, whether or not they have been saved. */
  schedule: ThemeSchedule
}

/**
 * A miniature of the workspace painted with the schedule's answer for the hour
 * the learner chooses. The palette is scoped onto the stage with `data-theme`,
 * so the preview can show the paper workspace inside a dark app (and the other
 * way round) without a second set of colour literals.
 */
export function ThemeSchedulePreview({ schedule }: ThemeSchedulePreviewProps) {
  const [minute, setMinute] = useState(currentMinute)
  const look = themeAtMinute(minute, schedule)
  const clock = clockOfMinute(minute)
  const lookLabel = look === 'light' ? 'Light workspace' : 'Dark workspace'

  return (
    <div className={styles.preview}>
      <div className={styles.previewHead}>
        <div className={styles.previewCopy}>
          <h3 className={styles.previewTitle}>Live preview</h3>
          <p className={styles.previewLead}>
            See the workspace at any hour before you save the schedule.
          </p>
        </div>
        <output className={styles.previewReadout} aria-live="polite">
          <span className={styles.previewClock}>{clock}</span>
          <span className={styles.previewLook}>{lookLabel}</span>
        </output>
      </div>

      <div
        className={styles.stage}
        data-theme={look}
        role="img"
        aria-label={`The ${look} workspace at ${clock}`}
      >
        <div className={styles.window}>
          <div className={styles.rail}>
            <span className={styles.railMark} />
            <span className={styles.railDot} />
            <span className={styles.railDot} />
            <span className={styles.railDot} />
          </div>
          <div className={styles.canvas}>
            <div className={styles.bar}>
              <span className={styles.barTitle}>Service desk</span>
              <span className={styles.barMeta}>Tier 1</span>
            </div>
            <div className={styles.panels}>
              <div className={styles.ticket}>
                <span className={styles.ticketTag}>Ticket · open</span>
                <span className={styles.ticketSubject}>Printer offline</span>
                <span className={styles.ticketLine} />
                <span className={styles.ticketLineShort} />
              </div>
              <div className={styles.terminal}>
                <span className={styles.terminalLine}>C:\&gt; sc query spooler</span>
                <span className={styles.terminalDim}>STATE : 1 STOPPED</span>
                <span className={styles.terminalPrompt}>C:\&gt; _</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <label className={styles.scrubber}>
        <span className={styles.scrubberLabel}>Time of day</span>
        <input
          className={styles.slider}
          type="range"
          min={0}
          max={MINUTES_IN_DAY - 1}
          step={STEP_MINUTES}
          value={minute}
          aria-label="Preview time of day"
          aria-valuetext={`${clock}, ${look} workspace`}
          onChange={(event) => setMinute(Number(event.target.value))}
        />
      </label>
    </div>
  )
}
