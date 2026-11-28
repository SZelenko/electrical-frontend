import { describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import { useLocale } from 'vuetify'
import { i18n } from '@/i18n'
import { mountPlugins } from '@/test/mountWithPlugins'

/** Vuetify's own texts (`$vuetify.*`) follow the vue-i18n locale. */
function vuetifyText(key: string) {
  let text = ''
  mountPlugins(
    defineComponent({
      setup() {
        const { t } = useLocale()
        text = t(key)
        return () => h('div')
      },
    }),
  )
  return text
}

describe('Vuetify strings follow the app locale', () => {
  it('uses the Ukrainian Vuetify messages in uk', () => {
    expect(vuetifyText('$vuetify.close')).toBe('Закрити')
  })

  it('switches to the English ones with the locale', () => {
    i18n.global.locale.value = 'en'
    expect(vuetifyText('$vuetify.close')).toBe('Close')
  })

  it('keeps the Vuetify messages in their own $vuetify namespace', () => {
    expect(Object.keys(i18n.global.getLocaleMessage('uk'))).toContain('$vuetify')
  })
})
