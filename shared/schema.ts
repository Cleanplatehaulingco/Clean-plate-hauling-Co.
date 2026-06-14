import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ============================================================================
// LEADS / CRM
// ============================================================================
// stage values: "new" | "quote_sent" | "booked" | "completed" | "follow_up" | "lost"
export const leads = sqliteTable("leads", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  email: text("email"),
  city: text("city").notNull(),
  address: text("address"),
  source: text("source").notNull(), // Google, Referral, Facebook, Yelp, Repeat, Other
  jobType: text("job_type").notNull(), // Garage Cleanout, Estate, Hot Tub, Construction Debris, Furniture, Appliance, Yard, Full Property
  estimatedValue: real("estimated_value").notNull().default(0),
  stage: text("stage").notNull().default("new"),
  nextAction: text("next_action"),
  nextActionDate: text("next_action_date"),
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const insertLeadSchema = createInsertSchema(leads).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertLead = z.infer<typeof insertLeadSchema>;
export type Lead = typeof leads.$inferSelect;

// ============================================================================
// JOBS / DISPATCH
// ============================================================================
// status: "scheduled" | "en_route" | "on_site" | "completed" | "cancelled"
export const jobs = sqliteTable("jobs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  leadId: integer("lead_id"),
  customerName: text("customer_name").notNull(),
  phone: text("phone").notNull(),
  address: text("address").notNull(),
  city: text("city").notNull(),
  scheduledDate: text("scheduled_date").notNull(), // YYYY-MM-DD
  timeWindow: text("time_window").notNull(), // e.g. "8:00 AM – 10:00 AM"
  crewId: integer("crew_id"),
  truckFillPct: integer("truck_fill_pct").notNull().default(50),
  jobType: text("job_type").notNull(),
  status: text("status").notNull().default("scheduled"),
  estimatedRevenue: real("estimated_revenue").notNull().default(0),
  notes: text("notes"),
  checklist: text("checklist"), // JSON: { dolly: true, straps: true, ... }
  createdAt: text("created_at").notNull(),
});

export const insertJobSchema = createInsertSchema(jobs).omit({ id: true, createdAt: true });
export type InsertJob = z.infer<typeof insertJobSchema>;
export type Job = typeof jobs.$inferSelect;

// ============================================================================
// CREWS
// ============================================================================
export const crews = sqliteTable("crews", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  lead: text("lead").notNull(), // crew lead name
  truck: text("truck").notNull(),
  capacityYards: integer("capacity_yards").notNull().default(15),
  phone: text("phone"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
});

export const insertCrewSchema = createInsertSchema(crews).omit({ id: true });
export type InsertCrew = z.infer<typeof insertCrewSchema>;
export type Crew = typeof crews.$inferSelect;

// ============================================================================
// ESTIMATES
// ============================================================================
export const estimates = sqliteTable("estimates", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  leadId: integer("lead_id"),
  customerName: text("customer_name").notNull(),
  truckFillPct: integer("truck_fill_pct").notNull(),
  laborMinutes: integer("labor_minutes").notNull(),
  crewSize: integer("crew_size").notNull().default(2),
  stairsFlights: integer("stairs_flights").notNull().default(0),
  heavyItems: integer("heavy_items").notNull().default(0),
  distanceMiles: real("distance_miles").notNull().default(0),
  discount: real("discount").notNull().default(0),
  suggestedPrice: real("suggested_price").notNull(),
  floorPrice: real("floor_price").notNull(),
  estimatedCost: real("estimated_cost").notNull(),
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
});

export const insertEstimateSchema = createInsertSchema(estimates).omit({ id: true, createdAt: true });
export type InsertEstimate = z.infer<typeof insertEstimateSchema>;
export type Estimate = typeof estimates.$inferSelect;

// ============================================================================
// SETTINGS (singleton row, id=1)
// ============================================================================
export const settings = sqliteTable("settings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  businessName: text("business_name").notNull().default("Clean Plate Hauling Co"),
  homeBase: text("home_base").notNull().default("Wixom, MI"),
  dumpFeePerLoad: real("dump_fee_per_load").notNull().default(85),
  laborHourlyRate: real("labor_hourly_rate").notNull().default(45),
  travelFeePerMile: real("travel_fee_per_mile").notNull().default(1.75),
  minimumJobPrice: real("minimum_job_price").notNull().default(125),
  targetMarginPct: integer("target_margin_pct").notNull().default(55),
  crewCapacityYards: integer("crew_capacity_yards").notNull().default(15),
  stairsFee: real("stairs_fee").notNull().default(25), // per flight
  heavyItemFee: real("heavy_item_fee").notNull().default(35), // per item
  baseTruckFee: real("base_truck_fee").notNull().default(95),
  pricePerYard: real("price_per_yard").notNull().default(38),
  autoOptimizeMode: integer("auto_optimize_mode", { mode: "boolean" }).notNull().default(true),
  maxAutoPriceAdjustPct: integer("max_auto_price_adjust_pct").notNull().default(8),
  followUpSpeedHours: integer("follow_up_speed_hours").notNull().default(2),
  lastOptimizedAt: text("last_optimized_at"),
});

