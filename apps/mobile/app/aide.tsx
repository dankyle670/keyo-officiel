import { View } from "react-native";
import { color, radius } from "@keyo/tokens";
import { askAgent } from "@/agent/navigation";
import { Button, SectionTitle, SubScreen, Text } from "@/ui";

const FAQ: { q: string; a: string }[] = [
  { q: "Quand un loyer est-il marqué « payé » ?", a: "Seulement quand l'opérateur de paiement confirme l'encaissement. Une capture d'écran ou un message ne suffit pas." },
  { q: "Où va l'argent des loyers ?", a: "Directement sur votre compte, via notre partenaire de paiement agréé. Keyo ne détient jamais vos fonds." },
  { q: "Que fait l'agent Keyo ?", a: "Il consulte vos biens et agit pour vous : dépenses, relances, devis, entretien, missions sur le terrain, rapport du mois et contrôle des pièces. Il vous demande votre accord avant de modifier quoi que ce soit (réglable dans le Profil)." },
  { q: "Qu'est-ce que le contrôle de gestion ?", a: "Une vérification de ce qu'une agence suivrait pour vous : bail signé, état des lieux, assurance, enregistrement, déclarations, retards, contrats qui se terminent, incidents bloqués et entretien." },
  { q: "Mes données sont-elles en sécurité ?", a: "Elles restent sur votre téléphone tant que la synchronisation n'est pas activée. Vous pouvez les exporter ou les effacer depuis le Profil, et verrouiller l'app avec Face ID." },
];

/** Centre d'aide : questions fréquentes et contact. */
export default function Aide() {
  return (
    <SubScreen title="Aide" subtitle="Questions fréquentes">
      {FAQ.map((f) => (
        <View key={f.q} style={{ backgroundColor: color.surfaceRaised, borderRadius: radius.card, padding: 18, marginTop: 12, gap: 6 }}>
          <Text variant="rowTitle">{f.q}</Text>
          <Text variant="rowSubtitle" tone="inkMuted">
            {f.a}
          </Text>
        </View>
      ))}
      <SectionTitle>Une autre question ?</SectionTitle>
      <Text variant="body" tone="inkMuted" style={{ marginTop: 8, marginBottom: 16 }}>
        L'agent Keyo répond à toute heure sur l'utilisation de l'app et sur vos biens. L'assistance par l'équipe Keyo arrive avec la version publique.
      </Text>
      <Button label="Poser ma question à l'agent" onPress={() => askAgent("J'ai une question sur l'utilisation de Keyo.")} />
    </SubScreen>
  );
}
