/** @type {import('prettier').Config & import('prettier-plugin-tailwindcss').PluginOptions} */
const config = {
  semi: true,
  singleQuote: false,
  trailingComma: "all",
  plugins: ["prettier-plugin-tailwindcss", "@prettier/plugin-oxc"],
};

export default config;
