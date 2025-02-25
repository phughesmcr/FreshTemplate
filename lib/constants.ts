/**
 * Application-wide constants
 */

/**
 * OpenAI API configuration
 */
export const OpenAI = {
  /**
   * The model to use for chat completions
   */
  MODEL: "gpt-4o-mini",

  /**
   * Maximum number of tokens to generate in completions
   */
  MAX_TOKENS: 1028,

  /**
   * Temperature setting for controlling randomness (0-1)
   * Lower values make responses more deterministic
   */
  TEMPERATURE: 0.1,
};

/**
 * HTTP status codes used in the application
 */
export const HttpStatus = {
  OK: 200,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  REQUEST_TIMEOUT: 408,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  NOT_IMPLEMENTED: 501,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504,
};

/**
 * Rate limiting configuration
 */
export const RateLimit = {
  /**
   * Time window for rate limiting in milliseconds (default: 60 seconds)
   */
  WINDOW_SIZE: Math.max(1, parseInt(Deno.env.get("RATE_LIMIT_WINDOW_SIZE") || "60000")),

  /**
   * Maximum number of requests allowed in the window
   */
  MAX_REQUESTS: Math.max(1, parseInt(Deno.env.get("RATE_LIMIT_MAX_REQUESTS") || "250")),

  /**
   * Maximum time in milliseconds an IP can be blocked (default: 30 minutes)
   */
  MAX_BLOCKED_TIME: Math.max(1, parseInt(Deno.env.get("RATE_LIMIT_MAX_BLOCKED_TIME") || "1800000")),

  /**
   * Number of violations before blocking an IP
   */
  BLOCK_THRESHOLD: Math.max(1, parseInt(Deno.env.get("RATE_LIMIT_BLOCK_THRESHOLD") || "5")),

  /**
   * How often to clean up stale rate limit entries (default: 5 minutes)
   */
  CLEANUP_INTERVAL: Math.max(1, parseInt(Deno.env.get("RATE_LIMIT_CLEANUP_INTERVAL") || "300000")),
};

/**
 * Compression settings
 */
export const Compression = {
  /**
   * MIME types that should be compressed
   */
  COMPRESSIBLE_TYPES: [
    "text/",
    "application/json",
    "application/xml",
    "application/javascript",
    "application/xhtml+xml",
    "image/svg+xml",
  ],

  /**
   * Minimum size in bytes before compression is applied (default: 1KB)
   */
  MIN_SIZE: 1024,

  /**
   * Compression quality for Brotli (0-11, higher = better compression but slower)
   */
  BROTLI_QUALITY: 4,

  /**
   * Compression level for Gzip (1-9, higher = better compression but slower)
   */
  GZIP_LEVEL: 6,

  /**
   * Whether Brotli compression is disabled
   */
  DISABLE_BROTLI: Deno.env.get("DISABLE_BROTLI") === "true" || false,

  /**
   * Whether Gzip compression is disabled
   */
  DISABLE_GZIP: Deno.env.get("DISABLE_GZIP") === "true" || false,
};

/**
 * Request timeout configuration
 */
export const Timeout = {
  /**
   * Default timeout in milliseconds (30 seconds)
   */
  DEFAULT_TIMEOUT: 30000,

  /**
   * Custom timeouts for specific route patterns (in milliseconds)
   */
  ROUTE_TIMEOUTS: {
    "/api/": 60000, // 60 seconds for API routes
    "/upload/": 120000, // 2 minutes for upload routes
  },

  /**
   * Routes that should be exempt from timeout
   */
  EXCLUDED_ROUTES: ["/events", "/stream"],
};

/**
 * Environment variable names used throughout the application
 */
export const EnvVars = {
  /**
   * KV Store related environment variables
   */
  KV: {
    ADMIN_KEY: "KV_ADMIN_KEY",
  },

  /**
   * OpenAI related environment variables
   */
  OPENAI: {
    API_KEY: "OPENAI_API_KEY",
    ORGANIZATION: "OPENAI_ORGANIZATION",
    PROJECT: "OPENAI_PROJECT",
  },
};

