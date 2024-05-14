const terminal = document.querySelector(".terminal");
const hydra = document.querySelector(".hydra");
const rebootSuccessText = document.querySelector(".hydra_reboot_success");
const statusMessage = document.getElementById("status-message");
const maxCharacters = 20;
const unloadedCharacter = ".";
const loadedCharacter = "#";
const spinnerFrames = ["/", "-", "\\", "|"];

const RenderBar = (progress) => {
  const loaded = loadedCharacter.repeat(Math.floor(progress / 5));
  const unloaded = unloadedCharacter.repeat(maxCharacters - loaded.length);
  document.getElementById("progress-bar").innerText = `[${loaded}${unloaded}]`;
  document.querySelector(".process-amount").innerText = progress;
};

const DrawSpinner = (spinnerFrame = 0) => {
  return setInterval(() => {
    spinnerFrame += 1;
    document.querySelectorAll(".spinner").forEach(
      (spinner) => (spinner.innerText = `[${spinnerFrames[spinnerFrame % spinnerFrames.length]}]`)
    );
  }, 100);
};

const AnimateBox = () => {
  const first = hydra.getBoundingClientRect();
  document.querySelectorAll(".spinner, .glitch--clone, .hydra_rebooting").forEach(el => el.classList.add("hidden"));
  rebootSuccessText.classList.remove("hidden");
  rebootSuccessText.style.visibility = "hidden";
  const last = hydra.getBoundingClientRect();

  const hydraAnimation = hydra.animate([
    { transform: `scale(${first.width / last.width}, ${first.height / last.height})` },
    { transform: `scale(${first.width / last.width}, 1.2)` },
    { transform: `none` }
  ], {
    duration: 600,
    easing: 'cubic-bezier(0,0,0.32,1)',
  });

  hydraAnimation.addEventListener('finish', () => {
    rebootSuccessText.removeAttribute("style");
    hydra.removeAttribute("style");
  });
};

document.addEventListener('DOMContentLoaded', () => {
  window.electronAPI.onUpdateStatus((event, message) => {
    statusMessage.innerText = message;
  });

  window.electronAPI.onDownloadProgress((event, progress) => {
    RenderBar(progress);
  });

  let spinnerInterval = DrawSpinner();

  window.electronAPI.onDownloadComplete(() => {
    clearInterval(spinnerInterval);
    terminal.classList.remove("glitch");
    AnimateBox();
  });

  PlayHydra();
});

const PlayHydra = async () => {
  terminal.classList.add("glitch");
  rebootSuccessText.classList.add("hidden");
  document.querySelectorAll(".spinner, .glitch--clone, .hydra_rebooting").forEach(el => el.classList.remove("hidden"));
  const spinnerInterval = DrawSpinner();

  window.electronAPI.onDownloadProgress((event, progress) => {
    RenderBar(progress);
  });
};
