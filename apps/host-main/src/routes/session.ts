import {
  getAgentName,
  Chat,
  listenEvent,
  Schema,
  question,
  questionForce,
} from "agent-swarm-kit";
import { app, upgradeWebSocket } from "../config/app";
import { SwarmName } from "@modules/remote-lib";
import { getErrorMessage } from "functools-kit";
import fs from "fs/promises";

async function fileToBase64(path: string) {
  const data = await fs.readFile(path);
  return data.toString('base64');
}

app.get(
  "/api/v1/session/:clientId",
  upgradeWebSocket((ctx) => {
    const clientId = ctx.req.param("clientId");

    const clientLocale = new URL(ctx.req.url).searchParams.get("locale");

    console.log(`Connected: ${clientId} locale: ${clientLocale}`);
    let swarm = SwarmName.RootSwarmEn;
    if (clientLocale === "uz") {
      swarm = SwarmName.RootSwarmUz;
    } else if (clientLocale === "ru") {
      swarm = SwarmName.RootSwarmRu;
    }
    return {
      async onOpen(_, ws) {
        await Chat.beginChat(clientId, swarm);

        const unToken = listenEvent(clientId, "llm-new-token", (token) => {
          ws.send(JSON.stringify({ type: "token", token }));
        });

        const unImage = listenEvent(clientId, "new-generated-image", async (path: string) => {
          ws.send(JSON.stringify({
            type: "image",
            image: await fileToBase64(path),
          }))
        });

        const unCreditPayAction = listenEvent(clientId, `app-action-credit-payment`, async (payload) => {
          ws.send(JSON.stringify({
            type: "app-action-credit-payment",
            payload,
          }))
        });
        const unElectricityPayAction = listenEvent(clientId, `app-action-electricity-payment`, async (payload) => {
          ws.send(JSON.stringify({
            type: "app-action-electricity-payment",
            payload,
          }))
        });
        const unGasPayAction = listenEvent(clientId, `app-action-gas-payment`, async (payload) => {
          ws.send(JSON.stringify({
            type: "app-action-gas-payment",
            payload,
          }))
        });
        const unGovernmentPayAction = listenEvent(clientId, `app-action-government-service-payment`, async (payload) => {
          ws.send(JSON.stringify({
            type: "app-action-government-service-payment",
            payload,
          }))
        });
        const unInternetPayAction = listenEvent(clientId, `app-action-internet-payment`, async (payload) => {
          ws.send(JSON.stringify({
            type: "app-action-internet-payment",
            payload,
          }))
        });
        const unMobilePayAction = listenEvent(clientId, `app-action-mobile-operator-payment`, async (payload) => {
          ws.send(JSON.stringify({
            type: "app-action-mobile-operator-payment",
            payload,
          }))
        });
        const unP2PPayAction = listenEvent(clientId, `app-action-send-payment-modal`, async (payload) => {
          ws.send(JSON.stringify({
            type: "app-action-send-payment-modal",
            payload,
          }))
        });
        const unTransportPayAction = listenEvent(clientId, `app-action-transport-service-payment`, async (payload) => {
          ws.send(JSON.stringify({
            type: "app-action-transport-service-payment",
            payload,
          }))
        });
        const unWaterPayAction = listenEvent(clientId, `app-action-water-payment`, async (payload) => {
          ws.send(JSON.stringify({
            type: "app-action-water-payment",
            payload,
          }))
        });

        Chat.listenDispose(clientId, swarm, () => {
          unToken();
          unImage();
          unCreditPayAction();
          unElectricityPayAction();
          unGasPayAction();
          unGovernmentPayAction();
          unInternetPayAction();
          unMobilePayAction();
          unP2PPayAction();
          unTransportPayAction();
          unWaterPayAction();
        });
      },
      async onMessage(event, ws) {
        const incoming = JSON.parse(event.data.toString());
        try {
          const completion = await Chat.sendMessage(
            clientId,
            incoming.data,
            swarm
          );
          ws.send(
            JSON.stringify({
              type: "completion",
              completion,
            })
          );
        } catch (error) {
          console.log(getErrorMessage(error));
        }
      },
      onClose: () => {
        console.log("Disconnected");
        
        Chat.dispose(clientId, swarm);
      },
    };
  })
);

export default app;
