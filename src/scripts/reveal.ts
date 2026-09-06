export {};

const root = document.documentElement;
root.classList.add('js-reveal');

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const items = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal], [data-reveal-stagger] > *'));

if (reduceMotion || items.length === 0) {
  items.forEach((el) => el.classList.add('is-visible'));
} else {
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    }
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.1 });

  items.forEach((el, index) => {
    if (el.parentElement?.hasAttribute('data-reveal-stagger')) {
      el.style.setProperty('--reveal-delay', `${Math.min(index % 8, 7) * 50}ms`);
    }
    observer.observe(el);
  });
}
