<script setup>
/**
 * 系统托盘设置页
 *
 * 双环境要求（见 AGENTS.md）：
 *   · uTools 内：window.heCalendarTray（preload 暴露的宿主）负责落盘 + 生效
 *   · 普通浏览器：没有宿主，页面仍然要能正常渲染并给出预览（方便开发调试）
 * 样式要求：不使用运行时 color-mix()（uTools 内置 WebView 支持不稳定）
 */
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { getDateInfo, getAlmanac } from '../shared/calendar-core.js'
import { FIELDS, LOCAL_FIELD_KEYS, renderTooltip, buildTemplate, templateFieldKeys } from '../tray/fields.js'
import {
  DEFAULT_CONFIG,
  SEASON_COLORS,
  loadConfig,
  normalizeConfig,
  resolveTemplate,
  resolveIconBg,
  toggleField,
} from '../tray/config.js'

const emit = defineEmits(['close'])

const isUtools = typeof window !== 'undefined' && !!window.utools
const host = typeof window !== 'undefined' ? window.heCalendarTray : null
const hasHost = !!host

const cfg = reactive(normalizeConfig(DEFAULT_CONFIG))
const status = ref(null)
const toast = ref('')
const showDiag = ref(false)
const diagText = ref('')
const now = ref(new Date())

let statusTimer = null
let clockTimer = null

// ---------------------------------------------------------------- 数据
const dateInfo = ref(null)
const almanac = ref(null)

function loadCalendarData() {
  try {
    dateInfo.value = getDateInfo()
    almanac.value = getAlmanac()
  } catch (e) {
    console.warn('[tray-settings] 日历数据计算失败', e)
  }
}

// ---------------------------------------------------------------- 预览
const template = computed(() => resolveTemplate(cfg))

const previewVars = computed(() => {
  const vars = {}
  for (const key of templateFieldKeys(template.value)) {
    if (LOCAL_FIELD_KEYS.includes(key)) continue
    const field = FIELDS.find((f) => f.key === key)
    if (!field) continue
    try {
      const value = field.format(dateInfo.value || {}, almanac.value || {}, cfg)
      if (value) vars[key] = String(value).replace(/[\r\n]+/g, ' ').trim()
    } catch {
      /* 忽略单字段错误 */
    }
  }
  return vars
})

const preview = computed(() =>
  renderTooltip(template.value, previewVars.value, { now: now.value, maxChars: 127 })
)

const previewIcon = computed(() => ({
  text: cfg.iconText || String(now.value.getDate()),
  bg: resolveIconBg(cfg.iconBg, dateInfo.value),
  fg: cfg.iconFg,
}))

const availableVars = computed(() => FIELDS.map((f) => `%${f.key}%`).join(' '))

/** 模板里写了但没收录的变量：会被自动删掉，同时给出提示避免留下「满:」这种悬空前缀 */
const unknownVars = computed(() => {
  const raw = (cfg.template || '').trim()
  if (!raw) return []
  const known = new Set(FIELDS.map((f) => f.key))
  const found = []
  const re = /%([A-Za-z0-9_]+)\s*(?:\([^)]*\))?%/g
  let m
  while ((m = re.exec(raw)) !== null) {
    if (!known.has(m[1]) && !found.includes(m[1])) found.push(m[1])
  }
  return found
})

// ---------------------------------------------------------------- 状态
function refreshStatus() {
  if (host) {
    try {
      status.value = host.getStatus()
    } catch {
      status.value = null
    }
  }
}

function showToast(msg) {
  toast.value = msg
  setTimeout(() => {
    if (toast.value === msg) toast.value = ''
  }, 2600)
}

// ---------------------------------------------------------------- 操作
function onToggleField(key, checked) {
  const next = toggleField(cfg, key, checked)
  cfg.fields = next.fields
  autoApply()
}

let applyTimer = null
/** 勾选类改动即时生效，防抖避免连点写爆磁盘 */
function autoApply() {
  if (!hasHost) return
  if (applyTimer) clearTimeout(applyTimer)
  applyTimer = setTimeout(() => save(true), 350)
}

