import { create } from 'zustand'

export const useNotifStore = create((set) => ({
  notifs: [],
  dialog: null, // { type: 'confirm' | 'prompt', title, detail, confirmLabel, tone, placeholder, resolve, defaultValue }
  
  add: (notif) => set((s) => ({ notifs: [...s.notifs, { id: Date.now(), ...notif }] })),
  dismiss: (id) => set((s) => ({ notifs: s.notifs.filter((n) => n.id !== id) })),
  
  showDialog: (dialog) => set({ dialog }),
  closeDialog: () => set({ dialog: null }),
}))

export const toast = {
  success: (message) => useNotifStore.getState().add({ type: 'success', message }),
  error: (message) => useNotifStore.getState().add({ type: 'error', message }),
  info: (message) => useNotifStore.getState().add({ type: 'info', message }),
  warning: (message) => useNotifStore.getState().add({ type: 'warning', message }),
}

export const confirmDialog = (opts) => {
  return new Promise((resolve) => {
    useNotifStore.getState().showDialog({
      type: 'confirm',
      ...opts,
      resolve: (val) => {
        useNotifStore.getState().closeDialog()
        resolve(val)
      },
    })
  })
}

export const promptDialog = (opts) => {
  return new Promise((resolve) => {
    useNotifStore.getState().showDialog({
      type: 'prompt',
      ...opts,
      resolve: (val) => {
        useNotifStore.getState().closeDialog()
        resolve(val)
      },
    })
  })
}

