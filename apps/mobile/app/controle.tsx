import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { Sparkles } from "lucide-react-native";
import { AUDIT_AREA_LABEL, type AuditFinding, type AuditSeverity } from "@keyo/shared";
import { color, radius } from "@keyo/tokens";
import { agentMode, postOps, type OpsReview } from "@/agent/api";
import { askAgent } from "@/agent/navigation";
import { turnContext } from "@/agent/tools";
import { today } from "@/data/period";
import { auditReport } from "@/data/selectors";
import { useOwnerState } from "@/data/store";
import { EmptyState, SectionTitle, Status, SubScreen, Text } from "@/ui";

const SEVERITY: Record<AuditSeverity, { tone: "danger" | "late" | "neutral"; label: string; section: string }> = {
  HIGH: { tone: "danger", label: "Urgent", section: "Urgent" },
  MEDIUM: { tone: "late", label: "À traiter", section: "À traiter" },
  LOW: { tone: "neutral", label: "À surveiller", section: "À surveiller" },
};

/**
 * Contrôle de gestion (l'« ops » de Keyo) : pièces, fiscalité, encaissements, contrats, incidents,
 * entretien. Le contrôle est calculé sur le téléphone ; le sous-agent IA le priorise s'il est disponible.
 */
export default function Controle() {
  const state = useOwnerState((s) => s);
  const report = useMemo(() => auditReport(state, today()), [state]);
  const [review, setReview] = useState<OpsReview | null>(null);
  const [loading, setLoading] = useState(false);
  const [aiAvailable, setAiAvailable] = useState(false);

  useEffect(() => {
    agentMode().then((m) => setAiAvailable(m.mode === "claude"));
  }, []);

  const analyse = async () => {
    setLoading(true);
    setReview(await postOps(report.findings, report.score, turnContext()).catch(() => null));
    setLoading(false);
  };

  const byId = new Map(report.findings.map((f) => [f.id, f]));
  const scoreTone = report.score >= 80 ? "paid" : report.score >= 50 ? "late" : "danger";

  return (
    <SubScreen title="Contrôle de gestion" subtitle="Ce qu'une agence vérifierait pour vous">
      {state.assets.length === 0 ? (
        <EmptyState title="Rien à contrôler" body="Ajoutez un bien : Keyo vérifiera ses pièces, ses loyers, sa fiscalité et son entretien." />
      ) : (
        <>
          <View style={{ backgroundColor: color.night, borderRadius: radius.card, padding: 20, marginTop: 20, gap: 8 }}>
            <Text variant="rowSubtitle" style={{ color: "#B8C3D6" }}>
              Score de gestion
            </Text>
            <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
              <Text variant="display" tone="onNight" tabular style={{ fontSize: 48, lineHeight: 54 }}>
                {report.score}
              </Text>
              <Text variant="heading" style={{ color: "#B8C3D6" }}>
                sur 100
              </Text>
            </View>
            <View style={{ flexDirection: "row", gap: 16, flexWrap: "wrap" }}>
              {(["HIGH", "MEDIUM", "LOW"] as const).map((s) => (
                <Text key={s} variant="status" style={{ color: "#B8C3D6" }}>
                  {report.counts[s]} {SEVERITY[s].label.toLowerCase()}
                </Text>
              ))}
            </View>
            <View style={{ marginTop: 4 }}>
              <Status tone={scoreTone} label={report.findings.length === 0 ? "Tout est en ordre" : scoreTone === "paid" ? "Bonne tenue" : scoreTone === "late" ? "Quelques points à régler" : "Gestion à reprendre en main"} />
            </View>
          </View>

          {report.findings.length > 0 && (
            <View style={{ backgroundColor: color.surfaceRaised, borderRadius: radius.card, padding: 18, marginTop: 14, gap: 10 }}>
              <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
                <Sparkles size={20} strokeWidth={1.8} color={color.mintDeep} />
                <Text variant="rowTitle" style={{ flex: 1 }}>
                  Analyse de l'agent
                </Text>
              </View>
              {review ? (
                <>
                  <Text variant="body">{review.verdict}</Text>
                  {review.priorities.map((p, i) => (
                    <View key={p.findingId} style={{ gap: 2, borderTopWidth: 1, borderTopColor: color.line, paddingTop: 10 }}>
                      <Text variant="rowTitle">
                        {i + 1}. {byId.get(p.findingId)?.title}
                      </Text>
                      <Text variant="rowSubtitle" tone="inkMuted">
                        {p.why}
                      </Text>
                      <Text variant="rowSubtitle">{p.nextStep}</Text>
                    </View>
                  ))}
                </>
              ) : loading ? (
                <ActivityIndicator color={color.mintDeep} style={{ alignSelf: "flex-start" }} />
              ) : aiAvailable ? (
                <Pressable onPress={analyse} accessibilityRole="button" hitSlop={8}>
                  <Text variant="rowTitle" tone="sky">
                    Demander quoi traiter en premier
                  </Text>
                </Pressable>
              ) : (
                <Text variant="rowSubtitle" tone="inkMuted">
                  Disponible quand l'agent IA est activé sur le serveur. En attendant, les points sont classés par gravité.
                </Text>
              )}
            </View>
          )}

          {(["HIGH", "MEDIUM", "LOW"] as const).map((sev) => {
            const list = report.findings.filter((f) => f.severity === sev);
            if (!list.length) return null;
            return (
              <View key={sev}>
                <SectionTitle>{SEVERITY[sev].section}</SectionTitle>
                {list.map((f) => (
                  <FindingCard key={f.id} f={f} />
                ))}
              </View>
            );
          })}

          <Text variant="caption" tone="inkMuted" style={{ marginTop: 24 }}>
            Les repères fiscaux et juridiques sont indicatifs : vérifiez-les avec votre conseiller.
          </Text>
        </>
      )}
    </SubScreen>
  );
}

function FindingCard({ f }: { f: AuditFinding }) {
  const sev = SEVERITY[f.severity];
  return (
    <View style={{ backgroundColor: color.surfaceRaised, borderRadius: radius.card, padding: 18, marginTop: 10, gap: 6 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
        <Text variant="caption" tone="inkMuted">
          {AUDIT_AREA_LABEL[f.area]}
        </Text>
        <Status tone={sev.tone} label={sev.label} />
      </View>
      <Text variant="rowTitle">{f.title}</Text>
      <Text variant="rowSubtitle" tone="inkMuted">
        {f.detail}
      </Text>
      {f.fix && (
        <Pressable onPress={() => askAgent(f.fix!.prompt)} accessibilityRole="button" hitSlop={8} style={{ marginTop: 4, flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Sparkles size={16} strokeWidth={1.8} color={color.sky} />
          <Text variant="rowTitle" tone="sky">
            {f.fix.label} avec l'agent
          </Text>
        </Pressable>
      )}
    </View>
  );
}
