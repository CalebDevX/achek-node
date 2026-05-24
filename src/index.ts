/**
 * @achek/sdk — Official Node.js / TypeScript SDK
 * WhatsApp OTP, Alerts, Broadcasts, Tickets, Email & Webhook utilities
 *
 * npm install @achek/sdk
 *
 * @example
 * import AchekConnect from "@achek/sdk";
 * const client = new AchekConnect({ apiKey: "achek_live_xxx" });
 * const { requestId } = await client.otp.send("+2348XXXXXXXXX");
 * const { valid }     = await client.otp.verify(requestId, "847293");
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AchekConnectConfig {
  /** Your Achek Connect API key (starts with achek_) */
  apiKey: string;
  /** Override the base URL — defaults to https://api.achek.com.ng */
  baseUrl?: string;
  /** Request timeout in milliseconds — defaults to 15 000 */
  timeout?: number;
  /** Retry configuration */
  retry?: {
    /** Max total attempts (first try + retries). Default: 3 */
    maxAttempts?: number;
    /** Initial backoff delay in ms before the first retry. Default: 500 */
    initialDelayMs?: number;
  };
}

export interface SendOtpOptions {
  /** E.164 phone number e.g. "+2348XXXXXXXXX" */
  phoneNumber: string;
  /** Custom message with {{code}} placeholder (Growth+ plans only) */
  template?: string;
  /** Recipient name for template variable {{name}} */
  recipientName?: string;
  /** Company name for template variable {{company}} */
  companyName?: string;
  /** ID of a specific sender WhatsApp number (optional) */
  senderNumberId?: number;
  /** Idempotency key — reuse to safely retry without double-sending */
  idempotencyKey?: string;
}

export interface SendOtpResult {
  requestId: string;
  expiresAt: string;
  message: string;
}

export interface VerifyOtpResult {
  valid: boolean;
  message: string;
}

export interface OtpLog {
  id: number;
  phoneNumber: string;
  status: "sent" | "verified" | "failed" | "expired";
  requestId: string;
  country: string | null;
  createdAt: string;
  expiresAt: string;
}

export interface SendAlertOptions {
  /** E.164 phone number */
  phoneNumber: string;
  /** Message to send (plain text or WhatsApp markdown *bold*, _italic_) */
  message: string;
  /** Optional ticket ID this alert is linked to */
  ticketId?: string;
  /** Optional transaction reference */
  transactionRef?: string;
  /** Category for logging */
  category?: "alert" | "transaction" | "notification";
  /** Idempotency key */
  idempotencyKey?: string;
}

export interface SendAlertResult {
  alertId: string;
  phoneNumber: string;
  status: "sent" | "failed";
  sentAt: string;
}

export interface TransactionAlertOptions {
  /** E.164 phone number of the customer */
  phoneNumber: string;
  /** Transaction type */
  type: "credit" | "debit" | "transfer" | "reversal" | string;
  /** Amount in the currency unit (e.g. 5000 for ₦5,000) */
  amount: number;
  /** Currency code e.g. "NGN" */
  currency?: string;
  /** Customer or account name */
  accountName?: string;
  /** Transaction reference / ID */
  reference: string;
  /** Balance after transaction */
  balance?: number;
  /** Description / narration */
  description?: string;
}

export interface CreateTicketOptions {
  /** Customer's WhatsApp phone number (E.164) */
  phoneNumber: string;
  /** Ticket subject */
  subject: string;
  /** Initial description */
  description?: string;
  /** Priority level */
  priority?: "low" | "normal" | "high" | "urgent";
  /** Custom key-value metadata */
  metadata?: Record<string, string | number | boolean>;
  /** Send an opening WhatsApp message to the customer */
  notifyCustomer?: boolean;
  /** Custom notification message (default: system generated) */
  notificationMessage?: string;
}

