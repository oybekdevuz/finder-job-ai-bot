import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
// import { NewMessage, NewMessageEvent } from "telegram/events/index.js";
// import { Chat } from "agent-swarm-kit";
// import { SwarmName, setSendToChannel } from "@modules/remote-lib";
import * as readline from "readline";

declare function parseInt(s: unknown): number;

const apiId = parseInt(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH!;
const sessionString = process.env.TELEGRAM_SESSION || "";

export const client = new TelegramClient(
  new StringSession(sessionString),
  apiId,
  apiHash,
  {
    connectionRetries: 5,
  }
);

// Helper for readline prompts during first login
function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

// TODO: Private chat handler (hozircha o'chirilgan)
// async function handleNewMessage(event: NewMessageEvent) {
//   const message = event.message;
//   if (message.out) return;
//   if (!event.isPrivate) return;
//   const chatId = message.chatId?.toString();
//   if (!chatId) return;
//   const text = message.text;
//   if (!text) return;
//   const clientId = chatId;
//   const swarmName = SwarmName.RootSwarm;
//   try {
//     if (!activeSessions.has(clientId)) {
//       await Chat.beginChat(clientId, swarmName);
//       activeSessions.set(clientId, swarmName);
//     }
//     const answer = await Chat.sendMessage(clientId, text, swarmName);
//     if (!answer || !answer.trim()) return;
//     await client.sendMessage(chatId, { message: answer });
//   } catch (error) {
//     console.error(`Error processing message:`, error);
//     await client.sendMessage(chatId, {
//       message: "Kechirasiz, xatolik yuz berdi. Iltimos, qaytadan urinib ko'ring.",
//     });
//   }
// }

export const startTelegramBot = async () => {
  console.log("Starting Telegram userbot...");

  await client.start({
    phoneNumber: async () => await prompt("Telefon raqamingizni kiriting: "),
    password: async () => await prompt("2FA parolingizni kiriting: "),
    phoneCode: async () => await prompt("Telegram yuborgan kodni kiriting: "),
    onError: (err) => console.error("Telegram auth error:", err),
  });

  console.log("Telegram userbot connected!");

  // Save session string for future use
  const session = client.session.save() as unknown as string;
  if (session && !sessionString) {
    console.log("========================================");
    console.log("TELEGRAM_SESSION ni .env fayliga saqlang:");
    console.log(session);
    console.log("========================================");
  }

  // TODO: Private chat handler (hozircha o'chirilgan)
  // client.addEventHandler(handleNewMessage, new NewMessage({}));

  console.log("Telegram userbot started successfully!");
};
