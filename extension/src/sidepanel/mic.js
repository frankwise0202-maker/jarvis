// Microphone permission helper: Chrome cannot show the microphone prompt inside the side panel,
// so the panel opens this page once; after "Allow", dictation works in the panel too.

const status = document.getElementById('status');
const button = document.getElementById('allow');

async function ask() {
  button.disabled = true;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    for (const track of stream.getTracks()) track.stop();
    status.textContent = 'Microphone allowed. You can close this tab and use the mic button in Jarvis.';
    button.textContent = 'Close this tab';
    button.disabled = false;
    button.onclick = () => window.close();
  } catch {
    status.textContent = 'Chrome did not allow the microphone. Click the icon at the right of the address bar to allow it, then try again.';
    button.disabled = false;
  }
}

button.addEventListener('click', ask);
