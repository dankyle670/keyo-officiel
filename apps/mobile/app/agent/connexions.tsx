import { CalendarDays, CreditCard, Mail, Megaphone, MessageCircle, MessageSquareText, Smartphone } from "lucide-react-native";
import type { Channel } from "@keyo/shared";
import { autonomousApi } from "@/autonomous/api";
import { useRemote } from "@/autonomous/useRemote";
import { sinceLabel } from "@/data/period";
import { EmptyState, IconCircle, ListRow, SectionTitle, Status, SubScreen, Text } from "@/ui";

const ICON: Record<Channel, typeof Mail> = {
  WHATSAPP: MessageCircle,
  SMS: MessageSquareText,
  EMAIL: Mail,
  CALENDAR: CalendarDays,
  LISTINGS: Megaphone,
  PAYMENT_LINK: CreditCard,
  APP: Smartphone,
};
const USE: Record<Channel, string> = {
  WHATSAPP: "Relances, quittances, artisans",
  SMS: "Repli quand WhatsApp n'est pas disponible",
  EMAIL: "Rapports et courriers",
  CALENDAR: "Visites et interventions",
  LISTINGS: "Annonces des logements vacants",
  PAYMENT_LINK: "Paiement direct des loyers",
  APP: "Vos notifications Keyo",
};

/** Connexions : les canaux par lesquels l'agent agit, et les derniers messages envoyés. */
export default function Connections() {
  const connectors = useRemote(autonomousApi.connectors);
  const messages = useRemote(autonomousApi.messages);
  const err = connectors.error ?? messages.error;

  return (
    <SubScreen title="Connexions" subtitle="Les outils que Keyo utilise pour agir">
      {err && (
        <Text variant="body" tone="inkMuted" style={{ marginTop: 20 }}>
          {err}
        </Text>
      )}
      {(connectors.data ?? []).map((c, i) => (
        <ListRow
          key={c.channel}
          divider={i > 0}
          leading={<IconCircle icon={ICON[c.channel]} bg={c.simulated ? "surfaceSoft" : "mintTint"} fg={c.simulated ? "ink" : "mintDeep"} />}
          title={c.label.replace(" (simulé)", "")}
          subtitle={USE[c.channel]}
          trailing={c.simulated ? <Status tone="neutral" label="Simulé" /> : <Status tone="paid" label="Connecté" />}
        />
      ))}
      <Text variant="caption" tone="inkMuted" style={{ marginTop: 12 }}>
        Un canal simulé n'envoie rien : le message est seulement consigné ci-dessous. WhatsApp Business se connecte avec les accès de votre compte Meta ; les autres canaux arrivent ensuite.
      </Text>

      <SectionTitle>Derniers messages</SectionTitle>
      {(messages.data ?? []).length === 0 && !err && <EmptyState title="Aucun message" body="Les messages envoyés par l'agent (relances, quittances, demandes de devis) apparaîtront ici." />}
      {(messages.data ?? []).slice(0, 30).map((m, i) => (
        <ListRow
          key={m.id}
          divider={i > 0}
          leading={<IconCircle icon={ICON[m.channel]} />}
          title={m.toName ?? m.to}
          subtitle={m.text}
          trailing={<Status tone={m.simulated ? "neutral" : "paid"} label={m.simulated ? `Simulé, ${sinceLabel(m.sentAt)}` : sinceLabel(m.sentAt)} />}
        />
      ))}
    </SubScreen>
  );
}
