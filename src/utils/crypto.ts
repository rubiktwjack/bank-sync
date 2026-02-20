/**
 * 瀏覽器端 AES-256-GCM 解密（Web Crypto API）
 * 金鑰從 VITE_SYNC_ENCRYPTION_KEY 環境變數 build 進來
 */

interface EncryptedPayload {
  iv: string
  data: string
  tag: string
}

export async function decrypt(encryptedJson: string): Promise<string> {
  const keyHex = import.meta.env.VITE_SYNC_ENCRYPTION_KEY as string
  if (!keyHex) {
    throw new Error('VITE_SYNC_ENCRYPTION_KEY 未設定')
  }

  const { iv, data, tag } = JSON.parse(encryptedJson) as EncryptedPayload

  // hex string → Uint8Array
  const keyBytes = new Uint8Array(keyHex.match(/.{2}/g)!.map((b) => parseInt(b, 16)))
  const ivBytes = Uint8Array.from(atob(iv), (c) => c.charCodeAt(0))
  const dataBytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0))
  const tagBytes = Uint8Array.from(atob(tag), (c) => c.charCodeAt(0))

  // AES-GCM 需要把 ciphertext + tag 合併
  const combined = new Uint8Array(dataBytes.length + tagBytes.length)
  combined.set(dataBytes)
  combined.set(tagBytes, dataBytes.length)

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    'AES-GCM',
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
