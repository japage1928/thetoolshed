import { USAGE_PRESETS, estimateMonthly, formatUsd, hasEnteredRates } from '../lib/cost-calculator';

export {};

const root = document.querySelector<HTMLElement>('[data-cost-calculator]');
if (!root) {
  // Not on the calculator page.
} else {
  const form = root.querySelector<HTMLFormElement>('form');
  const subscriptionOut = root.querySelector<HTMLElement>('[data-out-subscription]');
  const apiOut = root.querySelector<HTMLElement>('[data-out-api]');
  const totalOut = root.querySelector<HTMLElement>('[data-out-total]');
  const hint = root.querySelector<HTMLElement>('[data-out-hint]');
  const vendorLink = root.querySelector<HTMLAnchorElement>('[data-vendor-link]');
  const toolSelect = root.querySelector<HTMLSelectElement>('[name="tool"]');

  const numberValue = (name: string): number => {
    const field = form?.elements.namedItem(name);
    if (!(field instanceof HTMLInputElement)) return 0;
    return Number.parseFloat(field.value) || 0;
  };

  const setNumber = (name: string, value: number) => {
    const field = form?.elements.namedItem(name);
    if (field instanceof HTMLInputElement) field.value = String(value);
  };

  const render = () => {
    const input = {
      seats: numberValue('seats'),
      seatMonthly: numberValue('seatMonthly'),
      inputTokensM: numberValue('inputTokensM'),
      outputTokensM: numberValue('outputTokensM'),
      inputRatePerM: numberValue('inputRatePerM'),
      outputRatePerM: numberValue('outputRatePerM'),
    };
    const estimate = estimateMonthly(input);
    if (subscriptionOut) subscriptionOut.textContent = formatUsd(estimate.subscription);
    if (apiOut) apiOut.textContent = formatUsd(estimate.api);
    if (totalOut) totalOut.textContent = formatUsd(estimate.total);
    if (hint) {
      hint.textContent = hasEnteredRates(input)
        ? 'Illustrative total from the numbers you entered. Verify on the vendor site before you subscribe or set a cap.'
        : 'Add a seat price or API rates from the vendor pricing page. Until then this is just the usage shape, not a cost.';
    }
  };

  const applyPreset = (id: string) => {
    const preset = USAGE_PRESETS.find((item) => item.id === id);
    if (!preset) return;
    setNumber('seats', preset.seats);
    setNumber('inputTokensM', preset.inputTokensM);
    setNumber('outputTokensM', preset.outputTokensM);
    render();
  };

  form?.addEventListener('input', render);
  form?.addEventListener('change', render);
  root.querySelectorAll<HTMLButtonElement>('[data-preset]').forEach((button) => {
    button.addEventListener('click', () => applyPreset(button.dataset.preset ?? ''));
  });

  const syncVendorLink = () => {
    const option = toolSelect?.selectedOptions[0];
    const href = option?.dataset.pricingUrl;
    if (vendorLink && href) {
      vendorLink.href = href;
      vendorLink.hidden = false;
      vendorLink.target = '_blank';
      vendorLink.rel = 'noopener noreferrer';
      vendorLink.textContent = `Open ${option.textContent?.trim() ?? 'vendor'} pricing →`;
    } else if (vendorLink) {
      vendorLink.hidden = true;
    }
  };

  toolSelect?.addEventListener('change', syncVendorLink);

  const requested = new URLSearchParams(window.location.search).get('tool');
  if (requested && toolSelect) {
    const match = Array.from(toolSelect.options).find((option) => option.value === requested);
    if (match) toolSelect.value = requested;
  }

  syncVendorLink();
  render();
}
