import { beforeEach } from 'vitest'
import { i18n } from '@/i18n'

// Tests run in Ukrainian (the reference locale) unless a test is about another language.
i18n.global.locale.value = 'uk'
beforeEach(() => {
  i18n.global.locale.value = 'uk'
})
