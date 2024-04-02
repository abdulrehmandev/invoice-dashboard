import { sql } from "@vercel/postgres";
import { InferSelectModel } from "drizzle-orm";
import {
  date,
  doublePrecision,
  uuid,
  pgEnum,
  serial,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { pgTable } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/vercel-postgres";

export const db = drizzle(sql);

export const UsersTable = pgTable(
  "users",
  {
    id: uuid("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    password: text("password").notNull(),
  },
  (users) => {
    return {
      uniqueIdx: uniqueIndex("unique_idx").on(users.email),
    };
  }
);
export type User = InferSelectModel<typeof UsersTable>;

export const CustomersTable = pgTable("customers", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  image_url: text("image_url").notNull(),
});
export type Customer = InferSelectModel<typeof CustomersTable>;

export const productStatus = pgEnum("status", ["pending", "paid"]);

export const InvoicesTable = pgTable("invoices", {
  id: uuid("id").primaryKey().defaultRandom(),
  customer_id: uuid("customer_id")
    .notNull()
    .references(() => CustomersTable.id),
  amount: doublePrecision("amount").notNull(),
  status: productStatus("status").default("pending").notNull(),
  date: date("date").notNull(),
});
export type Invoice = InferSelectModel<typeof InvoicesTable>;

export const RevenueTable = pgTable("revenue", {
  month: text("month").notNull(),
  revenue: doublePrecision("revenue").notNull(),
});
export type Revenue = InferSelectModel<typeof RevenueTable>;