function save(silent = false) {
  if (!hasHost) {
    showToast('网页预览模式：托盘设置只在 uTools 中生效')
    return
  }
  try {
    host.apply({ ...cfg })
    refreshStatus()
    if (!silent) showToast('已应用')
  } catch (e) {
    showToast('应用失败：' + (e?.message || e))
  }
}

function refresh() {
  if (!host) return showToast('网页预览模式：无宿主可刷新')
  try {
    host.refresh()
    refreshStatus()
    showToast('数据已刷新')
  } catch (e) {
    showToast('刷新失败：' + (e?.message || e))
  }
}

function turnOff() {
  if (!host) return showToast('网页预览模式：无宿主可关闭')
  cfg.enabled = false
  try {
    host.disable()
    refreshStatus()
    showToast('托盘图标已关闭')
  } catch (e) {
    showToast('关闭失败：' + (e?.message || e))
  }
}

function dumpDiag() {
  showDiag.value = !showDiag.value
  if (!showDiag.value || !host) return
  try {
    const lines = host.getDiag(80)
    diagText.value = lines.map((r) => `${r.ts}  ${r.event}  ${JSON.stringify(r.data)}`).join('\n')
  } catch (e) {
    diagText.value = '读取诊断失败：' + (e?.message || e)
  }
}

// ---------------------------------------------------------------- 生命周期
onMounted(() => {
  loadCalendarData()
  if (host) {
    try {
      Object.assign(cfg, normalizeConfig(host.getConfig()))
    } catch {
      /* 用默认值 */
    }
  } else if (isUtools && window.utools?.dbStorage) {
    Object.assign(cfg, loadConfig(window.utools))
  }
  refreshStatus()
  statusTimer = setInterval(refreshStatus, 2000)
  clockTimer = setInterval(() => {
    now.value = new Date()
  }, 1000)
})

onUnmounted(() => {
  if (statusTimer) clearInterval(statusTimer)
  if (clockTimer) clearInterval(clockTimer)
  if (applyTimer) clearTimeout(applyTimer)
})
</script>

