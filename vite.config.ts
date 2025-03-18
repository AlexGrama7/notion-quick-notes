import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { visualizer } from "rollup-plugin-visualizer";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;
// @ts-expect-error process is a nodejs global
const isProd = process.env.NODE_ENV === 'production';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // Add visualizer to analyze bundle size in production
    isProd && visualizer({
      open: false,
      gzipSize: true,
      brotliSize: true,
      filename: 'dist/stats.html'
    })
  ].filter(Boolean),

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },

  // Add build optimization options
  build: {
    // Enable source maps for production builds to simplify debugging
    sourcemap: isProd ? false : true,
    // Configure rollup options
    rollupOptions: {
      output: {
        // Chunk strategy to generate separate chunks for each component
        manualChunks: (id: string) => {
          // Group all node_modules in one chunk
          if (id.indexOf('node_modules') >= 0) {
            return 'vendor';
          }
          // Split components into separate chunks
          if (id.indexOf('/components/') >= 0) {
            const component = id.split('/components/')[1].split('.')[0];
            return `component-${component}`;
          }
          // Keep the rest as is
          return 'index';
        },
        // Compress CSS and JS assets better
        chunkFileNames: isProd ? 'assets/[name]-[hash].js' : 'assets/[name].js',
        entryFileNames: isProd ? 'assets/[name]-[hash].js' : 'assets/[name].js',
        assetFileNames: isProd ? 'assets/[name]-[hash].[ext]' : 'assets/[name].[ext]'
      }
    },
    // Minification options
    minify: isProd ? 'terser' : false,
    // Reduce CSS size
    cssMinify: isProd
  },
  
  // Enable differential loading for modern browsers
  optimizeDeps: {
    esbuildOptions: {
      target: 'es2020'
    }
  }
});
