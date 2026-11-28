import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { normalizeContent } from '@/api/panels'
import { checkShortCircuits, shortCircuitWireIds } from '../shortCircuit'
import { endpointKey } from '../panelContent'
import { validateContent } from '../validateContent'
import {
  block,
  content,
  cw,
  element,
  id,
  inputCable,
  outputCable,
  panelWire,
  pole,
  rail,
  term,
} from './helpers'

interface FixtureCase {
  name: string
  panel: Parameters<typeof normalizeContent>[0]
  expected: {
    valid: boolean
    groups?: { sources: string[]; wireIds: string[] }[]
    violations?: string[]
  }
}
const file = resolve(process.cwd(), '../shared/fixtures/short-circuit-cases.json')
const cases = (JSON.parse(readFileSync(file, 'utf8')) as { cases: FixtureCase[] }).cases
const valid = cases.filter((c) => c.expected.valid)

describe('shared fixture: strict reading', () => {
  it('contains the required minimum set of cases', () => {
    const names = cases.map((c) => c.name)
    for (const required of [
      'bridged_wires_of_one_input_cable',
      'two_input_cables_via_terminal_bar',
      'off_element_blocks_non_transit_pole',
      'off_element_conducts_through_transit_pole',
      'off_element_with_transit_neutral_phase_switched_no_short',
      'output_cable_wire_joins_two_sources',
      'output_cable_wire_alone_no_short',
      'chain_through_two_terminal_blocks',
      'unwired_panel',
      'single_input_wire_in_large_group_no_short',
      'sides_swapped_does_not_change_result_on',
      'sides_swapped_does_not_change_result_off',
      'wire_with_both_ends_on_the_same_terminal_is_rejected',
      'two_independent_short_circuits',
      'three_sources_through_a_one_terminal_block',
      'separate_terminal_blocks_do_not_join',
      'poles_of_one_element_are_independent',
      'two_elements_in_series_both_on_short',
      'two_elements_in_series_second_off_no_short',
      'ats_state_a_sources_on_in0_and_in2_no_short',
      'ats_state_b_sources_on_in0_and_in2_no_short',
      'ats_state_off_sources_on_in0_and_in2_no_short',
      'ats_state_a_external_wire_out0_to_in2_short',
      'ats_state_b_out0_to_out1_wire_short',
      'ats_sides_swapped_does_not_change_result',
      'row_block_bar_joins_two_sources_short',
      'row_block_top_and_bottom_of_one_contact_are_one_node',
      'rail_block_left_and_right_of_one_contact_are_one_node',
      'ats_output_pole_index_2_is_rejected',
      'ats_with_poles_is_rejected',
      'ats_width_1_is_rejected',
      'rail_block_13_contacts_is_rejected',
      'row_block_wrong_width_is_rejected',
      'contact_side_top_on_a_rail_block_is_rejected',
      'row_contact_top_to_bottom_same_node_is_rejected',
      'busbar_l_joins_covered_pole0_inputs_short',
      'busbar_l_feed_and_covered_input_short',
      'busbar_ln_sources_on_l_and_n_no_short',
      'busbar_ln_wire_between_feeds_short',
      'busbar_ln_one_pole_device_neutral_not_joined_no_short',
      'busbar_four_pole_device_pole2_never_joined_no_short',
      'busbar_four_pole_device_pole1_joined_to_feed_n_short',
      'busbar_device_off_feed_l_vs_pole0_output_no_short',
      'busbar_device_on_feed_l_vs_pole0_output_short',
      'busbar_all_sides_swapped_same_result_short',
      'busbar_does_not_cover_device_beyond_count_no_short',
      'busbar_l_feed_index_1_is_rejected',
      'busbar_count_beyond_the_rail_items_is_rejected',
      'bottom_row_block_bar_joins_two_sources_short',
      'both_terminal_rows_same_offset_and_index_no_false_join',
      'top_and_bottom_row_blocks_joined_by_wire_short',
      'bottom_row_block_wrong_width_is_rejected',
      'bottom_row_block_past_rail_width_is_rejected',
      'block_id_shared_by_both_rows_is_rejected',
      'bottom_row_block_with_left_contact_side_is_rejected',
      'cable_sides_left_and_right_do_not_change_the_check',
    ]) {
      expect(names).toContain(required)
    }
  })

  it('case names are unique', () => {
    expect(new Set(cases.map((c) => c.name)).size).toBe(cases.length)
  })

  it.each(valid.map((c) => [c.name, c] as const))(
    '%s: groups match in count and order (sorted by first source), members as sets',
    (_n, c) => {
      const groups = checkShortCircuits(normalizeContent(c.panel))
      const wanted = c.expected.groups ?? []
      expect(groups).toHaveLength(wanted.length)
      groups.forEach((g, i) => {
        expect([...g.sources].sort()).toEqual([...(wanted[i]?.sources ?? [])].sort())
        expect([...g.wireIds].sort()).toEqual([...(wanted[i]?.wireIds ?? [])].sort())
        expect(g.sources).toEqual([...g.sources].sort())
        expect(g.wireIds).toEqual([...g.wireIds].sort())
      })
      expect(groups.map((g) => g.sources[0])).toEqual(
        [...groups.map((g) => g.sources[0] as string)].sort(),
      )
    },
  )

  it.each(valid.map((c) => [c.name, c] as const))(
    '%s: every group lists the endpoints of its wires exactly once',
    (_n, c) => {
      const normalized = normalizeContent(c.panel)
      for (const g of checkShortCircuits(normalized)) {
        const keys = g.terminals.map(endpointKey)
        expect(new Set(keys).size).toBe(keys.length)
        expect(keys).toEqual([...keys].sort())
        const expected = new Set(
          normalized.wires
            .filter((w) => g.wireIds.includes(w.id))
            .flatMap((w) => [endpointKey(w.start), endpointKey(w.end)]),
        )
        expect(new Set(keys)).toEqual(expected)
      }
    },
  )

  it('every valid fixture case is also valid content for the client validator', () => {
    for (const c of valid) expect(validateContent(normalizeContent(c.panel))).toEqual([])
  })
})

