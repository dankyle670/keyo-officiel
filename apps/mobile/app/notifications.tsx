import { useEffect, useMemo } from "react";
import { router } from "expo-router";
import { BellRing, Droplet, Wallet } from "lucide-react-native";
import { nowIso, sinceLabel } from "@/data/period";
import { notificationFeed } from "@/data/selectors";
import { useUser } from "@/data/session";
import { actions, getOwnerState, useOwnerState } from "@/data/store";
import { EmptyState, IconCircle, ListRow, Status, SubScreen } from "@/ui";

const ICON = { paid: Wallet, late: BellRing, danger: Droplet } as const;
const BG = { paid: "mintTint", late: "amberTint", danger: "dangerTint" } as const;
const FG = { paid: "mintDeep", late: "amber", danger: "danger" } as const;

/** Notifications : loyer reçu, retard, nouvel incident. */
export default function Notifications() {
  const user = useUser();
  const state = useOwnerState((s) => s);
  // Repère de lecture figé à l'ouverture : les nouveautés restent signalées pendant la consultation.
  const readAt = useMemo(() => getOwnerState().notificationsReadAt, []);
  const feed = useMemo(() => notificationFeed(state, nowIso(), user.autoReminders), [state, user.autoReminders]);

  useEffect(() => {
    actions.markNotificationsRead();
  }, []);

  return (
    <SubScreen title="Notifications">
      {feed.length === 0 && <EmptyState title="Rien de nouveau" body="Vous serez prévenu ici à chaque loyer reçu, retard ou incident signalé." />}
      {feed.map((n, i) => (
        <ListRow
          key={n.id}
          divider={i > 0}
          leading={<IconCircle icon={ICON[n.tone]} bg={BG[n.tone]} fg={FG[n.tone]} />}
          title={n.title}
          subtitle={n.body}
          trailing={n.at > readAt ? <Status tone="info" label="Nouveau" /> : <Status tone="neutral" label={sinceLabel(n.at)} />}
          onPress={() => router.push(n.href as never)}
        />
      ))}
    </SubScreen>
  );
}