<template>
  <div class="tray-settings">
    <header class="ts-header">
      <div class="ts-title">
        <span class="ts-dot" :class="{ on: cfg.enabled && status && status.status === 'running' }"></span>
        系统托盘 · 悬停显示设置
      </div>
      <button class="ts-btn ghost" @click="emit('close')">返回日历</button>
    </header>

    <div v-if="!hasHost" class="ts-notice">
      当前是普通浏览器环境，托盘 helper 只在 uTools 里运行。下面的界面与预览仍可正常查看。
    </div>

    <!-- 状态 -->
    <section class="ts-card">
      <div class="ts-card-title">运行状态</div>
      <div class="ts-status-grid">
        <div><label>开关</label><b>{{ cfg.enabled ? '已开启' : '已关闭' }}</b></div>
        <div><label>helper</label>
          <b>{{ status ? status.status : '未知' }}</b>
        </div>
        <div><label>进程 PID</label><b>{{ status?.helperPid || '—' }}</b></div>
        <div><label>图标底色</label>
          <b class="ts-swatch-text">
            <i class="ts-swatch" :style="{ background: previewIcon.bg }"></i>{{ previewIcon.bg }}
          </b>
        </div>
      </div>
      <div class="ts-tooltip-line">
        <label>托盘实际悬停文本</label>
        <div class="ts-tooltip-box">{{ status?.tooltip || preview || '—' }}</div>
      </div>
      <div v-if="status?.lastError" class="ts-error">helper 报错：{{ status.lastError }}</div>
    </section>

    <!-- 开关 -->
    <section class="ts-card">
      <label class="ts-switch">
        <input type="checkbox" v-model="cfg.enabled" @change="save()" />
        <span>在系统托盘显示合社日历图标</span>
      </label>
      <p class="ts-hint">
        开启后：鼠标悬停图标显示下面的内容，左键点击唤起 uTools 主窗口，右键弹出菜单。
        Windows 11 默认会把新图标收进任务栏的「显示隐藏的图标」里，需要手动拖到任务栏上。
      </p>
    </section>

    <template v-if="cfg.enabled">
      <!-- 悬停内容 -->
      <section class="ts-card">
        <div class="ts-card-title">悬停显示内容</div>
        <div class="ts-chips">
          <label
            v-for="f in FIELDS"
            :key="f.key"
            class="ts-chip"
            :class="{ on: cfg.fields.includes(f.key) }"
          >
            <input
              type="checkbox"
              :checked="cfg.fields.includes(f.key)"
              @change="onToggleField(f.key, $event.target.checked)"
            />
            <span class="ts-chip-name">{{ f.label }}</span>
            <span class="ts-chip-sample">{{ f.sample }}</span>
          </label>
        </div>

        <div class="ts-row">
          <label class="ts-label">宜 / 忌 各显示几项</label>
          <input class="ts-num" type="number" min="1" max="12" v-model.number="cfg.yiLimit" @change="save()" />
          <input class="ts-num" type="number" min="1" max="12" v-model.number="cfg.jiLimit" @change="save()" />
        </div>

        <div class="ts-row column">
          <label class="ts-label">自定义模板（留空则使用上面勾选的字段）</label>
          <input
            class="ts-input"
            type="text"
            v-model="cfg.template"
            placeholder="%lunar% · 宜:%yi% · %time%"
            @change="save()"
          />
        </div>
        <p class="ts-hint">
          可用变量：{{ availableVars }}<br />
          注意：<code>%yi%</code> / <code>%ji%</code> 只输出词条本身（如「祭祀 祈福」），
          前缀要写在模板里（如 <code>宜:%yi%</code>）。
        </p>
        <p v-if="unknownVars.length" class="ts-warn">
          未收录的变量会被自动删除：{{ unknownVars.map((v) => `%${v}%`).join('、') }} ——
          如果它前面还写了「标签:」，删掉变量后会剩下一个悬空的「标签:」，建议一并去掉。
        </p>

        <div class="ts-preview">
          <div class="ts-preview-icon" :style="{ background: previewIcon.bg, color: previewIcon.fg }">
            {{ previewIcon.text }}
          </div>
          <div class="ts-preview-bubble">{{ preview || '—' }}</div>
          <span class="ts-preview-len">{{ (preview || '').length }}/127</span>
        </div>
        <p class="ts-hint">
          预览与托盘实际显示使用同一套清洗/截断规则（原生 tooltip 上限 128 字符，中文约 128 字）。
        </p>
      </section>

      <!-- 图标 -->
      <section class="ts-card">
        <div class="ts-card-title">图标外观</div>
        <div class="ts-row">
          <label class="ts-label">形态</label>
          <select class="ts-input short" v-model="cfg.iconMode" @change="save()">
            <option value="date">日期数字（推荐，16px 下清晰）</option>
            <option value="logo">合社日历 logo</option>
          </select>
        </div>
        <div class="ts-row">
          <label class="ts-label">底色</label>
          <select class="ts-input short" v-model="cfg.iconBg" @change="save()">
            <option value="auto">跟随季节 / 节气（自动）</option>
            <option :value="SEASON_COLORS.spring">春 {{ SEASON_COLORS.spring }}</option>
            <option :value="SEASON_COLORS.summer">夏 {{ SEASON_COLORS.summer }}</option>
            <option :value="SEASON_COLORS.autumn">秋 {{ SEASON_COLORS.autumn }}</option>
            <option :value="SEASON_COLORS.winter">冬 {{ SEASON_COLORS.winter }}</option>
          </select>
          <input class="ts-color" type="color" v-model="cfg.iconBg" @change="save()" />
        </div>
        <div class="ts-row">
          <label class="ts-label">文字颜色</label>
          <input class="ts-color" type="color" v-model="cfg.iconFg" @change="save()" />
        </div>
        <div class="ts-row">
          <label class="ts-label">自定义图标文字（留空=今天几号）</label>
          <input class="ts-input short" type="text" maxlength="4" v-model="cfg.iconText" placeholder="30" @change="save()" />
        </div>
      </section>

      <!-- 刷新与菜单 -->
      <section class="ts-card">
        <div class="ts-card-title">刷新与菜单</div>
        <div class="ts-row">
          <label class="ts-label">数据刷新间隔（分钟）</label>
          <input class="ts-num" type="number" min="1" max="120" v-model.number="cfg.refreshMinutes" @change="save()" />
        </div>
        <p class="ts-hint">农历与宜忌按天变化，通常不需要频繁刷新；时间部分由 helper 每秒本地更新。</p>
        <div class="ts-row">
          <label class="ts-label">右键菜单</label>
          <label class="ts-check"><input type="checkbox" v-model="cfg.menu.open" @change="save()" /> 打开合社日历</label>
          <label class="ts-check"><input type="checkbox" v-model="cfg.menu.settings" @change="save()" /> 托盘设置</label>
          <label class="ts-check"><input type="checkbox" v-model="cfg.menu.quit" @change="save()" /> 关闭托盘图标</label>
        </div>
      </section>
    </template>

    <footer class="ts-footer">
      <button class="ts-btn primary" @click="save()">保存并应用</button>
      <button class="ts-btn" @click="refresh">刷新数据</button>
      <button class="ts-btn" @click="turnOff" v-if="cfg.enabled">关闭托盘图标</button>
      <button class="ts-btn ghost" @click="dumpDiag">诊断日志</button>
      <span class="ts-toast" v-if="toast">{{ toast }}</span>
    </footer>

    <section class="ts-card" v-if="showDiag">
      <div class="ts-card-title">诊断（最近 80 条）</div>
      <pre class="ts-diag">{{ diagText || '暂无' }}</pre>
    </section>
  </div>