/**
 * HTTPS redirect configuration
 */
export const HttpsRedirect = {
  /**
   * Whether HTTPS redirect is enabled
   */
  ENABLED: Deno.env.get("HTTPS_REDIRECT_ENABLED") !== "false",

  /**
   * Whether to use permanent (308) or temporary (307) redirects
   */
  PERMANENT: Deno.env.get("HTTPS_REDIRECT_PERMANENT") !== "false",

  /**
   * Hostnames to exclude from HTTPS redirect
   */
  EXCLUDED_HOSTS: ["localhost", "127.0.0.1", "[::1]"],

  /**
   * Environment names that indicate development mode (skip HTTPS redirect)
   */
  DEV_ENVIRONMENTS: ["development", "dev", "local", "test"],

  /**
   * Redirect status codes
   */
  STATUS_CODES: {
    PERMANENT: 308,
    TEMPORARY: 307,
  },
};

/**
 * Security header constants
 */
export const Security = {
  /**
   * Content Security Policy directives
   */
  CSP_DIRECTIVES: [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
    "connect-src 'self' https://api.openai.com",
    "media-src 'self' data: blob:",
    "manifest-src 'self'",
    "worker-src 'self' blob:",
  ],

  /**
   * Common security headers with their default values
   */
  COMMON_HEADERS: {
    "Cross-Origin-Embedder-Policy": "require-corp",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Expect-CT": "max-age=86400, enforce",
    "Origin-Agent-Cluster": "?1",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
    "X-Content-Type-Options": "nosniff",
    "X-DNS-Prefetch-Control": "off",
    "X-Download-Options": "noopen",
    "X-Frame-Options": "DENY",
    "X-Permitted-Cross-Domain-Policies": "none",
    "X-XSS-Protection": "0", // Modern browsers have better protections; this is for legacy
  },
};

/**
 * MIME types configuration
 */
