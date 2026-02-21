import { createCipheriv, createDecipheriv, randomBytes, pbkdf2Sync } from 'node:crypto'

/**
 * AES-256-GCM 加密（密碼版）
 * 密碼從環境變數 SYNC_PASSWORD 讀取
 * 用 PBKDF2 從密碼導出 AES-256 金鑰
 * 輸出格式：JSON { salt, iv, data, tag } 全部 base64
 */
export function encrypt(plaintext: string): string {
  const password = process.env.SYNC_PASSWORD
  if (!password) {
    throw new Error('SYNC_PASSWORD 環境變數未設定')
  }

  const salt = randomBytes(16)
  const key = pbkdf2Sync(password, salt, 100000, 32, 'sha256')
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ])
  const tag = cipher.getAuthTag()

  return JSON.stringify({
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    data: encrypted.toString('base64'),
    tag: tag.toString('base64'),
  })
}

export function decrypt(ciphertext: string): string {
  const password = process.env.SYNC_PASSWORD
  if (!password) {
    throw new Error('SYNC_PASSWORD 環境變數未設定')
  }

  const { salt, iv, data, tag } = JSON.parse(ciphertext)
  const key = pbkdf2Sync(password, Buffer.from(salt, 'base64'), 100000, 32, 'sha256')
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'))
  decipher.setAuthTag(Buffer.from(tag, 'base64'))

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(data, 'base64')),
    decipher.final(),
  ])

  return decrypted.toString('utf8')
}
