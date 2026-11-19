import { useMemo } from "react";
import { Share, View } from "react-native";
import { formatMoney, PASSPORT_LEVEL_LABEL } from "@keyo/shared";
import { color, radius } from "@keyo/tokens";
import { KeyoMark } from "@/brand/Logo";
import { fullDate, today } from "@/data/period";
import { passportOf } from "@/data/selectors";
import { useUser } from "@/data/session";
import { useOwnerState } from "@/data/store";
import { Button, SubScreen, Text } from "@/ui";

/** Attestation de revenus locatifs : ce que Keyo certifie, prête à transmettre à une banque. */
export default function Attestation() {
  const user = useUser();
  const state = useOwnerState((s) => s);
  const on = today();
  const p = useMemo(() => passportOf(state, user.id, user.displayCurrency, on), [state, user.id, user.displayCurrency, on]);
  const name = `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim();
  const from = `${Number(on.slice(0, 4)) - 1}${on.slice(4)}`;
  const ref = `KEYO-${on.replace(/-/g, "")}-${String(p.score).padStart(4, "0")}`;
  const pct = (permille: number) => `${(permille / 10).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`;
  const lines: [string, string][] = [
    ["Loyers encaissés", formatMoney(p.certifiedIncome12m)],
    ["Moyenne mensuelle", formatMoney(p.monthlyCertifiedIncome)],
    ["Taux d'encaissement", p.expected12m.amount ? pct(p.collectionRatePermille) : "–"],
    ["Biens gérés", `${p.assetCount} bien${p.assetCount > 1 ? "s" : ""}, ${p.occupiedUnits} sur ${p.totalUnits} occupé${p.occupiedUnits > 1 ? "s" : ""}`],
    ["Historique Keyo", `${p.monthsOnKeyo} mois`],
    ["Score Keyo", `${p.score} sur 1000, ${PASSPORT_LEVEL_LABEL[p.level].toLowerCase()}`],
  ];
  const text = [
    `Attestation de revenus locatifs Keyo`,
    `${name}, du ${fullDate(from)} au ${fullDate(on)}`,
    ...lines.map(([k, v]) => `${k} : ${v}`),
    `Référence ${ref}. Seuls les loyers confirmés par l'opérateur de paiement sont certifiés.`,
  ].join("\n");

  return (
    <SubScreen title="Attestation" footer={<Button label="Envoyer l'attestation" onPress={() => Share.share({ message: text })} />}>
      <View style={{ marginTop: 16, padding: 22, borderRadius: radius.card, backgroundColor: color.surfaceRaised, gap: 14 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <KeyoMark size={28} />
          <Text variant="rowTitle">Attestation de revenus locatifs</Text>
        </View>
        <Text variant="body">{`${name || "Propriétaire"}, du ${fullDate(from)} au ${fullDate(on)}.`}</Text>
        <View style={{ height: 1, backgroundColor: color.line }} />
        {lines.map(([k, v]) => (
          <View key={k} style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
            <Text variant="rowSubtitle" tone="inkMuted">
              {k}
            </Text>
            <Text variant="rowTitle" tabular style={{ flexShrink: 1, textAlign: "right" }}>
              {v}
            </Text>
          </View>
        ))}
        <View style={{ height: 1, backgroundColor: color.line }} />
        <Text variant="caption" tone="inkMuted">
          {`Référence ${ref}. Seuls les loyers confirmés par l'opérateur de paiement (webhook) sont certifiés ; les montants déclarés ne figurent pas sur cette attestation.`}
        </Text>
      </View>
      <Text variant="caption" tone="inkMuted" style={{ marginTop: 16 }}>
        La version PDF signée, avec QR code et page de vérification en ligne, sera disponible avec le serveur Keyo.
      </Text>
    </SubScreen>
  );
}
