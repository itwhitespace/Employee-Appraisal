// PowerShell scripts are imported as their text (see next.config.mjs).
declare module "*.ps1" {
  const source: string;
  export default source;
}
