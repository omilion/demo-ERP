import { create } from 'zustand'

export const useHelpDrawerStore = create((set) => ({
  isOpen: false,
  searchTerm: '',
  activeTab: 'context', // 'context' | 'all'
  selectedArticle: null,
  open: (options = {}) => set({
    isOpen: true,
    ...(options.searchTerm !== undefined ? { searchTerm: options.searchTerm } : {}),
    ...(options.activeTab ? { activeTab: options.activeTab } : {}),
    ...(options.selectedArticle !== undefined ? { selectedArticle: options.selectedArticle } : {}),
  }),
  close: () => set({ isOpen: false, selectedArticle: null }),
  toggle: () => set((s) => ({ isOpen: !s.isOpen, selectedArticle: null })),
  setSearchTerm: (searchTerm) => set({ searchTerm }),
  setActiveTab: (activeTab) => set({ activeTab }),
  setSelectedArticle: (selectedArticle) => set({ selectedArticle }),
}))

export const openHelpDrawer = (options) => useHelpDrawerStore.getState().open(options)
export const closeHelpDrawer = () => useHelpDrawerStore.getState().close()
export const toggleHelpDrawer = () => useHelpDrawerStore.getState().toggle()
