import { beforeEach, vi } from 'vitest'
import { i18n } from '@/i18n'

// jsdom lacks what Vuetify uses.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
class IntersectionObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return []
  }
}
// `vi.unstubAllGlobals()` in a spec removes them, so they are stubbed again before every test.
function stubBrowserApis() {
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
  vi.stubGlobal('IntersectionObserver', IntersectionObserverStub)
  vi.stubGlobal('visualViewport', {
    width: 1280,
    height: 720,
    offsetLeft: 0,
    offsetTop: 0,
    scale: 1,
    addEventListener() {},
    removeEventListener() {},
  })
}
stubBrowserApis()
if (typeof window !== 'undefined') {
  window.matchMedia ??= (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList
}

// Tests run in Ukrainian (the reference locale) unless a test is about another language.
i18n.global.locale.value = 'uk'
beforeEach(() => {
  stubBrowserApis()
  i18n.global.locale.value = 'uk'
})
