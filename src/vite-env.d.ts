/// <reference types="vite/client" />
declare module '*?url' {
  const src: string;
  export default src;
}
// mammoth ships without TypeScript types; lazy-loaded as `any` in extractors.ts.
declare module 'mammoth';
