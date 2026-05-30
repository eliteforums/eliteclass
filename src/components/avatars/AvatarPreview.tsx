// ---------------------------------------------------------------------------
// AvatarPreview — Renders an avatar from a config object
//
// Supports:
//   - DiceBear: generates SVG via DiceBear API URL
//   - Avvvatars: renders the Avvvatars React component
//   - Boring Avatars: renders the boring-avatars React component
//   - URL: renders a regular <img> tag for uploaded photos
//   - Fallback: renders initials in a colored circle
// ---------------------------------------------------------------------------

import { useMemo } from "react";
import Avvvatars from "avvvatars-react";
import Avatar from "boring-avatars";

export interface AvatarConfig {
  library: "dicebear" | "avvvatars" | "boring";
  style: string;
  seed: string;
  name?: string;
}

interface AvatarPreviewProps {
  config: AvatarConfig;
  size?: number;
  className?: string;
}

interface AvatarDisplayProps {
  /** Avatar config string (e.g. "dicebear:lorelei:Felix") or a URL or null */
  avatarUrl: string | null | undefined;
  name: string;
  size?: number;
  className?: string;
}

/**
 * Parse an avatar config string like "dicebear:lorelei:Felix" into an AvatarConfig.
 * Returns null if it's a regular URL or invalid format.
 */
export function parseAvatarConfig(avatarUrl: string | null | undefined): AvatarConfig | null {
  if (!avatarUrl) return null;
  
  const parts = avatarUrl.split(":");
  if (parts.length < 3) return null;
  
  const library = parts[0] as AvatarConfig["library"];
  if (!["dicebear", "avvvatars", "boring"].includes(library)) return null;
  
  const style = parts[1];
  const seed = parts.slice(2).join(":"); // seed might contain colons (e.g. URLs)
  
  return { library, style, seed };
}

/**
 * Check if an avatar URL is a config string (not a regular URL).
 */
export function isAvatarConfig(url: string | null | undefined): boolean {
  if (!url) return false;
  return url.startsWith("dicebear:") || url.startsWith("avvvatars:") || url.startsWith("boring:");
}

const BORING_COLORS = ["#6366f1", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981"];

/**
 * Renders an avatar from a parsed config object.
 */
export function AvatarPreview({ config, size = 40, className = "" }: AvatarPreviewProps) {
  const { library, style, seed, name } = config;

  if (library === "dicebear") {
    const url = `https://api.dicebear.com/9.x/${style}/svg?seed=${encodeURIComponent(seed)}`;
    return (
      <img
        src={url}
        alt={name || "Avatar"}
        width={size}
        height={size}
        className={`rounded-full ${className}`}
        loading="lazy"
      />
    );
  }

  if (library === "avvvatars") {
    return (
      <div className={`inline-block ${className}`}>
        <Avvvatars
          value={seed}
          style={style as "character" | "shape"}
          size={size}
        />
      </div>
    );
  }

  if (library === "boring") {
    return (
      <div className={`inline-block ${className}`}>
        <Avatar
          size={size}
          name={seed}
          variant={style as "marble" | "beam" | "pixel" | "sunset" | "ring" | "bauhaus"}
          colors={BORING_COLORS}
        />
      </div>
    );
  }

  // Fallback — shouldn't reach here
  return (
    <div
      className={`flex items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold ${className}`}
      style={{ width: size, height: size }}
    >
      {(name || seed || "?").slice(0, 2).toUpperCase()}
    </div>
  );
}

/**
 * Main component for displaying a user's avatar.
 * Handles both config strings and regular URLs.
 */
export function AvatarDisplay({ avatarUrl, name, size = 40, className = "" }: AvatarDisplayProps) {
  const config = useMemo(() => parseAvatarConfig(avatarUrl), [avatarUrl]);

  // If it's a config string, render with the appropriate library
  if (config) {
    return <AvatarPreview config={{ ...config, name }} size={size} className={className} />;
  }

  // If it's a regular URL (uploaded photo), render as img
  if (avatarUrl && (avatarUrl.startsWith("http") || avatarUrl.startsWith("/"))) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        width={size}
        height={size}
        className={`rounded-full object-cover ${className}`}
        loading="lazy"
      />
    );
  }

  // Fallback: render initials
  const initials = name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div
      className={`flex items-center justify-center rounded-full bg-gradient-primary text-primary-foreground text-xs font-semibold ${className}`}
      style={{ width: size, height: size, fontSize: size * 0.35 }}
    >
      {initials || "?"}
    </div>
  );
}
