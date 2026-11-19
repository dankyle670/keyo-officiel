import { Building, Building2, Droplet, Fan, House, KeyRound, Store, Wrench, Zap, type LucideIcon } from "lucide-react-native";

const EVENT_ICONS: Record<string, LucideIcon> = {
  PLUMBING: Droplet,
  AIR_CONDITIONING: Fan,
  LOCKSMITH: KeyRound,
  ELECTRICITY: Zap,
};
export const eventIcon = (category: string): LucideIcon => EVENT_ICONS[category] ?? Wrench;

const KIND_ICONS: Record<string, LucideIcon> = {
  APARTMENT: Building,
  HOUSE: House,
  BUILDING: Building2,
  COMMERCIAL: Store,
};
export const assetKindIcon = (kind: unknown): LucideIcon => (typeof kind === "string" && KIND_ICONS[kind]) || Building2;
