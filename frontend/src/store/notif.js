import { create } from 'zustand'

export const useNotifStore = create((set) => ({
  notifs: [],
  add: (notif) => set((s) => ({ notifs: [...s.notifs, { id: Date.now(), ...notif }] })),
  dismiss: (id) => set((s) => ({ notifs: s.notifs.filter((n) => n.id !== id) })),
}))
