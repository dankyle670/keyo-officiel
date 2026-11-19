import { useSyncExternalStore } from "react";
import type { Currency, PhoneCountry } from "@keyo/shared";
import { KEYS, load, remove, save } from "./persist";

export type Role = "OWNER" | "TENANT";
export type User = {
  id: string;
  phone: string;
  country: PhoneCountry["code"];
  role?: Role;
  firstName?: string;
  lastName?: string;
  displayCurrency: Currency;
  autoReminders: boolean;
};

type SessionState =
  | { status: "loading" }
  | { status: "signedOut"; pendingPhone?: { phone: string; country: PhoneCountry["code"]; currency: Currency } }
  | { status: "signedIn"; user: User };

let state: SessionState = { status: "loading" };
const listeners = new Set<() => void>();
const set = (next: SessionState) => {
  state = next;
  if (next.status === "signedIn") save(KEYS.session, next.user);
  listeners.forEach((l) => l());
};

export function useSession(): SessionState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

/** Utilisateur connecté ; à n'appeler que dans les écrans protégés. */
export function useUser(): User {
  const s = useSession();
  if (s.status !== "signedIn") throw new Error("Aucun utilisateur connecté");
  return s.user;
}

export const getSession = () => state;

/** Code de démonstration, en attendant l'envoi réel des SMS par l'API. */
export const DEMO_OTP = "123456";

export const session = {
  async hydrate() {
    const user = await load<User>(KEYS.session);
    set(user ? { status: "signedIn", user } : { status: "signedOut" });
  },

  /** Demande d'un code SMS. Côté API : limitation de débit, code à 6 chiffres valable 5 minutes. */
  async requestOtp(phone: string, country: PhoneCountry["code"], currency: Currency) {
    await new Promise((r) => setTimeout(r, 400));
    set({ status: "signedOut", pendingPhone: { phone, country, currency } });
  },

  async verifyOtp(code: string): Promise<"ok" | "invalid"> {
    await new Promise((r) => setTimeout(r, 400));
    if (state.status !== "signedOut" || !state.pendingPhone) return "invalid";
    if (code !== DEMO_OTP) return "invalid";
    const { phone, country, currency } = state.pendingPhone;
    set({ status: "signedIn", user: { id: `user-${phone}`, phone, country, displayCurrency: currency, autoReminders: true } });
    return "ok";
  },

  update(patch: Partial<User>) {
    if (state.status !== "signedIn") return;
    set({ status: "signedIn", user: { ...state.user, ...patch } });
  },

  async signOut() {
    await remove(KEYS.session);
    set({ status: "signedOut" });
  },
};
