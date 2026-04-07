import "./config/setup";

import { run } from "worker-testbed";

// Import your tests HERE
// import "./spec/ru/electricity-payment.spec";
// import "./spec/uz/electricity-payment.spec";


// import "./spec/ru/p2p-payment.spec";
// import "./spec/uz/p2p-payment.spec";

run(import.meta.url, () => {
  console.log("All tests are finished");
  process.exit(-1);
});
