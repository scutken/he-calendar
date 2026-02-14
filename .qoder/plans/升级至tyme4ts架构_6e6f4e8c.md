# 升级至 tyme4ts 架构方案

## 1. 依赖更新

**文件**: `package.json`

```diff
- "lunar-javascript": "^1.7.7"
+ "tyme4ts": "^latest"
```

执行 `npm install tyme4ts` 安装新依赖，移除旧依赖。

---

## 2. 核心导入替换

**文件**: `src/Calendar/index.vue`

将原有导入：
```javascript
import { Solar, Lunar, HolidayUtil } from 'lunar-javascript';
```

替换为：
```javascript
import { SolarDay, LunarDay, SolarTerm } from 'tyme4ts';
```

---

## 3. 节日系统重构

### 3.1 新增节日分类开关

在现有节日开关基础上，细化为四类：
- `showLegalHolidays` - 法定假日（元旦、春节、清明、劳动、端午、中秋、国庆）
- `showSolarFestivals` - 公历现代节日（妇女节、植树节、青年节、儿童节等）
- `showLunarFestivals` - 农历传统节日（春节、元宵、端午、中秋、重阳等）
- `showWesternFestivals` - 西方节日（情人节、万圣节、圣诞节等）

### 3.2 西方节日数据保留

保留现有 `westernFestivals` 对象和 `getDynamicWesternFestival` 函数，因为 tyme4ts 不包含西方节日数据。

---

## 4. 日历数据生成逻辑重构

**函数**: `calendarDays` computed

核心逻辑变更：

```javascript
const calendarDays = computed(() => {
  // ... 循环生成日期
  for (let i = 0; i < 42; i++) {
    const date = start.add(i, 'day');
    
    // 新 API 调用方式
    const solarDay = SolarDay.fromYmd(date.year(), date.month() + 1, date.date());
    const lunarDay = solarDay.getLunarDay();
    
    // 法定假日
    const legalHoliday = showLegalHolidays.value ? solarDay.getLegalHoliday() : null;
    
    // 公历现代节日
    const solarFestival = showSolarFestivals.value ? solarDay.getFestival() : null;
    
    // 农历传统节日
    const lunarFestivals = showLunarFestivals.value ? lunarDay.getFestivals() : [];
    
    // 西方节日（保留现有逻辑）
    const westernFestival = showWesternFestivals.value 
      ? getWesternFestival(date.year(), date.month() + 1, date.date()) 
      : null;
    
    // 节气
    const solarTerm = showSolarTerms.value ? solarDay.getTerm() : null;
    
    // ... 组装数据
  }
});
```

---

## 5. 黄历信息重构

**函数**: `almanacInfo` computed

适配新 API：

```javascript
const almanacInfo = computed(() => {
  const date = selectedDate.value;
  const solarDay = SolarDay.fromYmd(date.year(), date.month() + 1, date.date());
  const lunarDay = solarDay.getLunarDay();
  
  // 获取干支信息
  const sixtyCycle = lunarDay.getSixtyCycle(); // 日干支
  
  return {
    solarDate: date.format('YYYY年MM月DD日'),
    weekDay: '星期' + baseWeekDays[date.day()],
    lunarDate: lunarDay.toString(),
    ganZhi: `${lunarDay.getLunarMonth().getLunarYear().getSixtyCycle().getName()}年 ...`,
    yi: lunarDay.getRecommends(), // 宜
    ji: lunarDay.getAvoids(),     // 忌
    // ... 其他黄历信息
  };
});
```

---

## 6. 节气主题函数重构

**函数**: `getCurrentSolarTerm`

```javascript
const getCurrentSolarTerm = () => {
  const solarDay = SolarDay.fromYmd(
    new Date().getFullYear(),
    new Date().getMonth() + 1,
    new Date().getDate()
  );
  const term = solarDay.getTerm();
  // 获取当前节气或上一个节气
  return term ? term.getName() : '立春';
};
```

---

## 7. 设置面板更新

更新设置面板中的节日显示选项，从原有的 2 个选项扩展为 4 个：

```html
<label class="toggle-item">
  <input type="checkbox" :checked="showLegalHolidays" @change="toggleLegalHolidays" />
  <span class="toggle-label">法定假日</span>
</label>
<label class="toggle-item">
  <input type="checkbox" :checked="showSolarFestivals" @change="toggleSolarFestivals" />
  <span class="toggle-label">公历现代节日</span>
</label>
<label class="toggle-item">
  <input type="checkbox" :checked="showLunarFestivals" @change="toggleLunarFestivals" />
  <span class="toggle-label">农历传统节日</span>
</label>
<label class="toggle-item">
  <input type="checkbox" :checked="showWesternFestivals" @change="toggleWesternFestivals" />
  <span class="toggle-label">西方节日</span>
</label>
```

---

## 8. 实施步骤

1. **安装依赖**: `npm i tyme4ts && npm uninstall lunar-javascript`
2. **更新导入语句**: 替换 import
3. **重构节日开关**: 添加新的 ref 和存储逻辑
4. **重构日历生成**: 更新 calendarDays computed
5. **重构黄历信息**: 更新 almanacInfo computed
6. **重构节气获取**: 更新 getCurrentSolarTerm
7. **更新设置面板**: 添加新的节日选项
8. **测试验证**: 确保所有功能正常工作

---

## 注意事项

- tyme4ts API 中方法名采用驼峰命名，与 lunar-javascript 略有差异
- 西方节日需保留现有手动定义逻辑，tyme4ts 不提供此数据
- 法定假日数据可能需要根据年份更新，tyme4ts 提供基础数据
- 某些黄历详细信息（如彭祖百忌、胎神方位）需确认 tyme4ts 是否支持