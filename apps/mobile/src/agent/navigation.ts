import { router } from "expo-router";

/** Ouvre l'onglet Agent et lui envoie une demande toute prête. */
export const askAgent = (prompt: string) => router.navigate({ pathname: "/(owner)/assistant", params: { prompt, k: String(Date.now()) } });
