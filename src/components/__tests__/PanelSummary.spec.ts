import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { panelContentJson } from '@/test/http'
import type { PanelContent } from '@/domain/panelContent'
import { applyLocale } from '@/i18n'
import PanelSummary from '../PanelSummary.vue'

const content = () => panelContentJson() as PanelContent
const render = (c: PanelContent = content()) =>
  mount(PanelSummary, { props: { content: c, shortCircuits: [] } })

describe('PanelSummary elements', () => {
  it('describes an element on its own line with ", " separators', () => {
    const items = render()
      .findAll('section[aria-labelledby=sum-rails] li li')
      .map((li) => li.text())
    expect(items).toContain('Автомат (QF1), 2 мод., полюсів: 2, увімкнено, транзитні полюси: 2')
  })

  it('does not put a space before a comma', () => {
    expect(render().text()).not.toContain(' ,')
  })

  it('describes a switched-off element without transit poles', () => {
    const c = content()
    const element = c.rails[0]!.elements[0]!
    element.on = false
    element.poles = [{ transit: false }]
    expect(render(c).text()).toContain('Автомат (QF1), 2 мод., полюсів: 1, вимкнено')
    expect(render(c).text()).not.toContain('транзитні')
  })

  it('shows the empty message for a rail without elements', () => {
    const c = content()
    c.rails[0]!.elements = []
    c.rails[0]!.terminalBlocks = []
    expect(
      render(c)
        .findAll('section[aria-labelledby=sum-rails] p')
        .map((p) => p.text()),
    ).toEqual(['Ширина рейок: 24 мод.', 'Немає.', 'Немає.'])
  })

  it('lists terminal blocks', () => {
    expect(render().text()).toContain('1 мод., клем: 4')
  })
})

describe('PanelSummary busbars and rail width', () => {
  it('shows the panel rail width and no busbar section without busbars', () => {
    const text = render().text()
    expect(text).toContain('Ширина рейок: 24 мод.')
    expect(text).not.toContain('Шини')
  })

  it('lists the busbars of a rail with type and device count', () => {
    const c = content()
    c.rails[0]!.busbars = [
      { id: 'b1', type: 'LN', colour: null, firstElementId: 'e1', count: 3 },
      { id: 'b2', type: 'L', colour: null, firstElementId: 'e1', count: 2 },
    ]
    const items = render(c)
      .findAll('section[aria-labelledby=sum-rails] h3')
      .map((h) => h.text())
    expect(items).toContain('Шини')
    expect(render(c).text()).toContain('Шина L+N: апаратів 3')
    expect(render(c).text()).toContain('Шина L: апаратів 2')
  })

  it('shows the cable label in guillemets next to the cable', () => {
    const c = content()
    c.inputCables[0]!.label = 'Ввід А'
    expect(render(c).text()).toContain('Кабель 1 «Ввід А»')
  })
})

describe('PanelSummary wires', () => {
  const lines = (c: PanelContent = content()) =>
    render(c)
      .findAll('section[aria-labelledby=sum-wires] li')
      .map((li) => li.text())

  it('describes a wire as "№N colour, section мм², from → to" with readable endpoints', () => {
    expect(lines()).toEqual([
      '№1 коричневий, 2,5 мм², вхідний кабель 1, провід 1 (коричневий) → апарат QF1, полюс 1 (вхід)',
      '№2 синій, 1,5 мм², клемний блок №1, клема 2 (ліворуч) → вихідний кабель 1, провід 1 (чорний)',
    ])
  })

  it('shows the wire count with the right plural', () => {
    expect(render().text()).toContain('2 проводи')
  })

  it('falls back to the raw id for an endpoint that no longer exists', () => {
    const c = content()
    c.wires[0]!.start = { kind: 'cableWire', cableWireId: 'ghost' }
    expect(lines(c)[0]).toContain('ghost → апарат QF1')
  })

  it('shows no wire lines for a panel without wires', () => {
    const c = content()
    c.wires = []
    expect(lines(c)).toEqual([])
    expect(render(c).text()).toContain('0 проводів')
  })
})

