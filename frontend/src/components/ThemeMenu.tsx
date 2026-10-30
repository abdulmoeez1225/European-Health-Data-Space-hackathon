"use client";

import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react";
import { useSyncExternalStore } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenuButton } from "@/components/ui/sidebar";
import { useT } from "@/i18n";
import { setTheme, storedTheme, subscribeTheme, type Theme } from "@/lib/preferences";

const THEMES: { value: Theme; icon: LucideIcon }[] = [
  { value: "light", icon: Sun },
  { value: "dark", icon: Moon },
  { value: "system", icon: Monitor },
];

export function ThemeMenu() {
  const theme = useSyncExternalStore(subscribeTheme, storedTheme, () => "system" as const);
  const t = useT();
  const current = THEMES.find((option) => option.value === theme) ?? THEMES[2];
  const label = t.shell.themes[current?.value ?? "system"];
  const Icon = current?.icon ?? Monitor;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton tooltip={`${t.shell.theme}: ${label}`} aria-label={t.shell.theme}>
          <Icon aria-hidden />
          <span className="flex-1">{t.shell.theme}</span>
          <span className="text-caption text-subtle-foreground">{label}</span>
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-44">
        <DropdownMenuLabel>{t.shell.appearance}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={theme}
          onValueChange={(value) => {
            setTheme(value as Theme);
          }}
        >
          {THEMES.map(({ value, icon: ItemIcon }) => (
            <DropdownMenuRadioItem key={value} value={value}>
              <ItemIcon aria-hidden />
              {t.shell.themes[value]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