export interface Ticket {
  ticketId: string;
  phoneNumber: string;
  subject: string;
  description?: string;
  status: "open" | "in_progress" | "resolved" | "closed";
  priority: "low" | "normal" | "high" | "urgent";
  metadata?: Record<string, string | number | boolean>;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateTicketOptions {
  status?: Ticket["status"];
  priority?: Ticket["priority"];
  /** If true, send a WhatsApp update to the customer */
  notifyCustomer?: boolean;
  /** Custom update message */
  notificationMessage?: string;
}

export interface BroadcastOptions {
  /** Display name for this broadcast */
  name: string;
  /** Message content (WhatsApp markdown supported) */
  message: string;
  /** List of E.164 phone numbers — max 1 000 */
  recipients: string[];
}

export interface BroadcastResult {
  id: number;
  name: string;
  status: "sending" | "done" | "failed";
  total: number;
  sent?: number;
  failedCount?: number;
  createdAt: string;
}

export interface SendEmailOptions {
  /** Recipient email address */
  to: string;
  /** Email subject line */
  subject: string;
  /** Plain-text body */
  text?: string;
  /** HTML body — takes precedence over text when both are supplied */
  html?: string;
  /** Sender display name override (configured in your Achek dashboard) */
  fromName?: string;
}

export interface SendEmailResult {
  messageId: string;
  to: string;
  status: "sent" | "failed";
}

export class AchekConnectError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "AchekConnectError";
  }

  get isRateLimit()   { return this.statusCode === 429; }
  get isServerError() { return this.statusCode >= 500; }
  get isClientError() { return this.statusCode >= 400 && this.statusCode < 500; }
}

// ─── HTTP Client with retry + idempotency ────────────────────────────────────

const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

class HttpClient {
  private baseUrl: string;
  private apiKey: string;
  private timeout: number;
  private maxAttempts: number;
  private initialDelayMs: number;

  constructor(config: AchekConnectConfig) {
    this.baseUrl        = (config.baseUrl ?? "https://api.achek.com.ng").replace(/\/$/, "");
    this.apiKey         = config.apiKey;
    this.timeout        = config.timeout ?? 15_000;
    this.maxAttempts    = config.retry?.maxAttempts    ?? 3;
    this.initialDelayMs = config.retry?.initialDelayMs ?? 500;
  }

  async request<T>(
    method: string,
    path: string,
    body?: unknown,
    idempotencyKey?: string,
  ): Promise<T> {
    let attempt = 0;
    let lastError: AchekConnectError | undefined;

    while (attempt < this.maxAttempts) {
      attempt++;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeout);

      try {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          "X-API-Key": this.apiKey,
          "User-Agent": "@achek/sdk/2.0.0 node",
        };
        if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;

        const res = await fetch(`${this.baseUrl}/api${path}`, {
          method,
          signal: controller.signal,
          headers,
          body: body !== undefined ? JSON.stringify(body) : undefined,
        });

        const data = await res.json() as any;

        if (!res.ok) {
          const err = new AchekConnectError(
            data?.error ?? `Request failed with status ${res.status}`,
            res.status,
            data?.code,
          );
          if (!RETRYABLE_STATUSES.has(res.status) || attempt >= this.maxAttempts) throw err;
          lastError = err;
        } else {
          return data as T;
        }
      } catch (err: any) {
        if (err instanceof AchekConnectError) throw err;
        if (err.name === "AbortError") throw new AchekConnectError("Request timed out", 408);
        lastError = new AchekConnectError(err.message ?? "Network error", 0);
        if (attempt >= this.maxAttempts) throw lastError;
      } finally {
        clearTimeout(timer);
      }

      // Exponential backoff: 500 ms, 1 000 ms, 2 000 ms …
      const delay = this.initialDelayMs * Math.pow(2, attempt - 1);
      await new Promise(r => setTimeout(r, delay));
    }

    throw lastError ?? new AchekConnectError("Max retries exceeded", 0);
  }

  get<T>(path: string)                                    { return this.request<T>("GET", path); }
  post<T>(path: string, body?: unknown, ik?: string)      { return this.request<T>("POST",   path, body, ik); }
  put<T>(path: string, body?: unknown)                    { return this.request<T>("PUT",    path, body); }
  patch<T>(path: string, body?: unknown)                  { return this.request<T>("PATCH",  path, body); }
  delete<T>(path: string)                                 { return this.request<T>("DELETE", path); }
}

// ─── OTP Module ───────────────────────────────────────────────────────────────

class OtpModule {
  constructor(private http: HttpClient) {}

  /**
   * Send a WhatsApp OTP to a phone number.
   * Returns a `requestId` you must store to verify the code later.
   */
  send(phoneNumberOrOptions: string | SendOtpOptions): Promise<SendOtpResult> {
    if (typeof phoneNumberOrOptions === "string") {
      return this.http.post<SendOtpResult>("/otp/send", { phoneNumber: phoneNumberOrOptions });
    }
    const { idempotencyKey, ...body } = phoneNumberOrOptions;
    return this.http.post<SendOtpResult>("/otp/send", body, idempotencyKey);
  }