describe('PanelSummary busbar colour', () => {
  it.each([
    [null, 'сірий'],
    ['red', 'червоний'],
    ['green-yellow', 'жовто-зелений'],
  ] as const)('shows the busbar colour %s as "%s"', (colour, name) => {
    const c = content()
    c.rails[0]!.busbars = [{ id: 'b1', type: 'L', colour, firstElementId: 'e1', count: 2 }]
    expect(render(c).text()).toContain(`Шина L: апаратів 2, колір: ${name}`)
  })
})

describe('PanelSummary cable sides and terminal rows', () => {
  const section = (c: PanelContent, id: string) => render(c).get(`section[aria-labelledby=${id}]`)

  it.each([
    ['top', 'зверху'],
    ['bottom', 'знизу'],
    ['left', 'зліва'],
    ['right', 'справа'],
  ] as const)('names the side %s as "%s" for input and output cables', (side, name) => {
    const c = content()
    c.inputCableSide = side
    c.outputCableSide = side
    expect(section(c, 'sum-input').text()).toContain(`Розташування: ${name}`)
    expect(section(c, 'sum-output').text()).toContain(`Розташування: ${name}`)
  })

  it('shows the input and output side independently', () => {
    const c = content()
    c.inputCableSide = 'left'
    c.outputCableSide = 'right'
    expect(section(c, 'sum-input').text()).toContain('Розташування: зліва')
    expect(section(c, 'sum-input').text()).not.toContain('справа')
    expect(section(c, 'sum-output').text()).toContain('Розташування: справа')
  })

  it('has one section per terminal row with its own title', () => {
    const w = render()
    expect(w.get('#sum-row-top').text()).toBe('Верхній ряд клемників')
    expect(w.get('#sum-row-bottom').text()).toBe('Нижній ряд клемників')
    expect(w.find('#sum-row').exists()).toBe(false)
  })

  it('shows "Немає." for an empty row', () => {
    const w = render()
    expect(w.get('section[aria-labelledby=sum-row-top]').text()).toContain('Немає.')
    expect(w.get('section[aria-labelledby=sum-row-bottom]').text()).toContain('Немає.')
  })

  it("lists each row's blocks only in its own section", () => {
    const c = content()
    c.terminalRow = [
      { id: 'a', offsetModules: 0, widthModules: 2, terminalCount: 3, colour: null, label: 'PE' },
    ]
    c.bottomTerminalRow = [
      { id: 'b', offsetModules: 4, widthModules: 1, terminalCount: 2, colour: 'blue', label: 'N' },
    ]
    const top = section(c, 'sum-row-top').text()
    const bottom = section(c, 'sum-row-bottom').text()
    expect(top).toContain('PE: 2 мод., клем: 3, колір: сірий')
    expect(top).not.toContain('N:')
    expect(top).not.toContain('Немає.')
    expect(bottom).toContain('N: 1 мод., клем: 2, колір: синій')
    expect(bottom).not.toContain('PE')
    expect(bottom).not.toContain('Немає.')
  })

  it('an unlabelled row block is called "Клемник"', () => {
    const c = content()
    c.bottomTerminalRow = [
      { id: 'b', offsetModules: 0, widthModules: 1, terminalCount: 2, colour: null, label: '' },
    ]
    expect(section(c, 'sum-row-bottom').text()).toContain('Клемник: 1 мод., клем: 2')
  })
})

describe('PanelSummary number formatting by locale', () => {
  const withCrossSection = () => {
    const c = content()
    c.inputCables[0]!.crossSection = 2.5
    return c
  }

  it('shows the rating with Ukrainian units and a decimal comma', () => {
    expect(render(withCrossSection()).text()).toContain('230 В / 50 Гц / 2,5 мм²')
  })

  it('shows the rating with Latin units and a decimal point after the switch to English', async () => {
    const w = render(withCrossSection())
    applyLocale('en')
    await w.vm.$nextTick()
    expect(w.text()).toContain('230 V / 50 Hz / 2.5 mm²')
    expect(w.text()).not.toContain('2,5')
  })
})
