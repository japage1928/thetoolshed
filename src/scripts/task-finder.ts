const root = document.querySelector<HTMLElement>('[data-task-finder]');
if (!root) {
  // Not on the homepage finder.
} else {
  const chips = Array.from(root.querySelectorAll<HTMLAnchorElement>('[data-task]'));
  const tiles = Array.from(root.querySelectorAll<HTMLElement>('[data-tasks]'));
  const stage = root.querySelector<HTMLElement>('[data-finder-stage]');
  const status = root.querySelector<HTMLElement>('[data-finder-status]');
  const more = root.querySelector<HTMLAnchorElement>('[data-finder-more]');
  const stageLinks = Array.from(document.querySelectorAll<HTMLAnchorElement>('[data-stage]'));

  const setStage = (name: string) => {
    stageLinks.forEach((link) => {
      link.classList.toggle('is-active', link.dataset.stage === name);
    });
  };

  const selectTask = (slug: string | null, pushHash = false) => {
    chips.forEach((chip) => {
      const active = chip.dataset.task === slug;
      chip.classList.toggle('is-active', active);
      chip.setAttribute('aria-pressed', active ? 'true' : 'false');
    });

    if (!slug) {
      tiles.forEach((tile) => {
        tile.hidden = tile.dataset.kind === 'tool';
      });
      if (stage) stage.hidden = false;
      if (status) status.textContent = 'Popular compares are up. Pick a job to highlight matching tools.';
      if (more) more.href = '/tasks';
      setStage('discover');
      return;
    }

    let compares = 0;
    let tools = 0;
    tiles.forEach((tile) => {
      const match = (tile.dataset.tasks ?? '').split(/\s+/).includes(slug);
      tile.hidden = !match;
      if (match && tile.dataset.kind === 'compare') compares += 1;
      if (match && tile.dataset.kind === 'tool') tools += 1;
    });

    const label = chips.find((chip) => chip.dataset.task === slug)?.dataset.label ?? 'that job';
    if (stage) stage.hidden = false;
    if (status) {
      status.textContent = `${compares} compare${compares === 1 ? '' : 's'} · ${tools} tool${tools === 1 ? '' : 's'} for ${label}`;
    }
    if (more) more.href = `/tasks#${slug}`;
    setStage(compares > 0 ? 'compare' : 'discover');
    if (pushHash) {
      history.replaceState(null, '', `#task-${slug}`);
    }
  };

  chips.forEach((chip) => {
    chip.addEventListener('click', (event) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      const slug = chip.dataset.task ?? null;
      const already = chip.classList.contains('is-active');
      selectTask(already ? null : slug, true);
    });
  });

  const hash = window.location.hash.replace(/^#/, '');
  const fromHash = hash.startsWith('task-') ? hash.slice('task-'.length) : null;
  selectTask(fromHash && chips.some((chip) => chip.dataset.task === fromHash) ? fromHash : null);
}
