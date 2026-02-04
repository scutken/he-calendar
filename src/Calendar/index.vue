<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import dayjs from 'dayjs';
import { Solar, Lunar, HolidayUtil } from 'lunar-javascript';
import { ChevronLeft, ChevronRight, Palette, Settings, Github, ExternalLink, User, Sun, Moon, Monitor } from 'lucide-vue-next';
import { projectConfig } from '../config';

const props = defineProps(['enterAction']);

const currentMonth = ref(dayjs());
const selectedDate = ref(dayjs());
const currentTheme = ref('auto'); // 默认为智能主题
const showYearPicker = ref(false);
const showMonthPicker = ref(false);
const showThemePicker = ref(false);
const showSettings = ref(false);
// 统一的存储工具函数，优先使用 uTools dbStorage，降级到 localStorage
const getStorageItem = (key, defaultValue) => {
  if (window.utools && window.utools.dbStorage) {
    const value = window.utools.dbStorage.getItem(key);
    return value !== undefined && value !== null ? value : defaultValue;
  }
  return localStorage.getItem(key) || defaultValue;
};

const setStorageItem = (key, value) => {
  if (window.utools && window.utools.dbStorage) {
    window.utools.dbStorage.setItem(key, value);
  }
  localStorage.setItem(key, value);
};

const colorMode = ref(getStorageItem('calendar-color-mode', 'auto')); // light, dark, auto
const weekStartDay = ref(parseInt(getStorageItem('calendar-week-start', '0')));
const previewTheme = ref(null);
const yearPickerOffset = ref(0); // 年份选择器的偏移量

// 24节气主题配色（基于中国传统色）
const solarTermThemes = {
  '立春': { name: '立春·春黄', color: '#E9BB4E', bgColor: '#fffbf0', accentColor: '#E9BB4E' },
  '雨水': { name: '雨水·雨绿', color: '#8FCE95', bgColor: '#f0faf1', accentColor: '#6fb876' },
  '惊蛰': { name: '惊蛰·桃红', color: '#F596AA', bgColor: '#fff5f7', accentColor: '#f47c97' },
  '春分': { name: '春分·春蓝', color: '#8DB5D8', bgColor: '#f0f7fc', accentColor: '#6a9bc7' },
  '清明': { name: '清明·桐绿', color: '#85B09A', bgColor: '#f0f7f3', accentColor: '#689b7f' },
  '谷雨': { name: '谷雨·羽紫', color: '#A98BB5', bgColor: '#f7f3f9', accentColor: '#926fa3' },
  '立夏': { name: '立夏·夏黄', color: '#F3C13A', bgColor: '#fffdf0', accentColor: '#e5b12e' },
  '小满': { name: '小满·满红', color: '#ED6D46', bgColor: '#fff5f2', accentColor: '#e55a38' },
  '芒种': { name: '芒种·麦黄', color: '#E9B96E', bgColor: '#fffdf5', accentColor: '#dda855' },
  '夏至': { name: '夏至·星云', color: '#5F8C9F', bgColor: '#f0f6f8', accentColor: '#4a7a8d' },
  '小暑': { name: '小暑·晨紫', color: '#9C89B8', bgColor: '#f7f5fa', accentColor: '#8774a6' },
  '大暑': { name: '大暑·萤黑', color: '#374047', bgColor: '#f5f6f7', accentColor: '#5a6269' },
  '立秋': { name: '立秋·蝉绿', color: '#8FB08A', bgColor: '#f5f9f4', accentColor: '#7a9e74' },
  '处暑': { name: '处暑·谷蓝', color: '#7FA8C9', bgColor: '#f3f7fc', accentColor: '#6594b7' },
  '白露': { name: '白露·鹟黄', color: '#F2BE45', bgColor: '#fffdf2', accentColor: '#e5b133' },
  '秋分': { name: '秋分·秋紫', color: '#A07CAB', bgColor: '#f8f5f9', accentColor: '#8e6899' },
  '寒露': { name: '寒露·菊红', color: '#DB8872', bgColor: '#fdf6f4', accentColor: '#cf7460' },
  '霜降': { name: '霜降·柿红', color: '#DC6B3E', bgColor: '#fff5f1', accentColor: '#d05a2e' },
  '立冬': { name: '立冬·冬黄', color: '#E0A626', bgColor: '#fffcf0', accentColor: '#d19820' },
  '小雪': { name: '小雪·雪青', color: '#B8CDD1', bgColor: '#f7fbfc', accentColor: '#9fb9be' },
  '大雪': { name: '大雪·雪白', color: '#E8E8E8', bgColor: '#fafafa', accentColor: '#a8a8a8' },
  '冬至': { name: '冬至·冬蓝', color: '#5A7C99', bgColor: '#f3f6f9', accentColor: '#4a6a81' },
  '小寒': { name: '小寒·寒青', color: '#6C8F9E', bgColor: '#f4f8f9', accentColor: '#5a7b89' },
  '大寒': { name: '大寒·寒紫', color: '#6A5988', bgColor: '#f5f3f7', accentColor: '#584a73' },
};

