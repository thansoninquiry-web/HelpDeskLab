import { BrowserRouter } from 'react-router'
import { AppRoutes } from './ui/routes/AppRoutes'

export function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  )
}
