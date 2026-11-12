import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  { ignores: ["next-env.d.ts", ".next/**", ".typology-matrix-build/**", "node_modules/**", "public/vendor/**"] },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  { files: ["scripts/**/*.cjs", "scripts/**/*.js", "reports/**/*.cjs"], rules: { "@typescript-eslint/no-require-imports": "off" } },
];

export default eslintConfig;
