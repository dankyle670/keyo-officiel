import { useState } from "react";
import { Pressable, View } from "react-native";
import { AUTONOMY_LEVEL_LABEL, formatMoney, type AutonomyLevel, type AutonomyPolicy, type Specialist } from "@keyo/shared";
import { color } from "@keyo/tokens";
import { autonomousApi, type CatalogItem } from "@/autonomous/api";
import { useRemote } from "@/autonomous/useRemote";
import { useUser } from "@/data/session";
import { SettingsGroup, Sheet, SheetAction, Status, SubScreen, Text, TextField, ToggleRow } from "@/ui";

const ORDER: AutonomyLevel[] = ["OFF", "ASK", "NOTIFY", "AUTO"];
const TONE = { OFF: "neutral", ASK: "late", NOTIFY: "info", AUTO: "paid" } as const;
const GROUPS: Specialist[] = ["COLLECTION", "MAINTENANCE", "RELETTING", "COMPLIANCE", "FINANCE"];

/** Autonomie : pour chaque action, jusqu'où Keyo peut aller seul ; plafond de dépense ; heures calmes. */
export default function Autonomy() {
  const user = useUser();
  const catalog = useRemote(autonomousApi.catalog);
  const policy = useRemote(autonomousApi.policy);
  const [editing, setEditing] = useState<CatalogItem>();
  const [capText, setCapText] = useState<string>();

  const save = async (next: AutonomyPolicy) => {
    policy.setData(next);
    try {
      await autonomousApi.setPolicy(next);
    } finally {
      await Promise.all([policy.reload(), catalog.reload()]);
    }
  };
  const setLevel = (key: string, level: AutonomyLevel) => {
    setEditing(undefined);
    if (policy.data) void save({ ...policy.data, levels: { ...policy.data.levels, [key]: level } });
  };

  const p = policy.data;
  const cur = user.displayCurrency;
  const cap = p?.spendCaps.find((c) => c.currency === cur);
  const commitCap = () => {
    if (!p || capText === undefined) return;
    const amount = Math.max(0, Math.round(Number(capText.replace(/[^\d]/g, "")) * (cur === "XOF" ? 1 : 100)));
    setCapText(undefined);
    void save({ ...p, spendCaps: [...p.spendCaps.filter((c) => c.currency !== cur), { amount, currency: cur }] });
  };

  if (catalog.error || policy.error) {
    return (
      <SubScreen title="Autonomie">
        <Text variant="body" tone="inkMuted" style={{ marginTop: 20 }}>
          {catalog.error ?? policy.error}
        </Text>
      </SubScreen>
    );
  }

  return (
    <SubScreen title="Autonomie" subtitle="Ce que Keyo peut faire sans vous">
      <Text variant="rowSubtitle" tone="inkMuted" style={{ marginTop: 12 }}>
        Me demander : Keyo prépare et attend votre accord. Faire et me prévenir : il agit puis vous informe. Faire seul : il agit, et tout reste visible dans le journal.
      </Text>

      {GROUPS.map((g) => {
        const items = (catalog.data ?? []).filter((c) => c.specialist === g);
        if (!items.length) return null;
        return (
          <SettingsGroup key={g} title={items[0]!.specialistLabel}>
            {items.map((c) => (
              <Pressable key={c.key} onPress={() => setEditing(c)} accessibilityRole="button" style={({ pressed }) => ({ paddingVertical: 14, gap: 6, opacity: pressed ? 0.6 : 1 })}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                  <Text variant="rowTitle" style={{ flex: 1 }}>
                    {c.label}
                  </Text>
                  <Status tone={TONE[c.level]} label={AUTONOMY_LEVEL_LABEL[c.level]} />
                </View>
                <Text variant="rowSubtitle" tone="inkMuted">
                  {c.description}
                </Text>
              </Pressable>
            ))}
          </SettingsGroup>
        );
      })}

      {p && (
        <>
          <SettingsGroup title="Limites" footer="Au-delà du plafond, toute dépense (un devis par exemple) vous est soumise. Pendant les heures calmes, les messages aux occupants partent le lendemain à 8 h.">
            <ToggleRow title="Heures calmes" subtitle="Pas de message entre 20 h et 8 h" value={Boolean(p.quietHours)} onChange={(v) => void save({ ...p, quietHours: v ? { from: 20, to: 8 } : undefined })} />
          </SettingsGroup>
          <TextField
            label={`Plafond de dépense sans accord (${cur === "XOF" ? "FCFA" : cur})`}
            hint={cap ? `Actuellement ${formatMoney(cap)}` : "Aucun plafond : toute dépense vous est soumise"}
            keyboardType="number-pad"
            value={capText ?? (cap ? String(cur === "XOF" ? cap.amount : cap.amount / 100) : "")}
            onChangeText={setCapText}
            onBlur={commitCap}
            onSubmitEditing={commitCap}
            returnKeyType="done"
          />
        </>
      )}

      <Text variant="caption" tone="inkMuted" style={{ marginTop: 20 }}>
        Keyo ne déplace jamais d'argent, ne signe rien à votre place, ne résilie aucun contrat et n'engage aucune procédure : ces actions n'existent pas pour l'agent.
      </Text>

      <Sheet visible={Boolean(editing)} onClose={() => setEditing(undefined)} title={editing?.label}>
        {editing && (
          <>
            {ORDER.filter((l) => ORDER.indexOf(l) <= ORDER.indexOf(editing.maxLevel)).map((l) => (
              <SheetAction key={l} label={`${AUTONOMY_LEVEL_LABEL[l]}${l === editing.level ? " (actuel)" : ""}`} onPress={() => setLevel(editing.key, l)} />
            ))}
            {editing.maxLevel !== "AUTO" && (
              <Text variant="caption" tone="inkMuted" style={{ marginTop: 12, color: color.inkMuted }}>
                {`Par prudence, cette action ne peut pas aller au-delà de « ${AUTONOMY_LEVEL_LABEL[editing.maxLevel]} ».`}
              </Text>
            )}
          </>
        )}
      </Sheet>
    </SubScreen>
  );
}
