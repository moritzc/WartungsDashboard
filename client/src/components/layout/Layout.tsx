import { Outlet } from 'react-router-dom'
import TopNav from './TopNav'
import SideNav from './SideNav'

export default function Layout() {
  return (
    <div className="app-shell">
      <TopNav />
      <SideNav />
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  )
}
