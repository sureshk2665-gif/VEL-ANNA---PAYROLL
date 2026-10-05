// The ERP business logic lives in the classic scripts under public/legacy/. Their top-level
// `function` declarations are globals on `window`; React components call them through here
// (at click time, so it does not matter that those scripts load after React renders).
export const callLegacy = (name, ...args) => {
  const fn = window[name];
  if (typeof fn !== 'function') {
    console.error(`Legacy function "${name}" is not loaded.`);
    return undefined;
  }
  return fn(...args);
};
