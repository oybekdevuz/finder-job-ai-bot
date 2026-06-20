const dotenv = require("dotenv");
const fs = require("fs");

const apps = [
  {
    name: "limon-job-bot",
    exec_mode: "fork",
    instances: "1",
    autorestart: true,
    max_restarts: "5",
    cron_restart: "0 0 * * *",
    max_memory_restart: "1250M",
    script: "./apps/host-main/build/index.mjs",
    stop_signal: "SIGINT",
    env: dotenv.parse(fs.readFileSync("./.env")),
  },
];

module.exports = {
  apps,
};
