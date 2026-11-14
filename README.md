# Next.js Rate Limiter

A small, dependency-free rate limiter for **Next.js API routes** (Pages Router). Wrap any API handler and it will allow a fixed number of requests per client IP within a time window, responding with `429 Too Many Requests` once the limit is reached.

The repo includes two demo routes so you can see the difference:

| Route | Behaviour |
|---|---|
| `GET /api/limited` | Wrapped with the rate limiter — 5 requests per minute per IP |
| `GET /api/unlimited` | Not wrapped — no limit |

## How it works

The limiter lives in [`middleware/rateLimiter.js`](middleware/rateLimiter.js). It is a higher-order function: it takes your route handler and returns a new handler that checks the limit first.

1. **Identify the client.** The IP is read from the `x-forwarded-for` header (set by proxies and most hosting platforms), falling back to the socket's remote address.
2. **Track usage in memory.** A module-level `Map` stores `{ count, lastReset }` per IP.
3. **Fixed window.** If more than `windowMs` has passed since `lastReset`, the counter resets to zero.
4. **Enforce the limit.** If `count` has reached `limit`, the request is rejected with `429`. Otherwise the counter is incremented and your handler runs.

```js
const rateLimitMap = new Map();

export default function rateLimitMiddleware(handler) {
  return (req, res) => {
    const ip = req.headers["x-forwarded-for"] || req.connection.remoteAddress;
    const limit = 5;            // requests allowed per window
    const windowMs = 60 * 1000; // window length: 1 minute
    // ...reset window if expired, reject with 429 if over limit, else count and call handler
  };
}
```

## Usage

Wrap the default export of any API route:

```js
// pages/api/limited.js
import rateLimitMiddleware from "@/middleware/rateLimiter";

function handler(req, res) {
  res.status(200).json({ name: "Limited, don't over use me!" });
}

export default rateLimitMiddleware(handler);
```

### Run it locally

```bash
npm install
npm run dev
```

Then call the limited route six times in a row — the sixth request is rejected:

```bash
for i in $(seq 1 6); do
  curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/limited
done
# 200 200 200 200 200 429
```

`/api/unlimited` keeps returning `200` no matter how often you call it.

## Configuration

The limit and window are set as constants inside `middleware/rateLimiter.js`:

| Setting | Default | Meaning |
|---|---|---|
| `limit` | `5` | Maximum requests per IP within one window |
| `windowMs` | `60 * 1000` | Window length in milliseconds (1 minute) |

Edit these values to change the policy. They apply to every route wrapped with the limiter.

## Limitations

This is a deliberately minimal, in-memory implementation — good for learning, demos, and single-instance apps. Before using it in production, be aware of:

- **State is per process.** Counters live in the Node.js process's memory. They reset on restart and are **not shared** across multiple instances or serverless function invocations, so on platforms like Vercel each instance enforces its own limit. Use a shared store such as Redis for distributed rate limiting.
- **Fixed-window bursts.** Because the counter resets at window boundaries, a client can make up to `2 × limit` requests in a short span around a reset. A sliding-window or token-bucket algorithm smooths this out.
- **No eviction.** Entries are never removed from the `Map`, so memory grows with the number of distinct IPs seen.
- **Trusting `x-forwarded-for`.** The header can be set by clients and may contain a comma-separated list of addresses. Only trust it behind a proxy you control, and parse the correct entry for your setup.
- **No rate-limit headers.** Responses don't include `Retry-After` or `X-RateLimit-*` headers, so clients can't tell when to retry.
- **Global settings.** One `limit`/`windowMs` applies to all wrapped routes; per-route limits would require passing options into the wrapper.
- **Pages Router API routes only.** It wraps `(req, res)` handlers; it isn't a Next.js `middleware.ts` and doesn't cover App Router route handlers.

## Tech

Next.js 14 (Pages Router) · JavaScript · no external dependencies for the limiter itself.
