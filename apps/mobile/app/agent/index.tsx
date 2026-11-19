import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { Bot, Cable, CircleCheck, CircleSlash, Clock, Hourglass, SlidersHorizontal, Undo2 } from "lucide-react-native";
import { SPECIALIST_LABEL, type StatusTone } from "@keyo/shared";
import { color, radius } from "@keyo/tokens";
import { autonomousApi, type ActionStatus, type JournalEntry } from "@/autonomous/api";
import { syncNow, useSyncStatus } from "@/autonomous/sync";
import { useRemote } from "@/autonomous/useRemote";
import { sinceLabel } from "@/data/period";
import { Button, EmptyState, IconCircle, ListRow, NavRow, SectionTitle, SettingsGroup, Sheet, SheetAction, Status, SubScreen, Text, ToggleRow } from "@/ui";

const STATUS: Record<ActionStatus, { tone: StatusTone; label: string }> = {
  DONE: { tone: "paid", label: "Fait" },
  PENDING_APPROVAL: { tone: "late", label: "À valider" },
  DEFERRED: { tone: "info", label: "Programmé" },
  BLOCKED: { tone: "neutral", label: "Bloqué" },
  REJECTED: { tone: "neutral", label: "Refusé" },
  FAILED: { tone: "danger", label: "Échec" },
  UNDONE: { tone: "neutral", label: "Annulé" },
};
const ICON = { DONE: CircleCheck, PENDING_APPROVAL: Hourglass, DEFERRED: Clock, BLOCKED: CircleSlash, REJECTED: CircleSlash, FAILED: CircleSlash, UNDONE: Undo2 } as const;

/**
 * L'agent Keyo en votre absence : les accords en attente d'abord, puis le journal. On lui parle
 * dans le chat ; on règle son autonomie dans Profil > Agent Keyo.
 * Les réglages fins (niveau par action, plafond) sont dans « Autonomie ».
 */
