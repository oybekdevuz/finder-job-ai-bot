import {
  addTool,
  commitSystemMessage,
  commitToolOutput,
  execute,
  getLastUserMessage,
  Schema,
  Storage,
} from "agent-swarm-kit";
import { str } from "functools-kit";
import { StorageName } from "src/enum/StorageName";
import { ToolName } from "src/enum/ToolName";
import { z } from "zod";

// Argumentlarni tekshirish uchun schema
const PARAMETER_SCHEMA = z
  .object({
    description: z.string().describe("Qidirilayotgan huquqiy mavzu"),
  })
  .strict();

addTool({
  // Tool nomini enum faylingizda to'g'ri belgilaganingizga ishonch hosil qiling
  toolName: ToolName.SearchLegalDocsToolUz,
  type: "function",

  validate: async ({ clientId, agentName, params }) => {
    const validationResult = PARAMETER_SCHEMA.safeParse(params);
    return validationResult.success;
  },

  call: async ({ toolId, clientId, agentName, params }) => {
    let search: string;

    // 1. Qidiruv so'zini aniqlash
    if (
      typeof params.description === "string" &&
      params.description.trim().length > 0
    ) {
      search = params.description.trim();
    } else {
      // Agar AI argument berishni unutgan bo'lsa, oxirgi user xabarini olamiz
      search = await getLastUserMessage(clientId);
    }

    // 2. Agar baribir qidiruv so'zi bo'lmasa -> Xatolik qaytarish
    if (!search) {
      await commitToolOutput(
        toolId,
        str.newline(`Xatolik: Qidiruv uchun kalit so'z topilmadi.`),
        clientId,
        agentName
      );
      // AIga buyruq: Aniqroq so'ra
      await execute(
        "Foydalanuvchidan qanday huquqiy ma'lumot kerakligini aniqlashtirib so'ra.",
        clientId,
        agentName
      );
      return;
    }

    // 3. Bazadan qidirish (RAG - Core qismi)
    // total: 3 qildim, chunki bitta modda yetmasligi mumkin.
    // score: 0.6 bu o'xshashlik chegarasi.
    const information = await Storage.take({
      search,
      total: 3,
      clientId,
      agentName,
      score: 0.6,
      storageName: StorageName.LegalDocsStorageUz,
    });

    // 4. Muvaffaqiyatli topilsa
    if (information?.length) {
      await commitToolOutput(
        toolId,
        str.newline(
          // Topilgan ma'lumotni AIga "yem" sifatida beramiz
          `Quyidagi huquqiy hujjatlar va moddalar topildi: ${Schema.serialize(
            information
          )}`
        ),
        clientId,
        agentName
      );

      // MUHIM: AIga "qidirib bo'lding, endi javob ber" deb buyruq beramiz.
      // Bu yerda "Do not search again" juda muhim, bo'lmasa AI cheksiz loopga tushib qolishi mumkin.
      await commitSystemMessage(
        "Kerakli moddalar topildi. Endi qayta qidirmasdan, faqat shu ma'lumotlarga asoslanib, Professional Yurist sifatida foydalanuvchiga javob bering.",
        clientId,
        agentName
      );

      // Bo'sh execute bu "Trigger" hisoblanadi, AI gapirishni boshlaydi.
      await execute("", clientId, agentName);
      return;
    }

    // 5. Agar hech narsa topilmasa
    await commitToolOutput(
      toolId,
      str.newline([
        "Bazada aniq ma'lumot topilmadi.",
        "Foydalanuvchiga 'Bilmayman' demang. Savolni o'zgartirishni so'rang.",
      ]),
      clientId,
      agentName
    );
    await execute(
      "Ma'lumot yetarli emas. Foydalanuvchidan savolni boshqacharoq yoki aniqroq berishini iltimos qiling.",
      clientId,
      agentName
    );
  },

  // 6. OpenAI/Gemini uchun Tool tavsifi (Model buni o'qiydi)
  function: {
    name: "qonunlarni_qidirish_tool_uz",
    description:
      "O'zbekiston Respublikasi Konstitutsiyasi, Kodekslari va qonunlari bo'yicha qidiruv tizimi. Foydalanuvchi har qanday huquqiy savol berganda, javob berishdan oldin HAR DOIM shu tooldan foydalaning.",
    parameters: {
      type: "object",
      properties: {
        description: {
          type: "string",
          // Bu yerda AIni o'zbekcha kalit so'zlar ishlatishga undaymiz
          description:
            "Qidirilayotgan huquqiy muammo yoki kalit so'zlar (masalan: 'ishdan bo'shatish tartibi', 'aliment miqdori', 'pasport yo'qolishi').",
        },
      },
      required: ["description"],
    },
  },
});
