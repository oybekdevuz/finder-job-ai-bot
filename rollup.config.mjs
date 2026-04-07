import peerDepsExternal from "rollup-plugin-peer-deps-external";
import typescript from "@rollup/plugin-typescript";
import injectProcessEnv from 'rollup-plugin-inject-process-env';
import { dts } from "rollup-plugin-dts";

const getEnv = () => Object.fromEntries(
  Object.entries(process.env).filter(([key]) => key.startsWith('CC_'))
);

export default [
  {
    input: ["src/index.ts", "src/repl.ts"],
    output: [
      {
        dir: "build",
        sourcemap: true,
        format: "esm",
        entryFileNames: "[name].mjs",
      },
      {
        dir: "build",
        sourcemap: true,
        format: "commonjs",
        entryFileNames: "[name].cjs",
      },
    ],
    external: ['fs', 'url', 'path'],
    plugins: [
      peerDepsExternal({
        includeDependencies: true,
      }),
      typescript({
        tsconfig: "./tsconfig.json",
        noEmit: false,
        outDir: "build",
      }),
      injectProcessEnv(getEnv()),
    ],
  },
  {
    input: "src/index.ts",
    output: { 
      file: "build/index.d.ts", 
      format: "es" 
    },
    plugins: [dts()],
  }
];