</template>

<style scoped>
.tray-settings {
  --ts-line: #e6ded2;
  --ts-line-soft: #f1eae0;
  --ts-bg: #faf7f2;
  --ts-card: #ffffff;
  --ts-text: #33302b;
  --ts-dim: #8a8177;
  --ts-accent: #8c4a3c;
  --ts-accent-soft: #f3e7e2;
  --ts-ok: #3f7d58;
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  overflow-y: auto;
  padding: 16px 18px 28px;
  background: var(--ts-bg);
  color: var(--ts-text);
  font-size: 13px;
  line-height: 1.55;
}

@media (prefers-color-scheme: dark) {
  .tray-settings {
    --ts-line: #3a3630;
    --ts-line-soft: #2e2b26;
    --ts-bg: #1f1d1a;
    --ts-card: #27241f;
    --ts-text: #e8e2d8;
    --ts-dim: #9a9187;
    --ts-accent: #c98a72;
    --ts-accent-soft: #352c27;
    --ts-ok: #7fb894;
  }
}

.ts-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.ts-title {
  font-size: 15px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
}

.ts-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #c2b6a6;
  display: inline-block;
}
.ts-dot.on {
  background: #3f7d58;
}

.ts-notice {
  margin-bottom: 12px;
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid #d9c9a8;
  background: #fbf3e2;
  color: #7a6428;
  font-size: 12px;
}

.ts-card {
  background: var(--ts-card);
  border: 1px solid var(--ts-line);
  border-radius: 10px;
  padding: 12px 14px;
  margin-bottom: 12px;
}

.ts-card-title {
  font-weight: 600;
  margin-bottom: 10px;
  font-size: 13px;
}

.ts-status-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 6px 14px;
  margin-bottom: 10px;
}
.ts-status-grid > div {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  border-bottom: 1px dashed var(--ts-line-soft);
  padding: 3px 0;
}
.ts-status-grid label {
  color: var(--ts-dim);
}

.ts-swatch {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 2px;
  margin-right: 6px;
  border: 1px solid var(--ts-line);
  vertical-align: -1px;
}

