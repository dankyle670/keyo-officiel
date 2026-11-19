import { session } from "@/data/session";
import { Button, EmptyState, SubScreen } from "@/ui";

/** Espace locataire : prochaine étape du développement (docs/ROADMAP.md, 3.2). */
export default function TenantPlaceholder() {
  return (
    <SubScreen title="Espace locataire" onBack={() => session.update({ role: undefined })}>
      <EmptyState
        title="Bientôt disponible"
        body="Vous pourrez rejoindre votre logement grâce à l'invitation de votre propriétaire, payer votre loyer par Mobile Money et suivre vos demandes."
        action={<Button kind="soft" label="Se déconnecter" onPress={() => session.signOut()} />}
      />
    </SubScreen>
  );
}
