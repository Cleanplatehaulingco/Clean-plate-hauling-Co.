import {
  leads, jobs, crews, estimates, settings, followUps, receipts, invoices, aiMemoryEvents, aiAgents,
  type Lead, type InsertLead,
  type Job, type InsertJob,
  type Crew, type InsertCrew,
  type Estimate, type InsertEstimate,
  type Settings, type InsertSettings,
  type FollowUp, type InsertFollowUp,
  type Receipt, type InsertReceipt,
  type Invoice, type InsertInvoice,
  type AiMemoryEvent, type InsertAiMemoryEvent,
  type AiAgent, type InsertAiAgent,
} from "@shared/schema";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, desc } from "drizzle-orm";

const sqlite = new Database("data.db");
sqlite.pragma("journal_mode = WAL");

// Bootstrap tables - simpler than migrations for a single-file demo
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT,
    city TEXT NOT NULL,
    address TEXT,
    source TEXT NOT NULL,
    job_type TEXT NOT NULL,
    estimated_value REAL NOT NULL DEFAULT 0,
    stage TEXT NOT NULL DEFAULT 'new',
    next_action TEXT,
    next_action_date TEXT,
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id INTEGER,
    customer_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    address TEXT NOT NULL,
    city TEXT NOT NULL,
    scheduled_date TEXT NOT NULL,
    time_window TEXT NOT NULL,
    crew_id INTEGER,
    truck_fill_pct INTEGER NOT NULL DEFAULT 50,
    job_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'scheduled',
    estimated_revenue REAL NOT NULL DEFAULT 0,
    notes TEXT,
    checklist TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS crews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    lead TEXT NOT NULL,
    truck TEXT NOT NULL,
    capacity_yards INTEGER NOT NULL DEFAULT 15,
    phone TEXT,
    active INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS estimates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id INTEGER,
    customer_name TEXT NOT NULL,
    truck_fill_pct INTEGER NOT NULL,
    labor_minutes INTEGER NOT NULL,
    crew_size INTEGER NOT NULL DEFAULT 2,
    stairs_flights INTEGER NOT NULL DEFAULT 0,
    heavy_items INTEGER NOT NULL DEFAULT 0,
    distance_miles REAL NOT NULL DEFAULT 0,
    discount REAL NOT NULL DEFAULT 0,
    suggested_price REAL NOT NULL,
    floor_price REAL NOT NULL,
    estimated_cost REAL NOT NULL,
    notes TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    business_name TEXT NOT NULL DEFAULT 'Clean Plate Hauling Co',
    home_base TEXT NOT NULL DEFAULT 'Wixom, MI',
    dump_fee_per_load REAL NOT NULL DEFAULT 85,
    labor_hourly_rate REAL NOT NULL DEFAULT 45,
    travel_fee_per_mile REAL NOT NULL DEFAULT 1.75,
    minimum_job_price REAL NOT NULL DEFAULT 125,
    target_margin_pct INTEGER NOT NULL DEFAULT 55,
    crew_capacity_yards INTEGER NOT NULL DEFAULT 15,
    stairs_fee REAL NOT NULL DEFAULT 25,
    heavy_item_fee REAL NOT NULL DEFAULT 35,
    base_truck_fee REAL NOT NULL DEFAULT 95,
    price_per_yard REAL NOT NULL DEFAULT 38,
    auto_optimize_mode INTEGER NOT NULL DEFAULT 1,
    max_auto_price_adjust_pct INTEGER NOT NULL DEFAULT 8,
    follow_up_speed_hours INTEGER NOT NULL DEFAULT 2,
    last_optimized_at TEXT
  );

  CREATE TABLE IF NOT EXISTS follow_ups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL,
    channel TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS receipts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id INTEGER,
    customer_name TEXT NOT NULL,
    phone TEXT,
    address TEXT,
    city TEXT,
    amount REAL NOT NULL,
    payment_method TEXT NOT NULL DEFAULT 'Cash',
    dump_fee REAL NOT NULL DEFAULT 0,
    labor_cost REAL NOT NULL DEFAULT 0,
    resale_value REAL NOT NULL DEFAULT 0,
    scrap_value REAL NOT NULL DEFAULT 0,
    recycle_credit REAL NOT NULL DEFAULT 0,
    donation_value REAL NOT NULL DEFAULT 0,
    other_recovery REAL NOT NULL DEFAULT 0,
    before_photo_name TEXT,
    after_photo_name TEXT,
    proof_notes TEXT,
    receipt_number TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS ai_builder_actions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    tool_name TEXT NOT NULL,
    risk_level TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    mode TEXT NOT NULL DEFAULT 'apply_with_approval',
    human_summary TEXT NOT NULL,
    input_json TEXT NOT NULL DEFAULT '{}',
    preview_json TEXT NOT NULL DEFAULT '{}',
    result_json TEXT,
    rollback_json TEXT,
    approval_required INTEGER NOT NULL DEFAULT 1,
    approved_at TEXT,
    executed_at TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS ai_business_memory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    memory_type TEXT NOT NULL,
    key TEXT NOT NULL,
    value_json TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'builder_mode',
    confidence REAL NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(memory_type, key)
  );

  CREATE TABLE IF NOT EXISTS ai_memory_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    memory_layer TEXT NOT NULL,
    category TEXT NOT NULL,
    title TEXT NOT NULL,
    summary TEXT NOT NULL,
    entity_type TEXT,
    entity_id TEXT,
    customer_name TEXT,
    importance INTEGER NOT NULL DEFAULT 3,
    evidence_json TEXT NOT NULL DEFAULT '{}',
    owner_feedback TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS ai_agents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    purpose TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    tool_permissions_json TEXT NOT NULL DEFAULT '[]',
    approval_policy_json TEXT NOT NULL DEFAULT '{}',
    memory_scopes_json TEXT NOT NULL DEFAULT '[]',
    created_by_action_id INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    address TEXT,
    city TEXT,
    job_id INTEGER,
    invoice_number TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    line_items_json TEXT NOT NULL DEFAULT '[]',
    subtotal REAL NOT NULL DEFAULT 0,
    tax REAL NOT NULL DEFAULT 0,
    total REAL NOT NULL DEFAULT 0,
    due_date TEXT,
    notes TEXT,
    email_subject TEXT,
    email_body TEXT,
    sent_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

