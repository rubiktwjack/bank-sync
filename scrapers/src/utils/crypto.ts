import { createCipheriv, randomBytes } from 'node:crypto'

/**
 * AES-256-GCM 加密
 * 金鑰從環境變數 SYNC_ENCRYPTION_KEY 讀取（hex 格式，64 字元 = 32 bytes）
 * 輸出格式：JSON { iv, data, tag } 全部 base64
 */
export function encrypt(plaintext: string): string {
  const keyHex = process.env.SYNC_ENCRYPTION_KEY
  if (!keyHex || keyHex.length !== 64) {
    throw new Error('SYNC_ENCRYPTION_KEY 必須是 64 字元的 hex 字串（32 bytes）')
  }

  const key = Buffer.from(keyHex, 'hex')
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ])
  const tag = cipher.getAuthTag()

  return JSON.stringify({
    iv: iv.toString('base64'),
    data: encrypted.toString('base64'),
    tag: tag.toString('base64'),
  })
}
