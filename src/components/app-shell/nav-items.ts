import { Bell, Cloud, Cog, Heart, Home } from "lucide-react";

export const NAV_ITEMS = [
  { href: "/home", labelKey: "nav.home", icon: Home },
  { href: "/automation", labelKey: "nav.automation", icon: Cloud },
  { href: "/favorites", labelKey: "nav.favorites", icon: Heart },
  { href: "/notifications", labelKey: "nav.notifications", icon: Bell },
  { href: "/settings", labelKey: "nav.settings", icon: Cog },
] as const;
