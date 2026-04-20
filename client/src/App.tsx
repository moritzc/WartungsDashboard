import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useAuthStore } from './stores/useAuthStore'
import { api } from './hooks/useApi'
import type { User } from './types'
import Layout from './components/layout/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import MaintenanceSheet from './pages/MaintenanceSheet'
import CustomerAdmin from './pages/CustomerAdmin'
import Configuration from './pages/Configuration'
import Reporting from './pages/Reporting'
import UserManagement from './pages/UserManagement'

function App() {
  const { user, setUser } = useAuthStore()
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    api.get<User>('/auth/me')
      .then((u) => setUser(u))
      .catch(() => setUser(null))
      .finally(() => setChecking(false))
  }, [setUser])

  if (checking) {
    return (
      <div className="loading-screen" style={{ minHeight: '100vh' }}>
        <div className="spinner" />
      </div>
    )
  }

  if (!user) {
    return (
      <BrowserRouter>
        <Routes>
          <Route path="*" element={<Login />} />
        </Routes>
      </BrowserRouter>
    )
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/sheet/:sheetId" element={<MaintenanceSheet />} />
          <Route path="/customers" element={<CustomerAdmin />} />
          <Route path="/configuration" element={<Configuration />} />
          <Route path="/reporting" element={<Reporting />} />
          <Route path="/users" element={<UserManagement />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
