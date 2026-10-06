1
import { defineConfig, globalIgnores } from "eslint/config";
2
import nextVitals from "eslint-config-next/core-web-vitals";
3
import nextTs from "eslint-config-next/typescript";
4


5
const eslintConfig = defineConfig([
6
  ...nextVitals,
7
  ...nextTs,
8
  // Override default ignores of eslint-config-next.
9
  globalIgnores([
10
    // Default ignores of eslint-config-next:
11
    ".next/**",
12
    "out/**",
13
    "build/**",
14
    "next-env.d.ts",
15
  ]),
16
]);
17


18
export default eslintConfig;
