/**
 * 瀏覽器端 AES-256-GCM 解密（Web Crypto API + PBKDF2）
 * 使用者輸入密碼 → PBKDF2 導出金鑰 → 解密
 */

interface EncryptedPayload {
  salt: string
  iv: string
  data: string
  tag: string
}

export async function decrypt(encryptedJson: string, password: string): Promise<string> {
  const { salt, iv, data, tag } = JSON.parse(encryptedJson) as EncryptedPayload

  const saltBytes = Uint8Array.from(atob(salt), (c) => c.charCodeAt(0))
  const ivBytes = Uint8Array.from(atob(iv), (c) => c.charCodeAt(0))
  const dataBytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0))
  const tagBytes = Uint8Array.from(atob(tag), (c) => c.charCodeAt(0))

  // AES-GCM 需要把 ciphertext + tag 合併
  const combined = new Uint8Array(dataBytes.length + tagBytes.length)
  combined.set(dataBytes)
  combined.set(tagBytes, dataBytes.length)

  // 密碼 → PBKDF2 → AES-256 key
  const enc = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  )

  const cryptoKey = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: saltBytes, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  )

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: ivBytes },
    cryptoKey,
    combined,
  )

  return new TextDecoder().decode(decrypted)
}
