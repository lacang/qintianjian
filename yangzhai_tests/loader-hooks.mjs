let intercept = null;
export function register(fn) { intercept = fn; }
export async function resolve(spec, ctx, next) {
  let s = spec;
  if (s.includes('?v=')) s = s.replace(/\?v=\d+$/, '');
  if (intercept) {
    const mapped = intercept(s);
    if (mapped) return next(mapped, ctx);
  }
  return next(s, ctx);
}
