import type { ExpoConfig } from "expo/config";

const config: ExpoConfig = {
  name: "Keyo",
  slug: "keyo",
  scheme: "keyo",
  version: "0.1.0",
  orientation: "portrait",
  userInterfaceStyle: "light",
  backgroundColor: "#0B1B33",
  ios: {
    bundleIdentifier: "com.dkgroup.keyo",
    supportsTablet: false,
  },
  android: {
    package: "com.dkgroup.keyo",
  },
  plugins: [
    "expo-router",
    "expo-font",
    ["expo-splash-screen", { backgroundColor: "#0B1B33", image: "./assets/keyo-mark.png", imageWidth: 112 }],
    // Carte 3D : nécessite un development build (EAS), pas Expo Go.
    ["@rnmapbox/maps", { RNMapboxMapsVersion: "11.16.0" }],
  ],
  experiments: { typedRoutes: true },
};

export default config;
