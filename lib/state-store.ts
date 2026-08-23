import { applyStateOperation, emptySharedState, type SharedFloorState, type StateOperation } from "./live-state";

type D1Result = { meta?: { changes?: number } };
type D1Statement = {
  bind(...values: unknown[]): D1Statement;
  run(): Promise<D1Result>;
  first<T>(): Promise<T | null>;
};
type D1DatabaseLike = { prepare(query: string): D1Statement };

type SqlClient = {
  (strings: TemplateStringsArray, ...values: unknown[]): Promise<Array<Record<string, unknown>>>;
  begin<T>(callback: (transaction: SqlClient) => Promise<T>): Promise<T>;
};

let postgresClientPromise: Promise<SqlClient> | null = null;
let memoryState = emptySharedState;

function parseState(data: unknown, version: unknown, updatedAt: unknown): SharedFloorState {
  const parsed = typeof data === "string" ? JSON.parse(data) : data;
  const source = parsed && typeof parsed === "object" ? parsed as Partial<SharedFloorState> : {};
  return {
    floorTables: Array.isArray(source.floorTables) ? source.floorTables : [],
    barChairs: Array.isArray(source.barChairs) ? source.barChairs : [],
    floorObjects: Array.isArray(source.floorObjects) ? source.floorObjects : [],
    statusOverrides: source.statusOverrides && typeof source.statusOverrides === "object" ? source.statusOverrides : {},
    dailyService: source.dailyService && typeof source.dailyService === "object"
      ? {
        dayKey: source.dailyService.dayKey ?? "",
        customersServed: source.dailyService.customersServed ?? 0,
        completedServices: source.dailyService.completedServices ?? 0,
        totalWaitSeconds: source.dailyService.totalWaitSeconds ?? 0,
        greetingServingSeconds: source.dailyService.greetingServingSeconds ?? 0,
        greetingServingSamples: source.dailyService.greetingServingSamples ?? 0,
        readyToFlySeconds: source.dailyService.readyToFlySeconds ?? 0,
        readyToFlySamples: source.dailyService.readyToFlySamples ?? 0,
        postFlightSeconds: source.dailyService.postFlightSeconds ?? 0,
        postFlightSamples: source.dailyService.postFlightSamples ?? 0,
      }
      : { dayKey: "", customersServed: 0, completedServices: 0, totalWaitSeconds: 0, greetingServingSeconds: 0, greetingServingSamples: 0, readyToFlySeconds: 0, readyToFlySamples: 0, postFlightSeconds: 0, postFlightSamples: 0 },
    yearlyService: source.yearlyService && typeof source.yearlyService === "object"
      ? {
        yearKey: source.yearlyService.yearKey ?? "",
        greetingServingSeconds: source.yearlyService.greetingServingSeconds ?? 0,
        greetingServingSamples: source.yearlyService.greetingServingSamples ?? 0,
        readyToFlySeconds: source.yearlyService.readyToFlySeconds ?? 0,
        readyToFlySamples: source.yearlyService.readyToFlySamples ?? 0,
        postFlightSeconds: source.yearlyService.postFlightSeconds ?? 0,
        postFlightSamples: source.yearlyService.postFlightSamples ?? 0,
      }
      : { yearKey: "", greetingServingSeconds: 0, greetingServingSamples: 0, readyToFlySeconds: 0, readyToFlySamples: 0, postFlightSeconds: 0, postFlightSamples: 0 },
    version: Number(version ?? source.version ?? 0),
    updatedAt: Number(updatedAt ?? source.updatedAt ?? 0),
  };
}

async function getPostgresClient() {
  if (!postgresClientPromise) {
    postgresClientPromise = import("postgres").then(({ default: postgres }) => postgres(process.env.DATABASE_URL!, {
      max: 4,
      idle_timeout: 20,
      connect_timeout: 15,
    }) as unknown as SqlClient);
  }
  return postgresClientPromise;
}

async function ensurePostgres(sql: SqlClient) {
  await sql`CREATE TABLE IF NOT EXISTS mybites_state (
    id INTEGER PRIMARY KEY,
    version INTEGER NOT NULL DEFAULT 0,
    data JSONB NOT NULL,
    updated_at BIGINT NOT NULL DEFAULT 0
  )`;
  await sql`INSERT INTO mybites_state (id, version, data, updated_at)
    VALUES (1, 0, ${JSON.stringify(emptySharedState)}::jsonb, 0)
    ON CONFLICT (id) DO NOTHING`;
}

async function readPostgres(): Promise<SharedFloorState> {
  const sql = await getPostgresClient();
  await ensurePostgres(sql);
  const rows = await sql`SELECT version, data, updated_at FROM mybites_state WHERE id = 1`;
  const row = rows[0];
  return parseState(row.data, row.version, row.updated_at);
}

async function mutatePostgres(operation: StateOperation): Promise<SharedFloorState> {
  const sql = await getPostgresClient();
  await ensurePostgres(sql);
  return sql.begin(async (transaction) => {
    const rows = await transaction`SELECT version, data, updated_at FROM mybites_state WHERE id = 1 FOR UPDATE`;
    const row = rows[0];
    const next = applyStateOperation(parseState(row.data, row.version, row.updated_at), operation);
    await transaction`UPDATE mybites_state SET version = ${next.version}, data = ${JSON.stringify(next)}::jsonb, updated_at = ${next.updatedAt} WHERE id = 1`;
    return next;
  });
}

function getD1(): D1DatabaseLike | null {
  return (globalThis as typeof globalThis & { __MYBITES_DB__?: D1DatabaseLike }).__MYBITES_DB__ ?? null;
}

async function ensureD1(database: D1DatabaseLike) {
  await database.prepare(`CREATE TABLE IF NOT EXISTS mybites_state (
    id INTEGER PRIMARY KEY,
    version INTEGER NOT NULL DEFAULT 0,
    data TEXT NOT NULL,
    updated_at INTEGER NOT NULL DEFAULT 0
  )`).run();
  await database.prepare("INSERT OR IGNORE INTO mybites_state (id, version, data, updated_at) VALUES (1, 0, ?, 0)")
    .bind(JSON.stringify(emptySharedState)).run();
}

async function readD1(database: D1DatabaseLike): Promise<SharedFloorState> {
  await ensureD1(database);
  const row = await database.prepare("SELECT version, data, updated_at FROM mybites_state WHERE id = 1")
    .first<{ version: number; data: string; updated_at: number }>();
  return row ? parseState(row.data, row.version, row.updated_at) : emptySharedState;
}

async function mutateD1(database: D1DatabaseLike, operation: StateOperation): Promise<SharedFloorState> {
  await ensureD1(database);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const current = await readD1(database);
    const next = applyStateOperation(current, operation);
    const result = await database.prepare("UPDATE mybites_state SET version = ?, data = ?, updated_at = ? WHERE id = 1 AND version = ?")
      .bind(next.version, JSON.stringify(next), next.updatedAt, current.version).run();
    if ((result.meta?.changes ?? 0) > 0) return next;
  }
  throw new Error("The shared floor changed too quickly. Please try again.");
}

export async function readSharedState(): Promise<SharedFloorState> {
  if (process.env.DATABASE_URL) return readPostgres();
  const database = getD1();
  if (database) return readD1(database);
  return memoryState;
}

export async function mutateSharedState(operation: StateOperation): Promise<SharedFloorState> {
  if (process.env.DATABASE_URL) return mutatePostgres(operation);
  const database = getD1();
  if (database) return mutateD1(database, operation);
  memoryState = applyStateOperation(memoryState, operation);
  return memoryState;
}
