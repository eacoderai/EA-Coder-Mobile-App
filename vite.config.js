import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'path';
import { fileURLToPath } from 'url';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const functionsUrl = env.VITE_FUNCTIONS_URL || '';
  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: 3001,
      hmr: {
        overlay: false,
      },
      proxy: functionsUrl
        ? {
            '/server': {
              target: functionsUrl,
              changeOrigin: true,
              secure: true,
              rewrite: (p) => p.replace(/^\/server\//, ''),
            },
          }
        : undefined,
    },
    build: {
      outDir: 'dist',
      sourcemap: true,
      chunkSizeWarningLimit: 1600,
      commonjsOptions: {
        esmExternals: true
      },
      rollupOptions: {
        onwarn(warning, warn) {
          if (warning.code === 'UNRESOLVED_IMPORT') return;
          warn(warning);
        }
      }
    },
  };
});