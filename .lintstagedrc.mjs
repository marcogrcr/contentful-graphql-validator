export default {
  /**
   * prettier supported extensions
   * @see https://prettier.io/docs/en/
   * @see https://github.com/prettier/prettier/blob/main/CHANGELOG.md#skip-explicitly-passed-symbolic-links-with---no-error-on-unmatched-pattern-15533-by-sanmai-nl
   */
  "*.{css,graphql,html,json,less,md,scss,yml,yaml}":
    "prettier --write --no-error-on-unmatched-pattern",

  /**
   * eslint for JavaScript and TypeScript
   */
  "*.{cjs,cjsx,cts,ctsx,js,jsx,mjs,mjsx,mts,mtsx,ts,tsx}": "eslint --fix",
};
