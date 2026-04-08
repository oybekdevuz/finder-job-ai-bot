import { addAgent, Logger } from "agent-swarm-kit";
import { str } from "functools-kit";
import { AgentName } from "../../../enum/AgentName";
import { CompletionName } from "../../../enum/CompletionName";
import { ToolName } from "../../../enum/ToolName";
import { POLICY_PROMPT, JOB_FINDER_PROMPT } from "../prompt";

export const AGENT_PROMPT = str.newline([
  "Sen Limon Jobs kanalining adminisan. Odamlar bilan xuddi oddiy inson kabi gaplash.",
  "Bot emassan, adminsan. Samimiy, qisqa va oddiy gaplash.",
  "Toollar borligini foydalanuvchi bilmasligi kerak.",
]);

addAgent({
  agentName: AgentName.TriageAgentUz,
  prompt: str.newline(AGENT_PROMPT),
  system: [JOB_FINDER_PROMPT, POLICY_PROMPT],
  completion: CompletionName.OpenAICompletion,
  tools: [ToolName.PostToChannelTool],
  callbacks: {
    onResurrect(clientId, agentName, mode, reason) {
      Logger.logClient(clientId, "Resurrected", agentName, mode, reason);
    },
  },
});
