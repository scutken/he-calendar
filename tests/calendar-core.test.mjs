import test from 'node:test'
import assert from 'node:assert/strict'
import {
  parseDate,
  addDays,
  fmtDate,
  getFestivals,
  searchNextFestival,
} from '../src/shared/calendar-core.js'

test('日期参数严格遵循 YYYY-MM-DD，避免工具声明与结果不一致', () => {
  assert.deepEqual(parseDate('2026-04-01'), { year: 2026, month: 4, day: 1 })
  for (const value of ['2026-4-01', '2026-04-1', '', '   ', 20260401, {}]) {
    assert.throws(() => parseDate(value), /YYYY-MM-DD/)
  }
  assert.throws(() => parseDate('2026-02-30'), /日期不存在/)
})

test('节日查询拒绝倒置区间，避免把参数错误伪装成空结果', () => {
  assert.throws(
    () => getFestivals({ start_date: '2026-11-10', end_date: '2026-11-09' }),
    /结束日期不能早于起始日期/,
  )
  assert.throws(
    () => getFestivals({ start_date: '2026-01-01', end_date: '' }),
    /YYYY-MM-DD/,
  )
})

test('节日查询允许含首尾在内的 400 天，超过则快速失败', () => {
  const start = { year: 2026, month: 1, day: 1 }
  const lastAllowed = addDays(start.year, start.month, start.day, 399)
  const result = getFestivals({
    start_date: fmtDate(start.year, start.month, start.day),
    end_date: fmtDate(lastAllowed.year, lastAllowed.month, lastAllowed.day),
  })
  assert.equal(result.end_date, fmtDate(lastAllowed.year, lastAllowed.month, lastAllowed.day))

  const firstRejected = addDays(start.year, start.month, start.day, 400)
  assert.throws(
    () => getFestivals({
      start_date: fmtDate(start.year, start.month, start.day),
      end_date: fmtDate(firstRejected.year, firstRejected.month, firstRejected.day),
    }),
    /最多查询 400 天/,
  )
})

test('空白节日名必须报错，不能退化成匹配任意节日', () => {
  for (const value of ['', '   ', null, 1]) {
    assert.throws(() => searchNextFestival({ festival_name: value }), /非空/)
  }
  assert.equal(searchNextFestival({ festival_name: '中秋' }).found, true)
})
