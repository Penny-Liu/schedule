import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import {
  findAuthUsernameCollisions,
  usernameToAuthEmail,
} from "../services/authIdentity.mjs";
import {
  isPasswordMigrationReadyForRole,
  passwordForSupabaseAuth,
} from "../services/passwordPolicy.mjs";

const args = new Set(process.argv.slice(2));
const applyChanges = args.has("--apply");
const confirmedPasswordMigration = args.has("--confirm-existing-passwords");
const listNonCompliantUsers = args.has("--list-noncompliant-users");
const rolesArg = process.argv.slice(2).find((arg) => arg.startsWith("--roles="));
const selectedRoles = rolesArg
  ? new Set(
      rolesArg
        .slice("--roles=".length)
        .split(",")
        .map((role) => role.trim())
        .filter(Boolean),
    )
  : null;

if (args.has("--help")) {
  console.log(`Usage:
  npm run auth:migrate
      Read-only preflight. Validates legacy accounts and reports counts.

  npm run auth:migrate -- --list-noncompliant-users
      Read-only preflight that also lists account names needing a password update.

  npm run auth:migrate -- --apply --confirm-existing-passwords
      Creates/resumes Auth users and links public.users.auth_user_id.

  npm run auth:migrate -- --roles=SUPERVISOR,SYSTEM_ADMIN
      Limits preflight or apply to the listed application roles.

Required environment:
  SUPABASE_URL (or VITE_SUPABASE_URL)
  SUPABASE_SERVICE_ROLE_KEY
  AUTH_USERNAME_DOMAIN (or VITE_AUTH_USERNAME_DOMAIN)`);
  process.exit(0);
}

const fail = (message) => {
  console.error(`[Auth migration] ${message}`);
  process.exitCode = 1;
};

const requireEnvironment = (name, ...fallbackNames) => {
  const names = [name, ...fallbackNames];
  const value = names.map((key) => process.env[key]?.trim()).find(Boolean);
  if (!value) throw new Error(`缺少環境變數：${names.join(" 或 ")}`);
  return value;
};

const supabaseUrl = requireEnvironment("SUPABASE_URL", "VITE_SUPABASE_URL");
const serviceRoleKey = requireEnvironment("SUPABASE_SERVICE_ROLE_KEY");
const authUsernameDomain = requireEnvironment("AUTH_USERNAME_DOMAIN", "VITE_AUTH_USERNAME_DOMAIN");

const isLegacyServiceRoleJwt = (key) => {
  const [, payload] = key.split(".");
  if (!payload) return false;

  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return decoded.role === "service_role";
  } catch {
    return false;
  }
};

const isServerCredential = serviceRoleKey.startsWith("sb_secret_") || isLegacyServiceRoleJwt(serviceRoleKey);
if (!isServerCredential) {
  throw new Error("遷移腳本必須使用伺服器端 secret/service-role key，不能使用前端 publishable/anon key");
}

if (applyChanges && !confirmedPasswordMigration) {
  throw new Error(
    "套用遷移必須同時提供 --confirm-existing-passwords，確認已核准將現有明碼密碼傳送至 Supabase Auth",
  );
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
});

const listAllAuthUsers = async () => {
  const users = [];
  const perPage = 1000;

  for (let page = 1; ; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < perPage) return users;
  }
};

const loadLegacyUsers = async (includeAuthLink) => {
  const columns = includeAuthLink
    ? "id,username,password,role,auth_user_id"
    : "id,username,password,role";
  const { data, error } = await supabase.from("users").select(columns).order("id");
  if (error) throw error;
  return data ?? [];
};

const validateLegacyUsers = (users) => {
  if (users.length === 0) throw new Error("public.users 沒有可遷移的帳號");

  const invalid = users.filter(
    (user) =>
      typeof user.id !== "string" ||
      typeof user.username !== "string" ||
      !user.username.trim() ||
      typeof user.role !== "string" ||
      !user.role.trim(),
  );
  if (invalid.length > 0) {
    throw new Error(`有 ${invalid.length} 筆帳號缺少有效的 id、username 或 role`);
  }

  const missingPasswords = users.filter(
    (user) => typeof user.password !== "string" || user.password.length === 0,
  );
  if (missingPasswords.length > 0) {
    throw new Error(`有 ${missingPasswords.length} 筆帳號缺少密碼；已停止，避免建立無法登入的帳號`);
  }

  const collisions = findAuthUsernameCollisions(users.map((user) => user.username));
  if (collisions.length > 0) {
    const summary = collisions.map((item) => item.usernames.join(" / ")).join("；");
    throw new Error(`正規化後發現重複帳號：${summary}`);
  }

  return {
    nonCompliantUsers: users.filter(
      (user) => !isPasswordMigrationReadyForRole(user.password, user.role),
    ),
  };
};

