import { Outlet } from 'react-router-dom'
import { TopBar } from './TopBar'
import { AiChat } from './AiChat'

export function Shell() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <TopBar />
      <main style={{ flex: 1, overflow: 'auto' }}>
        <Outlet />
      </main>
      <AiChat />
    </div>
  )
}
