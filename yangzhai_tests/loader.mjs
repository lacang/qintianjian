export async function resolve(spec, ctx, next) {
  if (typeof spec === 'string' && spec.includes('?v=')) spec = spec.replace(/\?v=\d+$/, '');
  return next(spec, ctx);
}
