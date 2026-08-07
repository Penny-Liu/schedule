export const PUBLIC_VIEWER_DEFAULT_PASSWORD = "1234";
export const DEFAULT_PASSWORD = "1234ab";
export const MIN_PASSWORD_LENGTH = 6;
export const MIN_PUBLIC_VIEWER_PASSWORD_LENGTH = 4;
export const PUBLIC_VIEWER_ROLE = "VIEWER";

/** @param {string | undefined | null} role */
export const getDefaultPasswordForRole = (role) =>
  role === PUBLIC_VIEWER_ROLE ? PUBLIC_VIEWER_DEFAULT_PASSWORD : DEFAULT_PASSWORD;

/**
 * Returns a password only for known transition values. It never exposes a
 * user-chosen password.
 * @param {string | undefined | null} password
 * @param {string | undefined | null} role
 */
export const getTemporaryPasswordHint = (password, role) => {
  if (typeof password !== "string" || password.length === 0) {
    return getDefaultPasswordForRole(role);
  }
  if (
    password === PUBLIC_VIEWER_DEFAULT_PASSWORD ||
    password === getDefaultPasswordForRole(role)
  ) {
    return password;
  }
  return undefined;
};

/**
 * Also recognizes the legacy 1234 value on non-viewer accounts so those users
 * are guided to the compatible temporary password during the transition.
 * @param {string | undefined | null} password
 * @param {string | undefined | null} role
 */
export const isDefaultOrMissingPassword = (password, role) =>
  getTemporaryPasswordHint(password, role) !== undefined;

const COMMON_PASSWORDS = new Set([
  "12345678",
  "password",
  "password1",
  "qwerty123",
  "admin123",
]);

/**
 * Keep this baseline aligned with the Supabase Auth password settings before cutover.
 * @param {string | undefined | null} password
 * @returns {string[]}
 */
export const getPasswordPolicyErrors = (password) => {
  if (typeof password !== "string" || password.length === 0) {
    return ["密碼不可為空白"];
  }

  const errors = [];
  const length = [...password].length;

  if (length < MIN_PASSWORD_LENGTH) {
    errors.push(`密碼至少需要 ${MIN_PASSWORD_LENGTH} 個字元`);
  }
  if (!/\p{L}/u.test(password)) {
    errors.push("密碼至少需要包含一個英文字母或文字字元");
  }
  if (!/\p{N}/u.test(password)) {
    errors.push("密碼至少需要包含一個數字");
  }
  if (/^(.)\1+$/u.test(password)) {
    errors.push("密碼不可全部使用相同字元");
  }
  if (COMMON_PASSWORDS.has(password.toLocaleLowerCase("en-US"))) {
    errors.push("請勿使用常見或容易猜測的密碼");
  }

  return errors;
};

/**
 * The hospital-wide VIEWER account is intentionally treated as public access.
 * Authorization must still be enforced by database RLS; this exception must
 * never be extended to a role with write or sensitive-data permissions.
 * @param {string | undefined | null} password
 * @param {string | undefined | null} role
 * @returns {string[]}
 */
export const getPasswordPolicyErrorsForRole = (password, role) => {
  if (role !== PUBLIC_VIEWER_ROLE) return getPasswordPolicyErrors(password);

  if (typeof password !== "string" || password.length === 0) {
    return ["密碼不可為空白"];
  }
  if ([...password].length < MIN_PUBLIC_VIEWER_PASSWORD_LENGTH) {
    return [`公用瀏覽帳號密碼至少需要 ${MIN_PUBLIC_VIEWER_PASSWORD_LENGTH} 個字元`];
  }
  return [];
};

/** @param {string | undefined | null} password */
export const isPasswordMigrationReady = (password) => getPasswordPolicyErrors(password).length === 0;

/**
 * @param {string | undefined | null} password
 * @param {string | undefined | null} role
 */
export const isPasswordMigrationReadyForRole = (password, role) =>
  getPasswordPolicyErrorsForRole(password, role).length === 0;

/**
 * Produces an explicit, role-compatible temporary credential only when an
 * access edit would otherwise be blocked by a legacy password.
 * @param {string | undefined | null} password
 * @param {string | undefined | null} nextRole
 * @param {boolean} touchesAccess
 */
export const getPasswordTransitionForAccessUpdate = (password, nextRole, touchesAccess) => {
  if (!touchesAccess || nextRole === PUBLIC_VIEWER_ROLE || isPasswordMigrationReady(password)) {
    return { temporaryPassword: undefined, updates: {} };
  }
  const temporaryPassword = getDefaultPasswordForRole(nextRole);
  return {
    temporaryPassword,
    updates: { password: temporaryPassword, mustChangePassword: true },
  };
};

/** @param {string | undefined | null} password */
export const assertPasswordMigrationReady = (password) => {
  const errors = getPasswordPolicyErrors(password);
  if (errors.length > 0) throw new Error(errors[0]);
};

/**
 * @param {string | undefined | null} password
 * @param {string | undefined | null} role
 */
export const assertPasswordMigrationReadyForRole = (password, role) => {
  const errors = getPasswordPolicyErrorsForRole(password, role);
  if (errors.length > 0) throw new Error(errors[0]);
};

/**
 * Supabase applies its minimum password policy project-wide. For the explicitly
 * public VIEWER account, derive an Auth-compatible value while keeping the
 * announced password as the user's input. This does not add entropy or secrecy.
 * @param {string} password
 * @param {string | undefined | null} role
 */
export const passwordForSupabaseAuth = async (password, role) => {
  if (role !== PUBLIC_VIEWER_ROLE) return password;
  const bytes = new TextEncoder().encode(`schedule-public-viewer-v1:${password}`);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `v_${hex}`;
};
