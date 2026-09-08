import { Outlet } from 'react-router-dom'
import { TopBar } from './TopBar'
import { AiChat } from './AiChat'
import { Toaster, DialogHost } from './Feedback'
import { PilotFeedbackWidget } from './PilotFeedbackWidget'
import { HelpDrawer } from './ayuda/HelpDrawer'

export function Shell() {
  // El inicio ocultaba la barra porque era una portada: se entraba a un modulo
  // y recien ahi aparecia la navegacion. Ahora el inicio es la pantalla de
  // trabajo, asi que la barra va siempre y no hay un salto al navegar.
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <TopBar />
      <main style={{ flex: 1, overflow: 'auto' }}>
        <Outlet />
      </main>
      <HelpDrawer />
      <AiChat />
      <PilotFeedbackWidget />
      <Toaster />
      <DialogHost />
    </div>
  )
}

