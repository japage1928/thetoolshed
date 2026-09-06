import { COMPARISONS } from '../data/comparisons';
import { findClosestCompares } from '../lib/workshop-match';

const root = document.querySelector<HTMLElement>('[data-compare-picker]');
if (root) {
  const selectA = root.querySelector<HTMLSelectElement>('#compare-a');
  const selectB = root.querySelector<HTMLSelectElement>('#compare-b');
  const status = root.querySelector<HTMLElement>('[data-picker-status]');
  const actions = root.querySelector<HTMLElement>('[data-picker-actions]');
  const closest = root.querySelector<HTMLElement>('[data-picker-closest]');

  const toolName = (slug: string) => {
    const option = selectA?.querySelector(`option[value="${slug}"]`);
    return option?.textContent?.trim() || slug;
  };

  const render = () => {
    const a = selectA?.value ?? '';
    const b = selectB?.value ?? '';
    if (!actions || !status || !closest) return;

    actions.replaceChildren();
    closest.replaceChildren();

    if (!a || !b) {
      status.textContent = 'Pick two tools. If we already wrote the pair, we send you there.';
      return;
    }

    if (a === b) {
      status.textContent = 'Pick two different tools.';
      const link = document.createElement('a');
      link.className = 'shed-btn';
      link.href = `/tools/${a}`;
      link.textContent = `Open ${toolName(a)} →`;
      actions.append(link);
      return;
    }

    const result = findClosestCompares(a, b, COMPARISONS);
    if (result.reason === 'exact' && result.exact) {
      status.textContent = `We have ${result.exact.title}.`;
      const link = document.createElement('a');
      link.className = 'shed-btn shed-btn--primary';
      link.href = `/compare/${result.exact.slug}`;
      link.textContent = 'Open this comparison →';
      actions.append(link);
      return;
    }

    status.textContent = `We don’t have ${toolName(a)} vs ${toolName(b)} yet — here’s the closest, plus the tool pages.`;
    const pageA = document.createElement('a');
    pageA.className = 'shed-btn shed-btn--primary';
    pageA.href = `/tools/${a}`;
    pageA.textContent = `${toolName(a)} page`;
    const pageB = document.createElement('a');
    pageB.className = 'shed-btn';
    pageB.href = `/tools/${b}`;
    pageB.textContent = `${toolName(b)} page`;
    actions.append(pageA, pageB);

    if (result.closest.length > 0) {
      const heading = document.createElement('p');
      heading.className = 'picker-closest-label';
      heading.textContent = 'Closest written compares';
      closest.append(heading);
      result.closest.forEach((item) => {
        const card = document.createElement('a');
        card.className = 'finder-tile';
        card.href = `/compare/${item.slug}`;
        card.innerHTML = `<span class="eyebrow">${item.eyebrow}</span><strong>${item.title}</strong><span>${item.job}</span>`;
        closest.append(card);
      });
    }
  };

  selectA?.addEventListener('change', render);
  selectB?.addEventListener('change', render);
  render();
}
