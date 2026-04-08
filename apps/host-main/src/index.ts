console.log("[DEBUG] ENV check — TELEGRAM_API_ID:", process.env.TELEGRAM_API_ID || "MISSING");
console.log("[DEBUG] ENV check — TELEGRAM_API_HASH:", process.env.TELEGRAM_API_HASH ? "SET" : "MISSING");
console.log("[DEBUG] ENV check — TELEGRAM_SESSION:", process.env.TELEGRAM_SESSION ? "SET" : "MISSING");
import "./config/setup"
import "@modules/remote-lib";
import "./main/hono";
import "./main/telegram";