import { Api } from "telegram";
import { client } from "./telegram";
import Redis from "ioredis";
import { singleshot } from "functools-kit";
import OpenAI from "openai";

declare function parseInt(s: unknown): number;

const channelUsername = process.env.CC_CHANNEL_USERNAME || "";
const sourceChannels = (process.env.CC_SOURCE_CHANNELS || "")
  .split(",")
  .map((c) => c.trim())
  .filter(Boolean);

const CRON_INTERVAL = 80 * 60 * 1000;
const POST_TTL = 30 * 24 * 60 * 60;       // 30 days — published posts
const SEEN_TTL = 24 * 60 * 60;            // 24 hours — unselected candidates
const ADMIN_USERNAME = "@begamov_hasanbek";
const LIMON_TEXT = "🍋Limon Jobs";
const LIMON_URL = "https://t.me/limon_jobs";

const PRIORITY_CHANNELS = ["@techjobs_uz", "@marketingdaishla"];

const deepseekApiKey = process.env.CC_DEPSEEK_API_KEY;

const openai = new OpenAI({
  apiKey: deepseekApiKey || process.env.CC_OPENAI_API_KEY,
  ...(deepseekApiKey && { baseURL: "https://api.deepseek.com" }),
});

const getRedis = singleshot(
  () =>
    new Promise<Redis>((res) => {
      const redis = new Redis({
        host: process.env.CC_REDIS_HOST || "127.0.0.1",
        port: parseInt(process.env.CC_REDIS_PORT) || 6379,
        password: process.env.CC_REDIS_PASSWORD || "",
      });
      redis.on("connect", () => res(redis));
      redis.on("error", (error) => {
        console.error("[Scraper] Redis error:", error);
      });
      return redis;
    })
);

// Hard-banned vacancy types — never post these regardless of anything else
function isBannedVacancy(text: string): boolean {
  return /til\s+o[`']?qituvch|repetitor|language\s+teacher|english\s+teacher|russian\s+teacher|arab\S*\s+til|turk\S*\s+til|koreys\S*\s+til|nemis\S*\s+til|xitoy\S*\s+til|frantsuz\S*\s+til|teacher\s+of\s+(english|russian|arabic|turkish|korean|german|chinese)|преподаватель\s+(русского|английского|арабского)|direktor\s+yordamchisi|assistant\s+to\s+director|помощник\s+директора|bosh\s+buxgalter|chief\s+accountant|главный\s+бухгалтер/i.test(text);
}

// Reject if AI left template placeholders unreplaced
function hasPlaceholders(text: string): boolean {
  return /\b[A-Z]{2,}_[A-Z]{2,}\b/.test(text);
}

async function notifyAdmin(reason: string, candidateCount?: number): Promise<void> {
  try {
    const tashkentTime = new Date(Date.now() + 5 * 60 * 60 * 1000)
      .toISOString()
      .replace("T", " ")
      .slice(0, 16);
    const countLine = candidateCount !== undefined
      ? `\n👥 Ko'rilgan kandidatlar: ${candidateCount} ta`
      : "";
    await client.sendMessage(ADMIN_USERNAME, {
      message: `⚠️ Scraper: post chiqmadi\n\n🕐 Vaqt (Toshkent): ${tashkentTime}${countLine}\n📌 Sabab: ${reason}`,
    });
  } catch (e) {
    console.error("[Scraper] Failed to notify admin:", e);
  }
}

async function isAlreadyScraped(sourceChannel: string, messageId: number): Promise<boolean> {
  const redis = await getRedis();
  return (await redis.exists(`scraped:${sourceChannel}:${messageId}`)) === 1;
}

async function markPublished(sourceChannel: string, sourceMessageId: number, targetMessageId: number): Promise<void> {
  const redis = await getRedis();
  const data = JSON.stringify({ sourceChannel, sourceMessageId, targetMessageId, postedAt: Date.now() });
  await redis.setex(`scraped:${sourceChannel}:${sourceMessageId}`, POST_TTL, "1");
  await redis.setex(`post:${targetMessageId}`, POST_TTL, data);
  await redis.sadd("post_ids", String(targetMessageId));
}

// Mark unselected candidates as seen for 24h so they're not re-evaluated today
async function markSeen(candidates: CandidatePost[], publishedIndex?: number): Promise<void> {
  const redis = await getRedis();
  for (let i = 0; i < candidates.length; i++) {
    if (i === publishedIndex) continue; // published one already marked with POST_TTL
    const c = candidates[i];
    await redis.setex(`scraped:${c.channel}:${c.msgId}`, SEEN_TTL, "1");
  }
}

