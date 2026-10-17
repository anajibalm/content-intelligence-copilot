import { globalIgnores } from "eslint/config";
import nextConfig from "eslint-config-next/core-web-vitals";

const config = [...nextConfig, globalIgnores(["playwright-report/**", "test-results/**"])]
export default config
