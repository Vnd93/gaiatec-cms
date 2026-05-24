import {
  Wrench,
  Gauge,
  Flame,
  Droplet,
  Award,
  MapPin,
  Settings,
  CheckCircle2,
  Cpu,
  Monitor,
  Package,
  LayoutDashboard,
  Shield,
  ScanLine,
  Blocks,
  Lightbulb,
  type LucideIcon,
} from "lucide-react";

/** Mapa nome (string Lucide) → componente. Mantido estático p/ tree-shake. */
const ICONS: Record<string, LucideIcon> = {
  Wrench,
  Gauge,
  Flame,
  Droplet,
  Award,
  MapPin,
  Settings,
  CheckCircle2,
  Cpu,
  Monitor,
  Package,
  LayoutDashboard,
  Shield,
  ScanLine,
  Blocks,
  Lightbulb,
};

export function getServiceIcon(name: string): LucideIcon {
  return ICONS[name] ?? Settings;
}