async function formatJobPost(originalText: string): Promise<string | null> {
  try {
    const response = await openai.chat.completions.create({
      model: process.env.CC_OPENAI_CHAT_MODEL || "gpt-4o",
      temperature: 0,
      messages: [
        {
          role: "system",
          content: `Sen ish e'lonlarini formatlash bo'yicha yordamchisan. Berilgan matndan ish e'loni ma'lumotlarini ajratib ol va quyidagi formatda qaytar. Agar matn ish e'loni bo'lmasa — "SKIP" deb yoz.

TAQIQLANGAN (faqat shu holatlarda "SKIP"):
- Til o'qituvchisi yoki repetitori (ingliz, rus, arab, turk, koreys, nemis, xitoy va boshqa tillar)
- Direktor yordamchisi
- Bosh buxgalter

QOIDA: Quyidagi formatda faqat HAQIQIY ma'lumot yoz. Shablondagi tavsif so'zlarini HECH QACHON chiqarma — matndan topilgan haqiqiy qiymat bilan almashtir. Topilmasa standart qiymatni ishlat.

FORMAT:

Haqiqiy lavozim nomi

— Ish holati: #aktiv

🏢 Kompaniya: Haqiqiy kompaniya nomi (topilmasa: Ko'rsatilmagan)

— Ish turi: Offline yoki Online yoki Gibrid

💰 Maosh: Haqiqiy maosh (topilmasa: Kelishiladi)

— Talablar:
- Talab 1
- Talab 2

— Murojaat uchun: Aloqa ma'lumotlari

📍 Manzil: Haqiqiy manzil (topilmasa: Ko'rsatilmagan)

🍋Limon Jobs – limonni ishlang!

Bepul e'lon joylang: @limonjobs_admin

MISOL:
SMM menejer

— Ish holati: #aktiv

🏢 Kompaniya: Najot Ta'lim

— Ish turi: Offline

💰 Maosh: 5-8 mln so'm

— Talablar:
- 1+ yil tajriba
- Instagram, Telegram bilimlari

— Murojaat uchun: @admin_hr

📍 Manzil: Toshkent shahri

🍋Limon Jobs – limonni ishlang!

Bepul e'lon joylang: @limonjobs_admin`,
        },
        { role: "user", content: originalText },
      ],
    });

    const result = response.choices[0]?.message?.content?.trim();
    if (!result || result === "SKIP") return null;
    if (hasPlaceholders(result)) {
      console.log("[Scraper] Skipping: unreplaced placeholders in formatted post");
      return null;
    }
    return result;
  } catch (error) {
    console.error("[Scraper] Format error:", error);
    return null;
  }
}

async function saveToRecent(formatted: string): Promise<void> {
  const redis = await getRedis();
  await redis.lpush("recent_posts", formatted);
  await redis.ltrim("recent_posts", 0, 49);
}

interface CandidatePost {
  channel: string;
  msgId: number;
  text: string;
  date: number;
}

async function collectCandidates(): Promise<CandidatePost[]> {
  const candidates: CandidatePost[] = [];
  const oneDayAgo = Math.floor(Date.now() / 1000 - 24 * 60 * 60);
  const twoDaysAgo = Math.floor(Date.now() / 1000 - 48 * 60 * 60);

  for (const channel of sourceChannels) {
    try {
      console.log(`[Scraper] Reading from ${channel}...`);
      const messages = await client.getMessages(channel, { limit: 50, offsetDate: oneDayAgo });

      for (const msg of messages) {
        if (!msg.text || msg.text.length < 30) continue;
        if (!msg.date || msg.date < twoDaysAgo) break;
        if (await isAlreadyScraped(channel, msg.id)) continue;
        candidates.push({ channel, msgId: msg.id, text: msg.text, date: msg.date });
      }

      await new Promise((r) => setTimeout(r, 3_000));
    } catch (error: any) {
      if (error?.seconds) {
        console.log(`[Scraper] FloodWait: ${error.seconds}s...`);
        await new Promise((r) => setTimeout(r, error.seconds * 1000));
      } else {
        console.error(`[Scraper] Error reading ${channel}:`, error);
      }
    }
  }

  return candidates;
}

async function getRecentCategories(): Promise<string[]> {
  const redis = await getRedis();
  return await redis.lrange("recent_categories", 0, 2);
}

async function saveCategory(category: string): Promise<void> {
  const redis = await getRedis();
  await redis.lpush("recent_categories", category);
  await redis.ltrim("recent_categories", 0, 9);
}

interface SelectedPost {
  index: number;
  formatted: string;
  category: string;
}

