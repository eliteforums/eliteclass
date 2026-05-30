import { useTranslation } from "react-i18next";
import { Globe, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { LANGUAGE_OPTIONS, type SupportedLanguage } from "@/lib/i18n-config";

const STORAGE_KEY = "eliteclass-language";

export function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const currentLanguage = i18n.language as SupportedLanguage;

  const currentOption = LANGUAGE_OPTIONS.find((opt) => opt.code === currentLanguage);

  function handleLanguageChange(langCode: SupportedLanguage) {
    if (langCode === currentLanguage) return;

    // Persist to localStorage
    localStorage.setItem(STORAGE_KEY, langCode);

    // Change language — react-i18next triggers re-render of all translated text
    i18n.changeLanguage(langCode);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Change language"
          title={currentOption?.nativeName ?? "Language"}
        >
          <Globe className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          Language
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {LANGUAGE_OPTIONS.map((lang) => (
          <DropdownMenuItem
            key={lang.code}
            onClick={() => handleLanguageChange(lang.code)}
            className="flex items-center justify-between cursor-pointer"
          >
            <span className="flex items-center gap-2">
              <span className="text-sm">{lang.nativeName}</span>
              <span className="text-xs text-muted-foreground">({lang.name})</span>
            </span>
            {currentLanguage === lang.code && (
              <Check className="h-4 w-4 text-primary" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
