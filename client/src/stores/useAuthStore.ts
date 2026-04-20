import { create } from 'zustand'
import type { User } from '../types'

interface AuthState {
  user: User | null
  setUser: (user: User | null) => void
  isAdmin: () => boolean
}

// No persistence — the server session cookie is the source of truth.
// Persisting user to localStorage caused a flash of authenticated state on logout.
export const useAuthStore = create<AuthState>()((set, get) => ({
  user: null,
  setUser: (user) => set({ user }),
  isAdmin: () => get().user?.role === 'ADMIN',
}))
