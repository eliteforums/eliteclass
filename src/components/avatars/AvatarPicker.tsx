// ---------------------------------------------------------------------------
// AvatarPicker — Allows users to choose an avatar style and variant
//
// Supports multiple avatar libraries:
//   - DiceBear (lorelei, adventurer, avataaars, bottts, initials, pixel-art, shapes)
//   - Avvvatars (character & shape styles)
//   - Boring Avatars (marble, beam, pixel, sunset, ring, bauhaus)
//
// The selected avatar is stored as a configuration string in the user's
// avatar_url field: "dicebear:{style}:{seed}" or "avvvatars:{style}:{seed}"
// or "boring:{variant}:{seed}" — resolved to SVG at render time.
// ---------------------------------------------------------------------------

import { useState } from "react";
import { Check, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AvatarPreview, type AvatarConfig } from "./AvatarPreview";

export type AvatarLibrary = "dicebear" | "avvvatars" | "boring";

export interface AvatarStyle {
  library: AvatarLibrary;
  style: string;
  label: string;
}

const AVATAR_STYLES: AvatarStyle[] = [
  // DiceBear styles
  { library: "dicebear", style: "lorelei", label: "Lorelei" },
  { library: "dicebear", style: "adventurer", label: "Adventurer" },
  { library: "dicebear", style: "avataaars", label: "Avataaars" },
  { library: "dicebear", style: "bottts", label: "Bottts" },
  { library: "dicebear", style: "initials", label: "Initials" },
  { library: "dicebear", style: "pixel-art", label: "Pixel Art" },
  { library: "dicebear", style: "shapes", label: "Shapes" },
  { library: "dicebear", style: "thumbs", label: "Thumbs" },
  { library: "dicebear", style: "fun-emoji", label: "Fun Emoji" },
  { library: "dicebear", style: "notionists", label: "Notionists" },
  // Avvvatars
  { library: "avvvatars", style: "character", label: "Character" },
  { library: "avvvatars", style: "shape", label: "Shape" },
  // Boring Avatars
  { library: "boring", style: "marble", label: "Marble" },
  { library: "boring", style: "beam", label: "Beam" },
  { library: "boring", style: "pixel", label: "Pixel" },
  { library: "boring", style: "sunset", label: "Sunset" },
  { library: "boring", style: "ring", label: "Ring" },
  { library: "boring", style: "bauhaus", label: "Bauhaus" },
];

interface AvatarPickerProps {
  currentAvatar?: string | null;
  userName: string;
  onSelect: (avatarConfig: string) => void;
  onCancel?: () => void;
}

function generateSeed(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function AvatarPicker({ currentAvatar, userName, onSelect, onCancel }: AvatarPickerProps) {
  const [selectedStyle, setSelectedStyle] = useState<AvatarStyle>(AVATAR_STYLES[0]);
  const [seed, setSeed] = useState(userName || "user");
  const [selectedConfig, setSelectedConfig] = useState<string | null>(null);

  // Generate multiple variants for the selected style
  const variants = Array.from({ length: 12 }, (_, i) => {
    const variantSeed = i === 0 ? seed : `${seed}-${i}`;
    const config: AvatarConfig = {
      library: selectedStyle.library,
      style: selectedStyle.style,
      seed: variantSeed,
      name: userName,
    };
    return config;
  });

  function handleSelectVariant(config: AvatarConfig) {
    const configStr = `${config.library}:${config.style}:${config.seed}`;
    setSelectedConfig(configStr);
  }

  function handleRandomize() {
    setSeed(generateSeed());
  }

  function handleConfirm() {
    if (selectedConfig) {
      onSelect(selectedConfig);
    }
  }

  return (
    <div className="space-y-4">
      {/* Style selector */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Avatar Style</label>
        <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
          {AVATAR_STYLES.map((style) => (
            <button
              key={`${style.library}-${style.style}`}
              onClick={() => {
                setSelectedStyle(style);
                setSelectedConfig(null);
              }}
              className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                selectedStyle.library === style.library && selectedStyle.style === style.style
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background border-border hover:border-primary/50 text-muted-foreground hover:text-foreground"
              }`}
            >
              {style.label}
            </button>
          ))}
        </div>
      </div>

      {/* Variant grid */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-foreground">Choose a variant</label>
          <Button variant="ghost" size="sm" onClick={handleRandomize} className="gap-1.5 text-xs">
            <RefreshCw className="h-3 w-3" />
            Randomize
          </Button>
        </div>
        <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
          {variants.map((config, i) => {
            const configStr = `${config.library}:${config.style}:${config.seed}`;
            const isSelected = selectedConfig === configStr;
            return (
              <button
                key={configStr}
                onClick={() => handleSelectVariant(config)}
                className={`relative rounded-xl p-1.5 border-2 transition-all ${
                  isSelected
                    ? "border-primary bg-primary/5 scale-105 shadow-md"
                    : "border-transparent hover:border-border hover:bg-muted/30"
                }`}
              >
                <AvatarPreview config={config} size={48} />
                {isSelected && (
                  <div className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-primary flex items-center justify-center">
                    <Check className="h-3 w-3 text-primary-foreground" />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-2">
        <Button onClick={handleConfirm} disabled={!selectedConfig} className="flex-1">
          Save Avatar
        </Button>
        {onCancel && (
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}
