// Read-only, shared admission for BOTH real UIs. A failed/missing image must
// not shrink the expected workload. In particular inspect cover containers,
// not img rectangles: an onerror handler may hide/remove the failed image.
export async function visibleCoverReadiness(selector) {
  if (document.visibilityState !== 'visible') throw Error('Cover viewport is hidden');
  const covers = [...document.querySelectorAll(selector)].filter(node => {
    const rect = node.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.left < innerWidth &&
      rect.top < innerHeight && rect.right > 0 && rect.bottom > 0;
  });
  if (!covers.length) throw Error('No visible cover containers');
  const images = covers.map(node => {
    const image = node.querySelector('img');
    if (!image || image.hidden) throw Error('Visible cover image is missing or hidden');
    return image;
  });
  let timer;
  try {
    await Promise.race([
      Promise.all(images.map(image => image.decode())),
      new Promise((_, reject) => { timer = setTimeout(() => reject(Error('Visible cover decode exceeded 10000 ms')), 10000); }),
    ]);
    if (document.visibilityState !== 'visible' || covers.some(node => !node.isConnected))
      throw Error('Cover viewport changed during decode');
    if (images.some(image => image.hidden || !image.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0))
      throw Error('Visible cover did not decode actual pixels');
    return {visibleCovers: covers.length, decodedVisibleCovers: images.length};
  } finally { clearTimeout(timer); }
}
