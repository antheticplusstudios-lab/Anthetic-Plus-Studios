/**
 * Join MP3 files produced by separate TTS requests into one playable stream (pure, unit-tested).
 *
 * Root-cause fix: replies over ~1,900 characters are synthesized in pieces and were joined by raw
 * byte concatenation. Each piece starts with an ID3 tag and a Xing/Info header frame that declares
 * the frame count of THAT piece only. Chrome (desktop and Android) trusts the first Xing header for
 * duration and stops or seeks wrongly at the end of piece one, so long replies cut off. We strip
 * ID3v2/ID3v1 tags and Xing/Info/VBRI frames from every piece so the joined stream is plain frames.
 */

const BITRATES_V1_L3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
const BITRATES_V2_L3 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
const SAMPLE_RATES: Record<number, number[]> = {
  3: [44100, 48000, 32000], // MPEG-1
  2: [22050, 24000, 16000], // MPEG-2
  0: [11025, 12000, 8000], // MPEG-2.5
};

function id3v2Length(b: Uint8Array, at: number): number {
  if (b.length < at + 10 || b[at] !== 0x49 || b[at + 1] !== 0x44 || b[at + 2] !== 0x33) return 0;
  const size =
    ((b[at + 6]! & 0x7f) << 21) |
    ((b[at + 7]! & 0x7f) << 14) |
    ((b[at + 8]! & 0x7f) << 7) |
    (b[at + 9]! & 0x7f);
  const footer = b[at + 5]! & 0x10 ? 10 : 0;
  return 10 + size + footer;
}

/** Length of the MPEG Layer III frame starting at `at`, or 0 if no valid header. */
export function frameLength(b: Uint8Array, at: number): number {
  if (b.length < at + 4 || b[at] !== 0xff || (b[at + 1]! & 0xe0) !== 0xe0) return 0;
  const version = (b[at + 1]! >> 3) & 0x03;
  const layer = (b[at + 1]! >> 1) & 0x03;
  if (version === 1 || layer !== 1) return 0; // reserved version / not Layer III
  const bitrateIdx = (b[at + 2]! >> 4) & 0x0f;
  const srIdx = (b[at + 2]! >> 2) & 0x03;
  const padding = (b[at + 2]! >> 1) & 0x01;
  if (bitrateIdx === 0 || bitrateIdx === 15 || srIdx === 3) return 0;
  const kbps = (version === 3 ? BITRATES_V1_L3 : BITRATES_V2_L3)[bitrateIdx]!;
  const sr = SAMPLE_RATES[version]![srIdx]!;
  const coeff = version === 3 ? 144 : 72;
  return Math.floor((coeff * kbps * 1000) / sr) + padding;
}

function isInfoFrame(b: Uint8Array, at: number, len: number): boolean {
  const end = Math.min(b.length - 4, at + Math.min(len, 64));
  for (let i = at + 4; i < end; i++) {
    const a = b[i],
      c = b[i + 1],
      d = b[i + 2],
      e = b[i + 3];
    if (a === 0x58 && c === 0x69 && d === 0x6e && e === 0x67) return true; // Xing
    if (a === 0x49 && c === 0x6e && d === 0x66 && e === 0x6f) return true; // Info
    if (a === 0x56 && c === 0x42 && d === 0x52 && e === 0x49) return true; // VBRI
  }
  return false;
}

/** Strip tags and the leading info frame; returns only audio frames. */
export function stripMp3(part: Uint8Array): Uint8Array {
  let start = 0;
  // Several stacked ID3v2 tags are legal.
  for (let len = id3v2Length(part, start); len > 0; len = id3v2Length(part, start)) start += len;
  // Skip junk until the first frame sync.
  while (start < part.length - 4 && frameLength(part, start) === 0) start++;
  const first = frameLength(part, start);
  if (first && isInfoFrame(part, start, first)) start += first;
  let end = part.length;
  if (
    end - start >= 128 &&
    part[end - 128] === 0x54 &&
    part[end - 127] === 0x41 &&
    part[end - 126] === 0x47
  ) {
    end -= 128; // ID3v1 "TAG"
  }
  return start >= end ? new Uint8Array(0) : part.subarray(start, end);
}

export function joinMp3(parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  if (parts.length === 1) {
    const only = parts[0]!;
    const copy = new Uint8Array(only.byteLength);
    copy.set(only);
    return copy;
  }
  const stripped = parts.map(stripMp3);
  const total = stripped.reduce((n, p) => n + p.byteLength, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of stripped) {
    out.set(p, o);
    o += p.byteLength;
  }
  return out;
}
