export function cancelDetachedProgress(options: {
  savePreparing: boolean
  scriptsPreparing: boolean
  saveCancel: () => void
  scriptsCancel: () => void
}): void {
  if (options.savePreparing) {
    options.saveCancel()
    return
  }
  if (options.scriptsPreparing) {
    options.scriptsCancel()
  }
}
