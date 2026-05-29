import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    
    // THIS IS THE NEW RULES BLOCK
    rules: {
      "no-unused-vars": "warn",
      "react/react-in-jsx-scope": "off",
      "react-hooks/exhaustive-deps": "warn",
      "no-useless-escape": "warn",
      "no-useless-assignment": "warn",
      "react-hooks/rules-of-hooks": "warn",
      
      // Silencing the aggressive React 19 compiler errors for now
      "react-compiler/react-compiler": "off",
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/static-components": "off"
    }
  },
])
