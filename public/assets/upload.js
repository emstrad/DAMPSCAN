/**
 * Attaching previous surveys and photos to a booking.
 *
 * The rule this file is built around: a file must never cost somebody a
 * booking. Uploads happen on submit, one at a time, and anything that fails is
 * mentioned on the confirmation rather than thrown up as an error to fix. The
 * enquiry goes through either way.
 *
 * The 4MB ceiling is not ours. A Vercel serverless function will not accept a
 * request body over 4.5MB, so a phone photo straight off a modern camera is
 * already too big. Rather than refuse it, images are drawn through a canvas and
 * re-encoded first: 2000px on the long edge at quality 0.82 takes almost any
 * photo under a megabyte, uploads far quicker on mobile data, and is still more
 * detail than anyone looks at a damp patch with. PDFs cannot be shrunk, so an
 * oversized one is refused up front with somewhere else to send it.
 *
 * Validation is duplicated here and on the server. This copy exists to save
 * somebody the wait, not to be trusted: /api/upload checks it all again.
 */
(function fileAttachments(){
  const input = document.getElementById('f-files');
  const list = document.getElementById('f-file-list');
  if (!input || !list) return;

  const MAX_FILES = 5;
  const MAX_UPLOAD = 4 * 1024 * 1024;      // what the platform will carry
  const MAX_SOURCE = 30 * 1024 * 1024;     // refuse to even decode past this
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
      if (accepted.length >= MAX_FILES) { rejected.push(`${f.name} skipped, five files is the limit`); return; }
      /* HEIC from an iPhone sometimes arrives with an empty type, so the
         extension is the fallback rather than an outright refusal. */
      const type = f.type || '';
      const named = /\.(jpe?g|png|heic|heif|webp|pdf)$/i.test(f.name);
      if (!named && (!type || TYPES.indexOf(type) === -1)) { rejected.push(`${f.name} is not a photo or a PDF`); return; }
      if (isPdf(f) && f.size > MAX_UPLOAD) {
        rejected.push(`${f.name} is ${size(f.size)}. PDFs need to be under 4MB, please email it over instead`);
        return;
      }
      if (f.size > MAX_SOURCE) { rejected.push(`${f.name} is ${size(f.size)}, too large to attach`); return; }
      accepted.push(f);
    });
    render(rejected);
  });

  /**
   * Re-encodes a photo small enough to send. Returns the original untouched if
   * it is already small, if it is not an image, or if the browser cannot decode
   * it: a format we cannot read is not a reason to drop somebody's file, the
   * server can still refuse it.
   */
  async function shrink(file){
    if (isPdf(file)) return file;
    if (file.size <= SHRINK_OVER) return file;

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
      try {
        const file = await shrink(accepted[i]);
        if (file.size > MAX_UPLOAD) { failed++; continue; }
        const res = await fetch('/api/upload?name=' + encodeURIComponent(file.name), {
          method: 'POST',
          headers: { 'Content-Type': file.type || 'application/octet-stream' },
          body: file
        });
        const data = res.ok ? await res.json() : null;
        if (data && data.ok && data.path) paths.push(data.path);
        else failed++;
      } catch {
        failed++;
      }
    }
    return { paths, failed };
  };
})();
