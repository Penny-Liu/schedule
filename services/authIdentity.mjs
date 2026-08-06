const RESERVED_AUTH_DOMAINS = [
  "example.com",
  "example.net",
  "example.org",
  "invalid",
  "localhost",
  "test",
];

const DOMAIN_PATTERN = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/**
 * Canonical form used only for authentication identity mapping.
 * Existing display names and the username stored in public.users are untouched.
 * @param {string} username
 */
export const normalizeAuthUsername = (username) => {
  const normalized = username.trim().normalize("NFKC").toLocaleLowerCase("en-US");

  if (!normalized) {
    throw new Error("帳號名稱不可為空白");
  }

  if ([...normalized].length > 128) {
    throw new Error("帳號名稱不可超過 128 個字元");
  }

  return normalized;
};

/** @param {string} domain */
export const normalizeAuthEmailDomain = (domain) => {
  const normalized = domain.trim().toLocaleLowerCase("en-US").replace(/\.$/, "");

  if (!DOMAIN_PATTERN.test(normalized)) {
    throw new Error("Auth 帳號網域格式無效");
  }

  const isReserved = RESERVED_AUTH_DOMAINS.some(
    (reserved) => normalized === reserved || normalized.endsWith(`.${reserved}`),
  );
  if (isReserved) {
    throw new Error("Auth 帳號必須使用可控制的真實網域");
  }

  return normalized;
};

/** @param {string} value */
const sha256Hex = async (value) => {
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
};

/**
 * Supabase password login accepts email or phone rather than a native username.
 * A stable hash keeps the internal email valid without leaking the original username.
 * The domain must be a real domain controlled by the deployment owner.
 * @param {string} username
 * @param {string} domain
 */
export const usernameToAuthEmail = async (username, domain) => {
  const canonicalUsername = normalizeAuthUsername(username);
  const canonicalDomain = normalizeAuthEmailDomain(domain);
  const digest = await sha256Hex(canonicalUsername);

  // 2-character prefix + 60 hex characters remains within email's 64-byte local-part limit.
  return `u_${digest.slice(0, 60)}@${canonicalDomain}`;
};

/**
 * Detect case/Unicode/whitespace collisions before creating Auth accounts.
 * @param {string[]} usernames
 * @returns {{ canonicalUsername: string, usernames: string[] }[]}
 */
export const findAuthUsernameCollisions = (usernames) => {
  const grouped = new Map();

  usernames.forEach((username) => {
    const canonical = normalizeAuthUsername(username);
    grouped.set(canonical, [...(grouped.get(canonical) ?? []), username]);
  });

  return Array.from(grouped.entries())
    .filter(([, originals]) => originals.length > 1)
    .map(([canonicalUsername, originals]) => ({
      canonicalUsername,
      usernames: originals,
    }));
};
