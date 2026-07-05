<template>
  <div v-if="tips.length > 0" class="tips-wrap">
    <button class="tips-toggle" @click="toggle">
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline v-if="expanded" points="15 18 9 12 15 6" />
        <polyline v-else points="9 18 15 12 9 6" />
      </svg>
    </button>
    <div v-if="expanded" class="tips-text-wrap">
      <span class="tips-text" :key="currentIndex" @click="openCurrentTip">{{ currentText }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { Converter } from 'opencc-js'
import type { TipSummary } from '../composables/useTips'

const props = defineProps<{ tips: TipSummary[] }>()
const { locale } = useI18n()
const isZh = computed(() => locale.value === 'zh' || locale.value === 'zht')
const isZht = computed(() => locale.value === 'zht')
const s2t = Converter({ from: 'cn', to: 'twp' })

const expanded = ref(true)
const shuffledOrder = ref<number[]>([])
const queuePos = ref(0)
let timer: ReturnType<typeof setInterval> | null = null

function shuffle(len: number): number[] {
  const arr = Array.from({ length: len }, (_, i) => i)
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

const currentIndex = computed(() => {
  if (!shuffledOrder.value.length) return 0
  return shuffledOrder.value[queuePos.value % shuffledOrder.value.length]
})

const currentText = computed(() => {
  if (!props.tips.length) return ''
  const tip = props.tips[currentIndex.value % props.tips.length]
  const text = isZh.value ? tip.title_zh : (tip.title_en || tip.title_zh)
  return isZht.value ? s2t(text) : text
})

function openCurrentTip() {
  if (!props.tips.length) return
  const tip = props.tips[currentIndex.value % props.tips.length]
  const lang = isZh.value ? 'zh' : 'en'
  window.api.app.openUrl(`https://aicubby.app/${lang}/tips/${tip.slug}`)
}

function toggle() {
  expanded.value = !expanded.value
  try { localStorage.setItem('tips_expanded', expanded.value ? '1' : '0') } catch {}
}

onMounted(() => {
  try { const v = localStorage.getItem('tips_expanded'); if (v === '0') expanded.value = false } catch {}
  if (props.tips.length > 0) shuffledOrder.value = shuffle(props.tips.length)
  watch(() => props.tips.length, (len) => {
    if (len > 0 && shuffledOrder.value.length !== len) {
      shuffledOrder.value = shuffle(len)
      queuePos.value = 0
    }
  })
  timer = setInterval(() => {
    if (props.tips.length <= 1) return
    const next = queuePos.value + 1
    if (next >= shuffledOrder.value.length) {
      shuffledOrder.value = shuffle(props.tips.length)
      queuePos.value = 0
    } else {
      queuePos.value = next
    }
  }, 20000)
})

onUnmounted(() => { if (timer) clearInterval(timer) })
</script>

<style scoped>
.tips-wrap {
  display: flex;
  align-items: center;
  flex-shrink: 1;
  min-width: 0;
  height: 100%;
  -webkit-app-region: drag;
}
.tips-toggle {
  flex-shrink: 0;
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.25);
  cursor: pointer;
  padding: 2px 4px;
  line-height: 0;
  display: flex;
  align-items: center;
  -webkit-app-region: no-drag;
}
.tips-toggle:hover { color: rgba(255, 255, 255, 0.5); }
.tips-text-wrap {
  overflow: hidden;
  min-width: 0;
  cursor: default;
  -webkit-app-region: drag;
}
.tips-text {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.35);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: inline-block;
  max-width: 100%;
  animation: tips-fade 20s infinite;
  cursor: pointer;
  -webkit-app-region: no-drag;
}
@keyframes tips-fade {
  0%, 8% { opacity: 0; }
  15%, 85% { opacity: 1; }
  92%, 100% { opacity: 0; }
}
.tips-text-wrap:hover .tips-text {
  color: var(--accent, #6366f1);
  animation: none;
  opacity: 1;
}
</style>
