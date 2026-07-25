import { fileURLToPath } from 'node:url';
import { readFile, readdir, stat, mkdir, copyFile } from 'node:fs/promises';
import { join, dirname, relative } from 'node:path';
import type { AstroIntegration } from 'astro';

// src/content/resources/ 下的 PDF 与 md 同目录存放。
// Astro 的 content loader 只匹配 md/mdx，不会把 PDF 当作资产打包，
// markdown 里的相对链接会变成 404。此集成负责把 PDF 复制到构建产物，
// 并在 dev 时用中间件服务这些请求；页面用绝对路径 /resources/.../*.pdf 引用。
const RESOURCES_URL = new URL('../content/resources/', import.meta.url);

async function* walkPdfs(dir: string): AsyncGenerator<string> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkPdfs(full);
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.pdf')) {
      yield full;
    }
  }
}

const servePdf = (srcRoot: string) => async (req: any, res: any, next: any) => {
  const path = (req.url || '').split('?')[0];
  const m = path.match(/\/resources\/(.+\.pdf)$/i);
  if (!m) { next(); return; }
  const file = join(srcRoot, decodeURIComponent(m[1]));
  try {
    const s = await stat(file);
    if (!s.isFile()) { next(); return; }
    const buf = await readFile(file);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', String(buf.length));
    res.setHeader('Cache-Control', 'no-cache');
    res.end(buf);
  } catch {
    next();
  }
};

// Vite 插件：dev 时拦截 /resources/**/*.pdf 请求，从 src 目录直读 PDF 返回。
// 用 post-hook（configureServer 返回函数）在所有中间件安装后再注册，
// 并 unshift 到栈首，从而先于 Astro 的 /resources/[...id] 路由处理 PDF 请求
// （否则该动态路由会在 dev 下匹配 *.pdf 路径并直接返回 404）。
const pdfDevPlugin = {
  name: 'pdf-assets-dev',
  configureServer(server: any) {
    const srcRoot = fileURLToPath(RESOURCES_URL);
    return () => {
      server.middlewares.use(servePdf(srcRoot));
      const stack = server.middlewares.stack as any[] | undefined;
      const entry = stack?.pop();
      if (entry) stack!.unshift(entry);
    };
  },
};

export default function pdfAssets(): AstroIntegration {
  return {
    name: 'pdf-assets',
    hooks: {
      'astro:config:setup': async ({ updateConfig }) => {
        updateConfig({ vite: { plugins: [pdfDevPlugin] } } as any);
      },
      'astro:build:done': async ({ dir, logger }) => {
        const outDir = fileURLToPath(dir);
        const srcRoot = fileURLToPath(RESOURCES_URL);
        let count = 0;
        for await (const pdf of walkPdfs(srcRoot)) {
          const rel = relative(srcRoot, pdf);
          const dest = join(outDir, 'resources', rel);
          await mkdir(dirname(dest), { recursive: true });
          await copyFile(pdf, dest);
          count++;
        }
        if (count) logger.info(`Copied ${count} PDF asset(s) into dist/resources.`);
      },
    },
  };
}
