import { PageHeader } from '../components/PageHeader'
import styles from './pages.module.css'

export function NotFoundPage() {
  return (
    <>
      <PageHeader
        eyebrow="404"
        title="Page not found"
        description="That address is not part of the HelpDeskLab shell. Use the navigation above to open the dashboard, the ticket queue, or settings."
      />
      <div className={styles.placeholder}>
        <span className={styles.placeholderTitle}>Nothing at this address</span>
        <p>Use the navigation above to open the dashboard, the ticket queue, or settings.</p>
      </div>
    </>
  )
}