// AI-based selection from candidates
async function aiSelectPost(candidates: CandidatePost[]): Promise<SelectedPost | null> {
  const recentCategories = await getRecentCategories();
  const recentPosts = await (await getRedis()).lrange("recent_posts", 0, 19);

  const candidateList = candidates
    .map((c, i) => `[${i}] ${c.channel} | ${new Date(c.date * 1000).toISOString()}\n${c.text}`)
    .join("\n---\n");

  try {
    const response = await openai.chat.completions.create({
      model: process.env.CC_OPENAI_CHAT_MODEL || "gpt-4o",
      temperature: 0,
      messages: [
        {
          role: "system",
          content: `Ish e'lonlari saralovchisan. Ro'yxatdan BITTA eng yaxshi e'lonni tanlash kerak.

TAQIQLANGAN (tanlama):
- Til o'qituvchisi/repetitori (ingliz, rus, arab, turk, koreys, nemis, xitoy va boshqalar)
- Direktor yordamchisi
- Bosh buxgalter

USTUNLIK TARTIBI:
1. Mavjud e'lonlar bilan IKKALASI bir xil (lavozim+kompaniya) bo'lmagan
2. Maosh ko'rsatilgan
3. Priority kanallar: ${PRIORITY_CHANNELS.join(", ")}
4. Oxirgi kategoriyalar: [${recentCategories.join(", ")}] — farqli kategoriya afzal
5. Sotuv/call-center — faqat boshqa variant bo'lmasa

FAQAT JSON, boshqa hech narsa:
[{"index": 0, "category": "smm", "reason": "sabab"}]
Bo'sh bo'lsa: []`,
        },
        {
          role: "user",
          content: `NOMZODLAR:\n${candidateList}\n\nMAVJUD E'LONLAR:\n${recentPosts.length ? recentPosts.join("\n---\n") : "Yo'q"}`,
        },
      ],
    });

    const raw = response.choices[0]?.message?.content?.trim();
    if (!raw) return null;

    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return null;

    const selections: { index: number; category: string; reason: string }[] = JSON.parse(jsonMatch[0]);
    if (!selections.length) return null;

    const sel = selections[0];
    const candidate = candidates[sel.index];
    if (!candidate) return null;

    const formatted = await formatJobPost(candidate.text);
    if (!formatted) return null;

    console.log(`[Scraper] AI selected [${sel.category}] from ${candidate.channel}#${candidate.msgId} — ${sel.reason}`);
    return { index: sel.index, formatted, category: sel.category };
  } catch (error) {
    console.error("[Scraper] AI selection error:", error);
    return null;
  }
}

// Fallback: pick best non-banned candidate by salary presence then date
async function fallbackSelectPost(candidates: CandidatePost[]): Promise<SelectedPost | null> {
  const valid = candidates.filter((c) => !isBannedVacancy(c.text));
  if (!valid.length) return null;

  // Sort: posts with salary mention first, then by date desc
  const salaryPattern = /maosh|oylik|so'm|uzs|\$|usd|million|mln|\d[\d\s]*[0-9]{3}/i;
  valid.sort((a, b) => {
    const aSalary = salaryPattern.test(a.text) ? 1 : 0;
    const bSalary = salaryPattern.test(b.text) ? 1 : 0;
    if (bSalary !== aSalary) return bSalary - aSalary;
    return b.date - a.date;
  });

  for (const candidate of valid) {
    const formatted = await formatJobPost(candidate.text);
    if (!formatted) continue;
    const idx = candidates.indexOf(candidate);
    console.log(`[Scraper] Fallback selected from ${candidate.channel}#${candidate.msgId}`);
    return { index: idx, formatted, category: "boshqa" };
  }

  return null;
}

async function scrapeAndPost(): Promise<string | null> {
  if (!sourceChannels.length) return "CC_SOURCE_CHANNELS sozlanmagan";
  if (!channelUsername) return "CC_CHANNEL_USERNAME sozlanmagan";

  const candidates = await collectCandidates();
  console.log(`[Scraper] Found ${candidates.length} candidates`);

  if (!candidates.length) {
    return `Yangi nomzodlar topilmadi — barcha kanallar scraped`;
  }

  // Try AI selection first, fallback to rule-based if AI returns nothing
  let selected = await aiSelectPost(candidates);

  if (!selected) {
    console.log("[Scraper] AI returned nothing, trying fallback selection...");
    selected = await fallbackSelectPost(candidates);
  }

  if (!selected) {
    await markSeen(candidates);
    return `${candidates.length} ta kandidat ko'rildi — barchasi taqiqlangan yoki formatlash muvaffaqiyatsiz`;
  }

  const candidate = candidates[selected.index];

  try {
    const linkOffset = selected.formatted.indexOf(LIMON_TEXT);
    const entities: Api.TypeMessageEntity[] =
      linkOffset >= 0
        ? [new Api.MessageEntityTextUrl({ offset: linkOffset, length: LIMON_TEXT.length, url: LIMON_URL })]
        : [];

    const sent = await client.sendMessage(channelUsername, {
      message: selected.formatted,
      linkPreview: false,
      formattingEntities: entities,
    });

    await saveToRecent(selected.formatted);
    await saveCategory(selected.category);
    await markPublished(candidate.channel, candidate.msgId, sent.id);
    await markSeen(candidates, selected.index);

    console.log(`[Scraper] Posted [${selected.category}] from ${candidate.channel}#${candidate.msgId} → ${channelUsername}#${sent.id}`);
    return null; // success
  } catch (error: any) {
    if (error?.seconds) {
      await markSeen(candidates);
      return `FloodWait ${error.seconds}s — post kechiktirildi`;
    }
    console.error("[Scraper] Post error:", error);
    return `Post yuborishda xatolik: ${error?.message || error}`;
  }
}

