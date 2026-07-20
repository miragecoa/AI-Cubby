import { ref } from 'vue'

export interface ConfirmDialogOptions {
  title: string
  message: string
  confirmText: string
  cancelText: string
  danger?: boolean
}

interface PendingConfirm extends ConfirmDialogOptions {
  resolve: (accepted: boolean) => void
}

export const pendingConfirm = ref<PendingConfirm | null>(null)

export function showConfirm(options: ConfirmDialogOptions): Promise<boolean> {
  if (pendingConfirm.value) pendingConfirm.value.resolve(false)
  return new Promise(resolve => {
    pendingConfirm.value = { ...options, resolve }
  })
}

export function settleConfirm(accepted: boolean): void {
  const pending = pendingConfirm.value
  if (!pending) return
  pendingConfirm.value = null
  pending.resolve(accepted)
}
