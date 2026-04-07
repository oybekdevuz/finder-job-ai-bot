import { Chat, commitToolOutput, emit, getAgentName, getLastAssistantMessage, overrideSwarm, overrideTool } from "agent-swarm-kit";
import { randomString } from "functools-kit";
import { test } from "worker-testbed";
import { AgentName, SwarmName, ToolName } from "@modules/remote-lib";
import fs from "fs/promises";

const CLIENT_ID = `test-client-id-${randomString()}`;

{
    const TEST_NAME = "RU: P2P Payment will work for direct ask";

    test(TEST_NAME, async (t) => {
        let isCalled = false;

        overrideTool({
            toolName: ToolName.PayP2PToolRu,
            call: async ({ toolId, clientId, agentName, params }) => {
                await fs.appendFile("logs/test.log", `[INFO] ${TEST_NAME}, P2P tool called with params: ${JSON.stringify(params)}\n`);
                isCalled = true;
                await commitToolOutput(toolId, "Ok", clientId, agentName);
                await emit("Ok", clientId, agentName);
            }
        });

        await Chat.sendMessage(CLIENT_ID, "Я хочу отправить деньги своему другу.", SwarmName.RootSwarmRu);

        if (isCalled) {
            await fs.appendFile("logs/test.log", `[PASS] ${TEST_NAME}, P2P tool was called successfully\n`);
            t.pass("P2P payment tool was called successfully");
        } else {
            await fs.appendFile("logs/test.log", `[ERROR] ${TEST_NAME}, P2P tool was not called. Assistant's last message: ${await getLastAssistantMessage(CLIENT_ID)}\n`);
            t.fail("P2P payment tool was not called");
        }
    });
}


{
    const TEST_NAME = "RU: Navigation to P2P agent direct ask";

    test(TEST_NAME, async (t) => {
        await Chat.sendMessage(CLIENT_ID, "Я хочу отправить деньги своему другу.", SwarmName.RootSwarmRu);
        const lastAgent = await getAgentName(CLIENT_ID);

        if (lastAgent === AgentName.P2PAgentRu) {
            await fs.appendFile("logs/test.log", `[PASS] ${TEST_NAME}, Triage agent navigated to P2P agent with direct ask\n`);
            t.pass("Triage agent navigated to P2P agent with direct ask");
        } else {
            await fs.appendFile("logs/test.log", `[ERROR] ${TEST_NAME}, Triage agent couldn't navigate to P2P agent with direct ask. Assistant's last message: ${await getLastAssistantMessage(CLIENT_ID)}\n`);
            t.fail("Triage agent couldn't navigate to P2P agent with direct ask");
        }
    });
}

{
    const TEST_NAME = "RU: Navigation to triage agent from P2P agent with direct ask";

    test(TEST_NAME, async (t) => {
        overrideSwarm({
            swarmName: SwarmName.RootSwarmRu,
            getActiveAgent: async () => AgentName.P2PAgentRu,
        });

        await Chat.sendMessage(CLIENT_ID, "Переведи меня к агенту triage", SwarmName.RootSwarmRu);

        const lastAgent = await getAgentName(CLIENT_ID);

        if (lastAgent === AgentName.TriageAgentRu) {
            await fs.appendFile("logs/test.log", `[PASS] ${TEST_NAME}, P2P agent navigated to triage agent with direct ask\n`);
            t.pass("P2P agent navigated to triage agent with direct ask");
        } else {
            await fs.appendFile("logs/test.log", `[ERROR] ${TEST_NAME}, P2P agent couldn't navigate to triage agent with direct ask. Assistant's last message: ${await getLastAssistantMessage(CLIENT_ID)}\n`);
            t.fail("P2P agent couldn't navigate to triage agent with direct ask");
        }
    });
}