const years = computed(() => {
  const currentYear = currentMonth.value.year();
  const start = currentYear - 100 + yearPickerOffset.value; // 前100年
  const result = [];
  for (let i = 0; i < 12; i++) { // 一次显示12个年份（3x4网格）
    const year = start + i;
    if (year >= currentYear - 100 && year <= currentYear + 20) {
      result.push(year);
    }
  }
  return result;
});

const months = [
  { value: 0, label: '一月' },
  { value: 1, label: '二月' },
  { value: 2, label: '三月' },
  { value: 3, label: '四月' },
  { value: 4, label: '五月' },
  { value: 5, label: '六月' },
  { value: 6, label: '七月' },
  { value: 7, label: '八月' },
  { value: 8, label: '九月' },
  { value: 9, label: '十月' },
  { value: 10, label: '十一月' },
  { value: 11, label: '十二月' },
];

const themes = [
  { id: 'auto', name: '智能动态', color: 'linear-gradient(135deg, #8DB5D8 0%, #E9BB4E 100%)' },
  { id: 'default', name: '素雅', color: '#A3D5E0' },
  { id: 'ink', name: '水墨', color: '#111827' },
  { id: 'red', name: '朱红', color: '#b91c1c' },
  { id: 'gold', name: '鎏金', color: '#b45309' },
  { id: 'cyan', name: '黛蓝', color: '#1e40af' },
];

// 获取当前节气
const getCurrentSolarTerm = () => {
  const solar = Solar.fromDate(new Date());
  const lunar = solar.getLunar();
  const term = lunar.getPrevJieQi(true); // 获取上一节气（包含当天）
  return term ? term.getName() : '立春';
};

// 获取当前节气对应的动态主题名称
const dynamicThemeName = computed(() => {
  const solarTerm = getCurrentSolarTerm();
  const termTheme = solarTermThemes[solarTerm] || solarTermThemes['立春'];
  return termTheme.name;
});

// 判断当前是否处于深色模式
const isDarkMode = computed(() => {
  if (colorMode.value === 'auto') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }
  return colorMode.value === 'dark';
});

// 获取指定主题的配置
const getThemeConfigById = (themeId) => {
  const isDark = isDarkMode.value;
  
  if (themeId === 'auto') {
    const solarTerm = getCurrentSolarTerm();
    const termTheme = solarTermThemes[solarTerm] || solarTermThemes['立春'];
    return {
      id: 'auto',
      primaryColor: termTheme.color,
      bgColor: isDark ? '#1a1a1a' : termTheme.bgColor,
      accentColor: termTheme.accentColor,
      name: termTheme.name,
    };
  }
  
  const themeMap = {
    'default': { primaryColor: '#A3D5E0', bgColor: isDark ? '#1a1a1a' : '#f9fafb', accentColor: '#7db4c4', name: '素雅' },
    'ink': { primaryColor: isDark ? '#9ca3af' : '#111827', bgColor: isDark ? '#111827' : '#f3f4f6', accentColor: isDark ? '#6b7280' : '#374151', name: '水墨' },
    'red': { primaryColor: '#b91c1c', bgColor: isDark ? '#1a1a1a' : '#fff1f2', accentColor: '#b91c1c', name: '朱红' },
    'gold': { primaryColor: '#b45309', bgColor: isDark ? '#1a1a1a' : '#fffbeb', accentColor: '#b45309', name: '鎏金' },
    'cyan': { primaryColor: '#1e40af', bgColor: isDark ? '#1a1a1a' : '#eff6ff', accentColor: '#1e40af', name: '黛蓝' },
  };
  
  return themeMap[themeId] || themeMap['default'];
};

// 计算当前应用的主题（包含预览）
const activeThemeConfig = computed(() => {
  return getThemeConfigById(previewTheme.value || currentTheme.value);
});

// 计算已保存的主题配置
const savedThemeConfig = computed(() => {
  return getThemeConfigById(currentTheme.value);
});

