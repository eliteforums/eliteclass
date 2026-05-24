// ---------------------------------------------------------------------------
// YouTube URL parsing & validation for LMS lesson videos
// ---------------------------------------------------------------------------

const VIDEO_ID_RE = /^[\w-]{11}$/;

export type YouTubeParseResult =
  | {
      ok: true;
      videoId: string;
      watchUrl: string;
      embedUrl: string;
    }
  | {
      ok: false;
      error: string;
      isPlaylist?: boolean;
    };

export function isYouTubeUrl(url: string): boolean {
  return /youtube\.com|youtu\.be/i.test(url);
}

/** True when URL is a playlist/channel page without a single video id. */
export function isYouTubePlaylistOrChannelUrl(url: string): boolean {
  try {
    const u = new URL(url.trim());
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtu.be") return false;
    if (u.pathname === "/playlist" || (u.searchParams.has("list") && !u.searchParams.get("v"))) {
      return true;
    }
    if (u.pathname.startsWith("/channel/") || u.pathname.startsWith("/@")) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Extract an 11-character YouTube video id from common URL formats.
 */
export function extractYouTubeVideoId(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;

  try {
    const u = new URL(trimmed);
    const host = u.hostname.replace(/^www\./, "");

    if (host === "youtu.be") {
      const id = u.pathname.slice(1).split("/")[0];
      return VIDEO_ID_RE.test(id) ? id : null;
    }

    if (host === "youtube.com" || host === "m.youtube.com") {
      const v = u.searchParams.get("v");
      if (v && VIDEO_ID_RE.test(v)) return v;

      const embed = u.pathname.match(/^\/embed\/([\w-]{11})/);
      if (embed) return embed[1];

      const shorts = u.pathname.match(/^\/shorts\/([\w-]{11})/);
      if (shorts) return shorts[1];

      const live = u.pathname.match(/^\/live\/([\w-]{11})/);
      if (live) return live[1];

      const vPath = u.pathname.match(/^\/v\/([\w-]{11})/);
      if (vPath) return vPath[1];
    }
  } catch {
    // fall through to regex
  }

  const patterns = [
    /[?&]v=([\w-]{11})/,
    /youtu\.be\/([\w-]{11})/,
    /youtube\.com\/embed\/([\w-]{11})/,
    /youtube\.com\/shorts\/([\w-]{11})/,
    /youtube\.com\/live\/([\w-]{11})/,
  ];
  for (const pattern of patterns) {
    const m = trimmed.match(pattern);
    if (m?.[1] && VIDEO_ID_RE.test(m[1])) return m[1];
  }

  return null;
}

export function getYouTubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

export function getYouTubeEmbedUrl(videoId: string, startSeconds = 0): string {
  const start = startSeconds > 0 ? `&start=${Math.floor(startSeconds)}` : "";
  return `https://www.youtube-nocookie.com/embed/${videoId}?enablejsapi=1&rel=0${start}`;
}

export function parseYouTubeVideoUrl(url: string): YouTubeParseResult {
  const trimmed = url.trim();
  if (!trimmed) {
    return { ok: false, error: "Video URL is required" };
  }

  if (!isYouTubeUrl(trimmed)) {
    return { ok: false, error: "Enter a valid YouTube URL (youtube.com or youtu.be)" };
  }

  if (isYouTubePlaylistOrChannelUrl(trimmed)) {
    return {
      ok: false,
      error: "Playlist and channel links are not supported. Paste a link to a single video.",
      isPlaylist: true,
    };
  }

  const videoId = extractYouTubeVideoId(trimmed);
  if (!videoId) {
    return {
      ok: false,
      error: "Could not find a video ID. Use a link like https://www.youtube.com/watch?v=VIDEO_ID",
    };
  }

  return {
    ok: true,
    videoId,
    watchUrl: getYouTubeWatchUrl(videoId),
    embedUrl: getYouTubeEmbedUrl(videoId),
  };
}
