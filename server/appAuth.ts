import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { parse as parseCookieHeader } from "cookie";
import type { Request, Response } from "express";
import { appSessions, appSettings, employees, type Employee } from "../drizzle/schema";
import { getDb } from "./db";

export const APP_SESSION_COOKIE = "cv_session";
const SESSION_DURATION_MS = 14 * 24 * 60 * 60 * 1000;
const DUMMY_PASSWORD_HASH = `${"00".repeat(16)}:${"00".repeat(64)}`;

function deriveKey(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, (error, key) => {
      if (error) reject(error);
      else resolve(key as Buffer);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const key = await deriveKey(password, salt);
  return `${salt}:${key.toString("hex")}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [salt, hash] = encoded.split(":");
  if (!salt || !hash || !/^[a-f0-9]{32}$/.test(salt) || !/^[a-f0-9]{128}$/.test(hash)) {
    return false;
  }
  const actual = await deriveKey(password, salt);
  const expected = Buffer.from(hash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function publicEmployee(employee: Employee) {
  return {
    id: employee.id,
    username: employee.username,
    displayName: employee.displayName,
    role: employee.role,
    active: employee.active,
    createdAt: employee.createdAt,
    lastSignedIn: employee.lastSignedIn,
  };
}

function requireDatabase() {
  return getDb().then(db => {
    if (!db) throw new Error("DATABASE_UNAVAILABLE");
    return db;
  });
}

async function ensureSettingsRow() {
  const db = await requireDatabase();
  let [settings] = await db.select().from(appSettings).where(eq(appSettings.id, 1)).limit(1);
  if (!settings) {
    const [existingEmployee] = await db.select({ id: employees.id }).from(employees).limit(1);
    await db.insert(appSettings).values({ id: 1, setupCompleted: Boolean(existingEmployee) }).onDuplicateKeyUpdate({
      set: { id: 1 },
    });
    [settings] = await db.select().from(appSettings).where(eq(appSettings.id, 1)).limit(1);
  }
  if (!settings) throw new Error("APP_SETTINGS_UNAVAILABLE");
  return settings;
}

export async function isAppSetupRequired(): Promise<boolean> {
  const settings = await ensureSettingsRow();
  return !settings.setupCompleted;
}

function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: true,
    sameSite: "none" as const,
    path: "/",
    maxAge: SESSION_DURATION_MS,
  };
}

function sessionTokenFromRequest(req: Request): string | undefined {
  return parseCookieHeader(req.headers.cookie ?? "")[APP_SESSION_COOKIE];
}

function digestToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function issueEmployeeSession(employeeId: number, res: Response): Promise<void> {
  const db = await requireDatabase();
  const rawToken = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  await db.insert(appSessions).values({
    employeeId,
    tokenHash: digestToken(rawToken),
    expiresAt,
  });
  res.cookie(APP_SESSION_COOKIE, rawToken, sessionCookieOptions());
}

export async function getEmployeeFromRequest(req: Request): Promise<Employee | null> {
  const rawToken = sessionTokenFromRequest(req);
  if (!rawToken) return null;
  const db = await getDb();
  if (!db) return null;
  const [session] = await db
    .select({ employeeId: appSessions.employeeId })
    .from(appSessions)
    .where(and(eq(appSessions.tokenHash, digestToken(rawToken)), gt(appSessions.expiresAt, new Date())))
    .limit(1);
  if (!session) return null;
  const [employee] = await db
    .select()
    .from(employees)
    .where(and(eq(employees.id, session.employeeId), eq(employees.active, true)))
    .limit(1);
  return employee ?? null;
}

export async function createFirstAdmin(input: {
  username: string;
  displayName: string;
  password: string;
}, res: Response): Promise<Employee> {
  await ensureSettingsRow();
  const db = await requireDatabase();
  const passwordHash = await hashPassword(input.password);
  const employeeId = await db.transaction(async tx => {
    const [settings] = await tx.select().from(appSettings).where(eq(appSettings.id, 1)).for("update").limit(1);
    const [existingEmployee] = await tx.select({ id: employees.id }).from(employees).limit(1);
    if (!settings || settings.setupCompleted || existingEmployee) throw new Error("SETUP_ALREADY_COMPLETED");
    const [created] = await tx.insert(employees).values({
      username: input.username,
      displayName: input.displayName,
      passwordHash,
      role: "admin",
      active: true,
    }).$returningId();
    if (!created?.id) throw new Error("ADMIN_CREATE_FAILED");
    await tx.update(appSettings).set({ setupCompleted: true }).where(eq(appSettings.id, 1));
    return created.id;
  });
  const [employee] = await db.select().from(employees).where(eq(employees.id, employeeId)).limit(1);
  if (!employee) throw new Error("ADMIN_CREATE_FAILED");
  await issueEmployeeSession(employee.id, res);
  return employee;
}

export async function authenticateEmployee(
  username: string,
  password: string,
  res: Response,
): Promise<Employee | null> {
  const db = await requireDatabase();
  const [employee] = await db.select().from(employees).where(eq(employees.username, username)).limit(1);
  const validPassword = await verifyPassword(password, employee?.passwordHash ?? DUMMY_PASSWORD_HASH);
  if (!employee || !employee.active || !validPassword) return null;
  await db.update(employees).set({ lastSignedIn: new Date() }).where(eq(employees.id, employee.id));
  const [updated] = await db.select().from(employees).where(eq(employees.id, employee.id)).limit(1);
  if (!updated) return null;
  await issueEmployeeSession(updated.id, res);
  return updated;
}

export async function logoutEmployee(req: Request, res: Response): Promise<void> {
  const rawToken = sessionTokenFromRequest(req);
  const db = await getDb();
  if (rawToken && db) {
    await db.delete(appSessions).where(eq(appSessions.tokenHash, digestToken(rawToken)));
  }
  res.clearCookie(APP_SESSION_COOKIE, {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    path: "/",
  });
}