const switchTheme = (themeId) => {
  currentTheme.value = themeId;
  setStorageItem('calendar-theme', themeId);
  applyTheme();
  showThemePicker.value = false; // 选中后隐藏选择列表
};

// 应用主题
const applyTheme = () => {
  const theme = activeThemeConfig.value;
  const savedTheme = savedThemeConfig.value;
  const root = document.documentElement;
  const isDark = isDarkMode.value;
  
  root.style.setProperty('--primary-color', theme.primaryColor);
  root.style.setProperty('--bg-color', theme.bgColor);
  root.style.setProperty('--accent-color', theme.accentColor);
  root.style.setProperty('--saved-primary-color', savedTheme.primaryColor);
  
  // 夜间模式变量
  if (isDark) {
    root.style.setProperty('--text-color', '#e5e7eb');
    root.style.setProperty('--header-bg', '#1e1e1e');
    root.style.setProperty('--cell-bg', '#262626');
    root.style.setProperty('--border-color', 'rgba(255,255,255,0.08)');
    root.style.setProperty('--hover-bg', 'rgba(255,255,255,0.05)');
    root.style.setProperty('--panel-bg', '#1e1e1e');
    root.style.setProperty('--secondary-text', '#9ca3af');
    root.style.setProperty('--scrollbar-thumb', 'rgba(255,255,255,0.2)');
  } else {
    root.style.setProperty('--text-color', '#1f2937');
    root.style.setProperty('--header-bg', '#ffffff');
    root.style.setProperty('--cell-bg', '#ffffff');
    root.style.setProperty('--border-color', 'rgba(0,0,0,0.06)');
    root.style.setProperty('--hover-bg', 'rgba(0,0,0,0.03)');
    root.style.setProperty('--panel-bg', '#ffffff');
    root.style.setProperty('--secondary-text', '#6b7280');
    root.style.setProperty('--scrollbar-thumb', 'rgba(0,0,0,0.1)');
  }
};

const switchColorMode = (mode) => {
  colorMode.value = mode;
  setStorageItem('calendar-color-mode', mode);
  applyTheme();
};

// Generate calendar days
const calendarDays = computed(() => {
  const startOfMonth = currentMonth.value.startOf('month');
  
  // Calculate the first day of the calendar grid
  const firstDayOfWeek = startOfMonth.day();
  const daysToSubtract = (firstDayOfWeek - weekStartDay.value + 7) % 7;
  const start = startOfMonth.subtract(daysToSubtract, 'day');
  
  const days = [];
  
  // Create 6 weeks (42 days)
  for (let i = 0; i < 42; i++) {
    const date = start.add(i, 'day');
    const solar = Solar.fromYmd(date.year(), date.month() + 1, date.date());
    const lunar = solar.getLunar();
    
    // Get holiday info
    const holiday = HolidayUtil.getHoliday(date.year(), date.month() + 1, date.date());
    
    // Get solar term (节气)
    const jieQi = lunar.getJieQi();
    
    days.push({
      date,
      solar,
      lunar,
      isCurrentMonth: date.month() === currentMonth.value.month(),
      isToday: date.isSame(dayjs(), 'day'),
      isSelected: date.isSame(selectedDate.value, 'day'),
      lunarText: lunar.getDayInChinese() === '初一' ? lunar.getMonthInChinese() + '月' : lunar.getDayInChinese(),
      festivals: [...lunar.getFestivals(), ...lunar.getOtherFestivals()],
      solarTerm: jieQi || '',
      holiday: holiday ? { name: holiday.getName(), isWork: holiday.isWork() } : null,
    });
  }
  return days;
});

const baseWeekDays = ['日', '一', '二', '三', '四', '五', '六'];
const weekDays = computed(() => {
  const days = [...baseWeekDays];
  if (weekStartDay.value === 1) {
    const sun = days.shift();
    days.push(sun);
  }
  return days;
});

const nextMonth = () => {
  currentMonth.value = currentMonth.value.add(1, 'month');
};

const prevMonth = () => {
  currentMonth.value = currentMonth.value.subtract(1, 'month');
};

const selectYear = (year) => {
  currentMonth.value = currentMonth.value.year(year);
  showYearPicker.value = false;
  
  // 下次打开时，定位到选中年份的页，并且选中年份在中间
  // 不立即重置，等下次toggleYearPicker时再重新计算
};

const selectMonth = (monthValue) => {
  currentMonth.value = currentMonth.value.month(monthValue);
  showMonthPicker.value = false;
};

