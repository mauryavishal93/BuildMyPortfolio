const THEME_KEY = 'buildMyPortfolioTheme';
const themes = ['dark', 'light'];

function readTheme() {
  try {
    const storedTheme = localStorage.getItem(THEME_KEY);
    return themes.includes(storedTheme) ? storedTheme : 'light';
  } catch (error) {
    console.error('Unable to read the saved theme preference.', error);
    return 'light';
  }
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelectorAll('[data-theme-toggle]').forEach(button => {
    button.setAttribute('aria-checked', String(theme === 'dark'));
    button.setAttribute('aria-label', `${theme === 'dark' ? 'Dark' : 'Light'} theme`);
    const label = button.querySelector('.theme-switch-label');
    if (label) label.textContent = theme === 'dark' ? 'Dark' : 'Light';
  });
}

let currentTheme = readTheme();
applyTheme(currentTheme);

document.querySelectorAll('[data-theme-toggle]').forEach(button => {
  button.addEventListener('click', () => {
    currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
    applyTheme(currentTheme);
    try {
      localStorage.setItem(THEME_KEY, currentTheme);
    } catch (error) {
      console.error('Unable to save the theme preference.', error);
    }
  });
});
