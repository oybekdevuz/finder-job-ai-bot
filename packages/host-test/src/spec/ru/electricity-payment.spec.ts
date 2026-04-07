import { Chat, commitToolOutput, emit, getAgentName, getLastAssistantMessage, overrideAgent, overrideSwarm, overrideTool } from "agent-swarm-kit";
import { randomString } from "functools-kit";
import { test } from "worker-testbed";
import { AgentName, SwarmName, ToolName } from "@modules/remote-lib";
import fs from "fs/promises";

const CLIENT_ID = `test-client-id-${randomString()}`;

{
    const TEST_NAME = "RU: Electricity Payment will work for direct ask";

    test(TEST_NAME, async (t) => {
        let isCalled = false;

        overrideTool({
            toolName: ToolName.PayElectricityToolRu,
            call: async ({ toolId, clientId, agentName, params }) => {
                await fs.appendFile("logs/test.log", `[INFO] ${TEST_NAME}, Tool called with params: ${JSON.stringify(params)}\n`);
                isCalled = true;
                await commitToolOutput(toolId, "Ok", clientId, agentName);
                await emit("Ok", clientId, agentName);
            }
        });

        await Chat.sendMessage(CLIENT_ID, "Я хочу оплатить электроэнергию 500000 сум в Мирободском районе", SwarmName.RootSwarmRu);

        if (isCalled) {
            await fs.appendFile("logs/test.log", `[PASS] ${TEST_NAME}, Tool was called successfully\n`);
            t.pass("Electricity payment tool was called successfully");
        } else {
            await fs.appendFile("logs/test.log", `[ERROR] ${TEST_NAME}, Tool was not called. Assistant's last message: ${await getLastAssistantMessage(CLIENT_ID)}\n`);
            t.fail("Electricity payment tool was not called");
        }
    });
}

{
    const TEST_NAME = "RU: Electricity Payment will fail with missing parameter";

    test(TEST_NAME, async (t) => {
        let isCalled = false;

        overrideTool({
            toolName: ToolName.PayElectricityToolRu,
            call: async ({ toolId, clientId, agentName, params }) => {
                await fs.appendFile("logs/test.log", `[INFO] ${TEST_NAME}, Tool called with params: ${JSON.stringify(params)}\n`);
                isCalled = true;
                await commitToolOutput(toolId, "Ok", clientId, agentName);
                await emit("Ok", clientId, agentName);
            }
        });

        await Chat.sendMessage(CLIENT_ID, "Я хочу оплатить электроэнергию 500000 сум", SwarmName.RootSwarmRu);

        if (!isCalled) {
            await fs.appendFile("logs/test.log", `[PASS] ${TEST_NAME}, Tool was not triggered due to missing required parameters\n`);
            t.pass("Electricity payment tool was not triggered due to missing required parameters");
        } else {
            await fs.appendFile("logs/test.log", `[ERROR] ${TEST_NAME}, Tool was called despite missing parameters. Assistant's last message: ${await getLastAssistantMessage(CLIENT_ID)}\n`);
            t.fail("Electricity payment tool was called despite missing parameters");
        }
    });
}

{
    const TEST_NAME = "RU: Navigation to electricity agent direct ask";

    test(TEST_NAME, async (t) => {
        await Chat.sendMessage(CLIENT_ID, "Я хочу оплатить электроэнергию", SwarmName.RootSwarmRu);
        const lastAgent = await getAgentName(CLIENT_ID);

        if (lastAgent === AgentName.ElectricityAgentRu) {
            await fs.appendFile("logs/test.log", `[PASS] ${TEST_NAME}, Triage agent navigated to electricity agent with direct ask\n`);
            t.pass("Triage agent navigated to electricity agent with direct ask");
        } else {
            await fs.appendFile("logs/test.log", `[ERROR] ${TEST_NAME}, Triage agent couldn't navigate to electricity agent. Assistant's last message: ${await getLastAssistantMessage(CLIENT_ID)}\n`);
            t.fail("Triage agent couldn't navigate to electricity agent with direct ask");
        }
    });
}

{
    const TEST_NAME = "RU: Electricity Payment will work with user's history details";

    test(TEST_NAME, async (t) => {
        let isCalled = false;

        overrideTool({
            toolName: ToolName.PayElectricityToolRu,
            call: async ({ toolId, clientId, agentName, params }) => {
                await fs.appendFile("logs/test.log", `[INFO] ${TEST_NAME}, Tool called with params: ${JSON.stringify(params)}\n`);
                isCalled = true;
                await commitToolOutput(toolId, "Ok", clientId, agentName);
                await emit("Ok", clientId, agentName);
            }
        });

        overrideAgent({
            agentName: AgentName.ElectricityAgentRu,
            systemDynamic: async (clientId: string) => {
                return [`Это последняя оплата пользователя: ${JSON.stringify({ region: "Ташкент", district: "Мирободское", amount: "500000" })}.`];
            },
        });

        await Chat.sendMessage(CLIENT_ID, "Я хочу платить за электричество, используя мои последние данные. Я уверен", SwarmName.RootSwarmRu);

        if (isCalled) {
            await fs.appendFile("logs/test.log", `[PASS] ${TEST_NAME}, Tool used user's latest payment details successfully\n`);
            t.pass("Electricity agent paid with user's latest payment details");
        } else {
            await fs.appendFile("logs/test.log", `[ERROR] ${TEST_NAME}, Tool couldn't use user's latest payment details. Assistant's last message: ${await getLastAssistantMessage(CLIENT_ID)}\n`);
            t.fail("Electricity agent couldn't pay with user's latest payment details");
        }
    });
}

{
    const TEST_NAME = "RU: Navigation to triage agent from Electricity Agent with direct ask";

    test(TEST_NAME, async (t) => {
        overrideSwarm({
            swarmName: SwarmName.RootSwarmRu,
            getActiveAgent: async () => AgentName.ElectricityAgentRu,
        });

        let isCalled = false;

        overrideTool({
            toolName: ToolName.NavigateToTriageToolRu,
            call: async ({ toolId, clientId, agentName, params }) => {
                await fs.appendFile("logs/test.log", `[INFO] ${TEST_NAME}, Navigation tool called\n`);
                isCalled = true;
                await commitToolOutput(toolId, "Ok", clientId, agentName);
                await emit("Ok", clientId, agentName);
            }
        });

        await Chat.sendMessage(CLIENT_ID, "Переведи меня к агенту triage", SwarmName.RootSwarmRu);

        if (isCalled) {
            await fs.appendFile("logs/test.log", `[PASS] ${TEST_NAME}, Navigation to triage agent succeeded\n`);
            t.pass("Electricity agent navigated to triage agent with direct ask");
        } else {
            await fs.appendFile("logs/test.log", `[ERROR] ${TEST_NAME}, Navigation to triage agent failed. Assistant's last message: ${await getLastAssistantMessage(CLIENT_ID)}\n`);
            t.fail("Electricity agent couldn't navigate to triage agent with direct ask");
        }
    });
}