const toggleYearPicker = () => {
  showYearPicker.value = !showYearPicker.value;
  showMonthPicker.value = false;
  
  if (showYearPicker.value) {
    // 打开时，让当前年份在页面中间（第6-7个位置）
    const currentYear = currentMonth.value.year();
    const baseYear = currentYear - 100; // 最小年份
    const totalOffset = currentYear - baseYear; // 当前年份相对位置
    
    // 让当前年份显示在第6个位置（中间位置）
    yearPickerOffset.value = Math.max(0, totalOffset - 5);
  }
};

const toggleMonthPicker = () => {
  showMonthPicker.value = !showMonthPicker.value;
  showYearPicker.value = false;
};

const setWeekStartDay = (day) => {
  weekStartDay.value = day;
  setStorageItem('calendar-week-start', day.toString());
};

const toggleSettings = () => {
  showSettings.value = !showSettings.value;
  if (showSettings.value) {
    showYearPicker.value = false;
    showMonthPicker.value = false;
    showThemePicker.value = false;
  }
};

const toggleThemePicker = () => {
  showThemePicker.value = !showThemePicker.value;
  if (showThemePicker.value) {
    showYearPicker.value = false;
    showMonthPicker.value = false;
    showSettings.value = false;
  }
};

const closePickers = () => {
  showYearPicker.value = false;
  showMonthPicker.value = false;
  showSettings.value = false;
  showThemePicker.value = false;
  previewTheme.value = null;
  yearPickerOffset.value = 0;
};

const selectDate = (day) => {
  selectedDate.value = day.date;
};

// 计算选中日期和今天的距离
 const dayDifference = computed(() => {
  const today = dayjs().startOf('day');
  const selected = selectedDate.value.startOf('day');
  const diff = selected.diff(today, 'day');
  
  if (diff === 0) return ''; // 今天不显示
  if (diff > 0) return `${diff}天后`;
  return `${Math.abs(diff)}天前`;
});

let lastScrollTime = 0;
const handleScroll = (e) => {
  const now = Date.now();
  if (now - lastScrollTime < 300) return; // 300ms throttle
  
  if (Math.abs(e.deltaY) < 10) return; // Ignore small movements
  
  // 如果年份选择器打开，滚轮切换年份页面
  if (showYearPicker.value) {
    const currentYear = currentMonth.value.year();
    const direction = e.deltaY > 0 ? 1 : -1;
    const newOffset = yearPickerOffset.value + direction * 6; // 每次翻6个年份（半页）
    
    // 限制范围：前100年到后20年
    const minOffset = 0;
    const maxOffset = 121 - 12; // 121个年份 - 12个可见 = 109
    
    if (newOffset >= minOffset && newOffset <= maxOffset) {
      yearPickerOffset.value = newOffset;
    }
    lastScrollTime = now;
    return;
  }
  
  // 如果月份选择器打开，不处理滚轮
  if (showMonthPicker.value) {
    return;
  }
  
  // 默认情况，滚轮切换月份
  if (e.deltaY > 0) {
    nextMonth();
  } else {
    prevMonth();
  }
  lastScrollTime = now;
};

const almanacInfo = computed(() => {
  const date = selectedDate.value;
  const solar = Solar.fromYmd(date.year(), date.month() + 1, date.date());
  const lunar = solar.getLunar();
  
  // 获取彭祖百忌
  const pengZu = lunar.getPengZuGan() + ' ' + lunar.getPengZuZhi();
  
  return {
    solarDate: date.format('YYYY年MM月DD日'),
    weekDay: '星期' + baseWeekDays[date.day()],
    lunarDate: `${lunar.getYearInGanZhi()}(${lunar.getYearShengXiao()})年 ${lunar.getMonthInChinese()}月${lunar.getDayInChinese()}`,
    ganZhi: `${lunar.getYearInGanZhi()}年 ${lunar.getMonthInGanZhi()}月 ${lunar.getDayInGanZhi()}日`,
    yi: lunar.getDayYi(),
    ji: lunar.getDayJi(),
    pengZu: pengZu,
    wuXing: lunar.getDayNaYin(), // 五行纳音
    chong: lunar.getDayChongDesc(),
    sha: lunar.getDaySha(),
    taiShen: lunar.getDayPositionTai(), // 胎神方位
    jieQi: lunar.getPrevJieQi().getName() + ' ' + lunar.getNextJieQi().getName(),
  };
});

