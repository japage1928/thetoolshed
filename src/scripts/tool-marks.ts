export {};

const marks = document.querySelectorAll<HTMLElement>('[data-tool-mark]');
marks.forEach((mark) => {
  const img = mark.querySelector<HTMLImageElement>('[data-tool-mark-img]');
  if (!img) {
    mark.classList.add('is-fallback');
    return;
  }
  const fail = () => {
    img.hidden = true;
    mark.classList.add('is-fallback');
  };
  img.addEventListener('error', fail);
  if (img.complete && img.naturalWidth === 0) fail();
});
