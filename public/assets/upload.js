/**
 * Attaching previous surveys and photos to a booking.
 *
 * The rule this file is built around: a file must never cost somebody a
 * booking. Uploads happen on submit, one at a time, and anything that fails is
 * mentioned on the confirmation rather than thrown up as an error to fix. The
 * enquiry goes through either way.
 *
 * Two upload paths, tried in that order:
 *
 *   1. A presigned PUT from /api/upload-url, browser straight to Vercel Blob.
 *      No size limit worth speaking of, because the file never passes through
 *      a serverless function.
 *   2. POST to /api/upload, which proxies it. Vercel will not carry a request
 *      body over 4.5MB into a function, so this path tops out around 4MB. It
 *      is the fallback for when presigning is unavailable.
 *
 * Photos are still re-encoded through a canvas first even though the size
 * limit no longer requires it: 2000px on the long edge takes a 3MB camera JPEG
 * to about 300KB, which on a phone on mobile data is the difference between a
 * booking and an abandoned form. It is also more detail than anyone looks at a
 * damp patch with. PDFs are sent untouched, since a survey report is the one
 * thing here worth keeping at full quality.
 *
 * Validation is duplicated here and on the server. This copy exists to save
 * somebody the wait, not to be trusted: the presigned URL carries a signed
 * content type and size ceiling that Vercel enforces, and /api/upload checks
 * the same things again.
 */
(function fileAttachments(){
  const input = document.getElementById('f-files');
  const list = document.getElementById('f-file-list');
  if (!input || !list) return;

  const MAX_FILES = 10;
  const MAX_BYTES = 25 * 1024 * 1024;
  const PROXY_BYTES = 4 * 1024 * 1024;     // all the fallback path can carry
  const SHRINK_OVER = 1.2 * 1024 * 1024;   // below this a photo is left alone
  const MAX_EDGE = 2000;
  const TYPES = ['image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp', 'application/pdf'];

  let accepted = [];

  const size = (bytes) => (bytes < 1024 * 1024
    ? Math.max(1, Math.round(bytes / 1024)) + 'KB'
    : (bytes / 1024 / 1024).toFixed(1) + 'MB');

  const isPdf = (f) => (f.type === 'application/pdf') || /\.pdf$/i.test(f.name);

  function render(rejected){
    list.innerHTML = '';
    accepted.forEach((f) => {
      const li = document.createElement('li');
      li.textContent = `${f.name} (${size(f.size)})`;
      list.appendChild(li);
    });
    rejected.forEach((r) => {
      const li = document.createElement('li');
      li.className = 'is-bad';
      li.textContent = r;
      list.appendChild(li);
    });
  }

  input.addEventListener('change', () => {
    const rejected = [];
    accepted = [];
    Array.from(input.files || []).forEach((f) => {
      if (accepted.length >= MAX_FILES) { rejected.push(`${f.name} skipped, ${MAX_FILES} files is the limit`); return; }
      /* HEIC from an iPhone sometimes arrives with an empty type, so the
         extension is the fallback rather than an outright refusal. */
      const type = f.type || '';
      const named = /\.(jpe?g|png|heic|heif|webp|pdf)$/i.test(f.name);
      if (!named && (!type || TYPES.indexOf(type) === -1)) { rejected.push(`${f.name} is not a photo or a PDF`); return; }
      if (f.size > MAX_BYTES) { rejected.push(`${f.name} is ${size(f.size)}, over the 25MB limit`); return; }
      accepted.push(f);
    });
    render(rejected);
  });

  /**
   * Re-encodes a photo smaller. Returns the original untouched if it is already
   * small, if it is a PDF, or if the browser cannot decode it: a format we
   * cannot read is not a reason to drop somebody's file.
   */
  async function shrink(file){
    if (isPdf(file) || file.size <= SHRINK_OVER) return file;

    let bitmap;
    try {
      bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      return file;
    }

    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    if (bitmap.close) bitmap.close();

    const blob = await new Promise((done) => canvas.toBlob(done, 'image/jpeg', 0.82));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
  }

  const json = (res) => (res.ok ? res.json() : null);

  /** Straight to Blob. Resolves with the stored pathname, or null to fall back. */
  async function direct(file){
    const res = await fetch('/api/upload-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ name: file.name, type: file.type || '' })
    });
    const ticket = await json(res);
    if (!ticket || !ticket.ok || !ticket.url) return null;

    const put = await fetch(ticket.url, {
      method: 'PUT',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body: file
    });
    return put.ok ? ticket.path : null;
  }

  /** Through our own function. Capped by the platform, so large files skip it. */
  async function proxied(file){
    if (file.size > PROXY_BYTES) return null;
    const res = await fetch('/api/upload?name=' + encodeURIComponent(file.name), {
      method: 'POST',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body: file
    });
    const data = await json(res);
    return data && data.ok && data.path ? data.path : null;
  }

  /**
   * Uploads everything selected and resolves with what survived. Never
   * rejects: a booking is worth more than an attachment.
   * @returns {Promise<{paths: string[], failed: number}>}
   */
  window.DS_UPLOAD = async function uploadAttachments(onProgress){
    if (!accepted.length) return { paths: [], failed: 0 };
    const paths = [];
    let failed = 0;

    for (let i = 0; i < accepted.length; i++) {
      if (onProgress) onProgress(i + 1, accepted.length);
      let path = null;
      try {
        const file = await shrink(accepted[i]);
        path = await direct(file);
        if (!path) path = await proxied(file);
      } catch {
        path = null;
      }
      if (path) paths.push(path); else failed++;
    }
    return { paths, failed };
  };
})();
