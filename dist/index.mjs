var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});

// src/index.ts
var AchekConnectError = class extends Error {
  constructor(message, statusCode, code) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.name = "AchekConnectError";
  }
  statusCode;
  code;
  get isRateLimit() {
    return this.statusCode === 429;
  }
  get isServerError() {
    return this.statusCode >= 500;
  }
  get isClientError() {
    return this.statusCode >= 400 && this.statusCode < 500;
  }
};
var RETRYABLE_STATUSES = /* @__PURE__ */ new Set([429, 500, 502, 503, 504]);
var HttpClient = class {
  baseUrl;
  apiKey;
  timeout;
  maxAttempts;
  initialDelayMs;
  constructor(config) {
    this.baseUrl = (config.baseUrl ?? "https://api.achek.com.ng").replace(/\/$/, "");
    this.apiKey = config.apiKey;
    this.timeout = config.timeout ?? 15e3;
    this.maxAttempts = config.retry?.maxAttempts ?? 3;
    this.initialDelayMs = config.retry?.initialDelayMs ?? 500;
  }
  async request(method, path, body, idempotencyKey) {
    let attempt = 0;
    let lastError;
    while (attempt < this.maxAttempts) {
      attempt++;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeout);
      try {
        const headers = {
          "Content-Type": "application/json",
          "X-API-Key": this.apiKey,
          "User-Agent": "@achek/sdk/2.0.0 node"
        };
        if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
        const res = await fetch(`${this.baseUrl}/api${path}`, {
          method,
          signal: controller.signal,
          headers,
          body: body !== void 0 ? JSON.stringify(body) : void 0
        });
        const data = await res.json();
        if (!res.ok) {
          const err = new AchekConnectError(
            data?.error ?? `Request failed with status ${res.status}`,
            res.status,
            data?.code
          );
          if (!RETRYABLE_STATUSES.has(res.status) || attempt >= this.maxAttempts) throw err;
          lastError = err;
        } else {
          return data;
        }
      } catch (err) {
        if (err instanceof AchekConnectError) throw err;
        if (err.name === "AbortError") throw new AchekConnectError("Request timed out", 408);
        lastError = new AchekConnectError(err.message ?? "Network error", 0);
        if (attempt >= this.maxAttempts) throw lastError;
      } finally {
        clearTimeout(timer);
      }
      const delay = this.initialDelayMs * Math.pow(2, attempt - 1);
      await new Promise((r) => setTimeout(r, delay));
    }
    throw lastError ?? new AchekConnectError("Max retries exceeded", 0);
  }
  get(path) {
    return this.request("GET", path);
  }
  post(path, body, ik) {
    return this.request("POST", path, body, ik);
  }
  put(path, body) {
    return this.request("PUT", path, body);
  }
  patch(path, body) {
    return this.request("PATCH", path, body);
  }
  delete(path) {
    return this.request("DELETE", path);
  }
};
var OtpModule = class {
  constructor(http) {
    this.http = http;
  }
  http;
  /**
   * Send a WhatsApp OTP to a phone number.
   * Returns a `requestId` you must store to verify the code later.
   */
  send(phoneNumberOrOptions) {
    if (typeof phoneNumberOrOptions === "string") {
      return this.http.post("/otp/send", { phoneNumber: phoneNumberOrOptions });
    }
    const { idempotencyKey, ...body } = phoneNumberOrOptions;
    return this.http.post("/otp/send", body, idempotencyKey);
  }
  /**
   * Verify the OTP code entered by the user.
   * Returns `{ valid: true }` on success.
   */
  verify(requestId, code) {
    return this.http.post("/otp/verify", { requestId, code });
  }
  /** Fetch your OTP delivery log history. */
  logs(options) {
    const p = new URLSearchParams();
    if (options?.limit) p.set("limit", String(options.limit));
    if (options?.offset) p.set("offset", String(options.offset));
    if (options?.status) p.set("status", options.status);
    const qs = p.toString();
    return this.http.get(`/otp/logs${qs ? "?" + qs : ""}`);
  }
};
var AlertsModule = class {
  constructor(http) {
    this.http = http;
  }
  http;
  /** Send a custom WhatsApp alert message to any phone number. */
  send(options) {
    const { idempotencyKey, ...body } = options;
    return this.http.post("/alerts/send", body, idempotencyKey);
  }
  /**
   * Send a transaction alert with an auto-formatted WhatsApp message.
   * The message is clearly structured with emoji labels, bold amounts, and
   * a running balance — matching what Nigerian fintech customers expect.
   */
  transaction(options) {
    const currency = options.currency ?? "NGN";
    const symbol = currency === "NGN" ? "\u20A6" : `${currency} `;
    const fmt = (n) => n.toLocaleString("en-NG", { minimumFractionDigits: 2 });
    const typeLabel = {
      credit: "\u{1F4B0} Credit Alert",
      debit: "\u{1F4B8} Debit Alert",
      transfer: "\u{1F504} Transfer Alert",
      reversal: "\u21A9\uFE0F Reversal Alert"
    };
    const lines = [
      `*${typeLabel[options.type] ?? `\u{1F4CB} ${options.type} Alert`}*`,
      "",
      `Amount: *${symbol}${fmt(options.amount)}*`,
      options.accountName ? `Account: ${options.accountName}` : null,
      `Ref: \`${options.reference}\``,
      options.description ? `Narration: ${options.description}` : null,
      options.balance !== void 0 ? `Balance: *${symbol}${fmt(options.balance)}*` : null,
      "",
      "_Powered by Achek Connect_"
    ].filter(Boolean).join("\n");
    return this.http.post("/alerts/send", {
      phoneNumber: options.phoneNumber,
      message: lines,
      transactionRef: options.reference,
      category: "transaction"
    });
  }
};
var TicketsModule = class {
  constructor(http) {
    this.http = http;
  }
  http;
  /** Create a new support ticket. Optionally notifies the customer on WhatsApp. */
  create(options) {
    return this.http.post("/tickets", options);
  }
  /** List tickets, optionally filtered by status. */
  list(options) {
    const p = new URLSearchParams();
    if (options?.status) p.set("status", options.status);
    if (options?.limit) p.set("limit", String(options.limit));
    const qs = p.toString();
    return this.http.get(`/tickets${qs ? "?" + qs : ""}`);
  }
  /** Get a ticket by ID. */
  get(ticketId) {
    return this.http.get(`/tickets/${ticketId}`);
  }
  /** Update a ticket's status or priority. Optionally notify the customer. */
  update(ticketId, options) {
    return this.http.patch(`/tickets/${ticketId}`, options);
  }
  /** Convenience: resolve a ticket and send the customer a closing message. */
  resolve(ticketId, message) {
    return this.update(ticketId, {
      status: "resolved",
      notifyCustomer: true,
      notificationMessage: message
    });
  }
};
var BroadcastsModule = class {
  constructor(http) {
    this.http = http;
  }
  http;
  /** Send a WhatsApp broadcast to up to 1 000 recipients. */
  send(options) {
    return this.http.post("/broadcasts", options);
  }
  /** List recent broadcasts. */
  list() {
    return this.http.get("/broadcasts");
  }
  /** Get the delivery status of a single broadcast. */
  status(id) {
    return this.http.get(`/broadcasts/${id}`);
  }
};
var EmailModule = class {
  constructor(http) {
    this.http = http;
  }
  http;
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
  send(options) {
    return this.http.post("/email/send", options);
  }
};
var AchekWebhookHelper = class {
  secret;
  constructor(webhookSecret) {
    if (!webhookSecret) throw new Error("webhookSecret is required");
    this.secret = webhookSecret;
  }
  /**
   * Verify the HMAC-SHA256 signature in `X-Achek-Signature`.
   * Uses `crypto.timingSafeEqual` to prevent timing attacks.
   */
  verify(signature, payload) {
    try {
      const crypto = __require("crypto");
      const expected = crypto.createHmac("sha256", this.secret).update(typeof payload === "string" ? Buffer.from(payload, "utf8") : payload).digest("hex");
      const sig = signature.replace(/^sha256=/, "");
      const a = Buffer.from(sig, "hex");
      const b = Buffer.from(expected, "hex");
      if (a.length !== b.length) return false;
      return crypto.timingSafeEqual(a, b);
    } catch {
      return false;
    }
  }
  /** Parse the raw JSON body into a typed `AchekWebhookEvent`. */
  parse(body) {
    const raw = typeof body === "string" ? body : body.toString("utf8");
    return JSON.parse(raw);
  }
};
var AchekConnect = class {
  /** OTP sending and verification */
  otp;
  /** Custom alerts and transaction notifications */
  alerts;
  /** Support ticket management with WhatsApp updates */
  tickets;
  /** Broadcast messages to multiple recipients */
  broadcasts;
  /** Transactional email delivery */
  email;
  constructor(config) {
    if (!config.apiKey) throw new Error("apiKey is required");
    const http = new HttpClient(config);
    this.otp = new OtpModule(http);
    this.alerts = new AlertsModule(http);
    this.tickets = new TicketsModule(http);
    this.broadcasts = new BroadcastsModule(http);
    this.email = new EmailModule(http);
  }
};
var index_default = AchekConnect;
export {
  AchekConnect,
  AchekConnectError,
  AchekWebhookHelper,
  index_default as default
};
