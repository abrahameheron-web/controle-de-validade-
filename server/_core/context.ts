import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { Employee, User } from "../../drizzle/schema";
import { getEmployeeFromRequest } from "../appAuth";
import { sdk } from "./sdk";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
  employee: Employee | null;
};

export async function createContext(opts: CreateExpressContextOptions): Promise<TrpcContext> {
  let user: User | null = null;
  let employee: Employee | null = null;

  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch {
    // OAuth is retained for the platform starter but is not the employee login.
    user = null;
  }
  try {
    employee = await getEmployeeFromRequest(opts.req);
  } catch (error) {
    console.error("[Employee auth] Session lookup failed:", error instanceof Error ? error.message : "unknown error");
    employee = null;
  }

  return { req: opts.req, res: opts.res, user, employee };
}
