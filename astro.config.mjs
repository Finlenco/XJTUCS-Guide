import { defineConfig } from 'astro/config';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import pdfAssets from './src/integrations/pdf-assets';

export default defineConfig({
  site: 'https://xjtucs-hub.github.io',
  base: '/XJTUCS-Guide',
  output: 'static',
  integrations: [pdfAssets()],
  markdown: {
    remarkPlugins: [remarkMath],
    rehypePlugins: [rehypeKatex],
  },
});
