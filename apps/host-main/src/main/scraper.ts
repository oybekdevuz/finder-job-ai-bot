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

const CRON_INTERVAL = 80 * 60 * 1000; // exactly 80 min between runs
const POST_TTL = 30 * 24 * 60 * 60; // 30 days in seconds
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

// Returns true if AI left template placeholders unreplaced (e.g. LAVOZIM_NOMI, TASHKENT_CITY)
function hasPlaceholders(text: string): boolean {
  return /\b[A-Z]{2,}_[A-Z]{2,}\b/.test(text);
}

// Notify admin when cron fires but no post is published
async function notifyAdmin(reason: string): Promise<void> {
  try {
    const tashkentTime = new Date(Date.now() + 5 * 60 * 60 * 1000)
      .toISOString()
      .replace("T", " ")
      .slice(0, 16);
    await client.sendMessage(ADMIN_USERNAME, {
      message: `⚠️ Scraper: post chiqmadi\n\n🕐 Vaqt (Toshkent): ${tashkentTime}\n📌 Sabab: ${reason}`,
    });
  } catch (e) {
    console.error("[Scraper] Failed to notify admin:", e);
  }
}

async function isAlreadyScraped(
  sourceChannel: string,
  messageId: number
): Promise<boolean> {
  const redis = await getRedis();
  const exists = await redis.exists(`scraped:${sourceChannel}:${messageId}`);
  return exists === 1;
}

async function savePostMapping(
  sourceChannel: string,
  sourceMessageId: number,
  targetMessageId: number
): Promise<void> {
  const redis = await getRedis();
  const data = JSON.stringify({
    sourceChannel,
    sourceMessageId,
    targetMessageId,
    postedAt: Date.now(),
  });
  await redis.setex(`scraped:${sourceChannel}:${sourceMessageId}`, POST_TTL, "1");
  await redis.setex(`post:${targetMessageId}`, POST_TTL, data);
  await redis.sadd("post_ids", String(targetMessageId));
}

