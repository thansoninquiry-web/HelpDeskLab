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
import { AzureCoursePage } from '../../modules/azure/ui/CoursePage'
import { AzureInventoryPage } from '../../modules/azure/ui/InventoryPage'
import { AzureNetworkPage } from '../../modules/azure/ui/NetworkPage'
import { AzureResourcePage } from '../../modules/azure/ui/ResourcePage'
import { AzureTicketsPage } from '../../modules/azure/ui/TicketsPage'
import { AzureTerminalPage } from '../../modules/azure/ui/TerminalPage'
import { DesktopBenchPage } from '../../modules/desktop/ui/BenchPage'
import { DesktopCasePage } from '../../modules/desktop/ui/CasePage'
import { DesktopCasesPage } from '../../modules/desktop/ui/CasesPage'
import { DesktopToolsPage } from '../../modules/desktop/ui/ToolsPage'
import { NetlabConceptsPage } from '../../modules/netlab/ui/ConceptsPage'
import { NetlabDevicePage } from '../../modules/netlab/ui/DevicePage'
import { NetlabIncidentPage } from '../../modules/netlab/ui/IncidentPage'
import { NetlabIncidentsPage } from '../../modules/netlab/ui/IncidentsPage'
import { NetlabToolsPage } from '../../modules/netlab/ui/ToolsPage'
import { NetlabTopologyPage } from '../../modules/netlab/ui/TopologyPage'
import { IntuneAppsPage } from '../../modules/intune/ui/AppsPage'
import { IntuneCoursePage } from '../../modules/intune/ui/CoursePage'
import { IntuneDevicePage } from '../../modules/intune/ui/DevicePage'
import { IntuneDevicesPage } from '../../modules/intune/ui/DevicesPage'
import { IntunePoliciesPage } from '../../modules/intune/ui/PoliciesPage'
import { IntuneTicketsPage } from '../../modules/intune/ui/TicketsPage'
import { IntuneTerminalPage } from '../../modules/intune/ui/TerminalPage'
import { DsaPatternsPage } from '../../modules/dsa/ui/PatternsPage'
import { DsaProblemPage } from '../../modules/dsa/ui/ProblemPage'
import { DsaProblemsPage } from '../../modules/dsa/ui/ProblemsPage'
import { LanguageTracksPage } from '../../modules/languages/ui/IndexPage'
import { LanguageTrackPage } from '../../modules/languages/ui/TrackPage'
import { LanguageLessonPage } from '../../modules/languages/ui/LessonPage'
import { LanguagePracticePage } from '../../modules/languages/ui/PracticePage'
import { LanguageRunPage } from '../../modules/languages/ui/RunPage'

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
        <Route path="intune/course" element={<IntuneCoursePage />} />
        <Route path="intune/tickets" element={<IntuneTicketsPage />} />
        <Route path="intune/terminal" element={<IntuneTerminalPage />} />
        {/* The Azure simulator: its own console, its own estate, its own path. */}
        <Route path="azure" element={<AzureInventoryPage />} />
        <Route path="azure/resources/:resourceId" element={<AzureResourcePage />} />
        <Route path="azure/network" element={<AzureNetworkPage />} />
        <Route path="azure/access" element={<AzureAccessPage />} />
        <Route path="azure/course" element={<AzureCoursePage />} />
        <Route path="azure/tickets" element={<AzureTicketsPage />} />
        <Route path="azure/terminal" element={<AzureTerminalPage />} />
        {/* The networking lab: a school network, one fault at a time. */}
        <Route path="networking" element={<NetlabTopologyPage />} />
        <Route path="networking/incidents" element={<NetlabIncidentsPage />} />
        <Route path="networking/incidents/:incidentId" element={<NetlabIncidentPage />} />
        <Route path="networking/devices/:deviceId" element={<NetlabDevicePage />} />
        <Route path="networking/concepts" element={<NetlabConceptsPage />} />
        <Route path="networking/tools" element={<NetlabToolsPage />} />
        {/* The desktop bench: a case queue, one machine per case, and the bench. */}
        <Route path="desktop" element={<DesktopCasesPage />} />
        <Route path="desktop/cases/:caseId" element={<DesktopCasePage />} />
        <Route path="desktop/bench" element={<DesktopBenchPage />} />
        <Route path="desktop/tools" element={<DesktopToolsPage />} />
        {/* The algorithm drill: a problem library and one problem's workspace. */}
        <Route path="dsa" element={<DsaProblemsPage />} />
        <Route path="dsa/patterns" element={<DsaPatternsPage />} />
        <Route path="dsa/:problemId" element={<DsaProblemPage />} />
        {/* The language tracks: a picker, one track, its lessons and its drills. */}
        <Route path="languages" element={<LanguageTracksPage />} />
        <Route path="languages/:trackId" element={<LanguageTrackPage />} />
        <Route path="languages/:trackId/lessons/:lessonId" element={<LanguageLessonPage />} />
        <Route path="languages/:trackId/practice/:itemId" element={<LanguagePracticePage />} />
        <Route path="languages/:trackId/run" element={<LanguageRunPage />} />
        <Route path="progress" element={<ProgressPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
