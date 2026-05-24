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
interface AchekConnectConfig {
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
interface SendOtpOptions {
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
interface SendOtpResult {
    requestId: string;
    expiresAt: string;
    message: string;
}
interface VerifyOtpResult {
    valid: boolean;
    message: string;
}
interface OtpLog {
    id: number;
    phoneNumber: string;
    status: "sent" | "verified" | "failed" | "expired";
    requestId: string;
    country: string | null;
    createdAt: string;
    expiresAt: string;
}
interface SendAlertOptions {
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
interface SendAlertResult {
    alertId: string;
    phoneNumber: string;
    status: "sent" | "failed";
    sentAt: string;
}
interface TransactionAlertOptions {
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
interface CreateTicketOptions {
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
interface Ticket {
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
interface UpdateTicketOptions {
    status?: Ticket["status"];
    priority?: Ticket["priority"];
    /** If true, send a WhatsApp update to the customer */
    notifyCustomer?: boolean;
    /** Custom update message */
    notificationMessage?: string;
}
interface BroadcastOptions {
    /** Display name for this broadcast */
    name: string;
    /** Message content (WhatsApp markdown supported) */
    message: string;
    /** List of E.164 phone numbers — max 1 000 */
    recipients: string[];
}
interface BroadcastResult {
    id: number;
    name: string;
    status: "sending" | "done" | "failed";
    total: number;
    sent?: number;
    failedCount?: number;
    createdAt: string;
}
interface SendEmailOptions {
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
interface SendEmailResult {
    messageId: string;
    to: string;
    status: "sent" | "failed";
}
declare class AchekConnectError extends Error {
    readonly statusCode: number;
    readonly code?: string | undefined;
    constructor(message: string, statusCode: number, code?: string | undefined);
    get isRateLimit(): boolean;
    get isServerError(): boolean;
    get isClientError(): boolean;
}
declare class HttpClient {
    private baseUrl;
    private apiKey;
    private timeout;
    private maxAttempts;
    private initialDelayMs;
    constructor(config: AchekConnectConfig);
    request<T>(method: string, path: string, body?: unknown, idempotencyKey?: string): Promise<T>;
    get<T>(path: string): Promise<T>;
    post<T>(path: string, body?: unknown, ik?: string): Promise<T>;
    put<T>(path: string, body?: unknown): Promise<T>;
    patch<T>(path: string, body?: unknown): Promise<T>;
    delete<T>(path: string): Promise<T>;
}
declare class OtpModule {
    private http;
    constructor(http: HttpClient);
    /**
     * Send a WhatsApp OTP to a phone number.
     * Returns a `requestId` you must store to verify the code later.
     */
    send(phoneNumberOrOptions: string | SendOtpOptions): Promise<SendOtpResult>;
    /**
     * Verify the OTP code entered by the user.
     * Returns `{ valid: true }` on success.
     */
    verify(requestId: string, code: string): Promise<VerifyOtpResult>;
    /** Fetch your OTP delivery log history. */
    logs(options?: {
        limit?: number;
        offset?: number;
        status?: OtpLog["status"];
    }): Promise<OtpLog[]>;
}
declare class AlertsModule {
    private http;
    constructor(http: HttpClient);
    /** Send a custom WhatsApp alert message to any phone number. */
    send(options: SendAlertOptions): Promise<SendAlertResult>;
    /**
     * Send a transaction alert with an auto-formatted WhatsApp message.
     * The message is clearly structured with emoji labels, bold amounts, and
     * a running balance — matching what Nigerian fintech customers expect.
     */
    transaction(options: TransactionAlertOptions): Promise<SendAlertResult>;
}
declare class TicketsModule {
    private http;
    constructor(http: HttpClient);
    /** Create a new support ticket. Optionally notifies the customer on WhatsApp. */
    create(options: CreateTicketOptions): Promise<Ticket>;
    /** List tickets, optionally filtered by status. */
    list(options?: {
        status?: Ticket["status"];
        limit?: number;
    }): Promise<Ticket[]>;
    /** Get a ticket by ID. */
    get(ticketId: string): Promise<Ticket>;
    /** Update a ticket's status or priority. Optionally notify the customer. */
    update(ticketId: string, options: UpdateTicketOptions): Promise<Ticket>;
    /** Convenience: resolve a ticket and send the customer a closing message. */
    resolve(ticketId: string, message?: string): Promise<Ticket>;
}
declare class BroadcastsModule {
    private http;
    constructor(http: HttpClient);
    /** Send a WhatsApp broadcast to up to 1 000 recipients. */
    send(options: BroadcastOptions): Promise<BroadcastResult>;
    /** List recent broadcasts. */
    list(): Promise<BroadcastResult[]>;
    /** Get the delivery status of a single broadcast. */
    status(id: number): Promise<BroadcastResult>;
}
declare class EmailModule {
    private http;
    constructor(http: HttpClient);
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
    send(options: SendEmailOptions): Promise<SendEmailResult>;
}
interface AchekWebhookEvent {
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
declare class AchekWebhookHelper {
    private secret;
    constructor(webhookSecret: string);
    /**
     * Verify the HMAC-SHA256 signature in `X-Achek-Signature`.
     * Uses `crypto.timingSafeEqual` to prevent timing attacks.
     */
    verify(signature: string, payload: string | Buffer): boolean;
    /** Parse the raw JSON body into a typed `AchekWebhookEvent`. */
    parse(body: string | Buffer): AchekWebhookEvent;
}
declare class AchekConnect {
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
    constructor(config: AchekConnectConfig);
}

export { AchekConnect, type AchekConnectConfig, AchekConnectError, type AchekWebhookEvent, AchekWebhookHelper, type BroadcastOptions, type BroadcastResult, type CreateTicketOptions, type OtpLog, type SendAlertOptions, type SendAlertResult, type SendEmailOptions, type SendEmailResult, type SendOtpOptions, type SendOtpResult, type Ticket, type TransactionAlertOptions, type UpdateTicketOptions, type VerifyOtpResult, AchekConnect as default };
