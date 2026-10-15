import type { User } from '../types';

// Stored with the account permissions; deliberately not a page-access permission.
export const DEVELOPER_SANDBOX = 'developer_sandbox';
export const isDeveloperSandboxUser = (user: Pick<User, 'permissions'>) =>
  user.permissions?.includes(DEVELOPER_SANDBOX) === true;
export const SANDBOX_BLOCKED = '開發沙盒：此功能無法在本機模擬，已阻擋正式寫入。';

type Row = Record<string, any>;
type Change = { before?: Row; after?: Row };
const controls = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns']);

// Split logical filters without splitting quoted strings, lists, or JSON arrays.
function split(value: string): string[] {
  let depth = 0, quote = false, start = 0;
  const parts: string[] = [];
  for (let i = 0; i < value.length; i++) {
    const c = value[i];
    if (c === '"' && value[i - 1] !== '\\') quote = !quote;
    if (!quote) {
      if ('([{'.includes(c)) depth++;
      if (')]}'.includes(c)) depth--;
      if (c === ',' && depth === 0) { parts.push(value.slice(start, i)); start = i + 1; }
    }
  }
  return [...parts, value.slice(start)].filter(Boolean);
}

function test(value: any, expression: string): boolean {
  if (expression.startsWith('not.')) return !test(value, expression.slice(4));
  const dot = expression.indexOf('.');
  const op = expression.slice(0, dot), raw = expression.slice(dot + 1);
  const operand = raw.replace(/^"|"$/g, '');
  if (op === 'is') return operand === 'null' ? value == null : String(value) === operand;
  if (value == null) return false;
  if (op === 'eq') return String(value) === operand;
  if (op === 'neq') return String(value) !== operand;
  const target = typeof value === 'number' ? Number(operand) : operand;
  if (op === 'gt') return value > target;
  if (op === 'gte') return value >= target;
  if (op === 'lt') return value < target;
  if (op === 'lte') return value <= target;
  if (op === 'in') return split(raw.slice(1, -1)).some(v => String(value) === v.replace(/^"|"$/g, ''));
  if (op === 'like' || op === 'ilike') {
    const pattern = operand.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/[%*]/g, '.*').replace(/_/g, '.');
    return new RegExp(`^${pattern}$`, op === 'ilike' ? 'i' : '').test(String(value));
  }
  if (op === 'cs' || op === 'cd' || op === 'ov') {
    const other = raw.startsWith('[') ? JSON.parse(raw) : split(raw.replace(/^{|}$/g, ''));
    if (!Array.isArray(value) || !Array.isArray(other)) throw new Error(SANDBOX_BLOCKED);
    return op === 'cs' ? other.every(v => value.includes(v)) : op === 'cd'
      ? value.every(v => other.includes(v)) : value.some(v => other.includes(v));
  }
  throw new Error(`${SANDBOX_BLOCKED}（不支援的查詢：${op}）`);
}

function clause(row: Row, expression: string): boolean {
  if (expression.startsWith('or(') || expression.startsWith('and(')) {
    const or = expression.startsWith('or(');
    const tests = split(expression.slice(or ? 3 : 4, -1)).map(part => clause(row, part));
    return or ? tests.some(Boolean) : tests.every(Boolean);
  }
  const dot = expression.indexOf('.');
  return test(row[expression.slice(0, dot)], expression.slice(dot + 1));
}

function matches(row: Row, params: URLSearchParams): boolean {
  return [...params].every(([key, value]) => {
    if (controls.has(key)) return true;
    if (key === 'or' || key === 'and') return clause(row, `${key}${value}`);
    if (key === 'not.or' || key === 'not.and') return !clause(row, `${key.slice(4)}${value}`);
    return test(row[key], value);
  });
}

function identity(row: Row): string {
  if (row.id != null) return `id:${row.id}`;
  if (row.user_id != null) return `user_id:${row.user_id}`;
  throw new Error(`${SANDBOX_BLOCKED}（資料缺少識別欄位）`);
}

