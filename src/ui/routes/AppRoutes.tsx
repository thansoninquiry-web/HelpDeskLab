import { Route, Routes } from 'react-router'
import { AppShell } from '../components/AppShell'
import { DashboardPage } from './DashboardPage'
import { DebriefPage } from './DebriefPage'
import { JobTargetsPage } from './JobTargetsPage'
import { ModuleLessonPage } from './ModuleLessonPage'
import { NotFoundPage } from './PlaceholderPages'
import { PracticePage } from './PracticePage'
import { ProgressPage } from './ProgressPage'
import { SettingsPage } from './SettingsPage'
import { TicketWorkspacePage } from './TicketWorkspacePage'

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<DashboardPage />} />
        <Route path="modules/:moduleId" element={<ModuleLessonPage />} />
        <Route path="practice" element={<PracticePage />} />
        <Route path="ticket/:sessionId" element={<TicketWorkspacePage />} />
        <Route path="debrief/:sessionId" element={<DebriefPage />} />
        <Route path="targets" element={<JobTargetsPage />} />
        <Route path="progress" element={<ProgressPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