// 全局点击监听，用于关闭弹出菜单
const handleGlobalClick = (e) => {
  // 如果点击的目标不在弹出菜单内，也不在触发按钮内，则关闭菜单
  const isClickInsideTheme = e.target.closest('.theme-picker');
  const isClickInsideSettings = e.target.closest('.settings-wrapper');
  const isClickInsideYearPicker = e.target.closest('.year-month');
  
  if (!isClickInsideTheme && !isClickInsideSettings && !isClickInsideYearPicker) {
    closePickers();
  }
};

watch([isDarkMode, activeThemeConfig], () => {
  applyTheme();
}, { deep: true });

onMounted(() => {
  const savedTheme = getStorageItem('calendar-theme', 'auto');
  currentTheme.value = savedTheme;
  applyTheme();
  
  if (props.enterAction && props.enterAction.code === 'calendar') {
    // Already set by default ref
  }

  // 网页版添加全局点击监听
  window.addEventListener('click', handleGlobalClick);
  
  // 监听系统主题变化
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (colorMode.value === 'auto') {
      applyTheme();
    }
  });
});

onUnmounted(() => {
  window.removeEventListener('click', handleGlobalClick);
});

// 监听主题变化
watch(activeThemeConfig, () => {
  applyTheme();
});
</script>

<template>
  <div class="calendar-container" :class="['theme-' + currentTheme, isDarkMode ? 'dark-mode' : 'light-mode']" :data-mode="isDarkMode ? 'dark' : 'light'" @wheel.prevent="handleScroll">
    <!-- Header -->
    <header class="calendar-header">
      <div class="current-info" @click.stop>
        <span class="year-month" @click="toggleYearPicker" :class="{ active: showYearPicker }">
          {{ currentMonth.format('YYYY年') }}
        </span>
        <span class="year-month" @click="toggleMonthPicker" :class="{ active: showMonthPicker }">
          {{ currentMonth.format('MM月') }}
        </span>
        <span v-if="dayDifference" class="day-diff">{{ dayDifference }}</span>
        
        <!-- Year Picker Dropdown -->
        <div v-if="showYearPicker" class="picker-dropdown year-picker" @click.stop>
          <div 
            v-for="year in years" 
            :key="year" 
            class="picker-item"
            :class="{ active: year === currentMonth.year() }"
            @click="selectYear(year)"
          >
            {{ year }}年
          </div>
        </div>
        
        <!-- Month Picker Dropdown -->
        <div v-if="showMonthPicker" class="picker-dropdown month-picker" @click.stop>
          <div 
            v-for="month in months" 
            :key="month.value" 
            class="picker-item"
            :class="{ active: month.value === currentMonth.month() }"
            @click="selectMonth(month.value)"
          >
            {{ month.label }}
          </div>
        </div>
      </div>
      <div class="actions">
        <button @click="prevMonth" class="icon-btn"><ChevronLeft :size="20" /></button>
        <button @click="currentMonth = dayjs()" class="text-btn">今天</button>
        <button @click="nextMonth" class="icon-btn"><ChevronRight :size="20" /></button>
        
        <div class="theme-picker">
          <button @click.stop="toggleThemePicker" class="icon-btn theme-trigger" :class="{ active: showThemePicker }">
            <Palette :size="20" class="theme-icon" />
          </button>
          <div v-if="showThemePicker" class="theme-options shadow-lg" @click.stop>
            <div class="color-mode-switch">
              <button 
                class="mode-btn" 
                :class="{ active: colorMode === 'light' }" 
                @click="switchColorMode('light')"
                title="日间模式"
              >
                <Sun :size="16" />
              </button>
              <button 
                class="mode-btn" 
                :class="{ active: colorMode === 'dark' }" 
                @click="switchColorMode('dark')"
                title="夜间模式"
              >
                <Moon :size="16" />
              </button>
              <button 
                class="mode-btn" 
                :class="{ active: colorMode === 'auto' }" 
                @click="switchColorMode('auto')"
                title="跟随系统"
              >
                <Monitor :size="16" />
              </button>
            </div>
            <div class="settings-separator"></div>
            <div 
              v-for="t in themes" 
              :key="t.id" 
              class="theme-option-item"
              @click="switchTheme(t.id)"
              @mouseenter="previewTheme = t.id"
              @mouseleave="previewTheme = null"
            >
              <div 
                :style="{ background: t.color }"
                class="theme-dot"
                :class="{ active: currentTheme === t.id }"
              ></div>
              <span class="theme-name">{{ t.id === 'auto' ? dynamicThemeName : t.name }}</span>
            </div>
          </div>
        </div>

        <div class="settings-wrapper">
          <button @click.stop="toggleSettings" class="icon-btn" :class="{ active: showSettings }">
            <Settings :size="20" />
          </button>
          
          <div v-if="showSettings" class="settings-panel shadow-lg" @click.stop>
            <div class="settings-section">
              <div class="section-title">周起始日</div>
              <div class="setting-options">
                <button 
                  class="option-btn" 
                  :class="{ active: weekStartDay === 0 }"
                  @click="setWeekStartDay(0)"
                >周日</button>
                <button 
                  class="option-btn" 
                  :class="{ active: weekStartDay === 1 }"
                  @click="setWeekStartDay(1)"
                >周一</button>
              </div>
            </div>
            
            <div class="settings-separator"></div>
            
            <div class="settings-section">
              <div class="section-title">
                关于{{ projectConfig.name }}
                <span class="version-badge">v{{ projectConfig.version }}</span>
              </div>
              <div class="about-info">
                <div class="about-item">
                  <Github :size="14" class="about-icon" />
                  <a :href="projectConfig.github" target="_blank">GitHub 源码</a>
                </div>
                <div class="about-item">
                  <ExternalLink :size="14" class="about-icon" />
                  <a :href="projectConfig.website" target="_blank">网页版地址</a>
                </div>
                <div class="about-item">
                  <User :size="14" class="about-icon" />
                  <span>作者: {{ projectConfig.author }}</span>
                </div>
              </div>
            </div>
            
            <div class="settings-footer">
              <div class="slogan">{{ projectConfig.description }}</div>
            </div>
          </div>
        </div>
      </div>
    </header>

    <div class="main-content">
      <!-- Calendar Grid -->
      <div class="calendar-grid-wrapper">
        <div class="week-header">
          <div v-for="w in weekDays" :key="w" class="week-day">{{ w }}</div>
        </div>
        <div class="grid">
          <div 
            v-for="day in calendarDays" 
            :key="day.date.toString()" 
            class="day-cell"
            :class="{ 
              'other-month': !day.isCurrentMonth, 
              'today': day.isToday,
              'selected': day.isSelected,
              'weekend': day.date.day() === 0 || day.date.day() === 6
            }"
            @click="selectDate(day)"
          >
            <div class="solar-day">{{ day.date.date() }}</div>
            <div class="lunar-day" :class="{ 'festival': day.festivals.length > 0 || day.solarTerm }">
              {{ day.solarTerm || (day.festivals.length > 0 ? day.festivals[0] : day.lunarText) }}
            </div>
            <div v-if="day.holiday" class="holiday-tag" :class="day.holiday.isWork ? 'work' : 'rest'">
              {{ day.holiday.isWork ? '班' : '休' }}
            </div>
          </div>
        </div>
      </div>

      <!-- Almanac Details -->
      <aside class="almanac-panel">
        <div class="almanac-header">
          <div class="big-day">{{ selectedDate.date() }}</div>
          <div class="detail-info">
            <div class="solar-full">{{ almanacInfo.solarDate }}</div>
            <div class="lunar-full">{{ almanacInfo.lunarDate }}</div>
          </div>
        </div>
        
        <div class="almanac-body">
          <div class="yi-ji">
            <div class="item yi">
              <span class="label">宜</span>
              <div class="content">{{ almanacInfo.yi.join(' ') }}</div>
            </div>
            <div class="item ji">
              <span class="label">忌</span>
              <div class="content">{{ almanacInfo.ji.join(' ') }}</div>
            </div>
          </div>
          
          <div class="other-details">
            <div class="detail-row"><span class="label">干支</span> {{ almanacInfo.ganZhi }}</div>
            <div class="detail-row"><span class="label">五行</span> {{ almanacInfo.wuXing }}</div>
            <div class="detail-row"><span class="label">冲煞</span> {{ almanacInfo.chong }} (煞{{ almanacInfo.sha }})</div>
            <div class="detail-row"><span class="label">彭祖</span> {{ almanacInfo.pengZu }}</div>
            <div class="detail-row"><span class="label">胎神</span> {{ almanacInfo.taiShen }}</div>
          </div>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.calendar-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: var(--bg-color);
  color: var(--text-color);
  font-family: "PingFang SC", "Microsoft YaHei", sans-serif;
  overflow: hidden;
  user-select: none;
  --rest-color: #ef4444;
  --work-color: #6b7280;
}

