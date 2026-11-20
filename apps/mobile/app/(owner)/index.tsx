import { useMemo } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Bell, ChevronRight, Plus, Search, ShieldCheck, Wallet, Landmark } from "lucide-react-native";
import { money } from "@keyo/shared";
import { color, radius } from "@keyo/tokens";
import { LockMotif } from "@/brand/Logo";
import { eventIcon } from "@/data/icons";
import { buildMarkers } from "@/data/markers";
import { currentMonth, monthName, nowIso, today } from "@/data/period";
import { auditReport, initialsOf, monthSummary, notificationFeed, passportOf, todoItems } from "@/data/selectors";
import { useUser } from "@/data/session";
import { actions, useOwnerState } from "@/data/store";
import { AssetsMap } from "@/map/AssetsMap";
import { Amount, Button, IconCircle, ListRow, RoundButton, TAB_BAR_CLEARANCE, Text } from "@/ui";

/** Accueil propriétaire (02-Main) : carte 3D des biens, encaissé du mois, liste « À traiter ». */
export default function OwnerHome() {
  const insets = useSafeAreaInsets();
  const user = useUser();
  const state = useOwnerState((s) => s);
  const month = currentMonth();
  const currency = user.displayCurrency;
  const passport = useMemo(() => passportOf(state, user.id, currency, today()), [state, user.id, currency]);
  const summary = useMemo(() => monthSummary(state, month, today(), currency), [state, month, currency]);
  const todos = useMemo(() => todoItems(state, month, today(), currency).slice(0, 2), [state, month, currency]);
  const markers = useMemo(() => buildMarkers(state, state.assets, month, today()), [state, month]);
  const unread = useMemo(() => notificationFeed(state, nowIso(), user.autoReminders).filter((n) => n.at > state.notificationsReadAt).length, [state, user.autoReminders]);
  const audit = useMemo(() => auditReport(state, today()), [state]);
  const ratio = summary.expected.amount > 0 ? summary.received.amount / summary.expected.amount : 0;
  const hour = new Date().getHours();
  const greeting = hour >= 18 || hour < 5 ? "Bonsoir" : "Bonjour";
  const empty = state.assets.length === 0;

  return (
    <View style={{ flex: 1, backgroundColor: color.surface }}>
      {!empty && (
        <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}>
          <AssetsMap markers={markers} onPressAsset={(id) => router.push(`/bien/${id}`)} padding={{ top: insets.top + 240, bottom: 300 }} />
        </View>
      )}

      {/* En-tête */}
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 16, gap: 12 }} pointerEvents="box-none">
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Pressable
            onPress={() => router.push("/profil")}
            accessibilityRole="button"
            accessibilityLabel="Profil"
            style={{ flex: 1, height: 48, borderRadius: 999, backgroundColor: color.surfaceRaised, flexDirection: "row", alignItems: "center", gap: 12, paddingLeft: 4 }}
          >
            <IconCircle initials={initialsOf(`${user.firstName ?? ""} ${user.lastName ?? ""}`) || "K"} bg="mint" fg="onMint" diameter={40} />
            <Text variant="heading" numberOfLines={1} style={{ flex: 1 }}>
              {greeting} {user.firstName}
            </Text>
          </Pressable>
          <RoundButton icon={Search} label="Rechercher" diameter={48} onPress={() => router.push("/recherche")} />
          <View>
            <RoundButton icon={Bell} label={unread ? `Notifications, ${unread} non lues` : "Notifications"} diameter={48} onPress={() => router.push("/notifications")} />
            {unread > 0 && (
              <View style={{ position: "absolute", top: 2, right: 2, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: color.danger, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 }} pointerEvents="none">
                <Text variant="caption" tone="onNight" style={{ fontSize: 11, lineHeight: 14, fontFamily: "PlusJakartaSans_700Bold" }}>
                  {unread > 9 ? "9+" : unread}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Encaissé du mois */}
        <Pressable
          onPress={() => router.push("/(owner)/loyers")}
          accessibilityRole="button"
          style={{ backgroundColor: color.night, borderRadius: radius.card, padding: 20, overflow: "hidden" }}
        >
          <View style={{ position: "absolute", right: -40, bottom: -50 }} pointerEvents="none">
            <LockMotif size={150} />
          </View>
          <Text variant="rowSubtitle" style={{ color: "#B8C3D6" }}>
            Encaissé en {monthName(month)}
          </Text>
          <View style={{ marginTop: 4 }}>
            <Amount value={empty ? money(0, currency) : summary.received} variant="amount" tone="onNight" currencyTone="onNight" />
          </View>
          <View style={{ marginTop: 14, flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={{ flex: 1, height: 6, borderRadius: 6, backgroundColor: color.nightSoft }}>
              <View style={{ width: `${Math.round(ratio * 100)}%`, height: 6, borderRadius: 6, backgroundColor: color.mint }} />
            </View>
            <Text variant="status" style={{ color: "#B8C3D6" }}>
              {summary.paid.length} sur {summary.lines.length}
            </Text>
          </View>
        </Pressable>

        {/* Contrôle de gestion et passeport : ce qu'une agence et une banque regarderaient */}
        {!empty && (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
<Pressable
            onPress={() => router.push("/controle")}
            accessibilityRole="button"
            accessibilityLabel={`Contrôle de gestion, score ${audit.score} sur 100`}
            style={{ height: 44, borderRadius: 999, backgroundColor: color.surfaceRaised, flexDirection: "row", alignItems: "center", gap: 8, paddingLeft: 14, paddingRight: 10 }}
          >
            <ShieldCheck size={20} strokeWidth={1.8} color={audit.counts.HIGH ? color.danger : audit.findings.length ? color.amber : color.mintDeep} />
            <Text variant="rowTitle" tabular>
              Contrôle {audit.score}/100
            </Text>
            <Text variant="rowSubtitle" tone="inkMuted">
              {audit.findings.length === 0 ? "tout est en ordre" : `${audit.findings.length} point${audit.findings.length > 1 ? "s" : ""}`}
            </Text>
            <ChevronRight size={18} strokeWidth={1.8} color={color.inkMuted} />
          </Pressable>
            <Pressable
              onPress={() => router.push("/passeport")}
              accessibilityRole="button"
              accessibilityLabel={`Passeport propriétaire, score ${passport.score} sur 1000`}
              style={{ height: 44, borderRadius: 999, backgroundColor: color.surfaceRaised, flexDirection: "row", alignItems: "center", gap: 8, paddingLeft: 14, paddingRight: 10 }}
            >
              <Landmark size={20} strokeWidth={1.8} color={color.mintDeep} />
              <Text variant="rowTitle" tabular>
                Passeport {passport.score}
              </Text>
              <ChevronRight size={18} strokeWidth={1.8} color={color.inkMuted} />
            </Pressable>
          </View>
        )}
      </View>

      {empty ? (
        <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: 24, paddingBottom: TAB_BAR_CLEARANCE + insets.bottom, gap: 12 }}>
          <Text variant="title">Ajoutez votre premier bien</Text>
          <Text variant="body" tone="inkMuted">
            Appartement, villa, immeuble ou local : vous suivrez ensuite ses loyers, ses locataires et ses incidents depuis cet écran.
          </Text>
          <View style={{ gap: 12, marginTop: 12 }}>
            <Button label="Ajouter un bien" icon={Plus} onPress={() => router.push("/bien/nouveau")} />
            <Button kind="soft" label="Explorer avec des données de démonstration" onPress={() => actions.loadDemo(user.id)} />
          </View>
        </View>
      ) : (
        <View
          style={{
            position: "absolute",
            left: 12,
            right: 12,
            bottom: TAB_BAR_CLEARANCE + insets.bottom - 18,
            backgroundColor: color.surfaceRaised,
            borderRadius: radius.sheet,
            paddingHorizontal: 18,
            paddingTop: 18,
            paddingBottom: 6,
          }}
        >
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <Text variant="section" accessibilityRole="header">
              À traiter
            </Text>
            <Pressable onPress={() => router.push("/notifications")} hitSlop={8}>
              <Text variant="rowTitle" tone="sky">
                Tout voir
              </Text>
            </Pressable>
          </View>
          {todos.length === 0 ? (
            <Text variant="rowSubtitle" tone="inkMuted" style={{ paddingVertical: 16 }}>
              Rien à traiter. Vos loyers sont à jour.
            </Text>
          ) : (
            todos.map((t, i) =>
              t.kind === "late" ? (
                <ListRow
                  key={t.id}
                  divider={i > 0}
                  leading={<IconCircle icon={Wallet} bg="amberTint" fg="amber" />}
                  title={t.title}
                  subtitle={t.subtitle}
                  trailing={<Amount value={t.amount} variant="rowTitle" />}
                  onPress={() => router.push(`/bail/${t.agreementId}`)}
                />
              ) : t.kind === "payout" ? (
                <ListRow
                  key={t.id}
                  divider={i > 0}
                  leading={<IconCircle icon={Landmark} bg="mintTint" fg="mintDeep" />}
                  title={t.title}
                  subtitle={t.subtitle}
                  chevron
                  onPress={() => router.push("/encaissement")}
                />
              ) : (
                <ListRow
                  key={t.id}
                  divider={i > 0}
                  leading={<IconCircle icon={eventIcon(t.category)} bg="dangerTint" fg="danger" />}
                  title={t.title}
                  subtitle={t.subtitle}
                  chevron
                  onPress={() => router.push(`/incident/${t.eventId}`)}
                />
              ),
            )
          )}
        </View>
      )}
    </View>
  );
}
