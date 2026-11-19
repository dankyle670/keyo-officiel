import { useMemo, useState } from "react";
import { router } from "expo-router";
import { Building2, Search, User } from "lucide-react-native";
import { color } from "@keyo/tokens";
import { search } from "@/data/selectors";
import { useOwnerState } from "@/data/store";
import { IconCircle, ListRow, SubScreen, Text, TextField } from "@/ui";

/** Recherche dans les biens et les locataires (nom, quartier, téléphone). */
export default function SearchScreen() {
  const [q, setQ] = useState("");
  const state = useOwnerState((s) => s);
  const hits = useMemo(() => search(state, q), [state, q]);

  return (
    <SubScreen title="Rechercher">
      <TextField
        label="Bien, locataire, quartier ou téléphone"
        value={q}
        onChangeText={setQ}
        autoFocus
        returnKeyType="search"
        autoCorrect={false}
        leading={<Search size={20} strokeWidth={1.8} color={color.inkMuted} />}
      />
      {q.trim().length >= 2 && hits.length === 0 && (
        <Text variant="rowSubtitle" tone="inkMuted" style={{ marginTop: 20 }}>
          Aucun résultat pour « {q.trim()} ».
        </Text>
      )}
      {hits.map((h, i) => (
        <ListRow
          key={`${h.kind}-${h.id}`}
          divider={i > 0}
          leading={<IconCircle icon={h.kind === "asset" ? Building2 : User} />}
          title={h.title}
          subtitle={h.subtitle}
          chevron
          onPress={() => router.push(h.href as never)}
        />
      ))}
    </SubScreen>
  );
}
