// CRB1 加密 bundle 的格式解析与 AES-256-GCM 解密（纯函数，无 DOM/网络依赖）。
// 格式由后端 crearte-server internal/bundle/format.go 冻结：
//   0..4   magic "CRB1"
//   4..6   hdr_len (u16 大端，当前恒为 42)
//   6      alg (0x01 = AES-256-GCM)
//   7      kid_len (恒为 22)
//   8..30  kid (ASCII, base64url(sha256(gameID+"\0"+version)[:16]))
//   30..42 IV (12B)
//   42..   密文，尾部 16B 为 GCM tag；AAD = file[:hdr_len]
// 跨语言互通由 __fixtures__/bundle-vector.json 锁定（源自后端 testdata，
// 后端格式变更时需人工同步，见加密 spec §9.2）。

export const MAGIC = 'CRB1'
export const HEADER_SIZE = 42
export const KID_SIZE = 22
export const ALG_AES_256_GCM = 0x01
export const CEK_SIZE = 32
export const KEY_ALG = 'AES-256-GCM'

export class BundleFormatError extends Error {}

export interface BundleHeader {
  alg: number
  kid: string
  iv: Uint8Array
  headerBytes: Uint8Array
}

export interface BundleKeyMaterial {
  alg: string
  kid: string
  key: Uint8Array
}

export function base64UrlToBytes(input: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(input)) throw new BundleFormatError('非法 base64url 字符')
  const padded = input.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (input.length % 4)) % 4)
  let binary: string
  try {
    binary = atob(padded)
  } catch {
    throw new BundleFormatError('base64url 解码失败')
  }
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}

export function parseBundleHeader(file: Uint8Array): BundleHeader {
  if (file.length < HEADER_SIZE) throw new BundleFormatError(`文件短于 ${HEADER_SIZE} 字节`)
  const magic = String.fromCharCode(file[0], file[1], file[2], file[3])
  if (magic !== MAGIC) throw new BundleFormatError(`magic ${JSON.stringify(magic)}`)
  const hdrLen = (file[4] << 8) | file[5]
  if (hdrLen < HEADER_SIZE || hdrLen > file.length) throw new BundleFormatError(`hdr_len ${hdrLen}`)
  if (file[6] !== ALG_AES_256_GCM) throw new BundleFormatError(`alg 0x${file[6].toString(16)}`)
  if (file[7] !== KID_SIZE) throw new BundleFormatError(`kid_len ${file[7]}`)
  const kid = String.fromCharCode(...file.subarray(8, 8 + KID_SIZE))
  if (base64UrlToBytes(kid).length !== 16) throw new BundleFormatError('kid 编码非法')
  return { alg: file[6], kid, iv: file.slice(30, 42), headerBytes: file.slice(0, hdrLen) }
}

export function parseKeyResponse(text: string): BundleKeyMaterial {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new BundleFormatError('bundle-key 响应非合法 JSON')
  }
  if (typeof data !== 'object' || data === null) throw new BundleFormatError('bundle-key 响应非对象')
  const rec = data as Record<string, unknown>
  if (rec.alg !== KEY_ALG) throw new BundleFormatError(`bundle-key alg ${String(rec.alg)}`)
  if (typeof rec.kid !== 'string') throw new BundleFormatError('bundle-key 缺少 kid')
  if (typeof rec.key !== 'string') throw new BundleFormatError('bundle-key 缺少 key')
  const key = base64UrlToBytes(rec.key)
  if (key.length !== CEK_SIZE) throw new BundleFormatError(`bundle-key 长度 ${key.length}，应为 ${CEK_SIZE}`)
  return { alg: KEY_ALG, kid: rec.kid, key }
}

function asBuffer(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  return new Uint8Array(bytes.buffer as ArrayBuffer, bytes.byteOffset, bytes.byteLength)
}

export async function decryptBundle(file: Uint8Array, cekRaw: Uint8Array): Promise<Uint8Array> {
  if (cekRaw.length !== CEK_SIZE) throw new BundleFormatError(`cek 长度 ${cekRaw.length}`)
  const header = parseBundleHeader(file)
  const key = await crypto.subtle.importKey('raw', asBuffer(cekRaw), { name: 'AES-GCM' }, false, ['decrypt'])
  try {
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: asBuffer(header.iv), additionalData: asBuffer(header.headerBytes) },
      key,
      asBuffer(file.subarray(header.headerBytes.length))
    )
    return new Uint8Array(plain)
  } catch {
    throw new BundleFormatError('解密失败（密钥不匹配或数据被篡改）')
  }
}