function ensureColumn(table: string, column: string, definition: string) {
  const cols = sqlite.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!cols.some(c => c.name === column)) {
    sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

ensureColumn("settings", "auto_optimize_mode", "INTEGER NOT NULL DEFAULT 1");
ensureColumn("settings", "max_auto_price_adjust_pct", "INTEGER NOT NULL DEFAULT 8");
ensureColumn("settings", "follow_up_speed_hours", "INTEGER NOT NULL DEFAULT 2");
ensureColumn("settings", "last_optimized_at", "TEXT");
ensureColumn("receipts", "resale_value", "REAL NOT NULL DEFAULT 0");
ensureColumn("receipts", "scrap_value", "REAL NOT NULL DEFAULT 0");
ensureColumn("receipts", "recycle_credit", "REAL NOT NULL DEFAULT 0");
ensureColumn("receipts", "donation_value", "REAL NOT NULL DEFAULT 0");
ensureColumn("receipts", "other_recovery", "REAL NOT NULL DEFAULT 0");

export const db = drizzle(sqlite);

export interface IStorage {
  // Leads
  listLeads(): Promise<Lead[]>;
  getLead(id: number): Promise<Lead | undefined>;
  createLead(data: InsertLead): Promise<Lead>;
  updateLead(id: number, data: Partial<InsertLead>): Promise<Lead | undefined>;
  deleteLead(id: number): Promise<void>;

  // Jobs
  listJobs(): Promise<Job[]>;
  getJob(id: number): Promise<Job | undefined>;
  createJob(data: InsertJob): Promise<Job>;
  updateJob(id: number, data: Partial<InsertJob>): Promise<Job | undefined>;

  // Crews
  listCrews(): Promise<Crew[]>;

  // Estimates
  listEstimates(): Promise<Estimate[]>;
  createEstimate(data: InsertEstimate): Promise<Estimate>;

  // Settings
  getSettings(): Promise<Settings>;
  updateSettings(data: Partial<InsertSettings>): Promise<Settings>;

  // Follow-ups
  listFollowUps(): Promise<FollowUp[]>;

  // Receipts
  listReceipts(): Promise<Receipt[]>;
  createReceipt(data: InsertReceipt): Promise<Receipt>;

  // Invoices
  listInvoices(): Promise<any[]>;
  getInvoice(id: number): Promise<any | undefined>;
  createInvoice(data: InsertInvoice): Promise<any>;
  updateInvoice(id: number, data: Partial<InsertInvoice> & { status?: string; sentAt?: string | null }): Promise<any | undefined>;

  // AI Builder Mode
  listBuilderActions(): Promise<any[]>;
  createBuilderAction(data: {
    title: string;
    toolName: string;
    riskLevel: string;
    status?: string;
    mode?: string;
    humanSummary: string;
    input?: any;
    preview?: any;
    rollback?: any;
    approvalRequired?: boolean;
  }): Promise<any>;
  updateBuilderAction(id: number, data: Partial<{
    status: string;
    result: any;
    rollback: any;
    approvedAt: string | null;
    executedAt: string | null;
  }>): Promise<any | undefined>;
  listBusinessMemory(): Promise<any[]>;
  upsertBusinessMemory(data: { memoryType: string; key: string; value: any; source?: string; confidence?: number }): Promise<any>;
  listMemoryEvents(limit?: number): Promise<any[]>;
  createMemoryEvent(data: InsertAiMemoryEvent): Promise<any>;
  searchMemoryEvents(query: string, limit?: number): Promise<any[]>;
  listAgents(): Promise<any[]>;
  createAgent(data: InsertAiAgent): Promise<any>;
  updateAgent(id: number, data: Partial<InsertAiAgent>): Promise<any | undefined>;
}

function nowIso() { return new Date().toISOString(); }

export class DatabaseStorage implements IStorage {
  async listLeads() {
    return db.select().from(leads).orderBy(desc(leads.updatedAt)).all();
  }
  async getLead(id: number) {
    return db.select().from(leads).where(eq(leads.id, id)).get();
  }
  async createLead(data: InsertLead) {
    const now = nowIso();
    return db.insert(leads).values({ ...data, createdAt: now, updatedAt: now }).returning().get();
  }
  async updateLead(id: number, data: Partial<InsertLead>) {
    return db.update(leads).set({ ...data, updatedAt: nowIso() }).where(eq(leads.id, id)).returning().get();
  }
  async deleteLead(id: number) {
    db.delete(leads).where(eq(leads.id, id)).run();
  }

  async listJobs() {
    return db.select().from(jobs).orderBy(jobs.scheduledDate).all();
  }
  async getJob(id: number) {
    return db.select().from(jobs).where(eq(jobs.id, id)).get();
  }
  async createJob(data: InsertJob) {
    return db.insert(jobs).values({ ...data, createdAt: nowIso() }).returning().get();
  }
  async updateJob(id: number, data: Partial<InsertJob>) {
    return db.update(jobs).set(data).where(eq(jobs.id, id)).returning().get();
  }

  async listCrews() {
    return db.select().from(crews).all();
  }

  async listEstimates() {
    return db.select().from(estimates).orderBy(desc(estimates.createdAt)).all();
  }
  async createEstimate(data: InsertEstimate) {
    return db.insert(estimates).values({ ...data, createdAt: nowIso() }).returning().get();
  }

  async getSettings() {
    const existing = db.select().from(settings).where(eq(settings.id, 1)).get();
    if (existing) return existing;
    return db.insert(settings).values({ id: 1 } as any).returning().get();
  }
  async updateSettings(data: Partial<InsertSettings>) {
    await this.getSettings();
    return db.update(settings).set(data).where(eq(settings.id, 1)).returning().get();
  }

  async listFollowUps() {
    return db.select().from(followUps).all();
  }

  async listReceipts() {
    return db.select().from(receipts).orderBy(desc(receipts.createdAt)).all();
  }
  async createReceipt(data: InsertReceipt) {
    const date = new Date();
    const ymd = date.toISOString().slice(0, 10).replace(/-/g, "");
    const count = db.select().from(receipts).all().length + 1;
    const receiptNumber = `CP-${ymd}-${String(count).padStart(3, "0")}`;
    return db.insert(receipts).values({ ...data, receiptNumber, createdAt: nowIso() }).returning().get();
  }

  async listInvoices() {
    return sqlite.prepare(`
      SELECT
        id, customer_name as customerName, email, phone, address, city, job_id as jobId,
        invoice_number as invoiceNumber, status, line_items_json as lineItemsJson,
        subtotal, tax, total, due_date as dueDate, notes, email_subject as emailSubject,
        email_body as emailBody, sent_at as sentAt, created_at as createdAt, updated_at as updatedAt
      FROM invoices
      ORDER BY id DESC
      LIMIT 200
    `).all().map((row: any) => ({
      ...row,
      lineItems: JSON.parse(row.lineItemsJson || "[]"),
    }));
  }
  async getInvoice(id: number) {
    return (await this.listInvoices()).find((invoice: any) => invoice.id === id);
  }
  async createInvoice(data: InsertInvoice) {
    const date = new Date();
    const ymd = date.toISOString().slice(0, 10).replace(/-/g, "");
    const count = sqlite.prepare(`SELECT COUNT(*) as count FROM invoices`).get() as { count: number };
    const invoiceNumber = `CP-INV-${ymd}-${String((count?.count ?? 0) + 1).padStart(3, "0")}`;
    const lineItemsJson = typeof (data as any).lineItemsJson === "string" ? (data as any).lineItemsJson : JSON.stringify((data as any).lineItemsJson ?? []);
    const info = sqlite.prepare(`
      INSERT INTO invoices (
        customer_name, email, phone, address, city, job_id, invoice_number, status,
        line_items_json, subtotal, tax, total, due_date, notes, email_subject, email_body,
        sent_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.customerName,
      data.email ?? null,
      data.phone ?? null,
      data.address ?? null,
      data.city ?? null,
      data.jobId ?? null,
      invoiceNumber,
      (data as any).status ?? "draft",
      lineItemsJson,
      data.subtotal ?? 0,
      data.tax ?? 0,
      data.total ?? 0,
      data.dueDate ?? null,
      data.notes ?? null,
      data.emailSubject ?? null,
      data.emailBody ?? null,
      null,
      nowIso(),
      nowIso(),
    );
    return this.getInvoice(Number(info.lastInsertRowid));
  }
  async updateInvoice(id: number, data: Partial<InsertInvoice> & { status?: string; sentAt?: string | null }) {
    const existing = await this.getInvoice(id);
    if (!existing) return undefined;
    sqlite.prepare(`
      UPDATE invoices SET
        customer_name = ?, email = ?, phone = ?, address = ?, city = ?, job_id = ?, status = ?,
        line_items_json = ?, subtotal = ?, tax = ?, total = ?, due_date = ?, notes = ?,
        email_subject = ?, email_body = ?, sent_at = ?, updated_at = ?
      WHERE id = ?
    `).run(
      data.customerName ?? existing.customerName,
      data.email !== undefined ? data.email : existing.email,
      data.phone !== undefined ? data.phone : existing.phone,
      data.address !== undefined ? data.address : existing.address,
      data.city !== undefined ? data.city : existing.city,
      data.jobId !== undefined ? data.jobId : existing.jobId,
      data.status ?? existing.status,
      data.lineItemsJson !== undefined ? data.lineItemsJson : existing.lineItemsJson,
      data.subtotal ?? existing.subtotal,
      data.tax ?? existing.tax,
      data.total ?? existing.total,
      data.dueDate !== undefined ? data.dueDate : existing.dueDate,
      data.notes !== undefined ? data.notes : existing.notes,
      data.emailSubject !== undefined ? data.emailSubject : existing.emailSubject,
      data.emailBody !== undefined ? data.emailBody : existing.emailBody,
      data.sentAt !== undefined ? data.sentAt : existing.sentAt,
      nowIso(),
      id,
    );
    return this.getInvoice(id);
  }

  async listBuilderActions() {
    return sqlite.prepare(`
      SELECT
        id,
        title,
        tool_name as toolName,
        risk_level as riskLevel,
        status,
        mode,
        human_summary as humanSummary,
        input_json as inputJson,
        preview_json as previewJson,
        result_json as resultJson,
        rollback_json as rollbackJson,
        approval_required as approvalRequired,
        approved_at as approvedAt,
        executed_at as executedAt,
        created_at as createdAt
      FROM ai_builder_actions
      ORDER BY id DESC
      LIMIT 100
    `).all().map((row: any) => ({
      ...row,
      approvalRequired: Boolean(row.approvalRequired),
      input: JSON.parse(row.inputJson || "{}"),
      preview: JSON.parse(row.previewJson || "{}"),
      result: row.resultJson ? JSON.parse(row.resultJson) : null,
      rollback: row.rollbackJson ? JSON.parse(row.rollbackJson) : null,
    }));
  }

  async createBuilderAction(data: {
    title: string;
    toolName: string;
    riskLevel: string;
    status?: string;
    mode?: string;
    humanSummary: string;
    input?: any;
    preview?: any;
    rollback?: any;
    approvalRequired?: boolean;
  }) {
    const info = sqlite.prepare(`
      INSERT INTO ai_builder_actions (
        title, tool_name, risk_level, status, mode, human_summary,
        input_json, preview_json, rollback_json, approval_required, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.title,
      data.toolName,
      data.riskLevel,
      data.status ?? "draft",
      data.mode ?? "apply_with_approval",
      data.humanSummary,
      JSON.stringify(data.input ?? {}),
      JSON.stringify(data.preview ?? {}),
      data.rollback ? JSON.stringify(data.rollback) : null,
      data.approvalRequired === false ? 0 : 1,
      nowIso(),
    );
    return (await this.listBuilderActions()).find((a: any) => a.id === Number(info.lastInsertRowid));
  }

  async updateBuilderAction(id: number, data: Partial<{
    status: string;
    result: any;
    rollback: any;
    approvedAt: string | null;
    executedAt: string | null;
  }>) {
    const existing = sqlite.prepare(`SELECT * FROM ai_builder_actions WHERE id = ?`).get(id) as any;
    if (!existing) return undefined;
    sqlite.prepare(`
      UPDATE ai_builder_actions
      SET status = ?, result_json = ?, rollback_json = ?, approved_at = ?, executed_at = ?
      WHERE id = ?
    `).run(
      data.status ?? existing.status,
      data.result !== undefined ? JSON.stringify(data.result) : existing.result_json,
      data.rollback !== undefined ? JSON.stringify(data.rollback) : existing.rollback_json,
      data.approvedAt !== undefined ? data.approvedAt : existing.approved_at,
      data.executedAt !== undefined ? data.executedAt : existing.executed_at,
      id,
    );
    return (await this.listBuilderActions()).find((a: any) => a.id === id);
  }

  async listBusinessMemory() {
    return sqlite.prepare(`
      SELECT id, memory_type as memoryType, key, value_json as valueJson, source, confidence, created_at as createdAt, updated_at as updatedAt
      FROM ai_business_memory
      ORDER BY updated_at DESC
    `).all().map((row: any) => ({
      ...row,
      value: JSON.parse(row.valueJson || "{}"),
    }));
  }

  async upsertBusinessMemory(data: { memoryType: string; key: string; value: any; source?: string; confidence?: number }) {
    const now = nowIso();
    sqlite.prepare(`
      INSERT INTO ai_business_memory (memory_type, key, value_json, source, confidence, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(memory_type, key) DO UPDATE SET
        value_json = excluded.value_json,
        source = excluded.source,
        confidence = excluded.confidence,
        updated_at = excluded.updated_at
    `).run(data.memoryType, data.key, JSON.stringify(data.value), data.source ?? "builder_mode", data.confidence ?? 1, now, now);
    return (await this.listBusinessMemory()).find((m: any) => m.memoryType === data.memoryType && m.key === data.key);
  }

  async listMemoryEvents(limit = 200) {
    return sqlite.prepare(`
      SELECT
        id, memory_layer as memoryLayer, category, title, summary, entity_type as entityType,
        entity_id as entityId, customer_name as customerName, importance,
        evidence_json as evidenceJson, owner_feedback as ownerFeedback, created_at as createdAt
      FROM ai_memory_events
      ORDER BY created_at DESC, id DESC
      LIMIT ?
    `).all(limit).map((row: any) => ({
      ...row,
      evidence: JSON.parse(row.evidenceJson || "{}"),
    }));
  }
  async createMemoryEvent(data: InsertAiMemoryEvent) {
    const info = sqlite.prepare(`
      INSERT INTO ai_memory_events (
        memory_layer, category, title, summary, entity_type, entity_id, customer_name,
        importance, evidence_json, owner_feedback, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.memoryLayer,
      data.category,
      data.title,
      data.summary,
      data.entityType ?? null,
      data.entityId ?? null,
      data.customerName ?? null,
      data.importance ?? 3,
      data.evidenceJson ?? "{}",
      data.ownerFeedback ?? null,
      nowIso(),
    );
    return (await this.listMemoryEvents()).find((event: any) => event.id === Number(info.lastInsertRowid));
  }
  async searchMemoryEvents(query: string, limit = 50) {
    const q = `%${String(query ?? "").toLowerCase()}%`;
    return sqlite.prepare(`
      SELECT
        id, memory_layer as memoryLayer, category, title, summary, entity_type as entityType,
        entity_id as entityId, customer_name as customerName, importance,
        evidence_json as evidenceJson, owner_feedback as ownerFeedback, created_at as createdAt
      FROM ai_memory_events
      WHERE lower(title || ' ' || summary || ' ' || category || ' ' || coalesce(customer_name, '')) LIKE ?
      ORDER BY importance DESC, created_at DESC
      LIMIT ?
    `).all(q, limit).map((row: any) => ({
      ...row,
      evidence: JSON.parse(row.evidenceJson || "{}"),
    }));
  }
  async listAgents() {
    return sqlite.prepare(`
      SELECT
        id, name, purpose, status, tool_permissions_json as toolPermissionsJson,
        approval_policy_json as approvalPolicyJson, memory_scopes_json as memoryScopesJson,
        created_by_action_id as createdByActionId, created_at as createdAt, updated_at as updatedAt
      FROM ai_agents
      ORDER BY id DESC
    `).all().map((row: any) => ({
      ...row,
      toolPermissions: JSON.parse(row.toolPermissionsJson || "[]"),
      approvalPolicy: JSON.parse(row.approvalPolicyJson || "{}"),
      memoryScopes: JSON.parse(row.memoryScopesJson || "[]"),
    }));
  }
  async createAgent(data: InsertAiAgent) {
    const info = sqlite.prepare(`
      INSERT INTO ai_agents (
        name, purpose, status, tool_permissions_json, approval_policy_json, memory_scopes_json,
        created_by_action_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.name,
      data.purpose,
      (data as any).status ?? "draft",
      data.toolPermissionsJson ?? "[]",
      data.approvalPolicyJson ?? "{}",
      data.memoryScopesJson ?? "[]",
      data.createdByActionId ?? null,
      nowIso(),
      nowIso(),
    );
    return (await this.listAgents()).find((agent: any) => agent.id === Number(info.lastInsertRowid));
  }
  async updateAgent(id: number, data: Partial<InsertAiAgent>) {
    const existing = (await this.listAgents()).find((agent: any) => agent.id === id);
    if (!existing) return undefined;
    sqlite.prepare(`
      UPDATE ai_agents
      SET name = ?, purpose = ?, status = ?, tool_permissions_json = ?, approval_policy_json = ?,
          memory_scopes_json = ?, created_by_action_id = ?, updated_at = ?
      WHERE id = ?
    `).run(
      data.name ?? existing.name,
      data.purpose ?? existing.purpose,
      (data as any).status ?? existing.status,
      data.toolPermissionsJson ?? existing.toolPermissionsJson,
      data.approvalPolicyJson ?? existing.approvalPolicyJson,
      data.memoryScopesJson ?? existing.memoryScopesJson,
      data.createdByActionId !== undefined ? data.createdByActionId : existing.createdByActionId,
      nowIso(),
      id,
    );
    return (await this.listAgents()).find((agent: any) => agent.id === id);
  }
}

export const storage = new DatabaseStorage();

// ============================================================================
// SEED DATA
// ============================================================================
export async function seedIfEmpty() {
  await storage.getSettings();

  if (db.select().from(crews).all().length === 0) {
    db.insert(crews).values([
      { name: "Alpha Crew", lead: "Marcus Webb", truck: "Truck 1 — Ram 5500 dump", capacityYards: 15, phone: "248-555-0142", active: true },
      { name: "Bravo Crew", lead: "Tyrell Jackson", truck: "Truck 2 — F-450 dump", capacityYards: 12, phone: "248-555-0177", active: true },
      { name: "Solo Run", lead: "Owner (You)", truck: "Truck 1 — Ram 5500 dump", capacityYards: 15, phone: "248-555-0100", active: true },
    ]).run();
  }

  if (db.select().from(followUps).all().length === 0) {
    db.insert(followUps).values([
      { kind: "quote_sent", channel: "text", title: "Quote sent — 24 hour check-in", body: "Hey {{name}}, this is {{owner}} from Clean Plate Hauling. Just checking in on the quote we sent for your {{jobType}} in {{city}}. Happy to walk you through anything or lock in a time that works." },
      { kind: "quote_sent", channel: "call", title: "Quote sent — call script", body: "Hi {{name}}, this is {{owner}} from Clean Plate Hauling Co — wanted to follow up on the {{jobType}} quote I sent you. Did you have any questions on the price or what's included?" },
      { kind: "missed_call", channel: "text", title: "Missed call — same-day text", body: "Hey, this is Clean Plate Hauling Co — sorry I missed your call. Text me what you're trying to get hauled and your city and I'll get you a same-day quote." },
      { kind: "post_job_review", channel: "text", title: "Post-job review request", body: "{{name}} — thanks again for trusting us with the {{jobType}} job today. If we earned it, would you mind dropping a quick Google review?" },
      { kind: "post_job_review", channel: "email", title: "Post-job thank-you (email)", body: "Hi {{name}},\n\nThanks for having us out today — we appreciate you trusting Clean Plate Hauling Co with your {{jobType}}. If anything came up after we left, just hit reply. We stand behind every job.\n\n— {{owner}}\nClean Plate Hauling Co" },
      { kind: "no_show", channel: "call", title: "No-show / no-answer at the door", body: "Hi {{name}}, this is {{owner}} with Clean Plate Hauling — we're at {{address}} for your {{timeWindow}} window and not getting an answer. Give me a ring back when you can and we'll figure out a rebook." },
      { kind: "next_day_check", channel: "text", title: "Day-before confirmation", body: "Quick confirm — Clean Plate Hauling is on for tomorrow {{timeWindow}} at {{address}} for your {{jobType}}. Reply Y to confirm or call/text if anything changed." },
    ]).run();
  }
}
