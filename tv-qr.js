(() => {
  const link = document.getElementById('phone-qr-link');
  const hint = document.getElementById('phone-qr-hint');
  try {
    const url = new URL(window.SPORTSFEST_CONFIG?.PUBLIC_PHONE_URL || 'phone.html', location.href);
    if (!['http:', 'https:'].includes(url.protocol) || /^(localhost|127(?:\.\d+){3}|\[::1\]|0\.0\.0\.0)$/.test(url.hostname)) {
      throw new Error('A phone-accessible address is required');
    }
    const code = qrcode(0, 'M');
    code.addData(url.href);
    code.make();
    link.href = url.href;
    link.innerHTML = code.createSvgTag(4, 16);
    link.querySelector('svg').setAttribute('aria-hidden', 'true');
    link.hidden = false;
    hint.textContent = 'Live standings on your phone';
  } catch (_) {
    link.hidden = true;
    hint.textContent = 'Open the TV using its public or venue Wi-Fi address to enable scanning.';
  }
})();
