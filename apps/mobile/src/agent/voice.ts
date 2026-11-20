import * as Speech from "expo-speech";
import { speechChunks } from "@keyo/shared";

/**
 * Voix de l'agent. On prend la meilleure voix française installée sur le téléphone (voix « Premium »
 * ou « Améliorée » d'iOS si le propriétaire l'a téléchargée), avec un débit posé et un ton naturel.
 * Le texte est lu passage par passage : montants en toutes lettres, tableaux ligne par ligne.
 */
const PREFERRED = ["audrey", "aurélie", "aurelie", "amélie", "amelie", "thomas", "marie", "daniel"];
// Voix d'effets d'iOS, à éviter pour un ton professionnel.
const NOVELTY = /eddy|flo|grandma|grandpa|reed|rocko|sandy|shelley|bad news|bells|boing|bubbles|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|albert|fred|junior|kathy|ralph/i;

let chosen: Promise<string | undefined> | undefined;

function score(v: Speech.Voice) {
  const id = `${v.identifier} ${v.name}`.toLowerCase();
  let s = 0;
  if (v.language === "fr-FR") s += 4;
  else if (v.language.startsWith("fr")) s += 1;
  if (id.includes("premium")) s += 6;
  if (v.quality === Speech.VoiceQuality.Enhanced || id.includes("enhanced")) s += 4;
  if (id.includes("siri")) s += 2;
  if (PREFERRED.some((n) => id.includes(n))) s += 1;
  return s;
}

/** Meilleure voix française disponible (choisie une fois). */
export function bestFrenchVoice() {
  chosen ??= Speech.getAvailableVoicesAsync()
    .then((voices) => {
      const fr = voices.filter((v) => v.language?.toLowerCase().startsWith("fr") && !NOVELTY.test(v.name));
      return fr.sort((a, b) => score(b) - score(a))[0]?.identifier;
    })
    .catch(() => undefined);
  return chosen;
}

/** La voix choisie est-elle une voix de qualité (sinon on suggère d'en télécharger une) ? */
export async function voiceQuality(): Promise<"premium" | "standard"> {
  const voices = await Speech.getAvailableVoicesAsync().catch(() => [] as Speech.Voice[]);
  const id = await bestFrenchVoice();
  const v = voices.find((x) => x.identifier === id);
  return v && (v.quality === Speech.VoiceQuality.Enhanced || /premium|enhanced/i.test(v.identifier)) ? "premium" : "standard";
}

export async function speak(markdown: string) {
  Speech.stop();
  const chunks = speechChunks(markdown);
  if (!chunks.length) return;
  const voice = await bestFrenchVoice();
  // Débit légèrement ralenti et ton neutre : chaleureux sans être théâtral.
  for (const text of chunks) Speech.speak(text, { language: "fr-FR", voice, rate: 0.94, pitch: 1.0 });
}

export const stopSpeaking = () => Speech.stop();
