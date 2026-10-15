(() => {
  const key = 'mixroom-theme';
  const choices = ['system', 'light', 'dark'];
  const system = matchMedia('(prefers-color-scheme: dark)');
  let preference = 'system';
  try { const saved = localStorage.getItem(key); if (choices.includes(saved)) preference = saved; } catch {}
  const effective = () => preference === 'system' ? (system.matches ? 'dark' : 'light') : preference;
  function sync() {
    const dark = effective() === 'dark';
    document.querySelectorAll('[data-theme-toggle]').forEach(button => {
      const label = dark ? '라이트 모드로 전환' : '다크 모드로 전환';
      button.setAttribute('aria-label', label);
      button.title = label;
      button.innerHTML = `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${dark ? '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.4 1.4m11.2 11.2L19 19M5 19l1.4-1.4M17.6 6.4 19 5"/>' : '<path d="M20.5 14.1A8.5 8.5 0 0 1 9.9 3.5a8.5 8.5 0 1 0 10.6 10.6Z"/>'}</svg>`;
    });
    document.querySelectorAll('[data-set-theme]').forEach(button => {
      const selected = button.dataset.setTheme === preference;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
  }
  function apply() {
    const theme = effective();
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#131419' : '#f6f5f2');
    sync();
    document.dispatchEvent(new Event('mixroom-theme-change'));
  }
  function set(value) {
    if (!choices.includes(value)) return;
    preference = value;
    try { localStorage.setItem(key, value); } catch {}
    apply();
  }
  window.MixroomTheme = { sync, set, preference: () => preference };
  document.addEventListener('click', event => {
    const toggle = event.target.closest('[data-theme-toggle]');
    const choice = event.target.closest('[data-set-theme]');
    if (toggle) set(effective() === 'dark' ? 'light' : 'dark');
    else if (choice) set(choice.dataset.setTheme);
  });
  document.addEventListener('DOMContentLoaded', sync);
  system.addEventListener('change', () => { if (preference === 'system') apply(); });
  window.addEventListener('storage', event => {
    if (event.key === key || event.key === null) {
      preference = choices.includes(event.newValue) ? event.newValue : 'system';
      apply();
    }
  });
  apply();
})();
