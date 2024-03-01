import rateLimitMiddleware from "@/middleware/rateLimiter";

function handler(req, res) {
  res.status(200).json({ name: "Limited, don't over use me!" });
}
export default rateLimitMiddleware(handler);