export default function AutonomousAgent() {
  // Écran ouvert depuis le chat (lien « Ouvrir ce que Keyo a fait ») ou Profil > Agent Keyo.
  const sync = useSyncStatus();
  const policy = useRemote(autonomousApi.policy);
  const journal = useRemote(autonomousApi.journal);
  const runs = useRemote(autonomousApi.runs);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string>();
  const [selected, setSelected] = useState<JournalEntry>();

  const refresh = async () => {
    await syncNow();
    await Promise.all([journal.reload(), runs.reload(), policy.reload()]);
  };
  const runNow = async () => {
    setBusy(true);
    setNote(undefined);
    try {
      await syncNow();
      const run = await autonomousApi.run();
      setNote(run.summary);
      await refresh();
    } catch (e) {
      setNote(e instanceof Error ? e.message : "L'agent n'a pas pu tourner.");
    } finally {
      setBusy(false);
    }
  };
  const act = async (fn: (id: string) => Promise<unknown>, id: string) => {
    setSelected(undefined);
    try {
      await fn(id);
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Action impossible.");
    }
    await refresh();
  };
  const toggle = async (enabled: boolean) => {
    if (!policy.data) return;
    policy.setData({ ...policy.data, enabled });
    await autonomousApi.setPolicy({ ...policy.data, enabled }).catch(() => policy.reload());
  };

  const offline = sync.reachable === false || (policy.error && !policy.data);
  const entries = journal.data ?? [];
  const pending = entries.filter((e) => e.status === "PENDING_APPROVAL");
  const history = entries.filter((e) => e.status !== "PENDING_APPROVAL").slice(0, 40);
  const last = runs.data?.[0];

  return (
    <SubScreen title="Ce que Keyo a fait" subtitle="En votre absence, selon vos réglages" footer={<Button label={busy ? "L'agent travaille…" : "Lancer l'agent maintenant"} disabled={busy || Boolean(offline)} onPress={runNow} />}>
      <View style={{ marginTop: 20, padding: 22, borderRadius: radius.card, backgroundColor: color.night, gap: 8 }}>
        <Bot size={28} strokeWidth={1.8} color={color.mint} />
        <View style={{ flexDirection: "row", gap: 16, flexWrap: "wrap" }}>
          {offline ? <Status tone="danger" label="Serveur injoignable" /> : policy.data?.enabled === false ? <Status tone="neutral" label="En pause" /> : <Status tone="paid" label="Actif" />}
          {last && <Status tone="info" label={last.engine === "claude" ? "Agents Claude" : "Règles fixes, sans clé"} />}
        </View>
        <Text variant="body" tone="track">
          {offline
            ? `${sync.error ?? "Le serveur Keyo ne répond pas."} Lancez l'API sur votre ordinateur (docker-compose up api) ; l'iPhone doit être sur le même Wi-Fi.`
            : "Chaque jour, Keyo relance les retards, envoie les quittances, qualifie les incidents et vous rappelle les échéances, dans les limites que vous fixez. Il ne déplace jamais d'argent, ne signe rien et ne résilie aucun contrat."}
        </Text>
        {last?.summary && !offline && (
          <Text variant="rowSubtitle" tone="track">
            {`Dernier passage, ${sinceLabel(last.startedAt)} : ${last.summary}`}
          </Text>
        )}
      </View>
      {note && (
        <Text variant="rowSubtitle" tone="inkMuted" style={{ marginTop: 12 }}>
          {note}
        </Text>
      )}

      <SettingsGroup>
        <ToggleRow title="Laisser Keyo agir" subtitle="Désactivé, l'agent ne fait plus rien de lui-même" value={policy.data?.enabled ?? false} onChange={toggle} />
        <NavRow icon={SlidersHorizontal} tint="mintTint" ink="mintDeep" title="Autonomie" value="Par action" onPress={() => router.push("/agent/autonomie")} />
        <NavRow icon={Cable} tint="mintTint" ink="mintDeep" title="Connexions" value="WhatsApp, SMS…" onPress={() => router.push("/agent/connexions")} />
      </SettingsGroup>

      <SectionTitle>{pending.length ? `À valider (${pending.length})` : "À valider"}</SectionTitle>
      {pending.length === 0 && (
        <Text variant="rowSubtitle" tone="inkMuted">
          Aucune demande en attente.
        </Text>
      )}
      {pending.map((e) => (
        <View key={e.id} style={{ padding: 18, borderRadius: radius.card, backgroundColor: color.surfaceRaised, gap: 8, marginBottom: 10 }}>
          <Status tone="late" label={SPECIALIST_LABEL[e.specialist]} />
          <Text variant="rowTitle">{e.summary}</Text>
          <Text variant="rowSubtitle" tone="inkMuted">
            {e.reason}
          </Text>
          <View style={{ flexDirection: "row", gap: 10, marginTop: 4 }}>
            <View style={{ flex: 1 }}>
              <Button kind="soft" label="Refuser" onPress={() => act(autonomousApi.reject, e.id)} />
            </View>
            <View style={{ flex: 1 }}>
              <Button kind="secondary" label="Accepter" onPress={() => act(autonomousApi.approve, e.id)} />
            </View>
          </View>
        </View>
      ))}

      <SectionTitle>Ce que Keyo a fait</SectionTitle>
      {history.length === 0 && !offline && <EmptyState title="Rien pour l'instant" body="Les actions de l'agent apparaîtront ici, avec leur motif. Vous pouvez lancer un passage maintenant." />}
      {history.map((e, i) => {
        const s = STATUS[e.status];
        return (
          <ListRow
            key={e.id}
            divider={i > 0}
            leading={<IconCircle icon={ICON[e.status]} bg={e.status === "DONE" ? "mintTint" : "surfaceSoft"} fg={e.status === "DONE" ? "mintDeep" : "ink"} />}
            title={e.summary}
            subtitle={`${SPECIALIST_LABEL[e.specialist]}, ${sinceLabel(e.createdAt)}`}
            trailing={<Status tone={s.tone} label={s.label} />}
            onPress={() => setSelected(e)}
          />
        );
      })}

      <Sheet visible={Boolean(selected)} onClose={() => setSelected(undefined)} title={selected?.summary}>
        {selected && (
          <>
            <Text variant="body" tone="inkMuted" style={{ marginBottom: 12 }}>
              {`${STATUS[selected.status].label}. ${selected.reason}${selected.deferredUntil ? ` Envoi prévu à ${selected.deferredUntil}.` : ""}`}
            </Text>
            {(selected.status === "DONE" || selected.status === "DEFERRED") && <SheetAction label="Annuler cette action" destructive onPress={() => act(autonomousApi.undo, selected.id)} />}
            <SheetAction label="Fermer" onPress={() => setSelected(undefined)} />
          </>
        )}
      </Sheet>
    </SubScreen>
  );
}
