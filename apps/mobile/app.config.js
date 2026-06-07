const appJson = require('./app.json');

module.exports = ({ config }) => {
  const app = appJson.expo || config;
  const apiUrl = process.env.EXPO_PUBLIC_LEWORD_API_URL || app.extra?.lewordApiBaseUrl;
  const plugins = [
    ...(app.plugins || []),
    'expo-secure-store',
    './plugins/withAndroidCleartextNetwork',
  ].filter((plugin, index, list) => list.indexOf(plugin) === index);

  return {
    ...config,
    ...app,
    plugins,
    extra: {
      ...(app.extra || {}),
      lewordApiBaseUrl: apiUrl,
      eas: {
        ...(app.extra?.eas || {}),
        projectId: process.env.EXPO_PROJECT_ID || 'e27ca560-8927-46fe-b601-43fc6d0648b3',
      },
    },
  };
};