const run = async () => {
  console.log(`[Auth migration] 模式：${applyChanges ? "APPLY" : "DRY RUN"}`);

  const allLegacyUsers = await loadLegacyUsers(applyChanges);
  const legacyUsers = selectedRoles
    ? allLegacyUsers.filter((user) => selectedRoles.has(user.role))
    : allLegacyUsers;
  if (selectedRoles) {
    console.log(`[Auth migration] 限定角色：${[...selectedRoles].join(", ")}`);
  }
  const { nonCompliantUsers } = validateLegacyUsers(legacyUsers);
  const nonCompliantPasswordCount = nonCompliantUsers.length;
  const authUsers = await listAllAuthUsers();
  const authUsersByEmail = new Map(
    authUsers.filter((user) => user.email).map((user) => [user.email.toLowerCase(), user]),
  );

  const candidates = await Promise.all(
    legacyUsers.map(async (legacyUser) => ({
      legacyUser,
      email: await usernameToAuthEmail(legacyUser.username, authUsernameDomain),
    })),
  );

  const linkedCount = applyChanges
    ? candidates.filter(({ legacyUser }) => Boolean(legacyUser.auth_user_id)).length
    : 0;
  const existingEmailCount = candidates.filter(({ email }) => authUsersByEmail.has(email)).length;

  console.log(`[Auth migration] public.users：${legacyUsers.length} 筆`);
  console.log(`[Auth migration] 已有相同內部身分：${existingEmailCount} 筆`);
  if (applyChanges) console.log(`[Auth migration] 已連結 auth_user_id：${linkedCount} 筆`);
  console.log(`[Auth migration] 尚未符合遷移密碼規則：${nonCompliantPasswordCount} 筆`);
  if (listNonCompliantUsers && nonCompliantPasswordCount > 0) {
    console.log("[Auth migration] 需要先修改密碼的帳號：");
    nonCompliantUsers.forEach((user) => console.log(`  - ${user.username}`));
  }

  if (!applyChanges) {
    console.log("[Auth migration] 預檢完成，沒有寫入資料庫，也沒有輸出密碼。");
    console.log(
      "[Auth migration] 確認 staging、auth_user_id 欄位與 Auth 密碼政策後，使用 --apply --confirm-existing-passwords 套用。",
    );
    return;
  }

  if (nonCompliantPasswordCount > 0) {
    throw new Error(
      `仍有 ${nonCompliantPasswordCount} 筆密碼未符合規則；請讓使用者先透過舊登入完成修改，再重新預檢`,
    );
  }

  let createdCount = 0;
  let linkedNowCount = 0;
  let skippedCount = 0;

  for (const { legacyUser, email } of candidates) {
    if (legacyUser.auth_user_id) {
      const linkedAuthUser = authUsers.find((user) => user.id === legacyUser.auth_user_id);
      if (!linkedAuthUser || linkedAuthUser.email?.toLowerCase() !== email) {
        throw new Error(`帳號 ${legacyUser.username} 的 auth_user_id 與預期 Auth 身分不一致`);
      }
      skippedCount += 1;
      continue;
    }

    let authUser = authUsersByEmail.get(email);
    if (authUser) {
      const legacyUserId = authUser.app_metadata?.legacy_user_id;
      if (legacyUserId && legacyUserId !== legacyUser.id) {
        throw new Error(`帳號 ${legacyUser.username} 的內部 Auth Email 已連結到另一筆使用者`);
      }
    } else {
      const { data, error } = await supabase.auth.admin.createUser({
        email,
        password: await passwordForSupabaseAuth(legacyUser.password, legacyUser.role),
        email_confirm: true,
        app_metadata: {
          app_role: legacyUser.role,
          identity_version: 1,
          legacy_user_id: legacyUser.id,
        },
      });
      if (error) {
        throw new Error(`無法建立帳號 ${legacyUser.username}：${error.message}`);
      }
      authUser = data.user;
      authUsers.push(authUser);
      authUsersByEmail.set(email, authUser);
      createdCount += 1;
    }

    const { data: linkedRows, error: linkError } = await supabase
      .from("users")
      .update({ auth_user_id: authUser.id })
      .eq("id", legacyUser.id)
      .is("auth_user_id", null)
      .select("id");
    if (linkError) throw linkError;
    if (linkedRows?.length !== 1) {
      throw new Error(`帳號 ${legacyUser.username} 未能唯一連結 auth_user_id；請先停止並檢查資料`);
    }
    linkedNowCount += 1;
  }

  const verifiedUsers = (await loadLegacyUsers(true)).filter(
    (user) => !selectedRoles || selectedRoles.has(user.role),
  );
  const unlinkedCount = verifiedUsers.filter((user) => !user.auth_user_id).length;
  if (unlinkedCount > 0) {
    throw new Error(`驗證失敗：仍有 ${unlinkedCount} 筆帳號未連結 auth_user_id`);
  }

  console.log(`[Auth migration] 新建 Auth 帳號：${createdCount} 筆`);
  console.log(`[Auth migration] 本次新增連結：${linkedNowCount} 筆`);
  console.log(`[Auth migration] 已完成而略過：${skippedCount} 筆`);
  console.log("[Auth migration] 遷移及 auth_user_id 完整性驗證完成；public.users.password 尚未刪除。");
};

run().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
