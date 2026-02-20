const timestamp = () => new Date().toISOString().slice(11, 19)

export const logger = {
  info: (msg: string) => console.log(`[${timestamp()}] ${msg}`),
  warn: (msg: string) => console.warn(`[${timestamp()}] ⚠ ${msg}`),
  error: (msg: string) => console.error(`[${timestamp()}] ✗ ${msg}`),
}
