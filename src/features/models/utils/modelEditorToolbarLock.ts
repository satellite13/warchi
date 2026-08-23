const SAVE_LOCKED_TOOLBAR_EVENTS = ['save', 'import-oef', 'run-validation-script'] as const

export function isSaveLockedToolbarEvent(event: string, isSaving: boolean): boolean {
  return isSaving && (SAVE_LOCKED_TOOLBAR_EVENTS as readonly string[]).includes(event)
}
