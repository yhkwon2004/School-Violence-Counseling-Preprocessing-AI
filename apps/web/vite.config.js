import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const configuredPreviewHosts = process.env.VITE_PREVIEW_ALLOWED_HOSTS?.trim();
const previewAllowedHosts =
  configuredPreviewHosts === '*'
    ? true
    : configuredPreviewHosts
      ? configuredPreviewHosts
          .split(',')
          .map((host) => host.trim())
          .filter(Boolean)
      : [];

export default defineConfig({
  plugins: [react()],
  preview: {
    allowedHosts: previewAllowedHosts,
  },
});