.calendar-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 20px;
  background-color: var(--header-bg);
  border-bottom: 1px solid var(--border-color);
  box-shadow: 0 2px 4px rgba(0,0,0,0.02);
}

.year-month {
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--primary-color);
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
  transition: all 0.2s;
  margin-right: 4px;
}

.year-month:hover {
  background-color: var(--hover-bg);
}

.year-month.active {
  background-color: var(--primary-color);
  color: #ffffff;
}

.day-diff {
  font-size: 0.85rem;
  color: var(--accent-color);
  margin-left: 8px;
  padding: 2px 8px;
  background-color: var(--hover-bg);
  border-radius: 4px;
}

.current-info {
  position: relative;
  display: flex;
  align-items: center;
}

.picker-dropdown {
  position: absolute;
  top: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%);
  background: var(--panel-bg);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  z-index: 200;
  min-width: 120px;
  border: 1px solid var(--border-color);
}

.year-picker {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;
  padding: 8px;
  overflow: hidden;
}

.month-picker {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;
  padding: 8px;
}

.picker-item {
  padding: 8px 12px;
  text-align: center;
  cursor: pointer;
  border-radius: 6px;
  transition: all 0.2s;
  font-size: 0.9rem;
  color: var(--text-color);
}

.picker-item:hover {
  background-color: var(--hover-bg);
}

