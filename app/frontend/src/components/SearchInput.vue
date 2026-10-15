<template>
  <input
    ref="input"
    :value="draft"
    @input="onInput"
    @compositionstart="composing = true; cancelPending()"
    @compositionend="onCompositionEnd"
    @keydown="onKeyDown"
    @keyup="onKeyUp"
    @blur="onBlur"
  />
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { deferIdleWork } from '../utils/image-cache'

const props = defineProps<{ modelValue: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string]; submit: [value: string] }>()
const input = ref<HTMLInputElement | null>(null)
const draft = ref(props.modelValue)
let composing = false
let deleting = false
let timer: ReturnType<typeof setTimeout> | undefined

function cancelPending() {
  clearTimeout(timer)
}

function publish() {
  cancelPending()
  emit('update:modelValue', draft.value)
}

function schedule() {
  cancelPending()
  // Keep keystrokes local so the resource page does not render on every letter.
  timer = setTimeout(publish, 180)
}

function onInput(event: Event) {
  draft.value = (event.target as HTMLInputElement).value
  deferIdleWork()
  if (!composing && !deleting && !(event as InputEvent).isComposing) schedule()
}

function onKeyDown(event: KeyboardEvent) {
  if (event.key === 'Enter') onEnter(event)
  if (event.key !== 'Backspace' && event.key !== 'Delete') return
  deleting = true
  cancelPending()
  // Do not start a search in the gap before Windows begins key repeat.
  deferIdleWork(600)
}

function onKeyUp(event: KeyboardEvent) {
  if (event.key !== 'Backspace' && event.key !== 'Delete') return
  deleting = false
  deferIdleWork()
  if (!composing) schedule()
}

function onBlur() {
  deleting = false
  if (!composing && draft.value !== props.modelValue) schedule()
}

function onCompositionEnd(event: CompositionEvent) {
  composing = false
  draft.value = (event.target as HTMLInputElement).value
  if (!deleting) schedule()
}

function onEnter(event: KeyboardEvent) {
  if (composing || event.isComposing || event.keyCode === 229) return
  publish()
  emit('submit', draft.value)
}

function clear() {
  draft.value = ''
  composing = false
  deleting = false
  publish()
}

watch(() => props.modelValue, value => {
  cancelPending()
  draft.value = value
})
onBeforeUnmount(cancelPending)
defineExpose({ focus: () => input.value?.focus(), clear })
</script>
