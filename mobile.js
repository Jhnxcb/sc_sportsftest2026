(() => {
  const navigation = document.createElement('label');
  navigation.className = 'mobile-navigation';
  const heading = document.createElement('span');
  heading.textContent = 'Manage Sportsfest';
  const select = document.createElement('select');
  select.setAttribute('aria-label', 'Admin section');
  const tabs = [...document.querySelectorAll('.tab[data-tab]')];
  tabs.forEach(tab => {
    const label = tab.dataset.tab === 'matches2' ? 'Matches — Screen 2' : tab.dataset.tab === 'matches' ? 'Matches — Screen 1' : tab.querySelector('.nav-text')?.textContent || tab.textContent;
    select.add(new Option(label.trim(), tab.dataset.tab));
    tab.addEventListener('click', () => { select.value = tab.dataset.tab; });
  });
  select.value = document.querySelector('.tab.active')?.dataset.tab || 'overview';
  select.addEventListener('change', () => {
    tabs.find(tab => tab.dataset.tab === select.value)?.click();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  navigation.append(heading, select);
  document.querySelector('.app-nav-wrapper').append(navigation);
})();
