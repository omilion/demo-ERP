import { Outlet, useLocation } from 'react-router-dom'
import { TopBar } from './TopBar'
import { AiChat } from './AiChat'

export function Shell() {
  const location = useLocation()
  const isHome = location.pathname === '/dashboard'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      {!isHome && <TopBar />}
      <main style={{ flex: 1, overflow: 'auto' }}>
        <Outlet />
      </main>
      <AiChat />
    </div>
  )
}
