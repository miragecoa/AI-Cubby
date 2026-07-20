<template>
  <Teleport to="body">
    <Transition name="confirm-fade">
      <div v-if="pendingConfirm" class="confirm-overlay" @mousedown.self="settleConfirm(false)">
        <section class="confirm-dialog" role="alertdialog" aria-modal="true" :aria-labelledby="titleId" @keydown.esc.prevent="settleConfirm(false)">
          <div class="confirm-icon" :class="{ danger: pendingConfirm.danger }" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4"/><path d="M12 17h.01"/><path d="m10.3 3.6-8 14A2 2 0 0 0 4 20.5h16a2 2 0 0 0 1.7-3l-8-14a2 2 0 0 0-3.4 0Z"/></svg>
          </div>
          <div class="confirm-copy">
            <h2 :id="titleId">{{ pendingConfirm.title }}</h2>
            <p>{{ pendingConfirm.message }}</p>
          </div>
          <div class="confirm-actions">
            <button ref="cancelButton" class="confirm-button secondary" @click="settleConfirm(false)">{{ pendingConfirm.cancelText }}</button>
            <button class="confirm-button" :class="{ danger: pendingConfirm.danger }" @click="settleConfirm(true)">{{ pendingConfirm.confirmText }}</button>
          </div>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { pendingConfirm, settleConfirm } from '../utils/confirm-dialog'

const cancelButton = ref<HTMLButtonElement | null>(null)
const titleId = 'app-confirm-dialog-title'

watch(pendingConfirm, async (pending) => {
  if (!pending) return
  await nextTick()
  cancelButton.value?.focus()
})
</script>

<style scoped>
.confirm-overlay {
  position: fixed;
  inset: 0;
  z-index: 3000;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(5, 5, 16, 0.68);
  backdrop-filter: blur(4px);
}
.confirm-dialog {
  width: min(100%, 390px);
  padding: 20px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: 0 20px 48px rgba(0, 0, 0, 0.4);
  outline: none;
}
.confirm-icon {
  display: grid;
  width: 32px;
  height: 32px;
  place-items: center;
  border: 1px solid color-mix(in srgb, var(--accent) 48%, transparent);
  border-radius: 7px;
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 12%, transparent);
}
.confirm-icon.danger { color: var(--danger, #ef5350); border-color: color-mix(in srgb, var(--danger, #ef5350) 48%, transparent); background: color-mix(in srgb, var(--danger, #ef5350) 12%, transparent); }
.confirm-icon svg { width: 17px; height: 17px; }
.confirm-copy { margin-top: 13px; }
.confirm-copy h2 { margin: 0; color: var(--text); font-size: 16px; font-weight: 650; }
.confirm-copy p { margin: 7px 0 0; color: var(--text-2); font-size: 13px; line-height: 1.55; white-space: pre-wrap; }
.confirm-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 20px; }
.confirm-button { min-width: 76px; padding: 7px 13px; border: 1px solid var(--accent); border-radius: 6px; background: var(--accent); color: #fff; font: inherit; font-size: 13px; cursor: pointer; }
.confirm-button:hover { filter: brightness(1.08); }
.confirm-button.secondary { border-color: var(--border); background: var(--surface-3); color: var(--text-2); }
.confirm-button.secondary:hover { color: var(--text); }
.confirm-button.danger { border-color: var(--danger, #ef5350); background: var(--danger, #ef5350); }
.confirm-fade-enter-active, .confirm-fade-leave-active { transition: opacity .14s ease; }
.confirm-fade-enter-active .confirm-dialog, .confirm-fade-leave-active .confirm-dialog { transition: transform .14s ease; }
.confirm-fade-enter-from, .confirm-fade-leave-to { opacity: 0; }
.confirm-fade-enter-from .confirm-dialog, .confirm-fade-leave-to .confirm-dialog { transform: translateY(5px) scale(.985); }
</style>
