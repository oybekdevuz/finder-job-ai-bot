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

const SIX_HOURS = 6 * 60 * 60 * 1000;
const POST_TTL = 30 * 24 * 60 * 60; // 30 days in seconds

const openai = new OpenAI({
  apiKey: process.env.CC_OPENAI_API_KEY,
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
          content: `Sen ish e'lonlarini formatlash bo'yicha yordamchisan. Berilgan matndan ish e'loni ma'lumotlarini ajratib ol va AYNAN quyidagi formatda qaytar. Agar matn ish e'loni bo'lmasa, "SKIP" deb yoz.

FORMAT (aynan shu tartibda, hech narsa qo'shma, hech narsa olib tashlama):

{Lavozim nomi}

— Ish holati: #aktiv

🏢 Kompaniya: {kompaniya yoki "Ko'rsatilmagan"}

— Ish turi: {Offline/Online/Gibrid}

💰 Maosh: {maosh yoki "Kelishiladi"}

— Talablar:
{talablar ro'yxati}

— Murojaat uchun: {aloqa ma'lumotlari}

📍 Manzil: {manzil yoki "Ko'rsatilmagan"}

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

// Scrape latest posts from source channels
async function scrapeSourceChannels(): Promise<void> {
  if (!sourceChannels.length) {
    console.log("[Scraper] No source channels configured");
    return;
  }

  if (!channelUsername) {
    console.log("[Scraper] No target channel configured");
    return;
  }

  console.log(
    `[Scraper] Scraping ${sourceChannels.length} source channels...`
  );

  for (const channel of sourceChannels) {
    try {
      console.log(`[Scraper] Reading from ${channel}...`);

      const messages = await client.getMessages(channel, { limit: 20 });

      let newPosts = 0;

      for (const msg of messages) {
        if (!msg.text || msg.text.length < 30) continue;

        const alreadyScraped = await isAlreadyScraped(channel, msg.id);
        if (alreadyScraped) continue;

        // Format the post
        const formatted = await formatJobPost(msg.text, channel);
        if (!formatted) {
          // Mark as scraped even if not a job post, to avoid re-processing
          const redis = await getRedis();
          await redis.setex(`scraped:${channel}:${msg.id}`, POST_TTL, "1");
          continue;
        }

        // Post to target channel
        const sent = await client.sendMessage(channelUsername, {
          message: formatted,
        });

        // Save mapping
        await savePostMapping(channel, msg.id, sent.id);
        newPosts++;

        console.log(
          `[Scraper] Posted from ${channel}#${msg.id} → ${channelUsername}#${sent.id}`
        );

        // Small delay to avoid flood
        await new Promise((r) => setTimeout(r, 2000));
      }

      console.log(`[Scraper] ${channel}: ${newPosts} new posts`);
    } catch (error) {
      console.error(`[Scraper] Error scraping ${channel}:`, error);
    }
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

// Main CRON job
async function runScraper(): Promise<void> {
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
  console.log(`[Scraper] CRON: every 6 hours`);

  // First run after 10 seconds (let everything initialize)
  setTimeout(() => {
    runScraper();
  }, 10_000);

  // Then every 6 hours
  setInterval(() => {
    runScraper();
  }, SIX_HOURS);
}
