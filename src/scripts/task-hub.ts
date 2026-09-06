const root = document.querySelector<HTMLElement>('[data-task-hub]');
if (root) {
  const filters = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-kind]'));
  const cards = Array.from(root.querySelectorAll<HTMLElement>('.task-card'));
  const status = root.querySelector<HTMLElement>('[data-hub-status]');
  let kind = 'All';

  const render = () => {
    let visible = 0;
    cards.forEach((card) => {
      const show = kind === 'All' || card.dataset.kind === kind;
      card.hidden = !show;
      if (show) visible += 1;
    });
    filters.forEach((filter) => {
      const active = (filter.dataset.kind ?? 'All') === kind;
      filter.classList.toggle('is-active', active);
      filter.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    if (status) status.textContent = `${visible} job${visible === 1 ? '' : 's'}${kind === 'All' ? '' : ` in ${kind}`}`;
  };

  filters.forEach((filter) => {
    filter.addEventListener('click', () => {
      kind = filter.dataset.kind ?? 'All';
      render();
    });
  });

  const hash = window.location.hash.replace(/^#/, '');
  const target = hash ? root.querySelector<HTMLDetailsElement>(`#${CSS.escape(hash)}`) : null;
  if (target) {
    target.open = true;
    target.scrollIntoView({ block: 'start' });
  }

  render();
}
