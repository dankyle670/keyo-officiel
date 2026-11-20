import { useCallback, useState } from "react";
import { Share, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Building2, CreditCard, FileText, PiggyBank, Scale, Smartphone } from "lucide-react-native";
import { formatMoney, INVOICE_STATUS_LABEL, SUBSCRIPTION_STATUS_LABEL, type InvoiceView, type StatusTone, type SubscriptionStatus } from "@keyo/shared";
import { color, radius } from "@keyo/tokens";
import { billingApi, BillingApiError, refreshSubscription } from "@/billing/api";
import { CardSheet } from "@/billing/CardSheet";
import { fullDate, today } from "@/data/period";
import { useOwnerState } from "@/data/store";
import { AccountRow } from "@/payments/AccountRow";
import { refreshPaymentAccounts } from "@/payments/api";
import { Button, IconCircle, ListRow, NavRow, SettingsGroup, Status, SubScreen, Text, ToggleRow } from "@/ui";

const TONE: Record<SubscriptionStatus, StatusTone> = { TRIALING: "info", ACTIVE: "paid", PAST_DUE: "late", READ_ONLY: "danger", CANCELED: "neutral" };
const INVOICE_TONE: Record<InvoiceView["status"], StatusTone> = { PAID: "paid", OPEN: "late", FAILED: "danger", VOID: "neutral" };
const daysUntil = (iso: string) => Math.max(0, Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${today()}T00:00:00Z`)) / 86_400_000));

/** Mon abonnement : formule, échéance, analyses d'expert, économie, moyen de paiement, reçus, résiliation. */
export default function Subscription() {
  const sub = useOwnerState((s) => s.subscription);
  const method = useOwnerState((s) => (s.paymentAccounts ?? []).find((a) => a.purpose === "SUBSCRIPTION"));
  const [invoices, setInvoices] = useState<InvoiceView[]>([]);
  const [cardOpen, setCardOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    void refreshPaymentAccounts();
    void refreshSubscription();
    billingApi.invoices().then(setInvoices, () => undefined);
  }, []);
  useFocusEffect(load);

  const run = async (task: () => Promise<unknown>) => {
    setBusy(true);
    setError(undefined);
    try {
      await task();
      load();
    } catch (e) {
      setError(e instanceof BillingApiError ? e.message : "Action impossible pour l'instant.");
    } finally {
      setBusy(false);
    }
  };

  const pay = () =>
    run(async () => {
      const a = await billingApi.pay();
      if (a.method === "MOBILE_MONEY") router.push({ pathname: "/abonnement/paiement", params: { id: a.id } });
    });

  const shareReceipt = (inv: InvoiceView) =>
    run(async () => {
      const uri = await billingApi.receipt(inv);
      await Share.share({ url: uri, title: inv.number });
    });

  if (!sub) {
    return (
      <SubScreen title="Mon abonnement">
        <Text variant="body" tone="inkMuted" style={{ marginTop: 20 }}>
          Chargement de votre abonnement…
        </Text>
      </SubScreen>
    );
  }

  const trialLeft = sub.status === "TRIALING" && sub.trialEndsAt ? daysUntil(sub.trialEndsAt) : undefined;
  const mustPay = sub.status === "PAST_DUE" || sub.status === "READ_ONLY";
  const footer = mustPay ? (
    <Button label={busy ? "Paiement en cours…" : `Payer ${sub.unpaid ? formatMoney(sub.unpaid.total) : "maintenant"}`} disabled={busy || !method || Boolean(sub.pendingAttempt)} onPress={pay} />
  ) : !method ? (
    <Button label="Ajouter une carte" icon={CreditCard} onPress={() => setCardOpen(true)} />
  ) : undefined;

  return (
    <SubScreen title="Mon abonnement" subtitle="Un prix fixe chaque mois, quel que soit le montant de vos loyers." footer={footer}>
      {/* Formule */}
      <View style={{ marginTop: 20, padding: 22, borderRadius: radius.card, backgroundColor: color.night, gap: 8 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text variant="rowSubtitle" tone="track">
            {sub.units} logement{sub.units > 1 ? "s" : ""} géré{sub.units > 1 ? "s" : ""}
          </Text>
          <View style={{ backgroundColor: color.surfaceRaised, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
            <Status tone={TONE[sub.status]} label={SUBSCRIPTION_STATUS_LABEL[sub.status]} />
          </View>
        </View>
        <Text variant="title" tone="onNight">
          {sub.plan ? `Keyo ${sub.plan.name}` : "Keyo sur mesure"}
        </Text>
        <Text variant="heading" tone="onNight">
          {sub.price ? `${formatMoney(sub.price)} ${sub.period === "YEARLY" ? "par an" : "par mois"}` : "Tarif sur devis : DK Group vous contacte"}
        </Text>
        <Text variant="rowSubtitle" tone="track">
          {trialLeft !== undefined
            ? `Essai gratuit : encore ${trialLeft} jour${trialLeft > 1 ? "s" : ""}, jusqu'au ${fullDate(sub.trialEndsAt!)}.`
            : sub.cancelAtPeriodEnd
              ? `Résilié : accès jusqu'au ${fullDate(sub.periodEnd)}.`
              : sub.status === "CANCELED"
                ? "Abonnement résilié. Vos données restent consultables."
                : `Prochaine échéance le ${fullDate(sub.periodEnd)}.`}
        </Text>
        {sub.nextPlan !== undefined ? (
          <Text variant="rowSubtitle" tone="track">
            {sub.nextPlan ? `À la prochaine échéance : Keyo ${sub.nextPlan.name}, ${formatMoney({ amount: sub.nextPlan.monthly[sub.currency], currency: sub.currency })} par mois.` : "Plus de 15 logements : DK Group vous propose un tarif sur mesure."}
          </Text>
        ) : null}
      </View>

      {mustPay ? (
        <View style={{ marginTop: 16, padding: 16, borderRadius: radius.card, backgroundColor: color.surfaceRaised, gap: 6 }}>
          <Status tone={TONE[sub.status]} label={sub.status === "READ_ONLY" ? "Agent en pause" : "Paiement en retard"} />
          <Text variant="body">
            {sub.status === "READ_ONLY"
              ? "Vous voyez toutes vos données, mais l'agent n'agit plus pour vous. Vos loyers continuent d'arriver sur votre compte. Réglez l'échéance pour tout réactiver."
              : "Le dernier paiement n'a pas abouti. Nous réessaierons automatiquement ; vous pouvez aussi payer dès maintenant."}
          </Text>
        </View>
      ) : null}

      {sub.pendingAttempt ? (
        <SettingsGroup>
          <NavRow icon={Smartphone} tint="mintTint" ink="mintDeep" title="Paiement en attente" value={sub.pendingAttempt.needsOwnerApproval ? "À valider sur votre téléphone" : "En cours"} onPress={() => router.push({ pathname: "/abonnement/paiement", params: { id: sub.pendingAttempt!.id } })} />
        </SettingsGroup>
      ) : null}

      {/* Économie face à une agence */}
      {sub.savings && sub.savings.saved.amount > 0 ? (
        <SettingsGroup title="Ce que vous économisez" footer="Comparaison avec une agence de gestion à 10 % des loyers, sur vos contrats en cours.">
          <ListRow leading={<IconCircle icon={Building2} bg="surfaceSoft" fg="inkMuted" />} title="Une agence prendrait" subtitle={`10 % de ${formatMoney(sub.savings.monthlyRents)} de loyers`} trailing={<Text variant="rowTitle">{`${formatMoney(sub.savings.agency)} / mois`}</Text>} />
          <ListRow leading={<IconCircle icon={PiggyBank} bg="mintTint" fg="mintDeep" />} title="Vous économisez" divider trailing={<Text variant="rowTitle" tone="mintDeep">{`${formatMoney(sub.savings.saved)} / mois`}</Text>} />
        </SettingsGroup>
      ) : null}

      {/* Analyses d'expert */}
      {sub.plan ? (
        <SettingsGroup title="Analyses d'expert ce mois-ci" footer={`Expertise d'un bien, contrat, fiscalité, patrimoine. Au-delà, ${formatMoney(sub.expert.extraPrice)} par analyse, toujours avec votre accord.`}>
          <ListRow leading={<IconCircle icon={Scale} bg="mintTint" fg="mintDeep" />} title={`${sub.expert.remaining} sur ${sub.expert.included} disponibles`} subtitle={sub.expert.used ? `${sub.expert.used} utilisée${sub.expert.used > 1 ? "s" : ""}` : "Aucune utilisée"} />
        </SettingsGroup>
      ) : null}

      {/* Moyen de paiement */}
      <SettingsGroup title="Moyen de paiement" footer="Carte : prélevée automatiquement. Mobile Money : une demande à valider avec votre code à chaque échéance.">
        {method ? (
          <AccountRow account={method} detail={method.kind === "CARD" ? "Prélèvement automatique" : "Demande à valider à chaque échéance"} onPress={() => router.push({ pathname: "/encaissement/[id]", params: { id: method.id } })} />
        ) : (
          <Text variant="rowSubtitle" tone="inkMuted" style={{ paddingVertical: 16 }}>
            Aucun moyen de paiement enregistré.
          </Text>
        )}
        <NavRow icon={CreditCard} tint="mintTint" ink="mintDeep" title={method?.kind === "CARD" ? "Changer de carte" : "Payer par carte"} value="Visa, Mastercard…" onPress={() => setCardOpen(true)} />
        {method?.kind !== "MOBILE_MONEY" ? (
          <NavRow icon={Smartphone} tint="mintTint" ink="mintDeep" title="Payer par Mobile Money" value="Wave, Orange, MTN, Moov" onPress={() => router.push({ pathname: "/encaissement/ajouter", params: { purpose: "SUBSCRIPTION" } })} />
        ) : null}
      </SettingsGroup>

      {/* Formule et périodicité */}
      <SettingsGroup title="Formule" footer="La formule suit le nombre de logements. Le paiement annuel offre 2 mois ; il s'applique à la prochaine échéance.">
        <NavRow icon={FileText} tint="mintTint" ink="mintDeep" title="Voir les formules" onPress={() => router.push("/abonnement/formules")} />
        {sub.plan && sub.status !== "CANCELED" ? (
          <ToggleRow title="Payer à l'année" subtitle={`${formatMoney({ amount: sub.plan.monthly[sub.currency] * 10, currency: sub.currency })} par an, 2 mois offerts`} value={sub.period === "YEARLY"} onChange={(v) => run(() => billingApi.setPeriod(v ? "YEARLY" : "MONTHLY"))} />
        ) : null}
      </SettingsGroup>

      {/* Historique */}
      <SettingsGroup title="Historique et reçus">
        {invoices.length ? (
          invoices.map((inv, i) => (
            <ListRow
              key={inv.id}
              divider={i > 0}
              leading={<IconCircle icon={FileText} bg="mintTint" fg="mintDeep" />}
              title={`${fullDate(inv.periodStart)} – ${fullDate(inv.periodEnd)}`}
              subtitle={inv.number}
              trailing={
                <View style={{ alignItems: "flex-end", gap: 4 }}>
                  <Text variant="rowTitle">{formatMoney(inv.total)}</Text>
                  <Status tone={INVOICE_TONE[inv.status]} label={INVOICE_STATUS_LABEL[inv.status]} />
                </View>
              }
              onPress={() => shareReceipt(inv)}
            />
          ))
        ) : (
          <Text variant="rowSubtitle" tone="inkMuted" style={{ paddingVertical: 16 }}>
            Aucun paiement pour l'instant.
          </Text>
        )}
      </SettingsGroup>

      {error ? (
        <Text variant="rowSubtitle" tone="danger" style={{ marginTop: 12 }}>
          {error}
        </Text>
      ) : null}

      {sub.status !== "CANCELED" ? (
        <View style={{ marginTop: 24 }}>
          <Button
            kind="secondary"
            label={sub.cancelAtPeriodEnd ? "Garder mon abonnement" : "Résilier"}
            disabled={busy}
            onPress={() => run(() => billingApi.cancel(!sub.cancelAtPeriodEnd))}
          />
          <Text variant="caption" tone="inkMuted" style={{ marginTop: 8, textAlign: "center" }}>
            {sub.cancelAtPeriodEnd ? "" : "Sans engagement. L'accès continue jusqu'à la fin de la période payée."}
          </Text>
        </View>
      ) : null}

      <CardSheet visible={cardOpen} onClose={() => setCardOpen(false)} onDone={() => (setCardOpen(false), load())} />
    </SubScreen>
  );
}
