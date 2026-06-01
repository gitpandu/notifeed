import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default [
    {
        ignores: [
            "dist/**",
            "client/dist/**",
            "node_modules/**",
        ],
    },

    js.configs.recommended,
    ...tseslint.configs.recommended,

    {
        files: ["client/**/*.{ts,tsx}", "server/**/*.ts"],
        plugins: {
            "react-hooks": reactHooks,
        },
        rules: {
            "react-hooks/rules-of-hooks": "error",
            "react-hooks/exhaustive-deps": "warn",
        },
    },
];