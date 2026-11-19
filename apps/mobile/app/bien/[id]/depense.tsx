import { useState } from "react";
import { KeyboardAvoidingView, Platform, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import DateTimePicker from "@react-native-community/datetimepicker";
import { money } from "@keyo/shared";
import { color } from "@keyo/tokens";
import { today } from "@/data/period";
import { actions, useOwnerState } from "@/data/store";
import { Button, Chip, SubScreen, Text, TextField } from "@/ui";

const CATEGORIES = [
  { id: "REPAIR", label: "Travaux" },
  { id: "MAINTENANCE", label: "Entretien" },
  { id: "TAX", label: "Impôts et taxes" },
  { id: "INSURANCE", label: "Assurance" },
  { id: "FEES", label: "Charges" },
  { id: "OTHER", label: "Autre" },
];

/** Saisie d'une dépense sur un bien, pour suivre la rentabilité réelle. */
export default function AddExpense() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const asset = useOwnerState((s) => s.assets.find((a) => a.id === id));
  const [category, setCategory] = useState("REPAIR");
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date(`${today()}T12:00:00Z`));
  if (!asset) return <SubScreen title="Dépense">{null}</SubScreen>;
  const isXof = asset.currency === "XOF";
  const minor = Number(amount || 0) * (isXof ? 1 : 100);
  const ok = minor > 0 && label.trim().length > 1;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      <SubScreen
        title="Nouvelle dépense"
        subtitle={asset.name}
        footer={
          <Button
            label="Enregistrer la dépense"
            disabled={!ok}
            onPress={() => {
              actions.addExpense({ assetId: asset.id, category, label: label.trim(), amount: money(minor, asset.currency), date: date.toISOString().slice(0, 10) });
              router.back();
            }}
          />
        }
      >
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 20 }}>
          {CATEGORIES.map((c) => (
            <Chip key={c.id} active={c.id === category} label={c.label} onPress={() => setCategory(c.id)} />
          ))}
        </View>
        <TextField label="Libellé" value={label} onChangeText={setLabel} placeholder="Ex. Réparation du chauffe-eau" />
        <TextField
          label={`Montant (${isXof ? "FCFA" : "€"})`}
          value={amount ? Number(amount).toLocaleString("fr-FR").replace(/\s/g, " ") : ""}
          onChangeText={(t) => setAmount(t.replace(/\D/g, ""))}
          keyboardType="number-pad"
        />
        <View style={{ marginTop: 20, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text variant="rowSubtitle" tone="inkMuted">
            Date
          </Text>
          <DateTimePicker value={date} mode="date" maximumDate={new Date()} display={Platform.OS === "ios" ? "compact" : "default"} locale="fr-FR" onChange={(_, d) => d && setDate(d)} accentColor={color.mintDeep} />
        </View>
      </SubScreen>
    </KeyboardAvoidingView>
  );
}
