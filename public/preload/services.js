const { SolarDay, LunarDay, SolarTerm, LegalHoliday, SolarFestival, LunarFestival, PengZu, FetusDay } = require('tyme4ts')

// ============================================================
// 辅助函数
// ============================================================

/**
 * 解析日期字符串，返回 { year, month, day }，无效则返回今天
 */
function parseDate(dateStr) {
  if (dateStr) {
    const m = dateStr.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
    if (m) return { year: +m[1], month: +m[2], day: +m[3] }
  }
  const now = new Date()
  return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() }
}

/**
 * 日期加 N 天
 */
function addDays(year, month, day, n) {
  const d = new Date(year, month - 1, day)
  d.setDate(d.getDate() + n)
  return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() }
}

/**
 * 格式化日期为 YYYY-MM-DD
 */
function fmtDate(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

// 国际节日（tyme4ts 不包含，手动定义）
const internationalFestivals = {
  '2-14': '情人节',
  '4-1': '愚人节',
  '10-31': '万圣节',
  '11-11': '光棍节',
  '12-24': '平安夜',
  '12-25': '圣诞节',
}

/**
 * 动态计算的西方节日（母亲节、父亲节、感恩节）
 */
function getDynamicInternationalFestival(year, month, day) {
  // 母亲节：5月第二个星期日
  if (month === 5) {
    const firstDay = new Date(year, 4, 1).getDay()
    const motherDay = firstDay === 0 ? 8 : (14 - firstDay + 1)
    if (day === motherDay) return '母亲节'
  }
  // 父亲节：6月第三个星期日
  if (month === 6) {
    const firstDay = new Date(year, 5, 1).getDay()
    const fatherDay = firstDay === 0 ? 15 : (21 - firstDay + 1)
    if (day === fatherDay) return '父亲节'
  }
  // 感恩节：11月第四个星期四
  if (month === 11) {
    const firstDay = new Date(year, 10, 1).getDay()
    const thanksDay = firstDay <= 4 ? (22 + (4 - firstDay)) : (29 - firstDay + 4)
    if (day === thanksDay) return '感恩节'
  }
  return null
}

function getInternationalFestival(year, month, day) {
  const key = `${month}-${day}`
  return internationalFestivals[key] || getDynamicInternationalFestival(year, month, day)
}

// 节日简介
const festivalDescriptions = {
  '春节': '中华民族最隆重的传统佳节，象征团圆与新年新气象',
  '元宵节': '正月十五闹元宵，赏花灯、吃汤圆、猜灯谜',
  '龙头节': '二月二龙抬头，民间理发、祭龙祈雨的传统节日',
  '上巳节': '三月三踏青节，古时水边祓禊、曲水流觞的日子',
  '清明节': '扫墓祭祖、踏青郊游，缅怀先人的传统节日',
  '端午节': '五月初五纪念屈原，赛龙舟、吃粽子、挂艾草',
  '七夕节': '牛郎织女相会日，中国传统的情人节',
  '中元节': '七月十五祭祀祖先，民间俗称鬼节',
  '中秋节': '八月十五月圆人团圆，赏月、吃月饼',
  '重阳节': '九月初九登高望远，敬老爱老的传统节日',
  '寒衣节': '十月初一祭祀先人，送寒衣的民俗节日',
  '下元节': '十月十五祭祀祖先，道教水官解厄之日',
  '腊八节': '腊月初八喝腊八粥，年味渐浓的开始',
  '小年': '腊月廿三祭灶神，扫尘迎新年',
  '除夕': '一年最后一天，阖家团圆守岁迎新',
  '元旦': '公历新年第一天，世界多数国家的法定假日',
  '妇女节': '国际劳动妇女节，庆祝女性权益与成就',
  '植树节': '倡导植树造林，绿化祖国的纪念日',
  '劳动节': '国际劳动节，纪念全世界劳动人民的节日',
  '青年节': '纪念五四运动，中国青年的节日',
  '儿童节': '国际儿童节，保障儿童权益的纪念日',
  '建党节': '中国共产党成立纪念日',
  '建军节': '中国人民解放军建军纪念日',
  '教师节': '尊师重教，感恩教师的节日',
  '国庆节': '中华人民共和国成立纪念日',
  '情人节': '西方传统情人节，表达爱意的浪漫日子',
  '愚人节': '西方民间节日，相互开玩笑的欢乐日',
  '母亲节': '感恩母亲的节日，五月第二个星期日',
  '父亲节': '感恩父亲的节日，六月第三个星期日',
  '万圣节': '西方传统节日，孩子们装扮讨糖的狂欢夜',
  '光棍节': '源自中国的购物狂欢节，单身者的节日',
  '感恩节': '美国传统节日，家人团聚感恩的日子',
  '平安夜': '圣诞节前夕，西方重要的家庭团聚时刻',
  '圣诞节': '纪念耶稣诞生的西方重要节日',
}

// 节气简介
const solarTermDescriptions = {
  '立春': '春季开始，万物复苏，一年农事之始',
  '雨水': '降雨开始增多，气温回升，春耕备播',
  '惊蛰': '春雷始鸣，蛰虫惊醒，万物萌动',
  '春分': '昼夜平分，春暖花开，农耕繁忙',
  '清明': '天清气明，祭祖扫墓，踏青时节',
  '谷雨': '雨生百谷，播种移苗，春茶采摘',
  '立夏': '夏季开始，万物繁茂，农作物生长旺季',
  '小满': '麦类等夏熟作物籽粒开始饱满',
  '芒种': '有芒作物成熟，抢收抢种最忙时节',
  '夏至': '白昼最长，阳气至极，盛夏来临',
  '小暑': '天气开始炎热，但尚未到最热时候',
  '大暑': '一年中最热的时期，酷暑难耐',
  '立秋': '秋季开始，暑去凉来，收获季节',
  '处暑': '暑气渐消，秋意渐浓，早晚转凉',
  '白露': '天气转凉，露水凝结，秋高气爽',
  '秋分': '昼夜平分，秋色正浓，丰收时节',
  '寒露': '露气寒冷，秋深渐寒，菊花盛开',
  '霜降': '天气渐寒，初霜出现，深秋时节',
  '立冬': '冬季开始，万物收藏，准备过冬',
  '小雪': '开始降雪，但雪量不大，天气寒冷',
  '大雪': '降雪量增大，天寒地冻，银装素裹',
  '冬至': '白昼最短，数九寒天，吃饺子习俗',
  '小寒': '天气渐寒，但未到最冷，腊梅初放',
  '大寒': '一年中最冷时期，年关将至',
}

// 节日名称标准化
const festivalNameMap = {
  '清明': '清明节', '清明节': '清明节',
  '劳动节': '劳动节', '五一劳动节': '劳动节', '国际劳动节': '劳动节',
  '国庆节': '国庆节', '国庆': '国庆节',
  '端午节': '端午节', '端午': '端午节',
  '中秋节': '中秋节', '中秋': '中秋节',
  '春节': '春节',
  '元旦': '元旦', '元旦节': '元旦',
  '三八妇女节': '妇女节', '国际妇女节': '妇女节', '妇女节': '妇女节',
  '六一儿童节': '儿童节', '国际儿童节': '儿童节', '儿童节': '儿童节',
  '五四青年节': '青年节', '青年节': '青年节',
}

function normalizeName(name) {
  return festivalNameMap[name] || name
}

const weekDayNames = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']

/**
 * 收集某一天的所有节日
 */
function collectFestivals(year, month, day) {
  const solarDay = SolarDay.fromYmd(year, month, day)
  const lunarDay = solarDay.getLunarDay()
  const festivals = []
  const seen = new Set()

  const add = (name, type, extra) => {
    const n = normalizeName(name)
    if (seen.has(n)) return
    seen.add(n)
    const desc = festivalDescriptions[n] || solarTermDescriptions[n] || ''
    festivals.push({ name: n, type, description: desc, ...extra })
  }

  // 法定假日
  const legal = solarDay.getLegalHoliday()
  if (legal) {
    add(legal.getName(), 'legal', { is_work: legal.isWork() })
  }

  // 农历传统节日
  const lunarFest = lunarDay.getFestival()
  if (lunarFest) add(lunarFest.getName(), 'lunar')

  // 公历现代节日
  const solarFest = solarDay.getFestival()
  if (solarFest) add(solarFest.getName(), 'solar')

  // 节气
  const termDay = solarDay.getTermDay()
  if (termDay.getDayIndex() === 0) {
    add(termDay.getSolarTerm().getName(), 'term')
  }

  // 国际节日
  const intl = getInternationalFestival(year, month, day)
  if (intl) add(intl, 'international')

  return festivals
}

// ============================================================
// 工具注册
// ============================================================

/**
 * get_date_info — 完整日历信息
 */
utools.registerTool('get_date_info', async ({ date }) => {
  const { year, month, day } = parseDate(date)
  const solarDay = SolarDay.fromYmd(year, month, day)
  const lunarDay = solarDay.getLunarDay()
  const lunarMonth = lunarDay.getLunarMonth()
  const lunarYear = lunarMonth.getLunarYear()

  // 干支
  const yearCycle = lunarDay.getYearSixtyCycle()
  const monthCycle = lunarDay.getMonthSixtyCycle()
  const dayCycle = lunarDay.getSixtyCycle()

  // 节气
  const termDay = solarDay.getTermDay()
  const currentTerm = termDay.getSolarTerm()
  const nextTerm = currentTerm.next(1)
  const isTermDay = termDay.getDayIndex() === 0

  // 星期几
  const d = new Date(year, month - 1, day)
  const weekDay = weekDayNames[d.getDay()]

  // 节日
  const festivals = collectFestivals(year, month, day)

  return {
    solar_date: fmtDate(year, month, day),
    week_day: weekDay,
    lunar_year: `${yearCycle.getName()}年`,
    lunar_month: lunarMonth.getName(),
    lunar_day: lunarDay.getName(),
    lunar_date_full: `${lunarMonth.getName()}${lunarDay.getName()}`,
    zodiac: lunarYear.getSixtyCycle().getEarthBranch().getZodiac().getName(),
    gan_zhi: {
      year: yearCycle.getName(),
      month: monthCycle.getName(),
      day: dayCycle.getName(),
    },
    solar_term: isTermDay ? currentTerm.getName() : null,
    current_solar_term: currentTerm.getName(),
    next_solar_term: nextTerm.getName(),
    festivals,
  }
})

/**
 * get_almanac — 黄历宜忌
 */
utools.registerTool('get_almanac', async ({ date }) => {
  const { year, month, day } = parseDate(date)
  const solarDay = SolarDay.fromYmd(year, month, day)
  const lunarDay = solarDay.getLunarDay()
  const dayCycle = lunarDay.getSixtyCycle()

  // 彭祖百忌
  const pengZu = PengZu.fromSixtyCycle(dayCycle)
  const pengZuText = pengZu.getPengZuHeavenStem().getName() + ' ' + pengZu.getPengZuEarthBranch().getName()

  // 胎神方位
  const fetusDay = FetusDay.fromLunarDay(lunarDay)

  // 冲煞
  const earthBranch = dayCycle.getEarthBranch()
  const chongBranch = earthBranch.getOpposite()

  // 宜忌
  const recommends = lunarDay.getRecommends()
  const avoids = lunarDay.getAvoids()

  return {
    date: fmtDate(year, month, day),
    yi: recommends.map(t => t.getName()),
    ji: avoids.map(t => t.getName()),
    peng_zu: pengZuText,
    wu_xing: dayCycle.getSound().getName(),
    chong: `冲${chongBranch.getZodiac().getName()}`,
    sha: earthBranch.getOminous().getName(),
    tai_shen: fetusDay.getName(),
  }
})

/**
 * get_festivals — 日期范围内的节日
 */
utools.registerTool('get_festivals', async ({ start_date, end_date }) => {
  const start = parseDate(start_date)
  let end
  if (end_date) {
    const m = end_date.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
    if (m) end = { year: +m[1], month: +m[2], day: +m[3] }
  }
  if (!end) end = addDays(start.year, start.month, start.day, 30)

  const results = []
  let cur = { ...start }
  const endTs = new Date(end.year, end.month - 1, end.day).getTime()

  while (new Date(cur.year, cur.month - 1, cur.day).getTime() <= endTs) {
    const festivals = collectFestivals(cur.year, cur.month, cur.day)
    if (festivals.length > 0) {
      // 计算距今天数
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const target = new Date(cur.year, cur.month - 1, cur.day)
      const diff = Math.round((target - today) / 86400000)

      results.push({
        date: fmtDate(cur.year, cur.month, cur.day),
        days_from_today: diff,
        festivals,
      })
    }
    cur = addDays(cur.year, cur.month, cur.day, 1)
  }

  return { start_date: fmtDate(start.year, start.month, start.day), end_date: fmtDate(end.year, end.month, end.day), total: results.length, results }
})

/**
 * search_next_festival — 查找下一个指定节日
 */
utools.registerTool('search_next_festival', async ({ festival_name }) => {
  if (!festival_name) throw new Error('必须提供 festival_name 参数')

  const keyword = festival_name.trim()
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  for (let i = 0; i <= 400; i++) {
    const d = new Date(today)
    d.setDate(d.getDate() + i)
    const year = d.getFullYear()
    const month = d.getMonth() + 1
    const day = d.getDate()

    const festivals = collectFestivals(year, month, day)
    const match = festivals.find(f => f.name.includes(keyword) || keyword.includes(f.name))

    if (match) {
      return {
        found: true,
        festival_name: match.name,
        type: match.type,
        description: match.description,
        date: fmtDate(year, month, day),
        week_day: weekDayNames[d.getDay()],
        days_from_today: i,
        countdown: i === 0 ? '就是今天' : i === 1 ? '明天' : `还有${i}天`,
      }
    }
  }

  return { found: false, message: `未来400天内未找到名称包含「${keyword}」的节日或节气` }
})

// ============================================================
// 十二时辰吉凶
// ============================================================

const shichenNames = ['子时', '丑时', '寅时', '卯时', '辰时', '巳时', '午时', '未时', '申时', '酉时', '戌时', '亥时']
const shichenTimeRanges = ['23:00-01:00', '01:00-03:00', '03:00-05:00', '05:00-07:00', '07:00-09:00', '09:00-11:00', '11:00-13:00', '13:00-15:00', '15:00-17:00', '17:00-19:00', '19:00-21:00', '21:00-23:00']
const twelveGods = ['青龙', '明堂', '天刑', '朱雀', '金匮', '天德', '白虎', '玉堂', '天牢', '玄武', '司命', '勾陈']
const yellowRoadGods = new Set(['青龙', '明堂', '金匮', '天德', '玉堂', '司命'])

/**
 * get_shichen — 十二时辰吉凶
 */
utools.registerTool('get_shichen', async ({ date }) => {
  const { year, month, day } = parseDate(date)
  const solarDay = SolarDay.fromYmd(year, month, day)
  const lunarDay = solarDay.getLunarDay()
  // getHours() 可能返回13项（早子时+晚子时），只取前12个标准时辰
  const hours = lunarDay.getHours().slice(0, 12)

  const dayBranchIndex = lunarDay.getSixtyCycle().getEarthBranch().getIndex()
  const godStartIndex = dayBranchIndex % 6

  // 当前时辰（仅查询今天时有意义）
  const now = new Date()
  const isToday = year === now.getFullYear() && month === now.getMonth() + 1 && day === now.getDate()
  const currentHour = now.getHours()
  const currentIdx = isToday ? (currentHour >= 23 || currentHour < 1 ? 0 : Math.floor((currentHour + 1) / 2)) : -1

  const result = hours.map((hour, i) => {
    const godIndex = (godStartIndex + i) % 12
    const god = twelveGods[godIndex]
    const isYellowRoad = yellowRoadGods.has(god)

    return {
      name: shichenNames[i],
      time_range: shichenTimeRanges[i],
      gan_zhi: hour.getSixtyCycle().getName(),
      god,
      luck: isYellowRoad ? '吉' : '凶',
      is_yellow_road: isYellowRoad,
      is_current: i === currentIdx,
      yi: hour.getRecommends().map(t => t.getName()),
      ji: hour.getAvoids().map(t => t.getName()),
    }
  })

  return {
    date: fmtDate(year, month, day),
    lunar_date: `${lunarDay.getLunarMonth().getName()}${lunarDay.getName()}`,
    day_gan_zhi: lunarDay.getSixtyCycle().getName(),
    current_shichen: currentIdx >= 0 ? shichenNames[currentIdx] : null,
    hours: result,
  }
})
