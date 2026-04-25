import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    if (
      error?.code !== 'ERR_MODULE_NOT_FOUND'
      || !specifier.startsWith('.')
      || specifier.endsWith('.ts')
      || specifier.endsWith('.tsx')
      || specifier.endsWith('.js')
      || specifier.endsWith('.cjs')
      || specifier.endsWith('.mjs')
    ) {
      throw error;
    }

    const parentPath = context.parentURL ? fileURLToPath(context.parentURL) : process.cwd();
    const candidate = new URL(`${specifier}.ts`, pathToFileURL(parentPath));
    if (fs.existsSync(fileURLToPath(candidate))) {
      return {
        shortCircuit: true,
        url: candidate.href,
      };
    }

    throw error;
  }
}