export const MimeTypes = {
  /**
   * Maps file extensions to MIME types
   */
  MAP: new Map<string, string>([
    // Text
    [".html", "text/html; charset=utf-8"],
    [".css", "text/css; charset=utf-8"],
    [".js", "application/javascript; charset=utf-8"],
    [".json", "application/json"],
    [".xml", "application/xml"],
    [".txt", "text/plain"],
    [".md", "text/markdown"],
    [".webmanifest", "application/manifest+json"],

    // Images
    [".png", "image/png"],
    [".jpg", "image/jpeg"],
    [".jpeg", "image/jpeg"],
    [".gif", "image/gif"],
    [".svg", "image/svg+xml"],
    [".webp", "image/webp"],
    [".ico", "image/x-icon"],

    // Audio
    [".mp3", "audio/mpeg"],
    [".wav", "audio/wav"],
    [".ogg", "audio/ogg"],

    // Video
    [".mp4", "video/mp4"],
    [".webm", "video/webm"],

    // Fonts
    [".woff", "font/woff"],
    [".woff2", "font/woff2"],
    [".ttf", "font/ttf"],
    [".otf", "font/otf"],
    [".eot", "application/vnd.ms-fontobject"],

    // Documents
    [".pdf", "application/pdf"],
    [".doc", "application/msword"],
    [".docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    [".xls", "application/vnd.ms-excel"],
    [".xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
    [".ppt", "application/vnd.ms-powerpoint"],
    [".pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation"],

    // Archives
    [".zip", "application/zip"],
    [".rar", "application/x-rar-compressed"],
    [".7z", "application/x-7z-compressed"],
    [".tar", "application/x-tar"],
    [".gz", "application/gzip"],

    // Other
    [".wasm", "application/wasm"],
  ]),

  /**
   * File extensions that should be cached
   */
  CACHEABLE_EXTENSIONS: new Set([".css", ".jpg", ".js", ".png", ".svg", ".woff", ".woff2"]),
};

/**
 * CSRF Protection configuration
 */
export const CSRF = {
  /**
   * Default CSRF token configuration
   */
  CONFIG: {
    tokenName: "X-CSRF-Token",
    cookieName: "csrf_token",
    digest: "SHA-256",
    safeMethods: ["GET", "HEAD", "OPTIONS"] as const,
    maxAge: 3600, // 1 hour in seconds
    tokenLength: 32,
    refreshThreshold: 0.8, // Refresh when token reaches 80% of its lifetime
    exemptRoutes: [],
  } as const,
};

/**
 * Protected routes configuration
 */
export const ProtectedRoutes = {
  /**
   * List of protected route paths
   */
  PATHS: ["/api", "/auth", "/chat", "/user"] as const,

  /**
   * Permission levels for protected routes
   */
  PERMISSIONS: {
    READ: "read",
    WRITE: "write",
    ADMIN: "admin",
  },

  /**
   * Required permissions for each protected route
   */
  ROUTE_PERMISSIONS: {
    "/api": ["read"],
    "/auth": ["read"],
    "/chat": ["read", "write"],
    "/user": ["read", "write"],
  },

  /**
   * Redirect paths for unauthorized access
   */
  REDIRECT_PATHS: {
    "/api": "/api-access-denied",
    "/auth": "/login",
    "/chat": "/login",
    "/user": "/login",
  },
};

/**
 * Session configuration
 */
export const Session = {
  /**
   * Session cookie configuration
   */
  CONFIG: {
    EXPIRES: parseInt(Deno.env.get("SESSION_EXPIRES") || "2592000000"), // 30 days in ms
    HTTP_ONLY: Deno.env.get("SESSION_HTTP_ONLY") !== "false",
    PATH: Deno.env.get("SESSION_PATH") || "/",
    SAME_SITE: Deno.env.get("SESSION_SAME_SITE") || "Strict",
    SECURE: Deno.env.get("SESSION_SECURE") !== "false",
  },
};

/**
 * JSONLD template for website metadata
 */
export const WebsiteMetadata = {
  /**
   * Default JSONLD structure for the website
   */
  JSONLD: {
    "@context": "http://www.schema.org",
    "@type": "WebSite",
    "name": "",
    "url": "https://www.",
    "image": {
      "@type": "ImageObject",
      "url": "https://www./android-chrome-512x512.png",
      "width": 512,
      "height": 512,
    },
  },

  /**
   * Default theme color for the website
   */
  THEME_COLOR: "#1881F2",
};

/**
 * Voice synthesis configuration
 */
export const VoiceSynthesis = {
  /**
   * Available voice types for text-to-speech
   */
  VOICE_TYPES: [
    "alloy",
    "echo",
    "fable",
    "onyx",
    "nova",
    "shimmer",
  ] as const,

  /**
   * Default voice to use for synthesis
   */
  DEFAULT_VOICE: "alloy",

  /**
   * Default TTS model to use for synthesis
   */
  DEFAULT_MODEL: "tts-1",
};

/**
 * Audio transcription configuration
 */
export const AudioTranscription = {
  /**
   * Default model to use for audio transcription
   */
  MODEL: "whisper-1",

  /**
   * Default language for transcription
   */
  DEFAULT_LANGUAGE: "en",

  /**
   * Default response format
   */
  RESPONSE_FORMAT: "text" as "text" | "srt" | "vtt",
};

/**
 * Sample programming jokes for demo purposes
 */
export const Jokes = [
  "Why do Java developers often wear glasses? They can't C#.",
  'A SQL query walks into a bar, goes up to two tables and says "can I join you?"',
  "Wasn't hard to crack Forrest Gump's password. 1forrest1.",
  "I love pressing the F5 key. It's refreshing.",
  'Called IT support and a chap from Australia came to fix my network connection. I asked "Do you come from a LAN down under?"',
  "There are 10 types of people in the world. Those who understand binary and those who don't.",
  "Why are assembly programmers often wet? They work below C level.",
  "My favourite computer based band is the Black IPs.",
  "What programme do you use to predict the music tastes of former US presidential candidates? An Al Gore Rhythm.",
  "An SEO expert walked into a bar, pub, inn, tavern, hostelry, public house.",
];
