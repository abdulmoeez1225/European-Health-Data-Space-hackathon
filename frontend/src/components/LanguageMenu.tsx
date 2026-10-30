"use client";

import { Languages } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenuButton } from "@/components/ui/sidebar";
import { LOCALES, setLocale, useLocale, useT, type Locale } from "@/i18n";

/** English · Deutsch, next to the theme switch. */
export function LanguageMenu() {
  const locale = useLocale();
  const t = useT();
  const current = t.shell.languages[locale];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton tooltip={`${t.shell.language}: ${current}`} aria-label={t.shell.languageMenu}>
          <Languages aria-hidden />
          <span className="flex-1">{t.shell.language}</span>
          <span className="text-caption text-subtle-foreground">{current}</span>
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-44">
        <DropdownMenuLabel>{t.shell.languageMenu}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={locale}
          onValueChange={(value) => {
            setLocale(value as Locale);
          }}
        >
          {LOCALES.map((value) => (
            <DropdownMenuRadioItem key={value} value={value} lang={value}>
              {t.shell.languages[value]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
