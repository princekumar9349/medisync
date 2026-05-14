const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const path = require("path");

const config = getDefaultConfig(__dirname);

// ─── Expo Go compatibility: mock native-only packages ──────────────────────────
// react-native-mmkv and react-native-nitro-modules require a compiled native
// binary that Expo Go doesn't include. We redirect them to mock files so the
// app loads in Expo Go for UI testing. Production builds use the real modules.
const originalResolver = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (
    moduleName === 'react-native-mmkv' ||
    moduleName === 'react-native-nitro-modules'
  ) {
    return {
      filePath: path.resolve(__dirname, '__mocks__/react-native-mmkv.js'),
      type: 'sourceFile',
    };
  }
  if (originalResolver) {
    return originalResolver(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = withNativeWind(config, { input: "./global.css" });

