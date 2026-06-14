import "dotenv/config";
import express, { Response, NextFunction } from 'express';
import type { Request } from 'express';
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "node:http";
import { randomUUID, timingSafeEqual } from "node:crypto";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

function safeCompare(a: string, b: string) {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);
  if (aBuffer.length !== bBuffer.length) return false;
  return timingSafeEqual(aBuffer, bBuffer);
}

const appLoginPassword = process.env.APP_LOGIN_PASSWORD || "";
const appLoginRequired = Boolean(appLoginPassword);
const appAccessTokens = new Map<string, { createdAt: number; expiresAt: number }>();
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const ACCESS_TOKEN_TTL_MS = Number(process.env.APP_ACCESS_TOKEN_TTL_MINUTES || 720) * 60 * 1000;

function cleanupAuthState() {
  const now = Date.now();
  for (const [token, session] of Array.from(appAccessTokens.entries())) {
    if (session.expiresAt <= now) appAccessTokens.delete(token);
  }
  for (const [key, attempt] of Array.from(loginAttempts.entries())) {
    if (attempt.resetAt <= now) loginAttempts.delete(key);
  }
}

app.get("/api/healthz", (_req, res) => {
  res.json({
    ok: true,
    service: "clean-plate-command-center",
    environment: process.env.NODE_ENV || "development",
    timestamp: new Date().toISOString(),
  });
});

app.get("/api/auth/status", (_req, res) => {
  res.json({
    loginRequired: appLoginRequired,
    ttlMinutes: ACCESS_TOKEN_TTL_MS / 60_000,
    protected: appLoginRequired || Boolean(process.env.APP_BASIC_AUTH_USER && process.env.APP_BASIC_AUTH_PASSWORD),
  });
});

app.post("/api/auth/login", (req, res) => {
  cleanupAuthState();
  if (!appLoginRequired) return res.json({ ok: true, token: null, loginRequired: false });

  const ip = String(req.ip || req.headers["x-forwarded-for"] || "unknown");
  const attempt = loginAttempts.get(ip) || { count: 0, resetAt: Date.now() + 15 * 60 * 1000 };
  if (attempt.count >= 8 && attempt.resetAt > Date.now()) {
    return res.status(429).json({ message: "Too many login attempts. Wait a few minutes and try again." });
  }

  const suppliedPassword = String(req.body?.password || "");
  if (!safeCompare(suppliedPassword, appLoginPassword)) {
    loginAttempts.set(ip, { count: attempt.count + 1, resetAt: attempt.resetAt });
    return res.status(401).json({ message: "Invalid owner password." });
  }

  loginAttempts.delete(ip);
  const token = randomUUID();
  appAccessTokens.set(token, { createdAt: Date.now(), expiresAt: Date.now() + ACCESS_TOKEN_TTL_MS });
  return res.json({ ok: true, token, expiresAt: new Date(Date.now() + ACCESS_TOKEN_TTL_MS).toISOString() });
});

app.post("/api/auth/logout", (req, res) => {
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (token) appAccessTokens.delete(token);
  res.json({ ok: true });
});

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
});

app.use((req, res, next) => {
  const username = process.env.APP_BASIC_AUTH_USER;
  const password = process.env.APP_BASIC_AUTH_PASSWORD;
  if (!username || !password || req.path === "/api/healthz") return next();

  const authHeader = req.headers.authorization || "";
  const [scheme, encoded] = authHeader.split(" ");
  if (scheme !== "Basic" || !encoded) {
    res.setHeader("WWW-Authenticate", 'Basic realm="Clean Plate Command Center"');
    return res.status(401).send("Authentication required");
  }

  const decoded = Buffer.from(encoded, "base64").toString("utf8");
  const separatorIndex = decoded.indexOf(":");
  const suppliedUser = decoded.slice(0, separatorIndex);
  const suppliedPassword = decoded.slice(separatorIndex + 1);

  if (!safeCompare(suppliedUser, username) || !safeCompare(suppliedPassword, password)) {
    res.setHeader("WWW-Authenticate", 'Basic realm="Clean Plate Command Center"');
    return res.status(401).send("Authentication required");
  }

  return next();
});

app.use((req, res, next) => {
  if (!appLoginRequired || !req.path.startsWith("/api")) return next();
  if (["/api/healthz", "/api/auth/status", "/api/auth/login"].includes(req.path)) return next();
  cleanupAuthState();
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const session = token ? appAccessTokens.get(token) : null;
  if (!session || session.expiresAt <= Date.now()) {
    if (token) appAccessTokens.delete(token);
    return res.status(401).json({ message: "Owner login required." });
  }
  return next();
});

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();