  /**
   * Verify the OTP code entered by the user.
   * Returns `{ valid: true }` on success.
   */
  verify(requestId: string, code: string): Promise<VerifyOtpResult> {
    return this.http.post<VerifyOtpResult>("/otp/verify", { requestId, code });
  }

  /** Fetch your OTP delivery log history. */
  logs(options?: { limit?: number; offset?: number; status?: OtpLog["status"] }): Promise<OtpLog[]> {
    const p = new URLSearchParams();
    if (options?.limit)  p.set("limit",  String(options.limit));
    if (options?.offset) p.set("offset", String(options.offset));
    if (options?.status) p.set("status", options.status);
    const qs = p.toString();
    return this.http.get<OtpLog[]>(`/otp/logs${qs ? "?" + qs : ""}`);
  }
}

// ─── Alerts Module ────────────────────────────────────────────────────────────

class AlertsModule {
  constructor(private http: HttpClient) {}

  /** Send a custom WhatsApp alert message to any phone number. */
  send(options: SendAlertOptions): Promise<SendAlertResult> {
    const { idempotencyKey, ...body } = options;
    return this.http.post<SendAlertResult>("/alerts/send", body, idempotencyKey);
  }

  /**
   * Send a transaction alert with an auto-formatted WhatsApp message.
   * The message is clearly structured with emoji labels, bold amounts, and
   * a running balance — matching what Nigerian fintech customers expect.
   */
  transaction(options: TransactionAlertOptions): Promise<SendAlertResult> {
    const currency = options.currency ?? "NGN";
    const symbol   = currency === "NGN" ? "₦" : `${currency} `;
    const fmt      = (n: number) => n.toLocaleString("en-NG", { minimumFractionDigits: 2 });
    const typeLabel: Record<string, string> = {
      credit: "💰 Credit Alert", debit: "💸 Debit Alert",
      transfer: "🔄 Transfer Alert", reversal: "↩️ Reversal Alert",
    };
    const lines = [
      `*${typeLabel[options.type] ?? `📋 ${options.type} Alert`}*`, "",
      `Amount: *${symbol}${fmt(options.amount)}*`,
      options.accountName ? `Account: ${options.accountName}` : null,
      `Ref: \`${options.reference}\``,
      options.description ? `Narration: ${options.description}` : null,
      options.balance !== undefined ? `Balance: *${symbol}${fmt(options.balance)}*` : null,
      "", "_Powered by Achek Connect_",
    ].filter(Boolean).join("\n");

    return this.http.post<SendAlertResult>("/alerts/send", {
      phoneNumber: options.phoneNumber,
      message: lines,
      transactionRef: options.reference,
      category: "transaction",
    });
  }
}

// ─── Tickets Module ───────────────────────────────────────────────────────────

class TicketsModule {
  constructor(private http: HttpClient) {}

  /** Create a new support ticket. Optionally notifies the customer on WhatsApp. */
  create(options: CreateTicketOptions): Promise<Ticket> {
    return this.http.post<Ticket>("/tickets", options);
  }

  /** List tickets, optionally filtered by status. */
  list(options?: { status?: Ticket["status"]; limit?: number }): Promise<Ticket[]> {
    const p = new URLSearchParams();
    if (options?.status) p.set("status", options.status);
    if (options?.limit)  p.set("limit",  String(options.limit));
    const qs = p.toString();
    return this.http.get<Ticket[]>(`/tickets${qs ? "?" + qs : ""}`);
  }

  /** Get a ticket by ID. */
  get(ticketId: string): Promise<Ticket> {
    return this.http.get<Ticket>(`/tickets/${ticketId}`);
  }

  /** Update a ticket's status or priority. Optionally notify the customer. */
  update(ticketId: string, options: UpdateTicketOptions): Promise<Ticket> {
    return this.http.patch<Ticket>(`/tickets/${ticketId}`, options);
  }

  /** Convenience: resolve a ticket and send the customer a closing message. */
  resolve(ticketId: string, message?: string): Promise<Ticket> {
    return this.update(ticketId, {
      status: "resolved",
      notifyCustomer: true,
      notificationMessage: message,
    });
  }
}

// ─── Broadcasts Module ────────────────────────────────────────────────────────

class BroadcastsModule {
  constructor(private http: HttpClient) {}

