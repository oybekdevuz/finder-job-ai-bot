import { Chat, commitToolOutput, emit, getAgentName, getLastAssistantMessage, overrideAgent, overrideSwarm, overrideTool } from "agent-swarm-kit";
import { randomString } from "functools-kit";
import { test } from "worker-testbed";
import { AgentName, SwarmName, ToolName } from "@modules/remote-lib";
import fs from "fs/promises";

const CLIENT_ID = `test-client-id-${randomString()}`;

{
    const TEST_NAME = "UZ: Electricity Payment will work for direct ask";

    test(TEST_NAME, async (t) => {
        let isCalled = false;

        overrideTool({
            toolName: ToolName.PayElectricityToolUz,
            call: async ({ toolId, clientId, agentName, params }) => {
                await fs.appendFile("logs/test.log", `[INFO] ${TEST_NAME}, Tool called with params: ${JSON.stringify(params)}\n`);
                isCalled = true;
                await commitToolOutput(toolId, "Ok", clientId, agentName);
                await emit("Ok", clientId, agentName);
            }
        });

        await Chat.sendMessage(CLIENT_ID, "Men elektrga 50000 sum to'lamoqchiman Mirobod tumani uchun", SwarmName.RootSwarmUz);

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
    const TEST_NAME = "UZ: Electricity Payment will fail with missing parameter";

    test(TEST_NAME, async (t) => {
        let isCalled = false;

        overrideTool({
            toolName: ToolName.PayElectricityToolUz,
            call: async ({ toolId, clientId, agentName, params }) => {
                await fs.appendFile("logs/test.log", `[INFO] ${TEST_NAME}, Tool called with params: ${JSON.stringify(params)}\n`);
                isCalled = true;
                await commitToolOutput(toolId, "Ok", clientId, agentName);
                await emit("Ok", clientId, agentName);
            }
        });

        await Chat.sendMessage(CLIENT_ID, "Elektrga 500000 sum to'lamoqchiman", SwarmName.RootSwarmUz);

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
    const TEST_NAME = "UZ: Navigation to electricity agent direct ask";

    test(TEST_NAME, async (t) => {
        await Chat.sendMessage(CLIENT_ID, "Elektrga to'lov qilmoqchiman", SwarmName.RootSwarmUz);
        const lastAgent = await getAgentName(CLIENT_ID);

        if (lastAgent === AgentName.ElectricityAgentUz) {
            await fs.appendFile("logs/test.log", `[PASS] ${TEST_NAME}, Triage agent navigated to electricity agent with direct ask\n`);
            t.pass("Triage agent navigated to electricity agent with direct ask");
        } else {
            await fs.appendFile("logs/test.log", `[ERROR] ${TEST_NAME}, Triage agent couldn't navigate to electricity agent with direct ask. Assistant's last message: ${await getLastAssistantMessage(CLIENT_ID)}\n`);
            t.fail("Triage agent couldn't navigate to electricity agent with direct ask");
        }
    });
}

{
    const TEST_NAME = "UZ: Electricity Payment will work with user's history details";

    test(TEST_NAME, async (t) => {
        let isCalled = false;

        overrideTool({
            toolName: ToolName.PayElectricityToolUz,
            call: async ({ toolId, clientId, agentName, params }) => {
                await fs.appendFile("logs/test.log", `[INFO] ${TEST_NAME}, Tool called with params: ${JSON.stringify(params)}\n`);
                isCalled = true;
                await commitToolOutput(toolId, "Ok", clientId, agentName);
                await emit("Ok", clientId, agentName);
            }
        });

        overrideAgent({
            agentName: AgentName.ElectricityAgentUz,
            systemDynamic: async (clientId: string) => {
                return [`oxirgi elektr uchun to'lov qilingan tafsilotlar: ${JSON.stringify({ region: "Tashkent", district: "Mirobod", amount: "500000" })}.`];
            },
        });

        await Chat.sendMessage(CLIENT_ID, "Men oxirgi elektrga to'lagan manzilimga yana qayta shu miqdorda to'lamoqchiman", SwarmName.RootSwarmUz);

        if (isCalled) {
            await fs.appendFile("logs/test.log", `[PASS] ${TEST_NAME}, Tool paid using user's latest payment details\n`);
            t.pass("Electricity agent paid using user's latest payment details");
        } else {
            await fs.appendFile("logs/test.log", `[ERROR] ${TEST_NAME}, Tool couldn't pay using user's latest payment details. Assistant's last message: ${await getLastAssistantMessage(CLIENT_ID)}\n`);
            t.fail("Electricity agent couldn't pay using user's latest payment details");
        }
    });
}

{
    const TEST_NAME = "UZ: Navigation to triage agent from Electricity Agent with direct ask";

    test(TEST_NAME, async (t) => {
        overrideSwarm({
            swarmName: SwarmName.RootSwarmUz,
            getActiveAgent: async () => AgentName.ElectricityAgentUz,
        });

        let isCalled = false;

        overrideTool({
            toolName: ToolName.NavigateToTriageToolUz,
            call: async ({ toolId, clientId, agentName, params }) => {
                await fs.appendFile("logs/test.log", `[INFO] ${TEST_NAME}, Navigation tool called\n`);
                isCalled = true;
                await commitToolOutput(toolId, "Ok", clientId, agentName);
                await emit("Ok", clientId, agentName);
            }
        });

        await Chat.sendMessage(CLIENT_ID, "meni triage agentga yo'naltir", SwarmName.RootSwarmUz);

        if (isCalled) {
            await fs.appendFile("logs/test.log", `[PASS] ${TEST_NAME}, Electricity agent navigated to triage agent with direct ask\n`);
            t.pass("Electricity agent navigated to triage agent with direct ask");
        } else {
            await fs.appendFile("logs/test.log", `[ERROR] ${TEST_NAME}, Electricity agent couldn't navigate to triage agent with direct ask. Assistant's last message: ${await getLastAssistantMessage(CLIENT_ID)}\n`);
            t.fail("Electricity agent couldn't navigate to triage agent with direct ask");
        }
    });
}
