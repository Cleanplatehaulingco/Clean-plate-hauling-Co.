import type { Express } from "express";
import type { Server } from 'node:http';
import { execFileSync } from "node:child_process";
import OpenAI from "openai";
import { storage, seedIfEmpty } from "./storage";
import {
  insertLeadSchema, insertJobSchema, insertEstimateSchema, insertSettingsSchema, insertReceiptSchema, insertInvoiceSchema, insertAiAgentSchema,
} from "@shared/schema";
import { z } from "zod";

const CRM_SPREADSHEET_ID = process.env.GOOGLE_SHEETS_CRM_ID || "1empthEL88RFmo4tLy3i84V_IBjlKSYCSK9n9F06OpFA";
const CRM_SPREADSHEET_NAME = process.env.GOOGLE_SHEETS_CRM_NAME || "Junk Removal Business Tracker";
const CRM_SHEET_NAME = process.env.GOOGLE_SHEETS_CRM_TAB || "CRM";
const JOB_ENTRY_SHEET_NAME = process.env.GOOGLE_SHEETS_JOB_TAB || "Job Entry";
const AI_LOG_SHEET_NAME = process.env.GOOGLE_SHEETS_AI_LOG_TAB || "AI App Log";
const SHEET_LEAD_ID_OFFSET = 100000;
const CRM_HEADERS = [
  "Customer ID",
  "Customer Name",
  "Phone",
  "City/Area",
  "Email",
  "Customer Type",
  "Lead Source",
  "Source Detail",
  "First Job Date",
  "Last Job Date",
  "Total Jobs",
  "Total Revenue",
  "Last Job Type",
  "Repeat Customer",
  "Status",
  "Last Contacted",
  "Next Follow-Up",
  "Follow-Up Needed",
  "Referral Potential",
  "Internal CRM Notes",
  "Job History Notes",
  "Repeat Biz Opportunity",
  "Days Since Last Job",
];
const AI_LOG_HEADERS = [
  "Timestamp",
  "Record Type",
  "Customer Name",
  "Phone",
  "City/Area",
  "Job Type",
  "AI Price Low",
  "AI Price High",
  "Final Amount",
  "Payment Method",
  "Receipt Number",
  "Photo/Proof",
  "Notes",
  "Source App",
];
function getOpenAI() {
  if (!process.env.OPENAI_API_KEY && !process.env.OPENAI_ADMIN_KEY) {
    throw new Error("OpenAI API key is not configured.");
  }
  return new OpenAI();
}
const DASHBOARD_URL = process.env.PUBLIC_DASHBOARD_URL || "https://www.perplexity.ai/computer/a/clean-plate-hauling-command-ce-v1DaVO2rQ1OecCtrO4Ld7g";
const GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";
const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";
let googleAccessTokenCache: { token: string; expiresAt: number } | null = null;

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  await seedIfEmpty();

  function callSheetsTool(toolName: string, arguments_: Record<string, any>) {
    if (hasStandaloneGoogleRuntime()) {
      return callNativeSheetsTool(toolName, arguments_);
    }
    return callExternalTool("google_sheets__pipedream", toolName, arguments_);
  }

  function callGmailTool(toolName: string, arguments_: Record<string, any>) {
    if (hasStandaloneGoogleRuntime()) {
      return callNativeGmailTool(toolName, arguments_);
    }
    return callExternalTool("gcal", toolName, arguments_);
  }

  function callExternalTool(sourceId: string, toolName: string, arguments_: Record<string, any>) {
    const payload = JSON.stringify({
      source_id: sourceId,
      tool_name: toolName,
      arguments: arguments_,
    });
    const out = execFileSync("external-tool", ["call", payload], {
      encoding: "utf8",
      maxBuffer: 1024 * 1024 * 8,
    });
    return JSON.parse(out);
  }

  function hasStandaloneGoogleRuntime() {
    return Boolean(
      process.env.GOOGLE_OAUTH_CLIENT_ID
      && process.env.GOOGLE_OAUTH_CLIENT_SECRET
      && process.env.GOOGLE_OAUTH_REFRESH_TOKEN
    );
  }

  function curlJson(method: string, url: string, body?: Record<string, any>, headers: Record<string, string> = {}) {
    const args = ["-sS", "-X", method, url];
    for (const [key, value] of Object.entries(headers)) {
      args.push("-H", `${key}: ${value}`);
    }
    if (body !== undefined) {
      args.push("-H", "Content-Type: application/json", "--data", JSON.stringify(body));
    }
    const out = execFileSync("curl", args, { encoding: "utf8", maxBuffer: 1024 * 1024 * 12 });
    return out ? JSON.parse(out) : {};
  }

  function getGoogleAccessToken() {
    const now = Date.now();
    if (googleAccessTokenCache && googleAccessTokenCache.expiresAt > now + 60_000) {
      return googleAccessTokenCache.token;
    }
    const form = new URLSearchParams({
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID || "",
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET || "",
      refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN || "",
      grant_type: "refresh_token",
    });
    const out = execFileSync("curl", [
      "-sS",
      "-X", "POST",
      GOOGLE_OAUTH_TOKEN_URL,
      "-H", "Content-Type: application/x-www-form-urlencoded",
      "--data", form.toString(),
    ], { encoding: "utf8", maxBuffer: 1024 * 1024 });
    const parsed = JSON.parse(out);
    if (!parsed.access_token) {
      throw new Error(`Google OAuth refresh failed: ${out}`);
    }
    googleAccessTokenCache = {
      token: parsed.access_token,
      expiresAt: now + (Number(parsed.expires_in ?? 3600) * 1000),
    };
    return googleAccessTokenCache.token;
  }

  function googleJson(method: string, url: string, body?: Record<string, any>) {
    return curlJson(method, url, body, { Authorization: `Bearer ${getGoogleAccessToken()}` });
  }

  function quoteSheetName(sheetName: string) {
    return `'${String(sheetName).replace(/'/g, "''")}'`;
  }

  function columnLetter(index: number) {
    let n = index;
    let out = "";
    while (n > 0) {
      const rem = (n - 1) % 26;
      out = String.fromCharCode(65 + rem) + out;
      n = Math.floor((n - 1) / 26);
    }
    return out || "A";
  }

  function rowsFromValues(values: any[][] = [], hasHeaders = true) {
    if (!hasHeaders) return { headers: [], rows: values, rowCount: values.length };
    const headers = (values[0] ?? []).map((h: any) => String(h ?? ""));
    const rows = values.slice(1).map((row, idx) => {
      const item: Record<string, any> = { _rowNumber: idx + 2 };
      headers.forEach((header, colIdx) => {
        item[header] = row[colIdx] ?? "";
      });
      return item;
    });
    return { headers, rows, rowCount: rows.length };
  }

  function normalizeRowsForAppend(rowsInput: any, headers: string[], hasHeaders = true) {
    const rows = typeof rowsInput === "string" ? JSON.parse(rowsInput) : rowsInput;
    if (!Array.isArray(rows)) return [];
    return rows.map((row) => {
      if (Array.isArray(row)) return row;
      if (hasHeaders && headers.length) return headers.map((header) => row[header] ?? "");
      return Object.values(row);
    });
  }

  function readSheetHeaders(spreadsheetId: string, sheetName: string) {
    const range = `${quoteSheetName(sheetName)}!1:1`;
    const url = `${GOOGLE_SHEETS_API}/${spreadsheetId}/values/${encodeURIComponent(range)}`;
    const result = googleJson("GET", url);
    return (result.values?.[0] ?? []).map((h: any) => String(h ?? ""));
  }

  function callNativeSheetsTool(toolName: string, arguments_: Record<string, any>) {
    const spreadsheetId = arguments_.spreadsheetId || arguments_.sheetId || CRM_SPREADSHEET_ID;
    if (toolName === "google_sheets-get-spreadsheet-info") {
      const info = googleJson("GET", `${GOOGLE_SHEETS_API}/${spreadsheetId}?fields=properties.title,sheets.properties`);
      return {
        spreadsheetId,
        spreadsheetName: info.properties?.title ?? CRM_SPREADSHEET_NAME,
        worksheets: (info.sheets ?? []).map((s: any) => ({
          sheetName: s.properties?.title,
          sheetId: s.properties?.sheetId,
          rowCount: s.properties?.gridProperties?.rowCount ?? 0,
          columnCount: s.properties?.gridProperties?.columnCount ?? 0,
        })),
      };
    }
    if (toolName === "google_sheets-add-worksheet") {
      const title = arguments_.title || arguments_.sheetName;
      const result = googleJson("POST", `${GOOGLE_SHEETS_API}/${spreadsheetId}:batchUpdate`, {
        requests: [{ addSheet: { properties: { title } } }],
      });
      const headers = arguments_.headers ?? [];
      if (headers.length) {
        const range = `${quoteSheetName(title)}!A1:${columnLetter(headers.length)}1`;
        googleJson("PUT", `${GOOGLE_SHEETS_API}/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`, {
          values: [headers],
        });
      }
      return { ok: true, result };
    }
    if (toolName === "google_sheets-read-rows") {
      const sheetName = arguments_.sheetName;
      const range = arguments_.range
        ? `${quoteSheetName(sheetName)}!${String(arguments_.range).replace(/^'?[^'!]+?'?!/, "")}`
        : `${quoteSheetName(sheetName)}`;
      const result = googleJson("GET", `${GOOGLE_SHEETS_API}/${spreadsheetId}/values/${encodeURIComponent(range)}?majorDimension=ROWS`);
      return rowsFromValues(result.values ?? [], arguments_.hasHeaders !== false);
    }
    if (toolName === "google_sheets-add-rows") {
      const sheetName = arguments_.sheetName;
      const headers = arguments_.hasHeaders ? readSheetHeaders(spreadsheetId, sheetName) : [];
      const values = normalizeRowsForAppend(arguments_.rows, headers, arguments_.hasHeaders !== false);
      const range = `${quoteSheetName(sheetName)}!A:${columnLetter(Math.max(values[0]?.length ?? headers.length, 1))}`;
      const result = googleJson("POST", `${GOOGLE_SHEETS_API}/${spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
        values,
      });
      return { ok: true, updatedRows: result.updates?.updatedRows ?? values.length, result };
    }
    if (toolName === "google_sheets-update-rows") {
      const sheetName = arguments_.sheetName;
      const rows = typeof arguments_.rows === "string" ? JSON.parse(arguments_.rows) : arguments_.rows;
      const range = `${quoteSheetName(sheetName)}!${String(arguments_.range).replace(/^'?[^'!]+?'?!/, "")}`;
      const result = googleJson("PUT", `${GOOGLE_SHEETS_API}/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`, {
        values: rows,
      });
      return { ok: true, updatedRows: result.updatedRows ?? rows.length, result };
    }
    throw new Error(`Unsupported standalone Sheets tool: ${toolName}`);
  }

  function toBase64Url(input: string) {
    return Buffer.from(input)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");
  }

  function callNativeGmailTool(toolName: string, arguments_: Record<string, any>) {
    if (toolName !== "send_email") {
      throw new Error(`Unsupported standalone Gmail tool: ${toolName}`);
    }
    const action = arguments_.action ?? {};
    const to = Array.isArray(action.to) ? action.to.join(", ") : String(action.to ?? "");
    const cc = Array.isArray(action.cc) && action.cc.length ? `Cc: ${action.cc.join(", ")}\r\n` : "";
    const bcc = Array.isArray(action.bcc) && action.bcc.length ? `Bcc: ${action.bcc.join(", ")}\r\n` : "";
    const subject = String(action.subject ?? "Clean Plate Hauling Co");
    const body = String(action.body ?? action.html_body ?? "");
    const raw = [
      `To: ${to}`,
      cc.trimEnd(),
      bcc.trimEnd(),
      `Subject: ${subject}`,
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=UTF-8",
      "",
      body,
    ].filter(Boolean).join("\r\n");
    const result = googleJson("POST", GMAIL_API, { raw: toBase64Url(raw) });
    return { ok: true, id: result.id, threadId: result.threadId, result };
  }

  function parseMoney(value: any) {
    const n = Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
    return Number.isFinite(n) ? n : 0;
  }

  function normalizeDate(value: any) {
    const raw = String(value ?? "").trim();
    if (!raw) return null;
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return raw;
    return d.toISOString().slice(0, 10);
  }

  function mapCrmStatus(status: any) {
    const s = String(status ?? "").toLowerCase();
    if (s.includes("lost") || s.includes("dead")) return "lost";
    if (s.includes("complete") || s.includes("past") || s.includes("customer")) return "completed";
    if (s.includes("follow")) return "follow_up";
    if (s.includes("book")) return "booked";
    if (s.includes("quote")) return "quote_sent";
    return "new";
  }

  function appLogRow(row: Record<string, any>) {
    return {
      "Timestamp": new Date().toISOString(),
      "Source App": "Clean Plate AI Brain",
      ...row,
    };
  }

  function ensureAiLogWorksheet() {
    const info = callSheetsTool("google_sheets-get-spreadsheet-info", { spreadsheetId: CRM_SPREADSHEET_ID });
    const exists = info.worksheets?.some((w: any) => w.sheetName === AI_LOG_SHEET_NAME);
    if (!exists) {
      callSheetsTool("google_sheets-add-worksheet", {
        spreadsheetId: CRM_SPREADSHEET_ID,
        title: AI_LOG_SHEET_NAME,
        headers: AI_LOG_HEADERS,
      });
    }
  }

  function moneyCell(value: any) {
    const n = Number(value ?? 0);
    return Number.isFinite(n) && n > 0 ? `$${n.toFixed(2)}` : "";
  }

  function todaySheetDate() {
    return new Date().toLocaleDateString("en-US", { timeZone: "America/Detroit" });
  }

  function statusToSheet(stage: string) {
    const map: Record<string, string> = {
      new: "New",
      quote_sent: "Quote Sent",
      booked: "Booked",
      completed: "Completed",
      follow_up: "Follow-Up",
      lost: "Lost",
      scheduled: "Scheduled",
      en_route: "En Route",
      on_site: "On Site",
      cancelled: "Cancelled",
    };
    return map[stage] ?? stage;
  }

  function normalizePhoneDigits(phone: string | null | undefined) {
    return String(phone ?? "").replace(/\D/g, "");
  }

  function sheetLeadId(rowNumber: number) {
    return SHEET_LEAD_ID_OFFSET + rowNumber;
  }

  function sheetRowFromLeadId(id: number) {
    return id >= SHEET_LEAD_ID_OFFSET ? id - SHEET_LEAD_ID_OFFSET : null;
  }

  function mapCrmRowToLead(row: Record<string, any>) {
    const rowNumber = Number(row._rowNumber ?? 0);
    const notes = [
      row["Internal CRM Notes"] ? `CRM: ${row["Internal CRM Notes"]}` : "",
      row["Job History Notes"] ? `History: ${row["Job History Notes"]}` : "",
      row["Repeat Biz Opportunity"] ? `Repeat opportunity: ${row["Repeat Biz Opportunity"]}` : "",
    ].filter(Boolean).join("\n");

    return {
      id: sheetLeadId(rowNumber),
      name: String(row["Customer Name"] ?? "").trim() || "Unnamed CRM lead",
      phone: String(row["Phone"] ?? "").trim(),
      email: row["Email"] || null,
      city: String(row["City/Area"] ?? "").trim() || "Unknown",
      address: null,
      source: row["Lead Source"] || "Google Sheets CRM",
      jobType: row["Last Job Type"] || "Mixed Junk",
      estimatedValue: parseMoney(row["Total Revenue"]),
      stage: mapCrmStatus(row["Status"]),
      nextAction: row["Follow-Up Needed"] ? "Follow up from Google Sheets CRM" : null,
      nextActionDate: normalizeDate(row["Next Follow-Up"]),
      notes,
      createdAt: normalizeDate(row["First Job Date"]) || new Date().toISOString(),
      sheetRowNumber: rowNumber,
      customerId: row["Customer ID"] || "",
      syncSource: "google_sheet",
    };
  }

  function readCrmRows() {
    return callSheetsTool("google_sheets-read-rows", {
      spreadsheetId: CRM_SPREADSHEET_ID,
      sheetName: CRM_SHEET_NAME,
      range: "A1:W1000",
      hasHeaders: true,
    });
  }

  async function listLivePipelineLeads() {
    const crmRows = readCrmRows();
    const sheetLeads = (crmRows.rows ?? [])
      .filter((row: Record<string, any>) => {
        const hasIdentity = String(row["Customer Name"] ?? "").trim() || normalizePhoneDigits(row["Phone"]);
        return hasIdentity && Number(row._rowNumber ?? 0) > 1;
      })
      .map(mapCrmRowToLead);

    if (sheetLeads.length > 0) return sheetLeads;
    return storage.listLeads();
  }

  function updateCrmRowFromLeadPatch(rowNumber: number, patch: Record<string, any>) {
    const crmRows = readCrmRows();
    const row = (crmRows.rows ?? []).find((r: Record<string, any>) => Number(r._rowNumber) === rowNumber);
    if (!row) return null;

    const nextRow = { ...row };
    if (patch.name !== undefined) nextRow["Customer Name"] = patch.name;
    if (patch.phone !== undefined) nextRow["Phone"] = patch.phone;
    if (patch.city !== undefined) nextRow["City/Area"] = patch.city;
    if (patch.email !== undefined) nextRow["Email"] = patch.email ?? "";
    if (patch.source !== undefined) nextRow["Lead Source"] = patch.source;
    if (patch.jobType !== undefined) nextRow["Last Job Type"] = patch.jobType;
    if (patch.estimatedValue !== undefined) nextRow["Total Revenue"] = moneyCell(patch.estimatedValue);
    if (patch.stage !== undefined) nextRow["Status"] = statusToSheet(patch.stage);
    if (patch.nextActionDate !== undefined) nextRow["Next Follow-Up"] = patch.nextActionDate ?? "";
    if (patch.nextActionDate !== undefined) nextRow["Follow-Up Needed"] = patch.nextActionDate ? "Yes" : "";
    if (patch.notes !== undefined) nextRow["Internal CRM Notes"] = patch.notes ?? "";

    const values = CRM_HEADERS.map(header => nextRow[header] ?? "");
    callSheetsTool("google_sheets-update-rows", {
      sheetId: CRM_SPREADSHEET_ID,
      sheetName: CRM_SHEET_NAME,
      range: `A${rowNumber}:W${rowNumber}`,
      rows: JSON.stringify([values]),
    });

    return mapCrmRowToLead({ ...nextRow, _rowNumber: rowNumber });
  }

  function appendLeadToCrm(lead: Awaited<ReturnType<typeof storage.createLead>>) {
    const row = {
      "Customer ID": `APP-L-${lead.id}`,
      "Customer Name": lead.name,
      "Phone": lead.phone,
      "City/Area": lead.city,
      "Email": lead.email ?? "",
      "Customer Type": "Lead",
      "Lead Source": lead.source,
      "Source Detail": "Clean Plate app",
      "First Job Date": "",
      "Last Job Date": "",
      "Total Jobs": "0",
      "Total Revenue": moneyCell(lead.estimatedValue),
      "Last Job Type": lead.jobType,
      "Repeat Customer": "No",
      "Status": statusToSheet(lead.stage),
      "Last Contacted": todaySheetDate(),
      "Next Follow-Up": lead.nextActionDate ?? "",
      "Follow-Up Needed": lead.nextActionDate ? "Yes" : "",
      "Referral Potential": "",
      "Internal CRM Notes": lead.notes ?? "",
      "Job History Notes": `Created from Clean Plate app lead #${lead.id}`,
      "Repeat Biz Opportunity": "",
      "Days Since Last Job": "",
    };
    return callSheetsTool("google_sheets-add-rows", {
      spreadsheetId: CRM_SPREADSHEET_ID,
      sheetName: CRM_SHEET_NAME,
      rows: JSON.stringify([row]),
      hasHeaders: true,
    });
  }

  function appendJobToJobEntry(job: Awaited<ReturnType<typeof storage.createJob>>) {
    return appendJobEntryRow(job, {});
  }

  function appendJobEntryRow(
    job: Awaited<ReturnType<typeof storage.createJob>>,
    financials: {
      amountPaid?: number;
      paymentStatus?: string;
      leadSourceCost?: number;
      dumpCost?: number;
      laborCost?: number;
      fuelCost?: number;
      otherCost?: number;
      resaleValue?: number;
      scrapValue?: number;
      recycleCredit?: number;
      donationValue?: number;
      otherRecovery?: number;
      platformReferral?: string;
    }
  ) {
    const amountCharged = Number(job.estimatedRevenue ?? 0);
    const amountPaid = Number(financials.amountPaid ?? 0);
    const leadSourceCost = Number(financials.leadSourceCost ?? 0);
    const dumpCost = Number(financials.dumpCost ?? 0);
    const laborCost = Number(financials.laborCost ?? 0);
    const fuelCost = Number(financials.fuelCost ?? 0);
    const otherCost = Number(financials.otherCost ?? 0);
    const resaleValue = Number(financials.resaleValue ?? 0);
    const scrapValue = Number(financials.scrapValue ?? 0);
    const recycleCredit = Number(financials.recycleCredit ?? 0);
    const donationValue = Number(financials.donationValue ?? 0);
    const otherRecovery = Number(financials.otherRecovery ?? 0);
    const totalExpense = leadSourceCost + dumpCost + laborCost + fuelCost + otherCost;
    const totalRecovered = resaleValue + scrapValue + recycleCredit + donationValue + otherRecovery;
    const trueProfit = (amountPaid || amountCharged) + totalRecovered - totalExpense;
    const profitPerJob = amountCharged - leadSourceCost;
    const paymentStatus = financials.paymentStatus || (job.status === "completed" ? "Paid" : "");
    const expenseNote = totalExpense > 0
      ? `Expenses: lead $${leadSourceCost.toFixed(2)}, dump $${dumpCost.toFixed(2)}, labor $${laborCost.toFixed(2)}, fuel/travel $${fuelCost.toFixed(2)}, other $${otherCost.toFixed(2)}`
      : "";
    const recoveryNote = totalRecovered > 0
      ? `Recovered value: resale $${resaleValue.toFixed(2)}, scrap $${scrapValue.toFixed(2)}, recycle credit $${recycleCredit.toFixed(2)}, donation value $${donationValue.toFixed(2)}, other $${otherRecovery.toFixed(2)}`
      : "";
    const row = {
      "Job ID": `APP-J-${job.id}`,
      "Job Date    ": job.scheduledDate,
      "Customer Name": job.customerName,
      "Phone Number": job.phone,
      "Job Type": job.jobType,
      "Source": "Clean Plate app",
      "Platform/Referral": financials.platformReferral || "App dispatch",
      "Amount Charged": moneyCell(job.estimatedRevenue),
      "Amount Paid": amountPaid > 0 ? moneyCell(amountPaid) : "",
      "Payment Status": paymentStatus,
      "Profit Per Job": moneyCell(profitPerJob),
      "Lead Source Cost": leadSourceCost > 0 ? moneyCell(leadSourceCost) : "",
      "Notes": [job.address ? `${job.address}, ${job.city}` : job.city, job.timeWindow, job.notes, expenseNote, recoveryNote].filter(Boolean).join(" | "),
      "Month": job.scheduledDate?.slice(0, 7) ?? "",
      "True Profit": moneyCell(trueProfit),
    };
    return callSheetsTool("google_sheets-add-rows", {
      spreadsheetId: CRM_SPREADSHEET_ID,
      sheetName: JOB_ENTRY_SHEET_NAME,
      rows: JSON.stringify([row]),
      hasHeaders: true,
    });
  }

  async function importCrmRowsFromSheet() {
    const crmRows = callSheetsTool("google_sheets-read-rows", {
      spreadsheetId: CRM_SPREADSHEET_ID,
      sheetName: CRM_SHEET_NAME,
      range: "A1:W1000",
      hasHeaders: true,
    });
    const existing = await storage.listLeads();
    const phones = new Set(existing.map(l => normalizePhoneDigits(l.phone)).filter(Boolean));
    let imported = 0;
    let skipped = 0;
    for (const row of crmRows.rows ?? []) {
      const name = String(row["Customer Name"] ?? "").trim();
      const phone = String(row["Phone"] ?? "").trim();
      const phoneKey = normalizePhoneDigits(phone);
      if (!name || !phoneKey || phones.has(phoneKey)) {
        skipped++;
        continue;
      }
      const notes = [
        row["Internal CRM Notes"] ? `CRM: ${row["Internal CRM Notes"]}` : "",
        row["Job History Notes"] ? `History: ${row["Job History Notes"]}` : "",
        row["Repeat Biz Opportunity"] ? `Repeat opportunity: ${row["Repeat Biz Opportunity"]}` : "",
      ].filter(Boolean).join("\n");
      await storage.createLead({
        name,
        phone,
        email: row["Email"] || null,
        city: row["City/Area"] || "Unknown",
        address: null,
        source: row["Lead Source"] || "Google Sheets CRM",
        jobType: row["Last Job Type"] || "Mixed Junk",
        estimatedValue: parseMoney(row["Total Revenue"]),
        stage: mapCrmStatus(row["Status"]),
        nextAction: row["Follow-Up Needed"] ? "Follow up from Google Sheets CRM" : null,
        nextActionDate: normalizeDate(row["Next Follow-Up"]),
        notes,
      });
      phones.add(phoneKey);
      imported++;
    }
    return { imported, skipped, scanned: crmRows.rows?.length ?? 0 };
  }

  async function importJobRowsFromSheet() {
    const jobRows = callSheetsTool("google_sheets-read-rows", {
      spreadsheetId: CRM_SPREADSHEET_ID,
      sheetName: JOB_ENTRY_SHEET_NAME,
      range: "A1:O1000",
      hasHeaders: true,
    });
    const existing = await storage.listJobs();
    const keys = new Set(existing.map(j => `${normalizePhoneDigits(j.phone)}|${j.scheduledDate}|${j.jobType.toLowerCase()}`));
    let imported = 0;
    let skipped = 0;
    for (const row of jobRows.rows ?? []) {
      const customerName = String(row["Customer Name"] ?? "").trim();
      const phone = String(row["Phone Number"] ?? "").trim();
      const scheduledDate = normalizeDate(row["Job Date    "]) || normalizeDate(row["Job Date"]) || "";
      const jobType = String(row["Job Type"] ?? "Mixed Junk").trim() || "Mixed Junk";
      const key = `${normalizePhoneDigits(phone)}|${scheduledDate}|${jobType.toLowerCase()}`;
      if (!customerName || !normalizePhoneDigits(phone) || !scheduledDate || keys.has(key)) {
        skipped++;
        continue;
      }
      await storage.createJob({
        leadId: null,
        customerName,
        phone,
        address: "",
        city: "Unknown",
        scheduledDate,
        timeWindow: "TBD",
        crewId: null,
        truckFillPct: 50,
        jobType,
        status: String(row["Payment Status"] ?? "").toLowerCase().includes("paid") ? "completed" : "scheduled",
        estimatedRevenue: parseMoney(row["Amount Charged"]),
        notes: [row["Source"] ? `Source: ${row["Source"]}` : "", row["Platform/Referral"] ? `Platform: ${row["Platform/Referral"]}` : "", row["Notes"] || ""].filter(Boolean).join(" | "),
        checklist: null,
      });
      keys.add(key);
      imported++;
    }
    return { imported, skipped, scanned: jobRows.rows?.length ?? 0 };
  }

  function findMissingFields(rows: Record<string, any>[], required: string[]) {
    return rows.flatMap((row, idx) => {
      const missing = required.filter(k => !String(row[k] ?? "").trim());
      return missing.length ? [{ rowNumber: row._rowNumber ?? idx + 2, name: row["Customer Name"] ?? row["Job ID"] ?? "Unknown", missing }] : [];
    });
  }

  function calcQuote(input: {
    truckFillPct: number;
    laborMinutes: number;
    crewSize: number;
    stairsFlights: number;
    heavyItems: number;
    distanceMiles: number;
    discount: number;
  }, s: Awaited<ReturnType<typeof storage.getSettings>>) {
    const loads = Math.max(1, Math.ceil(input.truckFillPct / 100));
    const dumpCost = loads * s.dumpFeePerLoad;
    const laborCost = (input.laborMinutes / 60) * s.laborHourlyRate * input.crewSize;
    const travelCost = input.distanceMiles * 2 * (s.travelFeePerMile * 0.4);
    const estimatedCost = +(dumpCost + laborCost + travelCost).toFixed(2);

    const yards = (input.truckFillPct / 100) * s.crewCapacityYards;
    const baseFee = s.baseTruckFee;
    const volumePrice = yards * s.pricePerYard;
    const stairsFee = input.stairsFlights * s.stairsFee;
    const heavyFee = input.heavyItems * s.heavyItemFee;
    const travelFee = input.distanceMiles * 2 * s.travelFeePerMile;
    const subtotal = baseFee + volumePrice + stairsFee + heavyFee + travelFee;
    const suggestedPrice = Math.max(s.minimumJobPrice, +(subtotal - input.discount).toFixed(2));

    const margin = Math.min(0.85, Math.max(0.1, s.targetMarginPct / 100));
    const floorPrice = Math.max(s.minimumJobPrice, +(estimatedCost / (1 - margin)).toFixed(2));
    const profitAtSuggested = +(suggestedPrice - estimatedCost).toFixed(2);
    const marginAtSuggested = suggestedPrice > 0 ? +((profitAtSuggested / suggestedPrice) * 100).toFixed(1) : 0;
    const warning =
      suggestedPrice < floorPrice ? "Below floor price — under target margin" :
      marginAtSuggested < (s.targetMarginPct - 10) ? "Tight margin — consider raising or skipping the discount" :
      null;

    return {
      estimatedCost,
      suggestedPrice,
      floorPrice,
      profitAtSuggested,
      marginAtSuggested,
      breakdown: {
        baseFee, volumePrice: +volumePrice.toFixed(2), stairsFee, heavyFee, travelFee: +travelFee.toFixed(2), discount: input.discount,
        dumpCost: +dumpCost.toFixed(2), laborCost: +laborCost.toFixed(2), travelCost: +travelCost.toFixed(2),
        loads, yards: +yards.toFixed(1),
      },
      warning,
    };
  }

  // ============ LEADS ============
  app.get("/api/leads", async (_req, res) => {
    try {
      res.json(await listLivePipelineLeads());
    } catch (err: any) {
      const fallback = await storage.listLeads();
      res.json(fallback.map(lead => ({
        ...lead,
        syncSource: "local_fallback",
        syncWarning: String(err?.message ?? err),
      })));
    }
  });
  app.post("/api/leads", async (req, res) => {
    const data = insertLeadSchema.parse(req.body);
    const created = await storage.createLead(data);
    let sheetsSync: { ok: boolean; error?: string } = { ok: true };
    try {
      appendLeadToCrm(created);
    } catch (err: any) {
      sheetsSync = { ok: false, error: String(err?.message ?? err) };
    }
    res.json({ ...created, sheetsSync });
  });

  const leadWithJobEntrySchema = z.object({
    lead: insertLeadSchema,
    jobEntry: z.object({
      scheduledDate: z.string().min(1),
      timeWindow: z.string().default("TBD"),
      truckFillPct: z.number().default(50),
      amountCharged: z.number().default(0),
      amountPaid: z.number().default(0),
      paymentStatus: z.string().default("Unpaid"),
      leadSourceCost: z.number().default(0),
      dumpCost: z.number().default(0),
      laborCost: z.number().default(0),
      fuelCost: z.number().default(0),
      otherCost: z.number().default(0),
      resaleValue: z.number().default(0),
      scrapValue: z.number().default(0),
      recycleCredit: z.number().default(0),
      donationValue: z.number().default(0),
      otherRecovery: z.number().default(0),
      platformReferral: z.string().default("App pipeline"),
      notes: z.string().optional().default(""),
    }).optional(),
  });

  app.post("/api/leads-with-job-entry", async (req, res) => {
    const data = leadWithJobEntrySchema.parse(req.body);
    const lead = await storage.createLead({
      ...data.lead,
      stage: data.jobEntry ? "booked" : data.lead.stage,
    });

    let crmSync: { ok: boolean; error?: string } = { ok: true };
    try {
      appendLeadToCrm(lead);
    } catch (err: any) {
      crmSync = { ok: false, error: String(err?.message ?? err) };
    }

    let job: Awaited<ReturnType<typeof storage.createJob>> | null = null;
    let jobEntrySync: { ok: boolean; error?: string; skipped?: boolean } = { ok: true, skipped: true };
    if (data.jobEntry) {
      job = await storage.createJob({
        leadId: lead.id,
        customerName: lead.name,
        phone: lead.phone,
        address: lead.address ?? "",
        city: lead.city,
        scheduledDate: data.jobEntry.scheduledDate,
        timeWindow: data.jobEntry.timeWindow || "TBD",
        crewId: null,
        truckFillPct: data.jobEntry.truckFillPct,
        jobType: lead.jobType,
        status: data.jobEntry.paymentStatus.toLowerCase().includes("paid") ? "completed" : "scheduled",
        estimatedRevenue: data.jobEntry.amountCharged || lead.estimatedValue || 0,
        notes: [lead.notes, data.jobEntry.notes].filter(Boolean).join(" | "),
        checklist: null,
      });
      try {
        appendJobEntryRow(job, {
          amountPaid: data.jobEntry.amountPaid,
          paymentStatus: data.jobEntry.paymentStatus,
          leadSourceCost: data.jobEntry.leadSourceCost,
          dumpCost: data.jobEntry.dumpCost,
          laborCost: data.jobEntry.laborCost,
          fuelCost: data.jobEntry.fuelCost,
          otherCost: data.jobEntry.otherCost,
          resaleValue: data.jobEntry.resaleValue,
          scrapValue: data.jobEntry.scrapValue,
          recycleCredit: data.jobEntry.recycleCredit,
          donationValue: data.jobEntry.donationValue,
          otherRecovery: data.jobEntry.otherRecovery,
          platformReferral: data.jobEntry.platformReferral,
        });
        jobEntrySync = { ok: true };
      } catch (err: any) {
        jobEntrySync = { ok: false, error: String(err?.message ?? err) };
      }
    }

    res.json({ lead, job, sheetsSync: { crm: crmSync, jobEntry: jobEntrySync } });
  });

  app.patch("/api/leads/:id", async (req, res) => {
    const id = Number(req.params.id);
    const data = insertLeadSchema.partial().parse(req.body);
    const sheetRowNumber = sheetRowFromLeadId(id);
    if (sheetRowNumber) {
      try {
        const result = updateCrmRowFromLeadPatch(sheetRowNumber, data);
        if (!result) return res.status(404).json({ message: "CRM row not found" });
        return res.json({ ...result, sheetsSync: { ok: true } });
      } catch (err: any) {
        return res.status(502).json({
          message: "Google Sheets update failed",
          sheetsSync: { ok: false, error: String(err?.message ?? err) },
        });
      }
    }
    const result = await storage.updateLead(id, data);
    if (!result) return res.status(404).json({ message: "Lead not found" });
    let sheetsSync: { ok: boolean; error?: string; skipped?: boolean } = { ok: true, skipped: true };
    res.json({ ...result, sheetsSync });
  });
  app.delete("/api/leads/:id", async (req, res) => {
    await storage.deleteLead(Number(req.params.id));
    res.json({ ok: true });
  });

  // ============ JOBS ============
  app.get("/api/jobs", async (_req, res) => {
    res.json(await storage.listJobs());
  });
  app.post("/api/jobs", async (req, res) => {
    const data = insertJobSchema.parse(req.body);
    const created = await storage.createJob(data);
    let sheetsSync: { ok: boolean; error?: string } = { ok: true };
    try {
      appendJobToJobEntry(created);
    } catch (err: any) {
      sheetsSync = { ok: false, error: String(err?.message ?? err) };
    }
    res.json({ ...created, sheetsSync });
  });
  app.patch("/api/jobs/:id", async (req, res) => {
    const id = Number(req.params.id);
    const data = insertJobSchema.partial().parse(req.body);
    const result = await storage.updateJob(id, data);
    if (!result) return res.status(404).json({ message: "Job not found" });
    res.json(result);
  });

  // ============ CREWS ============
  app.get("/api/crews", async (_req, res) => {
    res.json(await storage.listCrews());
  });

  // ============ ESTIMATES ============
  app.get("/api/estimates", async (_req, res) => {
    res.json(await storage.listEstimates());
  });
  app.post("/api/estimates", async (req, res) => {
    const data = insertEstimateSchema.parse(req.body);
    res.json(await storage.createEstimate(data));
  });

  // ============ QUOTE CALCULATION ============
  // Stateless helper so the frontend can recalculate live, then save.
  const quoteSchema = z.object({
    truckFillPct: z.number(),
    laborMinutes: z.number(),
    crewSize: z.number().default(2),
    stairsFlights: z.number().default(0),
    heavyItems: z.number().default(0),
    distanceMiles: z.number().default(0),
    discount: z.number().default(0),
  });
  app.post("/api/calculate-quote", async (req, res) => {
    const input = quoteSchema.parse(req.body);
    const s = await storage.getSettings();
    res.json(calcQuote(input, s));
  });

  // ============ AI LIVE OPS BRAIN ============
  app.get("/api/live-ops", async (_req, res) => {
    const [leads, jobs, estimates, settings] = await Promise.all([
      storage.listLeads(),
      storage.listJobs(),
      storage.listEstimates(),
      storage.getSettings(),
    ]);
    const today = new Date().toISOString().slice(0, 10);
    let weather: any = null;
    try {
      const r = await fetch("https://api.open-meteo.com/v1/forecast?latitude=42.5248&longitude=-83.5363&current=temperature_2m,precipitation,wind_speed_10m&daily=precipitation_probability_max&timezone=America%2FDetroit");
      const j = await r.json();
      weather = {
        source: "Open-Meteo live forecast",
        tempF: j.current?.temperature_2m != null ? Math.round((j.current.temperature_2m * 9) / 5 + 32) : null,
        precipitationIn: j.current?.precipitation != null ? +(j.current.precipitation / 25.4).toFixed(2) : null,
        windMph: j.current?.wind_speed_10m != null ? Math.round(j.current.wind_speed_10m * 0.621371) : null,
        rainChancePct: j.daily?.precipitation_probability_max?.[0] ?? null,
      };
    } catch {
      weather = { source: "Live weather temporarily unavailable", tempF: null, precipitationIn: null, windMph: null, rainChancePct: null };
    }

    const openLeads = leads.filter(l => ["new", "quote_sent", "follow_up"].includes(l.stage));
    const dueFollowUps = openLeads.filter(l => !l.nextActionDate || l.nextActionDate <= today);
    const todaysJobs = jobs.filter(j => j.scheduledDate === today && j.status !== "cancelled");
    const underFloor = estimates.filter(e => e.suggestedPrice < e.floorPrice).length;
    const bookedRevenue = todaysJobs.reduce((sum, j) => sum + j.estimatedRevenue, 0);
    const rainRisk = (weather?.rainChancePct ?? 0) >= 45 || (weather?.precipitationIn ?? 0) > 0.02;

    const recommendations = [
      dueFollowUps.length > 0 && {
        kind: "follow_up",
        title: "Attack stale money first",
        action: `${dueFollowUps.length} lead${dueFollowUps.length === 1 ? "" : "s"} need a touch today. Start with ${dueFollowUps[0]?.name} before new quote work.`,
        impact: "Higher close rate without buying more ads",
        autonomy: settings.autoOptimizeMode ? "Auto-optimized timing is ON" : "Suggest-only",
      },
      rainRisk && {
        kind: "dispatch",
        title: "Weather risk on jobs",
        action: "Pad arrival windows, protect floors, and push outdoor yard debris earlier in the day.",
        impact: "Fewer delays and cleaner customer experience",
        autonomy: "Recommendation only",
      },
      underFloor > 0 && {
        kind: "pricing",
        title: "Some estimates are under floor",
        action: `${underFloor} saved estimate${underFloor === 1 ? "" : "s"} fell below margin floor. Let Auto-Optimize raise yard pricing within the safety cap.`,
        impact: "Protects profit on heavy or uncertain loads",
        autonomy: settings.autoOptimizeMode ? "Can tune price-per-yard safely" : "Needs owner toggle",
      },
      bookedRevenue > 0 && {
        kind: "proof",
        title: "Turn today's jobs into proof",
        action: "Create before/after receipts for completed jobs, then send review requests while the customer still remembers the clean space.",
        impact: "More Google reviews and dispute protection",
        autonomy: "Draft only, you approve sending",
      },
    ].filter(Boolean);

    res.json({
      now: new Date().toISOString(),
      location: "Wixom, MI",
      weather,
      signals: {
        openLeads: openLeads.length,
        dueFollowUps: dueFollowUps.length,
        todaysJobs: todaysJobs.length,
        bookedRevenue,
        underFloorEstimates: underFloor,
        autoOptimizeMode: settings.autoOptimizeMode,
        lastOptimizedAt: settings.lastOptimizedAt,
      },
      recommendations,
      guardrails: [
        "Customer-facing texts, emails, promises, and CRM destructive edits still require owner approval.",
        "Auto-Optimize can only adjust pricing/follow-up settings inside the safety cap.",
        "Photo quotes are treated as draft ranges until confirmed by a human.",
      ],
    });
  });

  const photoQuoteSchema = z.object({
    photoName: z.string().optional(),
    photoSize: z.number().optional(),
    jobType: z.string().default("Mixed Junk"),
    visibleLoad: z.enum(["single_item", "small", "medium", "large", "overflowing"]).default("medium"),
    access: z.enum(["curbside", "garage", "inside", "stairs", "basement"]).default("garage"),
    notes: z.string().optional().default(""),
    distanceMiles: z.number().default(8),
  });
  app.post("/api/photo-quote", async (req, res) => {
    const input = photoQuoteSchema.parse(req.body);
    const settings = await storage.getSettings();
    const baseFill = { single_item: 12, small: 25, medium: 45, large: 75, overflowing: 115 }[input.visibleLoad];
    const typeBump = /hot tub|construction|estate|full property/i.test(input.jobType) ? 20 : /appliance|furniture/i.test(input.jobType) ? 8 : 0;
    const accessBump = { curbside: 0, garage: 5, inside: 10, stairs: 16, basement: 22 }[input.access];
    const photoConfidence = input.photoName ? Math.max(64, Math.min(91, 72 + Math.round((input.photoSize ?? 0) / 500000))) : 58;
    const truckFillPct = Math.min(200, baseFill + typeBump + accessBump);
    const heavyItems = /hot tub|piano|safe|appliance|fridge|washer|dryer|treadmill/i.test(`${input.jobType} ${input.notes}`) ? 1 : 0;
    const stairsFlights = input.access === "stairs" ? 1 : input.access === "basement" ? 1 : 0;
    const laborMinutes = Math.round(35 + truckFillPct * 1.15 + accessBump * 2 + heavyItems * 25);
    const quote = calcQuote({ truckFillPct, laborMinutes, crewSize: 2, stairsFlights, heavyItems, distanceMiles: input.distanceMiles, discount: 0 }, settings);
    const low = Math.max(settings.minimumJobPrice, Math.round((quote.suggestedPrice * 0.9) / 5) * 5);
    const high = Math.round((Math.max(quote.floorPrice, quote.suggestedPrice) * 1.18) / 5) * 5;

    res.json({
      mode: "AI-assisted draft",
      confidence: photoConfidence,
      imageRead: input.photoName ? `Photo received: ${input.photoName}` : "No photo attached",
      truckFillPct,
      laborMinutes,
      heavyItems,
      stairsFlights,
      suggestedRange: { low, high },
      quote,
      reasoning: [
        `${input.visibleLoad.replace("_", " ")} visible load mapped to ${baseFill}% truck fill before difficulty.`,
        `${input.access} access added ${accessBump}% difficulty buffer.`,
        `Job type "${input.jobType}" ${typeBump ? "adds a risk buffer" : "stays in normal mixed-load range"}.`,
        "Range is a draft until a human confirms hidden weight, stairs, and disposal restrictions.",
      ],
      nextBestAction: `Text back: "Based on the photo, you're likely around $${low}–$${high}. Final price confirmed on arrival before we load anything."`,
    });
  });

  app.post("/api/auto-optimize", async (_req, res) => {
    const [settings, leads, estimates] = await Promise.all([storage.getSettings(), storage.listLeads(), storage.listEstimates()]);
    if (!settings.autoOptimizeMode) return res.json({ applied: false, message: "Auto-Optimize is off. Turn it on in Settings." });

    const open = leads.filter(l => ["new", "quote_sent", "follow_up"].includes(l.stage)).length;
    const completed = leads.filter(l => l.stage === "completed").length;
    const closeRate = completed / Math.max(1, completed + leads.filter(l => l.stage === "lost").length);
    const underFloor = estimates.filter(e => e.suggestedPrice < e.floorPrice).length;
    const cap = Math.max(1, settings.maxAutoPriceAdjustPct);
    let priceBumpPct = 0;
    if (underFloor > 0) priceBumpPct += Math.min(cap, 3 + underFloor);
    if (closeRate > 0.55 && open > 5) priceBumpPct += 2;
    priceBumpPct = Math.min(cap, priceBumpPct);
    const newPricePerYard = +(settings.pricePerYard * (1 + priceBumpPct / 100)).toFixed(2);
    const newFollowUpSpeed = open > 6 ? Math.max(1, settings.followUpSpeedHours - 1) : settings.followUpSpeedHours;
    const updated = await storage.updateSettings({
      pricePerYard: priceBumpPct > 0 ? newPricePerYard : settings.pricePerYard,
      followUpSpeedHours: newFollowUpSpeed,
      lastOptimizedAt: new Date().toISOString(),
    });

    res.json({
      applied: true,
      changes: [
        priceBumpPct > 0 ? `Raised price per yard by ${priceBumpPct}% to $${updated.pricePerYard}.` : "Kept price per yard steady.",
        newFollowUpSpeed !== settings.followUpSpeedHours ? `Moved follow-up speed to ${newFollowUpSpeed} hour${newFollowUpSpeed === 1 ? "" : "s"}.` : "Kept follow-up timing steady.",
      ],
      reason: `Analyzed ${leads.length} leads, ${estimates.length} estimates, ${underFloor} under-floor estimate${underFloor === 1 ? "" : "s"}, and ${(closeRate * 100).toFixed(0)}% historical close rate.`,
      settings: updated,
    });
  });

  // ============ AI BUILDER MODE ============
  const builderTools = [
    {
      name: "search_live_business_data",
      label: "Live business search",
      riskLevel: "low",
      approvalRequired: false,
      description: "Search live CRM, jobs, settings, receipts, follow-ups, and Google Sheets sync context.",
      canExecuteNow: true,
    },
    {
      name: "deep_web_search",
      label: "Deep live web search",
      riskLevel: "low",
      approvalRequired: false,
      description: "Search live public web data for junk removal market, competitors, disposal guidance, pricing patterns, and business opportunities.",
      canExecuteNow: true,
    },
    {
      name: "create_task",
      label: "Create internal task",
      riskLevel: "low",
      approvalRequired: false,
      description: "Create an internal task/action log item for the owner or operator. Does not contact customers.",
      canExecuteNow: true,
    },
    {
      name: "create_ai_agent",
      label: "Draft AI agent",
      riskLevel: "medium",
      approvalRequired: true,
      description: "Draft a specialized agent such as Follow-Up Agent, Pricing Agent, CRM Cleaner, or Invoice Agent. Agents stay disabled until owner approval.",
      canExecuteNow: true,
    },
    {
      name: "create_invoice",
      label: "Create invoice draft",
      riskLevel: "medium",
      approvalRequired: true,
      description: "Create an invoice draft from a job/customer record. Sending through Gmail requires a separate owner-approved send action.",
      canExecuteNow: true,
    },
    {
      name: "send_invoice_gmail",
      label: "Send invoice with Gmail",
      riskLevel: "high",
      approvalRequired: true,
      description: "Send an approved invoice email through the owner's connected Gmail account. Never auto-sends.",
      canExecuteNow: true,
    },
    {
      name: "update_settings",
      label: "Update pricing/settings",
      riskLevel: "medium",
      approvalRequired: true,
      description: "Change pricing guardrails, follow-up speed, minimum job price, or other owner settings.",
      canExecuteNow: true,
    },
    {
      name: "sync_google_sheets",
      label: "Trigger Google Sheets sync",
      riskLevel: "medium",
      approvalRequired: true,
      description: "Refresh CRM and Job Entry rows from Google Sheets and report mismatches.",
      canExecuteNow: true,
    },
    {
      name: "clean_crm_data",
      label: "Clean CRM data",
      riskLevel: "medium",
      approvalRequired: true,
      description: "Dry-run cleanup of phone, city, source, and status formatting. Bulk writes stay locked until reviewed.",
      canExecuteNow: false,
    },
    {
      name: "draft_code_change",
      label: "Draft app/code change",
      riskLevel: "high",
      approvalRequired: true,
      description: "Draft a screen, component, migration, or workflow change. Code execution/deployment remains locked behind PR/staging setup.",
      canExecuteNow: false,
    },
    {
      name: "deploy_staging",
      label: "Deploy staging",
      riskLevel: "high",
      approvalRequired: true,
      description: "Future tool for approved staging deployments after tests pass.",
      canExecuteNow: false,
    },
    {
      name: "deploy_production",
      label: "Deploy production",
      riskLevel: "critical",
      approvalRequired: true,
      description: "Future owner-only tool. Requires tests, staging, release record, and rollback target.",
      canExecuteNow: false,
    },
  ];

  function normalizeForSearch(value: any) {
    return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  }

  function firstMatchScore(query: string, record: Record<string, any>) {
    const q = normalizeForSearch(query);
    if (!q) return 1;
    const haystack = normalizeForSearch(Object.values(record).join(" "));
    const words = q.split(/\s+/).filter(Boolean);
    return words.reduce((score, word) => score + (haystack.includes(word) ? 1 : 0), 0);
  }

  async function getBuilderLiveContext(query = "") {
    const [leads, jobs, receipts, followUps, settings, memory, memoryEvents, agents, invoices] = await Promise.all([
      listLivePipelineLeads().catch(() => storage.listLeads()),
      storage.listJobs(),
      storage.listReceipts(),
      storage.listFollowUps(),
      storage.getSettings(),
      storage.listBusinessMemory(),
      storage.listMemoryEvents(80),
      storage.listAgents(),
      storage.listInvoices(),
    ]);

    const rankedLeads = [...leads]
      .map((lead: any) => ({ ...lead, _score: firstMatchScore(query, lead) }))
      .filter((lead: any) => !query || lead._score > 0)
      .sort((a: any, b: any) => b._score - a._score)
      .slice(0, 12);
    const rankedJobs = [...jobs]
      .map((job: any) => ({ ...job, _score: firstMatchScore(query, job) }))
      .filter((job: any) => !query || job._score > 0)
      .sort((a: any, b: any) => b._score - a._score)
      .slice(0, 12);
    const rankedReceipts = [...receipts]
      .map((receipt: any) => ({ ...receipt, _score: firstMatchScore(query, receipt) }))
      .filter((receipt: any) => !query || receipt._score > 0)
      .sort((a: any, b: any) => b._score - a._score)
      .slice(0, 8);

    let sheets: any = { connected: false };
    try {
      const crmRows = readCrmRows();
      const jobRows = callSheetsTool("google_sheets-read-rows", {
        spreadsheetId: CRM_SPREADSHEET_ID,
        sheetName: JOB_ENTRY_SHEET_NAME,
        range: "A1:O1000",
        hasHeaders: true,
      });
      sheets = {
        connected: true,
        crmRows: crmRows.rows?.length ?? 0,
        jobEntryRows: jobRows.rows?.length ?? 0,
        crmPreview: (crmRows.rows ?? []).slice(0, 5),
        jobEntryPreview: (jobRows.rows ?? []).slice(0, 5),
      };
    } catch (err: any) {
      sheets = { connected: false, error: String(err?.message ?? err) };
    }

    return {
      query,
      generatedAt: new Date().toISOString(),
      settings,
      memory,
      memoryEvents,
      agents,
      invoices: invoices.slice(0, 20),
      sheets,
      counts: {
        leads: leads.length,
        jobs: jobs.length,
        receipts: receipts.length,
        followUps: followUps.length,
        memoryEvents: memoryEvents.length,
        agents: agents.length,
        invoices: invoices.length,
      },
      matches: {
        leads: rankedLeads,
        jobs: rankedJobs,
        receipts: rankedReceipts,
        followUps: followUps.slice(0, 12),
      },
    };
  }

  function draftBuilderActions(prompt: string, context: any) {
    const text = prompt.toLowerCase();
    const actions: any[] = [];
    const openLeadCount = context.matches.leads.filter((l: any) => ["new", "quote_sent", "follow_up"].includes(l.stage)).length;
    const settings = context.settings;

    if (/price|pricing|minimum|margin|charge|quote|yard/.test(text)) {
      const bump = Math.min(10, Math.max(3, Number(settings.maxAutoPriceAdjustPct ?? 8)));
      actions.push({
        title: "Review pricing guardrails",
        toolName: "update_settings",
        riskLevel: "medium",
        mode: "apply_with_approval",
        humanSummary: `Builder Mode can raise or tighten pricing settings, but it needs approval first. Suggested safe move: keep minimum job at $${settings.minimumJobPrice}, review target margin ${settings.targetMarginPct}%, and allow no more than ${bump}% auto adjustments.`,
        input: {
          patch: {
            maxAutoPriceAdjustPct: bump,
            followUpSpeedHours: Math.max(1, Number(settings.followUpSpeedHours ?? 2)),
          },
        },
        preview: {
          before: {
            maxAutoPriceAdjustPct: settings.maxAutoPriceAdjustPct,
            followUpSpeedHours: settings.followUpSpeedHours,
          },
          after: {
            maxAutoPriceAdjustPct: bump,
            followUpSpeedHours: Math.max(1, Number(settings.followUpSpeedHours ?? 2)),
          },
          note: "This does not change customer prices directly. It changes the safety rail Auto-Optimize can use.",
        },
        rollback: { type: "settings_snapshot", previous: { maxAutoPriceAdjustPct: settings.maxAutoPriceAdjustPct, followUpSpeedHours: settings.followUpSpeedHours } },
        approvalRequired: true,
      });
    }

    if (/sync|sheet|google|crm|job entry/.test(text)) {
      actions.push({
        title: "Run live Google Sheets sync check",
        toolName: "sync_google_sheets",
        riskLevel: "medium",
        mode: "apply_with_approval",
        humanSummary: `Refresh the app from the Google Sheets CRM and Job Entry tabs, then return imported row counts and mismatch notes.`,
        input: { direction: "sheet_to_app", tabs: ["CRM", "Job Entry"], dryRun: false },
        preview: {
          sheet: CRM_SPREADSHEET_NAME,
          connected: context.sheets.connected,
          crmRowsSeen: context.sheets.crmRows ?? 0,
          jobRowsSeen: context.sheets.jobEntryRows ?? 0,
        },
        rollback: { type: "non_destructive_import", note: "This import only adds missing local records; no Sheet rows are deleted." },
        approvalRequired: true,
      });
    }

    if (/agent|agents|specialist|delegate|worker|assistant/.test(text)) {
      const inferredName =
        /invoice/.test(text) ? "Invoice Agent" :
        /follow|review|unpaid/.test(text) ? "Follow-Up Agent" :
        /price|quote/.test(text) ? "Pricing Agent" :
        /crm|clean|dedupe/.test(text) ? "CRM Hygiene Agent" :
        "Operations Agent";
      actions.push({
        title: `Draft ${inferredName}`,
        toolName: "create_ai_agent",
        riskLevel: "medium",
        mode: "apply_with_approval",
        humanSummary: `Create a disabled ${inferredName} that can search memory and draft work, but cannot change records, send messages, update pricing, or build app changes until you approve the specific action.`,
        input: {
          name: inferredName,
          purpose: prompt,
          status: "draft",
          toolPermissions: ["search_live_business_data", "search_memory", "draft_builder_action"],
          approvalPolicy: {
            autoExecute: ["search_live_business_data", "search_memory"],
            ownerApprovalRequired: ["update_settings", "sync_google_sheets", "create_invoice", "send_invoice_gmail", "draft_code_change", "deploy_production"],
          },
          memoryScopes: ["recent", "long_term_business", "customer", "learning_loop", "app_improvement"],
        },
        preview: {
          agentName: inferredName,
          startsDisabled: true,
          noAutonomousSending: true,
          canBuildAgents: "Only as owner-approved drafts.",
        },
        rollback: { type: "disable_or_delete_agent", note: "Agent can be disabled because it is stored as configuration until approved." },
        approvalRequired: true,
      });
    }

    if (/invoice|bill|billing|gmail|email.*client|send.*client/.test(text)) {
      actions.push({
        title: "Draft invoice workflow",
        toolName: "create_invoice",
        riskLevel: "medium",
        mode: "apply_with_approval",
        humanSummary: `Create invoice drafts inside the app with line items, due date, email copy, and a separate owner approval before Gmail send.`,
        input: {
          request: prompt,
          defaultLineItems: [{ description: "Junk removal / hauling service", quantity: 1, unitPrice: 0 }],
          requireGmailApproval: true,
        },
        preview: {
          status: "draft",
          sendStep: "locked until invoice exists, Gmail is connected, and owner approves send",
          gmailConnected: "checked at send time",
        },
        rollback: { type: "mark_invoice_void", note: "Draft invoices can be voided; sent invoices remain in audit history." },
        approvalRequired: true,
      });
    }

    if (/clean|normalize|dedupe|duplicate|phone|city|source|messy|bad data/.test(text)) {
      actions.push({
        title: "Dry-run CRM cleanup",
        toolName: "clean_crm_data",
        riskLevel: "medium",
        mode: "draft_changes",
        humanSummary: `Scan CRM rows for phone formatting, source typos, blank city/status fields, and possible duplicates. This first pass is dry-run only.`,
        input: { cleanupTypes: ["phone_format", "city_case", "source_typos", "status_mapping", "duplicate_candidates"], dryRun: true },
        preview: {
          crmRowsAvailable: context.sheets.crmRows ?? context.counts.leads,
          sampleLeadNames: context.matches.leads.slice(0, 5).map((l: any) => l.name),
          nextStep: "Show affected row preview before any write is allowed.",
        },
        rollback: { type: "row_snapshots_required_before_write" },
        approvalRequired: true,
      });
    }

    if (/build|screen|component|page|feature|ui|app|button|workflow|deploy|migration|sql/.test(text)) {
      actions.push({
        title: "Draft app build plan",
        toolName: "draft_code_change",
        riskLevel: "high",
        mode: "draft_changes",
        humanSummary: `Create a technical build plan and file-level diff proposal for: "${prompt}". It will not edit code or deploy production until GitHub/staging approval tools are connected.`,
        input: { request: prompt, target: "Clean Plate app", environment: "draft" },
        preview: {
          likelyFiles: ["client/src/pages/*", "server/routes.ts", "server/storage.ts", "shared/schema.ts"],
          lockedCapabilities: ["direct code execution", "production deploy"],
          approvalNeeded: "Owner approval plus tests once GitHub/staging is connected.",
        },
        rollback: { type: "git_revert_required_after_code_tools_exist" },
        approvalRequired: true,
      });
    }

    if (/follow|task|todo|remind|call|text|review|unpaid/.test(text) || actions.length === 0) {
      actions.push({
        title: "Create owner task from AI request",
        toolName: "create_task",
        riskLevel: "low",
        mode: "apply_with_approval",
        humanSummary: `Create an internal action item from this request so it shows in Builder Mode history. No customer message will be sent.`,
        input: { task: prompt, priority: openLeadCount > 0 ? "high" : "normal", relatedOpenLeads: openLeadCount },
        preview: {
          task: prompt,
          openLeadsInContext: openLeadCount,
          noCustomerContact: true,
        },
        rollback: { type: "mark_action_cancelled" },
        approvalRequired: false,
      });
    }

    return actions.slice(0, 4);
  }

  app.get("/api/builder/status", async (_req, res) => {
    const [actions, memory, context] = await Promise.all([
      storage.listBuilderActions(),
      storage.listBusinessMemory(),
      getBuilderLiveContext(""),
    ]);
    res.json({
      mode: "builder_mode",
      environment: "production-protected",
      tools: builderTools,
      actions,
      memory,
      signals: {
        liveSheetsConnected: context.sheets.connected,
        crmRows: context.sheets.crmRows ?? context.counts.leads,
        jobEntryRows: context.sheets.jobEntryRows ?? context.counts.jobs,
        openLeads: context.matches.leads.filter((l: any) => ["new", "quote_sent", "follow_up"].includes(l.stage)).length,
        pendingApprovals: actions.filter((a: any) => a.status === "pending_approval").length,
        executedActions: actions.filter((a: any) => a.status === "executed").length,
      },
      guardrails: [
        "The AI can inspect live data and draft changes freely.",
        "Business writes require typed tools and logged execution.",
        "Settings, Sheets sync, CRM cleanup, code, SQL, and deploy work require approval.",
        "Code and production deploy tools are scaffolded but locked until GitHub/staging are connected.",
      ],
    });
  });

  app.post("/api/builder/search", async (req, res) => {
    const input = z.object({
      query: z.string().default(""),
      scopes: z.array(z.string()).optional().default(["leads", "jobs", "receipts", "settings", "sheets"]),
    }).parse(req.body);
    const context = await getBuilderLiveContext(input.query);
    res.json({
      answer: `Searched live Clean Plate data for "${input.query || "everything"}". Found ${context.matches.leads.length} lead matches, ${context.matches.jobs.length} job matches, ${context.matches.receipts.length} receipt matches, and ${context.sheets.connected ? `${context.sheets.crmRows} CRM Sheet rows` : "Sheets currently unavailable"}.`,
      scopes: input.scopes,
      context,
    });
  });

  app.post("/api/builder/draft", async (req, res) => {
    const input = z.object({
      prompt: z.string().min(2),
      mode: z.enum(["suggest_only", "draft_changes", "apply_with_approval"]).default("apply_with_approval"),
    }).parse(req.body);
    const context = await getBuilderLiveContext(input.prompt);
    const drafts = draftBuilderActions(input.prompt, context).map(a => ({ ...a, mode: input.mode === "suggest_only" ? "suggest_only" : a.mode }));
    const created = [];
    for (const draft of drafts) {
      created.push(await storage.createBuilderAction({
        title: draft.title,
        toolName: draft.toolName,
        riskLevel: draft.riskLevel,
        status: draft.approvalRequired && draft.riskLevel !== "low" ? "pending_approval" : "draft",
        mode: draft.mode,
        humanSummary: draft.humanSummary,
        input: draft.input,
        preview: draft.preview,
        rollback: draft.rollback,
        approvalRequired: draft.approvalRequired,
      }));
    }
    res.json({
      message: `Builder Mode drafted ${created.length} action${created.length === 1 ? "" : "s"} from your request.`,
      actions: created,
      contextSummary: {
        crmRows: context.sheets.crmRows ?? context.counts.leads,
        jobRows: context.sheets.jobEntryRows ?? context.counts.jobs,
        matchedLeads: context.matches.leads.length,
      },
    });
  });

  app.get("/api/builder/actions", async (_req, res) => {
    res.json(await storage.listBuilderActions());
  });

  app.post("/api/builder/actions/:id/approve", async (req, res) => {
    const id = Number(req.params.id);
    const actions = await storage.listBuilderActions();
    const action = actions.find((a: any) => a.id === id);
    if (!action) return res.status(404).json({ message: "Builder action not found" });
    if (["executed", "failed", "rejected"].includes(action.status)) return res.status(409).json({ message: `Action is already ${action.status}` });
    const updated = await storage.updateBuilderAction(id, { status: "approved", approvedAt: new Date().toISOString() });
    res.json(updated);
  });

  app.post("/api/builder/actions/:id/reject", async (req, res) => {
    const id = Number(req.params.id);
    const updated = await storage.updateBuilderAction(id, { status: "rejected" });
    if (!updated) return res.status(404).json({ message: "Builder action not found" });
    res.json(updated);
  });

  app.post("/api/builder/actions/:id/execute", async (req, res) => {
    const id = Number(req.params.id);
    const action = (await storage.listBuilderActions()).find((a: any) => a.id === id);
    if (!action) return res.status(404).json({ message: "Builder action not found" });
    if (action.approvalRequired && action.status !== "approved" && action.riskLevel !== "low") {
      return res.status(403).json({ message: "Approval required before execution" });
    }

    try {
      let result: any = null;
      if (action.toolName === "create_task") {
        result = {
          taskCreated: true,
          task: action.input.task,
          priority: action.input.priority ?? "normal",
          note: "Internal Builder Mode task logged. No customer contact was sent.",
        };
      } else if (action.toolName === "update_settings") {
        const patch = insertSettingsSchema.partial().parse(action.input.patch ?? {});
        const before = await storage.getSettings();
        const after = await storage.updateSettings(patch);
        result = { before, after, changedKeys: Object.keys(patch) };
      } else if (action.toolName === "sync_google_sheets") {
        const crm = await importCrmRowsFromSheet();
        const jobsImport = await importJobRowsFromSheet();
        result = { crm, jobs: jobsImport, note: "Google Sheets sync job completed." };
      } else if (action.toolName === "create_ai_agent") {
        const agent = await storage.createAgent({
          name: action.input.name || "Operations Agent",
          purpose: action.input.purpose || action.humanSummary,
          status: action.input.status || "draft",
          toolPermissionsJson: JSON.stringify(action.input.toolPermissions ?? []),
          approvalPolicyJson: JSON.stringify(action.input.approvalPolicy ?? {}),
          memoryScopesJson: JSON.stringify(action.input.memoryScopes ?? []),
          createdByActionId: action.id,
        } as any);
        result = {
          agent,
          note: "Agent drafted and stored disabled. It can search/analyze only until the owner approves more permissions.",
        };
      } else if (action.toolName === "create_invoice") {
        result = {
          draftOnly: true,
          note: "Use the Invoice Center to choose the customer/job, review line items, and create an invoice draft.",
          requiredFields: ["customerName", "email", "lineItems", "total"],
        };
      } else if (action.toolName === "send_invoice_gmail") {
        result = {
          locked: true,
          note: "Invoice sending happens from the Invoice Center after invoice-specific approval. This Builder action cannot send a general email.",
        };
      } else if (action.toolName === "clean_crm_data") {
        const context = await getBuilderLiveContext("clean crm");
        result = {
          dryRunOnly: true,
          possibleFixes: context.matches.leads.slice(0, 20).map((lead: any) => ({
            id: lead.id,
            name: lead.name,
            sheetRowNumber: lead.sheetRowNumber ?? null,
            phone: lead.phone,
            normalizedPhone: normalizePhoneDigits(lead.phone),
            city: lead.city,
            normalizedCity: String(lead.city ?? "").trim().replace(/\b\w/g, c => c.toUpperCase()),
            source: lead.source,
          })),
          note: "Dry-run complete. Bulk write-back remains locked until a row-by-row approval UI is added.",
        };
      } else if (action.toolName === "draft_code_change") {
        result = {
          draftOnly: true,
          spec: action.input.request,
          nextInfrastructureNeeded: ["GitHub connector", "branch writer", "test runner", "staging deploy target"],
          note: "Code self-editing is intentionally locked until PR/staging controls are connected.",
        };
      } else {
        result = { locked: true, note: `${action.toolName} is registered but not executable yet.` };
      }

      const updated = await storage.updateBuilderAction(id, {
        status: "executed",
        result,
        executedAt: new Date().toISOString(),
      });
      res.json(updated);
    } catch (err: any) {
      const updated = await storage.updateBuilderAction(id, {
        status: "failed",
        result: { error: String(err?.message ?? err) },
        executedAt: new Date().toISOString(),
      });
      res.status(500).json(updated);
    }
  });

  app.post("/api/builder/memory", async (req, res) => {
    const input = z.object({
      memoryType: z.string().default("business_preference"),
      key: z.string().min(1),
      value: z.unknown(),
      source: z.string().default("owner"),
      confidence: z.number().min(0).max(1).default(1),
    }).parse(req.body);
    res.json(await storage.upsertBusinessMemory({ ...input, value: input.value }));
  });

  // ============ AI BRAIN MEMORY / AGENTS ============
  function daysBetweenNow(value: string | null | undefined) {
    if (!value) return 9999;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return 9999;
    return Math.floor((Date.now() - d.getTime()) / 86400000);
  }

  async function ensureBrandMemory() {
    const existing = await storage.listBusinessMemory();
    if (!existing.some((m: any) => m.memoryType === "brand" && m.key === "clean_plate_public_context")) {
      await storage.upsertBusinessMemory({
        memoryType: "brand",
        key: "clean_plate_public_context",
        source: "owner_website",
        confidence: 0.9,
        value: {
          websiteUrl: "https://www.cleanplatehaulingco.com/",
          facebookUrl: "https://www.facebook.com/profile.php?id=61574289219760",
          positioning: "Fast, clean, professional junk removal with photo-based quoting and transparent pricing.",
          serviceAreas: ["Wixom", "Novi", "Southfield", "Farmington Hills", "Commerce", "Walled Lake", "Greater Detroit"],
          publicPriceSignals: ["single item from about $75", "small cleanup roughly $150-$250", "full cleanout $300+"],
        },
      });
    }
  }

  function memoryEventFromJob(job: any, receipts: any[]) {
    const receipt = receipts.find((r: any) => r.jobId === job.id || normalizePhoneDigits(r.phone) === normalizePhoneDigits(job.phone));
    const revenue = Number(receipt?.amount ?? job.estimatedRevenue ?? 0);
    const expenses = Number(receipt?.dumpFee ?? 0) + Number(receipt?.laborCost ?? 0);
    const recovered = Number(receipt?.resaleValue ?? 0) + Number(receipt?.scrapValue ?? 0) + Number(receipt?.recycleCredit ?? 0) + Number(receipt?.donationValue ?? 0) + Number(receipt?.otherRecovery ?? 0);
    const net = revenue + recovered - expenses;
    const strength = net >= revenue * 0.55 ? "strong" : net >= revenue * 0.35 ? "fair" : "too low";
    return {
      memoryLayer: "learning_loop",
      category: "job_profit_lesson",
      title: `${job.customerName}: ${strength} price lesson`,
      summary: `${job.jobType} in ${job.city || "unknown city"} produced about ${moneyCell(net)} net after known expenses and recovered value. Future quote signal: ${strength === "too low" ? "raise similar jobs or watch dump/labor risk" : strength === "fair" ? "quote similar jobs with tighter expense tracking" : "repeat this pricing pattern"}.`,
      entityType: "job",
      entityId: String(job.id),
      customerName: job.customerName,
      importance: strength === "too low" ? 5 : 4,
      evidenceJson: JSON.stringify({ revenue, expenses, recovered, net, strength, truckFillPct: job.truckFillPct, source: job.notes }),
    };
  }

  async function buildMemoryDashboard() {
    await ensureBrandMemory();
    const [leads, jobs, receipts, memory, events, actions, agents, invoices] = await Promise.all([
      listLivePipelineLeads().catch(() => storage.listLeads()),
      storage.listJobs(),
      storage.listReceipts(),
      storage.listBusinessMemory(),
      storage.listMemoryEvents(200),
      storage.listBuilderActions(),
      storage.listAgents(),
      storage.listInvoices(),
    ]);

    const recent = (days: number) => ({
      days,
      leads: leads.filter((l: any) => daysBetweenNow(l.createdAt || l.updatedAt) <= days).length,
      jobs: jobs.filter((j: any) => daysBetweenNow(j.createdAt || j.scheduledDate) <= days).length,
      receipts: receipts.filter((r: any) => daysBetweenNow(r.createdAt) <= days).length,
      appActions: actions.filter((a: any) => daysBetweenNow(a.createdAt) <= days).length,
      memories: events.filter((e: any) => daysBetweenNow(e.createdAt) <= days).length,
    });

    const openFollowUps = leads
      .filter((l: any) => ["new", "quote_sent", "follow_up"].includes(l.stage) && (!l.nextActionDate || l.nextActionDate <= new Date().toISOString().slice(0, 10)))
      .slice(0, 8);
    const customerInsights = leads.slice(0, 8).map((l: any) => ({
      name: l.name,
      city: l.city,
      status: l.stage,
      followUp: l.nextAction || (openFollowUps.some((x: any) => x.id === l.id) ? "Follow up now" : "Monitor"),
      referralPotential: /repeat|referral|good|property|landlord|contractor/i.test(String(l.notes ?? "") + " " + String(l.source ?? "")) ? "high" : "unknown",
    }));

    return {
      generatedAt: new Date().toISOString(),
      recent: { seven: recent(7), thirty: recent(30), ninety: recent(90) },
      longTerm: memory.filter((m: any) => ["pricing", "brand", "business_rule", "owner_preference"].includes(m.memoryType)).slice(0, 12),
      recentMemories: events.slice(0, 12),
      importantLessons: events.filter((e: any) => e.importance >= 4).slice(0, 8),
      pricingLessons: events.filter((e: any) => /price|profit|quote|job_profit/.test(`${e.category} ${e.title} ${e.summary}`.toLowerCase())).slice(0, 8),
      customerInsights,
      suggestedAppImprovements: actions.filter((a: any) => ["draft", "pending_approval"].includes(a.status)).slice(0, 8),
      pendingApprovals: actions.filter((a: any) => a.status === "pending_approval" || a.status === "approved").slice(0, 8),
      learnedThisWeek: events.filter((e: any) => daysBetweenNow(e.createdAt) <= 7).slice(0, 8),
      agents,
      invoices: invoices.slice(0, 10),
      safetyRules: [
        "AI may search data, draft actions, and write memory logs.",
        "AI may draft specialized agents, but they start disabled until owner approval.",
        "AI may create invoice drafts, but Gmail sends require invoice-specific owner approval.",
        "AI may not delete data, overwrite Sheets, change pricing, or deploy production without approval.",
      ],
      brandContext: memory.find((m: any) => m.memoryType === "brand" && m.key === "clean_plate_public_context")?.value,
    };
  }

  app.get("/api/ai-memory/dashboard", async (_req, res) => {
    res.json(await buildMemoryDashboard());
  });

  app.post("/api/ai-memory/search", async (req, res) => {
    const input = z.object({ query: z.string().min(1) }).parse(req.body);
    const [events, context] = await Promise.all([
      storage.searchMemoryEvents(input.query, 30),
      getBuilderLiveContext(input.query),
    ]);
    res.json({
      query: input.query,
      answer: `Found ${events.length} memory matches, ${context.matches.leads.length} lead matches, ${context.matches.jobs.length} job matches, and ${context.matches.receipts.length} receipt matches for "${input.query}".`,
      events,
      liveMatches: context.matches,
    });
  });

  app.post("/api/ai-memory/learn-job", async (req, res) => {
    const input = z.object({ jobId: z.number().optional() }).parse(req.body ?? {});
    const [jobs, receipts] = await Promise.all([storage.listJobs(), storage.listReceipts()]);
    const targetJobs = input.jobId ? jobs.filter((job: any) => job.id === input.jobId) : jobs.filter((job: any) => job.status === "completed" || receipts.some((r: any) => r.jobId === job.id)).slice(0, 20);
    const created = [];
    for (const job of targetJobs) {
      created.push(await storage.createMemoryEvent(memoryEventFromJob(job, receipts) as any));
    }
    res.json({ learned: created.length, events: created });
  });

  app.post("/api/ai-deep-search", async (req, res) => {
    const input = z.object({
      query: z.string().min(2),
      saveToMemory: z.boolean().optional().default(false),
    }).parse(req.body);
    const dashboard = await buildMemoryDashboard();
    const prompt = [
      `Business: Clean Plate Hauling Co. Owner wants practical junk removal intelligence, not hype.`,
      `Use public live web information when available. Focus on Michigan / Greater Detroit / Wixom / Novi if local context matters.`,
      `Business memory snapshot:\n${JSON.stringify({
        brandContext: dashboard.brandContext,
        pricingLessons: dashboard.pricingLessons?.slice(0, 5),
        customerInsights: dashboard.customerInsights?.slice(0, 5),
      }).slice(0, 8000)}`,
      `Deep search request: ${input.query}`,
      `Return: findings, why it matters, specific business moves, risks, and whether it should become a memory or Builder action.`,
    ].join("\n\n");

    try {
      const response = await getOpenAI().responses.create({
        model: "gpt_5_4",
        tools: [{ type: "web_search_preview" } as any],
        instructions: "You are the Deep Search mode inside Clean Plate AI Brain. Use live public web search when useful. Be tactical, local-market aware, and owner-safe. Never claim private CRM changes or customer contact happened.",
        input: prompt,
      } as any);
      const answer = (response as any).output_text
        || (response as any).output?.map((o: any) => o.content?.map((c: any) => c.text).join(" ")).join("\n")
        || "Deep search did not return a usable answer.";
      let memoryEvent = null;
      if (input.saveToMemory) {
        memoryEvent = await storage.createMemoryEvent({
          memoryLayer: "long_term_business",
          category: "deep_search_finding",
          title: input.query.slice(0, 120),
          summary: answer.slice(0, 1200),
          entityType: "web_search",
          entityId: null,
          customerName: null,
          importance: 4,
          evidenceJson: JSON.stringify({ query: input.query, savedFrom: "ai_deep_search" }),
        } as any);
      }
      res.json({ answer, model: "gpt_5_4", liveSearch: true, memoryEvent });
    } catch (err: any) {
      if (!process.env.OPENAI_API_KEY && !process.env.OPENAI_ADMIN_KEY) {
        return res.status(503).json({ answer: "AI features need an OpenAI API key configured before use.", liveSearch: false, error: String(err?.message ?? err) });
      }
      const fallback = await getOpenAI().responses.create({
        model: "gpt_5_4",
        instructions: "You are the Deep Search mode inside Clean Plate AI Brain. The live search tool is currently unavailable, so use the provided business context and say that live search needs retry.",
        input: prompt,
      });
      const answer = (fallback as any).output_text || "Live deep search needs retry, but the AI Brain can still reason from app and Sheet data.";
      res.status(206).json({ answer, liveSearch: false, error: String(err?.message ?? err) });
    }
  });

  app.get("/api/ai-agents", async (_req, res) => {
    res.json(await storage.listAgents());
  });

  app.post("/api/ai-agents", async (req, res) => {
    const input = z.object({
      name: z.string().min(2),
      purpose: z.string().min(2),
      toolPermissions: z.array(z.string()).optional().default(["search_live_business_data", "search_memory", "draft_builder_action"]),
      memoryScopes: z.array(z.string()).optional().default(["recent", "long_term_business", "customer"]),
    }).parse(req.body);
    const agent = await storage.createAgent({
      name: input.name,
      purpose: input.purpose,
      status: "draft",
      toolPermissionsJson: JSON.stringify(input.toolPermissions),
      approvalPolicyJson: JSON.stringify({ ownerApprovalRequired: ["all_writes", "all_sends", "pricing_changes", "app_changes"] }),
      memoryScopesJson: JSON.stringify(input.memoryScopes),
      createdByActionId: null,
    } as any);
    res.json(agent);
  });

  // ============ GOOGLE SHEETS CRM SYNC ============
  app.get("/api/sheets/status", async (_req, res) => {
    try {
      const info = callSheetsTool("google_sheets-get-spreadsheet-info", { spreadsheetId: CRM_SPREADSHEET_ID });
      const crm = info.worksheets?.find((w: any) => w.sheetName === CRM_SHEET_NAME);
      const jobs = info.worksheets?.find((w: any) => w.sheetName === JOB_ENTRY_SHEET_NAME);
      res.json({
        connected: true,
        spreadsheetId: CRM_SPREADSHEET_ID,
        spreadsheetName: CRM_SPREADSHEET_NAME,
        url: `https://docs.google.com/spreadsheets/d/${CRM_SPREADSHEET_ID}/edit`,
        crm,
        jobs,
        aiLogExists: info.worksheets?.some((w: any) => w.sheetName === AI_LOG_SHEET_NAME) ?? false,
        checkedAt: new Date().toISOString(),
      });
    } catch (err: any) {
      res.status(503).json({ connected: false, message: "Google Sheets is not available to this app server yet.", error: String(err?.message ?? err) });
    }
  });

  app.get("/api/sheets/preview", async (_req, res) => {
    try {
      const crmRows = callSheetsTool("google_sheets-read-rows", {
        spreadsheetId: CRM_SPREADSHEET_ID,
        sheetName: CRM_SHEET_NAME,
        range: "A1:W25",
        hasHeaders: true,
      });
      const jobRows = callSheetsTool("google_sheets-read-rows", {
        spreadsheetId: CRM_SPREADSHEET_ID,
        sheetName: JOB_ENTRY_SHEET_NAME,
        range: "A1:O25",
        hasHeaders: true,
      });
      res.json({
        spreadsheetName: CRM_SPREADSHEET_NAME,
        crm: crmRows,
        jobs: jobRows,
        mapping: {
          name: "Customer Name",
          phone: "Phone",
          city: "City/Area",
          email: "Email",
          source: "Lead Source",
          jobType: "Last Job Type",
          status: "Status",
          nextActionDate: "Next Follow-Up",
          notes: "Internal CRM Notes + Job History Notes",
        },
      });
    } catch (err: any) {
      res.status(503).json({ message: "Could not read Google Sheets preview.", error: String(err?.message ?? err) });
    }
  });

  app.post("/api/sheets/import-crm", async (_req, res) => {
    try {
      const result = await importCrmRowsFromSheet();
      res.json({ ...result, spreadsheetName: CRM_SPREADSHEET_NAME });
    } catch (err: any) {
      res.status(503).json({ message: "Could not import CRM rows.", error: String(err?.message ?? err) });
    }
  });

  app.post("/api/sheets/import-jobs", async (_req, res) => {
    try {
      const result = await importJobRowsFromSheet();
      res.json({ ...result, spreadsheetName: CRM_SPREADSHEET_NAME });
    } catch (err: any) {
      res.status(503).json({ message: "Could not import Job Entry rows.", error: String(err?.message ?? err) });
    }
  });

  app.post("/api/sync/refresh", async (_req, res) => {
    try {
      const crmImport = await importCrmRowsFromSheet();
      const jobImport = await importJobRowsFromSheet();
      res.json({
        ok: true,
        refreshedAt: new Date().toISOString(),
        crmImport,
        jobImport,
        dashboardUrl: DASHBOARD_URL,
      });
    } catch (err: any) {
      res.status(503).json({ ok: false, message: "Sync refresh failed.", error: String(err?.message ?? err) });
    }
  });

  app.get("/api/sync/report", async (_req, res) => {
    try {
      const [leads, jobs] = await Promise.all([storage.listLeads(), storage.listJobs()]);
      const crmRows = callSheetsTool("google_sheets-read-rows", {
        spreadsheetId: CRM_SPREADSHEET_ID,
        sheetName: CRM_SHEET_NAME,
        range: "A1:W1000",
        hasHeaders: true,
      });
      const jobRows = callSheetsTool("google_sheets-read-rows", {
        spreadsheetId: CRM_SPREADSHEET_ID,
        sheetName: JOB_ENTRY_SHEET_NAME,
        range: "A1:O1000",
        hasHeaders: true,
      });
      const appLeadPhones = new Set(leads.map(l => normalizePhoneDigits(l.phone)).filter(Boolean));
      const sheetLeadPhones = new Set((crmRows.rows ?? []).map((r: any) => normalizePhoneDigits(r["Phone"])).filter(Boolean));
      const appJobKeys = new Set(jobs.map(j => `${normalizePhoneDigits(j.phone)}|${j.scheduledDate}|${j.jobType.toLowerCase()}`));
      const sheetJobKeys = new Set((jobRows.rows ?? []).map((r: any) => {
        const d = normalizeDate(r["Job Date    "]) || normalizeDate(r["Job Date"]) || "";
        return `${normalizePhoneDigits(r["Phone Number"])}|${d}|${String(r["Job Type"] ?? "").toLowerCase()}`;
      }).filter((k: string) => !k.startsWith("|")));

      const missingInSheetLeads = leads
        .filter(l => !sheetLeadPhones.has(normalizePhoneDigits(l.phone)))
        .map(l => ({ id: l.id, name: l.name, phone: l.phone }));
      const missingInAppLeads = (crmRows.rows ?? [])
        .filter((r: any) => normalizePhoneDigits(r["Phone"]) && !appLeadPhones.has(normalizePhoneDigits(r["Phone"])))
        .map((r: any) => ({ rowNumber: r._rowNumber, name: r["Customer Name"], phone: r["Phone"] }));
      const missingInSheetJobs = jobs
        .filter(j => !sheetJobKeys.has(`${normalizePhoneDigits(j.phone)}|${j.scheduledDate}|${j.jobType.toLowerCase()}`))
        .map(j => ({ id: j.id, name: j.customerName, date: j.scheduledDate, jobType: j.jobType }));
      const missingInAppJobs = (jobRows.rows ?? [])
        .filter((r: any) => {
          const d = normalizeDate(r["Job Date    "]) || normalizeDate(r["Job Date"]) || "";
          const key = `${normalizePhoneDigits(r["Phone Number"])}|${d}|${String(r["Job Type"] ?? "").toLowerCase()}`;
          return normalizePhoneDigits(r["Phone Number"]) && d && !appJobKeys.has(key);
        })
        .map((r: any) => ({ rowNumber: r._rowNumber, name: r["Customer Name"], date: normalizeDate(r["Job Date    "]) || normalizeDate(r["Job Date"]), jobType: r["Job Type"] }));
      const missingFields = {
        crm: findMissingFields(crmRows.rows ?? [], ["Customer Name", "Phone", "Status"]),
        jobs: findMissingFields(jobRows.rows ?? [], ["Job Date    ", "Customer Name", "Phone Number", "Job Type"]),
      };

      res.json({
        ok: true,
        checkedAt: new Date().toISOString(),
        spreadsheetName: CRM_SPREADSHEET_NAME,
        dashboardUrl: DASHBOARD_URL,
        counts: {
          appLeads: leads.length,
          sheetCrmRows: crmRows.rowCount ?? (crmRows.rows?.length ?? 0),
          appJobs: jobs.length,
          sheetJobRows: jobRows.rowCount ?? (jobRows.rows?.length ?? 0),
        },
        mismatches: {
          missingInSheetLeads,
          missingInAppLeads,
          missingInSheetJobs,
          missingInAppJobs,
          missingFields,
        },
      });
    } catch (err: any) {
      res.status(503).json({ ok: false, message: "Sync report failed.", error: String(err?.message ?? err) });
    }
  });

  app.post("/api/sheets/log-photo-quote", async (req, res) => {
    try {
      const body = z.object({
        customerName: z.string().optional().default(""),
        phone: z.string().optional().default(""),
        city: z.string().optional().default(""),
        jobType: z.string().optional().default("Mixed Junk"),
        priceLow: z.number(),
        priceHigh: z.number(),
        photoName: z.string().optional().default(""),
        notes: z.string().optional().default(""),
      }).parse(req.body);
      ensureAiLogWorksheet();
      const rows = JSON.stringify([appLogRow({
        "Record Type": "AI Photo Quote",
        "Customer Name": body.customerName,
        "Phone": body.phone,
        "City/Area": body.city,
        "Job Type": body.jobType,
        "AI Price Low": body.priceLow,
        "AI Price High": body.priceHigh,
        "Photo/Proof": body.photoName,
        "Notes": body.notes,
      })]);
      const result = callSheetsTool("google_sheets-add-rows", {
        spreadsheetId: CRM_SPREADSHEET_ID,
        sheetName: AI_LOG_SHEET_NAME,
        rows,
        hasHeaders: true,
      });
      res.json({ ok: true, result });
    } catch (err: any) {
      res.status(503).json({ message: "Could not log photo quote to Google Sheets.", error: String(err?.message ?? err) });
    }
  });

  app.post("/api/sheets/log-receipt", async (req, res) => {
    try {
      const body = z.object({
        receiptId: z.number().optional(),
        customerName: z.string(),
        phone: z.string().optional().default(""),
        city: z.string().optional().default(""),
        jobType: z.string().optional().default(""),
        amount: z.number(),
        paymentMethod: z.string().optional().default(""),
        receiptNumber: z.string().optional().default(""),
        proof: z.string().optional().default(""),
        notes: z.string().optional().default(""),
      }).parse(req.body);
      ensureAiLogWorksheet();
      const rows = JSON.stringify([appLogRow({
        "Record Type": "Receipt Proof",
        "Customer Name": body.customerName,
        "Phone": body.phone,
        "City/Area": body.city,
        "Job Type": body.jobType,
        "Final Amount": body.amount,
        "Payment Method": body.paymentMethod,
        "Receipt Number": body.receiptNumber,
        "Photo/Proof": body.proof,
        "Notes": body.notes,
      })]);
      const result = callSheetsTool("google_sheets-add-rows", {
        spreadsheetId: CRM_SPREADSHEET_ID,
        sheetName: AI_LOG_SHEET_NAME,
        rows,
        hasHeaders: true,
      });
      res.json({ ok: true, result });
    } catch (err: any) {
      res.status(503).json({ message: "Could not log receipt to Google Sheets.", error: String(err?.message ?? err) });
    }
  });

  // ============ ADVANCED AI CHAT / BUILDER ============
  const aiChatSchema = z.object({
    message: z.string().min(1),
    history: z.array(z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string(),
    })).optional().default([]),
  });

  app.post("/api/ai-chat", async (req, res) => {
    try {
      const input = aiChatSchema.parse(req.body);
      const [settings, leads, jobs, estimates, receipts, memoryEvents, agents, invoices] = await Promise.all([
        storage.getSettings(),
        storage.listLeads(),
        storage.listJobs(),
        storage.listEstimates(),
        storage.listReceipts(),
        storage.listMemoryEvents(80),
        storage.listAgents(),
        storage.listInvoices(),
      ]);

      let sheetContext: any = { connected: false };
      try {
        const preview = callSheetsTool("google_sheets-read-rows", {
          spreadsheetId: CRM_SPREADSHEET_ID,
          sheetName: CRM_SHEET_NAME,
          range: "A1:W50",
          hasHeaders: true,
        });
        const jobPreview = callSheetsTool("google_sheets-read-rows", {
          spreadsheetId: CRM_SPREADSHEET_ID,
          sheetName: JOB_ENTRY_SHEET_NAME,
          range: "A1:O50",
          hasHeaders: true,
        });
        sheetContext = {
          connected: true,
          spreadsheetName: CRM_SPREADSHEET_NAME,
          crmRows: preview.rows?.slice(0, 12) ?? [],
          jobRows: jobPreview.rows?.slice(0, 12) ?? [],
          crmRowCount: preview.rowCount ?? 0,
          jobRowCount: jobPreview.rowCount ?? 0,
        };
      } catch (err: any) {
        sheetContext = { connected: false, error: String(err?.message ?? err) };
      }

      const openLeads = leads.filter(l => ["new", "quote_sent", "follow_up"].includes(l.stage));
      const dueFollowUps = openLeads.filter(l => !l.nextActionDate || l.nextActionDate <= new Date().toISOString().slice(0, 10));
      const context = {
        business: "Clean Plate Hauling Co, junk removal in Wixom / Southeast Michigan",
        currentTime: new Date().toISOString(),
        settings,
        appData: {
          leads: leads.slice(0, 20),
          jobs: jobs.slice(0, 20),
          estimates: estimates.slice(0, 12),
          receipts: receipts.slice(0, 8),
          memoryEvents: memoryEvents.slice(0, 12),
          agents: agents.slice(0, 8),
          invoices: invoices.slice(0, 8),
          openLeadCount: openLeads.length,
          dueFollowUpCount: dueFollowUps.length,
        },
        googleSheets: sheetContext,
        rules: [
          "Act like an advanced AI operator inside this app.",
          "Help the owner improve pricing, follow-ups, receipts/proof, CRM hygiene, and app features.",
          "Do not claim you changed code unless asked and routed through the builder outside the app.",
          "You may propose Builder Mode changes as specific tickets, screens, automations, or settings.",
          "If asked to build agents, only draft disabled agent definitions and owner-approved action plans.",
          "If asked to invoice or send email, draft invoice/email content and require invoice-specific owner approval before Gmail send.",
          "If asked for deep search, recommend using Deep Search mode or summarize what should be searched live.",
          "Never say you sent texts, emails, or changed the Google Sheet unless the user used a dedicated button.",
          "Keep answers tactical, confident, and junk-removal specific.",
        ],
      };

      const transcript = input.history.slice(-10).map(m => `${m.role.toUpperCase()}: ${m.content}`).join("\n\n");
      const prompt = [
        `Business/app context JSON:\n${JSON.stringify(context).slice(0, 24000)}`,
        transcript ? `Recent chat:\n${transcript}` : "",
        `Current user message:\n${input.message}`,
      ].filter(Boolean).join("\n\n---\n\n");

      const response = await getOpenAI().responses.create({
        model: "gpt_5_4",
        instructions: `You are Clean Plate AI Builder, an advanced operations and product-building AI embedded inside a junk removal business app. Respond like a sharp human business operator and product builder, not like a generic chatbot. Use plain English, short sections, clean bullets, and direct next steps. Make the response easy to scan on a phone. You are a cofounder-style dispatcher, pricing analyst, CRM cleaner, app builder, and invoice assistant. You can reason from live app data and Google Sheets summaries provided in context. You cannot directly redeploy code from this chat, but you can create very specific app improvements and safe action plans. If the user asks to make the app build itself, explain Builder Mode: you draft exact changes, settings, automations, and app specs that can be approved and implemented. Do not create recurring schedules unless the owner explicitly asks again. Keep answers tactical, confident, concise, conversational, and junk-removal specific.`,
        input: prompt,
      });

      const answer = (response as any).output_text
        || (response as any).output?.map((o: any) => o.content?.map((c: any) => c.text).join(" ")).join("\n")
        || "I could not generate a response this time.";
      const shouldDraft = /build|agent|invoice|gmail|send|change|fix|add|create|sync|clean|pricing|setting|workflow|feature/i.test(input.message);
      const draftedActions = [];
      if (shouldDraft) {
        const builderContext = await getBuilderLiveContext(input.message);
        for (const draft of draftBuilderActions(input.message, builderContext)) {
          draftedActions.push(await storage.createBuilderAction({
            title: draft.title,
            toolName: draft.toolName,
            riskLevel: draft.riskLevel,
            status: draft.approvalRequired && draft.riskLevel !== "low" ? "pending_approval" : "draft",
            mode: draft.mode,
            humanSummary: draft.humanSummary,
            input: draft.input,
            preview: draft.preview,
            rollback: draft.rollback,
            approvalRequired: draft.approvalRequired,
          }));
        }
      }
      await storage.createMemoryEvent({
        memoryLayer: /build|agent|feature|app/i.test(input.message) ? "app_improvement" : "recent",
        category: "ai_chat",
        title: input.message.slice(0, 120),
        summary: answer.slice(0, 1000),
        entityType: "chat",
        entityId: null,
        customerName: null,
        importance: shouldDraft ? 4 : 2,
        evidenceJson: JSON.stringify({ sheetsConnected: sheetContext.connected, draftedActionCount: draftedActions.length }),
      } as any);
      res.json({ answer, model: "gpt_5_4", sheetsConnected: sheetContext.connected, draftedActions });
    } catch (err: any) {
      res.status(500).json({
        message: "Advanced AI chat is not available yet.",
        error: String(err?.message ?? err),
        fallback: "The app can still use the rules-based AI Brain, photo quote, receipts, and Google Sheets tools.",
      });
    }
  });

  // ============ RECEIPTS / PROOF ============
  app.get("/api/receipts", async (_req, res) => {
    res.json(await storage.listReceipts());
  });
  app.post("/api/receipts", async (req, res) => {
    const data = insertReceiptSchema.parse(req.body);
    res.json(await storage.createReceipt(data));
  });

  // ============ INVOICES ============
  function invoiceEmail(invoice: any) {
    const lines = (invoice.lineItems ?? []).map((item: any) => {
      const qty = Number(item.quantity ?? 1);
      const unit = Number(item.unitPrice ?? item.amount ?? 0);
      return `- ${item.description || "Junk removal service"}: ${qty} x ${moneyCell(unit)} = ${moneyCell(qty * unit)}`;
    }).join("\n");
    const subject = invoice.emailSubject || `Invoice ${invoice.invoiceNumber} from Clean Plate Hauling Co`;
    const body = invoice.emailBody || [
      `Hi ${invoice.customerName},`,
      "",
      "Thank you for choosing Clean Plate Hauling Co. Here is your invoice summary:",
      "",
      `Invoice: ${invoice.invoiceNumber}`,
      lines,
      `Total due: ${moneyCell(invoice.total)}`,
      invoice.dueDate ? `Due date: ${invoice.dueDate}` : "",
      invoice.notes ? `Notes: ${invoice.notes}` : "",
      "",
      "You can reply directly to this email with any questions.",
      "",
      "Clean Plate Hauling Co",
    ].filter(Boolean).join("\n");
    return { subject, body };
  }

  const invoiceCreateSchema = z.object({
    customerName: z.string().min(1),
    email: z.string().email().optional().or(z.literal("")).default(""),
    phone: z.string().optional().default(""),
    address: z.string().optional().default(""),
    city: z.string().optional().default(""),
    jobId: z.number().nullable().optional(),
    lineItems: z.array(z.object({
      description: z.string().min(1),
      quantity: z.number().default(1),
      unitPrice: z.number().default(0),
    })).min(1),
    tax: z.number().default(0),
    dueDate: z.string().optional().default(""),
    notes: z.string().optional().default(""),
  });

  app.get("/api/invoices", async (_req, res) => {
    res.json(await storage.listInvoices());
  });

  app.post("/api/invoices", async (req, res) => {
    const input = invoiceCreateSchema.parse(req.body);
    const subtotal = input.lineItems.reduce((sum, item) => sum + Number(item.quantity ?? 1) * Number(item.unitPrice ?? 0), 0);
    const total = subtotal + Number(input.tax ?? 0);
    const invoice = await storage.createInvoice({
      customerName: input.customerName,
      email: input.email || null,
      phone: input.phone || null,
      address: input.address || null,
      city: input.city || null,
      jobId: input.jobId ?? null,
      status: "draft",
      lineItemsJson: JSON.stringify(input.lineItems),
      subtotal,
      tax: input.tax,
      total,
      dueDate: input.dueDate || null,
      notes: input.notes || null,
      emailSubject: null,
      emailBody: null,
    } as any);
    const email = invoiceEmail(invoice);
    const updated = await storage.updateInvoice(invoice.id, { emailSubject: email.subject, emailBody: email.body } as any);
    await storage.createMemoryEvent({
      memoryLayer: "app_improvement",
      category: "invoice_created",
      title: `Invoice draft ${invoice.invoiceNumber}`,
      summary: `Created a draft invoice for ${input.customerName} totaling ${moneyCell(total)}. It has not been emailed.`,
      entityType: "invoice",
      entityId: String(invoice.id),
      customerName: input.customerName,
      importance: 3,
      evidenceJson: JSON.stringify({ invoiceNumber: invoice.invoiceNumber, total, email: input.email }),
    } as any);
    res.json(updated);
  });

  app.post("/api/invoices/:id/approve-send", async (req, res) => {
    const id = Number(req.params.id);
    const invoice = await storage.getInvoice(id);
    if (!invoice) return res.status(404).json({ message: "Invoice not found" });
    if (!invoice.email) return res.status(400).json({ message: "Add a customer email before approving send." });
    const updated = await storage.updateInvoice(id, { status: "pending_approval" } as any);
    res.json({ ...updated, readyToSend: true, emailPreview: invoiceEmail(invoice) });
  });

  app.post("/api/invoices/:id/send-gmail", async (req, res) => {
    const id = Number(req.params.id);
    const invoice = await storage.getInvoice(id);
    if (!invoice) return res.status(404).json({ message: "Invoice not found" });
    if (invoice.status !== "pending_approval") return res.status(403).json({ message: "Approve this invoice send first." });
    if (!invoice.email) return res.status(400).json({ message: "Customer email is required." });
    const email = invoiceEmail(invoice);
    try {
      const result = callGmailTool("send_email", {
        action: {
          action: "send",
          to: [invoice.email],
          cc: [],
          bcc: [],
          subject: email.subject,
          body: email.body,
          in_reply_to: null,
        },
        attachment_files: [],
        user_prompt: null,
      });
      const updated = await storage.updateInvoice(id, { status: "sent", sentAt: new Date().toISOString() } as any);
      await storage.createMemoryEvent({
        memoryLayer: "customer",
        category: "invoice_sent",
        title: `Invoice sent to ${invoice.customerName}`,
        summary: `Sent invoice ${invoice.invoiceNumber} for ${moneyCell(invoice.total)} to ${invoice.email} through Gmail.`,
        entityType: "invoice",
        entityId: String(invoice.id),
        customerName: invoice.customerName,
        importance: 4,
        evidenceJson: JSON.stringify({ invoiceNumber: invoice.invoiceNumber, total: invoice.total, gmailResult: result }),
      } as any);
      res.json({ invoice: updated, gmail: result });
    } catch (err: any) {
      res.status(503).json({ message: "Gmail send failed. Reconnect Gmail if needed.", error: String(err?.message ?? err) });
    }
  });

  // ============ SETTINGS ============
  app.get("/api/settings", async (_req, res) => {
    res.json(await storage.getSettings());
  });
  app.patch("/api/settings", async (req, res) => {
    const data = insertSettingsSchema.partial().parse(req.body);
    res.json(await storage.updateSettings(data));
  });

  // ============ FOLLOW-UPS ============
  app.get("/api/follow-ups", async (_req, res) => {
    res.json(await storage.listFollowUps());
  });

  // ============ CSV EXPORT ============
  function toCsv(rows: Record<string, any>[]): string {
    if (rows.length === 0) return "";
    const keys = Object.keys(rows[0]);
    const escape = (v: any) => {
      if (v === null || v === undefined) return "";
      const s = String(v).replace(/"/g, '""');
      return /[",\n]/.test(s) ? `"${s}"` : s;
    };
    return [keys.join(","), ...rows.map(r => keys.map(k => escape(r[k])).join(","))].join("\n");
  }

  app.get("/api/export/leads.csv", async (_req, res) => {
    const rows = await storage.listLeads();
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", 'attachment; filename="cphc-leads.csv"');
    res.send(toCsv(rows as any));
  });
  app.get("/api/export/jobs.csv", async (_req, res) => {
    const rows = await storage.listJobs();
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", 'attachment; filename="cphc-jobs.csv"');
    res.send(toCsv(rows as any));
  });
  app.get("/api/export/estimates.csv", async (_req, res) => {
    const rows = await storage.listEstimates();
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", 'attachment; filename="cphc-estimates.csv"');
    res.send(toCsv(rows as any));
  });

  return httpServer;
}
