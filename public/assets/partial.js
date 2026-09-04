/**
 * The held partial lead.
 *
 * Step 1 gives us enough to call someone back, but a visitor who carries on
 * and books is not a partial at all. So the partial is armed once they pass
 * step 1 and then held back: it is only sent if they really do leave it there,
 * either by leaving the page or by going quiet for a long time with the form
 * still open. Submitting cancels it, so a booked survey never arrives twice.
 *
 * Split out of book.js, which is the one documented exception to the size
 * rule in this repository and had grown past the point of the exception being
 * comfortable. This is the cleanest seam in it: everything here is about one
 * question, "have they abandoned it", and book.js only needs to say when they
 * passed step 1, when they submitted, and when they are still typing.
 *
 * Loaded before book.js, not deferred, because book.js calls it as it sets up.
 * Does nothing on its own: book.js hands it how to build and send the payload.
 */
window.DS_HELD_PARTIAL = function heldPartial({ payload, send, endpoint }){
  const IDLE_MS = 180000;
  const HIDDEN_MS = 45000;
  let armed = false;
  let done = false;
  let idleTimer = 0;
  let hiddenTimer = 0;

  function bump(){
    clearTimeout(idleTimer);
    if (!armed) return;
    idleTimer = setTimeout(() => flush(false), IDLE_MS);
  }

  /* leaving means the page is on its way out, so the request has to be a
     beacon: an ordinary fetch is routinely killed mid-flight during unload.
     The lead still reaches the dashboard, it just cannot report back on the
     notification email the way an idle flush can. */
  function flush(leaving){
    if (!armed || done) return;
    armed = false;
    done = true;
    clearTimeout(idleTimer);
    clearTimeout(hiddenTimer);
    if (leaving && navigator.sendBeacon) {
      const body = new Blob([JSON.stringify(payload())], { type: 'application/json' });
      navigator.sendBeacon(endpoint, body);
      return;
    }
    send();
  }

  function arm(){
    if (done) return;
    armed = true;
    bump();
  }

  function cancel(){
    armed = false;
    done = true;
    clearTimeout(idleTimer);
    clearTimeout(hiddenTimer);
  }

  /* For a submission the server bounced: nothing was written, so the partial
     goes back on hold as the fallback it was before they pressed the button. */
  function rearm(){
    done = false;
    arm();
  }

  /* pagehide is the last reliable moment before the page goes. A tab switch
     only counts once they have stayed away a while, so glancing at another tab
     and coming back to finish does not produce a partial. */
  window.addEventListener('pagehide', () => flush(true));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      if (armed) hiddenTimer = setTimeout(() => flush(true), HIDDEN_MS);
      return;
    }
    clearTimeout(hiddenTimer);
    bump();
  });

  return { arm, cancel, bump, rearm };
};