  /** Send a WhatsApp broadcast to up to 1 000 recipients. */
  send(options: BroadcastOptions): Promise<BroadcastResult> {
    return this.http.post<BroadcastResult>("/broadcasts", options);
  }

  /** List recent broadcasts. */
  list(): Promise<BroadcastResult[]> {
    return this.http.get<BroadcastResult[]>("/broadcasts");
  }

  /** Get the delivery status of a single broadcast. */
  status(id: number): Promise<BroadcastResult> {
    return this.http.get<BroadcastResult>(`/broadcasts/${id}`);
  }
}

// ─── Email Module ─────────────────────────────────────────────────────────────

class EmailModule {
  constructor(private http: HttpClient) {}

  /**
   * Send a transactional email via Achek's configured SMTP.
   * The sender address and domain are configured in your Achek dashboard.
   *
   * @example
   * await client.email.send({
   *   to: "customer@example.com",
   *   subject: "Your OTP code",
   *   html: "<p>Your code is <strong>847293</strong></p>",
   * });
   */
  send(options: SendEmailOptions): Promise<SendEmailResult> {
    return this.http.post<SendEmailResult>("/email/send", options);
  }
}

// ─── Webhook Helper ───────────────────────────────────────────────────────────

export interface AchekWebhookEvent {
  event: string;
  timestamp: string;
  [key: string]: unknown;
}

/**
 * Helpers for verifying and parsing incoming Achek webhook deliveries.
 *
 * Achek signs every webhook payload with HMAC-SHA256 using your webhook secret.
 * The signature is sent in the `X-Achek-Signature` header as `sha256=<hex>`.
 *
 * @example
 * import { AchekWebhookHelper } from "@achek/sdk";
 *
 * const wh = new AchekWebhookHelper(process.env.ACHEK_WEBHOOK_SECRET!);
 *
 * app.post("/webhook", express.raw({ type: "*\/*" }), (req, res) => {
 *   const sig = req.headers["x-achek-signature"] as string;
 *   if (!wh.verify(sig, req.body)) return res.status(400).send("Bad signature");
 *   const event = wh.parse(req.body);
 *   console.log(event.event); // e.g. "otp.verified", "handoff.requested" …
 *   res.sendStatus(200);
 * });
 */
export class AchekWebhookHelper {
  private secret: string;

  constructor(webhookSecret: string) {
    if (!webhookSecret) throw new Error("webhookSecret is required");
    this.secret = webhookSecret;
  }

  /**
   * Verify the HMAC-SHA256 signature in `X-Achek-Signature`.
   * Uses `crypto.timingSafeEqual` to prevent timing attacks.
   */
  verify(signature: string, payload: string | Buffer): boolean {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const crypto = require("crypto") as typeof import("crypto");
      const expected = crypto
        .createHmac("sha256", this.secret)
        .update(typeof payload === "string" ? Buffer.from(payload, "utf8") : payload)
        .digest("hex");
      const sig = signature.replace(/^sha256=/, "");
      const a = Buffer.from(sig,      "hex");
      const b = Buffer.from(expected, "hex");
      if (a.length !== b.length) return false;
      return crypto.timingSafeEqual(a, b);
    } catch {
      return false;
    }
  }

  /** Parse the raw JSON body into a typed `AchekWebhookEvent`. */
  parse(body: string | Buffer): AchekWebhookEvent {
    const raw = typeof body === "string" ? body : body.toString("utf8");
    return JSON.parse(raw) as AchekWebhookEvent;
  }
}

// ─── Main Client ──────────────────────────────────────────────────────────────

export class AchekConnect {
  /** OTP sending and verification */
  readonly otp: OtpModule;
  /** Custom alerts and transaction notifications */
  readonly alerts: AlertsModule;
  /** Support ticket management with WhatsApp updates */
  readonly tickets: TicketsModule;
  /** Broadcast messages to multiple recipients */
  readonly broadcasts: BroadcastsModule;
  /** Transactional email delivery */
  readonly email: EmailModule;

  constructor(config: AchekConnectConfig) {
    if (!config.apiKey) throw new Error("apiKey is required");
    const http      = new HttpClient(config);
    this.otp        = new OtpModule(http);
    this.alerts     = new AlertsModule(http);
    this.tickets    = new TicketsModule(http);
    this.broadcasts = new BroadcastsModule(http);
    this.email      = new EmailModule(http);
  }
}

export default AchekConnect;
