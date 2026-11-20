import { useCallback, useState } from "react";
import { Alert, Share, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { CreditCard, Smartphone } from "lucide-react-native";
import { formatMoney, INVOICE_STATUS_LABEL, SUBSCRIPTION_STATUS_LABEL, type InvoiceView, type StatusTone, type SubscriptionStatus } from "@keyo/shared";
import { color, radius } from "@keyo/tokens";
import { billingApi, BillingApiError, refreshSubscription } from "@/billing/api";
import { fullDate, today } from "@/data/period";
import { useOwnerState } from "@/data/store";
import { refreshPaymentAccounts } from "@/payments/api";
import { ActionRow, Button, ListRow, NavRow, SettingsGroup, Status, SubScreen, Text } from "@/ui";

const TONE: Record<SubscriptionStatus, StatusTone> = { TRIALING: "info", ACTIVE: "paid", PAST_DUE: "late", READ_ONLY: "danger", CANCELED: "neutral" };
const INVOICE_TONE: Record<InvoiceView["status"], StatusTone> = { PAID: "paid", OPEN: "late", FAILED: "danger", VOID: "neutral" };
const daysUntil = (iso: string) => Math.max(0, Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${today()}T00:00:00Z`)) / 86_400_000));

/**
 * Abonnement : ce que le propriétaire paie à Keyo. Formule, moyen de paiement personnel, factures,
 * résiliation. Rien ici ne concerne les loyers reçus (voir Comptes de réception).
 */
export default function Subscription() {
  const sub = useOwnerState((s) => s.subscription);
  const method = useOwnerState((s) => (s.paymentAccounts ?? []).find((a) => a.purpose === "SUBSCRIPTION"));
  const [invoices, setInvoices] = useState<InvoiceView[]>([]);
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

  if (!sub) {
    return (
      <SubScreen title="Abonnement">
        <Text variant="body" tone="inkMuted" style={{ marginTop: 20 }}>
          Chargement…
        </Text>
      </SubScreen>
    );
  }

  const mustPay = sub.status === "PAST_DUE" || sub.status === "READ_ONLY";
  const status =
    sub.status === "TRIALING" && sub.trialEndsAt
      ? `Essai gratuit, encore ${daysUntil(sub.trialEndsAt)} jours`
      : sub.cancelAtPeriodEnd
        ? `Se termine le ${fullDate(sub.periodEnd)}`
        : sub.status === "ACTIVE"
          ? `Renouvellement le ${fullDate(sub.periodEnd)}`
          : SUBSCRIPTION_STATUS_LABEL[sub.status];

  const pay = () =>
    run(async () => {
      const a = await billingApi.pay();
      if (a.method === "MOBILE_MONEY") router.push({ pathname: "/abonnement/paiement", params: { id: a.id } });
    });

  const cancel = () =>
    sub.cancelAtPeriodEnd
      ? run(() => billingApi.cancel(false))
      : Alert.alert("Résilier l'abonnement ?", `Vous gardez l'accès jusqu'au ${fullDate(sub.periodEnd)}. Vos données restent consultables.`, [
          { text: "Annuler", style: "cancel" },
          { text: "Résilier", style: "destructive", onPress: () => run(() => billingApi.cancel(true)) },
        ]);

  return (
    <SubScreen title="Abonnement" footer={mustPay ? <Button label={sub.unpaid ? `Payer ${formatMoney(sub.unpaid.total)}` : "Payer"} disabled={busy || !method || Boolean(sub.pendingAttempt)} onPress={pay} /> : undefined}>
      {/* Formule */}
      <View style={{ marginTop: 20, padding: 20, borderRadius: radius.card, backgroundColor: color.surfaceRaised, gap: 6 }}>
        <Text variant="heading">{sub.plan ? `Keyo ${sub.plan.name}` : "Keyo sur mesure"}</Text>
        <Text variant="body" tone="inkMuted">
          {sub.price ? `${formatMoney(sub.price)} ${sub.period === "YEARLY" ? "par an" : "par mois"}` : "Tarif sur devis"}
        </Text>
        <View style={{ marginTop: 6 }}>
          <Status tone={TONE[sub.status]} label={status} />
        </View>
      </View>

      {mustPay ? (
        <Text variant="rowSubtitle" tone="inkMuted" style={{ marginTop: 12 }}>
          {sub.status === "READ_ONLY" ? "L'agent est en pause jusqu'au paiement. Vos loyers, eux, continuent d'arriver." : "Le dernier paiement n'a pas abouti. Nous réessaierons automatiquement."}
        </Text>
      ) : null}

      <SettingsGroup>
        <NavRow title="Formules et facturation" value={sub.period === "YEARLY" ? "Annuelle" : "Mensuelle"} onPress={() => router.push("/abonnement/formules")} />
        {sub.plan ? <NavRow title="Analyses d'expert" value={`${sub.expert.remaining} sur ${sub.expert.included} ce mois-ci`} onPress={() => router.push("/abonnement/formules")} /> : null}
      </SettingsGroup>

      <SettingsGroup title="Moyen de paiement">
        <NavRow
          icon={method?.kind === "MOBILE_MONEY" ? Smartphone : CreditCard}
          title={method ? `${method.label} ${method.masked}` : "Ajouter un moyen de paiement"}
          value={method ? "Modifier" : undefined}
          onPress={() => router.push("/abonnement/moyen-de-paiement")}
        />
      </SettingsGroup>

      {sub.pendingAttempt ? (
        <SettingsGroup>
          <NavRow title="Paiement en attente" value={sub.pendingAttempt.needsOwnerApproval ? "À valider" : "En cours"} onPress={() => router.push({ pathname: "/abonnement/paiement", params: { id: sub.pendingAttempt!.id } })} />
        </SettingsGroup>
      ) : null}

      <SettingsGroup title="Factures">
        {invoices.length ? (
          invoices.map((inv, i) => (
            <ListRow
              key={inv.id}
              divider={i > 0}
              title={fullDate(inv.issuedAt.slice(0, 10))}
              subtitle={formatMoney(inv.total)}
              trailing={<Status tone={INVOICE_TONE[inv.status]} label={INVOICE_STATUS_LABEL[inv.status]} />}
              onPress={() =>
                run(async () => {
                  const uri = await billingApi.receipt(inv);
                  await Share.share({ url: uri, title: inv.number });
                })
              }
            />
          ))
        ) : (
          <Text variant="rowSubtitle" tone="inkMuted" style={{ paddingVertical: 16 }}>
            Aucune facture pour l'instant.
          </Text>
        )}
      </SettingsGroup>

      {error ? (
        <Text variant="rowSubtitle" tone="danger" style={{ marginTop: 12 }}>
          {error}
        </Text>
      ) : null}

      {sub.status !== "CANCELED" ? (
        <SettingsGroup>
          <ActionRow title={sub.cancelAtPeriodEnd ? "Garder mon abonnement" : "Résilier l'abonnement"} destructive={!sub.cancelAtPeriodEnd} onPress={cancel} />
        </SettingsGroup>
      ) : null}
    </SubScreen>
  );
}
