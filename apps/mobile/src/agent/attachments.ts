import { Alert } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { readAsStringAsync } from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";

/**
 * Pièces jointes du chat : photos (galerie ou appareil) et PDF. Elles sont envoyées à l'agent
 * (qui les lit) et restent sur le téléphone ; l'agent peut ensuite les classer dans un bien.
 */
export type Attachment = { id: string; name: string; uri: string; kind: "image" | "pdf"; mime: string; base64: string };

// Taille maximale après encodage : au-delà, la requête vers l'agent devient trop lourde.
const MAX_IMAGE_B64 = 3_500_000;
const MAX_PDF_B64 = 9_000_000;

let seq = 0;
const newId = () => `pj-${Date.now().toString(36).slice(-4)}${(seq++).toString(36)}`;

function tooBig(name: string) {
  Alert.alert("Fichier trop lourd", `« ${name} » dépasse la taille acceptée. Essayez une photo moins lourde ou un PDF plus court.`);
}

export async function pickImages(fromCamera: boolean): Promise<Attachment[]> {
  const perm = fromCamera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    Alert.alert("Accès refusé", fromCamera ? "Autorisez l'appareil photo dans les réglages de l'iPhone." : "Autorisez l'accès aux photos dans les réglages de l'iPhone.");
    return [];
  }
  const opts: ImagePicker.ImagePickerOptions = { quality: 0.5, base64: true, mediaTypes: ["images"] };
  const res = fromCamera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync({ ...opts, allowsMultipleSelection: true, selectionLimit: 4 });
  if (res.canceled) return [];
  const out: Attachment[] = [];
  for (const a of res.assets) {
    const name = a.fileName ?? "Photo.jpg";
    if (!a.base64) continue;
    if (a.base64.length > MAX_IMAGE_B64) {
      tooBig(name);
      continue;
    }
    out.push({ id: newId(), name, uri: a.uri, kind: "image", mime: a.mimeType === "image/png" ? "image/png" : "image/jpeg", base64: a.base64 });
  }
  return out;
}

export async function pickPdf(): Promise<Attachment[]> {
  const res = await DocumentPicker.getDocumentAsync({ type: "application/pdf", copyToCacheDirectory: true });
  if (res.canceled) return [];
  const doc = res.assets[0]!;
  const base64 = await readAsStringAsync(doc.uri, { encoding: "base64" });
  if (base64.length > MAX_PDF_B64) {
    tooBig(doc.name);
    return [];
  }
  return [{ id: newId(), name: doc.name, uri: doc.uri, kind: "pdf", mime: "application/pdf", base64 }];
}

/** Blocs de contenu au format Claude (image ou document PDF). */
export const toContentBlock = (a: Attachment) =>
  a.kind === "image"
    ? { type: "image", source: { type: "base64", media_type: a.mime, data: a.base64 } }
    : { type: "document", source: { type: "base64", media_type: "application/pdf", data: a.base64 }, title: a.name };
