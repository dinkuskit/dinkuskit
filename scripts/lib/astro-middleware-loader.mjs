import { register } from 'node:module';

let registered = false;

export function registerAstroMiddlewareLoader() {
  if (registered) return;
  register('data:text/javascript,' + encodeURIComponent(`
    export async function resolve(specifier, context, nextResolve) {
      if (specifier === 'astro:middleware') {
        return nextResolve('astro/middleware', context);
      }
      return nextResolve(specifier, context);
    }
  `));
  registered = true;
}
