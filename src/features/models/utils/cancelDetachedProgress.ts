export function cancelDetachedProgress(options: {
  scriptsPreparing: boolean
  scriptsCancel: () => void
}): void {
  if (options.scriptsPreparing) {
    options.scriptsCancel()
  }
}
