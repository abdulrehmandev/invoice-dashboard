import { sql } from "@vercel/postgres";
import { sql as dbSql, desc, eq, ilike, like, or } from "drizzle-orm";
import { unstable_noStore as noStore } from "next/cache";
import {
  CustomerField,
  CustomersTable,
  InvoiceForm,
  InvoicesTable,
  LatestInvoiceRaw,
  User,
  Revenue,
} from "./definitions";
import { formatCurrency } from "./utils";
import {
  RevenueTable,
  InvoicesTable as InvoicesTableModel,
  db,
  CustomersTable as CustomersTableModel,
} from "./drizzle";
import { count } from "drizzle-orm";

export async function fetchRevenue() {
  // Add noStore() here prevent the response from being cached.
  // This is equivalent to in fetch(..., {cache: 'no-store'}).
  noStore();

  try {
    const data = await db.select().from(RevenueTable);
    return data;
  } catch (error) {
    console.error("Database Error:", error);
    throw new Error("Failed to fetch revenue data.");
  }
}

export async function fetchLatestInvoices() {
  noStore();

  try {
    const data = await db
      .select({
        amount: InvoicesTableModel.amount,
        name: CustomersTableModel.name,
        id: InvoicesTableModel.id,
        email: CustomersTableModel.email,
        image_url: CustomersTableModel.image_url,
      })
      .from(InvoicesTableModel)
      .innerJoin(
        CustomersTableModel,
        eq(InvoicesTableModel.customer_id, CustomersTableModel.id)
      )
      .orderBy(desc(InvoicesTableModel.date))
      .limit(5);

    const latestInvoices = data.map((invoice) => ({
      ...invoice,
      amount: formatCurrency(invoice.amount),
    }));
    return latestInvoices;
  } catch (error) {
    console.error("Database Error:", error);
    throw new Error("Failed to fetch the latest invoices.");
  }
}

export async function fetchCardData() {
  noStore();

  try {
    // You can probably combine these into a single SQL query
    // However, we are intentionally splitting them to demonstrate
    // how to initialize multiple queries in parallel with JS.

    const [{ count: numberOfInvoices }] = await db
      .select({ count: count() })
      .from(InvoicesTableModel);

    const [{ count: numberOfCustomers }] = await db
      .select({ count: count() })
      .from(CustomersTableModel);

    const [{ paid, pending }] = await db
      .select({
        paid: dbSql<number>`SUM(amount) FILTER (WHERE status = 'paid')`,
        pending: dbSql<number>`SUM(amount) FILTER (WHERE status = 'pending')`,
      })
      .from(InvoicesTableModel);

    return {
      numberOfCustomers,
      numberOfInvoices,
      totalPaidInvoices: formatCurrency(paid),
      totalPendingInvoices: formatCurrency(pending),
    };
  } catch (error) {
    console.error("Database Error:", error);
    throw new Error("Failed to card data.");
  }
}

const ITEMS_PER_PAGE = 6;
export async function fetchFilteredInvoices(
  query: string,
  currentPage: number
) {
  noStore();

  const offset = (currentPage - 1) * ITEMS_PER_PAGE;

  try {
    const invoices = await db
      .select({
        id: InvoicesTableModel.id,
        amount: InvoicesTableModel.amount,
        date: InvoicesTableModel.date,
        status: InvoicesTableModel.status,
        name: CustomersTableModel.name,
        email: CustomersTableModel.email,
        image_url: CustomersTableModel.image_url,
      })
      .from(InvoicesTableModel)
      .innerJoin(
        CustomersTableModel,
        eq(InvoicesTableModel.customer_id, CustomersTableModel.id)
      )
      .where(
        or(
          ilike(CustomersTableModel.name, `%${query}%`),
          ilike(CustomersTableModel.email, `%${query}%`),
          ilike(InvoicesTableModel.status, `%${query}%`),
          dbSql`invoices.amount::text ILIKE ${`%${query}%`}`,
          dbSql`invoices.date::text ILIKE ${`%${query}%`}`
        )
      )
      .orderBy(desc(InvoicesTableModel.date))
      .limit(ITEMS_PER_PAGE)
      .offset(offset);

    return invoices;
  } catch (error) {
    console.error("Database Error:", error);
    throw new Error("Failed to fetch invoices.");
  }
}

export async function fetchInvoicesPages(query: string) {
  noStore();

  try {
    const [{ count: invoiceCount }] = await db
      .select({ count: count() })
      .from(InvoicesTableModel)
      .innerJoin(
        CustomersTableModel,
        eq(InvoicesTableModel.customer_id, CustomersTableModel.id)
      )
      .where(
        or(
          ilike(CustomersTableModel.name, `%${query}%`),
          ilike(CustomersTableModel.email, `%${query}%`),
          ilike(InvoicesTableModel.status, `%${query}%`),
          dbSql`invoices.amount::text ILIKE ${`%${query}%`}`,
          dbSql`invoices.date::text ILIKE ${`%${query}%`}`
        )
      );

    console.log(invoiceCount);

    const totalPages = Math.ceil(invoiceCount / ITEMS_PER_PAGE);
    return totalPages;
  } catch (error) {
    console.error("Database Error:", error);
    throw new Error("Failed to fetch total number of invoices.");
  }
}

export async function fetchInvoiceById(id: string) {
  noStore();

  try {
    const [invoice] = await db
      .select({
        id: InvoicesTableModel.id,
        customer_id: InvoicesTableModel.customer_id,
        amount: InvoicesTableModel.amount,
        status: InvoicesTableModel.status,
      })
      .from(InvoicesTableModel)
      .where(eq(InvoicesTableModel.id, id));

    invoice.amount = invoice.amount / 100;

    return invoice;
  } catch (error) {
    console.error("Database Error:", error);
  }
}

export async function fetchCustomers() {
  try {
    return await db
      .select({ id: CustomersTableModel.id, name: CustomersTableModel.name })
      .from(CustomersTableModel)
      .orderBy(CustomersTableModel.name);
  } catch (err) {
    console.error("Database Error:", err);
    throw new Error("Failed to fetch all customers.");
  }
}

export async function fetchFilteredCustomers(query: string) {
  noStore();

  try {
    const data = await sql<CustomersTable>`
		SELECT
		  customers.id,
		  customers.name,
		  customers.email,
		  customers.image_url,
		  COUNT(invoices.id) AS total_invoices,
		  SUM(CASE WHEN invoices.status = 'pending' THEN invoices.amount ELSE 0 END) AS total_pending,
		  SUM(CASE WHEN invoices.status = 'paid' THEN invoices.amount ELSE 0 END) AS total_paid
		FROM customers
		LEFT JOIN invoices ON customers.id = invoices.customer_id
		WHERE
		  customers.name ILIKE ${`%${query}%`} OR
        customers.email ILIKE ${`%${query}%`}
		GROUP BY customers.id, customers.name, customers.email, customers.image_url
		ORDER BY customers.name ASC
	  `;

    const customers = data.rows.map((customer) => ({
      ...customer,
      total_pending: formatCurrency(customer.total_pending),
      total_paid: formatCurrency(customer.total_paid),
    }));

    return customers;
  } catch (err) {
    console.error("Database Error:", err);
    throw new Error("Failed to fetch customer table.");
  }
}

export async function getUser(email: string) {
  noStore();

  try {
    const user = await sql`SELECT * from USERS where email=${email}`;
    return user.rows[0] as User;
  } catch (error) {
    console.error("Failed to fetch user:", error);
    throw new Error("Failed to fetch user.");
  }
}
