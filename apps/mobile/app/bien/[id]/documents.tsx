import { useMemo, useState } from "react";
import { Alert, Share, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import { FileText, Image as ImageIcon, Landmark, Receipt, ScrollText, Upload, type LucideIcon } from "lucide-react-native";
import type { Document } from "@keyo/shared";
import { fullDate } from "@/data/period";
import { actions, useOwnerState } from "@/data/store";
import { Button, EmptyState, IconCircle, ListRow, SectionTitle, Sheet, SheetAction, SubScreen, Text } from "@/ui";

type Kind = Document["kind"];
const GROUPS: { kind: Kind; title: string; icon: LucideIcon }[] = [
  { kind: "TITLE_DEED", title: "Titre de propriété", icon: Landmark },
  { kind: "LEASE", title: "Baux", icon: ScrollText },
  { kind: "INVENTORY", title: "États des lieux", icon: FileText },
  { kind: "RECEIPT", title: "Quittances", icon: Receipt },
  { kind: "INVOICE", title: "Factures", icon: FileText },
  { kind: "PHOTO", title: "Photos", icon: ImageIcon },
  { kind: "APPRAISAL", title: "Expertises et avis de valeur", icon: Landmark },
];
const ADD_LABEL: Partial<Record<Kind, string>> = {
  TITLE_DEED: "Titre foncier ou ACD",
  LEASE: "Bail signé",
  INVENTORY: "État des lieux",
  INVOICE: "Facture",
  PHOTO: "Photo",
  APPRAISAL: "Rapport d'expertise",
};

/** Coffre-fort du bien : titre foncier ou ACD, baux, quittances, factures, photos. */
export default function Documents() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const asset = useOwnerState((s) => s.assets.find((a) => a.id === id));
  const all = useOwnerState((s) => s.documents);
  const docs = useMemo(() => all.filter((d) => d.assetId === id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [all, id]);
  const [picker, setPicker] = useState(false);

  const add = async (kind: Kind) => {
    setPicker(false);
    const res = await DocumentPicker.getDocumentAsync({ type: kind === "PHOTO" ? "image/*" : ["application/pdf", "image/*"], copyToCacheDirectory: true });
    if (res.canceled || !res.assets[0] || !id) return;
    const file = res.assets[0];
    // Côté API : envoi vers le stockage S3, chiffré au repos, accès journalisés.
    actions.addDocument({ assetId: id, kind, label: file.name.replace(/\.[a-z0-9]+$/i, ""), url: file.uri });
  };

  const open = (d: Document) => {
    if (d.url) return Share.share({ url: d.url, title: d.label });
    Alert.alert(d.label, d.kind === "RECEIPT" ? "La quittance PDF sera générée par le serveur à la confirmation du paiement." : "Ce document n'a pas encore de fichier.");
  };

  const remove = (d: Document) =>
    Alert.alert("Supprimer ce document ?", d.label, [
      { text: "Annuler", style: "cancel" },
      { text: "Supprimer", style: "destructive", onPress: () => actions.deleteDocument(d.id) },
    ]);

  return (
    <SubScreen title="Documents" subtitle={asset?.name} footer={<Button label="Ajouter un document" icon={Upload} onPress={() => setPicker(true)} />}>
      {docs.length === 0 && <EmptyState title="Coffre-fort vide" body="Gardez ici le titre foncier ou l'ACD, les baux signés, les états des lieux et les factures. Les quittances s'ajoutent automatiquement." />}
      {GROUPS.map((g) => {
        const items = docs.filter((d) => d.kind === g.kind);
        if (items.length === 0) return null;
        return (
          <View key={g.kind}>
            <SectionTitle>{g.title}</SectionTitle>
            {items.map((d, i) => (
              <ListRow
                key={d.id}
                divider={i > 0}
                leading={<IconCircle icon={g.icon} />}
                title={d.label}
                subtitle={`Ajouté le ${fullDate(d.createdAt)}`}
                chevron
                onPress={() => open(d)}
                onLongPress={() => remove(d)}
              />
            ))}
          </View>
        );
      })}
      {docs.length > 0 && (
        <Text variant="caption" tone="inkMuted" style={{ marginTop: 20 }}>
          Touchez un document pour l'ouvrir ou le partager. Appui long pour le supprimer.
        </Text>
      )}
      <Sheet visible={picker} onClose={() => setPicker(false)} title="Type de document">
        {(Object.keys(ADD_LABEL) as Kind[]).map((k) => (
          <SheetAction key={k} label={ADD_LABEL[k]!} onPress={() => add(k)} />
        ))}
      </Sheet>
    </SubScreen>
  );
}
