import { act, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { keyboardInsetFrom, useKeyboardInsetRef } from '../../src/ui/components/useKeyboardInset'

/**
 * The docked phone console is pinned to the layout viewport, and the keyboard
 * floats over it. These are the two halves of the answer: the arithmetic that
 * turns a visual viewport into a covered strip, and the subscription that writes
 * it to the page while the keyboard opens, closes, or scrolls.
 */

const originalInnerHeight = window.innerHeight

afterEach(() => {
  Object.defineProperty(window, 'innerHeight', {
    configurable: true,
    value: originalInnerHeight,
  })
  Reflect.deleteProperty(window as unknown as Record<string, unknown>, 'visualViewport')
})

/** A visual viewport the test can move, with real event plumbing. */
function stubVisualViewport(height: number, offsetTop = 0): EventTarget {
  const target = new EventTarget()
  const viewport = {
    height,
    offsetTop,
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
  }
  Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport })
  return target
}

function setLayoutHeight(height: number): void {
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: height })
}

/** The element the hook is attached to, and the property it wrote there. */
function Probe() {
  const ref = useKeyboardInsetRef<HTMLDivElement>()
  return <div ref={ref} data-probe />
}

function renderProbe() {
  const { container, unmount } = render(<Probe />)
  const element = container.querySelector<HTMLElement>('[data-probe]')
  if (!element) {
    throw new Error('The probe did not render')
  }
  return {
    element,
    unmount,
    inset: () => element.style.getPropertyValue('--keyboard-inset'),
  }
}

describe('the keyboard’s share of the window', () => {
  it('is what the visual viewport leaves uncovered', () => {
    // A 800px layout window with a 500px visible area: 300px of keys.
    expect(keyboardInsetFrom(800, { height: 500, offsetTop: 0 })).toBe(300)
  })

  it('follows the page as it scrolls under a fixed keyboard', () => {
    // Scrolled 120px under the keys, the same window has 220px covered below
    // the visible area: the card has to climb by that much, not by the
    // keyboard's own height.
    expect(keyboardInsetFrom(800, { height: 500, offsetTop: 120 })).toBe(180)
  })

  it('is nothing when there is no keyboard, or nothing to measure', () => {
    expect(keyboardInsetFrom(800, { height: 800, offsetTop: 0 })).toBe(0)
    // A visual viewport taller than the layout one is not a keyboard.
    expect(keyboardInsetFrom(800, { height: 900, offsetTop: 0 })).toBe(0)
    // A browser with no visual viewport keeps the plain bottom edge.
    expect(keyboardInsetFrom(800, null)).toBe(0)
    expect(keyboardInsetFrom(800, undefined)).toBe(0)
  })
})

describe('useKeyboardInsetRef', () => {
  it('reads the keyboard on the way in, not on the first resize', () => {
    setLayoutHeight(800)
    stubVisualViewport(520)
    const { inset } = renderProbe()
    expect(inset()).toBe('280px')
  })

  it('opens and closes with the keyboard', () => {
    setLayoutHeight(800)
    const target = stubVisualViewport(800)
    const { inset } = renderProbe()
    expect(inset()).toBe('0px')

    Object.assign(window.visualViewport as object, { height: 480 })
    act(() => {
      target.dispatchEvent(new Event('resize'))
    })
    expect(inset()).toBe('320px')

    Object.assign(window.visualViewport as object, { height: 800 })
    act(() => {
      target.dispatchEvent(new Event('resize'))
    })
    expect(inset()).toBe('0px')
  })

  it('measures again when the page moves under the keys', () => {
    setLayoutHeight(800)
    const target = stubVisualViewport(500)
    const { inset } = renderProbe()
    expect(inset()).toBe('300px')

    Object.assign(window.visualViewport as object, { offsetTop: 200 })
    act(() => {
      target.dispatchEvent(new Event('scroll'))
    })
    expect(inset()).toBe('100px')
  })

  it('stops listening when it unmounts', () => {
    setLayoutHeight(800)
    const target = stubVisualViewport(800)
    const { unmount, inset } = renderProbe()
    expect(inset()).toBe('0px')

    unmount()
    Object.assign(window.visualViewport as object, { height: 400 })
    act(() => {
      target.dispatchEvent(new Event('resize'))
    })
    // The element outlives the listener here only so the assertion has something
    // to read: it was never told about the smaller viewport.
    expect(inset()).toBe('0px')
  })

  it('says zero where there is no visual viewport to follow', () => {
    setLayoutHeight(800)
    const { inset } = renderProbe()
    expect(inset()).toBe('0px')
  })
})
