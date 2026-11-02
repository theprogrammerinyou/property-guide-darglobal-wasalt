import js from "@eslint/js";
import globals from "globals";

export default [
  {
    ignores: ["node_modules/**"]
  },
  js.configs.recommended,
  {
    files: ["src/**/*.js", "tests/**/*.js", "eslint.config.js"],
    languageOptions: {
      globals: globals.node
    }
  },
  {
    files: ["public/**/*.js"],
    languageOptions: {
      globals: globals.browser
    }
  }
];
