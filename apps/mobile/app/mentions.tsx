import { View } from "react-native";
import { color, radius } from "@keyo/tokens";
import { SubScreen, Text } from "@/ui";

const SECTIONS: { title: string; body: string }[] = [
  { title: "Éditeur", body: "Keyo est une application éditée par DK Group." },
  { title: "Paiements", body: "Les loyers sont encaissés par un prestataire de paiement agréé et versés directement au propriétaire. DK Group ne reçoit, ne conserve ni ne transfère les fonds." },
  { title: "Données personnelles", body: "Keyo traite les données nécessaires à la gestion de vos biens : identité, téléphone, biens, contrats, paiements, documents. Vous pouvez les exporter et les effacer à tout moment depuis le Profil." },
  { title: "Agent Keyo", body: "Les demandes adressées à l'agent et les données utiles à la réponse sont transmises à notre prestataire d'intelligence artificielle, uniquement pour produire la réponse. Les repères fiscaux et juridiques donnés sont indicatifs et ne remplacent pas un conseiller." },
];

/** Conditions et confidentialité (texte provisoire). */
export default function Mentions() {
  return (
    <SubScreen title="Conditions" subtitle="Version provisoire, en cours de validation juridique">
      {SECTIONS.map((s) => (
        <View key={s.title} style={{ backgroundColor: color.surfaceRaised, borderRadius: radius.card, padding: 18, marginTop: 12, gap: 6 }}>
          <Text variant="rowTitle">{s.title}</Text>
          <Text variant="rowSubtitle" tone="inkMuted">
            {s.body}
          </Text>
        </View>
      ))}
    </SubScreen>
  );
}
