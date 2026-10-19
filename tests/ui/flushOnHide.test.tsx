import { render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useFlushOnHide } from '../../src/ui/components/useFlushOnHide'

function Harness({ flush }: { flush: () => void }) {
  useFlushOnHide(flush)
  return <p>open</p>
}

/** jsdom's visibility is read-only, so the test owns what the page reports. */
function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => state,
  })
}

afterEach(() => {
  setVisibility('visible')
})

describe('useFlushOnHide', () => {
  it('flushes pending work when the page is unloaded', () => {
    const flush = vi.fn()
    render(<Harness flush={flush} />)

    window.dispatchEvent(new Event('pagehide'))

    expect(flush).toHaveBeenCalledTimes(1)
  })

  it('flushes when the document is hidden', () => {
    const flush = vi.fn()
    render(<Harness flush={flush} />)

    setVisibility('hidden')
    document.dispatchEvent(new Event('visibilitychange'))

    expect(flush).toHaveBeenCalledTimes(1)
  })

  it('flushes nothing when the document becomes visible again', () => {
    const flush = vi.fn()
    render(<Harness flush={flush} />)

    setVisibility('visible')
    document.dispatchEvent(new Event('visibilitychange'))

    expect(flush).not.toHaveBeenCalled()
  })

  it('flushes through the newest callback after a re-render', () => {
    const first = vi.fn()
    const second = vi.fn()
    const view = render(<Harness flush={first} />)

    view.rerender(<Harness flush={second} />)
    window.dispatchEvent(new Event('pagehide'))

    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })

  it('stops listening once the page is gone', () => {
    const flush = vi.fn()
    const view = render(<Harness flush={flush} />)

    view.unmount()
    window.dispatchEvent(new Event('pagehide'))
    setVisibility('hidden')
    document.dispatchEvent(new Event('visibilitychange'))

    expect(flush).not.toHaveBeenCalled()
  })
})
