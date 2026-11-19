import { useMemo, type ReactNode } from "react";
import { Alert, Linking, Pressable, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { BellRing, MessageCircle, MessagesSquare, Phone, Receipt } from "lucide-react-native";
import { cap, daysBetween, profileOf, reminderPlan, type DueStatus } from "@keyo/shared";
import { color, radius } from "@keyo/tokens";
import { capitalize, dayMonth, fullDate, monthName, monthYear, today } from "@/data/period";
import { leaseView } from "@/data/selectors";
import { useUser } from "@/data/session";
import { actions, useOwnerState } from "@/data/store";
import { Amount, Button, IconCircle, ListRow, SectionTitle, Status, SubScreen, Text } from "@/ui";

const STATUS: Record<DueStatus, { tone: "paid" | "late" | "danger" | "neutral"; label: string }> = {
  PAID: { tone: "paid", label: "Payé" },
  UPCOMING: { tone: "neutral", label: "À venir" },
  LATE: { tone: "late", label: "En retard" },
  PARTIAL: { tone: "late", label: "Partiel" },
  UNPAID: { tone: "danger", label: "Impayé" },
};
const TONE_LABEL = { COURTEOUS: "Rappel courtois", FIRM: "Relance ferme", FINAL: "Dernier rappel" } as const;
const CHANNEL_LABEL = { PUSH: "notification", PUSH_SMS: "notification et SMS", SMS: "SMS" } as const;

/** Bail d'un locataire : contact, conditions, relances, historique des paiements et quittances. */
export default function LeaseDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const user = useUser();
  const state = useOwnerState((s) => s);
  const view = useMemo(() => leaseView(state, id), [state, id]);

  if (!view || !view.party || !view.asset) {
    return (
      <SubScreen title="Bail introuvable">
        <Text variant="body" tone="inkMuted" style={{ marginTop: 12 }}>
          Ce bail n'existe plus sur ce téléphone.
        </Text>
      </SubScreen>
    );
  }
  const { agreement: g, party, asset, unit, items } = view;
  const name = `${party.firstName} ${party.lastName}`.trim();
  const late = items.filter((it) => it.status === "LATE" || it.status === "UNPAID" || it.status === "PARTIAL").sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const oldestLate = late[0];
  const ended = !!g.endDate && g.endDate < today();
  const profile = profileOf(asset.type);

  const endLease = () =>
    Alert.alert(`Mettre fin au ${profile.agreement.one} ?`, `Le ${profile.agreement.one} de ${name} se terminera aujourd'hui. Les échéances futures seront retirées.`, [
      { text: "Annuler", style: "cancel" },
      { text: "Mettre fin", style: "destructive", onPress: () => actions.endLease(g.id, today()) },
    ]);

  return (
    <SubScreen title={name} subtitle={`${asset.name}${unit && unit.label ? `, ${unit.label}` : ""}`}>
      <View style={{ flexDirection: "row", gap: 10, marginTop: 20 }}>
        <Contact icon={Phone} label="Appeler" onPress={() => Linking.openURL(`tel:${party.phone}`)} />
        <Contact icon={MessageCircle} label="Message" onPress={() => router.push(`/messages/${party.id}`)} />
        <Contact icon={MessagesSquare} label="WhatsApp" onPress={() => Linking.openURL(`https://wa.me/${party.phone.replace("+", "")}`)} />
      </View>

      <View style={{ marginTop: 22, padding: 20, borderRadius: radius.card, backgroundColor: color.surfaceRaised, gap: 14 }}>
        <Term label={cap(profile.amount)} value={<Amount value={g.periodicAmount} variant="rowTitle" />} />
        {g.deposit && <Term label="Caution" value={<Amount value={g.deposit} variant="rowTitle" />} />}
        <Term label="Échéance" value={<Text variant="rowTitle">Le {g.dueDay} de chaque mois</Text>} />
        <Term label={g.startDate > today() ? "Entrée prévue" : "Depuis"} value={<Text variant="rowTitle">{fullDate(g.startDate)}</Text>} />
        {g.endDate && <Term label="Fin" value={<Text variant="rowTitle">{fullDate(g.endDate)}</Text>} />}
      </View>

      {oldestLate && (
        <>
          <SectionTitle>Relances</SectionTitle>
          <Text variant="rowSubtitle" tone="inkMuted">
            Loyer de {monthName(oldestLate.dueDate.slice(0, 7))}, {Math.max(1, daysBetween(oldestLate.dueDate, today()))} jours de retard.
            {user.autoReminders ? "" : " Les relances automatiques sont désactivées dans votre profil."}
          </Text>
          {user.autoReminders &&
            reminderPlan(oldestLate.dueDate, today()).map((r, i) => (
              <ListRow
                key={r.offsetDays}
                divider={i > 0}
                leading={<IconCircle icon={BellRing} bg={r.sent ? "amberTint" : "surfaceSoft"} fg={r.sent ? "amber" : "inkMuted"} />}
                title={`${TONE_LABEL[r.tone]} (J+${r.offsetDays})`}
                subtitle={`Par ${CHANNEL_LABEL[r.channel]}, ${r.sent ? "envoyé le" : "prévu le"} ${dayMonth(r.date)}`}
                trailing={<Status tone={r.sent ? "late" : "neutral"} label={r.sent ? "Envoyé" : "Prévu"} />}
              />
            ))}
        </>
      )}

      <SectionTitle>Paiements</SectionTitle>
      {items.length === 0 && (
        <Text variant="rowSubtitle" tone="inkMuted">
          Aucune échéance pour l'instant.
        </Text>
      )}
      {items.map((it, i) => (
        <ListRow
          key={it.id}
          divider={i > 0}
          leading={<IconCircle icon={Receipt} bg={it.status === "PAID" ? "mintTint" : "surfaceSoft"} fg={it.status === "PAID" ? "mintDeep" : "inkMuted"} />}
          title={capitalize(monthYear(it.dueDate))}
          subtitle={it.status === "PAID" ? "Quittance disponible" : `Échéance le ${dayMonth(it.dueDate)}`}
          trailing={
            <>
              <Amount value={it.expected} variant="rowTitle" />
              <Status tone={STATUS[it.status].tone} label={STATUS[it.status].label} />
            </>
          }
        />
      ))}

      {!ended && (
        <View style={{ marginTop: 28 }}>
          <Button kind="secondary" label="Modifier les conditions" onPress={() => router.push({ pathname: "/bail/[id]/modifier", params: { id: g.id } })} />
          <View style={{ height: 12 }} />
          <Button kind="soft" label={`Mettre fin au ${profile.agreement.one}`} onPress={endLease} />
        </View>
      )}
      <Text variant="caption" tone="inkMuted" style={{ marginTop: 16 }}>
        Un loyer n'est marqué payé qu'après confirmation de l'opérateur de paiement.
      </Text>
    </SubScreen>
  );
}

function Term({ label, value }: { label: string; value: ReactNode }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
      <Text variant="rowSubtitle" tone="inkMuted">
        {label}
      </Text>
      {value}
    </View>
  );
}

function Contact({ icon: Icon, label, onPress }: { icon: typeof Phone; label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({ flex: 1, height: 72, borderRadius: radius.card, backgroundColor: color.surfaceRaised, alignItems: "center", justifyContent: "center", gap: 6, opacity: pressed ? 0.7 : 1 })}
    >
      <Icon size={22} strokeWidth={1.8} color={color.ink} />
      <Text variant="caption">{label}</Text>
    </Pressable>
  );
}
