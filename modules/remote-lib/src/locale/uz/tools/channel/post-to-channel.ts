import {
  addTool,
  commitToolOutput,
  execute,
} from "agent-swarm-kit";
import { ToolName } from "src/enum/ToolName";
import { z } from "zod";

const PARAMETER_SCHEMA = z
  .object({
    message: z.string().describe("Kanalga yuboriladigan post matni"),
  })
  .strict();

// Telegram client will be injected from the main app
let sendToChannel: ((message: string) => Promise<void>) | null = null;

export function setSendToChannel(fn: (message: string) => Promise<void>) {
  sendToChannel = fn;
}

addTool({
  toolName: ToolName.PostToChannelTool,
  type: "function",

  validate: async ({ params }) => {
    return PARAMETER_SCHEMA.safeParse(params).success;
  },

  call: async ({ toolId, clientId, agentName, params }) => {
    const message = params.message as string;

    if (!message || !message.trim()) {
      await commitToolOutput(
        toolId,
        "Xatolik: Post matni bo'sh bo'lmasligi kerak.",
        clientId,
        agentName
      );
      await execute(
        "Foydalanuvchiga post matni bo'sh ekanligini ayting va qayta so'rang.",
        clientId,
        agentName
      );
      return;
    }

    if (!sendToChannel) {
      await commitToolOutput(
        toolId,
        "Xatolik: Telegram client ulanmagan yoki kanal sozlanmagan.",
        clientId,
        agentName
      );
      return;
    }

    try {
      console.log(`[PostToChannel] Sending post to channel...`);
      await sendToChannel(message);
      console.log(`[PostToChannel] Post sent successfully`);
      await commitToolOutput(
        toolId,
        "Post muvaffaqiyatli kanalga joylandi.",
        clientId,
        agentName
      );
      await execute(
        "Foydalanuvchiga post muvaffaqiyatli kanalga joylanganligini xabar bering.",
        clientId,
        agentName
      );
    } catch (error) {
      console.error(`[PostToChannel] Error:`, error);
      await commitToolOutput(
        toolId,
        `Xatolik: Kanalga post yuborishda muammo yuz berdi - ${error}`,
        clientId,
        agentName
      );
      await execute(
        "Foydalanuvchiga kanalga post yuborishda xatolik yuz berganini ayting.",
        clientId,
        agentName
      );
    }
  },

  function: {
    name: "post_to_channel_tool",
    description:
      "Telegram kanalga ish e'lonini post qilish. Foydalanuvchidan barcha kerakli ma'lumotlar (lavozim, kompaniya, maosh, talablar, aloqa) to'plangandan keyin, chiroyli formatda post tayyorlab shu tool orqali kanalga joylang.",
    parameters: {
      type: "object",
      properties: {
        message: {
          type: "string",
          description:
            "Kanalga yuboriladigan tayyor post matni. Emoji va chiroyli format bilan. Masalan:\n\n🏢 Kompaniya: ...\n💼 Lavozim: ...\n📍 Joylashuv: ...\n💰 Maosh: ...\n📋 Talablar: ...\n📞 Aloqa: ...",
        },
      },
      required: ["message"],
    },
  },
});