describe('shared fixture: invalid cases', () => {
  const invalid = cases.filter((c) => !c.expected.valid)

  it('there are invalid cases', () => expect(invalid.length).toBeGreaterThan(0))

  it.each(invalid.map((c) => [c.name, c] as const))(
    '%s: the client validator reports exactly the expected property paths',
    (_n, c) => {
      const paths = validateContent(normalizeContent(c.panel)).map((v) => v.propertyPath)
      expect([...new Set(paths)].sort()).toEqual([...(c.expected.violations ?? [])].sort())
    },
  )
})

describe('checkShortCircuits: extra cases', () => {
  const brown = id(2)
  const blue = id(3)

  it('lists terminals sorted by node key (p < t < w), each once', () => {
    const c = content({
      inputCables: [inputCable(1, [2, 3])],
      rails: [rail(10, 24, 150, [element(20, 0, 1, 1)], [block(40, 4, 1, 2)])],
      wires: [
        panelWire(30, cw(brown), pole(id(20), 0, 'input')),
        panelWire(31, pole(id(20), 0, 'output'), term(id(40), 0)),
        panelWire(32, term(id(40), 1), cw(blue)),
      ],
    })
    const [group] = checkShortCircuits(c)
    expect(group?.sources).toEqual([brown, blue])
    expect(group?.wireIds).toEqual([id(30), id(31), id(32)])
    expect(group?.terminals).toEqual([
      pole(id(20), 0, 'input'),
      pole(id(20), 0, 'output'),
      // a group lists terminals without the contact side
      { kind: 'terminal', terminalBlockId: id(40), terminalIndex: 0 },
      { kind: 'terminal', terminalBlockId: id(40), terminalIndex: 1 },
      cw(brown),
      cw(blue),
    ])
  })

  it('a terminal used by two wires is listed once', () => {
    const c = content({
      inputCables: [inputCable(1, [2, 3])],
      rails: [rail(10, 24, 150, [], [block(40, 0, 1, 1)])],
      wires: [panelWire(30, cw(brown), term(id(40), 0)), panelWire(31, cw(blue), term(id(40), 0))],
    })
    const [group] = checkShortCircuits(c)
    expect(group?.terminals.filter((t) => t.kind === 'terminal')).toHaveLength(1)
    expect(group?.wireIds).toEqual([id(30), id(31)])
  })

  it('a wire is assigned to its group by the root of its start endpoint', () => {
    const c = content({
      inputCables: [inputCable(1, [2, 3])],
      rails: [rail(10, 24, 150, [], [block(40, 0, 2, 3)])],
      wires: [
        panelWire(30, cw(brown), term(id(40), 0)),
        panelWire(31, term(id(40), 2), cw(blue)),
        panelWire(32, term(id(40), 1), term(id(40), 0)), // a loop inside the bar adds a wire, not a source
      ],
    })
    const groups = checkShortCircuits(c)
    expect(groups).toHaveLength(1)
    expect(groups[0]?.wireIds).toEqual([id(30), id(31), id(32)])
  })

  it('wires of the other cable are not dragged in when they belong to no short circuit', () => {
    const c = content({
      inputCables: [inputCable(1, [2, 3]), inputCable(4, [5])],
      outputCables: [outputCable(6, [7])],
      wires: [panelWire(30, cw(brown), cw(blue)), panelWire(31, cw(id(5)), cw(id(7)))],
    })
    const groups = checkShortCircuits(c)
    expect(groups).toHaveLength(1)
    expect(groups[0]?.wireIds).toEqual([id(30)])
  })

  it('a pole joins its own terminals only: two sources on different poles of an element that is on', () => {
    const c = content({
      inputCables: [inputCable(1, [2, 3])],
      rails: [rail(10, 24, 150, [element(20, 0, 1, 2)])],
      wires: [
        panelWire(30, cw(brown), pole(id(20), 0, 'input')),
        panelWire(31, cw(blue), pole(id(20), 1, 'input')),
      ],
    })
    expect(checkShortCircuits(c)).toEqual([])
  })

  it('an element that is off still conducts through exactly its transit poles', () => {
    const off = element(20, 0, 1, 2, { on: false, poles: [{ transit: true }, { transit: false }] })
    const wires = (pi: number) => [
      panelWire(30, cw(brown), pole(id(20), pi, 'input')),
      panelWire(31, pole(id(20), pi, 'output'), cw(blue)),
    ]
    const make = (pi: number) =>
      content({
        inputCables: [inputCable(1, [2, 3])],
        rails: [rail(10, 24, 150, [off])],
        wires: wires(pi),
      })
    expect(checkShortCircuits(make(0))).toHaveLength(1)
    expect(checkShortCircuits(make(1))).toEqual([])
  })

  it('a long chain of 2000 elements does not overflow the stack and is one group', () => {
    const n = 2000
    const elements = Array.from({ length: n }, (_, i) => element(1000 + i, i, 1, 1))
    const wires = [
      panelWire(5000, cw(brown), pole(id(1000), 0, 'input')),
      ...Array.from({ length: n - 1 }, (_, i) =>
        panelWire(5001 + i, pole(id(1000 + i), 0, 'output'), pole(id(1001 + i), 0, 'input')),
      ),
      panelWire(9000, pole(id(1000 + n - 1), 0, 'output'), cw(blue)),
    ]
    const groups = checkShortCircuits(
      content({
        inputCables: [inputCable(1, [2, 3])],
        rails: [rail(10, 2000, 150, elements)],
        wires,
      }),
    )
    expect(groups).toHaveLength(1)
    expect(groups[0]?.wireIds).toHaveLength(n + 1)
  })

  it('does not mutate the content', () => {
    const c = content({
      inputCables: [inputCable(1, [2, 3])],
      wires: [panelWire(30, cw(brown), cw(blue))],
    })
    const snapshot = structuredClone(c)
    checkShortCircuits(c)
    expect(c).toEqual(snapshot)
  })

  it('ignores a wire whose endpoint does not exist instead of throwing', () => {
    const c = content({
      inputCables: [inputCable(1, [2, 3])],
      wires: [panelWire(30, cw(brown), pole(id(99), 0, 'input'))],
    })
    expect(checkShortCircuits(c)).toEqual([])
  })
})

describe('shortCircuitWireIds / endpointKey', () => {
  it('unions the wire ids of all groups', () => {
    const ids = shortCircuitWireIds([
      { sources: ['a', 'b'], wireIds: ['w1', 'w2'], terminals: [] },
      { sources: ['c', 'd'], wireIds: ['w2', 'w3'], terminals: [] },
    ])
    expect([...ids].sort()).toEqual(['w1', 'w2', 'w3'])
  })
  it('is empty for no groups', () => expect(shortCircuitWireIds([]).size).toBe(0))

  it.each([
    [pole('e', 2, 'output'), 'p:e:2:output'],
    [pole('e', 0, 'input'), 'p:e:0:input'],
    [term('b', 3), 't:b:3'],
    [cw('x'), 'w:x'],
  ])('endpointKey(%j) = %s (the backend node key)', (endpoint, key) => {
    expect(endpointKey(endpoint)).toBe(key)
  })
})