async function checkExistingPosts(): Promise<void> {
  const redis = await getRedis();
  const postIds = await redis.smembers("post_ids");
  if (!postIds.length) return;

  console.log(`[Scraper] Checking ${postIds.length} tracked posts...`);

  for (const targetIdStr of postIds) {
    try {
      const data = await redis.get(`post:${targetIdStr}`);
      if (!data) { await redis.srem("post_ids", targetIdStr); continue; }

      const { sourceChannel, sourceMessageId, targetMessageId } = JSON.parse(data);

      let sourceExists = true;
      try {
        const msgs = await client.getMessages(sourceChannel, { ids: [sourceMessageId] });
        if (!msgs.length || !msgs[0] || !msgs[0].text) sourceExists = false;
      } catch {
        sourceExists = false;
      }

      await new Promise((r) => setTimeout(r, 3_000));

      if (!sourceExists) {
        try {
          const targetMsgs = await client.getMessages(channelUsername, { ids: [targetMessageId] });
          if (targetMsgs.length && targetMsgs[0]?.text) {
            const current = targetMsgs[0].text;
            if (!current.includes("#yopildi")) {
              const edited = current
                .replace("#aktiv", "#yopildi")
                .replace(/— Murojaat uchun:.*(?:\n|$)/, "— ❌ Vakansiya yopildi\n");
              await client.invoke(new Api.messages.EditMessage({ peer: channelUsername, id: targetMessageId, message: edited }));
              console.log(`[Scraper] Marked #${targetMessageId} as closed`);
            }
          }
        } catch (e) {
          console.error(`[Scraper] Error editing #${targetMessageId}:`, e);
        }
        await redis.srem("post_ids", targetIdStr);
        await redis.del(`post:${targetIdStr}`);
      }
    } catch (e) {
      console.error(`[Scraper] Error checking post ${targetIdStr}:`, e);
    }
  }
}

function isPostingHours(): boolean {
  const tashkentHour = (new Date().getUTCHours() + 5) % 24;
  return tashkentHour >= 8 && tashkentHour < 21;
}

let scraperRunning = false;

async function runScraper(): Promise<void> {
  if (!isPostingHours()) {
    console.log("[Scraper] Outside posting hours (08:00-21:00 Tashkent), skipping");
    return;
  }
  if (scraperRunning) {
    console.log("[Scraper] Already running, skipping this tick");
    return;
  }

  scraperRunning = true;
  console.log(`[Scraper] Running at ${new Date().toISOString()}`);

  try {
    const failReason = await scrapeAndPost();
    if (failReason) {
      console.log(`[Scraper] No post: ${failReason}`);
      // Extract candidate count from reason if present
      const countMatch = failReason.match(/^(\d+) ta kandidat/);
      const count = countMatch ? parseInt(countMatch[1]) : undefined;
      await notifyAdmin(failReason, count);
    }
    await checkExistingPosts();
  } catch (error: any) {
    const msg = error?.message || String(error);
    console.error("[Scraper] Unhandled error:", error);
    await notifyAdmin(`Kutilmagan xatolik: ${msg}`);
  } finally {
    scraperRunning = false;
  }

  console.log("[Scraper] Done");
}

export async function startScraper(): Promise<void> {
  if (!sourceChannels.length) {
    console.log("[Scraper] CC_SOURCE_CHANNELS not set, scraper disabled");
    return;
  }

  console.log(`[Scraper] Sources: ${sourceChannels.join(", ")}`);
  console.log(`[Scraper] Target: ${channelUsername}`);
  console.log(`[Scraper] Schedule: every 80min, 08:00-21:00 Tashkent`);

  setTimeout(() => runScraper(), 10_000);
  setInterval(() => runScraper(), CRON_INTERVAL);
}
