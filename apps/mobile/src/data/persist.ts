import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Persistance locale (hors ligne d'abord). Toute erreur de lecture ou d'écriture est absorbée :
 * l'app doit fonctionner même si le stockage est indisponible.
 */
export async function load<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

let timers: Record<string, ReturnType<typeof setTimeout>> = {};
/** Écriture différée de 300 ms pour regrouper les mises à jour rapprochées. */
export function save(key: string, value: unknown) {
  clearTimeout(timers[key]);
  timers[key] = setTimeout(() => {
    AsyncStorage.setItem(key, JSON.stringify(value)).catch(() => {});
  }, 300);
}

export async function remove(key: string) {
  clearTimeout(timers[key]);
  await AsyncStorage.removeItem(key).catch(() => {});
}

export const KEYS = { session: "keyo.session.v1", owner: "keyo.owner.v1", agent: "keyo.agent.v1" } as const;
