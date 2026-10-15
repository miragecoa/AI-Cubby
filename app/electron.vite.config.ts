import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        input: {
          main: resolve(__dirname, 'backend/main.ts'),
          'content-worker': resolve(__dirname, 'backend/ai/content-worker.ts'),
          'search-body-worker': resolve(__dirname, 'backend/search-body-worker.ts'),
        },
        output: {
          entryFileNames: '[name].js'
        }
      }
    },
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'backend/preload.ts'),
          drawer: resolve(__dirname, 'backend/drawer-preload.ts'),
          drawerSettings: resolve(__dirname, 'backend/drawer-settings-preload.ts'),
          clipboard: resolve(__dirname, 'backend/clipboard-preload.ts'),
          iconPicker: resolve(__dirname, 'backend/icon-picker-preload.ts'),
        },
        output: {
          entryFileNames: '[name].js'
        }
      }
    },
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    root: resolve(__dirname, 'frontend'),
    server: {
      port: 5174
    },
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'frontend/index.html')
      }
    },
    resolve: {
      alias: {
        '@': resolve(__dirname, 'frontend/src')
      }
    },
    plugins: [vue()]
  }
})
