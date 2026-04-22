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

const CRON_INTERVAL = 80 * 60 * 1000; // 80 min — exactly one post per interval
const POST_TTL = 30 * 24 * 60 * 60; // 30 days in seconds

// Priority channels — take posts even without salary
const PRIORITY_CHANNELS = ["@techjobs_uz", "@marketingdaishla"];

// Sales-type keywords to deprioritize
const SALES_KEYWORDS = [
  "sotuvchi", "sotuv", "call center", "call-center", "telesales",
  "sotuv menejer", "sales", "продавец", "менеджер по продажам",
];

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

// Check if a source message was already scraped
async function isAlreadyScraped(
  sourceChannel: string,
  messageId: number
): Promise<boolean> {
  const redis = await getRedis();
  const exists = await redis.exists(
    `scraped:${sourceChannel}:${messageId}`
  );
  return exists === 1;
}

// Save post mapping to Redis
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

  await redis.setex(
    `scraped:${sourceChannel}:${sourceMessageId}`,
    POST_TTL,
    "1"
  );
  await redis.setex(`post:${targetMessageId}`, POST_TTL, data);
  await redis.sadd("post_ids", String(targetMessageId));
}

// Format a job post using OpenAI
async function formatJobPost(
  originalText: string,
  sourceChannel: string
): Promise<string | null> {
  try {
    const response = await openai.chat.completions.create({
      model: process.env.CC_OPENAI_CHAT_MODEL || "gpt-4o",
      temperature: 0,
      messages: [
        {
          role: "system",
          content: `Sen ish e'lonlarini formatlash bo'yicha yordamchisan. Berilgan matndan ish e'loni ma'lumotlarini ajratib ol va quyidagi formatda qaytar. Agar matn ish e'loni bo'lmasa, "SKIP" deb yoz.

MUHIM FILTR: Quyidagi vakansiyalar uchun "SKIP" deb yoz:
- Til o'qituvchisi/repetitori/kursi: ingliz tili, rus tili, arab tili, koreys tili, turk tili, nemis tili, xitoy tili, frantsuz tili va boshqa har qanday til o'qituvchisi (teacher of English/Russian/Arabic/Turkish va h.k.)
- Direktor yordamchisi, assistant to director, помощник директора
- Bosh buxgalter, chief accountant, главный бухгалтер

Faqat zamonaviy kasblar (IT, SMM, dizayner, marketing, menejer, muhandis, analitik, kontent-maker, operator, administrator, sotuvchi, kuryer va h.k.) qabul qilinadi.

MUHIM: Figurali qavslar {} ichidagi so'zlar PLACEHOLDER emas — ularni matndan topilgan haqiqiy ma'lumot bilan ALMASHTIR. Masalan, agar lavozim "SMM menejer" bo'lsa, aynan "SMM menejer" deb yoz.

FORMAT:

LAVOZIM_NOMI

— Ish holati: #aktiv

🏢 Kompaniya: KOMPANIYA_NOMI (topilmasa "Ko'rsatilmagan")

— Ish turi: OFFLINE_ONLINE_GIBRID

💰 Maosh: MAOSH_SUMMASI (topilmasa "Kelishiladi")

— Talablar:
TALABLAR_ROYXATI

— Murojaat uchun: ALOQA_MALUMOTLARI

📍 Manzil: MANZIL (topilmasa "Ko'rsatilmagan")

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
        {
          role: "user",
          content: originalText,
        },
      ],
    });

    const result = response.choices[0]?.message?.content?.trim();
    if (!result || result === "SKIP") return null;
    return result;
  } catch (error) {
    console.error("[Scraper] OpenAI format error:", error);
    return null;
  }
}

// Check if a formatted post is a duplicate of recent posts
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
- Manzil bir xil (masalan "Impact Coworking" va "Toshkent, Impact Coworking")
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

// Save formatted post to recent list for duplicate checking
async function saveToRecent(formatted: string): Promise<void> {
  const redis = await getRedis();
  await redis.lpush("recent_posts", formatted);
  await redis.ltrim("recent_posts", 0, 49); // keep last 50
}

interface CandidatePost {
  channel: string;
  msgId: number;
  text: string;
  date: number;
}

// Collect unscraped posts from all source channels (1-2 days old)
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

      // Delay between channels to avoid flood
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

// Get recent post categories to ensure diversity
async function getRecentCategories(): Promise<string[]> {
  const redis = await getRedis();
  return await redis.lrange("recent_categories", 0, 2);
}

async function saveCategory(category: string): Promise<void> {
  const redis = await getRedis();
  await redis.lpush("recent_categories", category);
  await redis.ltrim("recent_categories", 0, 9);
}

// Use AI to select best 1-2 posts from candidates
async function selectBestPosts(
  candidates: CandidatePost[]
): Promise<{ index: number; formatted: string; category: string }[]> {
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
          content: `Sen ish e'lonlarini saralovchisan. Berilgan nomzodlardan FAQAT ENG YAXSHI 1 tasini tanlashing kerak.

SARALASH QOIDALARI (muhimlik tartibi bo'yicha):

0. TAQIQLANGAN VAKANSIYALAR — HECH QACHON TANLAMA:
- Til o'qituvchisi/repetitori (ingliz, rus, arab, turk, koreys, nemis, xitoy, frantsuz va boshqa har qanday til)
- Direktor yordamchisi / assistant to director
- Bosh buxgalter / chief accountant
Faqat zamonaviy kasblar (IT, SMM, dizayner, marketing, menejer, muhandis, analitik, kontent-maker, operator, administrator, sotuvchi, kuryer va h.k.) tanlanadi.

1. DUBLIKAT TEKSHIRISH: Agar nomzod MAVJUD E'LONLAR bilan bir xil lavozim, kompaniya, manzilga ega bo'lsa — TANLAMAGIN.

2. MAOSH USTUNLIGI: Maosh/oylik narxi ko'rsatilgan e'lonlar birinchi. Eng yuqori maoshni olish.

3. PRIORITY KANALLAR: ${PRIORITY_CHANNELS.join(", ")} kanallaridagi e'lonlarni maosh ko'rsatilmagan bo'lsa ham olish mumkin.

4. FALLBACK: Agar priority kanallarda bugun e'lon yo'q bo'lsa — boshqa kanallardan maosh bo'yicha, keyin maoshsizlarni vaqti bo'yicha (birinchi chiqqanini) olish.

5. XILMA-XILLIK: Oxirgi 3 ta post kategoriyalari: [${recentCategories.join(", ")}]. Ulardan farqli kategoriya tanlashga harakat qil. Ketma-ket 3 ta bir xil kategoriya bo'lmasligi kerak.

6. SOTUV DEPRIORITIZATSIYA: Sotuvchi, call center, sotuv menejer, sales kabi e'lonlar juda ko'p. Iloji boricha boshqa turdagi vakansiyalarni birinchi ol. Sotuv vakansiyalarini faqat boshqa variant bo'lmaganda ol.

JAVOB FORMATI (faqat JSON, boshqa hech narsa yozma — FAQAT 1 TA element):
[
  {
    "index": 0,
    "category": "dasturchi",
    "reason": "qisqa sabab"
  }
]

Agar hech biri mos kelmasa, bo'sh massiv qaytar: []`,
        },
        {
          role: "user",
          content: `NOMZODLAR:\n${candidateList}\n\nMAVJUD E'LONLAR (dublikat uchun):\n${recentPosts.length ? recentPosts.join("\n---\n") : "Yo'q"}`,
        },
      ],
    });

    const result = response.choices[0]?.message?.content?.trim();
    if (!result) return [];

    const selections: { index: number; category: string; reason: string }[] =
      JSON.parse(result);

    // Format selected posts
    const output: { index: number; formatted: string; category: string }[] = [];

    for (const sel of selections.slice(0, 1)) {
      const candidate = candidates[sel.index];
      if (!candidate) continue;

      const formatted = await formatJobPost(candidate.text, candidate.channel);
      if (!formatted) continue;

      output.push({
        index: sel.index,
        formatted,
        category: sel.category,
      });

      console.log(
        `[Scraper] Selected: [${sel.category}] from ${candidate.channel}#${candidate.msgId} — ${sel.reason}`
      );
    }

    return output;
  } catch (error) {
    console.error("[Scraper] AI selection error:", error);
    return [];
  }
}

// Scrape, select best posts, and publish
async function scrapeSourceChannels(): Promise<void> {
  if (!sourceChannels.length) {
    console.log("[Scraper] No source channels configured");
    return;
  }

  if (!channelUsername) {
    console.log("[Scraper] No target channel configured");
    return;
  }

  // 1. Collect all candidates from all channels
  const candidates = await collectCandidates();
  console.log(`[Scraper] Found ${candidates.length} candidates`);

  if (!candidates.length) {
    console.log("[Scraper] No new candidates found");
    return;
  }

  // 2. AI selects best 1-2
  const selected = await selectBestPosts(candidates);
  console.log(`[Scraper] AI selected ${selected.length} posts`);

  // 3. Publish selected posts (with final duplicate check)
  for (const sel of selected) {
    const candidate = candidates[sel.index];

    // Final duplicate check against already posted content
    const duplicate = await isDuplicate(sel.formatted);
    if (duplicate) {
      console.log(`[Scraper] Duplicate skipped (final check): ${candidate.channel}#${candidate.msgId}`);
      continue;
    }

    try {
      const htmlMessage = sel.formatted
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(
          "🍋Limon Jobs",
          '<a href="https://t.me/limon_jobs">🍋Limon Jobs</a>'
        );

      const sent = await client.sendMessage(channelUsername, {
        message: htmlMessage,
        linkPreview: false,
        parseMode: "html",
      });

      await saveToRecent(sel.formatted);
      await saveCategory(sel.category);
      await savePostMapping(candidate.channel, candidate.msgId, sent.id);

      console.log(
        `[Scraper] Posted [${sel.category}] from ${candidate.channel}#${candidate.msgId} → ${channelUsername}#${sent.id}`
      );

      await new Promise((r) => setTimeout(r, 10_000));
    } catch (error: any) {
      if (error?.seconds) {
        console.log(`[Scraper] FloodWait: waiting ${error.seconds}s...`);
        await new Promise((r) => setTimeout(r, error.seconds * 1000));
      } else {
        console.error(`[Scraper] Error posting:`, error);
      }
    }
  }

  // 4. Mark all candidates as scraped (selected or not)
  const redis = await getRedis();
  for (const c of candidates) {
    await redis.setex(`scraped:${c.channel}:${c.msgId}`, POST_TTL, "1");
  }
}

// Check if source posts still exist, edit target if deleted
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
        // Post expired from Redis, remove from set
        await redis.srem("post_ids", targetIdStr);
        continue;
      }

      const { sourceChannel, sourceMessageId, targetMessageId } =
        JSON.parse(data);

      // Try to read the source message
      let sourceExists = true;
      try {
        const msgs = await client.getMessages(sourceChannel, {
          ids: [sourceMessageId],
        });
        // If message is deleted, getMessages returns empty or message with empty text
        if (!msgs.length || !msgs[0] || !msgs[0].text) {
          sourceExists = false;
        }
      } catch {
        sourceExists = false;
      }

      // Delay between post checks
      await new Promise((r) => setTimeout(r, 3_000));

      if (!sourceExists) {
        console.log(
          `[Scraper] Source post ${sourceChannel}#${sourceMessageId} deleted, editing target#${targetMessageId}`
        );

        try {
          // Get current target message
          const targetMsgs = await client.getMessages(channelUsername, {
            ids: [targetMessageId],
          });

          if (targetMsgs.length && targetMsgs[0] && targetMsgs[0].text) {
            const currentText = targetMsgs[0].text;

            // Check if already marked as closed
            if (currentText.includes("#yopildi")) continue;

            // Edit: replace #aktiv with #yopildi, remove contact info
            let editedText = currentText.replace("#aktiv", "#yopildi");

            // Replace "Murojaat uchun" line with "Vakansiya yopildi"
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

            console.log(
              `[Scraper] Marked target#${targetMessageId} as closed`
            );
          }
        } catch (editError) {
          console.error(
            `[Scraper] Error editing target#${targetMessageId}:`,
            editError
          );
        }

        // Remove from tracking
        await redis.srem("post_ids", targetIdStr);
        await redis.del(`post:${targetIdStr}`);
      }
    } catch (error) {
      console.error(
        `[Scraper] Error checking post ${targetIdStr}:`,
        error
      );
    }
  }
}

// Check if current time is within posting hours (08:00 - 21:00 Tashkent)
function isPostingHours(): boolean {
  const now = new Date();
  // UTC+5 for Tashkent
  const tashkentHour = (now.getUTCHours() + 5) % 24;
  return tashkentHour >= 8 && tashkentHour < 21;
}

// Main CRON job
async function runScraper(): Promise<void> {
  if (!isPostingHours()) {
    console.log(`[Scraper] Outside posting hours (08:00-21:00 Tashkent), skipping`);
    return;
  }

  console.log(`[Scraper] Running at ${new Date().toISOString()}`);

  try {
    await scrapeSourceChannels();
    await checkExistingPosts();
  } catch (error) {
    console.error("[Scraper] Error in scraper run:", error);
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