.picker-item.active {
  background-color: var(--primary-color);
  color: #ffffff;
  font-weight: 600;
}

.actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.icon-btn, .text-btn {
  background: none;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 4px 8px;
  cursor: pointer;
  color: var(--primary-color);
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.icon-btn:hover, .text-btn:hover {
  background-color: var(--hover-bg);
  border-color: var(--primary-color);
}

.icon-btn.active, .icon-btn:hover {
  background-color: var(--hover-bg);
  border-color: var(--primary-color);
}

.theme-trigger {
  /* 统一使用 icon-btn 的颜色定义 */
}

.theme-picker {
  position: relative;
  display: flex;
  align-items: center;
}

.theme-options {
  position: absolute;
  top: calc(100% + 12px);
  right: 0;
  background: var(--panel-bg);
  padding: 8px;
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  display: flex;
  flex-direction: column;
  gap: 4px;
  z-index: 100;
  border: 1px solid var(--border-color);
  min-width: 140px;
}

.color-mode-switch {
  display: flex;
  gap: 4px;
  padding: 2px;
  background: var(--hover-bg);
  border-radius: 8px;
  margin-bottom: 4px;
}

.mode-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 6px;
  border: none;
  background: none;
  border-radius: 6px;
  cursor: pointer;
  color: var(--secondary-text);
  transition: all 0.2s;
}

.mode-btn:hover {
  background: rgba(255,255,255,0.1);
}

