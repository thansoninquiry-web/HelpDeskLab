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
import { AzureAccessPage } from '../../modules/azure/ui/AccessPage'
import { AzureInventoryPage } from '../../modules/azure/ui/InventoryPage'
import { AzureNetworkPage } from '../../modules/azure/ui/NetworkPage'
import { AzureResourcePage } from '../../modules/azure/ui/ResourcePage'
import { AzureTicketsPage } from '../../modules/azure/ui/TicketsPage'
import { IntuneAppsPage } from '../../modules/intune/ui/AppsPage'
import { IntuneDevicePage } from '../../modules/intune/ui/DevicePage'
import { IntuneDevicesPage } from '../../modules/intune/ui/DevicesPage'
import { IntunePoliciesPage } from '../../modules/intune/ui/PoliciesPage'
import { IntuneTicketsPage } from '../../modules/intune/ui/TicketsPage'
import { DsaPatternsPage } from '../../modules/dsa/ui/PatternsPage'
import { DsaProblemPage } from '../../modules/dsa/ui/ProblemPage'
import { DsaProblemsPage } from '../../modules/dsa/ui/ProblemsPage'

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
        {/* The Intune simulator: one self-contained console under its own path. */}
        <Route path="intune" element={<IntuneDevicesPage />} />
        <Route path="intune/devices/:deviceId" element={<IntuneDevicePage />} />
        <Route path="intune/policies" element={<IntunePoliciesPage />} />
        <Route path="intune/apps" element={<IntuneAppsPage />} />
        <Route path="intune/tickets" element={<IntuneTicketsPage />} />
        {/* The Azure simulator: its own console, its own estate, its own path. */}
        <Route path="azure" element={<AzureInventoryPage />} />
        <Route path="azure/resources/:resourceId" element={<AzureResourcePage />} />
        <Route path="azure/network" element={<AzureNetworkPage />} />
        <Route path="azure/access" element={<AzureAccessPage />} />
        <Route path="azure/tickets" element={<AzureTicketsPage />} />
        {/* The algorithm drill: a problem library and one problem's workspace. */}
        <Route path="dsa" element={<DsaProblemsPage />} />
        <Route path="dsa/patterns" element={<DsaPatternsPage />} />
        <Route path="dsa/:problemId" element={<DsaProblemPage />} />
        <Route path="progress" element={<ProgressPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
