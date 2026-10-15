<template>
  <input
    ref="input"
    :value="draft"
    @input="onInput"
    @compositionstart="composing = true; cancelPending()"
    @compositionend="onCompositionEnd"
    @keydown.enter="onEnter"
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
  if (!composing && !(event as InputEvent).isComposing) schedule()
}

function onCompositionEnd(event: CompositionEvent) {
  composing = false
  draft.value = (event.target as HTMLInputElement).value
  schedule()
}

function onEnter(event: KeyboardEvent) {
  if (composing || event.isComposing || event.keyCode === 229) return
  publish()
  emit('submit', draft.value)
}

function clear() {
  draft.value = ''
  composing = false
  publish()
}

watch(() => props.modelValue, value => {
  cancelPending()
  draft.value = value
})
onBeforeUnmount(cancelPending)
defineExpose({ focus: () => input.value?.focus(), clear })
</script>
