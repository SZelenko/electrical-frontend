import type { Rejection } from '@/domain/commands'
import type { BusbarIssueKind } from '@/domain/busbars'
import { pluralUk } from '@/domain/panelContent'

const LIMIT_TEXT: Record<string, string> = {
  rails: 'Досягнуто ліміт: не більше 8 рейок',
  'input cables': 'Досягнуто ліміт: не більше 20 вхідних кабелів',
  'output cables': 'Досягнуто ліміт: не більше 100 вихідних кабелів',
  'cable wires': 'Кабель може мати не більше 4 проводів',
  wires: 'Досягнуто ліміт: не більше 5000 проводів',
  bends: 'Досягнуто ліміт зламів проводу',
  'row blocks': 'Досягнуто ліміт: не більше 60 клемників у ряду',
  'row terminals': 'Клемник у ряду має не більше 60 клем',
  'rail terminals': 'Клемний блок на рейці має не більше 12 клем',
  busbars: 'Досягнуто ліміт: не більше 30 шин на рейці',
  coordinates: 'Схема виходить за допустимі розміри (до 99999,9 мм)',
}

const TEXT: Record<Exclude<Rejection, 'limit'>, string> = {
  invalidSize: 'Некоректний розмір або позиція',
  negativeOffset: 'Позиція поза межами',
  outOfRail: 'Не вміщується на рейці',
  overlap: 'Місце зайняте іншим елементом',
  tooNarrowForPoles: 'Забагато полюсів для такої ширини (до 4 на модуль)',
  tooNarrowForAts: 'АВР має займати щонайменше 2 модулі',
  outOfRow: 'Не вміщується в ряд клемників (ширина ряду дорівнює ширині рейок)',
  railTooNarrow: 'Рейки не можуть бути вужчими за розміщені на них елементи',
  rowOverflow: 'Клемники в ряду не вміщуються: зменште їх кількість або збільште ширину рейок',
  rowNoRoom: 'В іншому ряду немає вільного місця',
  busbarNoRoom: 'Для шини потрібен апарат і щонайменше один вільний суміжний апарат праворуч',
  busbarRange: 'Шина може охоплювати від 2 апаратів до суміжних вільних апаратів праворуч',
  notFound: 'Елемент не знайдено',
  duplicateId: 'Такий ідентифікатор уже існує',
  invalid: 'Некоректне значення',
  lastInputCable: 'Не можна видалити останній вхідний кабель',
  lastCableWire: 'Не можна видалити останній провід кабелю',
  sameTerminal: 'Обидва кінці проводу в одній точці',
  readOnly: 'Щит доступний лише для читання',
}

export function rejectionText(reason: Rejection, detail?: string): string {
  if (reason === 'limit') return (detail && LIMIT_TEXT[detail]) || 'Досягнуто ліміт'
  return TEXT[reason]
}

export function removedWiresText(n: number): string {
  return `Видалено ${n} ${pluralUk(n, 'провід', 'проводи', 'проводів')}`
}

const BUSBAR_ISSUE_TEXT: Record<BusbarIssueKind, string> = {
  type: 'Некоректний тип шини',
  anchorMissing: 'Шина прив’язана до апарата, якого немає на цій рейці',
  anchorAts: 'Шину не можна прив’язати до АВР',
  count: 'Кількість апаратів шини має бути від 2 до 60',
  tooFew: 'Праворуч немає стільки апаратів, скільки охоплює шина',
  notDevice: 'На шляху шини АВР або клемний блок',
  gap: 'Між апаратами шини є вільні модулі',
  mixedSwap: 'Апарати шини мають різне розташування входів і виходів',
  overlap: 'Апарат уже охоплений іншою шиною',
}

export function busbarIssueText(kind: BusbarIssueKind): string {
  return BUSBAR_ISSUE_TEXT[kind]
}
