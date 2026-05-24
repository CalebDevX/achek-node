# achek — Node.js / TypeScript SDK

Official TypeScript/JavaScript SDK for [Achek](https://achek.com.ng) — WhatsApp OTP, automated alerts, transaction notifications, broadcasts, support ticket tracking, transactional email, and webhook utilities for Nigeria and Africa.

[![npm](https://img.shields.io/npm/v/achek)](https://www.npmjs.com/package/achek)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

## Install

```bash
npm install achek
# or
yarn add achek
# or
pnpm add achek
```

## Quick Start

```typescript
import AchekConnect from "achek";

const client = new AchekConnect({ apiKey: "your_api_key" });

// Send WhatsApp OTP
const { requestId } = await client.otp.send("+2348012345678");

// Verify the code the user entered
const { valid } = await client.otp.verify(requestId, "847293");
if (valid) {
  // User is verified ✅
}
```

> Get your API key from the [Achek dashboard](https://achek.com.ng/dashboard/api-keys).

---

## OTP Verification

```typescript
// Simple send
const { requestId } = await client.otp.send("+2348012345678");

// With custom template (Growth+ plans)
const { requestId } = await client.otp.send({
  phoneNumber: "+2348012345678",
  template: "Hi {{name}}, your {{company}} code is {{code}}. Valid 10 mins.",
  recipientName: "Emeka",
  companyName: "MyApp",
  idempotencyKey: "otp-req-user-789", // safe to retry with the same key
});

// Verify
const result = await client.otp.verify(requestId, "847293");
// { valid: true, message: "OTP verified successfully" }

// View your OTP logs
const logs = await client.otp.logs({ limit: 20, status: "verified" });
```

---

## Transaction Alerts

Send formatted debit/credit/transfer alerts directly to a customer's WhatsApp:

```typescript
await client.alerts.transaction({
  phoneNumber: "+2348012345678",
  type: "debit",
  amount: 15000,
  currency: "NGN",
  accountName: "Emeka Okafor",
  reference: "TXN-20240519-001",
  balance: 240000,
  description: "Transfer to Kuda",
});
```

This automatically sends a clean WhatsApp message:
```
💸 Debit Alert

Amount: ₦15,000.00
Account: Emeka Okafor
Ref: `TXN-20240519-001`
Narration: Transfer to Kuda
Balance: ₦240,000.00

_Powered by Achek_
```

### Custom Alerts

```typescript
await client.alerts.send({
  phoneNumber: "+2348012345678",
  message: "*Important:* Your loan application has been approved! 🎉",
  category: "notification",
  idempotencyKey: "alert-approval-user-789",
});
```

---

## Broadcasts

Send a single WhatsApp message to up to 1,000 recipients at once:

```typescript
const result = await client.broadcasts.send({
  name: "Black Friday Promo",
  message: "🔥 *50% OFF* all subscriptions today!\nCode: *FRIDAY50*\nhttps://achek.com.ng",
  recipients: ["+2348012345678", "+2349087654321"], // up to 1000
});

// Check delivery status
const status = await client.broadcasts.status(result.id);
```

---

## Support Ticket Tracking

Create support tickets and keep customers updated on WhatsApp automatically:

```typescript
// Create a ticket — customer gets a WhatsApp notification
const ticket = await client.tickets.create({
  phoneNumber: "+2348012345678",
  subject: "Payment not reflecting",
  description: "Paid ₦5,000 but order not updated",
  priority: "high",
  notifyCustomer: true,
  notificationMessage: "Hi! We received your complaint. Ticket: {{ticketId}}",
});

// Update status — customer gets a WhatsApp update
await client.tickets.update(ticket.ticketId, {
  status: "in_progress",
  notifyCustomer: true,
  notificationMessage: "We're investigating — resolution within 2 hours.",
});

// Resolve the ticket
await client.tickets.resolve(
  ticket.ticketId,
  "Your issue has been fixed! Please check your account.",
);

// List open tickets
const openTickets = await client.tickets.list({ status: "open" });
```

---

## Transactional Email

Send transactional emails via Achek's configured SMTP. Sender address and domain are set in your dashboard.

```typescript
await client.email.send({
  to: "customer@example.com",
  subject: "Your OTP code",
  html: "<p>Your code is <strong>847293</strong>. Valid for 10 minutes.</p>",
});

// Plain text fallback
await client.email.send({
  to: "customer@example.com",
  subject: "Order confirmed",
  text: "Thanks for your order! It will be delivered in 3–5 business days.",
  fromName: "MyShop Support",
});
```

---

## AI Chatbot & Webhook Events

Achek includes a built-in AI chatbot that responds to WhatsApp messages automatically. Configure it from the dashboard — no extra API calls needed.

### Webhook events

Set a webhook URL in **AI Bot → Webhook URL** in your dashboard. Achek will POST to it on these events:

| Event | Fired when | Key fields |
|---|---|---|
| `message.incoming` | Customer sends a message to your bot | `phone`, `message`, `timestamp` |
| `message.outgoing` | Bot replies to the customer | `phone`, `message`, `timestamp` |
| `spam.quarantine` | Sender exceeded velocity limit | `phone`, `quarantined_until`, `message_count` |
| `handoff.requested` | Consecutive depth reached / human took over | `phone`, `reason`, `exchanges`, `bot_config_id` |
| `ticket.created` | Bot opens a support ticket | `ticket_id`, `phone`, `subject`, `priority` |
| `lead.captured` | Bot saves a customer lead | `ticket_id`, `phone`, `name`, `email` |

### Verifying webhook signatures

Achek signs every delivery with HMAC-SHA256. Always verify before trusting the payload:

```typescript
import AchekConnect, { AchekWebhookHelper } from "achek";
import express from "express";

const wh  = new AchekWebhookHelper(process.env.ACHEK_WEBHOOK_SECRET!);
const app = express();

// Use express.raw() so you get the raw Buffer for signature verification
app.post("/webhook/achek", express.raw({ type: "*/*" }), (req, res) => {
  const sig = req.headers["x-achek-signature"] as string;

  if (!wh.verify(sig, req.body)) {
    return res.status(400).send("Invalid signature");
  }

  const event = wh.parse(req.body);

  switch (event.event) {
    case "handoff.requested":
      // Notify your support team
      break;
    case "lead.captured":
      // Sync to your CRM
      break;
    case "spam.quarantine":
      // Log for monitoring
      break;
  }

  res.sendStatus(200);
});
```

### Querying captured leads

```typescript
const tickets = await client.tickets.list({ status: "open" });
const leads = tickets.filter((t: any) => t.metadata?.type === "lead");

leads.forEach((lead: any) => {
  console.log(lead.ticketId);    // "LEAD-1748000000000-XY12"
  console.log(lead.phoneNumber); // "+2348012345678"
  console.log(lead.metadata);    // { source: "whatsapp_bot", type: "lead", name, email }
});
```

---

## Error Handling

```typescript
import AchekConnect, { AchekConnectError } from "achek";

try {
  await client.otp.send("+2348012345678");
} catch (err) {
  if (err instanceof AchekConnectError) {
    console.error(err.message);      // "No active subscription"
    console.error(err.statusCode);   // 402
    console.error(err.code);         // "SUBSCRIPTION_REQUIRED"
    console.error(err.isRateLimit);  // false
    console.error(err.isServerError); // false
  }
}
```

---

## CommonJS

```javascript
const { AchekConnect, AchekWebhookHelper } = require("achek");
const client = new AchekConnect({ apiKey: "your_api_key" });
```

---

## Configuration

```typescript
const client = new AchekConnect({
  apiKey: "your_api_key",
  baseUrl: "https://api.achek.com.ng", // override if self-hosted
  timeout: 15_000,                      // ms (default: 15 000)
  retry: {
    maxAttempts: 3,    // total tries including the first (default: 3)
    initialDelayMs: 500, // first retry waits 500 ms, then 1 000 ms, 2 000 ms…
  },
});
```

---

## API Reference

| Module | Method | Description |
|---|---|---|
| `otp` | `send(phone \| options)` | Send WhatsApp OTP |
| `otp` | `verify(requestId, code)` | Verify OTP code |
| `otp` | `logs(options?)` | Fetch OTP delivery logs |
| `alerts` | `send(options)` | Send custom WhatsApp alert |
| `alerts` | `transaction(options)` | Send formatted transaction alert |
| `broadcasts` | `send(options)` | Send broadcast to up to 1,000 numbers |
| `broadcasts` | `list()` | List recent broadcasts |
| `broadcasts` | `status(id)` | Get broadcast delivery status |
| `tickets` | `create(options)` | Create support ticket |
| `tickets` | `list(options?)` | List tickets |
| `tickets` | `get(ticketId)` | Get a ticket by ID |
| `tickets` | `update(ticketId, options)` | Update status/priority |
| `tickets` | `resolve(ticketId, message?)` | Resolve and notify customer |
| `email` | `send(options)` | Send transactional email |
| `AchekWebhookHelper` | `verify(sig, body)` | Verify HMAC-SHA256 signature |
| `AchekWebhookHelper` | `parse(body)` | Parse raw webhook payload |

---

## Links

- Website: [achek.com.ng](https://achek.com.ng)
- Dashboard: [achek.com.ng/dashboard](https://achek.com.ng/dashboard)
- Docs: [achek.com.ng/docs](https://achek.com.ng/docs)
- Issues: [github.com/CalebDevX/achek-node/issues](https://github.com/CalebDevX/achek-node/issues)

## License

MIT — see [LICENSE](LICENSE)