.ts-tooltip-line {
  margin-top: 8px;
}
.ts-tooltip-line label {
  color: var(--ts-dim);
  font-size: 12px;
}
.ts-tooltip-box {
  margin-top: 4px;
  padding: 7px 10px;
  background: var(--ts-line-soft);
  border-radius: 6px;
  word-break: break-all;
  font-family: ui-monospace, Consolas, monospace;
  font-size: 12px;
}

.ts-error {
  margin-top: 8px;
  color: #b04a3a;
  font-size: 12px;
}

.ts-switch {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  cursor: pointer;
}

.ts-hint {
  margin: 8px 0 0;
  color: var(--ts-dim);
  font-size: 12px;
}

.ts-warn {
  margin: 6px 0 0;
  color: #8a6420;
  font-size: 12px;
}

.ts-hint code,
.ts-warn code {
  padding: 1px 4px;
  border-radius: 3px;
  background: var(--ts-line-soft);
  font-size: 11px;
}

.ts-chips {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(178px, 1fr));
  gap: 6px;
  margin-bottom: 10px;
}

.ts-chip {
  display: grid;
  grid-template-columns: auto 1fr;
  grid-template-rows: auto auto;
  gap: 0 6px;
  align-items: center;
  padding: 6px 8px;
  border: 1px solid var(--ts-line);
  border-radius: 8px;
  cursor: pointer;
  background: var(--ts-card);
}
.ts-chip.on {
  border-color: var(--ts-accent);
  background: var(--ts-accent-soft);
}
.ts-chip input {
  grid-row: 1 / span 2;
  margin: 0;
}
.ts-chip-name {
  font-size: 12px;
  font-weight: 600;
}
.ts-chip-sample {
  font-size: 11px;
  color: var(--ts-dim);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ts-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin: 8px 0;
}
.ts-row.column {
  flex-direction: column;
  align-items: stretch;
}

.ts-label {
  color: var(--ts-dim);
  min-width: 150px;
}

.ts-input,
.ts-num,
.ts-color {
  background: var(--ts-bg);
  color: var(--ts-text);
  border: 1px solid var(--ts-line);
  border-radius: 6px;
  padding: 5px 8px;
  font-size: 12px;
  font-family: inherit;
}
.ts-input {
  flex: 1;
  min-width: 180px;
}
.ts-input.short {
  flex: 0 0 auto;
  min-width: 150px;
}
.ts-num {
  width: 66px;
}
.ts-color {
  width: 40px;
  height: 28px;
  padding: 2px;
}

.ts-check {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
}

.ts-preview {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 12px;
  padding: 10px 12px;
  border: 1px dashed var(--ts-line);
  border-radius: 8px;
  background: var(--ts-line-soft);
}
.ts-preview-icon {
  width: 30px;
  height: 30px;
  border-radius: 7px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 17px;
  flex: 0 0 auto;
}
.ts-preview-bubble {
  flex: 1;
  background: var(--ts-card);
  border: 1px solid var(--ts-line);
  border-radius: 6px;
  padding: 6px 9px;
  font-family: ui-monospace, Consolas, monospace;
  font-size: 12px;
  word-break: break-all;
}
.ts-preview-len {
  color: var(--ts-dim);
  font-size: 11px;
  flex: 0 0 auto;
}

.ts-footer {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.ts-btn {
  padding: 6px 14px;
  border-radius: 7px;
  border: 1px solid var(--ts-line);
  background: var(--ts-card);
  color: var(--ts-text);
  font-size: 12px;
  cursor: pointer;
  font-family: inherit;
}
.ts-btn:hover {
  border-color: var(--ts-accent);
}
.ts-btn.primary {
  background: var(--ts-accent);
  border-color: var(--ts-accent);
  color: #fff;
}
.ts-btn.ghost {
  background: transparent;
}

.ts-toast {
  color: var(--ts-ok);
  font-size: 12px;
}

.ts-diag {
  max-height: 260px;
  overflow: auto;
  margin: 0;
  padding: 8px;
  background: var(--ts-line-soft);
  border-radius: 6px;
  font-size: 11px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
