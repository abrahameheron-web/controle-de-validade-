import { and, desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { appSessions, appSettings, auditEvents, employees, products } from "../drizzle/schema";
import { isCalendarDate } from "../shared/expiry";
import { authenticateEmployee, createFirstAdmin, hashPassword, isAppSetupRequired, logoutEmployee, publicEmployee } from "./appAuth";
import { getDb } from "./db";
import { systemRouter } from "./_core/systemRouter";
import { employeeAdminProcedure, employeeProcedure, publicProcedure, router } from "./_core/trpc";

function requireDatabase() {
  return getDb().then(db => {
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "O banco de dados não está disponível." });
    return db;
  });
}

const usernameSchema = z.string().trim().min(3).max(48).regex(/^[a-zA-Z0-9._-]+$/, "Use letras, números, ponto, hífen ou sublinhado.").transform(value => value.toLowerCase());
const passwordSchema = z.string().min(10, "A senha precisa ter pelo menos 10 caracteres.").max(128);
const productFields = {
  name: z.string().trim().min(1).max(160),
  quantity: z.number().int().min(0).max(2147483647),
  entryDate: z.string().refine(isCalendarDate, "Informe uma data válida."),
  expiryDate: z.string().refine(isCalendarDate, "Informe uma data válida."),
};
const productInput = z.object(productFields);

function productSnapshot(product: { name: string; quantity: number; entryDate: string; expiryDate: string }) {
  return {
    name: product.name,
    quantity: product.quantity,
    entryDate: product.entryDate,
    expiryDate: product.expiryDate,
  };
}

const loginFailures = new Map<string, { count: number; resetAt: number }>();
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_LOGIN_FAILURES = 8;
function loginKey(username: string, ip: string) {
  return `${ip}:${username}`;
}
function checkLoginLimit(key: string) {
  const current = loginFailures.get(key);
  if (!current || current.resetAt <= Date.now()) return;
  if (current.count >= MAX_LOGIN_FAILURES) {
    throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Muitas tentativas. Aguarde alguns minutos e tente novamente." });
  }
}
function recordLoginFailure(key: string) {
  const current = loginFailures.get(key);
  if (!current || current.resetAt <= Date.now()) {
    loginFailures.set(key, { count: 1, resetAt: Date.now() + LOGIN_WINDOW_MS });
  } else {
    current.count += 1;
  }
}