/** All simulated rows stay in memory. No write request is forwarded to the server. */
export class DeveloperSandbox {
  private active = false;
  private changes = new Map<string, Map<string, Change>>();
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private network: typeof fetch, private origin: string) {}
  get enabled() { return this.active; }
  enable() { this.active = true; }

  private merge(table: string, rows: Row[]): Row[] {
    const changes = this.changes.get(table);
    if (!changes) return rows;
    const merged = new Map(rows.map(row => [identity(row), row]));
    for (const [key, change] of changes) {
      merged.delete(key);
      if (change.after) merged.set(key, structuredClone(change.after));
    }
    return [...merged.values()];
  }

  private async readAll(request: Request): Promise<Row[]> {
    const url = new URL(request.url);
    url.searchParams.set('select', '*');
    for (const key of ['limit', 'offset', 'order', 'columns', 'on_conflict']) url.searchParams.delete(key);
    const headers = new Headers(request.headers);
    for (const key of ['content-type', 'prefer', 'range', 'range-unit']) headers.delete(key);
    headers.set('accept', 'application/json');
    const rows: Row[] = [];
    for (let offset = 0; offset < 100000; offset += 1000) {
      url.searchParams.set('offset', String(offset));
      url.searchParams.set('limit', '1000');
      const response = await this.network(url.toString(), { method: 'GET', headers, signal: request.signal });
      if (!response.ok) throw new Error(`${SANDBOX_BLOCKED}（無法讀取模擬用資料）`);
      const page = await response.json();
      if (!Array.isArray(page)) throw new Error(SANDBOX_BLOCKED);
      rows.push(...page);
      if (page.length < 1000) return rows;
    }
    throw new Error(`${SANDBOX_BLOCKED}（資料量過大，請縮小操作範圍）`);
  }

  private result(request: Request, rows: Row[], write: boolean): Response {
    const params = new URL(request.url).searchParams;
    const total = rows.length;
    const orders = split(params.get('order') || '');
    if (orders.length) rows.sort((a, b) => {
      for (const order of orders) {
        const [column, direction, nulls] = order.split('.');
        if (a[column] === b[column]) continue;
        if (a[column] == null || b[column] == null) {
          const first = nulls === 'nullsfirst';
          return a[column] == null ? (first ? -1 : 1) : (first ? 1 : -1);
        }
        const result = a[column] < b[column] ? -1 : 1;
        return direction === 'desc' ? -result : result;
      }
      return 0;
    });
    const range = request.headers.get('range')?.split('-');
    const start = Number(params.get('offset') || range?.[0] || 0);
    const limit = params.has('limit') ? Number(params.get('limit')) : range?.[1]
      ? Number(range[1]) - start + 1 : undefined;
    rows = rows.slice(start, limit === undefined ? undefined : start + limit);
    const projection = params.get('select');
    if (projection && projection !== '*') {
      const fields = projection.split(',').map(field => field.trim());
      if (fields.some(field => !/^\w+$/.test(field))) throw new Error(SANDBOX_BLOCKED);
      rows = rows.map(row => Object.fromEntries(fields.map(field => [field, row[field]])));
    }
    const headers = new Headers({ 'content-type': 'application/json', 'x-developer-sandbox': 'local-only' });
    if (request.headers.get('prefer')?.includes('count=')) headers.set('content-range', `${start}-${start + rows.length - 1}/${total}`);
    if (write && !request.headers.get('prefer')?.includes('return=representation')) return new Response(null, { status: 204, headers });
    const single = request.headers.get('accept')?.includes('application/vnd.pgrst.object+json');
    if (single && rows.length !== 1) return new Response(JSON.stringify({ code: 'PGRST116', message: '模擬結果不是單筆資料', details: `${rows.length} rows` }), { status: 406, headers });
    return new Response(request.method === 'HEAD' ? null : JSON.stringify(single ? rows[0] : rows), { status: 200, headers });
  }

  private async simulate(request: Request, table: string): Promise<Response> {
    const params = new URL(request.url).searchParams;
    const method = request.method;
    if (method === 'GET' || method === 'HEAD') {
      if (!this.changes.has(table)) return this.network(request);
      const rows = this.merge(table, await this.readAll(request)).filter(row => matches(row, params));
      return this.result(request, rows, false);
    }
    if (!['POST', 'PATCH', 'DELETE'].includes(method)) throw new Error(SANDBOX_BLOCKED);
    const mutations = new Map(this.changes.get(table) || []);
    const affected: Row[] = [];
    const payload = method === 'DELETE' ? null : await request.json();
    if (method === 'POST') {
      const upsert = request.headers.get('prefer')?.includes('resolution=');
      const ignore = request.headers.get('prefer')?.includes('resolution=ignore-duplicates');
      const incoming = Array.isArray(payload) ? payload : [payload];
      const conflict = (params.get('on_conflict') || (table === 'radiographer_private_profiles' ? 'user_id' : 'id')).split(',').map(key => key.trim());
      const source: Row[] = [];
      const identifiable = incoming.filter(value => conflict.every(key => value[key] != null));
      for (let i = 0; i < identifiable.length; i += 50) {
        const lookup = new URL(request.url);
        lookup.search = '';
        const clauses = identifiable.slice(i, i + 50).map(value => {
          const filters = conflict.map(key => `${key}.eq.${JSON.stringify(String(value[key]))}`);
          return filters.length === 1 ? filters[0] : `and(${filters.join(',')})`;
        });
        lookup.searchParams.set('or', `(${clauses.join(',')})`);
        source.push(...await this.readAll(new Request(lookup, { headers: request.headers })));
      }
      const keyOf = (row: Row) => JSON.stringify(conflict.map(key => row[key]));
      const existingRows = new Map(this.merge(table, source).map(row => [keyOf(row), row]));
      for (const original of incoming) {
        const value = structuredClone(original);
        const existing = conflict.every(key => value[key] != null) ? existingRows.get(keyOf(value)) : undefined;
        if (existing && !upsert) throw new Error('開發沙盒：模擬資料已存在。');
        if (existing && ignore) continue;
        if (existing) Object.assign(value, { ...existing, ...value });
        if (value.id == null && table !== 'radiographer_private_profiles') value.id = crypto.randomUUID();
        const key = identity(value);
        mutations.set(key, { before: existing, after: value });
        existingRows.set(keyOf(value), value);
        affected.push(value);
      }
    } else {
      const rows = this.merge(table, await this.readAll(request)).filter(row => matches(row, params));
      for (const row of rows) {
        const after = method === 'PATCH' ? { ...row, ...payload } : undefined;
        if (after && identity(after) !== identity(row)) throw new Error(SANDBOX_BLOCKED);
        mutations.set(identity(row), { before: row, after });
        affected.push(after || row);
      }
    }
    // Validate the response before committing a batch to local memory.
    const response = this.result(request, affected, true);
    this.changes.set(table, mutations);
    return response;
  }

  fetch: typeof fetch = async (input, init) => {
    if (!this.active) return this.network(input, init);
    const request = new Request(input instanceof Request ? input : new URL(String(input), this.origin), init);
    const url = new URL(request.url);
    const read = request.method === 'GET' || request.method === 'HEAD';
    // Refreshing an existing authenticated read session changes no application data.
    if (url.origin === this.origin && url.pathname === '/auth/v1/token' &&
        request.method === 'POST' && url.searchParams.get('grant_type') === 'refresh_token') {
      return this.network(request);
    }
    const rest = url.origin === this.origin && url.pathname.match(/^\/rest\/v1\/(\w+)$/);
    if (rest) {
      const task = this.queue.then(() => this.simulate(request, rest[1]));
      this.queue = task.catch(() => {});
      return task;
    }
    if (!read || /\/api\/sync|\/rest\/v1\/rpc\//.test(url.pathname)) throw new Error(SANDBOX_BLOCKED);
    return this.network(request);
  };
}

const remoteFetch: typeof fetch = (input, init) => fetch(input, init);
let sandbox: DeveloperSandbox | undefined;
export function configureDeveloperSandbox(origin: string) {
  if (!sandbox) sandbox = new DeveloperSandbox(remoteFetch, new URL(origin).origin);
}
export function startDeveloperSandbox(user: Pick<User, 'permissions'>) {
  if (!isDeveloperSandboxUser(user)) return;
  if (!sandbox) throw new Error('開發沙盒尚未初始化');
  sandbox.enable();
}
export const isDeveloperSandboxActive = () => sandbox?.enabled === true;
export const sandboxFetch: typeof fetch = (input, init) => sandbox ? sandbox.fetch(input, init) : remoteFetch(input, init);
export function assertExternalWritesAllowed() {
  if (isDeveloperSandboxActive()) throw new Error(SANDBOX_BLOCKED);
}
