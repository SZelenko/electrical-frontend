import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { panelContentJson } from '@/test/http'
import type { PanelContent } from '@/domain/panelContent'
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
    ).toEqual(['Немає.', 'Немає.'])
  })

  it('lists terminal blocks', () => {
    expect(render().text()).toContain('1 мод., клем: 4')
  })
})

describe('PanelSummary wires', () => {
  const lines = (c: PanelContent = content()) =>
    render(c)
      .findAll('section[aria-labelledby=sum-wires] li')
      .map((li) => li.text())

  it('describes a wire as "№N colour, section мм², from → to" with readable endpoints', () => {
    expect(lines()).toEqual([
      '№1 коричневий, 2.5 мм², вхідний кабель 1, провід 1 (коричневий) → апарат QF1, полюс 1 (вхід)',
      '№2 синій, 1.5 мм², клемний блок №1, клема 2 (ліворуч) → вихідний кабель 1, провід 1 (чорний)',
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