export const appRouter = router({
  system: systemRouter,

  auth: router({
    current: publicProcedure.query(async ({ ctx }) => ({
      setupRequired: await isAppSetupRequired(),
      employee: ctx.employee ? publicEmployee(ctx.employee) : null,
    })),
    setup: publicProcedure.input(z.object({
      username: usernameSchema,
      displayName: z.string().trim().min(1).max(120),
      password: passwordSchema,
    })).mutation(async ({ ctx, input }) => {
      try {
        const employee = await createFirstAdmin(input, ctx.res);
        return publicEmployee(employee);
      } catch (error) {
        if (error instanceof Error && error.message === "SETUP_ALREADY_COMPLETED") {
          throw new TRPCError({ code: "CONFLICT", message: "A configuração inicial já foi concluída." });
        }
        if (String(error).includes("Duplicate entry")) {
          throw new TRPCError({ code: "CONFLICT", message: "Este usuário já existe." });
        }
        throw error;
      }
    }),
    login: publicProcedure.input(z.object({ username: usernameSchema, password: z.string().min(1).max(128) })).mutation(async ({ ctx, input }) => {
      const key = loginKey(input.username, ctx.req.ip || "unknown");
      checkLoginLimit(key);
      const employee = await authenticateEmployee(input.username, input.password, ctx.res);
      if (!employee) {
        recordLoginFailure(key);
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Usuário ou senha incorretos." });
      }
      loginFailures.delete(key);
      return publicEmployee(employee);
    }),
    logout: publicProcedure.mutation(async ({ ctx }) => {
      await logoutEmployee(ctx.req, ctx.res);
      return { success: true } as const;
    }),
  }),

  products: router({
    list: employeeProcedure.query(async () => {
      const db = await requireDatabase();
      return db.select().from(products).orderBy(products.expiryDate, products.name);
    }),
    create: employeeProcedure.input(productInput).mutation(async ({ ctx, input }) => {
      const db = await requireDatabase();
      return db.transaction(async tx => {
        const [created] = await tx.insert(products).values({
          ...input,
          createdBy: ctx.employee.id,
          updatedBy: ctx.employee.id,
        }).$returningId();
        if (!created?.id) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Não foi possível salvar o produto." });
        const [product] = await tx.select().from(products).where(eq(products.id, created.id)).limit(1);
        if (!product) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Não foi possível carregar o produto salvo." });
        await tx.insert(auditEvents).values({
          employeeId: ctx.employee.id,
          employeeName: ctx.employee.displayName,
          productId: product.id,
          productName: product.name,
          action: "created",
          previousInfo: null,
          newInfo: JSON.stringify(productSnapshot(product)),
        });
        return product;
      });
    }),
    update: employeeProcedure.input(z.object({ id: z.number().int().positive(), ...productFields })).mutation(async ({ ctx, input }) => {
      const db = await requireDatabase();
      return db.transaction(async tx => {
        const [previous] = await tx.select().from(products).where(eq(products.id, input.id)).for("update").limit(1);
        if (!previous) throw new TRPCError({ code: "NOT_FOUND", message: "Produto não encontrado." });
        const changed = { name: input.name, quantity: input.quantity, entryDate: input.entryDate, expiryDate: input.expiryDate };
        await tx.update(products).set({ ...changed, updatedBy: ctx.employee.id, updatedAt: new Date() }).where(eq(products.id, input.id));
        const [updated] = await tx.select().from(products).where(eq(products.id, input.id)).limit(1);
        if (!updated) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Não foi possível carregar o produto atualizado." });
        await tx.insert(auditEvents).values({
          employeeId: ctx.employee.id,
          employeeName: ctx.employee.displayName,
          productId: updated.id,
          productName: updated.name,
          action: "edited",
          previousInfo: JSON.stringify(productSnapshot(previous)),
          newInfo: JSON.stringify(productSnapshot(updated)),
        });
        return updated;
      });
    }),
    delete: employeeAdminProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const db = await requireDatabase();
      return db.transaction(async tx => {
        const [previous] = await tx.select().from(products).where(eq(products.id, input.id)).for("update").limit(1);
        if (!previous) throw new TRPCError({ code: "NOT_FOUND", message: "Produto não encontrado." });
        await tx.insert(auditEvents).values({
          employeeId: ctx.employee.id,
          employeeName: ctx.employee.displayName,
          productId: previous.id,
          productName: previous.name,
          action: "deleted",
          previousInfo: JSON.stringify(productSnapshot(previous)),
          newInfo: null,
        });
        await tx.delete(products).where(eq(products.id, input.id));
        return { success: true } as const;
      });
    }),
  }),

  staff: router({
    list: employeeAdminProcedure.query(async () => {
      const db = await requireDatabase();
      return db.select({
        id: employees.id,
        username: employees.username,
        displayName: employees.displayName,
        role: employees.role,
        active: employees.active,
        createdAt: employees.createdAt,
        lastSignedIn: employees.lastSignedIn,
      }).from(employees).orderBy(employees.displayName);
    }),
    create: employeeAdminProcedure.input(z.object({
      username: usernameSchema,
      displayName: z.string().trim().min(1).max(120),
      password: passwordSchema,
      role: z.enum(["employee", "admin"]).default("employee"),
    })).mutation(async ({ input }) => {
      const db = await requireDatabase();
      const passwordHash = await hashPassword(input.password);
      try {
        const [created] = await db.insert(employees).values({
          username: input.username,
          displayName: input.displayName,
          passwordHash,
          role: input.role,
          active: true,
        }).$returningId();
        const [employee] = await db.select({
          id: employees.id,
          username: employees.username,
          displayName: employees.displayName,
          role: employees.role,
          active: employees.active,
          createdAt: employees.createdAt,
          lastSignedIn: employees.lastSignedIn,
        }).from(employees).where(eq(employees.id, created.id)).limit(1);
        return employee;
      } catch (error) {
        if (String(error).includes("Duplicate entry")) throw new TRPCError({ code: "CONFLICT", message: "Este usuário já existe." });
        throw error;
      }
    }),
    remove: employeeAdminProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      if (ctx.employee.id === input.id) throw new TRPCError({ code: "BAD_REQUEST", message: "Você não pode remover o próprio usuário." });
      const db = await requireDatabase();
      await db.transaction(async tx => {
        await tx.select().from(appSettings).where(eq(appSettings.id, 1)).for("update").limit(1);
        const [target] = await tx.select().from(employees).where(eq(employees.id, input.id)).for("update").limit(1);
        if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "Funcionário não encontrado." });
        if (target.role === "admin") {
          const administrators = await tx.select({ id: employees.id }).from(employees).where(and(eq(employees.role, "admin"), eq(employees.active, true))).for("update");
          if (administrators.length <= 1) throw new TRPCError({ code: "CONFLICT", message: "O último administrador não pode ser removido." });
        }
        await tx.delete(appSessions).where(eq(appSessions.employeeId, input.id));
        await tx.delete(employees).where(eq(employees.id, input.id));
      });
      return { success: true } as const;
    }),
    history: employeeAdminProcedure.query(async () => {
      const db = await requireDatabase();
      return db.select().from(auditEvents).orderBy(desc(auditEvents.createdAt), desc(auditEvents.id)).limit(250);
    }),
  }),
});

export type AppRouter = typeof appRouter;
