import { Bell, Cloud, Cog, Heart, Home } from "lucide-react";

export const NAV_ITEMS = [
  { href: "/home", label: "My Home", icon: Home },
  { href: "/automation", label: "Automation", icon: Cloud },
  { href: "/favorites", label: "Favorites", icon: Heart },
  { href: "/notifications", label: "Notifications", icon: Bell },
  { href: "/settings", label: "Settings", icon: Cog },
] as const;