.mode-btn.active {
  background: var(--panel-bg);
  color: var(--primary-color);
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

/* 移除悬停触发逻辑 */
.theme-picker::after {
  display: none;
}

/* 移除悬停显示逻辑 */
.theme-options:hover {
  /* 保持显示由 v-if 控制 */
}

.theme-dot {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
  transition: all 0.2s;
  background: var(--dot-bg, #ccc);
  flex-shrink: 0;
}

.theme-option-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  cursor: pointer;
  border-radius: 6px;
  transition: background-color 0.2s;
  white-space: nowrap;
}

.theme-option-item:hover {
  background-color: var(--hover-bg);
}

.theme-name {
  font-size: 0.85rem;
  color: var(--text-color);
}

.theme-dot:hover {
  transform: scale(1.15);
}

.theme-dot.active {
  border: 2px solid white;
  box-shadow: 0 0 0 2px var(--saved-primary-color);
}

.settings-wrapper {
  position: relative;
}

.settings-panel {
  position: absolute;
  top: calc(100% + 12px);
  right: 0;
  width: 200px;
  background: var(--panel-bg);
  border-radius: 12px;
  padding: 16px;
  z-index: 300;
  border: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.settings-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.section-title {
  font-size: 0.75rem;
  font-weight: 600;
  color: #9ca3af;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.version-badge {
  font-size: 0.65rem;
  font-weight: 500;
  padding: 1px 6px;
  background: var(--bg-color);
  border: 1px solid var(--accent-color);
  border-radius: 4px;
  color: var(--accent-color);
  letter-spacing: 0;
}

.settings-footer {
  margin-top: 4px;
  padding-top: 12px;
  border-top: 1px dashed var(--bg-color);
  text-align: center;
}

.slogan {
  font-size: 0.75rem;
  color: var(--accent-color);
  font-style: italic;
  opacity: 0.8;
  position: relative;
  display: inline-block;
}

.slogan::before, .slogan::after {
  content: '"';
  font-family: serif;
  opacity: 0.5;
  font-size: 1.2rem;
  line-height: 1;
  vertical-align: middle;
  color: var(--primary-color);
}

.slogan::before { margin-right: 2px; }
.slogan::after { margin-left: 2px; }

.setting-options {
  display: flex;
  background: var(--hover-bg);
  padding: 3px;
  border-radius: 8px;
}

.option-btn {
  flex: 1;
  border: none;
  background: none;
  padding: 6px;
  font-size: 0.85rem;
  cursor: pointer;
  border-radius: 6px;
  color: var(--secondary-text);
  transition: all 0.2s;
}

.option-btn.active {
  background: var(--panel-bg);
  color: var(--primary-color);
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
}

.settings-separator {
  height: 1px;
  background: var(--border-color);
  margin: 4px 0;
}

.about-info {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.about-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.85rem;
  color: var(--text-color);
  opacity: 0.8;
}

.about-icon {
  color: var(--accent-color);
  opacity: 0.8;
}

.about-item a {
  color: var(--text-color);
  text-decoration: none;
  transition: color 0.2s;
}

.about-item a:hover {
  color: var(--primary-color);
}

.icon-btn.active {
  background-color: var(--hover-bg);
  border-color: var(--primary-color);
  color: var(--primary-color);
}

.shadow-lg {
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
}

.main-content {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.calendar-grid-wrapper {
  flex: 1;
  padding: 16px;
  display: flex;
  flex-direction: column;
}

.week-header {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  text-align: center;
  margin-bottom: 8px;
  font-weight: 600;
  color: var(--primary-color);
}

.grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  grid-template-rows: repeat(6, 1fr);
  flex: 1;
  gap: 4px;
}

.day-cell {
  background-color: var(--cell-bg);
  border-radius: 8px;
  padding: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  position: relative;
  transition: all 0.2s;
  border: 1px solid transparent;
}

.day-cell:hover {
  background-color: var(--hover-bg);
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(0,0,0,0.05);
}

.day-cell.selected {
  border-color: var(--primary-color);
  background-color: var(--hover-bg);
}

.day-cell.today {
  background-color: var(--primary-color);
  box-shadow: 0 4px 12px var(--primary-color);
  z-index: 1;
}

.day-cell.today .solar-day,
.day-cell.today .lunar-day {
  color: #ffffff !important;
}

.day-cell.other-month {
  opacity: 0.3;
}

.solar-day {
  font-size: 1.1rem;
  font-weight: 500;
  margin-bottom: 2px;
}

.day-cell.weekend .solar-day {
  color: var(--rest-color);
}

.lunar-day {
  font-size: 0.75rem;
  color: var(--secondary-text);
}

.lunar-day.festival {
  color: var(--accent-color);
  font-weight: 500;
}

.holiday-tag {
  position: absolute;
  top: 4px;
  right: 4px;
  font-size: 0.65rem;
  padding: 1px 3px;
  border-radius: 3px;
  line-height: 1;
}

.holiday-tag.rest {
  background-color: var(--rest-color);
  color: white;
}

.holiday-tag.work {
  background-color: var(--work-color);
  color: white;
}

.almanac-panel {
  width: 280px;
  background-color: var(--panel-bg);
  border-left: 1px solid var(--border-color);
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  overflow-y: auto;
}

.almanac-header {
  display: flex;
  align-items: center;
  gap: 16px;
  padding-bottom: 16px;
  border-bottom: 2px solid var(--primary-color);
}

.big-day {
  font-size: 3.5rem;
  font-weight: 700;
  line-height: 1;
  color: var(--primary-color);
}

.detail-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.solar-full {
  font-weight: 600;
  font-size: 0.9rem;
  color: var(--text-color);
}

.lunar-full {
  font-size: 0.85rem;
  color: var(--secondary-text);
}

.yi-ji {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 16px;
}

.yi-ji .item {
  display: flex;
  gap: 12px;
}

.yi-ji .label { 
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  flex-shrink: 0;
  font-weight: 600;
}

.yi .label { background-color: #10b981; }
.ji .label { background-color: #ef4444; }

.yi-ji .content {
  font-size: 0.9rem;
  line-height: 1.5;
  color: var(--text-color);
}

.other-details {
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 0.85rem;
  color: var(--secondary-text);
}

.detail-row {
  display: flex;
  gap: 8px;
}

.detail-row .label {
  color: var(--primary-color);
  font-weight: 600;
  min-width: 32px;
}
</style>
