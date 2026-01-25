import { CapacitorConfig } from '@capacitor/cli';

const devServerUrl = process.env.CAP_DEV_SERVER_URL ? process.env.CAP_DEV_SERVER_URL.trim() : undefined;
const useDevServer = !!devServerUrl;

const config: CapacitorConfig = {
  appId: 'com.eacoder.app',
  appName: 'EA Coder',
  webDir: 'dist',
  server: useDevServer
    ? {
        url: devServerUrl,
        cleartext: true,
        androidScheme: 'https'
      }
    : {
        androidScheme: 'https'
      }
};

export default config;