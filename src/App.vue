<script lang="ts" setup>
import { onMounted, onUnmounted, ref } from 'vue';
import Calendar from './Calendar/index.vue'
import TraySettings from './settings/TraySettings.vue'

const route = ref('calendar')
const enterAction = ref({})
const isUtools = ref(false)

/** 托盘 helper 的右键菜单点"托盘设置"时会置这个标记（见 src/tray/host.js） */
const OPEN_SETTINGS_FLAG = 'he-calendar-tray-open-settings'
let flagTimer = null

function consumeOpenSettingsFlag() {
  try {
    if (window.utools?.dbStorage?.getItem?.(OPEN_SETTINGS_FLAG)) {
      window.utools.dbStorage.setItem(OPEN_SETTINGS_FLAG, false)
      return true
    }
  } catch {
    /* 忽略 */
  }
  return false
}

onMounted(() => {
  // 浏览器下用 ?page=tray-settings 直接查看设置页（方便网页端验证，不影响插件）
  const page = new URLSearchParams(window.location.search).get('page')
  if (page === 'tray-settings') route.value = 'tray-settings'

  if (window.utools) {
    isUtools.value = true
    document.body.classList.add('is-utools')
    window.utools.onPluginEnter((action) => {
      route.value = action.code || 'calendar'
      enterAction.value = action
    })
    if (consumeOpenSettingsFlag()) route.value = 'tray-settings'
    // 主窗口已经打开着时，右键菜单的"托盘设置"不会触发 onPluginEnter，所以轮询标记
    flagTimer = setInterval(() => {
      if (consumeOpenSettingsFlag()) route.value = 'tray-settings'
    }, 600)
  }
})

onUnmounted(() => {
  if (flagTimer) clearInterval(flagTimer)
})
</script>

<template>
  <div class="app-container" :class="{ 'is-utools': isUtools }">
    <TraySettings v-if="route === 'tray-settings'" @close="route = 'calendar'" />
    <Calendar v-else :enterAction="enterAction"></Calendar>
  </div>
</template>

<style>
.app-container {
  width: 100vw;
  height: 100vh;
  overflow: hidden;
}

/* 响应式布局 - 大屏幕卡片化 */
@media (min-width: 1024px) {
  .app-container:not(.is-utools) {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    box-sizing: border-box;
  }
  
  .app-container:not(.is-utools) > * {
    max-width: 1200px;
    max-height: 800px;
    width: 100%;
    height: 100%;
    border-radius: 16px;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
    overflow: hidden;
  }
}

/* 中等屏幕 */
@media (min-width: 768px) and (max-width: 1023px) {
  .app-container:not(.is-utools) {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    box-sizing: border-box;
  }
  
  .app-container:not(.is-utools) > * {
    max-width: 95%;
    max-height: 95%;
    border-radius: 12px;
    box-shadow: 0 20px 40px -10px rgba(0, 0, 0, 0.2);
    overflow: hidden;
  }
}
</style>
