// Hashing and uploading the two files, in the browser.
//
// THE DECLARATION AND THE BYTES COME FROM ONE READ. A submission states two SHA-256 digests and
// the platform re-hashes what arrives, so a digest computed over anything other than the bytes
// that are actually uploaded is a rejection with two hashes in it. The page therefore reads each
// file once, hashes that buffer, and PUTs that same buffer -- there is no window in which the file
// could be edited between the two.
//
// `crypto.subtle` EXISTS ONLY IN A SECURE CONTEXT: https, or localhost/127.0.0.1. Every real
// deployment and every dev stack is one, but a site served over plain http from a LAN address is
// not, and there the API flow in the book is the answer rather than a broken button.

import common from '../../copy/common.json'
import { fill } from './copy'

export function canHashHere(): boolean {
  return typeof crypto !== 'undefined' && typeof crypto.subtle?.digest === 'function'
}

/** `sha256:` followed by 64 lowercase hex digits -- the exact spelling the API takes. */
export async function sha256(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  let hex = ''
  for (const b of new Uint8Array(digest)) hex += b.toString(16).padStart(2, '0')
  return `sha256:${hex}`
}

/** A file the competitor picked, read once and hashed. */
export type Picked = {
  name: string
  size: number
  bytes: ArrayBuffer
  hash: string
}

export async function pickFile(file: File): Promise<Picked> {
  const bytes = await file.arrayBuffer()
  return { name: file.name, size: file.size, bytes, hash: await sha256(bytes) }
}

/** Raised when the version was recorded but a file did not reach the bucket, which is recoverable
 *  and must not read like a refused submission: the version exists, and the URLs are still good. */
export class UploadFailed extends Error {
  which: string
  status: number
  constructor(which: string, status: number, message: string) {
    super(message)
    this.name = 'UploadFailed'
    this.which = which
    this.status = status
  }
}

/** A one-shot presigned PUT with the bytes as the whole body.
 *
 *  NO HEADERS. The URL is signed over the method, the key and an expiry and nothing else, so an
 *  unsigned header is ignored -- but an ArrayBuffer body sets no `Content-Type` at all, which keeps
 *  what the browser sends identical to what `curl -T` sends. A `File` body would set one from the
 *  extension and make the two paths differ for no reason. */
export async function putBytes(which: string, url: string, bytes: ArrayBuffer): Promise<void> {
  let response: Response
  try {
    response = await fetch(url, { method: 'PUT', body: bytes })
  } catch {
    // A network error, a blocked request, or an object store that answers no CORS preflight.
    // The browser's own message ("Failed to fetch") is both useless and capitalised mid-sentence,
    // so this says the one thing that is certainly true and reads as part of a sentence.
    throw new UploadFailed(which, 0, common.upload.unreachable)
  }
  if (!response.ok) {
    throw new UploadFailed(which, response.status, fill(common.upload.status, { status: response.status }))
  }
}
