import { defineConfig } from "vite-plus";

export default defineConfig({
  staged: {
    "*": "vp check --fix",
  },
  fmt: {
    printWidth: 120,
    tabWidth: 2,
    useTabs: false,
    semi: true,
    singleQuote: false,
    trailingComma: "all",
    endOfLine: "lf",
    insertFinalNewline: true,
    bracketSpacing: true,
    arrowParens: "always",
    quoteProps: "as-needed",
    sortImports: {
      groups: ["builtin", "external", ["internal", "subpath"], ["parent", "sibling", "index"], "style", "unknown"],
      ignoreCase: true,
      newlinesBetween: true,
      order: "asc",
    },
    sortPackageJson: true,
    jsdoc: true,
    ignorePatterns: ["node_modules", "dist", ".git", ".cursor", "extension/src/common/tesseract"],
  },
  lint: {
    categories: {
      correctness: "warn",
      perf: "warn",
      suspicious: "warn",
    },
    ignorePatterns: ["node_modules", "dist", ".git", ".cursor", ".vite-hooks", "extension/src/common/tesseract"],
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
});
