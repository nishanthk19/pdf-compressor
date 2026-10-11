export const fail = (message, status = 400) =>
  Object.assign(new Error(message), { status });
