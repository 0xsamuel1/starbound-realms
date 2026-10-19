import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

// Shared flat config for frontend, backend, and sdk. Each package's own
// `lint` script runs this against just its own directory.
export default tseslint.config(
  { ignores: ["**/dist/**", "**/node_modules/**", "**/target/**"] },
  ...tseslint.configs.recommended,
  {
    files: ["frontend/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
);
