import { globalIgnores } from "eslint/config";
import nextConfig from "eslint-config-next/core-web-vitals";

const config = [...nextConfig, globalIgnores(["playwright-report/**", "test-results/**"]), {
    files: ["app/**/*.{js,mjs,cjs,ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { regex: "^pg(?:/.*)?$", message: "Database imports belong outside app UI code." },
            { regex: "^node:.*$", message: "Node built-ins belong outside app UI code." },
            { regex: "^(?:fs|child_process)(?:/.*)?$", message: "Node built-ins belong outside app UI code." },
            { regex: "^(?:@/)?(?:\\.\\.?/)*lib/(?:.*\\/)?postgres(?:/.*|\\.[^/]*)?$", message: "Postgres repositories belong outside app UI code." },
            { regex: "^(?:@/)?(?:\\.\\.?/)*lib/runtime(?:/|$)", message: "Runtime modules belong outside app UI code." },
            { regex: "^(?:@/)?(?:\\.\\.?/)*lib/processing(?:/|$)", message: "Processing modules belong outside app UI code." },
            { regex: "^(?:@/)?(?:\\.\\.?/)*lib/extraction(?:/|$)", message: "Extraction modules belong outside app UI code." },
            { regex: "^(?:@/)?(?:\\.\\.?/)*lib/acquisition/(?:credentialed|ytdlp)(?:/.*|\\.[^/]*)?$", message: "Provider acquisition belongs outside app UI code." },
          ],
        },
      ],
    },
  },
  {
    files: ["app/api/**/*.{js,mjs,cjs,ts,tsx}"],
    rules: { "no-restricted-imports": "off" },
  },
  {
    files: ["lib/**/*.{js,mjs,cjs,ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { regex: "^(?:@/)?(?:\\.\\.?/)*app(?:/|$)", message: "lib modules must not import from app." },
          ],
        },
      ],
    },
  },
];
export default config;
