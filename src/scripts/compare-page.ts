export {};

const comparePageRoot = document.querySelector<HTMLElement>('[data-compare-page]');
if (comparePageRoot) {
  const tabs = Array.from(comparePageRoot.querySelectorAll<HTMLButtonElement>('[data-pick-tab]'));
  const panels = Array.from(comparePageRoot.querySelectorAll<HTMLElement>('[data-pick-panel]'));

  const activate = (slug: string) => {
    tabs.forEach((tab) => {
      const on = tab.dataset.pickTab === slug;
      tab.classList.toggle('is-active', on);
      tab.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    panels.forEach((panel) => {
      panel.hidden = panel.dataset.pickPanel !== slug;
    });
  };

  if (tabs.length > 0) {
    tabs.forEach((tab) => {
      tab.addEventListener('click', () => activate(tab.dataset.pickTab ?? ''));
    });
    activate(tabs[0]?.dataset.pickTab ?? '');
  }

  const nav = comparePageRoot.querySelectorAll<HTMLAnchorElement>('[data-compare-jump]');
  nav.forEach((link) => {
    link.addEventListener('click', () => {
      nav.forEach((item) => item.classList.toggle('is-active', item === link));
    });
  });
}