import { defineConfig } from 'vite';
import { resolve } from 'path';
import { readFileSync } from 'fs';

const cliPackage = JSON.parse(readFileSync(resolve(__dirname, '..', 'package.json'), 'utf-8'));

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, 'src/background.ts'),
      output: {
        entryFileNames: 'background.js',
        format: 'es',
      },
    },
    target: 'esnext',
    minify: false,
  },
  define: {
    // Injected at build time; the extension reports a semver range of CLI
    // versions it is compatible with (see src/doctor.ts satisfiesRange).
    // Keep this in sync with the matching @cheezmil/aek-browser CLI version.
    __AEK_BROWSER_COMPAT_RANGE__: JSON.stringify(`>=${cliPackage.version}`),
  },
});