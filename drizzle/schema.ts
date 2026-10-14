import {
  boolean,
  date,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";

/** Existing Manus OAuth users used by the starter's platform integration. */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/** Employees use their own username/password accounts, independent from Manus OAuth. */
export const employees = mysqlTable("employees", {
  id: int("id").autoincrement().primaryKey(),
  username: varchar("username", { length: 48 }).notNull().unique(),
  displayName: varchar("displayName", { length: 120 }).notNull(),
  passwordHash: varchar("passwordHash", { length: 255 }).notNull(),
  role: mysqlEnum("role", ["employee", "admin"]).default("employee").notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn"),
});
export type Employee = typeof employees.$inferSelect;

/** Only the hash of the random browser session token is stored in the database. */
export const appSessions = mysqlTable("app_sessions", {
  id: int("id").autoincrement().primaryKey(),
  employeeId: int("employeeId").notNull().references(() => employees.id, { onDelete: "cascade" }),
  tokenHash: varchar("tokenHash", { length: 64 }).notNull().unique(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const appSettings = mysqlTable("app_settings", {
  id: int("id").primaryKey(),
  setupCompleted: boolean("setupCompleted").default(false).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const products = mysqlTable("products", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 160 }).notNull(),
  quantity: int("quantity", { unsigned: true }).notNull().default(0),
  entryDate: date("entryDate", { mode: "string" }).notNull(),
  expiryDate: date("expiryDate", { mode: "string" }).notNull(),
  createdBy: int("createdBy").notNull(),
  updatedBy: int("updatedBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type Product = typeof products.$inferSelect;

/** Append-only product event log; snapshots remain available after a product is deleted. */
export const auditEvents = mysqlTable("audit_events", {
  id: int("id").autoincrement().primaryKey(),
  employeeId: int("employeeId"),
  employeeName: varchar("employeeName", { length: 120 }).notNull(),
  productId: int("productId"),
  productName: varchar("productName", { length: 160 }).notNull(),
  action: mysqlEnum("action", ["created", "edited", "deleted"]).notNull(),
  previousInfo: text("previousInfo"),
  newInfo: text("newInfo"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type AuditEvent = typeof auditEvents.$inferSelect;
