export {};

const directoryRoot = document.querySelector<HTMLElement>('[data-directory]');
if (directoryRoot) {
  const search = directoryRoot.querySelector<HTMLInputElement>('#tool-search');
  const cards = Array.from(directoryRoot.querySelectorAll<HTMLElement>('.tool-card'));
  const count = directoryRoot.querySelector<HTMLElement>('#tool-count');
  const empty = directoryRoot.querySelector<HTMLElement>('#tools-empty');
  const filters = Array.from(directoryRoot.querySelectorAll<HTMLAnchorElement>('[data-category]'));

  let category = 'All';

  const render = () => {
    const query = (search?.value ?? '').trim().toLowerCase();
    let visible = 0;
    cards.forEach((card) => {
      const matchesQuery = !query || (card.dataset.search ?? '').includes(query);
      const matchesCategory = category === 'All' || card.dataset.category === category;
      const show = matchesQuery && matchesCategory;
      card.hidden = !show;
      if (show) visible += 1;
    });
    if (count) count.textContent = String(visible);
    if (empty) empty.hidden = visible !== 0;
    filters.forEach((filter) => {
      filter.classList.toggle('is-active', (filter.dataset.category ?? 'All') === category);
    });
  };

  search?.addEventListener('input', render);
  filters.forEach((filter) => {
    filter.addEventListener('click', (event) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      category = filter.dataset.category ?? 'All';
      render();
    });
  });

  render();
}