// Format a job post using AI. Returns null if the post should be skipped.
async function formatJobPost(originalText: string): Promise<string | null> {
  try {
    const response = await openai.chat.completions.create({
      model: process.env.CC_OPENAI_CHAT_MODEL || "gpt-4o",
      temperature: 0,
      messages: [
        {
          role: "system",
          content: `Sen ish e'lonlarini formatlash bo'yicha yordamchisan. Berilgan matndan ish e'loni ma'lumotlarini ajratib ol va quyidagi formatda qaytar. Agar matn ish e'loni bo'lmasa — "SKIP" deb yoz.

TAQIQLANGAN VAKANSIYALAR — "SKIP" deb yoz:
- Har qanday til o'qituvchisi yoki repetitori (ingliz, rus, arab, turk, koreys, nemis, xitoy, frantsuz va boshqa tillar)
- Direktor yordamchisi / assistant to director / помощник директора
- Bosh buxgalter / chief accountant / главный бухгалтер

MUHIM QOIDA: Quyidagi formatda faqat HAQIQIY ma'lumot yoz. Shablondagi so'zlarni (masalan "Lavozim nomi", "Kompaniya nomi" va h.k.) HECH QACHON chiqarma — ularni matndan topilgan haqiqiy qiymat bilan almashtir. Agar biron ma'lumot topilmasa, ko'rsatilgan standart qiymatni ishlat.

FORMAT:

Haqiqiy lavozim nomi (matndan ol)

— Ish holati: #aktiv

🏢 Kompaniya: Haqiqiy kompaniya nomi (topilmasa: Ko'rsatilmagan)

— Ish turi: Offline yoki Online yoki Gibrid (matndan ol)

💰 Maosh: Haqiqiy maosh miqdori (topilmasa: Kelishiladi)

— Talablar:
- Haqiqiy talab 1
- Haqiqiy talab 2

— Murojaat uchun: Haqiqiy aloqa ma'lumotlari

📍 Manzil: Haqiqiy manzil (topilmasa: Ko'rsatilmagan)

🍋Limon Jobs – limonni ishlang!

Bepul e'lon joylang: @limonjobs_admin

MISOL (bunday formatda yoz):
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
        {
          role: "user",
          content: originalText,
        },
      ],
    });

    const result = response.choices[0]?.message?.content?.trim();
    if (!result || result === "SKIP") return null;

    // Reject if AI left template placeholders unreplaced
    if (hasPlaceholders(result)) {
      console.log("[Scraper] Skipping post: placeholders not replaced");
      return null;
    }

    return result;
  } catch (error) {
    console.error("[Scraper] OpenAI format error:", error);
    return null;
  }
}

async function isDuplicate(formatted: string): Promise<boolean> {
  const redis = await getRedis();
  const recentPosts = await redis.lrange("recent_posts", 0, 29);
  if (!recentPosts.length) return false;

  try {
    const response = await openai.chat.completions.create({
      model: process.env.CC_OPENAI_CHAT_MODEL || "gpt-4o",
      temperature: 0,
      messages: [
        {
          role: "system",
          content: `Sen ish e'lonlarini solishtiruvchisan. Yangi e'lon bilan mavjud e'lonlarni solishtir.

DUPLICATE deb yoz agar:
- Lavozim bir xil yoki o'xshash (masalan "Video montajyor" va "Videomontajor" bir xil)
- Kompaniya bir xil
- Murojaat uchun link, telefon raqam yoki username bir xil
- Manzil bir xil
- Maosh diapazoni bir xil yoki juda yaqin

Agar yuqoridagilardan KAMIDA 2 tasi mos kelsa — "DUPLICATE".
Aks holda "UNIQUE".
Faqat bitta so'z yoz.`,
        },
        {
          role: "user",
          content: `YANGI E'LON:\n${formatted}\n\nMAVJUD E'LONLAR:\n${recentPosts.join("\n---\n")}`,
        },
      ],
    });

    const result = response.choices[0]?.message?.content?.trim();
    return result === "DUPLICATE";
  } catch (error) {
    console.error("[Scraper] Duplicate check error:", error);
    return false;
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

      const messages = await client.getMessages(channel, {
        limit: 50,
        offsetDate: oneDayAgo,
      });

      for (const msg of messages) {
        if (!msg.text || msg.text.length < 30) continue;
        if (!msg.date || msg.date < twoDaysAgo) break;

        const alreadyScraped = await isAlreadyScraped(channel, msg.id);
        if (alreadyScraped) continue;

        candidates.push({
          channel,
          msgId: msg.id,
          text: msg.text,
          date: msg.date,
        });
      }

      await new Promise((r) => setTimeout(r, 3_000));
    } catch (error: any) {
      if (error?.seconds) {
        console.log(`[Scraper] FloodWait: waiting ${error.seconds}s...`);
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

// Returns the selected post, or a reason string if nothing was selected
async function selectBestPost(
  candidates: CandidatePost[]
): Promise<{ index: number; formatted: string; category: string } | string> {
  const recentCategories = await getRecentCategories();
  const recentPosts = await (await getRedis()).lrange("recent_posts", 0, 29);

  const candidateList = candidates
    .map(
      (c, i) =>
        `[${i}] Kanal: ${c.channel} | Sana: ${new Date(c.date * 1000).toISOString()}\n${c.text}`
    )
    .join("\n---\n");

  try {
    const response = await openai.chat.completions.create({
      model: process.env.CC_OPENAI_CHAT_MODEL || "gpt-4o",
      temperature: 0,
      messages: [
        {
          role: "system",
          content: `Sen ish e'lonlarini saralovchisan. Berilgan nomzodlardan FAQAT BITTA eng yaxshisini tanlashing kerak.

SARALASH QOIDALARI (muhimlik tartibi bo'yicha):

0. TAQIQLANGAN — HECH QACHON TANLAMA:
- Har qanday til o'qituvchisi yoki repetitori (ingliz, rus, arab, turk, koreys, nemis va boshqalar)
- Direktor yordamchisi
- Bosh buxgalter
Faqat zamonaviy kasblar (IT, SMM, dizayner, marketing, menejer, muhandis, analitik, kontent, operator, administrator va h.k.).

1. DUBLIKAT TEKSHIRISH: MAVJUD E'LONLAR bilan bir xil lavozim+kompaniya+manzil bo'lsa — TANLAMAGIN.

2. MAOSH USTUNLIGI: Maosh ko'rsatilgan e'lonlar birinchi.

3. PRIORITY KANALLAR: ${PRIORITY_CHANNELS.join(", ")} kanallaridan maoshsiz ham olish mumkin.

4. FALLBACK: Priority kanalda yo'q bo'lsa — boshqa kanallardan maosh bo'yicha, keyin vaqti bo'yicha.

5. XILMA-XILLIK: Oxirgi kategoriyalar: [${recentCategories.join(", ")}]. Farqli kategoriya tanlashga harakat qil.

6. SOTUV DEPRIORITIZATSIYA: Sotuvchi, call center, sales — faqat boshqa variant bo'lmaganda ol.

JAVOB FORMATI — faqat JSON, boshqa hech narsa yozma:
[{"index": 0, "category": "dasturchi", "reason": "qisqa sabab"}]

Hech biri mos kelmasa: []`,
        },
        {
          role: "user",
          content: `NOMZODLAR:\n${candidateList}\n\nMAVJUD E'LONLAR (dublikat uchun):\n${recentPosts.length ? recentPosts.join("\n---\n") : "Yo'q"}`,
        },
      ],
    });

    const raw = response.choices[0]?.message?.content?.trim();
    if (!raw) return "AI bo'sh javob qaytardi (selection)";

    // Extract JSON array — DeepSeek sometimes wraps it in ```json ... ``` or adds extra text
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return `AI JSON massiv qaytarmadi: ${raw.slice(0, 100)}`;

    const selections: { index: number; category: string; reason: string }[] =
      JSON.parse(jsonMatch[0]);

    if (!selections.length) return "AI hech bir nomzodni tanlamadi (barcha taqiqlangan yoki dublikat)";

    const sel = selections[0];
    const candidate = candidates[sel.index];
    if (!candidate) return `AI noto'g'ri index qaytardi: ${sel.index}`;

    const formatted = await formatJobPost(candidate.text);
    if (!formatted) {
      return `Formatlash muvaffaqiyatsiz: ${candidate.channel}#${candidate.msgId} (SKIP yoki placeholder)`;
    }

    console.log(
      `[Scraper] Selected: [${sel.category}] from ${candidate.channel}#${candidate.msgId} — ${sel.reason}`
    );

    return { index: sel.index, formatted, category: sel.category };
  } catch (error: any) {
    console.error("[Scraper] AI selection error:", error);
    return `AI xatolik: ${error?.message || error}`;
  }
}

// Scrape, select best post, and publish. Returns reason string if no post was published.
async function scrapeAndPost(): Promise<string | null> {
  if (!sourceChannels.length) return "CC_SOURCE_CHANNELS sozlanmagan";
  if (!channelUsername) return "CC_CHANNEL_USERNAME sozlanmagan";

  const candidates = await collectCandidates();
  console.log(`[Scraper] Found ${candidates.length} candidates`);

  if (!candidates.length) return "Yangi nomzodlar topilmadi (barcha kanallar scraped)";

  const result = await selectBestPost(candidates);

  // Mark all candidates as scraped regardless of outcome
  const redis = await getRedis();
  for (const c of candidates) {
    await redis.setex(`scraped:${c.channel}:${c.msgId}`, POST_TTL, "1");
  }

  if (typeof result === "string") return result;

  const candidate = candidates[result.index];

  const duplicate = await isDuplicate(result.formatted);
  if (duplicate) {
    return `Dublikat: ${candidate.channel}#${candidate.msgId}`;
  }

  try {
    // Build Telegram entities for the Limon Jobs link
    const linkOffset = result.formatted.indexOf(LIMON_TEXT);
    const entities: Api.TypeMessageEntity[] =
      linkOffset >= 0
        ? [
            new Api.MessageEntityTextUrl({
              offset: linkOffset,
              length: LIMON_TEXT.length,
              url: LIMON_URL,
            }),
          ]
        : [];

    const sent = await client.sendMessage(channelUsername, {
      message: result.formatted,
      linkPreview: false,
      formattingEntities: entities,
    });

    await saveToRecent(result.formatted);
    await saveCategory(result.category);
    await savePostMapping(candidate.channel, candidate.msgId, sent.id);

    console.log(
      `[Scraper] Posted [${result.category}] from ${candidate.channel}#${candidate.msgId} → ${channelUsername}#${sent.id}`
    );

    return null; // success
  } catch (error: any) {
    if (error?.seconds) {
      console.log(`[Scraper] FloodWait: waiting ${error.seconds}s...`);
      await new Promise((r) => setTimeout(r, error.seconds * 1000));
      return `FloodWait ${error.seconds}s — post kechiktirildi`;
    }
    console.error(`[Scraper] Error posting:`, error);
    return `Post yuborishda xatolik: ${error?.message || error}`;
  }
}

async function checkExistingPosts(): Promise<void> {
  const redis = await getRedis();
  const postIds = await redis.smembers("post_ids");

  if (!postIds.length) {
    console.log("[Scraper] No tracked posts to check");
    return;
  }

  console.log(`[Scraper] Checking ${postIds.length} tracked posts...`);

  for (const targetIdStr of postIds) {
    try {
      const data = await redis.get(`post:${targetIdStr}`);
      if (!data) {
        await redis.srem("post_ids", targetIdStr);
        continue;
      }

      const { sourceChannel, sourceMessageId, targetMessageId } = JSON.parse(data);

      let sourceExists = true;
      try {
        const msgs = await client.getMessages(sourceChannel, {
          ids: [sourceMessageId],
        });
        if (!msgs.length || !msgs[0] || !msgs[0].text) {
          sourceExists = false;
        }
      } catch {
        sourceExists = false;
      }

      await new Promise((r) => setTimeout(r, 3_000));

      if (!sourceExists) {
        console.log(
          `[Scraper] Source post ${sourceChannel}#${sourceMessageId} deleted, editing target#${targetMessageId}`
        );

        try {
          const targetMsgs = await client.getMessages(channelUsername, {
            ids: [targetMessageId],
          });

          if (targetMsgs.length && targetMsgs[0] && targetMsgs[0].text) {
            const currentText = targetMsgs[0].text;
            if (currentText.includes("#yopildi")) continue;

            let editedText = currentText.replace("#aktiv", "#yopildi");
            editedText = editedText.replace(
              /— Murojaat uchun:.*(?:\n|$)/,
              "— ❌ Vakansiya yopildi\n"
            );

            await client.invoke(
              new Api.messages.EditMessage({
                peer: channelUsername,
                id: targetMessageId,
                message: editedText,
              })
            );

            console.log(`[Scraper] Marked target#${targetMessageId} as closed`);
          }
        } catch (editError) {
          console.error(`[Scraper] Error editing target#${targetMessageId}:`, editError);
        }

        await redis.srem("post_ids", targetIdStr);
        await redis.del(`post:${targetIdStr}`);
      }
    } catch (error) {
      console.error(`[Scraper] Error checking post ${targetIdStr}:`, error);
    }
  }
}

function isPostingHours(): boolean {
  const now = new Date();
  const tashkentHour = (now.getUTCHours() + 5) % 24;
  return tashkentHour >= 8 && tashkentHour < 21;
}

let scraperRunning = false;

async function runScraper(): Promise<void> {
  if (!isPostingHours()) {
    console.log(`[Scraper] Outside posting hours (08:00-21:00 Tashkent), skipping`);
    return;
  }

  if (scraperRunning) {
    console.log(`[Scraper] Already running, skipping this tick`);
    return;
  }

  scraperRunning = true;
  console.log(`[Scraper] Running at ${new Date().toISOString()}`);

  try {
    const failReason = await scrapeAndPost();
    if (failReason) {
      console.log(`[Scraper] No post published: ${failReason}`);
      await notifyAdmin(failReason);
    }
    await checkExistingPosts();
  } catch (error: any) {
    const msg = error?.message || String(error);
    console.error("[Scraper] Unhandled error:", error);
    await notifyAdmin(`Kutilmagan xatolik: ${msg}`);
  } finally {
    scraperRunning = false;
  }

  console.log(`[Scraper] Done`);
}

export async function startScraper(): Promise<void> {
  if (!sourceChannels.length) {
    console.log("[Scraper] CC_SOURCE_CHANNELS not set, scraper disabled");
    return;
  }

  console.log(
    `[Scraper] Configured with ${sourceChannels.length} source channels: ${sourceChannels.join(", ")}`
  );
  console.log(`[Scraper] Target channel: ${channelUsername}`);
  console.log(`[Scraper] Schedule: every 80min (1 post), 08:00-21:00 Tashkent`);

  // First run after 10 seconds
  setTimeout(() => {
    runScraper();
  }, 10_000);

  // Then on interval
  setInterval(() => {
    runScraper();
  }, CRON_INTERVAL);
}
