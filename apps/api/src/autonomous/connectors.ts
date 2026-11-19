import type { Channel } from "@keyo/shared";

/**
 * Connecteurs : la façon dont l'agent agit sur le monde (WhatsApp, SMS, e-mail, agenda, annonces).
 * Chaque canal a un pilote réel, actif seulement si ses accès sont configurés, et un pilote simulé
 * qui n'envoie rien : tout se teste sans écrire à de vraies personnes.
 */
export type SendRequest = { channel: Channel; to: string; toName?: string; text: string };
export type SendResult = { ok: true; simulated: boolean; providerId?: string } | { ok: false; error: string };

export interface Connector {
  readonly channel: Channel;
  readonly simulated: boolean;
  readonly label: string;
  send(req: SendRequest): Promise<SendResult>;
}

export class SimulatedConnector implements Connector {
  readonly simulated = true;
  constructor(
    readonly channel: Channel,
    readonly label: string,
  ) {}
  async send(): Promise<SendResult> {
    return { ok: true, simulated: true };
  }
}

/**
 * WhatsApp Business (API Cloud de Meta). Hors fenêtre de 24 h, Meta n'accepte que des modèles
 * de message approuvés : le nom du modèle est donné par WHATSAPP_TEMPLATE (un seul paramètre texte).
 */
export class WhatsAppCloudConnector implements Connector {
  readonly channel = "WHATSAPP" as const;
  readonly simulated = false;
  readonly label = "WhatsApp Business";
  constructor(
    private readonly token: string,
    private readonly phoneNumberId: string,
    private readonly template?: string,
    private readonly http: typeof fetch = fetch,
  ) {}

  async send({ to, text }: SendRequest): Promise<SendResult> {
    const body = this.template
      ? { messaging_product: "whatsapp", to: to.replace(/[^\d]/g, ""), type: "template", template: { name: this.template, language: { code: "fr" }, components: [{ type: "body", parameters: [{ type: "text", text }] }] } }
      : { messaging_product: "whatsapp", to: to.replace(/[^\d]/g, ""), type: "text", text: { body: text } };
    try {
      const res = await this.http(`https://graph.facebook.com/v21.0/${this.phoneNumberId}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) return { ok: false, error: `WhatsApp a refusé le message (${res.status}).` };
      const json = (await res.json()) as { messages?: { id: string }[] };
      return { ok: true, simulated: false, providerId: json.messages?.[0]?.id };
    } catch {
      return { ok: false, error: "WhatsApp injoignable." };
    }
  }
}

const LABEL: Record<Channel, string> = {
  WHATSAPP: "WhatsApp",
  SMS: "SMS",
  EMAIL: "E-mail",
  CALENDAR: "Agenda",
  LISTINGS: "Sites d'annonces",
  PAYMENT_LINK: "Liens de paiement",
  APP: "Application Keyo",
};
export const channelLabel = (c: Channel) => LABEL[c];

/** Choisit le pilote de chaque canal selon les accès configurés côté serveur. */
export class ConnectorRegistry {
  private readonly drivers = new Map<Channel, Connector>();

  constructor(env: Record<string, string | undefined> = process.env, http?: typeof fetch) {
    for (const c of Object.keys(LABEL) as Channel[]) this.drivers.set(c, new SimulatedConnector(c, `${LABEL[c]} (simulé)`));
    if (env.WHATSAPP_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID) {
      this.drivers.set("WHATSAPP", new WhatsAppCloudConnector(env.WHATSAPP_TOKEN, env.WHATSAPP_PHONE_NUMBER_ID, env.WHATSAPP_TEMPLATE, http));
    }
  }

  get(channel: Channel): Connector {
    return this.drivers.get(channel)!;
  }

  list() {
    return [...this.drivers.values()].map((d) => ({ channel: d.channel, label: d.label, simulated: d.simulated }));
  }
}
