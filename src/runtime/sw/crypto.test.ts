import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { BundleFormatError, decryptBundle, KEY_ALG, parseBundleHeader, parseKeyResponse } from './crypto'

// 共享向量：crearte-server src/internal/bundle/testdata/bundle-vector.json（Go 加密 ↔ WebCrypto 解密互通锁定）
const vector = JSON.parse(
  readFileSync(new URL('./__fixtures__/bundle-vector.json', import.meta.url), 'utf8')
) as Record<string, string>

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return out
}

const file = hexToBytes(vector.file_hex)
const cek = hexToBytes(vector.cek_hex)
const plaintext = hexToBytes(vector.plaintext_hex)

test('向量解密还原明文（跨语言互通）', async () => {
  expect(await decryptBundle(file, cek)).toEqual(plaintext)
})

test('头部解析：kid/alg/iv/头部字节', () => {
  const header = parseBundleHeader(file)
  expect(header.kid).toBe(vector.kid)
  expect(header.alg).toBe(1)
  expect(header.iv).toEqual(hexToBytes(vector.iv_hex))
  expect(header.headerBytes).toEqual(file.slice(0, 42))
})

test('AAD 篡改（IV 字节）必失败', async () => {
  const tampered = file.slice()
  tampered[35] ^= 0xff
  await expect(decryptBundle(tampered, cek)).rejects.toThrow(BundleFormatError)
})

test('密文篡改（GCM tag）必失败', async () => {
  const tampered = file.slice()
  tampered[tampered.length - 1] ^= 0xff
  await expect(decryptBundle(tampered, cek)).rejects.toThrow(BundleFormatError)
})

test('错 key 必失败', async () => {
  await expect(decryptBundle(file, new Uint8Array(32).fill(7))).rejects.toThrow(BundleFormatError)
})

test('header 边界：短文件/错 magic/hdr_len 越界/错 alg/错 kid_len', () => {
  expect(() => parseBundleHeader(new Uint8Array(10))).toThrow(BundleFormatError)
  const badMagic = file.slice(); badMagic[0] = 'X'.charCodeAt(0)
  expect(() => parseBundleHeader(badMagic)).toThrow(BundleFormatError)
  const badHdrLen = file.slice(); badHdrLen[4] = 0xff
  expect(() => parseBundleHeader(badHdrLen)).toThrow(BundleFormatError)
  const badAlg = file.slice(); badAlg[6] = 0x02
  expect(() => parseBundleHeader(badAlg)).toThrow(BundleFormatError)
  const badKidLen = file.slice(); badKidLen[7] = 21
  expect(() => parseBundleHeader(badKidLen)).toThrow(BundleFormatError)
})

test('parseKeyResponse：合法响应', () => {
  const material = parseKeyResponse(JSON.stringify({ alg: KEY_ALG, kid: vector.kid, key: 'k'.repeat(43) }))
  expect(material.kid).toBe(vector.kid)
  expect(material.key.length).toBe(32)
})

test('parseKeyResponse：alg 不符/非法 JSON/key 非 32B/非法 base64url 全部抛错', () => {
  expect(() => parseKeyResponse('not json')).toThrow(BundleFormatError)
  expect(() => parseKeyResponse(JSON.stringify({ alg: 'AES-128-GCM', kid: 'k'.repeat(22), key: 'k'.repeat(43) }))).toThrow(BundleFormatError)
  expect(() => parseKeyResponse(JSON.stringify({ alg: KEY_ALG, kid: 'k'.repeat(22), key: 'c2hvcnQ' }))).toThrow(BundleFormatError)
  expect(() => parseKeyResponse(JSON.stringify({ alg: KEY_ALG, kid: 'k'.repeat(22), key: '!!not-base64!!' }))).toThrow(BundleFormatError)
})
