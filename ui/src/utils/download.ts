import {
  getPlayback,
  getRecordingUrl,
  preparePlayback,
} from '@/clients/api/api';

import { Recording } from '@/clients/api/api.types';

const POLL_MS = 2000;
const GIVE_UP_MS = 30 * 60 * 1000;

function save(url: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = '';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Downloads a finished recording as MP4 (the browser-friendly copy, named like the recording). If no MP4 exists yet
// it is made first (progress is reported); only if one cannot be made does it fall back to the original file.
// Resolves to which file was saved.
export async function downloadRecording(
  rec: Recording,
  onProgress?: (percent: number | null) => void
): Promise<'mp4' | 'original'> {
  try {
    let info = await getPlayback(rec.id);
    if (info.status !== 'ready') {
      if (info.status === 'none' || info.status === 'failed') {
        info = await preparePlayback(rec.id);
      }
      const until = Date.now() + GIVE_UP_MS;
      while (info.status !== 'ready' && Date.now() < until) {
        if (info.status === 'failed' || info.status === 'none') {
          throw new Error(info.error || 'conversion failed');
        }
        onProgress?.(info.progress);
        await sleep(POLL_MS);
        info = await getPlayback(rec.id);
      }
    }
    if (info.status === 'ready') {
      save(`/api/recordings/${rec.id}/play?download=1`);
      return 'mp4';
    }
  } catch {
    // no MP4 available and none can be made: fall through to the original file
  } finally {
    onProgress?.(null);
  }
  save(getRecordingUrl(rec.id));
  return 'original';
}
