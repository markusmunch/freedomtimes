import { CapacitorConfig } from '@capacitor/cli';

const serverUrl = process.env.CAPACITOR_SERVER_URL?.trim() || 'https://staging.freedomtimes.news';
const usesCleartext = serverUrl.startsWith('http://');

const config: CapacitorConfig = {
  appId: 'news.freedomtimes.app',
  appName: 'Freedom Times',
  webDir: 'cap-web',
  server: {
    url: serverUrl,
    cleartext: usesCleartext,
    androidScheme: usesCleartext ? 'http' : 'https',
  },
  android: {
    allowMixedContent: usesCleartext,
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;