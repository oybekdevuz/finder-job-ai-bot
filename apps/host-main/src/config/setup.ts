import { setBackend } from "@tensorflow/tfjs-core";
import { createLogger } from "pinolog";

import "@tensorflow/tfjs-backend-wasm";
import {
  dumpClientPerformance,
  setConfig,
  swarm,
} from "agent-swarm-kit";


setBackend("wasm");

setConfig({
  CC_KEEP_MESSAGES: 50,
  CC_LOGGER_ENABLE_INFO: true,
  CC_LOGGER_ENABLE_DEBUG: true,
  CC_LOGGER_ENABLE_LOG: true,
});

{
  const logger = createLogger("agent-swarm-kit.log");
  swarm.loggerService.setLogger({
    log: (...args) => logger.log(...args),
    debug: (...args) => logger.info(...args),
    info: (...args) => logger.info(...args),
  });
}

import "./persist"


dumpClientPerformance.runAfterExecute();
