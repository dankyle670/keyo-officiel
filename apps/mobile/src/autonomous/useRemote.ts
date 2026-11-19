import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";

/** Donnée lue sur le serveur, rechargée à chaque retour sur l'écran. */
export function useRemote<T>(load: () => Promise<T>) {
  const [data, setData] = useState<T | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setData(await load());
      setError(undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Serveur Keyo indisponible.");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );
  return { data, error, loading, reload, setData };
}