export const insertSettingsSchema = createInsertSchema(settings).omit({ id: true });
export type InsertSettings = z.infer<typeof insertSettingsSchema>;
export type Settings = typeof settings.$inferSelect;

// ============================================================================
// RECEIPTS / PROOF OF WORK
// ============================================================================
export const receipts = sqliteTable("receipts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  jobId: integer("job_id"),
  customerName: text("customer_name").notNull(),
  phone: text("phone"),
  address: text("address"),
  city: text("city"),
  amount: real("amount").notNull(),
  paymentMethod: text("payment_method").notNull().default("Cash"),
  dumpFee: real("dump_fee").notNull().default(0),
  laborCost: real("labor_cost").notNull().default(0),
  resaleValue: real("resale_value").notNull().default(0),
  scrapValue: real("scrap_value").notNull().default(0),
  recycleCredit: real("recycle_credit").notNull().default(0),
  donationValue: real("donation_value").notNull().default(0),
  otherRecovery: real("other_recovery").notNull().default(0),
  beforePhotoName: text("before_photo_name"),
  afterPhotoName: text("after_photo_name"),
  proofNotes: text("proof_notes"),
  receiptNumber: text("receipt_number").notNull(),
  createdAt: text("created_at").notNull(),
});

export const insertReceiptSchema = createInsertSchema(receipts).omit({ id: true, receiptNumber: true, createdAt: true });
export type InsertReceipt = z.infer<typeof insertReceiptSchema>;
export type Receipt = typeof receipts.$inferSelect;

// ============================================================================
// FOLLOW-UP TEMPLATES
// ============================================================================
// kind: "quote_sent" | "missed_call" | "post_job_review" | "no_show" | "next_day_check"
// channel: "call" | "text" | "email"
export const followUps = sqliteTable("follow_ups", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  kind: text("kind").notNull(),
  channel: text("channel").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
});

export const insertFollowUpSchema = createInsertSchema(followUps).omit({ id: true });
export type InsertFollowUp = z.infer<typeof insertFollowUpSchema>;
export type FollowUp = typeof followUps.$inferSelect;

// ============================================================================
// INVOICES
// ============================================================================
// status: "draft" | "pending_approval" | "sent" | "paid" | "void"
export const invoices = sqliteTable("invoices", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  customerName: text("customer_name").notNull(),
  email: text("email"),
  phone: text("phone"),
  address: text("address"),
  city: text("city"),
  jobId: integer("job_id"),
  invoiceNumber: text("invoice_number").notNull(),
  status: text("status").notNull().default("draft"),
  lineItemsJson: text("line_items_json").notNull().default("[]"),
  subtotal: real("subtotal").notNull().default(0),
  tax: real("tax").notNull().default(0),
  total: real("total").notNull().default(0),
  dueDate: text("due_date"),
  notes: text("notes"),
  emailSubject: text("email_subject"),
  emailBody: text("email_body"),
  sentAt: text("sent_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const insertInvoiceSchema = createInsertSchema(invoices).omit({ id: true, invoiceNumber: true, sentAt: true, createdAt: true, updatedAt: true });
export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;
export type Invoice = typeof invoices.$inferSelect;

// ============================================================================
// AI BRAIN MEMORY + AGENTS
// ============================================================================
export const aiMemoryEvents = sqliteTable("ai_memory_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  memoryLayer: text("memory_layer").notNull(),
  category: text("category").notNull(),
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  entityType: text("entity_type"),
  entityId: text("entity_id"),
  customerName: text("customer_name"),
  importance: integer("importance").notNull().default(3),
  evidenceJson: text("evidence_json").notNull().default("{}"),
  ownerFeedback: text("owner_feedback"),
  createdAt: text("created_at").notNull(),
});

export const insertAiMemoryEventSchema = createInsertSchema(aiMemoryEvents).omit({ id: true, createdAt: true });
export type InsertAiMemoryEvent = z.infer<typeof insertAiMemoryEventSchema>;
export type AiMemoryEvent = typeof aiMemoryEvents.$inferSelect;

export const aiAgents = sqliteTable("ai_agents", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  purpose: text("purpose").notNull(),
  status: text("status").notNull().default("draft"),
  toolPermissionsJson: text("tool_permissions_json").notNull().default("[]"),
  approvalPolicyJson: text("approval_policy_json").notNull().default("{}"),
  memoryScopesJson: text("memory_scopes_json").notNull().default("[]"),
  createdByActionId: integer("created_by_action_id"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const insertAiAgentSchema = createInsertSchema(aiAgents).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAiAgent = z.infer<typeof insertAiAgentSchema>;
export type AiAgent = typeof aiAgents.$inferSelect;
