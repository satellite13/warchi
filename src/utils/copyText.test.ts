import { afterEach, describe, expect, it, vi } from 'vitest'
import { copyText } from './copyText'

describe('copyText', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('uses the clipboard API in a secure context', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    vi.stubGlobal('isSecureContext', true)
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true })

    await copyText('https://warchi.example/models/m?diagramId=d')

    expect(writeText).toHaveBeenCalledWith('https://warchi.example/models/m?diagramId=d')
  })

  it('falls back to execCommand when clipboard is unavailable', async () => {
    vi.stubGlobal('navigator', {})
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: false })
    const execCommand = vi.fn().mockReturnValue(true)
    Object.defineProperty(document, 'execCommand', { configurable: true, value: execCommand })

    await copyText('http://warchi.arch.svc.cluster.local/models/m?diagramId=d')

    expect(execCommand).toHaveBeenCalledWith('copy')
    expect(document.querySelector('textarea')).toBeNull()
  })

  it('falls back when the clipboard API rejects the write', async () => {
    const writeText = vi.fn().mockRejectedValue(new DOMException('denied', 'NotAllowedError'))
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true })
    const execCommand = vi.fn().mockReturnValue(true)
    Object.defineProperty(document, 'execCommand', { configurable: true, value: execCommand })

    await copyText('https://warchi.example/models/m?diagramId=d')

    expect(writeText).toHaveBeenCalled()
    expect(execCommand).toHaveBeenCalledWith('copy')
  })
})
