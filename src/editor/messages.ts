import type { Rejection } from '@/domain/commands'
import { pluralUk } from '@/domain/panelContent'

const LIMIT_TEXT: Record<string, string> = {
  rails: 'Досягнуто ліміт: не більше 8 рейок',
  'input cables': 'Досягнуто ліміт: не більше 20 вхідних кабелів',
  'output cables': 'Досягнуто ліміт: не більше 100 вихідних кабелів',
  'cable wires': 'Кабель може мати не більше 4 проводів',
  wires: 'Досягнуто ліміт: не більше 5000 проводів',
  bends: 'Досягнуто ліміт зламів проводу',
  'row blocks': 'Досягнуто ліміт: не більше 60 клемників у рядку',
  'row terminals': 'Клемник у рядку має не більше 60 клем',
  'rail terminals': 'Клемний блок на рейці має не більше 12 клем',
  coordinates: 'Схема виходить за допустимі розміри (до 99999,9 мм)',
}

const TEXT: Record<Exclude<Rejection, 'limit'>, string> = {
  invalidSize: 'Некоректний розмір або позиція',
  negativeOffset: 'Позиція поза межами',
  outOfRail: 'Не вміщується на рейці',
  overlap: 'Місце зайняте іншим елементом',
  tooNarrowForPoles: 'Забагато полюсів для такої ширини (до 4 на модуль)',
  tooNarrowForAts: 'АВР має займати щонайменше 2 модулі',
  outOfRow: 'Не вміщується в рядок клемників (60 модулів)',
  railTooNarrow: 'Рейка не може бути вужчою за розміщені на ній елементи',
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
